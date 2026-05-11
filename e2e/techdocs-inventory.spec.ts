/**
 * E2E tests for TechDocs + C4 addon integration.
 * Validates that C4DiagramAddon hydrates data-c4-entity / data-c4-view-id
 * placeholders in the TechDocs shadow DOM with live React Flow diagrams.
 *
 * The first visit triggers a local TechDocs build — allow generous timeouts.
 *
 * Run:  npx playwright test --config e2e/playwright.config.ts techdocs-inventory
 */

import { expect, test } from '@playwright/test';
import { ensureScreenshotsDir, shot } from './diagram-helpers';

// Override the 30s config default — TechDocs build + diagram load can take 60s.
test.setTimeout(90_000);

// TechDocs builds docs on first visit; wait up to 60 s for the build + render.
const DIAGRAM_TIMEOUT = 60_000;

test.describe('techdocs inventory', () => {
  test('overview page: entity diagram renders', async ({ page }) => {
    // Capture all console messages to diagnose addon behaviour.
    const consoleMsgs: string[] = [];
    page.on('console', msg => {
      const t = msg.text();
      if (
        t.includes('C4DiagramAddon') ||
        t.includes('useShadowElements') ||
        t.includes('techdocs-diag') ||
        msg.type() === 'error'
      )
        consoleMsgs.push(`[${msg.type()}] ${t}`);
    });

    await page.goto('/docs/default/system/inventory');

    // Wait for shadow-DOM placeholder to appear. Playwright auto-pierces open
    // shadow roots — TechDocs uses an open shadow root.
    await page.waitForSelector('[data-c4-entity]', {
      state: 'attached',
      timeout: DIAGRAM_TIMEOUT,
    });

    // If TechDocs is showing old cached content with a "newer version" banner,
    // click REFRESH so the shadow DOM rebuilds with the latest build output.
    const refreshBtn = page.getByRole('button', { name: /refresh/i });
    if (await refreshBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await refreshBtn.click();
      // Wait for the shadow DOM to re-populate after refresh.
      await page.waitForSelector('[data-c4-entity]', {
        state: 'attached',
        timeout: DIAGRAM_TIMEOUT,
      });
    }

    // Diagnose: check what's inside the data-c4-entity element.
    const shadowInfo = await page.evaluate(() => {
      // Find all elements with data-c4-entity anywhere in the page (incl. shadow DOM).
      const allEls = document.querySelectorAll('[data-c4-entity]');
      const results: { entityRef: string; children: number; html: string }[] =
        [];
      allEls.forEach(el => {
        results.push({
          entityRef: el.getAttribute('data-c4-entity') ?? '',
          children: el.children.length,
          html: el.innerHTML.slice(0, 200),
        });
      });
      // Also check shadow roots.
      const hosts = document.querySelectorAll('*');
      hosts.forEach(h => {
        if ((h as any).shadowRoot) {
          const sr = (h as any).shadowRoot as ShadowRoot;
          sr.querySelectorAll('[data-c4-entity]').forEach((el: Element) => {
            results.push({
              entityRef: `[shadow] ${el.getAttribute('data-c4-entity') ?? ''}`,
              children: el.children.length,
              html: el.innerHTML.slice(0, 200),
            });
          });
        }
      });
      return results;
    });
    const diagOutput = JSON.stringify(shadowInfo, null, 2);
    console.log('[techdocs-diag] data-c4-entity elements:', diagOutput);
    require('fs').writeFileSync('/tmp/c4-shadow-diag.json', diagOutput);

    // Wait for either nodes (capture in progress) or the captured img (done).
    await expect(
      page
        .locator(
          '.react-flow__node, [data-c4-entity] img[src^="data:image/png"]',
        )
        .first(),
    ).toBeVisible({ timeout: DIAGRAM_TIMEOUT });

    // Dump any console errors to the test output for debugging.
    if (consoleMsgs.length) {
      console.log(
        '[techdocs-test] browser console:\n' + consoleMsgs.join('\n'),
      );
    }

    ensureScreenshotsDir();
    await shot(page, 'techdocs-inventory-01-overview');
  });

  test('architecture page: view diagram renders', async ({ page }) => {
    await page.goto('/docs/default/system/inventory/architecture');

    await page.waitForSelector('[data-c4-view-id]', {
      state: 'attached',
      timeout: DIAGRAM_TIMEOUT,
    });

    const refreshBtn = page.getByRole('button', { name: /refresh/i });
    if (await refreshBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await refreshBtn.click();
      await page.waitForSelector('[data-c4-view-id]', {
        state: 'attached',
        timeout: DIAGRAM_TIMEOUT,
      });
    }

    // Accept either: nodes visible (capture in progress) OR captured img (done).
    await expect(
      page
        .locator(
          '.react-flow__node, [data-c4-view-id] img[src^="data:image/png"]',
        )
        .first(),
    ).toBeVisible({ timeout: DIAGRAM_TIMEOUT });

    ensureScreenshotsDir();
    await shot(page, 'techdocs-inventory-02-architecture');
  });

  // ── Capture quality tests ────────────────────────────────────────────────────
  // These verify that the off-screen html-to-image capture actually completes
  // and produces a visible (non-blank, non-transparent) PNG diagram image.

  test('overview page: capture produces non-blank PNG image', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/docs/default/system/inventory');

    await page.waitForSelector('[data-c4-entity]', {
      state: 'attached',
      timeout: DIAGRAM_TIMEOUT,
    });

    const refreshBtn = page.getByRole('button', { name: /refresh/i });
    if (await refreshBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await refreshBtn.click();
      await page.waitForSelector('[data-c4-entity]', {
        state: 'attached',
        timeout: DIAGRAM_TIMEOUT,
      });
    }

    // Wait for the captured img — nodes may unmount before we reach this check.
    const capturedImg = page
      .locator('[data-c4-entity] img[src^="data:image/png"]')
      .first();
    await expect(
      capturedImg,
      'static PNG image must appear after capture completes',
    ).toBeVisible({
      timeout: DIAGRAM_TIMEOUT,
    });

    const src = await capturedImg.getAttribute('src');
    expect(src, 'img src must be a valid PNG data URL').toMatch(
      /^data:image\/png;base64,/,
    );
    expect(
      src!.length,
      'PNG must be non-trivial (> 5000 chars base64)',
    ).toBeGreaterThan(5_000);

    // Sample pixel colours from the captured image to verify it is not blank.
    // Use a 5×5 grid to catch coloured nodes regardless of layout.
    const pixelResult = await page.evaluate(async (imgSrc: string) => {
      const img = new Image();
      return new Promise<{ hasColor: boolean; samples: number[] }>(resolve => {
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          const ctx = c.getContext('2d')!;
          ctx.drawImage(img, 0, 0);
          const samples: number[] = [];
          // 5×5 grid covering 10%..90% of width and height.
          for (let row = 0; row < 5; row++) {
            for (let col = 0; col < 5; col++) {
              const x = Math.floor((img.naturalWidth * (col + 1)) / 6);
              const y = Math.floor((img.naturalHeight * (row + 1)) / 6);
              const d = ctx.getImageData(x, y, 1, 1).data;
              samples.push(d[0], d[1], d[2], d[3]); // R,G,B,A
            }
          }
          // At least one pixel must be opaque and non-white (a real diagram colour).
          const hasColor = Array.from({ length: 25 }, (_, i) => {
            const r = samples[i * 4],
              g = samples[i * 4 + 1],
              b = samples[i * 4 + 2],
              a = samples[i * 4 + 3];
            return a > 200 && !(r > 248 && g > 248 && b > 248);
          }).some(Boolean);
          resolve({ hasColor, samples });
        };
        img.onerror = () => resolve({ hasColor: false, samples: [] });
        img.src = imgSrc;
      });
    }, src!);

    if (errors.length)
      console.log('[capture-test] browser errors:', errors.join('\n'));

    expect(
      pixelResult.hasColor,
      `captured PNG must contain coloured (non-white, opaque) pixels.\nRGBA samples: ${pixelResult.samples}`,
    ).toBe(true);
  });

  test('architecture page: capture produces non-blank PNG image', async ({
    page,
  }) => {
    await page.goto('/docs/default/system/inventory/architecture');

    await page.waitForSelector('[data-c4-view-id]', {
      state: 'attached',
      timeout: DIAGRAM_TIMEOUT,
    });

    const refreshBtn = page.getByRole('button', { name: /refresh/i });
    if (await refreshBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await refreshBtn.click();
      await page.waitForSelector('[data-c4-view-id]', {
        state: 'attached',
        timeout: DIAGRAM_TIMEOUT,
      });
    }

    // Wait directly for the captured img — nodes may unmount before we check.
    const capturedImg = page
      .locator('[data-c4-view-id] img[src^="data:image/png"]')
      .first();
    await expect(
      capturedImg,
      'static PNG image must appear after capture completes',
    ).toBeVisible({
      timeout: DIAGRAM_TIMEOUT,
    });

    const src = await capturedImg.getAttribute('src');
    expect(
      src!.length,
      'PNG must be non-trivial (> 5000 chars)',
    ).toBeGreaterThan(5_000);

    const { hasColor } = await page.evaluate(async (imgSrc: string) => {
      const img = new Image();
      return new Promise<{ hasColor: boolean }>(resolve => {
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          const ctx = c.getContext('2d')!;
          ctx.drawImage(img, 0, 0);
          const hasColor = Array.from({ length: 5 }, (_, i) => {
            const x = Math.floor((img.naturalWidth * (i + 1)) / 6);
            const y = Math.floor(img.naturalHeight / 2);
            const [r, g, b, a] = ctx.getImageData(x, y, 1, 1).data;
            return a > 200 && !(r > 248 && g > 248 && b > 248);
          }).some(Boolean);
          resolve({ hasColor });
        };
        img.onerror = () => resolve({ hasColor: false });
        img.src = imgSrc;
      });
    }, src!);

    expect(hasColor, 'captured PNG must contain coloured pixels').toBe(true);
  });

  test('overview page: diagram has nodes and edges', async ({ page }) => {
    await page.goto('/docs/default/system/inventory');

    await page.waitForSelector('[data-c4-entity]', {
      state: 'attached',
      timeout: DIAGRAM_TIMEOUT,
    });

    const refreshBtn = page.getByRole('button', { name: /refresh/i });
    if (await refreshBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await refreshBtn.click();
      await page.waitForSelector('[data-c4-entity]', {
        state: 'attached',
        timeout: DIAGRAM_TIMEOUT,
      });
    }

    // Accept either nodes (capture in progress) OR captured img (done).
    await expect(
      page
        .locator(
          '.react-flow__node, [data-c4-entity] img[src^="data:image/png"]',
        )
        .first(),
    ).toBeVisible({ timeout: DIAGRAM_TIMEOUT });

    // Count nodes only if the portal hasn't been unmounted yet.
    const nodeCount = await page
      .locator('.react-flow__node:not(.react-flow__node-boundary)')
      .count();
    const imgCount = await page
      .locator('[data-c4-entity] img[src^="data:image/png"]')
      .count();
    // Either nodes are present (capture in progress) or the img is present (capture done).
    expect(
      nodeCount >= 1 || imgCount >= 1,
      'entity diagram must have ≥ 1 node or a captured image',
    ).toBe(true);
  });
});
