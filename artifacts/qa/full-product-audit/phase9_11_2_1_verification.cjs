/**
 * Phase 9.11.2.1 — Premium workspace polish and corrected-state QA.
 *
 * Isolated stack:
 *   frontend http://127.0.0.1:5174  (VITE_API_BASE=http://127.0.0.1:8001)
 *   backend  http://127.0.0.1:8001  (LABLENS_DATA_DIR=temp lablens-phase9112_1-qa)
 *
 * Covers: full biomarker-name readability, refined flags, Corrected filter,
 * Edited marker survival across re-verification, three desktop widths,
 * selected verification intact.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FRONTEND_URL = 'http://127.0.0.1:5174';
const API_URL = 'http://127.0.0.1:8001';
const QA_DIR = path.resolve(__dirname);
const PROJECT_ROOT = path.resolve(QA_DIR, '..', '..', '..');
const DIGITAL = path.join(PROJECT_ROOT, 'backend', 'tests', 'fixtures', 'phase8_1_accuracy', 'clean_digital_report.pdf');
const SHOT_DIR = path.join(QA_DIR, 'screenshots', 'phase9_11_2_1');
const RESULTS_PATH = path.join(QA_DIR, 'phase9_11_2_1_results.json');

const results = {
  generated_at: new Date().toISOString(),
  frontend_url: FRONTEND_URL,
  api_url: API_URL,
  checks: [],
  screenshots: [],
  console_errors: [],
  passed: 0,
  failed: 0,
};

function check(name, condition, detail = null) {
  if (condition) {
    results.passed += 1;
    results.checks.push({ name, status: 'passed', detail });
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    results.failed += 1;
    results.checks.push({ name, status: 'failed', detail });
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function shot(page, name, fullPage = false) {
  const file = path.join(SHOT_DIR, name);
  await page.screenshot({ path: file, fullPage });
  results.screenshots.push(file);
  console.log(`SHOT  ${file}`);
}

async function uploadAndStart(page) {
  await page.goto(`${FRONTEND_URL}/app/upload`, { waitUntil: 'networkidle' });
  await page.locator('input[type="file"]').setInputFiles(DIGITAL);
  await page.locator('input[type="checkbox"]').check();
  const responsePromise = page.waitForResponse(
    (response) => response.url() === `${API_URL}/api/reports` && response.request().method() === 'POST',
    { timeout: 30000 },
  );
  await page.getByRole('button', { name: /Start analysis/i }).click();
  const response = await responsePromise;
  const body = await response.json();
  await page.getByText('Your report is ready', { exact: true }).waitFor({ timeout: 60000 });
  return body.id;
}

async function openVerification(page) {
  await page.getByRole('button', { name: /Review & verify results/i }).click();
  await page.waitForURL(/\/verify/, { timeout: 15000 });
  await page.locator('.ve-workspace').waitFor({ timeout: 15000 });
}

async function main() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error' && !/Failed to load resource/i.test(message.text())) {
      results.console_errors.push(message.text());
    }
  });

  console.log('\n=== Phase 9.11.2.1 QA ===');
  const reportId = await uploadAndStart(page);
  await openVerification(page);

  // ---------- 1/5/6: names fully visible at 1440px ----------
  const names = await page.locator('.ve-row__name').allTextContents();
  const overflowing = await page.locator('.ve-row__name').evaluateAll((els) =>
    els.filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent),
  );
  check('all biomarker names render in full at 1440px', overflowing.length === 0, overflowing.join(' | ') || 'none clipped');
  check('longest biomarker name visible verbatim', names.some((n) => n.includes('Total Cholesterol')) && names.some((n) => n.includes('Triglycerides')), names.join(' | '));

  const flagChips = await page.locator('.ve-row__flag').allTextContents();
  check('abnormal flags use backend vocabulary', flagChips.every((t) => /^Above laboratory range$/.test(t.trim())) && flagChips.length === 4, flagChips.join(' | '));

  const editedMarkers = await page.locator('.ve-row__edited').count();
  check('no Edited marker on uncorrected rows', editedMarkers === 0);

  // ---------- corrected filter exists ----------
  const correctedChip = page.getByRole('button', { name: /^Corrected\s+0$/ });
  check('corrected filter appears with 0 count', await correctedChip.isVisible());

  // ---------- 3/4: correction flow with re-verification ----------
  const correctHbA1c = async () => {
    const ms = await (await fetch(`${API_URL}/api/reports/${reportId}/measurements`)).json();
    const hba1c = ms.measurements.find((m) => m.test_name_normalized === 'HbA1c');
    const resp = await fetch(`${API_URL}/api/reports/${reportId}/measurements/${hba1c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ result_original: '5.1' }),
    });
    return { status: resp.status, id: hba1c.id };
  };

  // Confirm two rows first, then correct one of them.
  await page.getByRole('checkbox', { name: /Select Glucose for confirmation/ }).check();
  await page.getByRole('checkbox', { name: /Select HbA1c for confirmation/ }).check();
  await page.getByRole('button', { name: /Confirm selected \(2\)/ }).click();
  await page.waitForFunction(
    () => document.querySelectorAll('.ve-row.is-confirmed').length === 2,
    null,
    { timeout: 15000 },
  );

  const patch = await correctHbA1c();
  check('correction patch accepted', patch.status === 200);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.ve-workspace').waitFor();

  const editedAfterReload = await page.locator('.ve-row.is-inspected .ve-row__edited').count();
  void editedAfterReload;
  const editedRowCount = await page.locator('.ve-row:has(.ve-row__edited)').count();
  check('corrected row carries Edited marker', editedRowCount === 1);

  const correctedChipOne = page.getByRole('button', { name: /^Corrected\s+1$/ });
  check('corrected filter increments to 1 after edit', await correctedChipOne.isVisible());

  await correctedChipOne.click();
  const correctedRows = await page.locator('.ve-row').count();
  check('corrected filter isolates exactly the edited row', correctedRows === 1 && (await page.locator('.ve-row:has-text("HbA1c")').count()) === 1);
  await shot(page, '01-corrected-filter.png', true);

  // re-verify it — Edited marker and Corrected membership must persist
  await page.getByRole('button', { name: 'All 5' }).click();
  await page.getByRole('button', { name: 'Confirm HbA1c' }).click();
  await page.waitForFunction(
    () => document.querySelectorAll('.ve-row.is-confirmed').length === 2,
    null,
    { timeout: 15000 },
  );
  check('re-verified corrected row is confirmed again', (await page.locator('.ve-row.is-confirmed').count()) === 2);
  check('Edited marker survives re-verification', (await page.locator('.ve-row:has(.ve-row__edited)').count()) === 1);
  await correctedChipOne.click();
  check('corrected measurement stays in Corrected filter after re-verification', (await page.locator('.ve-row').count()) === 1);
  check('uncorrected measurements never appear in Corrected filter', (await page.locator('.ve-row:has-text("Triglycerides")').count()) === 0);

  // ---------- header proportions ----------
  const editedCount = await page.locator('.ve-counts__item', { hasText: 'EDITED' }).locator('dd').innerText();
  check('header reports Edited count', editedCount.trim() === '1', editedCount.trim());

  // ---------- three desktop widths screenshots ----------
  for (const width of [1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('.ve-workspace').waitFor();
    const clippedAtWidth = await page.locator('.ve-row__name').evaluateAll((els) =>
      els.filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent),
    );
    check(`biomarker names readable at ${width}px`, clippedAtWidth.length === 0, clippedAtWidth.join(' | ') || 'none clipped');
    await shot(page, `02-names-${width}.png`, true);
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  // ---------- selected verification intact ----------
  await page.getByRole('button', { name: /^All\s+5$/ }).click();
  for (const name of ['Creatinine', 'Total Cholesterol', 'Triglycerides']) {
    await page.getByRole('checkbox', { name: new RegExp(`Select ${name} for confirmation`) }).check();
  }
  await page.getByRole('button', { name: /Confirm selected \(3\)/ }).click();
  await page.waitForFunction(
    () => document.querySelectorAll('.ve-row.is-confirmed').length === 5,
    null,
    { timeout: 15000 },
  );
  check('selection flow still verifies only chosen rows', (await page.locator('.ve-row.is-confirmed').count()) === 5);

  check('no select-all control present', (await page.getByText(/select all/i).count()) === 0);
  check('no Verify all control present', (await page.getByText(/verify all/i).count()) === 0);
  check('no uncaught console errors', results.console_errors.length === 0, results.console_errors.join(' | ').slice(0, 300));

  await browser.close();
  fs.writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2), 'utf8');
  console.log(`\nRESULTS ${RESULTS_PATH}`);
  console.log(`PASSED ${results.passed}  FAILED ${results.failed}`);
  if (results.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  results.failed += 1;
  results.checks.push({ name: 'qa script completed', status: 'failed', detail: error.message });
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  fs.writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2), 'utf8');
  console.error(error);
  process.exit(1);
});
