/** Upload two fresh digital QA reports and print their IDs. */
const { chromium } = require('playwright');
const path = require('path');

const FRONTEND_URL = 'http://127.0.0.1:5174';
const API_URL = 'http://127.0.0.1:8001';
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const DIGITAL = path.join(PROJECT_ROOT, 'backend', 'tests', 'fixtures', 'phase8_1_accuracy', 'clean_digital_report.pdf');

async function upload(page, tag) {
  await page.goto(`${FRONTEND_URL}/app/upload`, { waitUntil: 'networkidle' });
  await page.locator('input[type="file"]').setInputFiles(DIGITAL);
  await page.locator('input[type="checkbox"]').check();
  const responsePromise = page.waitForResponse(
    (r) => r.url() === `${API_URL}/api/reports` && r.request().method() === 'POST',
    { timeout: 30000 },
  );
  await page.getByRole('button', { name: /Start analysis/i }).click();
  const body = await (await responsePromise).json();
  console.log(tag, 'id', body.id);
  await page.getByText('Your report is ready', { exact: true }).waitFor({ timeout: 300000 });
  return body.id;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const first = await upload(page, 'PARTIAL');
  const second = await upload(page, 'LIFECYCLE');
  console.log(JSON.stringify({ partial: first, lifecycle: second }));
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
