/** Reproduce the 390px upload flow with console capture. */
const { chromium } = require('playwright');
const path = require('path');

const FRONTEND_URL = 'http://127.0.0.1:5174';
const API_URL = 'http://127.0.0.1:8001';
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const DIGITAL = path.join(PROJECT_ROOT, 'backend', 'tests', 'fixtures', 'phase8_1_accuracy', 'clean_digital_report.pdf');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
  page.on('console', (m) => console.log('CONSOLE', m.type(), m.text().slice(0, 200)));
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));

  await page.goto(`${FRONTEND_URL}/app/upload`, { waitUntil: 'networkidle' });
  console.log('upload page loaded, loader visible:', await page.locator('.global-loader').count());
  await page.locator('input[type="file"]').setInputFiles(DIGITAL);
  await page.locator('input[type="checkbox"]').check();
  const responsePromise = page.waitForResponse(
    (r) => r.url() === `${API_URL}/api/reports` && r.request().method() === 'POST',
    { timeout: 30000 },
  );
  await page.getByRole('button', { name: /Start analysis/i }).click();
  const body = await (await responsePromise).json();
  console.log('uploaded id', body.id);
  await page.getByText('Your report is ready', { exact: true }).waitFor({ timeout: 240000 });
  console.log('ready state reached');
  await page.getByRole('button', { name: /Review & verify results/i }).click();
  console.log('clicked review & verify');
  try {
    await page.locator('.ve-workspace').waitFor({ timeout: 30000 });
    console.log('WORKSPACE OK');
  } catch {
    console.log('workspace NOT visible; current url:', page.url());
    console.log('loader count:', await page.locator('.global-loader').count());
    console.log('page text:', (await page.locator('body').innerText()).slice(0, 500));
    await page.screenshot({ path: 'screenshots/phase9_11_6_debug_390.png', fullPage: true });
  }
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
