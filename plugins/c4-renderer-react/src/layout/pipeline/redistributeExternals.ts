import type { C4Actor } from '@fulgas/plugin-c4-node';
import { NODE_H, NODE_W } from '../../c4Style';
import type { Rect } from '../geometry';
import type { ClassifiedState } from './types';

const NODE_SEP = 60;
const FACE_GAP = 80;

type Unit = { id: string };

function classifyUnit(
  id: string,
  internalIdSet: Set<string>,
  edgeMap: ClassifiedState['edgeMap'],
): 'caller' | 'callee' | 'both' {
  let calls = false,
    called = false;
  for (const [, group] of edgeMap) {
    const { sourceId, targetId } = group[0];
    if (sourceId === id && internalIdSet.has(targetId)) calls = true;
    if (targetId === id && internalIdSet.has(sourceId)) called = true;
  }
  if (calls && called) return 'both';
  if (called) return 'callee';
  return 'caller';
}

/**
 * Redistribute external nodes and actors around the subject boundary after ELK layout.
 * ELK's layered algorithm stacks all same-rank external nodes in one column; this
 * spreads callers across top/left/bottom faces and callees on the right face.
 */
export function redistributeExternals(
  absRects: Map<string, Rect>,
  boundaryW: number,
  boundaryH: number,
  classified: ClassifiedState,
  actors: C4Actor[],
  dir: 'TB' | 'LR',
): Map<string, Rect> {
  const { internalIdSet, externalNodes, edgeMap } = classified;

  const allUnits: Unit[] = [
    ...externalNodes.map(n => ({ id: n.id })),
    ...actors.map(a => ({ id: a.id })),
  ];

  if (allUnits.length === 0) return absRects;

  const callers: Unit[] = [];
  const callees: Unit[] = [];
  for (const u of allUnits) {
    const cls = classifyUnit(u.id, internalIdSet, edgeMap);
    (cls === 'callee' ? callees : callers).push(u);
  }

  // Boundary occupies (0,0)→(boundaryW, boundaryH) in canvas coordinates.
  const bw = boundaryW,
    bh = boundaryH;

  // LR: callers on left+top+bottom, callees on right.
  // TB: callers on top+left+right, callees on bottom.
  const callerFaces =
    dir === 'LR'
      ? (['left', 'top', 'bottom'] as const)
      : (['top', 'left', 'right'] as const);
  const calleeFaces =
    dir === 'LR' ? (['right'] as const) : (['bottom'] as const);

  const faceLen: Record<string, number> = {
    top: bw,
    bottom: bw,
    left: bh,
    right: bh,
  };

  function distribute<F extends string>(
    items: Unit[],
    faces: readonly F[],
  ): Map<F, Unit[]> {
    const total = faces.reduce((s, f) => s + faceLen[f], 0);
    const map = new Map<F, Unit[]>(faces.map(f => [f, []]));
    let idx = 0;
    for (let fi = 0; fi < faces.length; fi++) {
      const f = faces[fi];
      const count =
        fi === faces.length - 1
          ? items.length - idx
          : Math.round((items.length * faceLen[f]) / total);
      map.get(f)!.push(...items.slice(idx, idx + count));
      idx += count;
    }
    return map;
  }

  const callerMap = distribute(callers, callerFaces);
  const calleeMap = distribute(callees, calleeFaces);

  const newRects = new Map(absRects);

  function placeOnFace(
    units: Unit[],
    face: 'top' | 'bottom' | 'left' | 'right',
  ) {
    if (!units.length) return;
    if (face === 'top') {
      const tw = units.length * NODE_W + (units.length - 1) * NODE_SEP;
      let x = (bw - tw) / 2;
      for (const u of units) {
        newRects.set(u.id, { x, y: -FACE_GAP - NODE_H, w: NODE_W, h: NODE_H });
        x += NODE_W + NODE_SEP;
      }
    } else if (face === 'bottom') {
      const tw = units.length * NODE_W + (units.length - 1) * NODE_SEP;
      let x = (bw - tw) / 2;
      for (const u of units) {
        newRects.set(u.id, { x, y: bh + FACE_GAP, w: NODE_W, h: NODE_H });
        x += NODE_W + NODE_SEP;
      }
    } else if (face === 'left') {
      const th = units.length * NODE_H + (units.length - 1) * NODE_SEP;
      let y = (bh - th) / 2;
      for (const u of units) {
        newRects.set(u.id, { x: -FACE_GAP - NODE_W, y, w: NODE_W, h: NODE_H });
        y += NODE_H + NODE_SEP;
      }
    } else {
      const th = units.length * NODE_H + (units.length - 1) * NODE_SEP;
      let y = (bh - th) / 2;
      for (const u of units) {
        newRects.set(u.id, { x: bw + FACE_GAP, y, w: NODE_W, h: NODE_H });
        y += NODE_H + NODE_SEP;
      }
    }
  }

  for (const face of callerFaces) {
    placeOnFace(callerMap.get(face) ?? [], face);
  }
  for (const face of calleeFaces) {
    placeOnFace(calleeMap.get(face) ?? [], face);
  }

  return newRects;
}
