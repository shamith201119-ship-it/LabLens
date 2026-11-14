/**
 * Phase 9.11.3 — Premium source inspection and correction QA.
 *
 * Isolated stack:
 *   frontend http://127.0.0.1:5174  (VITE_API_BASE=http://127.0.0.1:8001)
 *   backend  http://127.0.0.1:8001  (LABLENS_DATA_DIR=temp lablens-phase9113-qa)
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FRONTEND_URL = 'http://127.0.0.1:5174';
const API_URL = 'http://127.0.0.1:8001';
const QA_DIR = path.resolve(__dirname);
const PROJECT_ROOT = path.resolve(QA_DIR, '..', '..', '..');
const DIGITAL = path.join(PROJECT_ROOT, 'backend', 'tests', 'fixtures', 'phase8_1_accuracy', 'clean_digital_report.pdf');
const MULTIPAGE = path.join(PROJECT_ROOT, 'backend', 'tests', 'fixtures', 'phase9_5', 'multipage_scanned_report.pdf');
const SHOT_DIR = path.join(QA_DIR, 'screenshots', 'phase9_11_3');
const RESULTS_PATH = path.join(QA_DIR, 'phase9_11_3_results.json');

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
  await page.getByText('Your report is ready', { exact: true }).waitFor({ timeout: 240000 });
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

  // ===== Pass A: digital PDF — inspection panel + evidence =====
  console.log('\n=== Pass A: digital PDF inspection ===');
  const digitalReportId = await uploadAndStart(page, DIGITAL);
  await openVerification(page);
  check('verification workspace renders', await page.locator('.ve-workspace').isVisible());

  await page.getByRole('button', { name: /Inspect HbA1c/ }).first().click();
  await page.locator('.ve-inspect').waitFor({ timeout: 6000 });
  const panelText = await page.locator('.ve-inspect').innerText();
  check('inspection panel carries measurement name', panelText.includes('HbA1c'));
  check('panel shows need-review and page', panelText.includes('Page 1'));
  check('panel shows digital text-layer source method', panelText.includes('Digital text layer'));
  check('panel indicates confidence not applicable', panelText.includes('Not available for this page'));
  check('panel shows OCR-confidence help in evidence block', panelText.includes('OCR confidence'));

  const highlight = page.locator('[data-testid="measurement-highlight"]');
  await highlight.waitFor({ timeout: 5000 });
  const hlBox = await highlight.boundingBox();
  check('source highlight renders with real geometry', hlBox !== null && hlBox.width > 1 && hlBox.height > 1, hlBox ? `${Math.round(hlBox.width)}×${Math.round(hlBox.height)}px` : 'none');
  await shot(page, '01-digital-inspection.png', true);

  // Wide layout: the inspection panel replaces the measurement rail, so close it
  // before selecting the next result.
  await page.getByRole('button', { name: 'Close inspection panel' }).click();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: /Inspect Glucose/ }).first().click();
  await page.locator('.ve-inspect:has-text("Glucose")').waitFor({ timeout: 5000 });
  const hlBox2 = await highlight.boundingBox();
  check('highlight moves with selected measurement', hlBox2 !== null && hlBox2.width > 20);

  // ===== Pass B: scanned multipage — page jump + zoom =====
  console.log('\n=== Pass B: scanned PDF inspection ===');
  const pageB = await context.newPage();
  pageB.on('console', (message) => {
    if (message.type() === 'error' && !/Failed to load resource/i.test(message.text())) {
      results.console_errors.push(message.text());
    }
  });
  await uploadAndStart(pageB, MULTIPAGE);
  await openVerification(pageB);

  await pageB.getByRole('button', { name: /Inspect Glucose/ }).first().click();
  await pageB.locator('.ve-inspect').waitFor({ timeout: 6000 });
  await pageB.waitForTimeout(400);
  const panelTextB = await pageB.locator('.ve-inspect').innerText();
  check('inspection panel shows Glucose on page 2', panelTextB.includes('Glucose') && panelTextB.includes('Page 2'), panelTextB.slice(0, 140));
  const pageLabel = await pageB.locator('.ve-source__page-label').innerText().catch(() => '');
  check('source jumps to measurement page', pageLabel.includes('2 / 2'), pageLabel);
  await shot(pageB, '02-scanned-page-2.png', true);

  // zoom controls
  const frameBox = async () => pageB.locator('.ve-stage__frame').boundingBox();
  const boxBefore = await frameBox();
  await pageB.getByRole('button', { name: 'Zoom in' }).click();
  await pageB.waitForTimeout(250);
  const boxZoomed = await frameBox();
  check(
    'zoom in enlarges the document frame',
    boxZoomed !== null && boxBefore !== null && boxZoomed.width > boxBefore.width + 2,
    boxBefore && boxZoomed ? `before=${Math.round(boxBefore.width)}px zoomed=${Math.round(boxZoomed.width)}px` : 'missing',
  );
  await pageB.getByRole('button', { name: 'Reset zoom to fit page' }).click();
  await pageB.waitForTimeout(250);
  const boxReset = await frameBox();
  check(
    'reset restores fit view',
    boxReset !== null && Math.abs(boxReset.width - boxBefore.width) < 3,
    boxBefore && boxReset ? `fit=${Math.round(boxBefore.width)}px reset=${Math.round(boxReset.width)}px` : 'missing',
  );

  // ===== Pass C: correction flow =====
  console.log('\n=== Pass C: correction interaction ===');
  const pageC = await context.newPage();
  pageC.on('console', (message) => {
    if (message.type() === 'error' && !/Failed to load resource/i.test(message.text())) {
      results.console_errors.push(message.text());
    }
  });
  await uploadAndStart(pageC, DIGITAL);
  await openVerification(pageC);
  const verifyUrl = pageC.url();
  const reportC = verifyUrl.match(/reports\/([^/]+)\/verify/)[1];

  // open HbA1c via row pencil → should open in edit mode with ghost values
  await pageC.getByRole('button', { name: 'Edit HbA1c' }).click();
  await pageC.locator('.ve-inspect__edit').waitFor({ timeout: 6000 });
  const ghost = await pageC.locator('.ve-inspect__ghost').innerText();
  check('edit mode shows ghost original value', ghost.includes('6.2'), ghost.replace(/\s+/g, ' ').slice(0, 120));
  await pageC.locator('.ve-inspect__edit input').first().fill('5.1');
  await pageC.getByRole('button', { name: /Save correction/i }).click();
  await pageC.waitForFunction(
    () => !document.querySelector('.ve-inspect__edit'),
    null,
    { timeout: 15000 },
  );
  const editedPanel = await pageC.locator('.ve-inspect').innerText();
  check('corrected row shows Edited marker', editedPanel.includes('EDITED'));
  const statusAfter = await pageC.locator('.ve-inspect__statusline').innerText();
  check('corrected row returns to Needs review', statusAfter.includes('Needs review'), statusAfter.replace(/\s+/g, ' '));
  check('corrected row is not auto-verified', (await pageC.locator('.ve-inspect__confirmed-pill').count()) === 0);

  // confirm again via the panel (wide layout: rail is hidden while inspecting,
  // so confirm against the panel pill, then close and count the rail rows)
  await pageC.getByRole('button', { name: 'Confirm this result' }).click();
  await pageC.locator('.ve-inspect__confirmed-pill').waitFor({ timeout: 15000 });
  await shot(pageC, '03-correction-flow.png', true);
  await pageC.getByRole('button', { name: 'Close inspection panel' }).click();
  await pageC.locator('.ve-row').first().waitFor({ timeout: 15000 });
  check('confirm re-verifies the corrected result', (await pageC.locator('.ve-row.is-confirmed').count()) === 1);

  // ===== Pass D: mobile bottom sheet =====
  console.log('\n=== Pass D: mobile view ===');
  const pageD = await context.newPage();
  pageD.setViewportSize({ width: 420, height: 900 });
  pageD.on('console', (message) => {
    if (message.type() === 'error' && !/Failed to load resource/i.test(message.text())) {
      results.console_errors.push(message.text());
    }
  });
  await uploadAndStart(pageD, DIGITAL);
  await openVerification(pageD);
  await pageD.getByRole('button', { name: /Inspect HbA1c/ }).first().click();
  await pageD.locator('.ve-inspect').waitFor({ timeout: 6000 });
  await pageD.waitForTimeout(700);
  const bottomSheet = await pageD.locator('.ve-mobile-sheet').evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return rect.top >= 0 && rect.left === 0 && Math.abs(rect.width - document.documentElement.clientWidth) < 3;
  });
  check('inspection renders as bottom sheet on mobile', bottomSheet === true);
  check('close button is reachable', await pageD.getByRole('button', { name: 'Close inspection panel' }).isVisible());
  await shot(pageD, '04-mobile-inspection.png');

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
