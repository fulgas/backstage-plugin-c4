import type { HandlePoint, SourceHandle, TargetHandle } from '../geometry';

export interface RoutingContext {
  readonly usedSrcHandles: ReadonlySet<string>;
  readonly usedTgtHandles: ReadonlySet<string>;
}

export interface HandleRule {
  readonly name: string;
  score(
    src: HandlePoint<SourceHandle>,
    tgt: HandlePoint<TargetHandle>,
    ctx: RoutingContext,
  ): number;
}
