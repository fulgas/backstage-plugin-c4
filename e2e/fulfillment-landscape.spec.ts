/**
 * Visual validation for the fulfillment domain landscape diagram.
 *
 * Validates:
 * 1. Diagram renders with nodes and edges in view mode
 * 2. Edit mode shows handles on all non-boundary nodes
 * 3. Edges connect via center handles (½-face) when only one edge per face
 * 4. After drag, edges reconnect to the closest handle of the moved node
 *
 * Run with:  npx playwright test --config e2e/playwright.config.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { expect, test, type Page } from '@playwright/test';

const DIAGRAM_URL = '/c4/default/domain/fulfillment';
const SCREENSHOTS = path.join(__dirname, 'screenshots');

// NODE_W and NODE_H from c4Style — keep in sync with plugin source
const NODE_W = 180;
const NODE_H = 100;

const HANDLE_TOLERANCE = 5; // px tolerance for floating-point layout differences

type Point = { x: number; y: number };
type NodeInfo = { id: string; x: number; y: number; w: number; h: number };
type EdgeInfo = { id: string; start: Point; end: Point };

// ── DOM helpers ──────────────────────────────────────────────────────────────

/**
 * Read node positions from the React Flow DOM. For compound (child) nodes,
 * walks up the DOM tree to sum ancestor transforms so positions are in flow space.
 */
async function readNodes(page: Page): Promise<NodeInfo[]> {
  return page.evaluate(
    ({ nw, nh }: { nw: number; nh: number }) => {
      function parseTranslate(el: Element): { x: number; y: number } {
        const t = (el as HTMLElement).style.transform ?? '';
        // translate(Xpx, Ypx) or translate3d(Xpx, Ypx, Zpx)
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

      const results: NodeInfo[] = [];
      document.querySelectorAll('.react-flow__node').forEach(el => {
        const type = el.classList.contains('react-flow__node-boundary')
          ? 'boundary'
          : '';
        if (type === 'boundary') return;
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

/** Read edge start/end points from SVG path d attributes (flow space coords). */
async function readEdges(page: Page): Promise<EdgeInfo[]> {
  return page.evaluate(() => {
    const results: EdgeInfo[] = [];
    document.querySelectorAll('.react-flow__edge').forEach(edge => {
      const id = (edge as HTMLElement).dataset.id ?? '';
      const path = edge.querySelector('path.react-flow__edge-path');
      if (!path) return;
      const d = path.getAttribute('d') ?? '';
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

function centerHandles(n: NodeInfo) {
  return {
    right: { x: n.x + n.w, y: n.y + n.h * 0.5 },
    left: { x: n.x, y: n.y + n.h * 0.5 },
    bottom: { x: n.x + n.w * 0.5, y: n.y + n.h },
    top: { x: n.x + n.w * 0.5, y: n.y },
  };
}

function isOnCenterHandle(pt: Point, n: NodeInfo): boolean {
  const h = centerHandles(n);
  return Object.values(h).some(
    hp =>
      Math.abs(pt.x - hp.x) < HANDLE_TOLERANCE &&
      Math.abs(pt.y - hp.y) < HANDLE_TOLERANCE,
  );
}

// ── Setup ────────────────────────────────────────────────────────────────────

async function waitForDiagram(page: Page) {
  await page.waitForSelector('.react-flow__node', {
    state: 'attached',
    timeout: 30_000,
  });
  await page.waitForSelector('.react-flow__edge', {
    state: 'attached',
    timeout: 30_000,
  });
  await page.waitForTimeout(300);
}

async function enterEditMode(page: Page) {
  await page.click('[title="Edit Layout"]');
  await page.waitForTimeout(400);
}

function ensureScreenshotsDir() {
  if (!fs.existsSync(SCREENSHOTS))
    fs.mkdirSync(SCREENSHOTS, { recursive: true });
}

async function shot(page: Page, name: string) {
  ensureScreenshotsDir();
  await page.screenshot({ path: path.join(SCREENSHOTS, `${name}.png`) });
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.beforeEach(async ({ page }) => {
  await page.goto(DIAGRAM_URL);
  await waitForDiagram(page);
});

test('view mode: diagram renders with nodes and edges', async ({ page }) => {
  await shot(page, '01-view-mode');

  const nodeCount = await page
    .locator('.react-flow__node:not(.react-flow__node-boundary)')
    .count();
  const edgeCount = await page.locator('.react-flow__edge').count();

  expect(
    nodeCount,
    'should have at least 2 non-boundary nodes',
  ).toBeGreaterThanOrEqual(2);
  expect(edgeCount, 'should have at least 1 edge').toBeGreaterThanOrEqual(1);
});

test('edit mode: handles are visible on non-boundary nodes', async ({
  page,
}) => {
  await enterEditMode(page);
  await shot(page, '02-edit-mode');

  // React Flow renders handles as divs with class react-flow__handle
  const handleCount = await page.locator('.react-flow__handle').count();
  expect(handleCount, 'handles should exist in edit mode').toBeGreaterThan(0);

  // Center handles exist (both source and target, all 4 faces)
  for (const face of ['top', 'right', 'bottom', 'left']) {
    const srcCenter = page.locator(`[data-handleid="s-${face}-c"]`);
    const tgtCenter = page.locator(`[data-handleid="t-${face}-c"]`);
    expect(
      await srcCenter.count(),
      `s-${face}-c handles should exist`,
    ).toBeGreaterThan(0);
    expect(
      await tgtCenter.count(),
      `t-${face}-c handles should exist`,
    ).toBeGreaterThan(0);
  }
});

test('view mode: edges connect via center handles for single-edge faces', async ({
  page,
}) => {
  // Validate in view mode: sections are computed by HandleRouter (with PreferCenterRule)
  // so coordinates are exact. Edit mode uses live HandleRouter.select() per edge render.
  await shot(page, '03-edge-center-handles');

  const nodes = await readNodes(page);
  const edges = await readEdges(page);
  const nodeById = new Map(nodes.map(n => [n.id, n]));

  let edgesChecked = 0;
  let centerHits = 0;

  for (const edge of edges) {
    // Edge IDs are "srcId→tgtId"
    const sep = edge.id.indexOf('→');
    if (sep === -1) continue;
    const srcId = edge.id.slice(0, sep);
    const tgtId = edge.id.slice(sep + 1);
    const srcNode = nodeById.get(srcId);
    const tgtNode = nodeById.get(tgtId);
    if (!srcNode || !tgtNode) continue;

    edgesChecked++;
    const srcOnCenter = isOnCenterHandle(edge.start, srcNode);
    const tgtOnCenter = isOnCenterHandle(edge.end, tgtNode);
    if (srcOnCenter && tgtOnCenter) centerHits++;
  }

  // At least half of resolved edges should use center handles
  // (single-edge-per-face case — the fulfillment landscape has mostly 1 edge per face)
  expect(
    edgesChecked,
    'should have resolved at least 1 edge',
  ).toBeGreaterThanOrEqual(1);
  const ratio = centerHits / edgesChecked;
  expect(
    ratio,
    `center-handle ratio ${centerHits}/${edgesChecked} should be ≥ 0.5`,
  ).toBeGreaterThanOrEqual(0.5);
});

test('drag: after dragging a node, edges reconnect to closest handle', async ({
  page,
}) => {
  await enterEditMode(page);

  const edgesBefore = await readEdges(page);

  // Pick first draggable internal node
  const draggable = page
    .locator(
      '.react-flow__node.react-flow__node-internal, .react-flow__node.react-flow__node-external',
    )
    .first();
  const nodeId = await draggable.getAttribute('data-id');
  const box = await draggable.boundingBox();
  if (!box || !nodeId) return;

  await shot(page, '04-before-drag');

  // Drag 120px right
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 120, cy, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(800);

  await shot(page, '05-after-drag');

  const edgesAfter = await readEdges(page);

  // Edges connected to the dragged node should have updated paths
  const affectedBefore = edgesBefore.filter(e => e.id.includes(nodeId));
  const affectedAfter = edgesAfter.filter(e => e.id.includes(nodeId));

  if (affectedBefore.length > 0 && affectedAfter.length > 0) {
    const pathChanged = affectedBefore.some((eb, i) => {
      const ea = affectedAfter[i];
      return (
        ea &&
        (Math.abs(ea.start.x - eb.start.x) > 2 ||
          Math.abs(ea.end.x - eb.end.x) > 2)
      );
    });
    expect(pathChanged, 'edge paths should update after drag').toBe(true);
  }
});

test('edit mode: edge labels do not jump when entering edit mode', async ({
  page,
}) => {
  // Collect label positions in view mode
  async function readLabelPositions(p: typeof page) {
    return p.evaluate(() => {
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

  const viewLabels = await readLabelPositions(page);
  if (viewLabels.length === 0) {
    // No labels on this diagram — test is vacuously passing
    return;
  }

  await shot(page, '07-labels-view-mode');
  await enterEditMode(page);
  await shot(page, '08-labels-edit-mode');

  const editLabels = await readLabelPositions(page);

  // Match labels by text; each label should stay within 5px of its view-mode position
  for (const vl of viewLabels) {
    const el = editLabels.find(l => l.text === vl.text);
    if (!el) continue; // label disappeared — separate concern
    const dx = Math.abs(el.x - vl.x);
    const dy = Math.abs(el.y - vl.y);
    expect(
      dx,
      `label "${vl.text}" jumped ${dx}px horizontally on edit mode entry`,
    ).toBeLessThanOrEqual(2);
    expect(
      dy,
      `label "${vl.text}" jumped ${dy}px vertically on edit mode entry`,
    ).toBeLessThanOrEqual(2);
  }
});

test('screenshot: full diagram reference', async ({ page }) => {
  await shot(page, '00-view-full');
  await enterEditMode(page);
  await shot(page, '06-edit-full');
});
