import type { ElkNode } from 'elkjs';
import { BOUNDARY_PAD, NODE_H, NODE_W } from '../../c4Style';
import type { Rect } from '../geometry';
import type { Boundary } from './types';

// Lazily loaded and cached — the UMD bundle must NOT be imported statically
// because webpack executes it at module-init time and corrupts React's module
// context (causes "$RefreshSig$ / useState is not a function" errors).
let _elk: InstanceType<typeof import('elkjs').default> | null = null;
async function getElk() {
  if (!_elk) {
    const mod = await import('elkjs/lib/elk.bundled.js');
    const ELKClass = ((mod as any).default ?? mod) as any;
    _elk = new ELKClass();
  }
  return _elk!;
}

export async function runElk(
  elkGraph: ElkNode,
  subdomainIds: Set<string>,
): Promise<{
  elkResult: ElkNode;
  boundary: Boundary;
  absRects: Map<string, Rect>;
}> {
  const elk = await getElk();
  const elkResult = await elk.layout(elkGraph);

  let maxX = 0;
  let maxY = 0;
  for (const child of elkResult.children ?? []) {
    const cw = subdomainIds.has(child.id) ? child.width ?? NODE_W : NODE_W;
    const ch = subdomainIds.has(child.id) ? child.height ?? NODE_H : NODE_H;
    maxX = Math.max(maxX, (child.x ?? 0) + cw);
    maxY = Math.max(maxY, (child.y ?? 0) + ch);
  }
  // Boundary starts at canvas origin; React Flow fitView centres it.
  const boundary: Boundary = {
    x: 0,
    y: 0,
    w: maxX + BOUNDARY_PAD * 2,
    h: maxY + BOUNDARY_PAD * 2,
  };

  // Absolute canvas rects for internal nodes (used for edge geometry and
  // external node placement). External positions are added by placeExternals.
  const absRects = new Map<string, Rect>();
  for (const child of elkResult.children ?? []) {
    if (subdomainIds.has(child.id)) {
      const sdAbsX = boundary.x + BOUNDARY_PAD + (child.x ?? 0);
      const sdAbsY = boundary.y + BOUNDARY_PAD + (child.y ?? 0);
      for (const sys of child.children ?? []) {
        absRects.set(sys.id, {
          x: sdAbsX + (sys.x ?? 0),
          y: sdAbsY + (sys.y ?? 0),
          w: NODE_W,
          h: NODE_H,
        });
      }
    } else {
      absRects.set(child.id, {
        x: boundary.x + BOUNDARY_PAD + (child.x ?? 0),
        y: boundary.y + BOUNDARY_PAD + (child.y ?? 0),
        w: NODE_W,
        h: NODE_H,
      });
    }
  }

  return { elkResult, boundary, absRects };
}
