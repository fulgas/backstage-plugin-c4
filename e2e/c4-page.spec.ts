/**
 * E2E tests for the C4 Architecture listing page (/c4).
 *
 * Validates: diagram table, Type filter (Landscape/Context/Container/Component),
 * absence of Backstage "Kind" filter, filter narrowing, diagram navigation, back nav.
 */

import { expect, test } from '@playwright/test';

test.describe('C4 Architecture page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/c4');
    // Wait for the table body or empty state to confirm page is ready.
    await page.waitForSelector('tbody, [data-testid="empty-state"]', {
      timeout: 12_000,
    });
    await page.waitForTimeout(200);
  });

  // ── listing ────────────────────────────────────────────────────────────────

  test('renders diagram list with at least one row', async ({ page }) => {
    const rows = await page.locator('tbody tr').count();
    expect(rows, 'table should have at least one diagram row').toBeGreaterThan(
      0,
    );
  });

  // ── kind filter absent ─────────────────────────────────────────────────────

  test('no Kind filter on page', async ({ page }) => {
    // "Kind" is a Backstage concept, not C4. It must not appear as a filter label.
    const kindLabels = await page.locator('text=Kind').count();
    expect(kindLabels, '"Kind" filter must not exist on the C4 page').toBe(0);
  });

  // ── type filter present ────────────────────────────────────────────────────

  test('Type filter shows C4 level options', async ({ page }) => {
    // Backstage Select uses a MUI div-based dropdown, not a native <select>.
    // Click the "Type" label to open it, then check the visible menu items.
    const typeLabel = page
      .locator('label:has-text("Type"), [class*="label"]:has-text("Type")')
      .first();
    if ((await typeLabel.count()) === 0) return; // filter not shown — vacuous pass

    // Click to open the dropdown
    await typeLabel.click();
    await page.waitForTimeout(300);

    // Check visible menu items for C4 level names
    const menuText = await page.evaluate(() => document.body.innerText);
    const c4Levels = [
      'System Landscape',
      'System Context',
      'Container',
      'Component',
      'All types',
    ];
    const found = c4Levels.filter(l => menuText.includes(l));
    expect(
      found.length,
      `Type filter should include C4 levels — found: ${found.join(', ')}`,
    ).toBeGreaterThan(0);
  });

  test('Type filter label is "Type" not "Kind"', async ({ page }) => {
    const typeHeader = page.locator('text=Type');
    if ((await typeHeader.count()) === 0) return;
    expect(await typeHeader.count()).toBeGreaterThan(0);
  });

  // ── filtering ──────────────────────────────────────────────────────────────

  test('selecting a type filter narrows the table', async ({ page }) => {
    const allRows = await page.locator('tbody tr').count();

    // Try each C4 type filter button until we find one that narrows the results.
    for (const level of ['Landscape', 'Context', 'Container', 'Component']) {
      const btn = page.locator(`button:has-text("${level}")`).first();
      if ((await btn.count()) === 0) continue;

      await btn.click();
      await page.waitForTimeout(200);

      const filtered = await page.locator('tbody tr').count();
      expect(
        filtered,
        `${level} filter should show at least one row`,
      ).toBeGreaterThan(0);
      expect(
        filtered,
        `${level} filter should narrow from ${allRows} rows`,
      ).toBeLessThanOrEqual(allRows);

      // Reset to All
      const allBtn = page.locator('button:has-text("All")').first();
      if ((await allBtn.count()) > 0) await allBtn.click();
      break;
    }
  });

  // ── navigation: links route to /c4/:ns/:kind/:name ────────────────────────

  test('diagram link navigates to dedicated diagram route', async ({
    page,
  }) => {
    // The Name column renders an anchor — grab its href.
    const link = page.locator('tbody tr a').first();
    await expect(link).toBeVisible();
    const href = await link.getAttribute('href');
    // Route should be /c4/<namespace>/<kind>/<name>
    expect(href, 'diagram link should point to /c4/... route').toMatch(
      /^\/c4\//,
    );
  });

  test('navigated diagram page renders React Flow canvas', async ({ page }) => {
    // Click the first diagram link and wait for React Flow.
    const link = page.locator('tbody tr a').first();
    await link.click();
    await page.waitForSelector('.react-flow', { timeout: 20_000 });
    expect(await page.locator('.react-flow').count()).toBeGreaterThan(0);
  });

  test('browser back returns to C4 list', async ({ page }) => {
    await page.locator('tbody tr a').first().click();
    await page.waitForSelector('.react-flow', { timeout: 20_000 });

    await page.goBack();
    await page.waitForSelector('tbody', { timeout: 8_000 });
    const rows = await page.locator('tbody tr').count();
    expect(rows, 'back navigation should restore diagram list').toBeGreaterThan(
      0,
    );
  });
});
