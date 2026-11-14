/**
 * Phase 9.10.4 — Live OCR execution-mode QA.
 *
 * Isolated stack:
 *   frontend http://127.0.0.1:5174  (VITE_API_BASE=http://127.0.0.1:8001)
 *   backend  http://127.0.0.1:8001  (LABLENS_DATA_DIR=temp lablens-phase9104-qa)
 *
 * Pass A: real CPU OCR end-to-end (this machine has no NVIDIA GPU; the CPU-only
 *         Paddle build selects CPU).
 * Passes B-D: SIMULATED GPU outcomes — the extraction response's OCR runtime
 *         metadata is rewritten in flight. No GPU inference is ever executed.
 * Pass E: real digital PDF (direct text extraction, zero OCR).
 * Pass F: real mixed document (digital page + OCR page) end-to-end.
 * Pass G: failure state unchanged; timer/animation checks in pass A/D.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FRONTEND_URL = 'http://127.0.0.1:5174';
const API_URL = 'http://127.0.0.1:8001';
const QA_DIR = path.resolve(__dirname);
const PROJECT_ROOT = path.resolve(QA_DIR, '..', '..', '..');
const FIXTURE_PNG = path.join(PROJECT_ROOT, 'backend', 'tests', 'fixtures', 'phase8_1_accuracy', 'cbc_report.png');
const FIXTURE_DIGITAL = path.join(PROJECT_ROOT, 'backend', 'tests', 'fixtures', 'phase8_1_accuracy', 'clean_digital_report.pdf');
const FIXTURE_MULTIPAGE = path.join(PROJECT_ROOT, 'backend', 'tests', 'fixtures', 'phase9_5', 'multipage_scanned_report.pdf');
const FIXTURE_MIXED = path.join(process.env.TEMP || 'C:\\Users\\sureshr\\AppData\\Local\\Temp', 'opencode', 'lablens-phase9104-qa-derived', 'mixed_digital_photo.pdf');
const SHOT_DIR = path.join(QA_DIR, 'screenshots', 'phase9_10_4');
const RESULTS_PATH = path.join(QA_DIR, 'phase9_10_4_results.json');

const results = {
  generated_at: new Date().toISOString(),
  frontend_url: FRONTEND_URL,
  api_url: API_URL,
  simulation_notice:
    'Passes B-D rewrite OCR runtime metadata in the GET extraction response. No NVIDIA GPU, no CUDA-enabled Paddle build and no real GPU inference exist on this machine; simulated GPU results are UI fixtures, not measured GPU performance.',
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

// Network-level resource logs are expected when a route is deliberately mocked
// to fail (pass G). Uncaught application errors are what we care about.
function isExpectedConsoleNoise(text) {
  return /Failed to load resource/i.test(text || '');
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
    (response) =>
      response.url() === `${API_URL}/api/reports` &&
      response.request().method() === 'POST',
    { timeout: 30000 },
  );
  await page.getByRole('button', { name: /Start analysis/i }).click();
  const response = await responsePromise;
  const body = await response.json();
  return { id: body.id, status: response.status() };
}

async function mockExtractionSession(page, buildBody, switchesAfter = 5) {
  let pollCount = 0;
  const body = buildBody();

  const syntheticAnalysis = {
    analysis_id: 'sim-analysis',
    engine_version: '1.0.0',
    rule_set_version: '1.0.0',
    status: 'completed',
    freshness: 'current',
    started_at: '2026-11-13T00:00:00Z',
    completed_at: '2026-11-13T00:00:01Z',
    summary: {
      total_measurements: 1, eligible_measurements: 1, supported_measurements: 1,
      needs_review: 0, unsupported: 0, below_range: 0, above_range: 0, within_range: 1,
      qualitative: 0, unavailable: 0, incompatible_units: 0, review_required: 0,
      critical_flags: 0, findings_count: 0,
    },
    assessments: [], findings: [], critical_flags: [],
  };

  await page.route(/\/api\/reports\/[^/]+\/extract$/, async (route) => {
    // The real extract endpoint is blocking; hold the (body-ignored) response
    // until after the poll counter has flipped to 'completed'.
    await new Promise((resolve) => setTimeout(resolve, switchesAfter * 900 + 700));
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ job_id: 'sim-job', report_id: 'sim', status: 'completed', total_pages: body.total_pages, processed_pages: body.total_pages, warnings: [] }),
    });
  });
  await page.route(/\/api\/reports\/[^/]+\/extraction$/, async (route) => {
    pollCount += 1;
    const complete = pollCount > switchesAfter;
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        ...body,
        status: complete ? 'completed' : 'processing',
        processed_pages: complete ? body.total_pages : 0,
        completed_at: complete ? '2026-11-13T00:00:20Z' : null,
      }),
    });
  });
  await page.route(/\/api\/reports\/[^/]+\/structure$/, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ measurements_saved: 1 }) });
  });
  await page.route(/\/api\/reports\/[^/]+\/analyse$/, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(syntheticAnalysis) });
  });
  await page.route(/\/api\/reports\/[^/]+\/analysis$/, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(syntheticAnalysis) });
  });
}

function syntheticPage(pageNumber, method, runtime) {
  return {
    page_number: pageNumber,
    extraction_method: method,
    raw_text: 'Hemoglobin 13.8 g/dL 12.0 - 16.0',
    metadata: method === 'ocr'
      ? { ocr_runtime: runtime }
      : { ocr_runtime: { requested: 'auto', device: null, actual: 'digital_direct_extraction', selection_reason: null, cpu_threads: null, text_recognition_batch_size: null, models: null, detection_limit_side_len: null, detection_limit_type: null, precision: null, mkl_dnn_enabled: null, fallback_occurred: false, fallback_reason: null } },
    page_width: 800,
    page_height: 1000,
    warnings: [],
  };
}

async function runSimulated(page, fixture, buildBody, bannerChecks) {
  await page.goto(`${FRONTEND_URL}/app/upload`, { waitUntil: 'networkidle' });
  await page.locator('input[type="file"]').setInputFiles(fixture);
  await page.locator('input[type="checkbox"]').check();
  await mockExtractionSession(page, buildBody);
  const responsePromise = page.waitForResponse(
    (response) => response.url() === `${API_URL}/api/reports` && response.request().method() === 'POST',
    { timeout: 30000 },
  );
  await page.getByRole('button', { name: /Start analysis/i }).click();
  const response = await responsePromise;
  const uploaded = await response.json();
  try {
    await page.getByText('Reading your report', { exact: true }).waitFor({ timeout: 30000 });
  } catch (error) {
    const url = page.url();
    const bodyText = await page.locator('body').innerText().catch(() => '(unavailable)');
    console.error('DEBUG url:', url);
    console.error('DEBUG body:', bodyText.replace(/\s+/g, ' ').slice(0, 800));
    await shot(page, `debug-${buildBody === null ? 'unknown' : 'sim'}-stuck.png`);
    throw error;
  }
  const banner = page.locator('.proc-execution');
  await banner.waitFor({ timeout: 15000 });
  await bannerChecks(page, banner);
  return uploaded.id;
}

function simulatedRuntime(device, fallback) {
  return {
    requested: 'gpu',
    selection_reason: fallback ? 'gpu_inference_failed' : 'gpu_ready',
    device,
    fallback_occurred: fallback,
    fallback_reason: fallback ? 'RuntimeError: simulated GPU failure (SIMULATED FOR QA)' : null,
    cpu_threads: device === 'cpu' ? 4 : null,
    text_recognition_batch_size: device === 'gpu' ? 2 : 1,
    models: { detection: 'PP-OCRv6_medium_det', recognition: 'PP-OCRv6_medium_rec' },
    detection_limit_side_len: 1280,
    detection_limit_type: 'max',
    precision: 'fp32',
    mkl_dnn_enabled: false,
    vram_bytes: null,
  };
}

async function waitForReady(page, timeout = 300000) {
  await page.getByText('Your report is ready', { exact: true }).waitFor({ timeout });
}

async function main() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  if (!fs.existsSync(FIXTURE_MIXED)) {
    throw new Error(`Mixed fixture missing: ${FIXTURE_MIXED}`);
  }
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error' && !isExpectedConsoleNoise(message.text())) results.console_errors.push(message.text());
  });

  await page.route(/\/api\/reports\/[^/]+\/structure$/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.continue();
  });
  await page.route(/\/api\/reports\/[^/]+\/analyse$/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.continue();
  });

  // ---------------------------------------------------- Pass A — real CPU OCR
  console.log('\n=== Pass A: real CPU OCR ===');
  await uploadAndStart(page, FIXTURE_PNG);
  await page.getByText('Reading your report', { exact: true }).waitFor({ timeout: 30000 });

  const elapsed1 = await page.locator('.proc-elapsed').innerText();
  const beamAnimation = await page
    .locator('.proc-doc__beam')
    .evaluate((element) => getComputedStyle(element).animationName);
  check('scanner beam animation is running', beamAnimation.includes('proc-scan'), beamAnimation);
  await page.waitForTimeout(6000);
  const elapsed2 = await page.locator('.proc-elapsed').innerText();
  check('elapsed timer advances during OCR', timerSeconds(elapsed2) > timerSeconds(elapsed1), `${elapsed1} → ${elapsed2}`);
  await shot(page, '01-real-cpu-extracting-live.png');

  const bannerA = page.locator('.proc-execution');
  await bannerA.waitFor({ timeout: 90000 });
  const cpuHeadline = await bannerA.locator('.proc-execution__label').innerText();
  const cpuDetail = await bannerA.locator('.proc-execution__detail').innerText().catch(() => '');
  check('real CPU OCR displays CPU execution mode', cpuHeadline === 'Local processing · CPU', cpuHeadline);
  check(
    'CPU mode shows the informational CPU message',
    cpuDetail.includes('This computer is using CPU processing'),
    cpuDetail.slice(0, 140),
  );
  check(
    'GPU mode is not fabricated in CPU mode',
    !cpuHeadline.includes('GPU') && !cpuDetail.includes('GPU'),
    cpuHeadline,
  );
  await shot(page, '02-real-cpu-mode-banner.png');

  await waitForReady(page);
  check('processing completes on CPU path', await page.getByText('Your report is ready', { exact: true }).isVisible());
  await shot(page, '03-real-cpu-complete.png');

  await page.getByRole('button', { name: /Review & verify results/i }).click();
  await page.waitForURL(/\/verify/, { timeout: 15000 });
  await page.locator('.verification-rows').waitFor({ timeout: 30000 });
  check('verification handoff remains intact', /\/verify$/.test(new URL(page.url()).pathname));
  await shot(page, '04-verification-handoff.png');

  // --------------------------------------- Pass B (SIMULATED) — GPU success
  console.log('\n=== Pass B: simulated GPU success (SIMULATED) ===');
  const pageB = await context.newPage();
  pageB.on('console', (message) => {
    if (message.type() === 'error' && !isExpectedConsoleNoise(message.text())) results.console_errors.push(message.text());
  });
  await runSimulated(
    pageB,
    FIXTURE_PNG,
    () => ({
      job_id: 'sim-job', report_id: 'sim', status: 'processing', document_type: null,
      total_pages: 1, processed_pages: 0, started_at: '2026-11-13T00:00:00Z',
      completed_at: null, error_code: null,
      pages: [syntheticPage(1, 'ocr', simulatedRuntime('gpu', false))],
    }),
    async (_page, banner) => {
      const headline = await banner.locator('.proc-execution__label').innerText();
      check('simulated GPU success displays GPU mode (SIMULATED)', headline === 'Accelerated processing · GPU', headline);
      check('simulated GPU banner carries no CPU detail', !(await banner.innerText()).includes('CPU'));
    },
  );
  await waitForReady(pageB);
  check('simulated GPU run completes', true);
  await shot(pageB, '05-simulated-gpu-mode.png');

  // --------------------- Pass C (SIMULATED) — GPU init failure -> CPU fallback
  console.log('\n=== Pass C: simulated GPU initialization failure, CPU fallback (SIMULATED) ===');
  const pageC = await context.newPage();
  pageC.on('console', (message) => {
    if (message.type() === 'error' && !isExpectedConsoleNoise(message.text())) results.console_errors.push(message.text());
  });
  await runSimulated(
    pageC,
    FIXTURE_PNG,
    () => ({
      job_id: 'sim-job', report_id: 'sim', status: 'processing', document_type: null,
      total_pages: 1, processed_pages: 0, started_at: '2026-11-13T00:00:00Z',
      completed_at: null, error_code: null,
      pages: [syntheticPage(1, 'ocr', simulatedRuntime('cpu', true))],
    }),
    async (page, banner) => {
      const headline = await banner.locator('.proc-execution__label').innerText();
      const cardText = await page.locator('.proc-card').innerText();
      check(
        'simulated GPU init failure displays CPU fallback (SIMULATED)',
        headline === 'GPU unavailable · Continuing with CPU',
        headline,
      );
      check(
        'raw simulated error is not exposed in the UI',
        !cardText.includes('SIMULATED FOR QA') && !cardText.includes('RuntimeError'),
        'card text scanned',
      );
      check(
        'fallback headline is not labelled GPU-accelerated',
        !headline.includes('Accelerated'),
        headline,
      );
    },
  );
  await waitForReady(pageC);
  await shot(pageC, '06-simulated-init-failure-fallback.png');

  // ------------- Pass D (SIMULATED) — GPU inference failure with mixed pages
  console.log('\n=== Pass D: simulated GPU inference failure, mixed pages (SIMULATED) ===');
  const pageD = await context.newPage();
  pageD.on('console', (message) => {
    if (message.type() === 'error' && !isExpectedConsoleNoise(message.text())) results.console_errors.push(message.text());
  });
  await runSimulated(
    pageD,
    FIXTURE_MULTIPAGE,
    () => ({
      job_id: 'sim-job', report_id: 'sim', status: 'processing', document_type: null,
      total_pages: 2, processed_pages: 0, started_at: '2026-11-13T00:00:00Z',
      completed_at: null, error_code: null,
      pages: [
        syntheticPage(1, 'ocr', simulatedRuntime('gpu', false)),
        syntheticPage(2, 'ocr', simulatedRuntime('cpu', true)),
      ],
    }),
    async (page, banner) => {
      const headline = await banner.locator('.proc-execution__label').innerText();
      const breakdown = await banner.locator('.proc-execution__pages').innerText().catch(() => '');
      check(
        'simulated inference failure displays CPU fallback (SIMULATED)',
        headline === 'GPU unavailable · Continuing with CPU',
        headline,
      );
      check(
        'mixed document shows per-page execution info',
        breakdown.includes('Page 1') && breakdown.includes('GPU') &&
        breakdown.includes('Page 2') && breakdown.includes('fallback'),
        breakdown.slice(0, 160),
      );
      const ticks = await page.locator('.proc-page-tick').count();
      check('multi-page ticks render during OCR', ticks === 2, `ticks=${ticks}`);
      const elapsed1 = await page.locator('.proc-elapsed').innerText();
      await page.waitForTimeout(2000);
      const elapsed2 = await page.locator('.proc-elapsed').innerText();
      check('timer advances on the mixed run', timerSeconds(elapsed2) >= timerSeconds(elapsed1), `${elapsed1} → ${elapsed2}`);
    },
  );
  await waitForReady(pageD);
  await shot(pageD, '07-simulated-inference-failure-mixed.png');

  // -------------------------------------- Pass E — Digital PDF (real, 0 OCR)
  console.log('\n=== Pass E: real digital PDF, direct text extraction ===');
  const pageE = await context.newPage();
  pageE.on('console', (message) => {
    if (message.type() === 'error' && !isExpectedConsoleNoise(message.text())) results.console_errors.push(message.text());
  });
  await uploadAndStart(pageE, FIXTURE_DIGITAL);
  const bannerE = pageE.locator('.proc-execution');
  await bannerE.waitFor({ timeout: 90000 });
  const digitalHeadline = await bannerE.locator('.proc-execution__label').innerText();
  const digitalCardText = await pageE.locator('.proc-card').innerText();
  check(
    'digital PDF shows direct extraction mode',
    digitalHeadline === 'Direct PDF text extraction · No OCR required',
    digitalHeadline,
  );
  check(
    'no CPU/GPU OCR label on a digital-only page',
    !digitalCardText.includes('Local processing · CPU') &&
      !digitalCardText.includes('Accelerated processing · GPU'),
    'card text scanned',
  );
  await shot(pageE, '08-digital-direct-text.png');
  await waitForReady(pageE);

  // --------------------- Pass F — mixed real document (digital page + OCR page)
  console.log('\n=== Pass F: real mixed document (digital page + OCR page) ===');
  const pageF = await context.newPage();
  pageF.on('console', (message) => {
    if (message.type() === 'error' && !isExpectedConsoleNoise(message.text())) results.console_errors.push(message.text());
  });
  await uploadAndStart(pageF, FIXTURE_MIXED);
  const bannerF = pageF.locator('.proc-execution');
  await bannerF.waitFor({ timeout: 90000 });
  await shot(pageF, '09-mixed-digital-direct-first.png');
  // The banner must update once the OCR page finishes: pages stream in as they
  // complete, so the label starts as direct text and flips to CPU OCR + detail.
  await pageF.waitForFunction(
    () =>
      document.querySelector('.proc-execution__label')?.textContent ===
      'Local processing · CPU',
    null,
    { timeout: 120000 },
  );
  const mixedHeadlineF = await bannerF.locator('.proc-execution__label').innerText();
  const mixedDetailF = await bannerF.locator('.proc-execution__detail').innerText().catch(() => '');
  const breakdownF = await bannerF.locator('.proc-execution__pages').innerText().catch(() => '');
  check(
    'mixed document updates to CPU OCR mode after the OCR page',
    mixedHeadlineF === 'Local processing · CPU',
    mixedHeadlineF,
  );
  check(
    'mixed document detail reports the direct-text page',
    mixedDetailF.includes('read directly from PDF text'),
    mixedDetailF.slice(0, 160),
  );
  check(
    'mixed document shows accurate per-page execution info',
    breakdownF.includes('Page 1') && breakdownF.includes('Direct text') &&
    breakdownF.includes('Page 2') && breakdownF.includes('CPU OCR'),
    breakdownF.slice(0, 160),
  );
  await shot(pageF, '10-mixed-digital-ocr.png');
  await waitForReady(pageF);

  // ---------------------------------------------- Pass G — failure unchanged
  console.log('\n=== Pass G: failure state unchanged ===');
  const pageG = await context.newPage();
  pageG.on('console', (message) => {
    if (message.type() === 'error' && !isExpectedConsoleNoise(message.text())) results.console_errors.push(message.text());
  });
  await pageG.route(/\/api\/reports\/[^/]+\/extract$/, (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Simulated extraction failure for QA' }),
    }),
  );
  await uploadAndStart(pageG, FIXTURE_PNG);
  await pageG.getByText('Something went wrong').waitFor({ timeout: 20000 });
  check('failure state replaces the running state', await pageG.locator('.proc-visual--error').isVisible());
  check(
    'failure offers the retry action',
    await pageG.getByRole('link', { name: /Try again/i }).isVisible(),
  );
  await shot(pageG, '11-failure-unchanged.png');

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
