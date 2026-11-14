/**
 * Phase 9.7.4 digital PDF source highlight E2E validation.
 */
const { chromium } = require('playwright');
const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const FRONTEND_URL = 'http://localhost:5173';
const API_URL = 'http://127.0.0.1:8000';
const QA_DIR = path.resolve(__dirname);
const ROOT_DIR = path.resolve(QA_DIR, '..', '..', '..');
const FIXTURES_DIR = path.resolve(ROOT_DIR, 'backend', 'tests', 'fixtures');
const DIGITAL_PDF = path.join(FIXTURES_DIR, 'phase9_5', 'digital_edge_cases.pdf');
const IMAGE_FIXTURE = path.join(FIXTURES_DIR, 'phase8_1_accuracy', 'cbc_report.png');
const DATA_DIR =
  process.env.LABLENS_QA_DATA_DIR ||
  'C:\\Users\\sureshr\\AppData\\Local\\Temp\\opencode\\lablens-phase974-e2e';
const DB_PATH = path.join(DATA_DIR, 'lablens.db');
const SCREENSHOT_DIR = path.join(QA_DIR, 'screenshots', 'phase9_7_4');
const RESULTS_PATH = path.join(QA_DIR, 'phase9_7_4_results.json');

const results = {
  generated_at: new Date().toISOString(),
  frontend_url: FRONTEND_URL,
  api_url: API_URL,
  checks: [],
  screenshots: [],
  passed: 0,
  failed: 0,
};

function check(name, condition, detail) {
  if (condition) {
    results.passed += 1;
    results.checks.push({ name, status: 'passed', detail: detail ?? null });
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
    return;
  }
  results.failed += 1;
  results.checks.push({ name, status: 'failed', detail: detail ?? null });
  throw new Error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function jsonFetch(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();
  if (!res.ok) throw new Error(`${options?.method || 'GET'} ${url} -> ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

function updateBbox(measurementId, value) {
  const code = [
    'import sqlite3, sys',
    'db, measurement_id, value = sys.argv[1], sys.argv[2], sys.argv[3]',
    'con = sqlite3.connect(db)',
    'con.execute("UPDATE report_measurements SET source_bbox = ? WHERE id = ?", (None if value == "__NULL__" else value, measurement_id))',
    'con.commit()',
    'con.close()',
  ].join('\n');
  execFileSync('python', ['-c', code, DB_PATH, measurementId, value], { stdio: 'pipe' });
}

function expectedGeometry(measurement, pageWidth, pageHeight) {
  const [x0, y0, x1, y1] = measurement.source_bbox;
  return {
    left: (x0 / pageWidth) * 100,
    top: (y0 / pageHeight) * 100,
    width: ((x1 - x0) / pageWidth) * 100,
    height: ((y1 - y0) / pageHeight) * 100,
  };
}

async function actualGeometry(page) {
  const image = await page.locator('.verification-preview-img').boundingBox();
  const highlight = await page.locator('[data-testid="measurement-highlight"]').boundingBox();
  assert.ok(image, 'Document image has no bounding box');
  assert.ok(highlight, 'Highlight has no bounding box');
  return {
    left: ((highlight.x - image.x) / image.width) * 100,
    top: ((highlight.y - image.y) / image.height) * 100,
    width: (highlight.width / image.width) * 100,
    height: (highlight.height / image.height) * 100,
  };
}

async function assertGeometry(page, measurement, pageWidth, pageHeight, label) {
  const expected = expectedGeometry(measurement, pageWidth, pageHeight);
  const actual = await actualGeometry(page);
  const deltas = {};
  for (const key of ['left', 'top', 'width', 'height']) {
    deltas[key] = Math.abs(actual[key] - expected[key]);
  }
  const worst = Math.max(...Object.values(deltas));
  check(
    `${label}: highlight geometry within 0.5 percentage points`,
    worst <= 0.5,
    `expected ${JSON.stringify(expected)}, actual ${JSON.stringify(actual)}, max delta ${worst.toFixed(4)} pp`,
  );
}

function rowByName(page, name) {
  return page.locator('.verification-row').filter({
    has: page.locator('.verification-row__name').filter({ hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }),
  });
}

async function screenshot(page, name, directory = SCREENSHOT_DIR) {
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, name);
  await page.screenshot({ path: file, fullPage: true });
  results.screenshots.push(file);
}

(async () => {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const health = await jsonFetch(`${API_URL}/api/health`);
  check('Backend health is ok', health.status === 'ok', JSON.stringify(health));

  // Upload and process digital PDF.
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(DIGITAL_PDF)], { type: 'application/pdf' }), 'digital_edge_cases.pdf');
  form.append('consent', 'true');
  const report = await jsonFetch(`${API_URL}/api/reports`, { method: 'POST', body: form });
  check('Digital PDF uploaded', report.file_extension === 'pdf', report.id);

  await jsonFetch(`${API_URL}/api/reports/${report.id}/extract`, { method: 'POST' });
  const extraction = await jsonFetch(`${API_URL}/api/reports/${report.id}/extraction`);
  check('Digital PDF extracted', extraction.status === 'completed' || extraction.status === 'review_required', extraction.status);

  await jsonFetch(`${API_URL}/api/reports/${report.id}/structure`, { method: 'POST' });
  const measurements = (await jsonFetch(`${API_URL}/api/reports/${report.id}/measurements`)).measurements;

  const validMeasurements = measurements.filter((m) => Array.isArray(m.source_bbox) && m.source_bbox.length === 4);
  check('Digital measurements with source_bbox exist', validMeasurements.length >= 3, `${validMeasurements.length} measurements`);

  const page1Measurement = validMeasurements.find((m) => m.page_number === 1);
  const page2Measurement = validMeasurements.find((m) => m.page_number === 2);
  check('A valid page-1 measurement exists', Boolean(page1Measurement), page1Measurement?.test_name_original);
  check('A valid page-2 measurement exists', Boolean(page2Measurement), page2Measurement?.test_name_original);

  const selectedThree = validMeasurements.slice(0, 3);
  const pageWidth = extraction.pages.find((p) => p.page_number === selectedThree[0].page_number)?.page_width;
  const pageHeight = extraction.pages.find((p) => p.page_number === selectedThree[0].page_number)?.page_height;
  check('Stored page dimensions are available', pageWidth > 0 && pageHeight > 0, `${pageWidth} x ${pageHeight}`);

  // Browser checks.
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(e.message));

  try {
    await page.goto(`${FRONTEND_URL}/app/reports/${report.id}/verify`, { waitUntil: 'networkidle' });
    await page.locator('.verification-row').first().waitFor();

    // Coordinate checks for three measurements.
    for (let i = 0; i < selectedThree.length; i++) {
      const measurement = selectedThree[i];
      const row = rowByName(page, measurement.test_name_normalized || measurement.test_name_original);
      await row.locator('.verification-row__info').click();
      await page.waitForTimeout(250);
      await page.waitForFunction(
        () => document.querySelector('[data-testid="measurement-highlight"]') !== null,
        null,
        { timeout: 15000 },
      );
      const dims = extraction.pages.find((p) => p.page_number === measurement.page_number);
      await assertGeometry(page, measurement, dims.page_width, dims.page_height, `Digital measurement ${i + 1}`);
      const sourceLabel = await row.locator('.verification-row__source').innerText();
      check(
        `Digital measurement ${i + 1} source label is digital`,
        /Source: Page \d+/.test(sourceLabel) && !/OCR score/.test(sourceLabel),
        sourceLabel,
      );
      check(
        `Digital measurement ${i + 1} does not display OCR score`,
        !/OCR score/.test(sourceLabel),
        sourceLabel,
      );
      await screenshot(page, `phase9_7_4_digital_highlight_${i + 1}.png`);
    }

    // Highlight moves to a second measurement.
    const firstMeasurement = selectedThree[0];
    const secondMeasurement = selectedThree[1];
    const secondRow = rowByName(page, secondMeasurement.test_name_normalized || secondMeasurement.test_name_original);
    await secondRow.locator('.verification-row__info').click();
    await page.waitForTimeout(250);
    await page.waitForFunction(
      () => document.querySelector('[data-testid="measurement-highlight"]') !== null,
      null,
      { timeout: 15000 },
    );
    const secondDims = extraction.pages.find((p) => p.page_number === secondMeasurement.page_number);
    await assertGeometry(page, secondMeasurement, secondDims.page_width, secondDims.page_height, 'Digital second measurement');
    check(
      'Highlight moved to the second measurement',
      (await rowByName(page, firstMeasurement.test_name_normalized || firstMeasurement.test_name_original).getAttribute('class')).includes('is-selected') === false,
      'previous measurement no longer selected',
    );

    // Page switching removes stale highlight until a valid measurement is selected.
    if (page2Measurement) {
      const page2Row = rowByName(page, page2Measurement.test_name_normalized || page2Measurement.test_name_original);
      await page2Row.locator('.verification-row__info').click();
      await page.waitForFunction(
        (expectedPage) => {
          const image = document.querySelector('.verification-preview-img');
          return image instanceof HTMLImageElement && image.src.includes(`/pages/${expectedPage}/image`);
        },
        page2Measurement.page_number,
        { timeout: 15000 },
      );
      await page.waitForFunction(
        () => document.querySelector('[data-testid="measurement-highlight"]') !== null,
        null,
        { timeout: 15000 },
      );
      await page.waitForTimeout(500);
      const page2Dims = extraction.pages.find((p) => p.page_number === page2Measurement.page_number);
      await assertGeometry(page, page2Measurement, page2Dims.page_width, page2Dims.page_height, 'Digital page-2 measurement');
      await screenshot(page, 'phase9_7_4_digital_page2_highlight.png');
    }

    // Fallback: mutate one measurement bbox to null and verify iframe fallback.
    const fallbackMeasurement = validMeasurements[0];
    updateBbox(fallbackMeasurement.id, '__NULL__');
    await page.goto(`${FRONTEND_URL}/app/reports/${report.id}/verify`, { waitUntil: 'networkidle' });
    await page.locator('.verification-row').first().waitFor();
    const fallbackRow = rowByName(page, fallbackMeasurement.test_name_normalized || fallbackMeasurement.test_name_original);
    await fallbackRow.locator('.verification-row__info').click();
    await page.waitForTimeout(300);
    check(
      'Fallback measurement shows no highlight',
      (await page.locator('[data-testid="measurement-highlight"]').count()) === 0,
      '0 highlights',
    );
    check(
      'Fallback measurement retains iframe preview',
      (await page.locator('.verification-preview-iframe').count()) === 1,
      'iframe preview',
    );
    check(
      'Fallback measurement remains selectable',
      (await fallbackRow.getAttribute('class')).includes('is-selected'),
      await fallbackRow.getAttribute('class'),
    );
    await screenshot(page, 'phase9_7_4_digital_fallback.png');

    // Invalid bbox fallback.
    const invalidMeasurement = validMeasurements[1];
    updateBbox(invalidMeasurement.id, JSON.stringify([500, 10, 100, 40]));
    await page.goto(`${FRONTEND_URL}/app/reports/${report.id}/verify`, { waitUntil: 'networkidle' });
    await page.locator('.verification-row').first().waitFor();
    const invalidRow = rowByName(page, invalidMeasurement.test_name_normalized || invalidMeasurement.test_name_original);
    await invalidRow.locator('.verification-row__info').click();
    await page.waitForTimeout(300);
    check(
      'Invalid bbox shows no highlight',
      (await page.locator('[data-testid="measurement-highlight"]').count()) === 0,
      '0 highlights',
    );
    check(
      'Invalid bbox retains iframe preview',
      (await page.locator('.verification-preview-iframe').count()) === 1,
      'iframe preview',
    );
    await screenshot(page, 'phase9_7_4_digital_invalid_bbox.png');

    // Scanned/image compatibility check.
    const imageForm = new FormData();
    imageForm.append('file', new Blob([fs.readFileSync(IMAGE_FIXTURE)], { type: 'image/png' }), 'cbc_report.png');
    imageForm.append('consent', 'true');
    const imageReport = await jsonFetch(`${API_URL}/api/reports`, { method: 'POST', body: imageForm });
    await jsonFetch(`${API_URL}/api/reports/${imageReport.id}/extract`, { method: 'POST' });
    await jsonFetch(`${API_URL}/api/reports/${imageReport.id}/structure`, { method: 'POST' });
    const imageMeasurements = (await jsonFetch(`${API_URL}/api/reports/${imageReport.id}/measurements`)).measurements;
    const imageMeasurement = imageMeasurements.find((m) => Array.isArray(m.source_bbox));
    check('Image report has a source-guided measurement', Boolean(imageMeasurement), imageMeasurement?.test_name_original);

    await page.goto(`${FRONTEND_URL}/app/reports/${imageReport.id}/verify`, { waitUntil: 'networkidle' });
    await page.locator('.verification-row').first().waitFor();
    const imageRow = rowByName(page, imageMeasurement.test_name_normalized || imageMeasurement.test_name_original);
    await imageRow.locator('.verification-row__info').click();
    await page.waitForTimeout(250);
    await page.waitForFunction(
      () => document.querySelector('[data-testid="measurement-highlight"]') !== null,
      null,
      { timeout: 15000 },
    );
    const imageExtraction = await jsonFetch(`${API_URL}/api/reports/${imageReport.id}/extraction`);
    const imagePage = imageExtraction.pages[0];
    await assertGeometry(page, imageMeasurement, imagePage.page_width, imagePage.page_height, 'Image report highlight');
    await screenshot(page, 'phase9_7_4_image_highlight.png');

    check(
      'No browser console/page errors',
      consoleErrors.length === 0,
      consoleErrors.join(' | ') || 'none',
    );
  } finally {
    await context.close();
    await browser.close();
    await jsonFetch(`${API_URL}/api/reports/${report.id}`, { method: 'DELETE' }).catch(() => null);
  }

  results.finished_at = new Date().toISOString();
  fs.writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2));
  console.log(`\n${results.passed} checks passed, ${results.failed} failed.`);
  console.log(`Results: ${RESULTS_PATH}`);
  process.exit(0);
})().catch((error) => {
  results.finished_at = new Date().toISOString();
  results.failed = Math.max(results.failed, 1);
  results.error = error.message;
  fs.mkdirSync(path.dirname(RESULTS_PATH), { recursive: true });
  fs.writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2));
  console.error(`\nE2E FAILED: ${error.message}`);
  console.error(`Results: ${RESULTS_PATH}`);
  process.exit(1);
});
