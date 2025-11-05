# C4 Renderer Mermaid — Plan 1: MermaidRenderer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement MermaidRenderer in `@fulgas/plugin-c4-renderer-mermaid` — converts C4ViewModel to Mermaid C4 syntax and renders SVG.

**Architecture:** Implements `C4Renderer` interface from `@fulgas/plugin-c4-common`. Converts model to Mermaid C4 syntax string, renders via `mermaid` npm package client-side.

**Tech Stack:** TypeScript, React, mermaid ^10.0.0, @fulgas/plugin-c4-common.

**Prerequisite:** C4 Common Plans 1+2 complete.

---

### Task 1: MermaidRenderer

**Files:**
- Create: `plugins/c4-renderer-mermaid/src/MermaidRenderer.tsx`
- Create: `plugins/c4-renderer-mermaid/src/MermaidRenderer.test.tsx`
- Modify: `plugins/c4-renderer-mermaid/src/index.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// plugins/c4-renderer-mermaid/src/MermaidRenderer.test.tsx
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { MermaidRenderer } from './MermaidRenderer';
import { C4ViewModel } from '@fulgas/plugin-c4-common';

jest.mock('mermaid', () => ({
  initialize: jest.fn(),
  render: jest.fn().mockResolvedValue({ svg: '<svg><text>ok</text></svg>' }),
}));

const vm: C4ViewModel = {
  view: { id: 'v1', type: 'landscape', title: 'Landscape', entityRefs: ['s1'], relationshipIds: [], source: 'catalog' },
  model: {
    persons: [],
    systems: [{ id: 's1', name: 'My System', description: 'Desc', tags: [] }],
    containers: [],
    components: [],
    relationships: [],
    views: [],
  },
};

const containerVm: C4ViewModel = {
  view: { id: 'v2', type: 'container', title: 'Containers', entityRefs: ['c1'], relationshipIds: ['r1'], source: 'catalog' },
  model: {
    persons: [],
    systems: [{ id: 's1', name: 'My System', description: '', tags: [] }],
    containers: [{ id: 'c1', systemId: 's1', name: 'Web App', description: 'Frontend', technology: 'TypeScript', tags: [] }],
    components: [],
    relationships: [{ id: 'r1', sourceId: 'c1', targetId: 'c2', description: 'Calls', technology: 'HTTP', tags: [] }],
    views: [],
  },
};

describe('MermaidRenderer', () => {
  it('renders without crashing', () => {
    const r = new MermaidRenderer();
    const { container } = render(r.render(vm));
    expect(container).toBeTruthy();
  });

  it('renders diagram container', async () => {
    const r = new MermaidRenderer();
    render(r.render(vm));
    await waitFor(() => expect(document.querySelector('[data-testid="c4-diagram"]')).toBeTruthy());
  });

  it('landscape view uses C4Context syntax', () => {
    const r = new MermaidRenderer();
    expect(r.toMermaidSyntax(vm)).toContain('C4Context');
    expect(r.toMermaidSyntax(vm)).toContain('My System');
  });

  it('container view uses C4Container syntax', () => {
    const r = new MermaidRenderer();
    expect(r.toMermaidSyntax(containerVm)).toContain('C4Container');
    expect(r.toMermaidSyntax(containerVm)).toContain('Web App');
    expect(r.toMermaidSyntax(containerVm)).toContain('TypeScript');
  });

  it('includes Rel() for relationships', () => {
    const r = new MermaidRenderer();
    expect(r.toMermaidSyntax(containerVm)).toContain('Rel(');
    expect(r.toMermaidSyntax(containerVm)).toContain('Calls');
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `yarn workspace @fulgas/plugin-c4-renderer-mermaid test --testPathPattern=MermaidRenderer --no-coverage`

Expected: FAIL — `Cannot find module './MermaidRenderer'`

- [ ] **Step 3: Implement MermaidRenderer.tsx**

```typescript
// plugins/c4-renderer-mermaid/src/MermaidRenderer.tsx
import React, { useEffect, useRef } from 'react';
import mermaid from 'mermaid';
import { C4Renderer, C4ViewModel } from '@fulgas/plugin-c4-common';

mermaid.initialize({ startOnLoad: false, theme: 'dark' });

export class MermaidRenderer implements C4Renderer {
  render(viewModel: C4ViewModel): React.ReactElement {
    return <MermaidDiagram viewModel={viewModel} toSyntax={this.toMermaidSyntax.bind(this)} />;
  }

  toMermaidSyntax(viewModel: C4ViewModel): string {
    const { view, model } = viewModel;
    const lines: string[] = [];

    if (view.type === 'container') lines.push('C4Container');
    else if (view.type === 'component') lines.push('C4Component');
    else lines.push('C4Context');

    lines.push(`  title ${view.title}`);

    for (const p of model.persons) {
      lines.push(`  Person(${sid(p.id)}, "${p.name}", "${p.description}")`);
    }

    for (const s of model.systems) {
      if (view.type === 'container') {
        lines.push(`  System_Boundary(${sid(s.id)}, "${s.name}") {`);
        for (const c of model.containers.filter(x => x.systemId === s.id)) {
          lines.push(`    Container(${sid(c.id)}, "${c.name}", "${c.technology}", "${c.description}")`);
        }
        lines.push('  }');
      } else {
        lines.push(`  System(${sid(s.id)}, "${s.name}", "${s.description}")`);
      }
    }

    for (const r of model.relationships) {
      lines.push(`  Rel(${sid(r.sourceId)}, ${sid(r.targetId)}, "${r.description}")`);
    }

    return lines.join('\n');
  }
}

function sid(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, '_');
}

function MermaidDiagram({ viewModel, toSyntax }: { viewModel: C4ViewModel; toSyntax: (vm: C4ViewModel) => string }) {
  const ref = useRef<HTMLDivElement>(null);
  const syntax = toSyntax(viewModel);

  useEffect(() => {
    if (!ref.current) return;
    const id = `mermaid-${Date.now()}`;
    mermaid.render(id, syntax).then(({ svg }) => {
      if (ref.current) ref.current.innerHTML = svg;
    }).catch(() => {
      if (ref.current) ref.current.innerHTML = '<p>Failed to render diagram</p>';
    });
  }, [syntax]);

  return <div ref={ref} data-testid="c4-diagram" style={{ width: '100%', overflow: 'auto' }} />;
}
```

- [ ] **Step 4: Update index.ts**

```typescript
// plugins/c4-renderer-mermaid/src/index.ts
export { MermaidRenderer } from './MermaidRenderer';
```

- [ ] **Step 5: Run to verify pass**

Run: `yarn workspace @fulgas/plugin-c4-renderer-mermaid test --testPathPattern=MermaidRenderer --no-coverage`

Expected: all 5 tests PASS.
