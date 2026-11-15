/** Capture BEFORE screenshots of the verification workspace for the redesign report. */
const { chromium } = require('playwright');
const path = require('path');

const FRONTEND_URL = 'http://127.0.0.1:5174';
const API_URL = 'http://127.0.0.1:8001';
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const DIGITAL = path.join(PROJECT_ROOT, 'backend', 'tests', 'fixtures', 'phase8_1_accuracy', 'clean_digital_report.pdf');
const OUT = path.join(__dirname, 'screenshots', 'phase9_12_0_before');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  // Upload a fresh clean digital report via the UI to reach the verify screen
  await page.goto(`${FRONTEND_URL}/app/upload`, { waitUntil: 'networkidle' });
  await page.locator('.global-loader').waitFor({ state: 'detached', timeout: 20000 }).catch(() => null);
  await page.locator('input[type="file"]').setInputFiles(DIGITAL);
  await page.locator('input[type="checkbox"]').check();
  const responsePromise = page.waitForResponse(
    (r) => r.url() === `${API_URL}/api/reports` && r.request().method() === 'POST',
    { timeout: 30000 },
  );
  await page.getByRole('button', { name: /Start analysis/i }).click();
  const body = await (await responsePromise).json();
  await page.getByText('Your report is ready', { exact: true }).waitFor({ timeout: 240000 });
  await page.getByRole('button', { name: /Review & verify results/i }).click();
  await page.waitForURL(/\/verify/, { timeout: 15000 });
  await page.locator('.ve-workspace').waitFor({ timeout: 15000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, 'before-verify-1440.png') });

  // Mobile
  const mobile = await browser.newPage({ viewport: { width: 390, height: 800 } });
  await mobile.goto(`${FRONTEND_URL}/app/reports/${body.id}/verify`, { waitUntil: 'networkidle' });
  await mobile.locator('.ve-workspace').waitFor({ timeout: 15000 });
  await mobile.waitForTimeout(500);
  await mobile.screenshot({ path: path.join(OUT, 'before-verify-390.png'), fullPage: true });
  console.log('report id', body.id);
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
