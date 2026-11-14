/** Retake 02-partial-results-1280 with the analysis settled. */
const { chromium } = require('playwright');
const path = require('path');

const FRONTEND_URL = 'http://127.0.0.1:5174';
const REPORT = '795793a1-b9dd-4a38-b432-571e905569cb';
const OUT = path.join(__dirname, 'screenshots', 'phase9_11_5_final', '02-partial-results-1280.png');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await page.goto(`${FRONTEND_URL}/app/reports/${REPORT}/results`, { waitUntil: 'networkidle' });
  await page.locator('.results-stats, .handoff-section').first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: OUT, fullPage: false });
  console.log('SHOT', OUT);
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
