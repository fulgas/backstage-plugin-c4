import { HandleRouter, HandleUsageTracker } from './HandleRouter';

const box = (x: number, y: number) => ({ x, y, w: 100, h: 50 });
const EMPTY = {
  usedSrcHandles: new Set<string>(),
  usedTgtHandles: new Set<string>(),
};

describe('HandleRouter', () => {
  const router = new HandleRouter();

  it('prefers center handles when no handles are used', () => {
    // Two nodes at same y — all same-slot pairs have equal distance, center wins on bonus.
    const { sourceHandle, targetHandle } = router.select(
      box(0, 0),
      box(200, 0),
      EMPTY,
    );
    expect(sourceHandle).toBe('s-right-c');
    expect(targetHandle).toBe('t-left-c');
  });

  it('falls back to near/far slot when center is already used', () => {
    const ctx = {
      usedSrcHandles: new Set(['s-right-c']),
      usedTgtHandles: new Set<string>(),
    };
    const { sourceHandle } = router.select(box(0, 0), box(200, 0), ctx);
    expect(sourceHandle).not.toBe('s-right-c');
    expect(sourceHandle).toMatch(/^s-right-/);
  });

  it('avoids used target handle too', () => {
    const ctx = {
      usedSrcHandles: new Set<string>(),
      usedTgtHandles: new Set(['t-left-c']),
    };
    const { targetHandle } = router.select(box(0, 0), box(200, 0), ctx);
    expect(targetHandle).not.toBe('t-left-c');
    expect(targetHandle).toMatch(/^t-left-/);
  });

  it('returns section with correct start/end points', () => {
    const { sx, sy, tx, ty, sections } = router.select(
      box(0, 0),
      box(200, 0),
      EMPTY,
    );
    expect(sections).toHaveLength(1);
    expect(sections[0].startPoint).toEqual({ x: sx, y: sy });
    expect(sections[0].endPoint).toEqual({ x: tx, y: ty });
  });
});

describe('HandleUsageTracker', () => {
  it('tracks used handles per node and returns correct context', () => {
    const tracker = new HandleUsageTracker();
    tracker.mark('a', 's-right-c', 'b', 't-left-c');
    const ctx = tracker.ctx('a', 'b');
    expect(ctx.usedSrcHandles.has('s-right-c')).toBe(true);
    expect(ctx.usedTgtHandles.has('t-left-c')).toBe(true);
    expect(ctx.usedSrcHandles.has('s-right-t')).toBe(false);
  });

  it('returns empty sets for unknown nodes', () => {
    const tracker = new HandleUsageTracker();
    const ctx = tracker.ctx('x', 'y');
    expect(ctx.usedSrcHandles.size).toBe(0);
    expect(ctx.usedTgtHandles.size).toBe(0);
  });

  it('accumulates multiple handles per node', () => {
    const tracker = new HandleUsageTracker();
    tracker.mark('a', 's-right-c', 'b', 't-left-c');
    tracker.mark('a', 's-right-t', 'c', 't-left-t');
    const ctx = tracker.ctx('a', 'x');
    expect(ctx.usedSrcHandles.has('s-right-c')).toBe(true);
    expect(ctx.usedSrcHandles.has('s-right-t')).toBe(true);
  });
});
