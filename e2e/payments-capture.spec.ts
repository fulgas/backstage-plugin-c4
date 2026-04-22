import * as fs from 'fs';
import * as path from 'path';
import { expect, test } from '@playwright/test';

const OUT = path.join(__dirname, 'screenshots');

async function readDiagramGeometry(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    // Read boundary box (the dashed boundary node)
    const boundaryEl = document.querySelector(
      '.react-flow__node-boundary',
    ) as HTMLElement | null;
    let boundary = { x: 0, y: 0, w: 0, h: 0 };
    if (boundaryEl) {
      const t = boundaryEl.style.transform ?? '';
      const m = t.match(/translate(?:3d)?\(([-\d.]+)px,\s*([-\d.]+)px/);
      boundary.x = m ? parseFloat(m[1]) : 0;
      boundary.y = m ? parseFloat(m[2]) : 0;
      boundary.w = parseFloat(boundaryEl.style.width) || 0;
      boundary.h = parseFloat(boundaryEl.style.height) || 0;
    }

    // Read all edge paths
    const edges: Array<{
      id: string;
      d: string;
      pts: Array<{ x: number; y: number }>;
    }> = [];
    document.querySelectorAll('.react-flow__edge').forEach(edge => {
      const id = (edge as HTMLElement).dataset.id ?? '';
      const pathEl = edge.querySelector('path.react-flow__edge-path');
      if (!pathEl) return;
      const d = pathEl.getAttribute('d') ?? '';
      const nums = [...d.matchAll(/-?[\d.]+/g)].map(m => parseFloat(m[0]));
      const pts: Array<{ x: number; y: number }> = [];
      for (let i = 0; i + 1 < nums.length; i += 2)
        pts.push({ x: nums[i], y: nums[i + 1] });
      edges.push({ id, d, pts });
    });

    return { boundary, edges };
  });
}

test('payments: capture view and edit mode', async ({ page }) => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

  await page.goto('/c4/default/domain/payments');
  await page.waitForSelector('.react-flow__node', {
    state: 'attached',
    timeout: 30_000,
  });
  await page.waitForSelector('.react-flow__edge', {
    state: 'attached',
    timeout: 30_000,
  });
  await page.waitForTimeout(1000);

  await page.screenshot({ path: path.join(OUT, 'payments-01-view.png') });

  const { boundary, edges } = await readDiagramGeometry(page);
  console.log('Boundary:', JSON.stringify(boundary));

  // Also read handle IDs to understand what HandleRouter selected
  const edgeHandles = await page.evaluate(() => {
    const result: any[] = [];
    document.querySelectorAll('.react-flow__edge').forEach(edge => {
      const id = (edge as HTMLElement).dataset.id ?? '';
      // React Flow renders source/target handles from props — check the edge g element attributes
      const g = edge as SVGGElement;
      result.push({
        id,
        sourceHandle: g.dataset.sourceHandleId ?? 'unknown',
        targetHandle: g.dataset.targetHandleId ?? 'unknown',
      });
    });
    return result;
  });
  console.log('Handles:', JSON.stringify(edgeHandles, null, 2));
  console.log(
    'Edges:',
    JSON.stringify(
      edges.map(e => ({ id: e.id, pts: e.pts })),
      null,
      2,
    ),
  );

  const EDGE_BOUNDARY_GAP = 20; // px — edge segments should not run within 20px of boundary face

  for (const edge of edges) {
    const pts = edge.pts;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i],
        b = pts[i + 1];
      const isVertical = Math.abs(a.x - b.x) < 1;
      const isHorizontal = Math.abs(a.y - b.y) < 1;

      if (isVertical) {
        // Check segment doesn't run along boundary right or left edge
        const minY = Math.min(a.y, b.y),
          maxY = Math.max(a.y, b.y);
        const segLen = maxY - minY;
        if (segLen > 30) {
          // only check non-trivial segments
          expect(
            Math.abs(a.x - (boundary.x + boundary.w)),
            `Edge "${edge.id}" vertical segment at x=${a.x.toFixed(
              0,
            )} runs along boundary RIGHT edge (x=${(
              boundary.x + boundary.w
            ).toFixed(0)})`,
          ).toBeGreaterThan(EDGE_BOUNDARY_GAP);
          expect(
            Math.abs(a.x - boundary.x),
            `Edge "${edge.id}" vertical segment at x=${a.x.toFixed(
              0,
            )} runs along boundary LEFT edge (x=${boundary.x.toFixed(0)})`,
          ).toBeGreaterThan(EDGE_BOUNDARY_GAP);
        }
      }

      if (isHorizontal) {
        const minX = Math.min(a.x, b.x),
          maxX = Math.max(a.x, b.x);
        const segLen = maxX - minX;
        if (segLen > 30) {
          expect(
            Math.abs(a.y - (boundary.y + boundary.h)),
            `Edge "${edge.id}" horizontal segment at y=${a.y.toFixed(
              0,
            )} runs along boundary BOTTOM edge (y=${(
              boundary.y + boundary.h
            ).toFixed(0)})`,
          ).toBeGreaterThan(EDGE_BOUNDARY_GAP);
          expect(
            Math.abs(a.y - boundary.y),
            `Edge "${edge.id}" horizontal segment at y=${a.y.toFixed(
              0,
            )} runs along boundary TOP edge (y=${boundary.y.toFixed(0)})`,
          ).toBeGreaterThan(EDGE_BOUNDARY_GAP);
        }
      }
    }
  }

  await page.click('[title="Edit Layout"]');
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, 'payments-02-edit.png') });
});
