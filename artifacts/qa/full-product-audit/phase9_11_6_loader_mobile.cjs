/** One-shot mobile loader screenshot after CSS fix. */
const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
  await page.goto('http://127.0.0.1:5174', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(80);
  await page.screenshot({ path: 'screenshots/phase9_11_6_loader/07-loader-360.png' });
  await page.locator('.global-loader').waitFor({ state: 'detached', timeout: 15000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'screenshots/phase9_11_6_loader/08-mobile-settled.png' });
  console.log('done');
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
