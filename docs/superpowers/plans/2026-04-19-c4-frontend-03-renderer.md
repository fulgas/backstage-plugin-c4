# C4 Frontend — Plan 3: Renderer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Define C4Renderer interface and implement MermaidRenderer that converts C4Model to Mermaid C4 diagram syntax and renders it.

**Architecture:** `RendererInterface.ts` defines the interface. `MermaidRenderer.tsx` converts C4ViewModel to Mermaid C4 syntax string, then uses `mermaid` npm package to render SVG in a div. Swappable — any future renderer implementing the interface can be dropped in.

**Tech Stack:** TypeScript, React, mermaid npm package.

**Prerequisite:** Frontend Plan 1 complete (types.ts).

---

### Task 1: Add mermaid dep and implement renderer

**Files:**
- Modify: `plugins/c4/package.json`
- Create: `plugins/c4/src/renderer/RendererInterface.ts`
- Create: `plugins/c4/src/renderer/MermaidRenderer.tsx`
- Create: `plugins/c4/src/renderer/MermaidRenderer.test.tsx`

- [ ] **Step 1: Add mermaid dependency**

In `plugins/c4/package.json` add to `dependencies`:
```json
"mermaid": "^10.0.0"
```

Run: `yarn install`

Expected: no errors.

- [ ] **Step 2: Create RendererInterface.ts**

```typescript
// plugins/c4/src/renderer/RendererInterface.ts
import React from 'react';
import { C4ViewModel } from '../types';

export interface C4Renderer {
  render(viewModel: C4ViewModel): React.ReactElement;
}
```

- [ ] **Step 3: Write failing tests**

```typescript
// plugins/c4/src/renderer/MermaidRenderer.test.tsx
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MermaidRenderer } from './MermaidRenderer';
import { C4ViewModel } from '../types';

jest.mock('mermaid', () => ({
  initialize: jest.fn(),
  render: jest.fn().mockResolvedValue({ svg: '<svg><text>diagram</text></svg>' }),
}));

const landscapeViewModel: C4ViewModel = {
  view: {
    id: 'v1', type: 'landscape', title: 'Landscape', entityRefs: ['s1'], relationshipIds: [], source: 'catalog',
  },
  model: {
    persons: [],
    systems: [{ id: 's1', name: 'My System', description: 'A system', tags: [] }],
    containers: [],
    components: [],
    relationships: [],
    views: [],
  },
};

const containerViewModel: C4ViewModel = {
  view: {
    id: 'v2', type: 'container', title: 'Containers', entityRefs: ['c1'], relationshipIds: ['r1'], source: 'catalog',
  },
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
  it('renders without crashing', async () => {
    const renderer = new MermaidRenderer();
    const { container } = render(renderer.render(landscapeViewModel));
    expect(container).toBeTruthy();
  });

  it('renders diagram container div', async () => {
    const renderer = new MermaidRenderer();
    render(renderer.render(landscapeViewModel));
    await waitFor(() => {
      expect(document.querySelector('[data-testid="c4-diagram"]')).toBeTruthy();
    });
  });

  it('converts landscape view to C4Context syntax', () => {
    const renderer = new MermaidRenderer();
    const syntax = renderer.toMermaidSyntax(landscapeViewModel);
    expect(syntax).toContain('C4Context');
    expect(syntax).toContain('My System');
  });

  it('converts container view to C4Container syntax', () => {
    const renderer = new MermaidRenderer();
    const syntax = renderer.toMermaidSyntax(containerViewModel);
    expect(syntax).toContain('C4Container');
    expect(syntax).toContain('Web App');
    expect(syntax).toContain('TypeScript');
  });

  it('includes relationships in syntax', () => {
    const renderer = new MermaidRenderer();
    const syntax = renderer.toMermaidSyntax(containerViewModel);
    expect(syntax).toContain('Rel(');
    expect(syntax).toContain('Calls');
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `yarn workspace @fulgas/plugin-c4 test --testPathPattern=MermaidRenderer --no-coverage`

Expected: FAIL — `Cannot find module './MermaidRenderer'`

- [ ] **Step 5: Implement MermaidRenderer**

```typescript
// plugins/c4/src/renderer/MermaidRenderer.tsx
import React, { useEffect, useRef } from 'react';
import mermaid from 'mermaid';
import { C4ViewModel, C4View, C4Model } from '../types';
import { C4Renderer } from './RendererInterface';

mermaid.initialize({ startOnLoad: false, theme: 'dark' });

export class MermaidRenderer implements C4Renderer {
  render(viewModel: C4ViewModel): React.ReactElement {
    return <MermaidDiagram viewModel={viewModel} renderer={this} />;
  }

  toMermaidSyntax(viewModel: C4ViewModel): string {
    const { view, model } = viewModel;
    const lines: string[] = [];

    if (view.type === 'landscape' || view.type === 'context') {
      lines.push('C4Context');
    } else if (view.type === 'container') {
      lines.push('C4Container');
    } else {
      lines.push('C4Component');
    }

    lines.push(`  title ${view.title}`);

    for (const person of model.persons) {
      const sanitized = sanitizeId(person.id);
      lines.push(`  Person(${sanitized}, "${person.name}", "${person.description}")`);
    }

    for (const system of model.systems) {
      const sanitized = sanitizeId(system.id);
      if (view.type === 'container') {
        lines.push(`  System_Boundary(${sanitized}, "${system.name}") {`);
        const containers = model.containers.filter(c => c.systemId === system.id);
        for (const container of containers) {
          const cSanitized = sanitizeId(container.id);
          lines.push(`    Container(${cSanitized}, "${container.name}", "${container.technology}", "${container.description}")`);
        }
        lines.push('  }');
      } else {
        lines.push(`  System(${sanitized}, "${system.name}", "${system.description}")`);
      }
    }

    for (const rel of model.relationships) {
      const src = sanitizeId(rel.sourceId);
      const dst = sanitizeId(rel.targetId);
      lines.push(`  Rel(${src}, ${dst}, "${rel.description}")`);
    }

    return lines.join('\n');
  }
}

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, '_');
}

interface MermaidDiagramProps {
  viewModel: C4ViewModel;
  renderer: MermaidRenderer;
}

function MermaidDiagram({ viewModel, renderer }: MermaidDiagramProps) {
  const ref = useRef<HTMLDivElement>(null);
  const syntax = renderer.toMermaidSyntax(viewModel);

  useEffect(() => {
    if (!ref.current) return;
    const id = `mermaid-${Date.now()}`;
    mermaid.render(id, syntax).then(({ svg }) => {
      if (ref.current) {
        ref.current.innerHTML = svg;
      }
    }).catch(() => {
      if (ref.current) {
        ref.current.innerHTML = '<p>Failed to render diagram</p>';
      }
    });
  }, [syntax]);

  return <div ref={ref} data-testid="c4-diagram" style={{ width: '100%', overflow: 'auto' }} />;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `yarn workspace @fulgas/plugin-c4 test --testPathPattern=MermaidRenderer --no-coverage`

Expected: all 5 tests PASS.
