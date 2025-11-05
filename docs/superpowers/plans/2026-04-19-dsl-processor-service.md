# C4 DSL Processor — Part 2: Parser + Service + Wire

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement StructurizrParser (ANTLR-based), C4StructurizrService ref + factory, and wire into c4-backend as optional dep.

**Architecture:** Service ref (createServiceRef, scope: plugin) with service factory. c4-backend declares optional dep — DSL sync runs only when service is registered.

**Tech Stack:** antlr4ng v3.0.16, @backstage/backend-plugin-api createServiceRef/createServiceFactory.

**Prerequisite:** c4-structurizr scaffold complete (2026-04-19-dsl-processor-scaffold.md) — package exists and ANTLR files generated.

---

## Task 1: Implement StructurizrParser + tests (TDD)

- [ ] **Step 1:** Create test file `plugins/c4-structurizr/src/parser/StructurizrParser.test.ts` with the following content:

  ```typescript
  import { StructurizrParser } from './StructurizrParser';

  const DSL = `
  workspace {
    model {
      user = person "User" "A user"
      ss = softwareSystem "Banking System" "Manages accounts" {
        api = container "API" "Core API" "TypeScript"
        web = container "Web App" "Frontend" "React"
      }
      user -> ss "Uses"
    }
    views {
      systemContext ss "SystemContext" {}
      container ss "Containers" {}
    }
  }
  `;

  describe('StructurizrParser', () => {
    let parser: StructurizrParser;
    beforeEach(() => { parser = new StructurizrParser(); });

    it('parses persons', () => {
      const r = parser.parse(DSL);
      expect(r.persons).toHaveLength(1);
      expect(r.persons[0].name).toBe('User');
      expect(r.persons[0].varName).toBe('user');
    });

    it('parses systems', () => {
      const r = parser.parse(DSL);
      expect(r.systems).toHaveLength(1);
      expect(r.systems[0].name).toBe('Banking System');
    });

    it('parses containers', () => {
      const r = parser.parse(DSL);
      expect(r.systems[0].containers).toHaveLength(2);
      expect(r.systems[0].containers[0].technology).toBe('TypeScript');
    });

    it('parses relationships', () => {
      const r = parser.parse(DSL);
      expect(r.relationships).toHaveLength(1);
      expect(r.relationships[0].sourceVar).toBe('user');
    });

    it('parses context views', () => {
      const r = parser.parse(DSL);
      expect(r.contextViews[0].key).toBe('SystemContext');
    });

    it('parses container views', () => {
      const r = parser.parse(DSL);
      expect(r.containerViews[0].key).toBe('Containers');
    });

    it('handles bad DSL without throwing', () => {
      expect(() => parser.parse('not valid {')).not.toThrow();
    });
  });
  ```

- [ ] **Step 2:** Run `yarn workspace @fulgas/plugin-c4-structurizr test --no-coverage` — expect FAIL (module not found).

- [ ] **Step 3:** Create `plugins/c4-structurizr/src/parser/StructurizrParser.ts` with the following content:

  ```typescript
  import { CharStream, CommonTokenStream, ParserRuleContext } from 'antlr4ng';
  import { StructurizrDSLLexer } from '../grammar/generated/StructurizrDSLLexer';
  import { StructurizrDSLParser } from '../grammar/generated/StructurizrDSLParser';

  export interface ParsedPerson { varName: string; name: string; description: string; }
  export interface ParsedContainer { varName: string; name: string; description: string; technology: string; }
  export interface ParsedSystem { varName: string; name: string; description: string; containers: ParsedContainer[]; }
  export interface ParsedRelationship { sourceVar: string; targetVar: string; description: string; }
  export interface ParsedView { type: 'context' | 'container'; subjectVar: string; key: string; title: string; }
  export interface ParsedWorkspace {
    persons: ParsedPerson[];
    systems: ParsedSystem[];
    relationships: ParsedRelationship[];
    contextViews: ParsedView[];
    containerViews: ParsedView[];
  }

  export class StructurizrParser {
    parse(dsl: string): ParsedWorkspace {
      const result: ParsedWorkspace = { persons: [], systems: [], relationships: [], contextViews: [], containerViews: [] };
      try {
        const inputStream = CharStream.fromString(dsl);
        const lexer = new StructurizrDSLLexer(inputStream);
        const tokenStream = new CommonTokenStream(lexer);
        const parser = new StructurizrDSLParser(tokenStream);
        parser.removeErrorListeners();
        const tree = parser.workspace();
        this.walkBlock(findBlock(tree), result, 'root');
      } catch { /* return empty on error */ }
      return result;
    }

    private walkBlock(ctx: ParserRuleContext | null, result: ParsedWorkspace, scope: string): void {
      if (!ctx) return;
      for (let i = 0; i < ctx.childCount; i++) {
        const child = ctx.getChild(i) as ParserRuleContext;
        if (!child || !('ruleIndex' in child)) continue;
        const ruleName = StructurizrDSLParser.ruleNames?.[child.ruleIndex] ?? '';
        if (ruleName === 'modelBlock') this.walkBlock(findBlock(child), result, 'model');
        else if (ruleName === 'viewsBlock') this.walkBlock(findBlock(child), result, 'views');
        else if (ruleName === 'statement') this.walkBlock(child, result, scope);
        else if (ruleName === 'assignment' && scope === 'model') this.extractAssignment(child, result);
        else if (ruleName === 'relationship' && scope === 'model') this.extractRelationship(child, result);
        else if (ruleName === 'viewDecl' && scope === 'views') this.extractViewDecl(child, result);
      }
    }

    private extractAssignment(ctx: ParserRuleContext, result: ParsedWorkspace): void {
      const varName = ctx.getChild(0)?.getText() ?? '';
      const elementDecl = ctx.getChild(2) as ParserRuleContext | null;
      if (!elementDecl) return;
      const inner = elementDecl.getChild(0) as ParserRuleContext | null;
      if (!inner || !('ruleIndex' in inner)) return;
      const ruleName = StructurizrDSLParser.ruleNames?.[inner.ruleIndex] ?? '';
      if (ruleName === 'personDecl') {
        result.persons.push({ varName, name: unquote(inner.getChild(1)?.getText() ?? ''), description: unquote(inner.getChild(2)?.getText() ?? '') });
      } else if (ruleName === 'softwareSystemDecl') {
        const name = unquote(inner.getChild(1)?.getText() ?? '');
        const description = unquote(inner.getChild(2)?.getText() ?? '');
        const containers: ParsedContainer[] = [];
        this.extractContainers(inner, containers);
        result.systems.push({ varName, name, description, containers });
      }
    }

    private extractContainers(ctx: ParserRuleContext, containers: ParsedContainer[]): void {
      for (let i = 0; i < ctx.childCount; i++) {
        const child = ctx.getChild(i) as ParserRuleContext;
        if (!child || !('ruleIndex' in child)) continue;
        const ruleName = StructurizrDSLParser.ruleNames?.[child.ruleIndex] ?? '';
        if (ruleName === 'containerDecl') {
          const varName = child.getChild(0)?.getText() ?? '';
          const name = unquote(child.getChild(3)?.getText() ?? '');
          const description = unquote(child.getChild(4)?.getText() ?? '');
          const technology = unquote(child.getChild(5)?.getText() ?? '');
          if (name) containers.push({ varName, name, description, technology });
        } else {
          this.extractContainers(child, containers);
        }
      }
    }

    private extractRelationship(ctx: ParserRuleContext, result: ParsedWorkspace): void {
      result.relationships.push({
        sourceVar: ctx.getChild(0)?.getText() ?? '',
        targetVar: ctx.getChild(2)?.getText() ?? '',
        description: unquote(ctx.getChild(3)?.getText() ?? ''),
      });
    }

    private extractViewDecl(ctx: ParserRuleContext, result: ParsedWorkspace): void {
      for (let i = 0; i < ctx.childCount; i++) {
        const child = ctx.getChild(i) as ParserRuleContext;
        if (!child || !('ruleIndex' in child)) continue;
        const ruleName = StructurizrDSLParser.ruleNames?.[child.ruleIndex] ?? '';
        if (ruleName === 'systemContextView') {
          const subjectVar = child.getChild(1)?.getText() ?? '';
          const key = unquote(child.getChild(2)?.getText() ?? '');
          result.contextViews.push({ type: 'context', subjectVar, key, title: key });
        } else if (ruleName === 'containerView') {
          const subjectVar = child.getChild(1)?.getText() ?? '';
          const key = unquote(child.getChild(2)?.getText() ?? '');
          result.containerViews.push({ type: 'container', subjectVar, key, title: key });
        }
      }
    }
  }

  function findBlock(ctx: ParserRuleContext): ParserRuleContext | null {
    for (let i = 0; i < ctx.childCount; i++) {
      const child = ctx.getChild(i) as ParserRuleContext;
      if (child && 'ruleIndex' in child && StructurizrDSLParser.ruleNames?.[child.ruleIndex] === 'block') return child;
    }
    return null;
  }

  function unquote(s: string): string {
    return s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s;
  }
  ```

- [ ] **Step 4:** Run `yarn workspace @fulgas/plugin-c4-structurizr test --no-coverage` — expect all 7 tests PASS.

---

## Task 2: Service ref + factory + exports

- [ ] **Step 1:** Create `plugins/c4-structurizr/src/service/C4StructurizrService.ts` with the following content:

  ```typescript
  import { createServiceRef } from '@backstage/backend-plugin-api';
  import { C4Model } from '@fulgas/plugin-c4-common';

  export interface C4StructurizrService {
    process(): Promise<C4Model>;
  }

  export const c4StructurizrServiceRef = createServiceRef<C4StructurizrService>({
    id: 'plugin.c4.structurizr',
    scope: 'plugin',
    defaultFactory: undefined,
  });
  ```

- [ ] **Step 2:** Create `plugins/c4-structurizr/src/service/C4StructurizrServiceFactory.ts` with the following content:

  ```typescript
  import { createServiceFactory, coreServices } from '@backstage/backend-plugin-api';
  import { CatalogClient } from '@backstage/catalog-client';
  import { Entity, stringifyEntityRef } from '@backstage/catalog-model';
  import { v4 as uuidv4 } from 'uuid';
  import { C4Model, C4Person, C4System, C4Container, C4Relationship, C4View } from '@fulgas/plugin-c4-common';
  import { c4StructurizrServiceRef, C4StructurizrService } from './C4StructurizrService';
  import { StructurizrParser } from '../parser/StructurizrParser';

  const C4_MODEL_ANNOTATION = 'fulgas.io/c4-model';
  const SOURCE_LOCATION_ANNOTATION = 'backstage.io/source-location';
  const CONVENTION_PATH = 'c4-model.dsl';

  export const c4StructurizrServiceFactory = createServiceFactory({
    service: c4StructurizrServiceRef,
    deps: {
      discovery: coreServices.discovery,
      urlReader: coreServices.urlReader,
    },
    async factory({ discovery, urlReader }): Promise<C4StructurizrService> {
      const catalogClient = new CatalogClient({ discoveryApi: discovery });
      const parser = new StructurizrParser();
      return {
        async process(): Promise<C4Model> {
          const { items: entities } = await catalogClient.getEntities({});
          const merged: C4Model = { persons: [], systems: [], containers: [], components: [], relationships: [], views: [] };
          for (const entity of entities) {
            const url = getDslUrl(entity);
            if (!url) continue;
            try {
              const response = await urlReader.readUrl(url);
              const buffer = await response.buffer();
              const dslContent = buffer.toString('utf-8');
              const entityRef = stringifyEntityRef(entity);
              const model = buildModel(parser, dslContent, entityRef);
              merged.persons.push(...model.persons);
              merged.systems.push(...model.systems);
              merged.containers.push(...model.containers);
              merged.relationships.push(...model.relationships);
              merged.views.push(...model.views);
            } catch { /* skip missing/unparseable DSL */ }
          }
          return merged;
        },
      };
    },
  });

  function getDslUrl(entity: Entity): string | undefined {
    const annotations = entity.metadata.annotations ?? {};
    const annotation = annotations[C4_MODEL_ANNOTATION];
    if (annotation) return annotation;
    const sourceLocation = annotations[SOURCE_LOCATION_ANNOTATION];
    if (sourceLocation) {
      const base = sourceLocation.replace(/^url:/, '').replace(/\/$/, '');
      return `${base}/${CONVENTION_PATH}`;
    }
    return undefined;
  }

  function buildModel(parser: StructurizrParser, dslContent: string, entityRef: string): C4Model {
    const workspace = parser.parse(dslContent);
    const persons: C4Person[] = [];
    const systems: C4System[] = [];
    const containers: C4Container[] = [];
    const relationships: C4Relationship[] = [];
    const views: C4View[] = [];
    const varToId = new Map<string, string>();

    for (const p of workspace.persons) {
      const id = uuidv4();
      varToId.set(p.varName, id);
      persons.push({ id, name: p.name, description: p.description, tags: [] });
    }
    for (const s of workspace.systems) {
      const sysId = uuidv4();
      varToId.set(s.varName, sysId);
      systems.push({ id: sysId, name: s.name, description: s.description, tags: [] });
      for (const c of s.containers) {
        const cId = uuidv4();
        varToId.set(c.varName, cId);
        containers.push({ id: cId, systemId: sysId, name: c.name, description: c.description, technology: c.technology, tags: [] });
      }
    }
    for (const rel of workspace.relationships) {
      const sourceId = varToId.get(rel.sourceVar) ?? rel.sourceVar;
      const targetId = varToId.get(rel.targetVar) ?? rel.targetVar;
      relationships.push({ id: uuidv4(), sourceId, targetId, description: rel.description, technology: '', tags: [] });
    }
    for (const view of workspace.contextViews) {
      views.push({ id: uuidv4(), type: 'context', title: view.title, entityRefs: [...persons.map(p => p.id), ...systems.map(s => s.id)], relationshipIds: relationships.map(r => r.id), source: 'dsl', entityRef });
    }
    for (const view of workspace.containerViews) {
      const sysId = varToId.get(view.subjectVar);
      const viewContainers = sysId ? containers.filter(c => c.systemId === sysId) : containers;
      views.push({ id: uuidv4(), type: 'container', title: view.title, entityRefs: viewContainers.map(c => c.id), relationshipIds: relationships.map(r => r.id), source: 'dsl', entityRef });
    }
    return { persons, systems, containers, components: [], relationships, views };
  }
  ```

- [ ] **Step 3:** Update `plugins/c4-structurizr/src/index.ts` to export the service ref, service type, service factory, and parser:

  ```typescript
  export { c4StructurizrServiceRef } from './service/C4StructurizrService';
  export type { C4StructurizrService } from './service/C4StructurizrService';
  export { c4StructurizrServiceFactory } from './service/C4StructurizrServiceFactory';
  export { StructurizrParser } from './parser/StructurizrParser';
  ```

- [ ] **Step 4:** Run `yarn workspace @fulgas/plugin-c4-structurizr tsc --noEmit` — expect no errors.

---

## Task 3: Wire into c4-backend

- [ ] **Step 1:** Add `"@fulgas/plugin-c4-structurizr": "^0.1.0"` to the `dependencies` section of `plugins/c4-backend/package.json`, then run `yarn install`.

- [ ] **Step 2:** Modify `plugins/c4-backend/src/index.ts`:
  - Remove the `DSLProcessor` import (`import { DSLProcessor } from './processors/DSLProcessor'`).
  - Add import: `import { c4StructurizrServiceRef } from '@fulgas/plugin-c4-structurizr'`.
  - In `deps`, add: `c4DslProcessor: c4StructurizrServiceRef.optional`.
  - Remove the `const dslProcessor = new DSLProcessor(catalogClient, urlReader)` instantiation.
  - In the sync function, wrap the DSL processing block:
    ```typescript
    if (c4DslProcessor) {
      try {
        const dslModel = await c4DslProcessor.process();
        // ... existing save/snapshot/status code
      } catch (err) { ... }
    }
    ```

- [ ] **Step 3:** Add `backend.add(import('@fulgas/plugin-c4-structurizr'))` to `packages/backend/src/index.ts`.

- [ ] **Step 4:** Run `yarn workspace @fulgas/plugin-c4-backend tsc --noEmit` — expect no errors.
