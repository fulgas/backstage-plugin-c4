import type { C4Actor } from '@fulgas/plugin-c4-node';
import { NODE_H, NODE_W } from '../../c4Style';
import type { Rect } from '../geometry';
import type { Boundary, ClassifiedState, Side } from './types';

const EXT_GAP = 60;

/**
 * Returns the two boundary sides ordered by proximity to (cx, cy).
 * Primary = nearest face to the internal centroid, secondary = second-nearest.
 * Used for load-balanced assignment: try primary first, fall back to secondary
 * when primary is already more loaded.
 */
function sidePriority(cx: number, cy: number, b: Boundary): [Side, Side] {
  const dists: [Side, number][] = [
    ['left', cx - b.x],
    ['right', b.x + b.w - cx],
    ['top', cy - b.y],
    ['bottom', b.y + b.h - cy],
  ];
  dists.sort((a, d) => a[1] - d[1]);
  return [dists[0][0], dists[1][0]];
}

/**
 * Assigns each external node / actor to a boundary side and writes its
 * absolute canvas position into absRects (mutated in-place).
 *
 * Algorithm:
 * 1. Compute the centroid of each external's connected internal nodes.
 * 2. Find the nearest boundary face to that centroid (minimises edge length).
 * 3. Sort all externals by angle (deterministic traversal around the boundary).
 * 4. Greedily assign each to the nearest face, or second-nearest when the
 *    nearest face already has more nodes (load balancing).
 * 5. Within each side, spread nodes with minimum spacing to prevent overlap.
 */
export function placeExternals(
  absRects: Map<string, Rect>,
  boundary: Boundary,
  classified: ClassifiedState,
  actors: C4Actor[],
): void {
  const { externalNodes, internalIdSet, edgeMap } = classified;
  const { x: bx, y: by, w: bw, h: bh } = boundary;

  const externalIdSet = new Set([
    ...externalNodes.map(n => n.id),
    ...actors.map(a => a.id),
  ]);

  const sideGroups: Record<Side, { id: string; coord: number }[]> = {
    left: [],
    right: [],
    top: [],
    bottom: [],
  };
  const sideLoads: Record<Side, number> = {
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  };

  type Candidate = {
    id: string;
    primary: Side;
    secondary: Side;
    coordLR: number;
    coordTB: number;
    angle: number;
  };

  const candidates: Candidate[] = [];
  for (const extId of externalIdSet) {
    const connected: Rect[] = [];
    for (const [, group] of edgeMap) {
      const s = group[0].sourceId;
      const t = group[0].targetId;
      if (s === extId && internalIdSet.has(t)) {
        const r = absRects.get(t);
        if (r) connected.push(r);
      }
      if (t === extId && internalIdSet.has(s)) {
        const r = absRects.get(s);
        if (r) connected.push(r);
      }
    }

    if (connected.length === 0) {
      // Unconnected externals go to right at boundary mid-height.
      candidates.push({
        id: extId,
        primary: 'right',
        secondary: 'bottom',
        coordLR: by + bh / 2,
        coordTB: bx + bw / 2,
        angle: 0,
      });
      continue;
    }

    const cx =
      connected.reduce((sum, r) => sum + r.x + r.w / 2, 0) / connected.length;
    const cy =
      connected.reduce((sum, r) => sum + r.y + r.h / 2, 0) / connected.length;
    const [primary, secondary] = sidePriority(cx, cy, boundary);
    const angle =
      (Math.atan2(cy - (by + bh / 2), cx - (bx + bw / 2)) * (180 / Math.PI) +
        360) %
      360;
    candidates.push({
      id: extId,
      primary,
      secondary,
      coordLR: cy,
      coordTB: cx,
      angle,
    });
  }

  // Sort by angle so assignment walks around the boundary in order.
  candidates.sort((a, b) => a.angle - b.angle);

  for (const { id, primary, secondary, coordLR, coordTB } of candidates) {
    // Only switch to secondary when primary is 2+ nodes ahead, so externals that
    // clearly belong on one face don't get pushed away by a single prior node.
    const side =
      sideLoads[primary] <= sideLoads[secondary] + 1 ? primary : secondary;
    sideGroups[side].push({
      id,
      coord: side === 'left' || side === 'right' ? coordLR : coordTB,
    });
    sideLoads[side]++;
  }

  const sides: Side[] = ['left', 'right', 'top', 'bottom'];
  for (const side of sides) {
    const items = sideGroups[side];
    if (!items.length) continue;
    items.sort((a, b) => a.coord - b.coord);
    const minSpacing =
      side === 'left' || side === 'right' ? NODE_H + 20 : NODE_W + 20;
    for (let i = 1; i < items.length; i++) {
      items[i].coord = Math.max(
        items[i].coord,
        items[i - 1].coord + minSpacing,
      );
    }
    for (const { id, coord } of items) {
      let x: number;
      let y: number;
      if (side === 'right') {
        x = bx + bw + EXT_GAP;
        y = coord - NODE_H / 2;
      } else if (side === 'left') {
        x = bx - EXT_GAP - NODE_W;
        y = coord - NODE_H / 2;
      } else if (side === 'bottom') {
        x = coord - NODE_W / 2;
        y = by + bh + EXT_GAP;
      } else {
        x = coord - NODE_W / 2;
        y = by - EXT_GAP - NODE_H;
      }
      absRects.set(id, { x, y, w: NODE_W, h: NODE_H });
    }
  }
}
