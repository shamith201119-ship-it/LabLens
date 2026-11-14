/**
 * Phase 9.11.2 — Verification workspace QA.
 *
 * Isolated stack:
 *   frontend http://127.0.0.1:5174  (VITE_API_BASE=http://127.0.0.1:8001)
 *   backend  http://127.0.0.1:8001  (LABLENS_DATA_DIR=temp lablens-phase9112-qa)
 *
 * Checks: header identity + counters, filters + search, explicit selection,
 * Confirm selected (N), no select-all / no Verify-all, corrected rows require
 * re-confirmation, source highlight stays accurate, zero console errors.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FRONTEND_URL = 'http://127.0.0.1:5174';
const API_URL = 'http://127.0.0.1:8001';
const QA_DIR = path.resolve(__dirname);
const PROJECT_ROOT = path.resolve(QA_DIR, '..', '..', '..');
const DIGITAL = path.join(PROJECT_ROOT, 'backend', 'tests', 'fixtures', 'phase8_1_accuracy', 'clean_digital_report.pdf');
const IMAGE_PNG = path.join(PROJECT_ROOT, 'backend', 'tests', 'fixtures', 'phase8_1_accuracy', 'cbc_report.png');
const SHOT_DIR = path.join(QA_DIR, 'screenshots', 'phase9_11_2');
const RESULTS_PATH = path.join(QA_DIR, 'phase9_11_2_results.json');

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

async function uploadAndStart(page, fixture) {
  await page.goto(`${FRONTEND_URL}/app/upload`, { waitUntil: 'networkidle' });
  await page.locator('input[type="file"]').setInputFiles(fixture);
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
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error' && !/Failed to load resource/i.test(message.text())) {
      results.console_errors.push(message.text());
    }
  });

  // ================= Pass A: real digital PDF end-to-end =================
  console.log('\n=== Pass A: digital PDF (real) ===');
  await uploadAndStart(page, DIGITAL);
  await openVerification(page);

  check('overview headline renders', await page.getByRole('heading', { name: 'Review your results', level: 1 }).isVisible());
  check('introduction copy renders', (await page.getByText(/LabLens has read your report/).count()) === 1);
  const ringLabel = await page.locator('.ve-ring').getAttribute('aria-label');
  check('progress ring reflects real state', ringLabel === '0 of 5 results confirmed', ringLabel);
  check('five measurement rows render', (await page.locator('.ve-row').count()) === 5);

  const filterCounts = async () => {
    const out = {};
    for (const label of ['All', 'Needs review', 'Out of range', 'Confirmed']) {
      const btn = page.getByRole('button', { name: new RegExp(`^${label}\\s+\\d+$`) });
      const text = await btn.innerText();
      out[label] = Number(text.match(/(\d+)/)[1]);
    }
    return out;
  };
  const countsA0 = await filterCounts();
  check('filter counts are real', countsA0['All'] === 5 && countsA0['Needs review'] === 5 && countsA0['Out of range'] === 4 && countsA0['Confirmed'] === 0, JSON.stringify(countsA0));

  const glucoseFlag = await page.getByText('Above laboratory range').count();
  check('above-range flag chips render from backend flags', glucoseFlag >= 1);
  check('no “below” vocabulary appears', (await page.getByText('Below laboratory range').count()) === 0);

  await page.getByLabel('Search measurements').fill('glucose');
  check('search filters rows', (await page.locator('.ve-row').count()) === 1);
  await page.getByLabel('Search measurements').fill('');

  await page.getByRole('button', { name: /^Out of range\s+4$/ }).click();
  check('out-of-range filter shows exactly the 4 flagged rows', (await page.locator('.ve-row').count()) === 4);
  await page.getByRole('button', { name: /^All\s+5$/ }).click();
  check('all filter restores all rows', (await page.locator('.ve-row').count()) === 5);

  await shot(page, '01-overview.png', true);

  // explicit selection + confirm selected (2)
  await page.getByRole('checkbox', { name: /Select Glucose for confirmation/ }).check();
  await page.getByRole('checkbox', { name: /Select HbA1c for confirmation/ }).check();
  const selectionBar = page.locator('.ve-selection-bar');
  await selectionBar.waitFor({ timeout: 5000 });
  check('selection bar appears with explicit count', (await selectionBar.locator('.ve-selection-bar__count').innerText()) === '2');
  await shot(page, '02-selection-made.png', true);

  await page.getByRole('button', { name: /Confirm selected \(2\)/ }).click();
  await page.waitForFunction(
    () => document.querySelectorAll('.ve-row.is-confirmed').length === 2,
    null,
    { timeout: 15000 },
  );
  const confirmedCount = await page.locator('.ve-row.is-confirmed').count();
  check('bulk confirmation verifies only selected rows', confirmedCount === 2);
  check('selection clears after success', (await page.locator('.ve-selection-bar').count()) === 0);
  const ringLabelB = await page.locator('.ve-ring').getAttribute('aria-label');
  check('progress ring updates from real state', ringLabelB === '2 of 5 results confirmed', ringLabelB);
  check('unselected rows remain unconfirmed', (await page.locator('.ve-row:not(.is-confirmed)').count()) === 3);
  await shot(page, '03-confirmed-progress.png', true);

  check('no select-all control exists', (await page.getByText(/select all/i).count()) === 0 && (await page.getByRole('checkbox', { name: /select all/i }).count()) === 0);
  check('no Verify all control exists', (await page.getByText(/verify all/i).count()) === 0);

  // correction → needs_review → re-confirm (Glucose was verified above)
  const reportId = page.url().match(/reports\/([^/]+)\/verify/)[1];
  const msResp = await fetch(`${API_URL}/api/reports/${reportId}/measurements`);
  const ms = await msResp.json();
  const glucose = ms.measurements.find(
    (m) => m.test_name_normalized === 'Glucose',
  );
  const patchResp = await fetch(
    `${API_URL}/api/reports/${reportId}/measurements/${glucose.id}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ result_original: '99' }),
    },
  );
  check('correction patch accepted', patchResp.status === 200);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.ve-workspace').waitFor();
  const ringLabelC = await page.locator('.ve-ring').getAttribute('aria-label');
  check('corrected measurement drops out of confirmed count', ringLabelC === '1 of 5 results confirmed', ringLabelC);
  check('corrected row shows Needs review', (await page.locator('.ve-row', { hasText: 'Glucose' }).getByText('Needs review').count()) === 1);
  await shot(page, '04-corrected-needs-review.png', true);

  // re-confirm the corrected row via the individual confirm action
  await page.getByRole('button', { name: 'Confirm Glucose' }).click();
  await page.waitForFunction(
    () => document.querySelectorAll('.ve-row.is-confirmed').length === 2,
    null,
    { timeout: 15000 },
  );
  check('individual action re-confirms the corrected row', (await page.locator('.ve-row.is-confirmed').count()) === 2);

  // confirm remaining 2 + HbA1c re-verified already leaves exactly 3 to go:
  // Creatinine, Total Cholesterol, Triglycerides
  for (const name of ['Creatinine', 'Total Cholesterol', 'Triglycerides']) {
    await page.getByRole('checkbox', { name: new RegExp(`Select ${name} for confirmation`) }).check();
  }
  await page.getByRole('button', { name: /Confirm selected \(3\)/ }).click();
  await page.waitForFunction(
    () => document.querySelectorAll('.ve-row.is-confirmed').length === 5,
    null,
    { timeout: 15000 },
  );
  check('all rows confirmable via explicit selection', (await page.locator('.ve-row.is-confirmed').count()) === 5);

  await shot(page, '05-all-confirmed.png', true);

  await page.getByRole('button', { name: /Confirm results & continue/i }).first().click();
  await page.waitForURL(/\/results/, { timeout: 20000 });
  check('continue hands off to analysis results', /\/results/.test(new URL(page.url()).pathname));
  await shot(page, '06-results-handoff.png');

  // ============ Pass B: image report with real OCR path ============
  console.log('\n=== Pass B: real OCR PNG ===');
  const pageB = await context.newPage();
  pageB.on('console', (message) => {
    if (message.type() === 'error' && !/Failed to load resource/i.test(message.text())) {
      results.console_errors.push(message.text());
    }
  });
  await uploadAndStart(pageB, IMAGE_PNG);
  await openVerification(pageB);
  check('image report renders rows', (await pageB.locator('.ve-row').count()) === 5);
  await pageB.getByRole('button', { name: /Hemoglobin/ }).first().click();
  const highlight = pageB.locator('[data-testid="measurement-highlight"]');
  await highlight.waitFor({ timeout: 5000 });
  const box = await highlight.boundingBox();
  check('source highlight renders with real geometry', box !== null && box.width > 20 && box.height > 5, box ? `${Math.round(box.width)}x${Math.round(box.height)}` : 'none');
  await shot(pageB, '07-source-highlight.png', true);

  // ============ Pass C: mobile viewport ============
  console.log('\n=== Pass C: mobile viewport ===');
  const pageC = await context.newPage();
  pageC.setViewportSize({ width: 420, height: 900 });
  pageC.on('console', (message) => {
    if (message.type() === 'error' && !/Failed to load resource/i.test(message.text())) {
      results.console_errors.push(message.text());
    }
  });
  await uploadAndStart(pageC, DIGITAL);
  await openVerification(pageC);
  const docTab = pageC.getByRole('tab', { name: 'Document' });
  const measTab = pageC.getByRole('tab', { name: /Measurements/ });
  check('mobile tabs render', (await measTab.isVisible()) && (await docTab.isVisible()));
  const scrollWidth = await pageC.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await pageC.evaluate(() => document.documentElement.clientWidth);
  check('no horizontal overflow on mobile', scrollWidth <= clientWidth + 1, `${scrollWidth} vs ${clientWidth}`);
  check('mobile defaults to measurements tab', await measTab.getAttribute('aria-selected') === 'true');
  await shot(pageC, '08-mobile-measurements.png');
  await docTab.click();
  await pageC.waitForTimeout(600);
  check('document tab shows the source pane on mobile', await pageC.locator('.ve-source').isVisible());
  await shot(pageC, '09-mobile-document.png');

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
