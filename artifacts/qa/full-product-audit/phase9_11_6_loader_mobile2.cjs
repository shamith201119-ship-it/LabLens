/** Mobile loader screenshot at settled state. */
const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
  await page.goto('http://127.0.0.1:5174', { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'screenshots/phase9_11_6_loader/07-loader-360.png' });
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
