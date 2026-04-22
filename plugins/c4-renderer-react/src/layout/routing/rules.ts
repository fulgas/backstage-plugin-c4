import type { HandleRule } from './types';

export const MinDistanceRule: HandleRule = {
  name: 'MinDistance',
  score(src, tgt) {
    const dx = tgt.x - src.x;
    const dy = tgt.y - src.y;
    return -(dx * dx + dy * dy);
  },
};

/**
 * Bonus for the center handle (½ face) when it is not already in use.
 * Center is preferred because a single edge on a face looks cleanest at mid-point;
 * side slots are used when multiple edges share the same face.
 */
export const PreferCenterRule: HandleRule = {
  name: 'PreferCenter',
  score(src, tgt, ctx) {
    // Source center gets a higher bonus (10 000) because a near/far source handle
    // can place the first path segment very close to an adjacent boundary, making
    // the edge appear to hug the wall. Target center gets a smaller bonus (5 000).
    const srcBonus =
      src.slot === 'center' && !ctx.usedSrcHandles.has(src.id) ? 10_000 : 0;
    const tgtBonus =
      tgt.slot === 'center' && !ctx.usedTgtHandles.has(tgt.id) ? 5_000 : 0;
    return srcBonus + tgtBonus;
  },
};

/**
 * Heavy penalty for reusing a handle already assigned to another edge on the same node.
 * Forces spread across the near/far slots when a face has multiple edges.
 */
export const AvoidUsedRule: HandleRule = {
  name: 'AvoidUsed',
  score(src, tgt, ctx) {
    const srcPenalty = ctx.usedSrcHandles.has(src.id) ? -1_000_000 : 0;
    const tgtPenalty = ctx.usedTgtHandles.has(tgt.id) ? -1_000_000 : 0;
    return srcPenalty + tgtPenalty;
  },
};
