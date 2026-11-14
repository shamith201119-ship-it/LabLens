/** Probe viewport metrics under scrollbar-gutter: stable on mobile. */
const { chromium } = require('playwright');
const path = require('path');

const FRONTEND_URL = 'http://127.0.0.1:5174';
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const DIGITAL = path.join(PROJECT_ROOT, 'backend', 'tests', 'fixtures', 'phase8_1_accuracy', 'clean_digital_report.pdf');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });

  await page.goto(`${FRONTEND_URL}/app/upload`, { waitUntil: 'networkidle' });
  await page.locator('input[type="file"]').setInputFiles(DIGITAL);
  await page.locator('input[type="checkbox"]').check();
  const responsePromise = page.waitForResponse(
    (r) => r.url() === 'http://127.0.0.1:8001/api/reports' && r.request().method() === 'POST',
    { timeout: 30000 },
  );
  await page.getByRole('button', { name: /Start analysis/i }).click();
  await responsePromise;
  await page.getByText('Your report is ready', { exact: true }).waitFor({ timeout: 240000 });
  await page.getByRole('button', { name: /Review & verify results/i }).click();
  await page.waitForURL(/\/verify/, { timeout: 15000 });
  await page.locator('.ve-workspace').waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: /Inspect HbA1c/ }).first().click();
  await page.locator('.ve-mobile-sheet').waitFor({ timeout: 6000 });
  await page.waitForTimeout(400);
  console.log(await page.evaluate(() => ({
    viewport: { width: window.innerWidth, height: window.innerHeight },
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    sheet: (() => {
      const el = document.querySelector('.ve-mobile-sheet');
      const r = el.getBoundingClientRect();
      return { left: r.left, width: r.width, top: r.top, height: r.height };
    })(),
    sheetRoot: (() => {
      const el = document.querySelector('.ve-sheet-root');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, width: r.width };
    })(),
    bodyOverflow: getComputedStyle(document.body).overflow,
    gutter: getComputedStyle(document.documentElement).scrollbarGutter,
  })));
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
