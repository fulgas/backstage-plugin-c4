/**
 * Shared helpers for C4 diagram Playwright tests.
 *
 * Usage — create a spec file:
 *
 *   import { diagramSuite } from './diagram-helpers';
 *   diagramSuite('my domain', '/c4/default/domain/my-domain', 'my-domain');
 *
 * The suite runs standard validations for every diagram:
 *   - renders with nodes and edges
 *   - no edge passes through an unrelated node
 *   - edge endpoints land on node faces (ELK ORTHOGONAL routing)
 *   - handles are visible in edit mode
 *   - screenshots (view + edit)
 *
 * Enable ELK debug logs in tests by setting __C4_ELK_DEBUG__ = true via
 * page.addInitScript before navigation. Logs appear in Playwright's console
 * capture with prefix '[c4-elk]'.
 */

import * as fs from 'fs';
import * as path from 'path';
import { expect, test, type Page } from '@playwright/test';

// ── Constants ─────────────────────────────────────────────────────────────────

export const NODE_W = 180;
export const NODE_H = 100;
const SCREENSHOTS = path.join(__dirname, 'screenshots');

// ── Types ─────────────────────────────────────────────────────────────────────

export type Point = { x: number; y: number };
export type NodeRect = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
};
export type EdgePath = { id: string; pts: Point[] };
export type EdgeEndpoints = { id: string; start: Point; end: Point };

// ── Filesystem helpers ────────────────────────────────────────────────────────

export function ensureScreenshotsDir(): void {
  if (!fs.existsSync(SCREENSHOTS))
    fs.mkdirSync(SCREENSHOTS, { recursive: true });
}

export async function shot(page: Page, name: string): Promise<void> {
  ensureScreenshotsDir();
  await page.screenshot({ path: path.join(SCREENSHOTS, `${name}.png`) });
}

// ── Page interaction helpers ──────────────────────────────────────────────────

/**
 * Wait for any React Flow content to appear. Returns whether nodes and edges rendered.
 * Uses a shorter timeout than the Playwright default — diagrams that have no data
 * will return { hasNodes: false } quickly instead of timing out.
 */
export async function waitForDiagram(
  page: Page,
): Promise<{ hasNodes: boolean; hasEdges: boolean }> {
  try {
    await page.waitForSelector('.react-flow__node', {
      state: 'attached',
      timeout: 12_000,
    });
  } catch {
    return { hasNodes: false, hasEdges: false };
  }
  let hasEdges = false;
  try {
    await page.waitForSelector('.react-flow__edge', {
      state: 'attached',
      timeout: 5_000,
    });
    hasEdges = true;
  } catch {
    // diagram has nodes but no edges — valid for leaf entities
  }
  await page.waitForTimeout(300);
  return { hasNodes: true, hasEdges };
}

export async function enterEditMode(page: Page): Promise<void> {
  await page.click('[title="Edit Layout"]');
  await page.waitForTimeout(200);
}

/**
 * Call before page.goto() to enable ELK debug logging.
 * Logs appear with prefix '[c4-elk]' — capture with page.on('console', ...).
 */
export async function enableElkDebug(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__C4_ELK_DEBUG__ = true;
  });
}

// ── DOM read helpers ──────────────────────────────────────────────────────────

/**
 * Read all React Flow node bounding boxes in canvas coordinates in one DOM pass.
 * Splits into regular nodes (non-boundary) and boundary nodes.
 * Walks ancestor transforms to compute absolute position for nested nodes.
 */
async function readAllNodeRects(
  page: Page,
): Promise<{ nodes: NodeRect[]; boundaries: NodeRect[] }> {
  return page.evaluate(
    ({ nw, nh }) => {
      function parseTranslate(el: Element): { x: number; y: number } {
        const t = (el as HTMLElement).style.transform ?? '';
        const m = t.match(/translate(?:3d)?\(([-\d.]+)px,\s*([-\d.]+)px/);
        return m
          ? { x: parseFloat(m[1]), y: parseFloat(m[2]) }
          : { x: 0, y: 0 };
      }
      function absoluteFlowPos(el: Element): { x: number; y: number } {
        let x = 0,
          y = 0,
          cur: Element | null = el;
        while (cur) {
          if ((cur as HTMLElement).classList?.contains('react-flow__viewport'))
            break;
          const t = parseTranslate(cur);
          x += t.x;
          y += t.y;
          cur = cur.parentElement;
        }
        return { x, y };
      }
      const nodes: NodeRect[] = [],
        boundaries: NodeRect[] = [];
      document.querySelectorAll('.react-flow__node').forEach(el => {
        const id = (el as HTMLElement).dataset.id ?? '';
        const pos = absoluteFlowPos(el);
        const w = parseFloat((el as HTMLElement).style.width) || nw;
        const h = parseFloat((el as HTMLElement).style.height) || nh;
        (el.classList.contains('react-flow__node-boundary')
          ? boundaries
          : nodes
        ).push({ id, x: pos.x, y: pos.y, w, h });
      });
      return { nodes, boundaries };
    },
    { nw: NODE_W, nh: NODE_H },
  );
}

export async function readNodeRects(page: Page): Promise<NodeRect[]> {
  return readAllNodeRects(page).then(r => r.nodes);
}

export async function readBoundaryRects(page: Page): Promise<NodeRect[]> {
  return readAllNodeRects(page).then(r => r.boundaries);
}

/**
 * Read full edge paths (all polyline points) from SVG path d attributes.
 */
export async function readEdgePaths(page: Page): Promise<EdgePath[]> {
  return page.evaluate(() => {
    const results: EdgePath[] = [];
    document.querySelectorAll('.react-flow__edge').forEach(edge => {
      const id = (edge as HTMLElement).dataset.id ?? '';
      const pathEl = edge.querySelector('path.react-flow__edge-path');
      if (!pathEl) return;
      const d = pathEl.getAttribute('d') ?? '';
      const nums = [...d.matchAll(/-?[\d.]+/g)].map(m => parseFloat(m[0]));
      const pts: Point[] = [];
      for (let i = 0; i + 1 < nums.length; i += 2)
        pts.push({ x: nums[i], y: nums[i + 1] });
      results.push({ id, pts });
    });
    return results;
  });
}

/**
 * Read just the start and end point of each edge path.
 */
export async function readEdgeEndpoints(page: Page): Promise<EdgeEndpoints[]> {
  return page.evaluate(() => {
    const results: EdgeEndpoints[] = [];
    document.querySelectorAll('.react-flow__edge').forEach(edge => {
      const id = (edge as HTMLElement).dataset.id ?? '';
      const pathEl = edge.querySelector('path.react-flow__edge-path');
      if (!pathEl) return;
      const d = pathEl.getAttribute('d') ?? '';
      const nums = d.match(/-?[\d.]+/g);
      if (!nums || nums.length < 4) return;
      results.push({
        id,
        start: { x: parseFloat(nums[0]), y: parseFloat(nums[1]) },
        end: {
          x: parseFloat(nums[nums.length - 2]),
          y: parseFloat(nums[nums.length - 1]),
        },
      });
    });
    return results;
  });
}

// ── Geometry helpers ──────────────────────────────────────────────────────────

/** True if point p is inside (or within tolerance of) rect r. */
export function pointInRect(p: Point, r: NodeRect, tolerance = 5): boolean {
  return (
    p.x >= r.x - tolerance &&
    p.x <= r.x + r.w + tolerance &&
    p.y >= r.y - tolerance &&
    p.y <= r.y + r.h + tolerance
  );
}

/** True if segment a→b passes through rect r (samples 20 interior points). */
export function segmentPassesThroughRect(
  a: Point,
  b: Point,
  r: NodeRect,
  tolerance = 5,
): boolean {
  const steps = 20;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const p = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
    if (pointInRect(p, r, tolerance)) return true;
  }
  return false;
}

/**
 * True if axis-aligned segment a→b runs along (≤ tol px from) a face of rect r
 * AND overlaps that face by at least minOverlap px.
 *
 * Detects the "face-hugging" visual artifact where an edge travels along the
 * exterior boundary of an unrelated node instead of routing around it.
 */
export function segmentHugsNodeFace(
  a: Point,
  b: Point,
  r: NodeRect,
  tol = 8,
  minOverlap = 20,
): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;

  if (Math.abs(dy) < 2 && Math.abs(dx) >= minOverlap) {
    // Horizontal segment — check top and bottom faces
    const y = (a.y + b.y) / 2;
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    const overlap = Math.min(maxX, r.x + r.w) - Math.max(minX, r.x);
    if (overlap >= minOverlap) {
      if (Math.abs(y - r.y) <= tol) return true;
      if (Math.abs(y - (r.y + r.h)) <= tol) return true;
    }
  }

  if (Math.abs(dx) < 2 && Math.abs(dy) >= minOverlap) {
    // Vertical segment — check left and right faces
    const x = (a.x + b.x) / 2;
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    const overlap = Math.min(maxY, r.y + r.h) - Math.max(minY, r.y);
    if (overlap >= minOverlap) {
      if (Math.abs(x - r.x) <= tol) return true;
      if (Math.abs(x - (r.x + r.w)) <= tol) return true;
    }
  }

  return false;
}

/** True if pt lies on any face (edge) of the node bounding box within tolerance. */
export function isOnNodeFace(pt: Point, n: NodeRect, tol = 15): boolean {
  const inX = pt.x >= n.x - tol && pt.x <= n.x + n.w + tol;
  const inY = pt.y >= n.y - tol && pt.y <= n.y + n.h + tol;
  const onTop = Math.abs(pt.y - n.y) < tol && inX;
  const onBottom = Math.abs(pt.y - (n.y + n.h)) < tol && inX;
  const onLeft = Math.abs(pt.x - n.x) < tol && inY;
  const onRight = Math.abs(pt.x - (n.x + n.w)) < tol && inY;
  return onTop || onBottom || onLeft || onRight;
}

// ── Standard test suite factory ───────────────────────────────────────────────

/**
 * Explicit set of tests to run for a diagram.
 * Only registered tests run — no test.skip(), no runtime guessing.
 *
 * render               — diagram has ≥1 non-boundary node
 * handles              — edit mode shows center handles on every face
 * passthrough          — no edge segment passes through an unrelated node (view mode, ELK routing)
 * faceConnect          — every edge start/end point lands on its source/target node face (view mode)
 * faceConnectEdit      — same check in edit mode (before any drag), verifies edit mode keeps ELK routing
 * labelStability       — edge labels do not jump when entering edit mode (vacuous-pass if no labels)
 * drag                 — drag a node 120px, verify connected edge paths update
 * dragEdgeFace         — after drag, edges connected to dragged node have endpoints on its NEW face
 * dragEdgeVisible      — edge count stays constant during drag and after drag-stop (no disappearing)
 * dragHandles          — dragged node retains [data-handleid] handles after drag-stop
 * dragLive             — mid-drag (mouse still down), edge endpoints already track the moving node
 * edgeCount            — at least one edge rendered when multiple nodes present (catches external edges missing)
 * nodeTypeLabels       — nodes show C4 type tags like [System], [Container: tech] (not just names)
 * externalDistribution — external nodes are spread in 2D, not all stacked in one column
 * noOrphanNodes        — no non-boundary node is stuck at position (0, 0)
 * noFaceHugging        — no edge segment runs along the exterior face of an unrelated node
 * orthogonalSegments   — all edge path segments are axis-aligned (no diagonal lines)
 */
export interface DiagramTests {
  render?: boolean;
  handles?: boolean;
  passthrough?: boolean;
  faceConnect?: boolean;
  faceConnectEdit?: boolean;
  labelStability?: boolean;
  drag?: boolean;
  dragEdgeFace?: boolean;
  dragEdgeVisible?: boolean;
  dragHandles?: boolean;
  dragFaceConsistency?: boolean;
  dragLive?: boolean;
  edgeCount?: boolean;
  nodeTypeLabels?: boolean;
  externalDistribution?: boolean;
  noOrphanNodes?: boolean;
  noFaceHugging?: boolean;
  orthogonalSegments?: boolean;
}

/** All structural tests. Use for diagrams with multiple nodes and at least one edge. */
export const FULL: DiagramTests = {
  render: true,
  handles: true,
  passthrough: true,
  faceConnect: true,
  faceConnectEdit: true,
  labelStability: true,
  drag: true,
  dragEdgeFace: true,
  dragEdgeVisible: true,
  dragHandles: true,
  dragFaceConsistency: true,
  dragLive: true,
  edgeCount: true,
  nodeTypeLabels: true,
  externalDistribution: true,
  noOrphanNodes: true,
  noFaceHugging: true,
  orthogonalSegments: true,
};

/** Node + handle tests only. Use for diagrams with nodes but no cross-node edges. */
export const NODES_ONLY: DiagramTests = {
  render: true,
  handles: true,
};

/** Screenshot only. Use for entities that render no C4 diagram (no internal nodes). */
export const SCREENSHOT_ONLY: DiagramTests = {};

/**
 * Register a test suite for a C4 diagram.
 *
 * @param suiteName  Displayed in test output, e.g. 'fulfillment landscape'
 * @param url        Backstage URL, e.g. '/c4/default/domain/fulfillment'
 * @param prefix     Screenshot file prefix, e.g. 'fulfillment'
 * @param tests      Which tests to register (default: FULL)
 */
export function diagramSuite(
  suiteName: string,
  url: string,
  prefix: string,
  tests: DiagramTests = FULL,
): void {
  const needsNodes =
    tests.render ||
    tests.handles ||
    tests.passthrough ||
    tests.faceConnect ||
    tests.faceConnectEdit ||
    tests.labelStability ||
    tests.drag ||
    tests.dragEdgeFace ||
    tests.dragEdgeVisible ||
    tests.dragHandles ||
    tests.dragFaceConsistency ||
    tests.dragLive ||
    tests.edgeCount ||
    tests.nodeTypeLabels ||
    tests.externalDistribution ||
    tests.noOrphanNodes ||
    tests.noFaceHugging ||
    tests.orthogonalSegments;
  const needsEdges =
    tests.passthrough ||
    tests.faceConnect ||
    tests.faceConnectEdit ||
    tests.labelStability ||
    tests.drag ||
    tests.dragEdgeFace ||
    tests.dragEdgeVisible ||
    tests.dragFaceConsistency ||
    tests.dragLive ||
    tests.edgeCount ||
    tests.noFaceHugging ||
    tests.orthogonalSegments;

  test.describe(suiteName, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(url);
      if (needsNodes) {
        await page.waitForSelector('.react-flow__node', {
          state: 'attached',
          timeout: 12_000,
        });
      }
      if (needsEdges) {
        await page.waitForSelector('.react-flow__edge', {
          state: 'attached',
          timeout: 6_000,
        });
      }
      if (needsNodes || needsEdges) await page.waitForTimeout(300);
      else await page.waitForTimeout(1_000);
    });

    // ── screenshot (always) ───────────────────────────────────────────────────

    test('screenshot: view and edit mode', async ({ page }) => {
      await shot(page, `${prefix}-01-view`);
      if (needsNodes) {
        await enterEditMode(page);
        await shot(page, `${prefix}-02-edit`);
      }
    });

    // ── render check ─────────────────────────────────────────────────────────

    if (tests.render) {
      test('renders with nodes', async ({ page }) => {
        const nodeCount = await page
          .locator('.react-flow__node:not(.react-flow__node-boundary)')
          .count();
        expect(
          nodeCount,
          'should have ≥ 1 non-boundary node',
        ).toBeGreaterThanOrEqual(1);
      });
    }

    // ── edit mode handles ─────────────────────────────────────────────────────

    if (tests.handles) {
      test('edit mode: handles visible on non-boundary nodes', async ({
        page,
      }) => {
        await enterEditMode(page);
        await shot(page, `${prefix}-05-edit-handles`);

        // Dynamic handles use exact ELK port positions (id like 's-right-0.333').
        // Only check that source and target handles exist — not specific face-center IDs.
        const srcHandles = await page.locator('[data-handleid^="s-"]').count();
        const tgtHandles = await page.locator('[data-handleid^="t-"]').count();
        expect(
          srcHandles,
          'source handles should exist in edit mode',
        ).toBeGreaterThan(0);
        expect(
          tgtHandles,
          'target handles should exist in edit mode',
        ).toBeGreaterThan(0);
      });
    }

    // ── no edge passthrough ───────────────────────────────────────────────────

    if (tests.passthrough) {
      test('no edge passes through an unrelated node', async ({ page }) => {
        await shot(page, `${prefix}-03-passthrough-check`);

        const nodes = await readNodeRects(page);
        const edges = await readEdgePaths(page);

        // Log layout context — available in Playwright's output when this test fails.
        for (const n of nodes)
          console.log(
            `[passthrough] node ${n.id}: x=${n.x.toFixed(0)} y=${n.y.toFixed(
              0,
            )} w=${n.w} h=${n.h}`,
          );
        for (const edge of edges)
          console.log(
            `[passthrough] edge ${edge.id}: ${edge.pts
              .map(p => `(${p.x.toFixed(1)},${p.y.toFixed(1)})`)
              .join('→')}`,
          );

        const violations: string[] = [];

        for (const edge of edges) {
          const sep = edge.id.indexOf('→');
          const srcId = sep !== -1 ? edge.id.slice(0, sep) : '';
          const tgtId = sep !== -1 ? edge.id.slice(sep + 1) : '';

          const lastSeg = edge.pts.length - 2;
          for (let i = 0; i + 1 < edge.pts.length; i++) {
            const a = edge.pts[i],
              b = edge.pts[i + 1];
            for (const node of nodes) {
              // Source: always skip (exit segment starts inside source).
              if (node.id === srcId) continue;
              // Target: skip only the last segment (endpoint approach).
              // Non-last segments must not pass through the target's interior.
              if (node.id === tgtId && i === lastSeg) continue;
              if (segmentPassesThroughRect(a, b, node)) {
                violations.push(
                  `Edge "${edge.id}" passes through "${node.id}" ` +
                    `(${a.x.toFixed(0)},${a.y.toFixed(0)})→(${b.x.toFixed(
                      0,
                    )},${b.y.toFixed(0)})`,
                );
              }
            }
          }
        }

        if (violations.length > 0)
          console.log('Passthrough violations:\n' + violations.join('\n'));
        expect(
          violations,
          'edges must not pass through unrelated nodes',
        ).toHaveLength(0);
      });
    }

    // ── edge endpoints on node faces ──────────────────────────────────────────

    if (tests.faceConnect) {
      test('edge endpoints connect to node faces', async ({ page }) => {
        await shot(page, `${prefix}-04-face-connect`);

        const nodes = await readNodeRects(page);
        const edges = await readEdgeEndpoints(page);
        const nodeById = new Map(nodes.map(n => [n.id, n]));

        // Log layout context — available in Playwright's output when this test fails.
        for (const n of nodes)
          console.log(
            `[face-connect] node ${n.id}: x=${n.x.toFixed(0)} y=${n.y.toFixed(
              0,
            )} w=${n.w} h=${n.h}`,
          );
        for (const e of edges)
          console.log(
            `[face-connect] edge ${e.id}: start=(${e.start.x.toFixed(
              1,
            )},${e.start.y.toFixed(1)}) end=(${e.end.x.toFixed(
              1,
            )},${e.end.y.toFixed(1)})`,
          );

        let checked = 0;
        let hits = 0;

        for (const edge of edges) {
          const sep = edge.id.indexOf('→');
          if (sep === -1) continue;
          const srcNode = nodeById.get(edge.id.slice(0, sep));
          const tgtNode = nodeById.get(edge.id.slice(sep + 1));
          if (!srcNode || !tgtNode) continue;

          checked++;
          const onSrc = isOnNodeFace(edge.start, srcNode);
          const onTgt = isOnNodeFace(edge.end, tgtNode);
          if (onSrc && onTgt) {
            hits++;
          } else {
            console.log(
              `FACE MISS ${edge.id}: ` +
                `start=${JSON.stringify(edge.start)} onSrc=${onSrc} src(x=${
                  srcNode.x
                },y=${srcNode.y},w=${srcNode.w},h=${srcNode.h}) | ` +
                `end=${JSON.stringify(edge.end)} onTgt=${onTgt} tgt(x=${
                  tgtNode.x
                },y=${tgtNode.y},w=${tgtNode.w},h=${tgtNode.h})`,
            );
          }
        }

        expect(checked, 'should have ≥ 1 resolved edge').toBeGreaterThanOrEqual(
          1,
        );
        expect(
          hits,
          `all edge endpoints should be on node faces (${hits}/${checked})`,
        ).toEqual(checked);
      });
    }

    // ── edit mode: edge endpoints unchanged (no drag) ─────────────────────────

    if (tests.faceConnectEdit) {
      test('edit mode: edge endpoints unchanged before drag', async ({
        page,
      }) => {
        // Capture view mode endpoints before entering edit mode.
        const viewEdges = await readEdgeEndpoints(page);

        await enterEditMode(page);
        await shot(page, `${prefix}-06-face-connect-edit`);

        const editEdges = await readEdgeEndpoints(page);
        const nodes = await readNodeRects(page);
        const nodeById = new Map(nodes.map(n => [n.id, n]));

        // Build lookup by edge id for quick comparison.
        const viewById = new Map(viewEdges.map(e => [e.id, e]));

        let checked = 0;
        let onFace = 0;
        let consistent = 0;

        for (const editEdge of editEdges) {
          const sep = editEdge.id.indexOf('→');
          if (sep === -1) continue;
          const srcNode = nodeById.get(editEdge.id.slice(0, sep));
          const tgtNode = nodeById.get(editEdge.id.slice(sep + 1));
          if (!srcNode || !tgtNode) continue;

          checked++;

          // Endpoints must still land on node faces in edit mode.
          if (
            isOnNodeFace(editEdge.start, srcNode) &&
            isOnNodeFace(editEdge.end, tgtNode)
          )
            onFace++;

          // Endpoints must not have moved from view mode (no drag happened).
          const viewEdge = viewById.get(editEdge.id);
          if (viewEdge) {
            const startMoved =
              Math.abs(editEdge.start.x - viewEdge.start.x) > 2 ||
              Math.abs(editEdge.start.y - viewEdge.start.y) > 2;
            const endMoved =
              Math.abs(editEdge.end.x - viewEdge.end.x) > 2 ||
              Math.abs(editEdge.end.y - viewEdge.end.y) > 2;
            if (!startMoved && !endMoved) consistent++;
          }
        }

        expect(
          checked,
          'should have ≥ 1 resolved edge in edit mode',
        ).toBeGreaterThanOrEqual(1);
        expect(
          onFace,
          `edit mode: all edge endpoints should be on node faces (${onFace}/${checked})`,
        ).toEqual(checked);
        expect(
          consistent,
          `edit mode: edge endpoints should not move before any drag (${consistent}/${checked})`,
        ).toEqual(checked);
      });
    }

    // ── label stability ───────────────────────────────────────────────────────

    if (tests.labelStability) {
      test('edit mode: edge labels do not jump', async ({ page }) => {
        const viewLabels = await readLabelPositions(page);
        if (viewLabels.length === 0) return; // no labels — vacuously passing

        await shot(page, `${prefix}-07-labels-view`);
        await enterEditMode(page);
        await shot(page, `${prefix}-08-labels-edit`);

        const editLabels = await readLabelPositions(page);
        for (const vl of viewLabels) {
          const el = editLabels.find(l => l.text === vl.text);
          if (!el) continue;
          expect(
            Math.abs(el.x - vl.x),
            `label "${vl.text}" jumped horizontally`,
          ).toBeLessThanOrEqual(2);
          expect(
            Math.abs(el.y - vl.y),
            `label "${vl.text}" jumped vertically`,
          ).toBeLessThanOrEqual(2);
        }
      });
    }

    // ── drag: edges update after node move ────────────────────────────────────

    if (tests.drag) {
      test('drag: edges reconnect after dragging a node', async ({ page }) => {
        await enterEditMode(page);
        const edgesBefore = await readEdgeEndpoints(page);

        const draggable = page
          .locator(
            '.react-flow__node.react-flow__node-internal, .react-flow__node.react-flow__node-external',
          )
          .first();
        const nodeId = await draggable.getAttribute('data-id');
        const box = await draggable.boundingBox();
        if (!box || !nodeId) return;

        await shot(page, `${prefix}-09-before-drag`);

        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;
        await page.mouse.move(cx, cy);
        await page.mouse.down();
        await page.mouse.move(cx + 120, cy, { steps: 8 });
        await page.mouse.up();
        await page.waitForTimeout(400);

        await shot(page, `${prefix}-10-after-drag`);

        const edgesAfter = await readEdgeEndpoints(page);
        const before = edgesBefore.filter(e => e.id.includes(nodeId));
        const after = edgesAfter.filter(e => e.id.includes(nodeId));

        if (before.length > 0 && after.length > 0) {
          const pathChanged = before.some((eb, i) => {
            const ea = after[i];
            return (
              ea &&
              (Math.abs(ea.start.x - eb.start.x) > 2 ||
                Math.abs(ea.end.x - eb.end.x) > 2)
            );
          });
          expect(pathChanged, 'edge paths should update after drag').toBe(true);
        }
      });
    }

    // ── drag: edge endpoints on NEW node face ─────────────────────────────────

    if (tests.dragEdgeFace) {
      test('drag: edge endpoints land on new node face after drag', async ({
        page,
      }) => {
        await enterEditMode(page);

        const nodeRects = await readNodeRects(page);
        const edgesBefore = await readEdgeEndpoints(page);

        // Find a draggable node that has at least one connected edge.
        let targetId: string | null = null;
        for (const n of nodeRects) {
          const connected = edgesBefore.filter(e => {
            const sep = e.id.indexOf('→');
            return (
              sep !== -1 &&
              (e.id.slice(0, sep) === n.id || e.id.slice(sep + 1) === n.id)
            );
          });
          if (connected.length > 0) {
            targetId = n.id;
            break;
          }
        }
        if (!targetId) return;

        const nodeEl = page.locator(`.react-flow__node[data-id="${targetId}"]`);
        const box = await nodeEl.boundingBox();
        if (!box) return;

        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;
        await page.mouse.move(cx, cy);
        await page.mouse.down();
        await page.mouse.move(cx + 120, cy, { steps: 8 });
        await page.mouse.up();
        await page.waitForTimeout(400);

        const newNodes = await readNodeRects(page);
        const newEdges = await readEdgeEndpoints(page);
        const newNodeById = new Map(newNodes.map(n => [n.id, n]));

        let checked = 0;
        let onFace = 0;
        for (const edge of newEdges) {
          const sep = edge.id.indexOf('→');
          if (sep === -1) continue;
          const srcId = edge.id.slice(0, sep);
          const tgtId = edge.id.slice(sep + 1);
          if (srcId !== targetId && tgtId !== targetId) continue;
          const srcNode = newNodeById.get(srcId);
          const tgtNode = newNodeById.get(tgtId);
          if (!srcNode || !tgtNode) continue;
          checked++;
          if (
            isOnNodeFace(edge.start, srcNode) &&
            isOnNodeFace(edge.end, tgtNode)
          )
            onFace++;
        }

        if (checked === 0) return;
        expect(
          onFace,
          `after drag, edge endpoints should be on new node faces (${onFace}/${checked})`,
        ).toEqual(checked);
      });
    }

    // ── drag: edges stay visible ──────────────────────────────────────────────

    if (tests.dragEdgeVisible) {
      test('drag: edges stay visible during and after drag', async ({
        page,
      }) => {
        await enterEditMode(page);

        const edgeCountBefore = await page.locator('.react-flow__edge').count();
        if (edgeCountBefore === 0) return;

        const draggable = page
          .locator(
            '.react-flow__node.react-flow__node-internal, .react-flow__node.react-flow__node-external',
          )
          .first();
        const box = await draggable.boundingBox();
        if (!box) return;

        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;
        await page.mouse.move(cx, cy);
        await page.mouse.down();
        await page.mouse.move(cx + 60, cy, { steps: 4 });

        const edgesDuring = await page.locator('.react-flow__edge').count();

        await page.mouse.move(cx + 120, cy, { steps: 4 });
        await page.mouse.up();
        await page.waitForTimeout(400);

        const edgesAfter = await page.locator('.react-flow__edge').count();

        expect(
          edgesDuring,
          'edge count should not drop during drag',
        ).toBeGreaterThanOrEqual(edgeCountBefore);
        expect(
          edgesAfter,
          'edge count should not drop after drag-stop',
        ).toEqual(edgeCountBefore);
      });
    }

    // ── drag: handles remain on dragged node ──────────────────────────────────

    if (tests.dragHandles) {
      test('drag: handles remain on dragged node after drag', async ({
        page,
      }) => {
        await enterEditMode(page);

        const draggable = page
          .locator(
            '.react-flow__node.react-flow__node-internal, .react-flow__node.react-flow__node-external',
          )
          .first();
        const nodeId = await draggable.getAttribute('data-id');
        const box = await draggable.boundingBox();
        if (!box || !nodeId) return;

        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;
        await page.mouse.move(cx, cy);
        await page.mouse.down();
        await page.mouse.move(cx + 120, cy, { steps: 8 });
        await page.mouse.up();
        await page.waitForTimeout(400);

        const handles = await page
          .locator(`.react-flow__node[data-id="${nodeId}"] [data-handleid]`)
          .count();
        expect(
          handles,
          'dragged node should retain handles after drag',
        ).toBeGreaterThan(0);
      });
    }

    // ── drag: both edit and view mode edges land on node faces after drag ───────

    if (tests.dragFaceConsistency) {
      test('drag: edge endpoints on faces in both edit and view mode after drag', async ({
        page,
      }) => {
        await enterEditMode(page);

        const draggable = page
          .locator(
            '.react-flow__node.react-flow__node-internal, .react-flow__node.react-flow__node-external',
          )
          .first();
        const box = await draggable.boundingBox();
        if (!box) return;

        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;
        await page.mouse.move(cx, cy);
        await page.mouse.down();
        await page.mouse.move(cx + 120, cy, { steps: 8 });
        await page.mouse.up();
        await page.waitForTimeout(400);

        // Edit mode: endpoints on node faces?
        const editEdges = await readEdgeEndpoints(page);
        const editNodes = await readNodeRects(page);
        const editNodeById = new Map(editNodes.map(n => [n.id, n]));

        let total = 0;
        let editOnFace = 0;
        for (const ee of editEdges) {
          const sep = ee.id.indexOf('→');
          if (sep === -1) continue;
          const src = editNodeById.get(ee.id.slice(0, sep));
          const tgt = editNodeById.get(ee.id.slice(sep + 1));
          if (!src || !tgt) continue;
          total++;
          if (isOnNodeFace(ee.start, src) && isOnNodeFace(ee.end, tgt))
            editOnFace++;
        }

        // Exit to view mode and repeat.
        await page.click('[title="Cancel"]');
        await page.waitForTimeout(300);

        const viewEdges = await readEdgeEndpoints(page);
        const viewNodes = await readNodeRects(page);
        const viewNodeById = new Map(viewNodes.map(n => [n.id, n]));

        let viewOnFace = 0;
        for (const ve of viewEdges) {
          const sep = ve.id.indexOf('→');
          if (sep === -1) continue;
          const src = viewNodeById.get(ve.id.slice(0, sep));
          const tgt = viewNodeById.get(ve.id.slice(sep + 1));
          if (!src || !tgt) continue;
          if (isOnNodeFace(ve.start, src) && isOnNodeFace(ve.end, tgt))
            viewOnFace++;
        }

        if (total === 0) return;
        expect(
          editOnFace,
          `edit mode after drag: edge endpoints should be on node faces (${editOnFace}/${total})`,
        ).toEqual(total);
        expect(
          viewOnFace,
          `view mode after drag+cancel: edge endpoints should be on node faces (${viewOnFace}/${total})`,
        ).toEqual(total);
      });
    }

    // ── drag: edges track node in real-time (mid-drag, mouse still down) ─────

    if (tests.dragLive) {
      test('drag: edge endpoints track node position during drag', async ({
        page,
      }) => {
        await enterEditMode(page);

        // Find a node that has at least one connected edge.
        const nodeRects = await readNodeRects(page);
        const initialEdges = await readEdgeEndpoints(page);

        let targetId: string | null = null;
        for (const n of nodeRects) {
          const connected = initialEdges.filter(e => {
            const sep = e.id.indexOf('→');
            return (
              sep !== -1 &&
              (e.id.slice(0, sep) === n.id || e.id.slice(sep + 1) === n.id)
            );
          });
          if (connected.length > 0) {
            targetId = n.id;
            break;
          }
        }
        if (!targetId) return;

        const nodeEl = page.locator(`.react-flow__node[data-id="${targetId}"]`);
        const box = await nodeEl.boundingBox();
        if (!box) return;

        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;
        await page.mouse.move(cx, cy);
        await page.mouse.down();
        // Move 80px and pause — do NOT release yet.
        await page.mouse.move(cx + 80, cy, { steps: 8 });
        await page.waitForTimeout(80);

        // Read mid-drag endpoints (mouse still held down).
        const midEdges = await readEdgeEndpoints(page);

        await page.mouse.move(cx + 120, cy, { steps: 4 });
        await page.mouse.up();

        const before = initialEdges.filter(e => {
          const sep = e.id.indexOf('→');
          return (
            sep !== -1 &&
            (e.id.slice(0, sep) === targetId ||
              e.id.slice(sep + 1) === targetId)
          );
        });
        const during = midEdges.filter(e => {
          const sep = e.id.indexOf('→');
          return (
            sep !== -1 &&
            (e.id.slice(0, sep) === targetId ||
              e.id.slice(sep + 1) === targetId)
          );
        });

        if (before.length === 0 || during.length === 0) return;

        // At least one endpoint on one connected edge should have moved.
        let anyMoved = false;
        for (const eb of before) {
          const ed = during.find(e => e.id === eb.id);
          if (!ed) continue;
          const moved =
            Math.abs(ed.start.x - eb.start.x) +
              Math.abs(ed.start.y - eb.start.y) >
              10 ||
            Math.abs(ed.end.x - eb.end.x) + Math.abs(ed.end.y - eb.end.y) > 10;
          if (moved) {
            anyMoved = true;
            break;
          }
        }

        expect(
          anyMoved,
          'edge endpoints should track the dragged node in real-time (mid-drag)',
        ).toBe(true);
      });
    }

    // ── edge count: external node edges exist ─────────────────────────────────

    if (tests.edgeCount) {
      test('all edges rendered (external nodes have connections)', async ({
        page,
      }) => {
        const nodeCount = await page
          .locator('.react-flow__node:not(.react-flow__node-boundary)')
          .count();
        if (nodeCount <= 1) return;
        const edgeCount = await page.locator('.react-flow__edge').count();
        expect(
          edgeCount,
          'diagram with multiple nodes should render at least one edge',
        ).toBeGreaterThan(0);
      });
    }

    // ── node type labels: [System] / [Container: tech] / etc. ─────────────────

    if (tests.nodeTypeLabels) {
      test('nodes display C4 type labels', async ({ page }) => {
        // Each non-boundary node should have a type tag rendered as italic text.
        // The TECH div renders as font-style:italic containing e.g. "[System]".
        const typeTagCount = await page
          .locator(
            '.react-flow__node:not(.react-flow__node-boundary) [style*="italic"]',
          )
          .count();
        expect(
          typeTagCount,
          'nodes should show C4 type labels like [System] or [Container: tech]',
        ).toBeGreaterThan(0);
      });
    }

    // ── external distribution: nodes spread in 2D not stacked ─────────────────

    if (tests.externalDistribution) {
      test('external nodes distributed across multiple faces', async ({
        page,
      }) => {
        const nodes = await readNodeRects(page);
        if (nodes.length < 3) return;

        const xs = nodes.map(n => n.x);
        const ys = nodes.map(n => n.y);
        const xRange = Math.max(...xs) - Math.min(...xs);
        const yRange = Math.max(...ys) - Math.min(...ys);

        // Both x and y spreads must be significant — nodes must not all be
        // stacked in a single column (xRange large, yRange ≈ 0) or single row.
        const minSpread = Math.min(xRange, yRange);
        expect(
          minSpread,
          `nodes should be distributed in 2D (x-range=${xRange.toFixed(
            0,
          )}, y-range=${yRange.toFixed(0)})`,
        ).toBeGreaterThan(150);
      });
    }

    // ── no orphan nodes ───────────────────────────────────────────────────────

    if (tests.noOrphanNodes) {
      test('all nodes placed by ELK (none at 0,0)', async ({ page }) => {
        const nodes = await readNodeRects(page);
        const unplaced = nodes.filter(n => n.x === 0 && n.y === 0);
        expect(
          unplaced.map(n => n.id),
          'no node should be stuck at origin',
        ).toHaveLength(0);
      });
    }

    // ── no face-hugging: edges must not run along face of unrelated node ───────

    if (tests.noFaceHugging) {
      test('no edge segment hugs face of unrelated node or boundary', async ({
        page,
      }) => {
        await shot(page, `${prefix}-11-face-hug-check`);

        const { nodes, boundaries } = await readAllNodeRects(page);
        const edges = await readEdgePaths(page);

        // Log layout context — available in Playwright's output when this test fails.
        for (const b of boundaries)
          console.log(
            `[face-hug] boundary ${b.id}: x=${b.x.toFixed(0)} y=${b.y.toFixed(
              0,
            )} w=${b.w} h=${b.h} bot=${(b.y + b.h).toFixed(0)} right=${(
              b.x + b.w
            ).toFixed(0)}`,
          );
        for (const n of nodes)
          console.log(
            `[face-hug] node ${n.id}: x=${n.x.toFixed(0)} y=${n.y.toFixed(
              0,
            )} w=${n.w} h=${n.h}`,
          );
        for (const edge of edges)
          console.log(
            `[face-hug] edge ${edge.id}: ${edge.pts
              .map(p => `(${p.x.toFixed(1)},${p.y.toFixed(1)})`)
              .join('→')}`,
          );

        const violations: string[] = [];

        for (const edge of edges) {
          const sep = edge.id.indexOf('→');
          const srcId = sep !== -1 ? edge.id.slice(0, sep) : '';
          const tgtId = sep !== -1 ? edge.id.slice(sep + 1) : '';

          const lastSeg2 = edge.pts.length - 2;
          for (let i = 0; i + 1 < edge.pts.length; i++) {
            const a = edge.pts[i],
              b = edge.pts[i + 1];

            // Source: always skip. Target: skip only last (endpoint approach).
            // Non-last segments must not hug the target's own face either.
            for (const node of nodes) {
              if (node.id === srcId) continue;
              if (node.id === tgtId && i === lastSeg2) continue;
              if (segmentHugsNodeFace(a, b, node)) {
                violations.push(
                  `Edge "${edge.id}" seg ${i} hugs face of node "${node.id}" ` +
                    `(${a.x.toFixed(0)},${a.y.toFixed(0)})→(${b.x.toFixed(
                      0,
                    )},${b.y.toFixed(0)}) ` +
                    `node(x=${node.x.toFixed(0)},y=${node.y.toFixed(0)},w=${
                      node.w
                    },h=${node.h})`,
                );
              }
            }

            // Check against boundary walls — edges must not run along boundary faces.
            // No src/tgt exclusion: edges never have boundaries as source or target.
            // tol=12: catches edges within 12px of a boundary face (visible as hugging).
            // tol=15 would also flag edges approaching boundary from the side (e.g. connecting
            // to a node whose face happens to be 15px from a sub-boundary wall) — false positives.
            for (const bnd of boundaries) {
              if (segmentHugsNodeFace(a, b, bnd, 12)) {
                violations.push(
                  `Edge "${edge.id}" seg ${i} hugs face of boundary "${bnd.id}" ` +
                    `(${a.x.toFixed(0)},${a.y.toFixed(0)})→(${b.x.toFixed(
                      0,
                    )},${b.y.toFixed(0)}) ` +
                    `boundary(x=${bnd.x.toFixed(0)},y=${bnd.y.toFixed(0)},w=${
                      bnd.w
                    },h=${bnd.h})`,
                );
              }
            }
          }
        }

        if (violations.length > 0)
          console.log('Face-hug violations:\n' + violations.join('\n'));
        expect(
          violations,
          'edges must not run along the exterior face of an unrelated node or boundary',
        ).toHaveLength(0);
      });
    }

    // ── orthogonal segments: all edge segments must be axis-aligned ───────────

    if (tests.orthogonalSegments) {
      test('all edge segments are axis-aligned (no diagonals)', async ({
        page,
      }) => {
        const edges = await readEdgePaths(page);
        const violations: string[] = [];

        for (const edge of edges) {
          for (let i = 0; i + 1 < edge.pts.length; i++) {
            const a = edge.pts[i],
              b = edge.pts[i + 1];
            const dx = Math.abs(b.x - a.x);
            const dy = Math.abs(b.y - a.y);
            // A segment is diagonal if both dx and dy are non-trivial (> 2px).
            if (dx > 2 && dy > 2) {
              violations.push(
                `Edge "${edge.id}" seg ${i}: diagonal ` +
                  `(${a.x.toFixed(1)},${a.y.toFixed(1)})→(${b.x.toFixed(
                    1,
                  )},${b.y.toFixed(1)}) ` +
                  `dx=${dx.toFixed(1)} dy=${dy.toFixed(1)}`,
              );
            }
          }
        }

        if (violations.length > 0)
          console.log('Diagonal segment violations:\n' + violations.join('\n'));
        expect(
          violations,
          'all edge segments must be horizontal or vertical',
        ).toHaveLength(0);
      });
    }
  });
}

// ── Shared DOM helpers ────────────────────────────────────────────────────────

async function readLabelPositions(
  page: Page,
): Promise<Array<{ text: string; x: number; y: number }>> {
  return page.evaluate(() => {
    const labels: Array<{ text: string; x: number; y: number }> = [];
    document
      .querySelectorAll('.react-flow__edge-label-renderer div')
      .forEach(el => {
        const style = (el as HTMLElement).style.transform ?? '';
        const nums = style.match(/-?[\d.]+px/g);
        if (!nums || nums.length < 2) return;
        labels.push({
          text: (el as HTMLElement).textContent?.trim() ?? '',
          x: parseFloat(nums[nums.length - 2]),
          y: parseFloat(nums[nums.length - 1]),
        });
      });
    return labels;
  });
}
