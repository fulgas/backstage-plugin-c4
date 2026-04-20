import { createBackendModule, coreServices } from '@backstage/backend-plugin-api';
import { CatalogClient } from '@backstage/catalog-client';
import { Entity, stringifyEntityRef } from '@backstage/catalog-model';
import { readFile } from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { C4Actor, C4Model, C4Node, C4Relationship, C4ViewDescriptor } from '@fulgas/plugin-c4-node';
import { c4ModelProviderExtensionPoint } from '@fulgas/plugin-c4-backend';
import { StructurizrParser } from '../parser/StructurizrParser';

const C4_MODEL_ANNOTATION = 'c4/structurizr-path';
const SOURCE_LOCATION_ANNOTATION = 'backstage.io/source-location';
const CONVENTION_PATH = 'c4-model.dsl';

export const c4ModuleStructurizr = createBackendModule({
  pluginId: 'c4',
  moduleId: 'structurizr',
  register(env) {
    env.registerInit({
      deps: {
        extensionPoint: c4ModelProviderExtensionPoint,
        discovery: coreServices.discovery,
        urlReader: coreServices.urlReader,
        auth: coreServices.auth,
      },
      async init({ extensionPoint, discovery, urlReader, auth }) {
        const catalogClient = new CatalogClient({ discoveryApi: discovery });
        const parser = new StructurizrParser();

        extensionPoint.addProvider({
          id: 'structurizr',
          async process(): Promise<{ model: C4Model; descriptors: C4ViewDescriptor[] }> {
            const { token } = await auth.getPluginRequestToken({
              onBehalfOf: await auth.getOwnServiceCredentials(),
              targetPluginId: 'catalog',
            });
            const { items: entities } = await catalogClient.getEntities({}, { token });

            const merged: C4Model = { nodes: [], actors: [], relationships: [] };
            const descriptors: C4ViewDescriptor[] = [];

            for (const entity of entities) {
              const url = getDslUrl(entity);
              if (!url) continue;
              try {
                let dslContent: string;
                if (url.startsWith('file:')) {
                  const filePath = url.replace(/^file:\/\//, '').replace(/^file:/, '');
                  const resolved = path.isAbsolute(filePath)
                    ? filePath
                    : path.resolve(process.cwd(), filePath);
                  dslContent = await readFile(resolved, 'utf-8');
                } else {
                  const response = await urlReader.readUrl(url);
                  const buffer = await response.buffer();
                  dslContent = buffer.toString('utf-8');
                }
                const entityRef = stringifyEntityRef(entity);
                const result = buildModel(parser, dslContent, entityRef);
                merged.nodes.push(...result.model.nodes);
                merged.actors.push(...result.model.actors);
                merged.relationships.push(...result.model.relationships);
                descriptors.push(...result.descriptors);
              } catch {
                // skip missing/unparseable DSL
              }
            }

            return { model: merged, descriptors };
          },
        });
      },
    });
  },
});

function getDslUrl(entity: Entity): string | undefined {
  const annotations = entity.metadata.annotations ?? {};
  const annotation = annotations[C4_MODEL_ANNOTATION];
  if (annotation) return annotation;
  if (entity.kind !== 'System') return undefined;
  const sourceLocation = annotations[SOURCE_LOCATION_ANNOTATION];
  if (sourceLocation) {
    const base = sourceLocation.replace(/^url:/, '').replace(/\/$/, '');
    return `${base}/${CONVENTION_PATH}`;
  }
  return undefined;
}

function buildModel(
  parser: StructurizrParser,
  dslContent: string,
  entityRef: string,
): { model: C4Model; descriptors: C4ViewDescriptor[] } {
  const workspace = parser.parse(dslContent);
  const nodes: C4Node[] = [];
  const actors: C4Actor[] = [];
  const relationships: C4Relationship[] = [];
  const descriptors: C4ViewDescriptor[] = [];
  const varToId = new Map<string, string>();

  for (const p of workspace.persons) {
    const id = uuidv4();
    varToId.set(p.varName, id);
    actors.push({ id, name: p.name, description: p.description, tags: [] });
  }

  for (const s of workspace.systems) {
    const sysId = uuidv4();
    varToId.set(s.varName, sysId);
    nodes.push({ id: sysId, depth: 1, name: s.name, description: s.description, tags: [] });

    for (const c of s.containers) {
      const cId = uuidv4();
      varToId.set(c.varName, cId);
      nodes.push({ id: cId, parentId: sysId, depth: 2, name: c.name, description: c.description, technology: c.technology, tags: [] });
    }
  }

  for (const rel of workspace.relationships) {
    const sourceId = varToId.get(rel.sourceVar) ?? rel.sourceVar;
    const targetId = varToId.get(rel.targetVar) ?? rel.targetVar;
    relationships.push({ id: uuidv4(), sourceId, targetId, description: rel.description, tags: [] });
  }

  for (const view of workspace.landscapeViews) {
    const subjectId = uuidv4();
    nodes.push({ id: subjectId, depth: 0, name: view.title, description: '', tags: [] });
    descriptors.push({ id: uuidv4(), title: view.title, subjectId, entityRef, source: 'dsl' });
  }

  for (const view of workspace.contextViews) {
    const subjectId = varToId.get(view.subjectVar) ?? uuidv4();
    descriptors.push({ id: uuidv4(), title: view.title, subjectId, entityRef, source: 'dsl' });
  }

  for (const view of workspace.containerViews) {
    const subjectId = varToId.get(view.subjectVar) ?? uuidv4();
    descriptors.push({ id: uuidv4(), title: view.title, subjectId, entityRef, source: 'dsl' });
  }

  return { model: { nodes, actors, relationships }, descriptors };
}

