export type Rect = { x: number; y: number; w: number; h: number };

export type HandleFace = 'top' | 'right' | 'bottom' | 'left';
export type HandlePositionSlot = 'near' | 'center' | 'far';

// Three handles per face at ¼, ½, and ¾ of the face length.
// Naming: face + position along face (l/c/r for top/bottom, t/c/b for left/right).
export type SourceHandle =
  | 's-top-l'
  | 's-top-c'
  | 's-top-r'
  | 's-right-t'
  | 's-right-c'
  | 's-right-b'
  | 's-bottom-l'
  | 's-bottom-c'
  | 's-bottom-r'
  | 's-left-t'
  | 's-left-c'
  | 's-left-b';

export type TargetHandle =
  | 't-top-l'
  | 't-top-c'
  | 't-top-r'
  | 't-right-t'
  | 't-right-c'
  | 't-right-b'
  | 't-bottom-l'
  | 't-bottom-c'
  | 't-bottom-r'
  | 't-left-t'
  | 't-left-c'
  | 't-left-b';

export interface HandlePoint<T extends string = string> {
  id: T;
  x: number;
  y: number;
  face: HandleFace;
  /** ¼ = near, ½ = center, ¾ = far along the face. */
  slot: HandlePositionSlot;
}

export function buildSrcHandles(rect: Rect): HandlePoint<SourceHandle>[] {
  const { x, y, w, h } = rect;
  return [
    { id: 's-top-l', x: x + w * 0.25, y, face: 'top', slot: 'near' },
    { id: 's-top-c', x: x + w * 0.5, y, face: 'top', slot: 'center' },
    { id: 's-top-r', x: x + w * 0.75, y, face: 'top', slot: 'far' },
    { id: 's-right-t', x: x + w, y: y + h * 0.25, face: 'right', slot: 'near' },
    {
      id: 's-right-c',
      x: x + w,
      y: y + h * 0.5,
      face: 'right',
      slot: 'center',
    },
    { id: 's-right-b', x: x + w, y: y + h * 0.75, face: 'right', slot: 'far' },
    {
      id: 's-bottom-l',
      x: x + w * 0.25,
      y: y + h,
      face: 'bottom',
      slot: 'near',
    },
    {
      id: 's-bottom-c',
      x: x + w * 0.5,
      y: y + h,
      face: 'bottom',
      slot: 'center',
    },
    {
      id: 's-bottom-r',
      x: x + w * 0.75,
      y: y + h,
      face: 'bottom',
      slot: 'far',
    },
    { id: 's-left-t', x, y: y + h * 0.25, face: 'left', slot: 'near' },
    { id: 's-left-c', x, y: y + h * 0.5, face: 'left', slot: 'center' },
    { id: 's-left-b', x, y: y + h * 0.75, face: 'left', slot: 'far' },
  ];
}

export function buildTgtHandles(rect: Rect): HandlePoint<TargetHandle>[] {
  const { x, y, w, h } = rect;
  return [
    { id: 't-top-l', x: x + w * 0.25, y, face: 'top', slot: 'near' },
    { id: 't-top-c', x: x + w * 0.5, y, face: 'top', slot: 'center' },
    { id: 't-top-r', x: x + w * 0.75, y, face: 'top', slot: 'far' },
    { id: 't-right-t', x: x + w, y: y + h * 0.25, face: 'right', slot: 'near' },
    {
      id: 't-right-c',
      x: x + w,
      y: y + h * 0.5,
      face: 'right',
      slot: 'center',
    },
    { id: 't-right-b', x: x + w, y: y + h * 0.75, face: 'right', slot: 'far' },
    {
      id: 't-bottom-l',
      x: x + w * 0.25,
      y: y + h,
      face: 'bottom',
      slot: 'near',
    },
    {
      id: 't-bottom-c',
      x: x + w * 0.5,
      y: y + h,
      face: 'bottom',
      slot: 'center',
    },
    {
      id: 't-bottom-r',
      x: x + w * 0.75,
      y: y + h,
      face: 'bottom',
      slot: 'far',
    },
    { id: 't-left-t', x, y: y + h * 0.25, face: 'left', slot: 'near' },
    { id: 't-left-c', x, y: y + h * 0.5, face: 'left', slot: 'center' },
    { id: 't-left-b', x, y: y + h * 0.75, face: 'left', slot: 'far' },
  ];
}

/**
 * Find the closest source/target handle pair between two rects by pure distance.
 * For edge routing with context (used handles, center preference), use HandleRouter.
 */
export function closestHandles(
  src: Rect,
  tgt: Rect,
): {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  sourceHandle: SourceHandle;
  targetHandle: TargetHandle;
} {
  const srcHandles = buildSrcHandles(src);
  const tgtHandles = buildTgtHandles(tgt);

  let minDist = Infinity;
  let best = srcHandles[0];
  let bestTgt = tgtHandles[0];
  for (const s of srcHandles) {
    for (const t of tgtHandles) {
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const dist = dx * dx + dy * dy;
      if (dist < minDist) {
        minDist = dist;
        best = s;
        bestTgt = t;
      }
    }
  }

  return {
    sx: best.x,
    sy: best.y,
    tx: bestTgt.x,
    ty: bestTgt.y,
    sourceHandle: best.id,
    targetHandle: bestTgt.id,
  };
}

/**
 * Resolve absolute canvas positions for all React Flow nodes, handling
 * parentId-relative coordinates for compound (child) nodes.
 */
export function resolveAbsolutePositions(
  nodes: {
    id: string;
    parentId?: string;
    position: { x: number; y: number };
  }[],
): Map<string, { x: number; y: number }> {
  const absPos = new Map<string, { x: number; y: number }>();
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  function resolve(n: (typeof nodes)[0]): { x: number; y: number } {
    if (absPos.has(n.id)) return absPos.get(n.id)!;
    if (!n.parentId) {
      absPos.set(n.id, n.position);
      return n.position;
    }
    const parent = nodeMap.get(n.parentId);
    const parentAbs = parent ? resolve(parent) : { x: 0, y: 0 };
    const abs = {
      x: parentAbs.x + n.position.x,
      y: parentAbs.y + n.position.y,
    };
    absPos.set(n.id, abs);
    return abs;
  }

  nodes.forEach(n => resolve(n));
  return absPos;
}

/**
 * Build an SVG polyline path for an orthogonal L-bend edge.
 * Returns the full point array (start + bends + end) as an SVG path string.
 */
/** Minimum px the edge travels away from a face before its first bend. */
const EXIT_CLEARANCE = 24;

/**
 * Builds an orthogonal path from (sx,sy) to (tx,ty).
 *
 * When srcFace and tgtFace are on perpendicular axes (e.g. right→top), uses a
 * single-bend L-shape that approaches the target face from the correct direction.
 * When both faces are on the same axis, uses a Z-shape (H-V-H or V-H-V) with
 * exit clearance so the first segment always travels away from the source face.
 */
export function orthogonalPath(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  horizontalExit: boolean,
  srcFace?: HandleFace,
  tgtFace?: HandleFace,
): { path: string; pts: { x: number; y: number }[] } {
  const tgtIsVertical = tgtFace === 'top' || tgtFace === 'bottom';
  const tgtIsHorizontal = tgtFace === 'left' || tgtFace === 'right';

  let pts: { x: number; y: number }[];

  if (horizontalExit && tgtIsVertical) {
    // Perpendicular: src exits horizontally, target accepts vertically.
    // Ideal: go to target-x then target-y so the approach is vertical (correct for top/bottom face).
    // If we can't reach target-x in the exit direction, add a clearance step first.
    const canReachDirect =
      (srcFace === 'right' && tx >= sx) ||
      (srcFace === 'left' && tx <= sx) ||
      !srcFace;

    if (canReachDirect && Math.abs(sx - tx) > 0.5) {
      pts = [
        { x: sx, y: sy },
        { x: tx, y: sy },
        { x: tx, y: ty },
      ];
    } else {
      // Can't go directly — exit with clearance, then route to target
      let exitX =
        srcFace === 'right' ? sx + EXIT_CLEARANCE : sx - EXIT_CLEARANCE;
      if (!srcFace) exitX = (sx + tx) / 2;
      pts =
        Math.abs(sy - ty) < 0.5
          ? [
              { x: sx, y: sy },
              { x: tx, y: ty },
            ]
          : [
              { x: sx, y: sy },
              { x: exitX, y: sy },
              { x: exitX, y: ty },
              { x: tx, y: ty },
            ];
    }
  } else if (!horizontalExit && tgtIsHorizontal) {
    // Perpendicular: src exits vertically, target accepts horizontally.
    const canReachDirect =
      (srcFace === 'bottom' && ty >= sy) ||
      (srcFace === 'top' && ty <= sy) ||
      !srcFace;

    if (canReachDirect && Math.abs(sy - ty) > 0.5) {
      pts = [
        { x: sx, y: sy },
        { x: sx, y: ty },
        { x: tx, y: ty },
      ];
    } else {
      let exitY =
        srcFace === 'bottom' ? sy + EXIT_CLEARANCE : sy - EXIT_CLEARANCE;
      if (!srcFace) exitY = (sy + ty) / 2;
      pts =
        Math.abs(sx - tx) < 0.5
          ? [
              { x: sx, y: sy },
              { x: tx, y: ty },
            ]
          : [
              { x: sx, y: sy },
              { x: sx, y: exitY },
              { x: tx, y: exitY },
              { x: tx, y: ty },
            ];
    }
  } else if (horizontalExit) {
    // Same axis (H→H): Z-shape with exit-direction clearance.
    let bendX = (sx + tx) / 2;
    if (srcFace === 'right') bendX = Math.max(bendX, sx + EXIT_CLEARANCE);
    if (srcFace === 'left') bendX = Math.min(bendX, sx - EXIT_CLEARANCE);
    pts =
      Math.abs(sy - ty) < 0.5
        ? [
            { x: sx, y: sy },
            { x: tx, y: ty },
          ]
        : [
            { x: sx, y: sy },
            { x: bendX, y: sy },
            { x: bendX, y: ty },
            { x: tx, y: ty },
          ];
  } else {
    // Same axis (V→V): Z-shape with exit-direction clearance.
    let bendY = (sy + ty) / 2;
    if (srcFace === 'bottom') bendY = Math.max(bendY, sy + EXIT_CLEARANCE);
    if (srcFace === 'top') bendY = Math.min(bendY, sy - EXIT_CLEARANCE);
    pts =
      Math.abs(sx - tx) < 0.5
        ? [
            { x: sx, y: sy },
            { x: tx, y: ty },
          ]
        : [
            { x: sx, y: sy },
            { x: sx, y: bendY },
            { x: tx, y: bendY },
            { x: tx, y: ty },
          ];
  }

  const path = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ');
  return { path, pts };
}

/** True when the handle exits the node horizontally (right or left face). */
export function isHorizontalHandle(
  handle: SourceHandle | TargetHandle | string,
): boolean {
  const face = handle.split('-')[1];
  return face === 'right' || face === 'left';
}

/** Extract the face from a handle id string (e.g. 's-right-c' → 'right'). */
export function faceFromHandle(
  handle: SourceHandle | TargetHandle | string,
): HandleFace {
  return handle.split('-')[1] as HandleFace;
}

/**
 * Convert any handle id (static or dynamic) + node rect to pixel (x, y).
 *
 * Static slot names → fractions:  l/t → 0.25  |  c → 0.50  |  r/b → 0.75
 * Dynamic slot is already a number string: '0.333' → 0.333
 */
export function handleIdToPoint(
  handleId: string,
  rect: Rect,
): { x: number; y: number; face: HandleFace } {
  const parts = handleId.split('-');
  const face = parts[1] as HandleFace;
  const slot = parts[2] ?? 'c';

  const STATIC: Record<string, number> = {
    l: 0.25,
    t: 0.25,
    c: 0.5,
    r: 0.75,
    b: 0.75,
  };
  const frac = STATIC[slot] !== undefined ? STATIC[slot] : parseFloat(slot);
  const f = Number.isFinite(frac) ? frac : 0.5;

  const { x, y, w, h } = rect;
  switch (face) {
    case 'top':
      return { x: x + w * f, y, face };
    case 'bottom':
      return { x: x + w * f, y: y + h, face };
    case 'left':
      return { x, y: y + h * f, face };
    case 'right':
      return { x: x + w, y: y + h * f, face };
  }
}
