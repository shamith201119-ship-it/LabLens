/**
 * Phase 9.11.6 — Final end-to-end smoke journey:
 * upload digital report -> processing -> verify one row -> confirm -> results + handoff.
 */
const { chromium } = require('playwright');
const path = require('path');

const FRONTEND_URL = 'http://127.0.0.1:5174';
const API_URL = 'http://127.0.0.1:8001';
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const DIGITAL = path.join(PROJECT_ROOT, 'backend', 'tests', 'fixtures', 'phase8_1_accuracy', 'clean_digital_report.pdf');
const results = { passed: 0, failed: 0 };

function check(name, ok, detail = '') {
  if (ok) {
    results.passed += 1;
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    results.failed += 1;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => console.error('PAGEERROR', e.message));

  await page.goto(`${FRONTEND_URL}/app/upload`, { waitUntil: 'networkidle' });
  await page.locator('.global-loader').waitFor({ state: 'detached', timeout: 15000 }).catch(() => null);
  await page.locator('input[type="file"]').setInputFiles(DIGITAL);
  await page.locator('input[type="checkbox"]').check();
  const responsePromise = page.waitForResponse(
    (r) => r.url() === `${API_URL}/api/reports` && r.request().method() === 'POST',
    { timeout: 30000 },
  );
  await page.getByRole('button', { name: /Start analysis/i }).click();
  const body = await (await responsePromise).json();
  check('upload accepted', Boolean(body?.id), body?.id?.slice(0, 8));
  await page.getByText('Your report is ready', { exact: true }).waitFor({ timeout: 240000 });
  check('processing reaches ready state', true);
  await page.getByRole('button', { name: /Review & verify results/i }).click();
  await page.waitForURL(/\/verify/, { timeout: 15000 });
  await page.locator('.ve-workspace').waitFor({ timeout: 15000 });
  check('verification workspace renders', true);

  const firstRow = page.locator('.ve-checkbox').first();
  await firstRow.check();
  await page.getByRole('button', { name: /Confirm selected \(1\)/ }).click();
  await page.waitForFunction(
    () => document.querySelectorAll('.ve-row.is-confirmed').length === 1,
    null,
    { timeout: 15000 },
  );
  check('selected row confirmed', true);

  await page.getByRole('button', { name: 'Confirm results & continue' }).click();
  const completion = page.locator('section[aria-labelledby="rc-heading"]');
  await completion.waitFor({ timeout: 6000 });
  check('partial completion shown', true);
  await completion.locator('.rc__ack-box').check();
  await completion.getByRole('button', { name: /Finish for now/i }).click();
  await page.waitForURL(/\/results/, { timeout: 30000 });
  await page.locator('.handoff-section').waitFor({ timeout: 15000 }).catch(() => null);
  check('results page shows clinician handoff', (await page.locator('.handoff-section').count()) === 1);

  // Trust boundary sanity: upload one more time should still show backend health
  const health = await page.evaluate(async () => {
    const res = await fetch('http://127.0.0.1:8001/api/health');
    return res.status;
  });
  check('isolated backend healthy', health === 200, `status=${health}`);

  await browser.close();
  console.log(`\nPASSED ${results.passed}  FAILED ${results.failed}`);
  if (results.failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
