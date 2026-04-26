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
      timeout: 20_000,
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
  await page.waitForTimeout(400);
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
 * Read node bounding boxes in React Flow canvas coordinates.
 * Walks ancestor transforms to compute absolute position for nested nodes.
 */
export async function readNodeRects(page: Page): Promise<NodeRect[]> {
  return page.evaluate(
    ({ nw, nh }) => {
      function parseTranslate(el: Element): { x: number; y: number } {
        const t = (el as HTMLElement).style.transform ?? '';
        const m = t.match(/translate(?:3d)?\(([-\d.]+)px,\s*([-\d.]+)px/);
        return m
          ? { x: parseFloat(m[1]), y: parseFloat(m[2]) }
          : { x: 0, y: 0 };
      }
      function absoluteFlowPos(nodeEl: Element): { x: number; y: number } {
        let x = 0,
          y = 0;
        let cur: Element | null = nodeEl;
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
      const results: NodeRect[] = [];
      document.querySelectorAll('.react-flow__node').forEach(el => {
        if (el.classList.contains('react-flow__node-boundary')) return;
        const id = (el as HTMLElement).dataset.id ?? '';
        const pos = absoluteFlowPos(el);
        const w = parseFloat((el as HTMLElement).style.width) || nw;
        const h = parseFloat((el as HTMLElement).style.height) || nh;
        results.push({ id, x: pos.x, y: pos.y, w, h });
      });
      return results;
    },
    { nw: NODE_W, nh: NODE_H },
  );
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
 * render           — diagram has ≥1 non-boundary node
 * handles          — edit mode shows center handles on every face
 * passthrough      — no edge segment passes through an unrelated node (view mode, ELK routing)
 * faceConnect      — every edge start/end point lands on its source/target node face (view mode)
 * faceConnectEdit  — same check in edit mode (before any drag), verifies edit mode keeps ELK routing
 * labelStability   — edge labels do not jump when entering edit mode (vacuous-pass if no labels)
 * drag             — drag a node 120px, verify connected edge paths update
 * noOrphanNodes    — no non-boundary node is stuck at position (0, 0)
 */
export interface DiagramTests {
  render?: boolean;
  handles?: boolean;
  passthrough?: boolean;
  faceConnect?: boolean;
  faceConnectEdit?: boolean;
  labelStability?: boolean;
  drag?: boolean;
  noOrphanNodes?: boolean;
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
  noOrphanNodes: true,
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
    tests.noOrphanNodes;
  const needsEdges =
    tests.passthrough ||
    tests.faceConnect ||
    tests.faceConnectEdit ||
    tests.labelStability ||
    tests.drag;

  test.describe(suiteName, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(url);
      if (needsNodes) {
        await page.waitForSelector('.react-flow__node', {
          state: 'attached',
          timeout: 20_000,
        });
      }
      if (needsEdges) {
        await page.waitForSelector('.react-flow__edge', {
          state: 'attached',
          timeout: 10_000,
        });
      }
      if (needsNodes || needsEdges) await page.waitForTimeout(300);
      else await page.waitForTimeout(2_000);
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
        const violations: string[] = [];

        for (const edge of edges) {
          const sep = edge.id.indexOf('→');
          const srcId = sep !== -1 ? edge.id.slice(0, sep) : '';
          const tgtId = sep !== -1 ? edge.id.slice(sep + 1) : '';

          for (let i = 0; i + 1 < edge.pts.length; i++) {
            const a = edge.pts[i],
              b = edge.pts[i + 1];
            for (const node of nodes) {
              if (node.id === srcId || node.id === tgtId) continue;
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

        let checked = 0;
        let hits = 0;

        for (const edge of edges) {
          const sep = edge.id.indexOf('→');
          if (sep === -1) continue;
          const srcNode = nodeById.get(edge.id.slice(0, sep));
          const tgtNode = nodeById.get(edge.id.slice(sep + 1));
          if (!srcNode || !tgtNode) continue;

          checked++;
          if (
            isOnNodeFace(edge.start, srcNode) &&
            isOnNodeFace(edge.end, tgtNode)
          )
            hits++;
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
        await page.waitForTimeout(800);

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
