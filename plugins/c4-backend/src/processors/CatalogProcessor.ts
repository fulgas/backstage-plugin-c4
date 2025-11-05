import { AuthService } from '@backstage/backend-plugin-api';
import { CatalogClient } from '@backstage/catalog-client';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { v4 as uuidv4 } from 'uuid';
import { C4Actor, C4Model, C4Node, C4Relationship, C4ViewDescriptor } from '../types';

export class CatalogProcessor {
  constructor(
    private readonly catalogClient: CatalogClient,
    private readonly auth: AuthService,
  ) {}

  async process(): Promise<{ model: C4Model; descriptors: C4ViewDescriptor[] }> {
    const { token } = await this.auth.getPluginRequestToken({
      onBehalfOf: await this.auth.getOwnServiceCredentials(),
      targetPluginId: 'catalog',
    });
    const { items: entities } = await this.catalogClient.getEntities({}, { token });

    const nodes: C4Node[] = [];
    const actors: C4Actor[] = [];
    const relationships: C4Relationship[] = [];
    const descriptors: C4ViewDescriptor[] = [];

    const nodeMap = new Map<string, C4Node>();
    const systemToDomain = new Map<string, string>();
    const apiMap = new Map<string, { name: string; providers: Set<string>; consumers: Set<string> }>();

    // First pass: collect API entities
    for (const entity of entities) {
      if (entity.kind === 'API') {
        const ref = stringifyEntityRef(entity);
        apiMap.set(ref, { name: entity.metadata.name, providers: new Set(), consumers: new Set() });
      }
    }

    // Second pass: build nodes and actors
    for (const entity of entities) {
      const ref = stringifyEntityRef(entity);

      if (entity.kind === 'User' || entity.kind === 'Group') {
        actors.push({
          id: ref,
          name: entity.metadata.name,
          description: (entity.metadata.description as string) ?? '',
          tags: (entity.metadata.tags as string[]) ?? [],
          catalogEntityRef: ref,
        });
        continue;
      }

      if (entity.kind === 'Domain') {
        const node: C4Node = {
          id: ref,
          depth: 0,
          name: entity.metadata.name,
          description: (entity.metadata.description as string) ?? '',
          tags: (entity.metadata.tags as string[]) ?? [],
          catalogEntityRef: ref,
        };
        nodes.push(node);
        nodeMap.set(ref, node);
        descriptors.push({ id: `catalog-landscape-${sanitize(ref)}`, title: entity.metadata.name, subjectId: ref, entityRef: ref, source: 'catalog' });
        continue;
      }

      if (entity.kind === 'System') {
        const domainRef = (entity.relations ?? []).find(r => r.type === 'partOf' && r.targetRef.startsWith('domain:'))?.targetRef;
        if (domainRef) systemToDomain.set(ref, domainRef);
        const node: C4Node = {
          id: ref,
          parentId: domainRef,
          depth: 1,
          name: entity.metadata.name,
          description: (entity.metadata.description as string) ?? '',
          tags: (entity.metadata.tags as string[]) ?? [],
          catalogEntityRef: ref,
        };
        nodes.push(node);
        nodeMap.set(ref, node);
        descriptors.push({ id: `catalog-context-${sanitize(ref)}`, title: entity.metadata.name, subjectId: ref, entityRef: ref, source: 'catalog' });
        continue;
      }

      if (entity.kind === 'Component' || entity.kind === 'Resource') {
        const systemRef = (entity.relations ?? []).find(r => r.type === 'partOf' && r.targetRef.startsWith('system:'))?.targetRef;
        const subType = entity.kind === 'Resource' ? resourceSubType(entity.spec?.type as string) : 'service';
        const node: C4Node = {
          id: ref,
          parentId: systemRef,
          depth: 2,
          name: entity.metadata.name,
          description: (entity.metadata.description as string) ?? '',
          technology: (entity.spec?.type as string) ?? undefined,
          subType,
          tags: (entity.metadata.tags as string[]) ?? [],
          catalogEntityRef: ref,
        };
        nodes.push(node);
        nodeMap.set(ref, node);
        descriptors.push({ id: `catalog-container-${sanitize(ref)}`, title: entity.metadata.name, subjectId: ref, entityRef: ref, source: 'catalog' });

        for (const relation of entity.relations ?? []) {
          if (relation.type === 'dependsOn' && !relation.targetRef.startsWith('api:')) {
            relationships.push({ id: uuidv4(), sourceId: ref, targetId: relation.targetRef, description: 'depends on', tags: [] });
          }
          if (relation.type === 'providesApi') {
            const api = apiMap.get(relation.targetRef);
            if (api) api.providers.add(ref);
          }
          if (relation.type === 'consumesApi') {
            const api = apiMap.get(relation.targetRef);
            if (api) api.consumers.add(ref);
          }
        }
      }
    }

    // Resolve API edges (depth-2 → depth-2)
    for (const [, api] of apiMap) {
      for (const consumer of api.consumers) {
        for (const provider of api.providers) {
          if (consumer !== provider) {
            relationships.push({ id: uuidv4(), sourceId: consumer, targetId: provider, description: `uses ${api.name}`, technology: 'API', tags: [] });
          }
        }
      }
    }

    // Roll up depth-2 relationships to depth-1 (system→system)
    const sysRelSeen = new Set<string>();
    const sysRelationships: C4Relationship[] = [];
    for (const r of relationships) {
      const srcNode = nodeMap.get(r.sourceId);
      const tgtNode = nodeMap.get(r.targetId);
      if (srcNode?.depth === 2 && tgtNode?.depth === 2 && srcNode.parentId && tgtNode.parentId && srcNode.parentId !== tgtNode.parentId) {
        const key = `${srcNode.parentId}→${tgtNode.parentId}`;
        if (!sysRelSeen.has(key)) {
          sysRelSeen.add(key);
          sysRelationships.push({ id: uuidv4(), sourceId: srcNode.parentId, targetId: tgtNode.parentId, description: r.description, technology: r.technology, tags: [] });
        }
      }
    }

    // Roll up depth-1 relationships to depth-0 (domain→domain)
    const domRelSeen = new Set<string>();
    const domRelationships: C4Relationship[] = [];
    for (const r of sysRelationships) {
      const srcDomain = systemToDomain.get(r.sourceId);
      const tgtDomain = systemToDomain.get(r.targetId);
      if (srcDomain && tgtDomain && srcDomain !== tgtDomain) {
        const key = `${srcDomain}→${tgtDomain}`;
        if (!domRelSeen.has(key)) {
          domRelSeen.add(key);
          domRelationships.push({ id: uuidv4(), sourceId: srcDomain, targetId: tgtDomain, description: r.description, tags: [] });
        }
      }
    }

    return {
      model: { nodes, actors, relationships: [...relationships, ...sysRelationships, ...domRelationships] },
      descriptors,
    };
  }
}

function sanitize(ref: string): string {
  return ref.replace(/[^a-zA-Z0-9]/g, '_');
}

function resourceSubType(type: string | undefined): 'database' | 'queue' | 'resource' {
  if (!type) return 'resource';
  const t = type.toLowerCase();
  if (t.includes('database') || t.includes('db') || t.includes('postgres') || t.includes('mysql') || t.includes('mongo') || t.includes('sqlite')) return 'database';
  if (t.includes('queue') || t.includes('kafka') || t.includes('sqs') || t.includes('pubsub') || t.includes('rabbitmq')) return 'queue';
  return 'resource';
}
