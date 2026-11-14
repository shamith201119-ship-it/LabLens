/**
 * Phase 9.10 live processing experience QA.
 *
 * Runs against an isolated LabLens stack:
 *   frontend http://127.0.0.1:5174  (VITE_API_BASE=http://127.0.0.1:8001)
 *   backend  http://127.0.0.1:8001  (LABLENS_DATA_DIR=temp lablens-phase910-qa)
 *
 * The script uploads the real scanned CBC fixture to exercise long OCR, then
 * checks the live timeline, elapsed timer, page-level activity, reduced motion,
 * completion handoff and the failure state. The failure state is produced by
 * intercepting the extract request in the browser; no backend code is changed.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FRONTEND_URL = 'http://localhost:5174';
const API_URL = 'http://127.0.0.1:8001';
const QA_DIR = path.resolve(__dirname);
const FIXTURE = path.resolve(
  QA_DIR,
  '..',
  '..',
  '..',
  'backend',
  'tests',
  'fixtures',
  'phase8_1_accuracy',
  'scanned_cbc_report.pdf',
);
const SHOT_DIR = path.join(QA_DIR, 'screenshots', 'phase9_10');
const RESULTS_PATH = path.join(QA_DIR, 'phase9_10_results.json');

const results = {
  generated_at: new Date().toISOString(),
  frontend_url: FRONTEND_URL,
  api_url: API_URL,
  fixture: FIXTURE,
  report_id: null,
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

function timerSeconds(value) {
  const match = /^(\d+):(\d+)$/.exec(value.trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : -1;
}

async function shot(page, name, fullPage = false) {
  const file = path.join(SHOT_DIR, name);
  await page.screenshot({ path: file, fullPage });
  results.screenshots.push(file);
  console.log(`SHOT  ${file}`);
}

async function uploadAndStart(page) {
  await page.goto(`${FRONTEND_URL}/app/upload`, { waitUntil: 'networkidle' });
  await page.locator('input[type="file"]').setInputFiles(FIXTURE);
  await page.locator('input[type="checkbox"]').check();
  await page.getByRole('button', { name: /Start analysis/i }).click();
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
    if (message.type() === 'error') results.console_errors.push(message.text());
  });

  // Make the fast structuring/analysis stages observable for screenshots
  // without changing the backend or the component logic.
  await page.route(/\/api\/reports\/[^/]+\/structure$/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1800));
    await route.continue();
  });
  await page.route(/\/api\/reports\/[^/]+\/analyse$/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1800));
    await route.continue();
  });

  await page.goto(`${FRONTEND_URL}/app/upload`, { waitUntil: 'networkidle' });
  await shot(page, '01-upload.png');

  await page.locator('input[type="file"]').setInputFiles(FIXTURE);
  await page.locator('input[type="checkbox"]').check();
  await shot(page, '02-upload-ready.png');

  const uploadResponsePromise = page.waitForResponse(
    (response) =>
      response.url() === `${API_URL}/api/reports` &&
      response.request().method() === 'POST',
    { timeout: 30000 },
  );
  await page.getByRole('button', { name: /Start analysis/i }).click();
  const uploadResponse = await uploadResponsePromise;
  const uploaded = await uploadResponse.json();
  results.report_id = uploaded.id;
  check('report uploaded to isolated backend', uploadResponse.status() === 201);

  await page.getByText('Processing your report').waitFor({ timeout: 15000 });
  check(
    'processing screen appears',
    await page.locator('.proc-card').isVisible(),
  );

  const initialCardText = await page.locator('.proc-card').innerText();
  check(
    'no simulated percentage is shown',
    !/\d+\s*%/.test(initialCardText),
    initialCardText.replace(/\s+/g, ' ').slice(0, 120),
  );

  const timelineItems = await page.locator('.proc-timeline__item').count();
  check('five-stage timeline is rendered', timelineItems === 5, `count=${timelineItems}`);
  const timelineLabels = await page
    .locator('.proc-timeline__label')
    .allInnerTexts();
  check(
    'timeline stages match the specified sequence',
    JSON.stringify(timelineLabels) ===
      JSON.stringify([
        'Document validated',
        'Preparing pages',
        'Extracting text and locating measurements',
        'Structuring measurements',
        'Preparing verification',
      ]),
    timelineLabels.join(' | '),
  );

  const ariaValueNow = await page
    .locator('.proc-activity')
    .getAttribute('aria-valuenow');
  check('activity bar is indeterminate', ariaValueNow === null);

  await page.getByText('Reading your report', { exact: true }).waitFor({
    timeout: 30000,
  });

  const elapsed1 = await page.locator('.proc-elapsed').innerText();
  check('elapsed timer is visible', /^\d{2}:\d{2}$/.test(elapsed1), elapsed1);

  const beamAnimation = await page
    .locator('.proc-doc__beam')
    .evaluate((element) => getComputedStyle(element).animationName);
  check(
    'scanner beam animation is running',
    beamAnimation.includes('proc-scan'),
    beamAnimation,
  );

  const pageActivityVisible = await page
    .getByText(/Reading page \d+ of \d+/)
    .first()
    .isVisible()
    .catch(() => false);
  check(
    'genuine page-level activity is displayed',
    pageActivityVisible,
    'Reading page N of M',
  );

  await shot(page, '03-extracting-live.png');

  await page.waitForTimeout(6000);
  const elapsed2 = await page.locator('.proc-elapsed').innerText();
  check(
    'elapsed timer advances during long OCR',
    timerSeconds(elapsed2) > timerSeconds(elapsed1),
    `${elapsed1} → ${elapsed2}`,
  );
  await shot(page, '04-extracting-long-ocr.png');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reducedBeam = await page
    .locator('.proc-doc__beam')
    .evaluate((element) => getComputedStyle(element).animationName);
  check(
    'prefers-reduced-motion stops the scanner beam',
    reducedBeam === 'none',
    reducedBeam,
  );
  await shot(page, '05-reduced-motion.png');
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  const sawStructuring = await page
    .getByText('Organising your measurements', { exact: true })
    .waitFor({ timeout: 150000 })
    .then(() => true)
    .catch(() => false);
  check('structuring stage is observed', sawStructuring);
  if (sawStructuring) {
    const elapsed3 = await page.locator('.proc-elapsed').innerText();
    check(
      'timer does not reset entering structuring',
      timerSeconds(elapsed3) >= timerSeconds(elapsed2),
      `${elapsed2} → ${elapsed3}`,
    );
    await shot(page, '06-structuring.png');
  }

  const sawAnalysing = await page
    .getByText('Preparing your verification review', { exact: true })
    .waitFor({ timeout: 60000 })
    .then(() => true)
    .catch(() => false);
  check('verification preparation stage is observed', sawAnalysing);
  if (sawAnalysing) {
    const elapsed4 = await page.locator('.proc-elapsed').innerText();
    check(
      'timer does not reset entering verification preparation',
      timerSeconds(elapsed4) >= timerSeconds(elapsed2),
      `${elapsed2} → ${elapsed4}`,
    );
    await shot(page, '07-preparing-verification.png');
  }

  const sawReady = await page
    .getByText('Your report is ready', { exact: true })
    .waitFor({ timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  check('processing completion state is shown', sawReady);
  if (sawReady) {
    await shot(page, '08-processing-complete.png');
  }

  await page
    .getByText('Your report is ready to review.')
    .waitFor({ timeout: 30000 });
  check(
    'completion hands off to the existing done screen',
    await page.locator('.upload-done-card').isVisible(),
  );
  await shot(page, '09-complete-handoff.png');

  await page.getByRole('button', { name: /Review & verify results/i }).click();
  await page.waitForURL(/\/verify/, { timeout: 15000 });
  await page.locator('.verification-rows').waitFor({ timeout: 30000 });
  await page.waitForTimeout(500);
  check('verification route is reached', /\/verify$/.test(new URL(page.url()).pathname));
  await shot(page, '10-verification.png', true);

  // Failure state: intercept only the extract call. The upload itself still
  // succeeds, and the frontend must surface a recoverable failure.
  const failurePage = await context.newPage();
  await failurePage.route(/\/api\/reports\/[^/]+\/extract$/, (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Simulated extraction failure for QA' }),
    }),
  );

  await uploadAndStart(failurePage);
  await failurePage.getByText('Something went wrong').waitFor({ timeout: 20000 });
  check(
    'failure state replaces the running state',
    await failurePage.locator('.proc-visual--error').isVisible(),
  );
  check(
    'failure stops the scanner animation',
    (await failurePage.locator('.proc-doc__beam').count()) === 0,
  );
  check(
    'failure offers the existing retry action',
    await failurePage.getByRole('link', { name: /Try again/i }).isVisible(),
  );
  await shot(failurePage, '11-failure.png');

  check(
    'no uncaught console errors',
    results.console_errors.length === 0,
    results.console_errors.join(' | ').slice(0, 300),
  );

  await browser.close();

  fs.writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2), 'utf8');
  console.log(`\nRESULTS ${RESULTS_PATH}`);
  console.log(`PASSED ${results.passed}  FAILED ${results.failed}`);
  if (results.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  results.failed += 1;
  results.checks.push({
    name: 'qa script completed',
    status: 'failed',
    detail: error.message,
  });
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  fs.writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2), 'utf8');
  console.error(error);
  process.exit(1);
});
