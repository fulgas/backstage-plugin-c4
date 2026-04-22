import { NODE_H, NODE_W } from '../c4Style';
import { recomputeEdgeSections } from './elkLayout';
import type { LayoutResult } from './types';

function makeLayout(
  nodes: {
    id: string;
    position: { x: number; y: number };
    parentId?: string;
  }[],
  edges: { source: string; target: string }[],
): LayoutResult {
  return {
    nodes: nodes.map(n => ({ ...n, data: {}, type: 'internal' } as any)),
    edges: edges.map(e => ({
      id: `${e.source}→${e.target}`,
      source: e.source,
      target: e.target,
      data: { sections: [] },
    })) as any,
  };
}

describe('recomputeEdgeSections', () => {
  it('sets sections from absolute node positions (right face to left face)', () => {
    const layout = makeLayout(
      [
        { id: 'a', position: { x: 0, y: 0 } },
        { id: 'b', position: { x: 300, y: 0 } },
      ],
      [{ source: 'a', target: 'b' }],
    );

    const result = recomputeEdgeSections(layout);
    const edge = result.edges[0];
    const sections = (edge.data as any).sections as {
      startPoint: { x: number; y: number };
      endPoint: { x: number; y: number };
    }[];

    expect(sections).toHaveLength(1);
    // a left of b, same y → center handles win (PreferCenterRule bonus).
    // s-right-c(NODE_W, NODE_H*0.5) → t-left-c(300, NODE_H*0.5)
    expect(sections[0].startPoint.x).toBe(NODE_W);
    expect(sections[0].startPoint.y).toBe(NODE_H * 0.5);
    expect(sections[0].endPoint.x).toBe(300);
    expect(sections[0].endPoint.y).toBe(NODE_H * 0.5);
    expect(edge.sourceHandle).toBe('s-right-c');
    expect(edge.targetHandle).toBe('t-left-c');
  });

  it('assigns non-center handles when center is already in use (second edge on same face)', () => {
    // Two edges both leaving node a's right face toward b and c.
    // First edge gets the center handle; second must use a side slot.
    const layout = makeLayout(
      [
        { id: 'a', position: { x: 0, y: 0 } },
        { id: 'b', position: { x: 300, y: 0 } },
        { id: 'c', position: { x: 300, y: 200 } },
      ],
      [
        { source: 'a', target: 'b' },
        { source: 'a', target: 'c' },
      ],
    );

    const result = recomputeEdgeSections(layout);
    const [e1, e2] = result.edges;
    // First edge gets center (s-right-c), second must avoid it.
    expect(e1.sourceHandle).toBe('s-right-c');
    expect(e2.sourceHandle).not.toBe('s-right-c');
    expect(e2.sourceHandle).toMatch(/^s-right-/);
  });

  it('resolves child positions relative to parent', () => {
    // Parent at (100,100), child at (10,10) local → absolute (110,110)
    const layout = makeLayout(
      [
        { id: 'parent', position: { x: 100, y: 100 } },
        { id: 'child', position: { x: 10, y: 10 }, parentId: 'parent' },
        { id: 'external', position: { x: 500, y: 110 } },
      ],
      [{ source: 'child', target: 'external' }],
    );

    const result = recomputeEdgeSections(layout);
    const sections = (result.edges[0].data as any).sections as any[];
    expect(sections).toHaveLength(1);
    // child absolute x=110, external x=500 → right face to left face, center handles
    expect(sections[0].startPoint.x).toBe(110 + NODE_W);
    expect(result.edges[0].sourceHandle).toBe('s-right-c');
    expect(result.edges[0].targetHandle).toBe('t-left-c');
  });

  it('skips edges with unknown node ids', () => {
    const layout = makeLayout(
      [{ id: 'a', position: { x: 0, y: 0 } }],
      [{ source: 'a', target: 'missing' }],
    );

    const result = recomputeEdgeSections(layout);
    expect((result.edges[0].data as any).sections).toEqual([]);
  });

  it('preserves non-section edge data', () => {
    const layout: LayoutResult = {
      nodes: [
        {
          id: 'a',
          position: { x: 0, y: 0 },
          data: {},
          type: 'internal',
        } as any,
        {
          id: 'b',
          position: { x: 300, y: 0 },
          data: {},
          type: 'internal',
        } as any,
      ],
      edges: [
        {
          id: 'a→b',
          source: 'a',
          target: 'b',
          label: 'calls',
          data: { sections: [], labelFraction: 0.65 },
        } as any,
      ],
    };

    const result = recomputeEdgeSections(layout);
    expect((result.edges[0].data as any).labelFraction).toBe(0.65);
    expect(result.edges[0].label).toBe('calls');
  });
});
