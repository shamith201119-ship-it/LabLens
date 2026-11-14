/** Trace exactly which request fails and when the upload click lands. */
const { chromium } = require('playwright');
const path = require('path');

const FRONTEND_URL = 'http://127.0.0.1:5174';
const API_URL = 'http://127.0.0.1:8001';
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const DIGITAL = path.join(PROJECT_ROOT, 'backend', 'tests', 'fixtures', 'phase8_1_accuracy', 'clean_digital_report.pdf');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
  page.on('console', (m) => console.log('CONSOLE', m.type(), m.text().slice(0, 140)));
  page.on('requestfailed', (r) => console.log('REQFAIL', r.url().slice(0, 120), r.failure()?.errorText));
  page.on('response', (r) => {
    if (r.url().includes('/api/')) console.log('API', r.request().method(), r.url().slice(0, 100), r.status());
  });

  await page.goto(`${FRONTEND_URL}/app/upload`, { waitUntil: 'networkidle' });
  const loaderCount = await page.locator('.global-loader').count();
  console.log('loader visible:', loaderCount);
  await page.locator('.global-loader').waitFor({ state: 'detached', timeout: 20000 }).catch(() => null);
  console.log('loader detached');
  await page.locator('input[type="file"]').setInputFiles(DIGITAL);
  await page.locator('input[type="checkbox"]').check();
  const responsePromise = page.waitForResponse(
    (r) => r.url() === `${API_URL}/api/reports` && r.request().method() === 'POST',
    { timeout: 30000 },
  );
  await page.getByRole('button', { name: /Start analysis/i }).click();
  console.log('clicked Start analysis');
  try {
    const res = await responsePromise;
    const body = await res.json();
    console.log('UPLOAD OK', body.id);
  } catch (e) {
    console.log('wait failed:', e.message);
    const texts = await page.locator('main').innerText().catch(() => '');
    console.log('main text:', texts.slice(0, 600));
    await page.screenshot({ path: 'screenshots/phase9_11_6_upload_fail.png' });
  }
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
