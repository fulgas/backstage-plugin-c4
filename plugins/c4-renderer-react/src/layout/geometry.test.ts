import { closestHandles, orthogonalPath } from './geometry';

const box = (x: number, y: number) => ({ x, y, w: 100, h: 50 });

// closestHandles() picks by pure Euclidean distance (no context).
// When multiple pairs tie, the first in iteration order wins.
// Iteration order: top-l/c/r, right-t/c/b, bottom-l/c/r, left-t/c/b.
describe('closestHandles', () => {
  it('connects right→left when target is to the right', () => {
    const { sx, tx, sy, ty, sourceHandle, targetHandle } = closestHandles(
      box(0, 0),
      box(200, 0),
    );
    // Same y → all same-slot pairs tie at dx=100, dy=0. First encountered: s-right-t + t-left-t.
    expect(sx).toBe(100);
    expect(tx).toBe(200);
    expect(sy).toBe(12.5); // h * 0.25
    expect(ty).toBe(12.5);
    expect(sourceHandle).toBe('s-right-t');
    expect(targetHandle).toBe('t-left-t');
  });

  it('connects left→right when target is to the left', () => {
    const { sx, tx, sy, ty, sourceHandle, targetHandle } = closestHandles(
      box(200, 0),
      box(0, 0),
    );
    expect(sx).toBe(200);
    expect(tx).toBe(100);
    expect(sy).toBe(12.5);
    expect(ty).toBe(12.5);
    expect(sourceHandle).toBe('s-left-t');
    expect(targetHandle).toBe('t-right-t');
  });

  it('connects bottom→top when target is below', () => {
    const { sy, ty, sourceHandle, targetHandle } = closestHandles(
      box(0, 0),
      box(0, 200),
    );
    // s-bottom-l(25,50)→t-top-l(25,200): dy=150, dx=0 — first same-slot tie wins.
    expect(sy).toBe(50);
    expect(ty).toBe(200);
    expect(sourceHandle).toBe('s-bottom-l');
    expect(targetHandle).toBe('t-top-l');
  });

  it('connects top→bottom when target is above', () => {
    const { sy, ty, sourceHandle, targetHandle } = closestHandles(
      box(0, 200),
      box(0, 0),
    );
    // s-top-l(25,200)→t-bottom-l(25,50): dy=150, dx=0.
    expect(sy).toBe(200);
    expect(ty).toBe(50);
    expect(sourceHandle).toBe('s-top-l');
    expect(targetHandle).toBe('t-bottom-l');
  });

  it('picks matching quarter-point handles for vertically-offset rects', () => {
    // src(0,0,100,50), tgt(200,25,100,50) — tgt offset down by 25px
    // s-right-b(100,37.5)→t-left-t(200,37.5): dx=100, dy=0 → dist²=10000 (minimum)
    const { sx, sy, tx, ty, sourceHandle, targetHandle } = closestHandles(
      { x: 0, y: 0, w: 100, h: 50 },
      { x: 200, y: 25, w: 100, h: 50 },
    );
    expect(sourceHandle).toBe('s-right-b');
    expect(targetHandle).toBe('t-left-t');
    expect(sx).toBe(100);
    expect(sy).toBe(37.5);
    expect(tx).toBe(200);
    expect(ty).toBe(37.5);
  });

  it('picks diagonal closest handles for diagonal arrangement', () => {
    // src(0,0,100,50), tgt(150,100,100,50)
    // s-right-b(100,37.5)→t-left-t(150,112.5): dx=50, dy=75 → dist²=8125 (minimum)
    const { sourceHandle, targetHandle } = closestHandles(
      { x: 0, y: 0, w: 100, h: 50 },
      { x: 150, y: 100, w: 100, h: 50 },
    );
    expect(sourceHandle).toBe('s-right-b');
    expect(targetHandle).toBe('t-left-t');
  });
});

describe('orthogonalPath exit clearance', () => {
  const EXIT = 24; // must match EXIT_CLEARANCE in geometry.ts

  it('right-face: first bend is at least EXIT_CLEARANCE to the right of sx', () => {
    // target is to the LEFT — without face-aware clamping, midX < sx (wrong direction)
    const { pts } = orthogonalPath(280, 100, 50, 200, true, 'right');
    expect(pts.length).toBe(4);
    expect(pts[1].x).toBeGreaterThanOrEqual(280 + EXIT);
    expect(pts[1].y).toBe(100); // first segment is horizontal
  });

  it('left-face: first bend is at least EXIT_CLEARANCE to the left of sx', () => {
    const { pts } = orthogonalPath(100, 100, 350, 200, true, 'left');
    expect(pts.length).toBe(4);
    expect(pts[1].x).toBeLessThanOrEqual(100 - EXIT);
  });

  it('bottom-face: first bend is at least EXIT_CLEARANCE below sy', () => {
    const { pts } = orthogonalPath(100, 200, 200, 50, false, 'bottom');
    expect(pts.length).toBe(4);
    expect(pts[1].y).toBeGreaterThanOrEqual(200 + EXIT);
  });

  it('top-face: first bend is at least EXIT_CLEARANCE above sy', () => {
    const { pts } = orthogonalPath(100, 100, 200, 300, false, 'top');
    expect(pts.length).toBe(4);
    expect(pts[1].y).toBeLessThanOrEqual(100 - EXIT);
  });

  it('no face: uses plain midpoint (unchanged fallback)', () => {
    const { pts } = orthogonalPath(0, 0, 200, 100, true);
    expect(pts[1].x).toBe(100); // midX = (0+200)/2
  });

  it('straight horizontal line when sy ≈ ty (no L needed)', () => {
    const { pts } = orthogonalPath(0, 50, 200, 50, true, 'right');
    expect(pts.length).toBe(2);
  });
});

describe('orthogonalPath perpendicular face routing', () => {
  it('right→top: single L-bend reaching target from above', () => {
    // src exits right, target top-face needs vertical approach
    const { pts } = orthogonalPath(100, 50, 200, 150, true, 'right', 'top');
    // Path: (100,50) → (200,50) → (200,150) — arrives at target top from above
    expect(pts.length).toBe(3);
    expect(pts[1]).toEqual({ x: 200, y: 50 });
    expect(pts[2]).toEqual({ x: 200, y: 150 });
  });

  it('right→top: with target to the left, exits with clearance before routing', () => {
    // target is LEFT of source — can't go directly to tx in the exit direction
    const { pts } = orthogonalPath(200, 50, 50, 150, true, 'right', 'top');
    // Must exit right (clearance) before turning
    expect(pts[1].x).toBeGreaterThan(200);
  });

  it('bottom→left: single L-bend reaching target from the left', () => {
    const { pts } = orthogonalPath(100, 50, 200, 150, false, 'bottom', 'left');
    // src exits down, target left-face needs horizontal approach
    // Path: (100,50) → (100,150) → (200,150)
    expect(pts.length).toBe(3);
    expect(pts[1]).toEqual({ x: 100, y: 150 });
    expect(pts[2]).toEqual({ x: 200, y: 150 });
  });

  it('left→top: single L-bend when target is to the left of source', () => {
    const { pts } = orthogonalPath(200, 50, 100, 150, true, 'left', 'top');
    expect(pts.length).toBe(3);
    expect(pts[1]).toEqual({ x: 100, y: 50 });
    expect(pts[2]).toEqual({ x: 100, y: 150 });
  });
});
