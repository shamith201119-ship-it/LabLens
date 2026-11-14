/** Mobile sheet a11y probe. */
const { chromium } = require('playwright');
const path = require('path');
const FRONTEND_URL = 'http://127.0.0.1:5174';
const API_URL = 'http://127.0.0.1:8001';
const QA_DIR = path.resolve(__dirname);
const PROJECT_ROOT = path.resolve(QA_DIR, '..', '..', '..');
const DIGITAL = path.join(PROJECT_ROOT, 'backend', 'tests', 'fixtures', 'phase8_1_accuracy', 'clean_digital_report.pdf');

async function upload(page) {
  await page.goto(`${FRONTEND_URL}/app/upload`, { waitUntil: 'networkidle' });
  await page.locator('input[type="file"]').setInputFiles(DIGITAL);
  await page.locator('input[type="checkbox"]').check();
  const rp = page.waitForResponse((r) => r.url() === `${API_URL}/api/reports` && r.request().method() === 'POST', { timeout: 30000 });
  await page.getByRole('button', { name: /Start analysis/i }).click();
  const body = await (await rp).json();
  await page.getByText('Your report is ready', { exact: true }).waitFor({ timeout: 240000 });
  await page.getByRole('button', { name: /Review & verify results/i }).click();
  await page.waitForURL(/\/verify/, { timeout: 15000 });
  await page.locator('.ve-overview').waitFor({ timeout: 15000 });
  return body.id;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const mctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const mp = await mctx.newPage();
  await mp.goto(`${FRONTEND_URL}/app/upload`, { waitUntil: 'networkidle' });
  await mp.locator('input[type="file"]').setInputFiles(DIGITAL);
  await mp.locator('input[type="checkbox"]').check();
  const rp = mp.waitForResponse((r) => r.url() === `${API_URL}/api/reports` && r.request().method() === 'POST', { timeout: 30000 });
  await mp.getByRole('button', { name: /Start analysis/i }).click();
  await (await rp).json();
  await mp.getByText('Your report is ready', { exact: true }).waitFor({ timeout: 240000 });
  await mp.getByRole('button', { name: /Review & verify results/i }).click();
  await mp.waitForURL(/\/verify/, { timeout: 15000 });
  await mp.locator('.ve-overview').waitFor();

  await mp.getByRole('button', { name: /Inspect HbA1c/ }).first().click();
  await mp.locator('.ve-mobile-sheet').waitFor();
  await mp.waitForTimeout(500);
  console.log('sheet active element:', await mp.evaluate(() => {
    const el = document.activeElement;
    return el ? `${el.tagName}.${el.className} ${el.getAttribute('aria-label') || ''}` : 'none';
  }));
  console.log('body overflow while sheet:', await mp.evaluate(() => getComputedStyle(document.body).overflow));
  console.log('html overflow while sheet:', await mp.evaluate(() => getComputedStyle(document.documentElement).overflow));
  await mp.keyboard.press('Escape');
  await mp.waitForTimeout(300);
  console.log('sheet after Escape:', await mp.locator('.ve-mobile-sheet').count());
  let escaped = false;
  let escapedAt = -1;
  for (let i = 0; i < 30; i += 1) {
    await mp.keyboard.press('Tab');
    const inside = await mp.evaluate(() => document.querySelector('.ve-mobile-sheet')?.contains(document.activeElement));
    if (!inside) { escaped = true; escapedAt = i; break; }
  }
  console.log('focus escapes sheet within 30 tabs:', escaped, 'at', escapedAt);

  // aria snapshot of sheet
  const snap = await mp.locator('.ve-mobile-sheet').ariaSnapshot();
  console.log('SHEET SNAPSHOT\n' + snap);
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
