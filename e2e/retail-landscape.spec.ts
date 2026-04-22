/**
 * Visual validation for the retail domain landscape diagram.
 *
 * Run with:  npx playwright test --config e2e/playwright.config.ts retail-landscape
 */

import * as fs from 'fs';
import * as path from 'path';
import { expect, test } from '@playwright/test';

const DIAGRAM_URL = '/c4/default/domain/retail';
const OUT = path.join(__dirname, 'screenshots');

type Point = { x: number; y: number };
type NodeRect = { id: string; x: number; y: number; w: number; h: number };
type EdgePath = { id: string; pts: Point[] };

async function waitForDiagram(page: import('@playwright/test').Page) {
  await page.waitForSelector('.react-flow__node', {
    state: 'attached',
    timeout: 30_000,
  });
  await page.waitForSelector('.react-flow__edge', {
    state: 'attached',
    timeout: 30_000,
  });
  await page.waitForTimeout(800);
}

async function readNodeRects(
  page: import('@playwright/test').Page,
): Promise<NodeRect[]> {
  return page.evaluate(() => {
    function parseTranslate(el: Element) {
      const t = (el as HTMLElement).style.transform ?? '';
      const m = t.match(/translate(?:3d)?\(([-\d.]+)px,\s*([-\d.]+)px/);
      return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : { x: 0, y: 0 };
    }
    function absoluteFlowPos(el: Element) {
      let x = 0,
        y = 0;
      let cur: Element | null = el;
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
    const results: Array<{
      id: string;
      x: number;
      y: number;
      w: number;
      h: number;
    }> = [];
    document.querySelectorAll('.react-flow__node').forEach(el => {
      if (el.classList.contains('react-flow__node-boundary')) return;
      const id = (el as HTMLElement).dataset.id ?? '';
      const pos = absoluteFlowPos(el);
      const w = parseFloat((el as HTMLElement).style.width) || 180;
      const h = parseFloat((el as HTMLElement).style.height) || 100;
      results.push({ id, x: pos.x, y: pos.y, w, h });
    });
    return results;
  });
}

async function readEdgePaths(
  page: import('@playwright/test').Page,
): Promise<EdgePath[]> {
  return page.evaluate(() => {
    const results: Array<{ id: string; pts: Array<{ x: number; y: number }> }> =
      [];
    document.querySelectorAll('.react-flow__edge').forEach(edge => {
      const id = (edge as HTMLElement).dataset.id ?? '';
      const pathEl = edge.querySelector('path.react-flow__edge-path');
      if (!pathEl) return;
      const d = pathEl.getAttribute('d') ?? '';
      const nums = [...d.matchAll(/-?[\d.]+/g)].map(m => parseFloat(m[0]));
      const pts: Array<{ x: number; y: number }> = [];
      for (let i = 0; i + 1 < nums.length; i += 2)
        pts.push({ x: nums[i], y: nums[i + 1] });
      results.push({ id, pts });
    });
    return results;
  });
}

/** True if point p is inside (or within tolerance of) rect r. */
function pointInRect(p: Point, r: NodeRect, tolerance = 5): boolean {
  return (
    p.x >= r.x - tolerance &&
    p.x <= r.x + r.w + tolerance &&
    p.y >= r.y - tolerance &&
    p.y <= r.y + r.h + tolerance
  );
}

/** True if line segment (a→b) passes through rect r (excluding start/end node). */
function segmentPassesThroughRect(
  a: Point,
  b: Point,
  r: NodeRect,
  tolerance = 5,
): boolean {
  // Sample points along the segment and check if any interior point is inside rect
  const steps = 20;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const p = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
    if (pointInRect(p, r, tolerance)) return true;
  }
  return false;
}

test.beforeEach(async ({ page }) => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  await page.goto(DIAGRAM_URL);
  await waitForDiagram(page);
});

test('retail: capture view and edit screenshots', async ({ page }) => {
  await page.screenshot({ path: path.join(OUT, 'retail-01-view.png') });
  await page.click('[title="Edit Layout"]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, 'retail-02-edit.png') });
});

test('retail: no edge passes through a node it is not connected to', async ({
  page,
}) => {
  await page.screenshot({
    path: path.join(OUT, 'retail-03-edge-passthrough-check.png'),
  });

  const nodes = await readNodeRects(page);
  const edges = await readEdgePaths(page);

  const violations: string[] = [];

  for (const edge of edges) {
    // Identify the source and target node ids from the edge id (format: "srcId→tgtId")
    const sep = edge.id.indexOf('→');
    const srcId = sep !== -1 ? edge.id.slice(0, sep) : '';
    const tgtId = sep !== -1 ? edge.id.slice(sep + 1) : '';

    const pts = edge.pts;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i],
        b = pts[i + 1];
      for (const node of nodes) {
        // Skip source and target nodes — the edge is allowed to touch them
        if (node.id === srcId || node.id === tgtId) continue;
        if (segmentPassesThroughRect(a, b, node)) {
          violations.push(
            `Edge "${edge.id}" segment (${a.x.toFixed(0)},${a.y.toFixed(
              0,
            )})→(${b.x.toFixed(0)},${b.y.toFixed(0)}) passes through node "${
              node.id
            }"`,
          );
        }
      }
    }
  }

  if (violations.length > 0) {
    console.log('Edge passthrough violations:\n' + violations.join('\n'));
  }
  expect(violations, 'Some edges pass through unrelated nodes').toHaveLength(0);
});
