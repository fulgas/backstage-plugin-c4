import * as path from 'path';
import { chromium } from '@playwright/test';

const STATE_FILE = path.join(__dirname, '.auth-state.json');

async function globalSetup() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto('http://localhost:3000/c4/default/domain/fulfillment');

  // Wait for the guest sign-in button (Backstage loads async)
  await page.waitForSelector('button:has-text("ENTER")', { timeout: 20_000 });
  await page.click('button:has-text("ENTER")');
  await page.waitForURL(url => !url.pathname.includes('signin'), {
    timeout: 20_000,
  });

  // Save the authenticated session
  await page.context().storageState({ path: STATE_FILE });
  await browser.close();
}

export default globalSetup;
export { STATE_FILE };
