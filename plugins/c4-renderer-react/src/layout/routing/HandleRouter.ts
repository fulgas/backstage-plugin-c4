import {
  buildSrcHandles,
  buildTgtHandles,
  isHorizontalHandle,
  orthogonalPath,
  type HandlePoint,
  type Rect,
  type SourceHandle,
  type TargetHandle,
} from '../geometry';
import { AvoidUsedRule, MinDistanceRule, PreferCenterRule } from './rules';
import type { HandleRule, RoutingContext } from './types';

export interface RouteResult {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  sourceHandle: SourceHandle;
  targetHandle: TargetHandle;
  sections: Array<{
    startPoint: { x: number; y: number };
    bendPoints: Array<{ x: number; y: number }>;
    endPoint: { x: number; y: number };
  }>;
}

const EMPTY: ReadonlySet<string> = new Set();

/**
 * Selects the best source/target handle pair for an edge using a scored rule set.
 *
 * Rules are applied additively: each rule contributes a score, highest total wins.
 * Add rules to the constructor to extend behaviour without touching existing logic.
 *
 * Default rules (in priority order by weight):
 *   1. AvoidUsed     — hard penalty (-1 000 000) for handles already taken
 *   2. PreferCenter  — bonus (+5 000) for the ½-face handle when it is free
 *   3. MinDistance   — continuous score (-dist²) so closer pairs rank higher
 */
export class HandleRouter {
  static readonly DEFAULT_RULES: HandleRule[] = [
    AvoidUsedRule,
    PreferCenterRule,
    MinDistanceRule,
  ];

  constructor(
    public readonly rules: HandleRule[] = HandleRouter.DEFAULT_RULES,
  ) {}

  select(
    srcRect: Rect,
    tgtRect: Rect,
    ctx: RoutingContext = { usedSrcHandles: EMPTY, usedTgtHandles: EMPTY },
  ): RouteResult {
    const srcHandles = buildSrcHandles(srcRect);
    const tgtHandles = buildTgtHandles(tgtRect);

    let best: HandlePoint<SourceHandle> = srcHandles[0];
    let bestTgt: HandlePoint<TargetHandle> = tgtHandles[0];
    let bestScore = -Infinity;

    for (const s of srcHandles) {
      for (const t of tgtHandles) {
        const score = this.rules.reduce(
          (sum, rule) => sum + rule.score(s, t, ctx),
          0,
        );
        if (score > bestScore) {
          bestScore = score;
          best = s;
          bestTgt = t;
        }
      }
    }

    const { pts } = orthogonalPath(
      best.x,
      best.y,
      bestTgt.x,
      bestTgt.y,
      isHorizontalHandle(best.id),
      best.face,
      bestTgt.face,
    );
    return {
      sx: best.x,
      sy: best.y,
      tx: bestTgt.x,
      ty: bestTgt.y,
      sourceHandle: best.id,
      targetHandle: bestTgt.id,
      sections: [
        {
          startPoint: { x: best.x, y: best.y },
          bendPoints: pts.slice(1, -1),
          endPoint: { x: bestTgt.x, y: bestTgt.y },
        },
      ],
    };
  }
}

/** Track used handles across multiple select() calls for one layout pass. */
export class HandleUsageTracker {
  private readonly map = new Map<
    string,
    { src: Set<string>; tgt: Set<string> }
  >();

  private ensure(id: string): { src: Set<string>; tgt: Set<string> } {
    let entry = this.map.get(id);
    if (!entry) {
      entry = { src: new Set(), tgt: new Set() };
      this.map.set(id, entry);
    }
    return entry;
  }

  ctx(srcId: string, tgtId: string): RoutingContext {
    return {
      usedSrcHandles: this.map.get(srcId)?.src ?? EMPTY,
      usedTgtHandles: this.map.get(tgtId)?.tgt ?? EMPTY,
    };
  }

  mark(
    srcId: string,
    srcHandle: string,
    tgtId: string,
    tgtHandle: string,
  ): void {
    this.ensure(srcId).src.add(srcHandle);
    this.ensure(tgtId).tgt.add(tgtHandle);
  }
}
