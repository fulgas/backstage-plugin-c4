import type { C4Node, C4Relationship } from '@fulgas/plugin-c4-node';
import type { Rect } from '../geometry';
import { placeExternals } from './placeExternals';
import type { Boundary, ClassifiedState } from './types';

function makeClassified(
  externalIds: string[],
  internalIds: string[],
  edges: Array<{ s: string; t: string }> = [],
): ClassifiedState {
  const edgeMap = new Map<string, C4Relationship[]>();
  for (const { s, t } of edges) {
    const key = `${s}→${t}`;
    edgeMap.set(key, [
      { id: key, sourceId: s, targetId: t, description: '', tags: [] },
    ]);
  }
  return {
    subject: undefined,
    boundaryId: '__boundary__',
    internalNodes: internalIds.map(
      id => ({ id, depth: 1, name: id, description: '', tags: [] } as C4Node),
    ),
    externalNodes: externalIds.map(
      id => ({ id, depth: 1, name: id, description: '', tags: [] } as C4Node),
    ),
    subdomainNodes: [],
    subdomainIds: new Set(),
    directInternalNodes: [],
    subdomainSystemNodes: [],
    internalIdSet: new Set(internalIds),
    ownedResourceIds: new Set(),
    subjectHasSubcomponents: false,
    edgeMap,
  };
}

const BOUNDARY: Boundary = { x: 0, y: 0, w: 400, h: 300 };
// boundary center: (200, 150)

function rect(x: number, y: number): Rect {
  return { x, y, w: 180, h: 100 };
}

describe('placeExternals', () => {
  it('places unconnected external on the right side', () => {
    const absRects = new Map<string, Rect>([['int', rect(160, 100)]]);
    const classified = makeClassified(['ext'], ['int']);
    placeExternals(absRects, BOUNDARY, classified, []);
    const pos = absRects.get('ext')!;
    // right side: x = bx + bw + EXT_GAP = 0 + 400 + 60 = 460
    expect(pos.x).toBe(460);
  });

  it('places external on the side nearest its connected internal', () => {
    // Internal node on the left half of the boundary
    const absRects = new Map<string, Rect>([['int', rect(20, 100)]]);
    // int centroid: x=20+90=110, y=100+50=150 → dx=110-200=-90, dy=0 → left side
    const classified = makeClassified(
      ['ext'],
      ['int'],
      [{ s: 'int', t: 'ext' }],
    );
    placeExternals(absRects, BOUNDARY, classified, []);
    const pos = absRects.get('ext')!;
    // left side: x = bx - EXT_GAP - NODE_W = 0 - 60 - 180 = -240
    expect(pos.x).toBe(-240);
  });

  it('spreads multiple externals on same side with minimum spacing', () => {
    // Two internals both on the right → both externals assigned right
    const absRects = new Map<string, Rect>([
      ['int1', rect(300, 50)],
      ['int2', rect(300, 200)],
    ]);
    const classified = makeClassified(
      ['ext1', 'ext2'],
      ['int1', 'int2'],
      [
        { s: 'int1', t: 'ext1' },
        { s: 'int2', t: 'ext2' },
      ],
    );
    placeExternals(absRects, BOUNDARY, classified, []);
    const p1 = absRects.get('ext1')!;
    const p2 = absRects.get('ext2')!;
    // Both on right side, minimum spacing = NODE_H + 20 = 120
    expect(p1.x).toBe(460);
    expect(p2.x).toBe(460);
    expect(Math.abs(p2.y - p1.y)).toBeGreaterThanOrEqual(120);
  });

  it('load-balances diagonal externals across two candidate sides', () => {
    // Three externals all in the SE quadrant (45° diagonal → right or bottom)
    // First goes to right (less loaded), second to bottom (right now has 1),
    // third to right or bottom depending on load.
    const absRects = new Map<string, Rect>([
      ['int1', rect(300, 200)], // SE of boundary center
      ['int2', rect(300, 200)],
      ['int3', rect(300, 200)],
    ]);
    const classified = makeClassified(
      ['ext1', 'ext2', 'ext3'],
      ['int1', 'int2', 'int3'],
      [
        { s: 'int1', t: 'ext1' },
        { s: 'int2', t: 'ext2' },
        { s: 'int3', t: 'ext3' },
      ],
    );
    placeExternals(absRects, BOUNDARY, classified, []);
    // At least one external should be on the bottom side (y > bh)
    const positions = ['ext1', 'ext2', 'ext3'].map(id => absRects.get(id)!);
    const onBottom = positions.filter(p => p.y >= BOUNDARY.h);
    expect(onBottom.length).toBeGreaterThanOrEqual(1);
  });
});
