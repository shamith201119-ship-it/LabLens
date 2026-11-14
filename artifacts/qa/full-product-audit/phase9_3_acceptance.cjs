/**
 * Phase 9.3 visual source verification acceptance test.
 *
 * Uses the existing real CBC PNG fixture and the running backend/frontend:
 *   backend  http://127.0.0.1:8000
 *   frontend http://127.0.0.1:5173
 *
 * The backend must run with an isolated LABLENS_DATA_DIR. This script mutates
 * two measurement bboxes in that isolated database to cover missing and invalid
 * provenance. It never changes backend code or the normal development database.
 */

const { chromium } = require('playwright');
const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const FRONTEND_URL = 'http://127.0.0.1:5173';
const API_URL = 'http://127.0.0.1:8000';
const QA_DIR = path.resolve(__dirname);
const FIXTURES_DIR = path.resolve(
  QA_DIR,
  '..',
  '..',
  '..',
  'backend',
  'tests',
  'fixtures',
  'phase8_1_accuracy',
);
const FIXTURE = path.join(FIXTURES_DIR, 'cbc_report.png');
const SCANNED_PDF = path.join(FIXTURES_DIR, 'scanned_cbc_report.pdf');
const DIGITAL_PDF = path.join(FIXTURES_DIR, 'clean_digital_report.pdf');
const MIXED_PDF = path.join(QA_DIR, 'fixtures', 'phase9_4_mixed_report.pdf');
const DATA_DIR =
  process.env.LABLENS_QA_DATA_DIR ||
  'C:\\Users\\sureshr\\AppData\\Local\\Temp\\opencode\\lablens-phase93-qa';
const DB_PATH = path.join(DATA_DIR, 'lablens.db');
const SCREENSHOT_DIR = path.join(QA_DIR, 'screenshots', 'phase9_3');
const PDF_SCREENSHOT_DIR = path.join(QA_DIR, 'screenshots', 'phase9_4');
const RESULTS_PATH = path.join(QA_DIR, 'phase9_3_results.json');

const results = {
  generated_at: new Date().toISOString(),
  frontend_url: FRONTEND_URL,
  api_url: API_URL,
  fixture: FIXTURE,
  report_id: null,
  measurements: {},
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
  if (!res.ok) {
    throw new Error(`${options?.method || 'GET'} ${url} -> ${res.status}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

function updateBbox(measurementId, value) {
  const code = [
    'import sqlite3, sys',
    'db, measurement_id, value = sys.argv[1], sys.argv[2], sys.argv[3]',
    'con = sqlite3.connect(db)',
    'con.execute(',
    '    "UPDATE report_measurements SET source_bbox = ? WHERE id = ?",',
    '    (None if value == "__NULL__" else value, measurement_id),',
    ')',
    'con.commit()',
    'con.close()',
  ].join('\n');
  execFileSync('python', ['-c', code, DB_PATH, measurementId, value], {
    stdio: 'pipe',
  });
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function rowByName(page, name) {
  return page.locator('.verification-row').filter({
    has: page
      .locator('.verification-row__name')
      .filter({ hasText: new RegExp(`^${escapeRegex(name)}$`) }),
  });
}

function rowForMeasurement(page, measurement) {
  const name = measurement.test_name_normalized || measurement.test_name_original;
  return page
    .locator('.verification-row')
    .filter({
      has: page
        .locator('.verification-row__name')
        .filter({ hasText: new RegExp(`^${escapeRegex(name)}$`) }),
    })
    .filter({
      has: page
        .locator('.verification-row__page')
        .filter({ hasText: new RegExp(`^p\\.${measurement.page_number}$`) }),
    });
}

function createMixedPdf() {
  const code = [
    'import fitz, sys',
    'scanned_path, digital_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]',
    'doc = fitz.open()',
    'scanned = fitz.open(scanned_path)',
    'doc.insert_pdf(scanned)',
    'doc.insert_pdf(scanned)',
    'scanned.close()',
    'doc[1].draw_rect(fitz.Rect(820, 10, 890, 45), color=(0.85, 0.1, 0.1), fill=(0.85, 0.1, 0.1))',
    'digital = fitz.open(digital_path)',
    'doc.insert_pdf(digital)',
    'digital.close()',
    'doc.save(out_path)',
    'doc.close()',
  ].join('\n');
  execFileSync('python', ['-c', code, SCANNED_PDF, DIGITAL_PDF, MIXED_PDF], {
    stdio: 'pipe',
  });
}

async function waitForPageImage(page, pageNumber) {
  await page.waitForFunction(
    (expectedPage) => {
      const image = document.querySelector('.verification-preview-img');
      return (
        image instanceof HTMLImageElement &&
        image.complete &&
        image.naturalWidth > 0 &&
        image.src.includes(`/pages/${expectedPage}/image`)
      );
    },
    pageNumber,
    { timeout: 15000 },
  );
}

async function renderedImageSize(page) {
  return page.locator('.verification-preview-img').evaluate((image) => ({
    width: image.naturalWidth,
    height: image.naturalHeight,
  }));
}

async function waitForCount(page, selector, expected, label) {
  const started = Date.now();
  while (Date.now() - started < 8000) {
    const count = await page.locator(selector).count();
    if (count === expected) return count;
    await page.waitForTimeout(100);
  }
  const actual = await page.locator(selector).count();
  throw new Error(`${label}: expected ${expected}, found ${actual}`);
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
  const highlight = await page
    .locator('[data-testid="measurement-highlight"]')
    .boundingBox();
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
  return { expected, actual, deltas };
}

async function selectMeasurement(page, row, label) {
  await row.locator('.verification-row__info').click();
  await page.waitForTimeout(250);
  check(
    `${label}: row selected`,
    (await row.getAttribute('class')).includes('is-selected'),
    await row.getAttribute('class'),
  );
}

async function screenshot(page, name, directory = SCREENSHOT_DIR) {
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, name);
  await page.screenshot({ path: file, fullPage: true });
  results.screenshots.push(file);
}

(async () => {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  fs.mkdirSync(PDF_SCREENSHOT_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(MIXED_PDF), { recursive: true });
  assert.ok(fs.existsSync(FIXTURE), `CBC fixture missing: ${FIXTURE}`);
  assert.ok(fs.existsSync(SCANNED_PDF), `Scanned PDF fixture missing: ${SCANNED_PDF}`);
  assert.ok(fs.existsSync(DIGITAL_PDF), `Digital PDF fixture missing: ${DIGITAL_PDF}`);
  assert.ok(fs.existsSync(DB_PATH), `Isolated QA database missing: ${DB_PATH}`);
  createMixedPdf();
  console.log(`CBC fixture: ${FIXTURE}`);
  console.log(`Mixed PDF fixture: ${MIXED_PDF}`);
  console.log(`Isolated QA database: ${DB_PATH}`);

  const health = await jsonFetch(`${API_URL}/api/health`);
  check('Backend health is ok', health.status === 'ok', JSON.stringify(health));

  // -------------------------------------------------------------------------
  // Real CBC pipeline: upload -> OCR extraction -> measurement structuring.
  // -------------------------------------------------------------------------
  const form = new FormData();
  form.append(
    'file',
    new Blob([fs.readFileSync(FIXTURE)], { type: 'image/png' }),
    'cbc_report_phase9_3.png',
  );
  form.append('consent', 'true');
  form.append('consent_timestamp', new Date().toISOString());

  const report = await jsonFetch(`${API_URL}/api/reports`, {
    method: 'POST',
    body: form,
  });
  results.report_id = report.id;
  check('CBC PNG uploaded', report.file_extension === 'png', report.id);

  await jsonFetch(`${API_URL}/api/reports/${report.id}/extract`, {
    method: 'POST',
  });
  const extraction = await jsonFetch(
    `${API_URL}/api/reports/${report.id}/extraction`,
  );
  check(
    'CBC PNG extracted with OCR',
    extraction.status === 'completed' || extraction.status === 'review_required',
    extraction.status,
  );

  const structure = await jsonFetch(
    `${API_URL}/api/reports/${report.id}/structure`,
    { method: 'POST' },
  );
  check(
    'Measurements structured from OCR',
    structure.measurements_saved >= 5,
    `${structure.measurements_saved} measurements`,
  );

  const page = extraction.pages.find((item) => item.page_number === 1);
  check(
    'Page dimensions available',
    page && page.page_width > 0 && page.page_height > 0,
    `${page?.page_width} x ${page?.page_height}`,
  );

  let measurements = (
    await jsonFetch(`${API_URL}/api/reports/${report.id}/measurements`)
  ).measurements;

  const byOriginalName = (name) =>
    measurements.find((measurement) => measurement.test_name_original === name);
  const hemoglobin = byOriginalName('Hemoglobin');
  const wbc = byOriginalName('White Blood Cell Count');
  const platelet = byOriginalName('PlateletCount');
  const hematocrit = byOriginalName('Hematocrit');
  const rbc = byOriginalName('Red Blood Cell Count');

  check('Hemoglobin measurement found', Boolean(hemoglobin), hemoglobin?.id);
  check('WBC measurement found', Boolean(wbc), wbc?.id);
  check('Platelet measurement found', Boolean(platelet), platelet?.id);
  check('Hematocrit measurement found', Boolean(hematocrit), hematocrit?.id);
  check('RBC measurement found', Boolean(rbc), rbc?.id);
  check(
    'Hemoglobin has valid source bbox',
    Array.isArray(hemoglobin.source_bbox) && hemoglobin.source_bbox.length === 4,
    JSON.stringify(hemoglobin.source_bbox),
  );

  // Missing and invalid provenance are test-data variations in the isolated DB.
  updateBbox(platelet.id, '__NULL__');
  updateBbox(hematocrit.id, JSON.stringify([500, 10, 100, 40]));
  updateBbox(rbc.id, JSON.stringify([10, 10, 9999, 40]));

  measurements = (
    await jsonFetch(`${API_URL}/api/reports/${report.id}/measurements`)
  ).measurements;
  const plateletDb = measurements.find((m) => m.id === platelet.id);
  const hematocritDb = measurements.find((m) => m.id === hematocrit.id);
  const rbcDb = measurements.find((m) => m.id === rbc.id);
  check(
    'Missing-provenance fixture has source_bbox = null',
    plateletDb.source_bbox === null,
    JSON.stringify(plateletDb.source_bbox),
  );
  check(
    'Reversed-coordinate fixture is stored',
    JSON.stringify(hematocritDb.source_bbox) === JSON.stringify([500, 10, 100, 40]),
    JSON.stringify(hematocritDb.source_bbox),
  );
  check(
    'Out-of-bounds-coordinate fixture is stored',
    JSON.stringify(rbcDb.source_bbox) === JSON.stringify([10, 10, 9999, 40]),
    JSON.stringify(rbcDb.source_bbox),
  );

  const pageWidth = page.page_width;
  const pageHeight = page.page_height;
  const displayName = (measurement) =>
    measurement.test_name_normalized || measurement.test_name_original;

  results.measurements = {
    hemoglobin: { id: hemoglobin.id, source_bbox: hemoglobin.source_bbox },
    wbc: { id: wbc.id, source_bbox: wbc.source_bbox },
    platelet: { id: platelet.id, source_bbox: null },
    hematocrit: {
      id: hematocrit.id,
      source_bbox: hematocritDb.source_bbox,
      invalid: 'reversed coordinates',
    },
    rbc: {
      id: rbc.id,
      source_bbox: rbcDb.source_bbox,
      invalid: 'out-of-bounds coordinates',
    },
  };

  // -------------------------------------------------------------------------
  // Mixed PDF pipeline: two scanned/OCR pages followed by one digital page.
  // -------------------------------------------------------------------------
  const pdfForm = new FormData();
  pdfForm.append(
    'file',
    new Blob([fs.readFileSync(MIXED_PDF)], { type: 'application/pdf' }),
    'phase9_4_mixed_report.pdf',
  );
  pdfForm.append('consent', 'true');
  pdfForm.append('consent_timestamp', new Date().toISOString());
  const pdfReport = await jsonFetch(`${API_URL}/api/reports`, {
    method: 'POST',
    body: pdfForm,
  });
  check('Mixed PDF uploaded', pdfReport.file_extension === 'pdf', pdfReport.id);

  await jsonFetch(`${API_URL}/api/reports/${pdfReport.id}/extract`, {
    method: 'POST',
  });
  const pdfExtraction = await jsonFetch(
    `${API_URL}/api/reports/${pdfReport.id}/extraction`,
  );
  check(
    'Mixed PDF extracted',
    pdfExtraction.status === 'completed' || pdfExtraction.status === 'review_required',
    pdfExtraction.status,
  );
  const pdfPage1 = pdfExtraction.pages.find((item) => item.page_number === 1);
  const pdfPage2 = pdfExtraction.pages.find((item) => item.page_number === 2);
  const pdfPage3 = pdfExtraction.pages.find((item) => item.page_number === 3);
  check(
    'Mixed PDF page methods are OCR, OCR, digital',
    pdfPage1?.extraction_method === 'ocr' &&
      pdfPage2?.extraction_method === 'ocr' &&
      pdfPage3?.extraction_method === 'digital',
    [pdfPage1?.extraction_method, pdfPage2?.extraction_method, pdfPage3?.extraction_method].join(
      ', ',
    ),
  );
  const pdfPage1Quality = pdfPage1?.metadata?.quality;
  const pdfPage2Quality = pdfPage2?.metadata?.quality;
  check(
    'Scanned PDF OCR dimensions available in metadata',
    pdfPage1Quality?.width > 0 && pdfPage1Quality?.height > 0,
    `${pdfPage1Quality?.width} x ${pdfPage1Quality?.height}`,
  );

  const pdfStructure = await jsonFetch(
    `${API_URL}/api/reports/${pdfReport.id}/structure`,
    { method: 'POST' },
  );
  check(
    'Mixed PDF measurements structured',
    pdfStructure.measurements_saved >= 10,
    `${pdfStructure.measurements_saved} measurements`,
  );

  const pdfMeasurements = (
    await jsonFetch(`${API_URL}/api/reports/${pdfReport.id}/measurements`)
  ).measurements;
  const validBbox = (measurement) =>
    Array.isArray(measurement.source_bbox) && measurement.source_bbox.length === 4;
  const pdfPage1Measurements = pdfMeasurements.filter(
    (measurement) => measurement.page_number === 1 && validBbox(measurement),
  );
  const pdfPage2Measurements = pdfMeasurements.filter(
    (measurement) => measurement.page_number === 2 && validBbox(measurement),
  );
  const pdfPage3Measurements = pdfMeasurements.filter(
    (measurement) => measurement.page_number === 3,
  );
  check(
    'Scanned PDF page 1 has at least two source-guided measurements',
    pdfPage1Measurements.length >= 2,
    `${pdfPage1Measurements.length} measurements`,
  );
  check(
    'Scanned PDF page 2 has at least two source-guided measurements',
    pdfPage2Measurements.length >= 2,
    `${pdfPage2Measurements.length} measurements`,
  );
  check(
    'Digital PDF page 3 has measurements without OCR bbox',
    pdfPage3Measurements.length >= 1 &&
      pdfPage3Measurements.every((measurement) => measurement.source_bbox === null),
    `${pdfPage3Measurements.length} measurements`,
  );

  const [pdfPage1First, pdfPage1Second] = pdfPage1Measurements;
  const [pdfPage2First, pdfPage2Second] = pdfPage2Measurements;
  const pdfPage3First = pdfPage3Measurements[0];
  const pdfMissingCandidate = pdfPage2Second;
  results.pdf = {
    report_id: pdfReport.id,
    pages: {
      1: { method: pdfPage1?.extraction_method, quality: pdfPage1Quality },
      2: { method: pdfPage2?.extraction_method, quality: pdfPage2Quality },
      3: {
        method: pdfPage3?.extraction_method,
        page_width: pdfPage3?.page_width,
        page_height: pdfPage3?.page_height,
      },
    },
    measurements: {
      page1: pdfPage1First?.id,
      page2: pdfPage2First?.id,
      page3: pdfPage3First?.id,
      missing: pdfMissingCandidate?.id,
    },
  };

  // -------------------------------------------------------------------------
  // Browser acceptance checks.
  // -------------------------------------------------------------------------
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const browserPage = await context.newPage();
  const consoleErrors = [];
  browserPage.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  browserPage.on('pageerror', (error) => consoleErrors.push(error.message));

  try {
    await browserPage.goto(
      `${FRONTEND_URL}/app/reports/${report.id}/verify`,
      { waitUntil: 'networkidle' },
    );
    await browserPage.locator('.verification-row').first().waitFor();
    check(
      'Verification page rendered all measurements',
      (await browserPage.locator('.verification-row').count()) === measurements.length,
      `${measurements.length} rows`,
    );

    const hemoglobinRow = rowByName(browserPage, displayName(hemoglobin));
    const wbcRow = rowByName(browserPage, displayName(wbc));
    const plateletRow = rowByName(browserPage, displayName(platelet));
    const hematocritRow = rowByName(browserPage, displayName(hematocrit));
    const rbcRow = rowByName(browserPage, displayName(rbc));

    // A. Selection and exactly one highlight.
    await selectMeasurement(browserPage, hemoglobinRow, 'A: Hemoglobin');
    await waitForCount(
      browserPage,
      '[data-testid="measurement-highlight"]',
      1,
      'A: highlight count',
    );
    check('A: exactly one measurement highlight appears', true, '1 highlight');
    const sourceLabel = await hemoglobinRow
      .locator('.verification-row__source')
      .innerText();
    check(
      'A: source indicator names the page',
      /Source: Page 1/.test(sourceLabel),
      sourceLabel,
    );
    check(
      'A: OCR score is present and labelled as OCR',
      hemoglobin.ocr_confidence == null || /OCR score \d+\.\d%/.test(sourceLabel),
      sourceLabel,
    );

    // B. Geometry matches source bbox / original image dimensions.
    await assertGeometry(
      browserPage,
      hemoglobin,
      pageWidth,
      pageHeight,
      'B: Hemoglobin',
    );
    await screenshot(browserPage, 'phase9_3_hemoglobin_highlight.png');

    // C. Switching moves the single highlight.
    await selectMeasurement(browserPage, wbcRow, 'C: WBC');
    await waitForCount(
      browserPage,
      '[data-testid="measurement-highlight"]',
      1,
      'C: highlight count after switch',
    );
    await assertGeometry(browserPage, wbc, pageWidth, pageHeight, 'C: WBC');
    check(
      'C: exactly one highlight remains after switching',
      (await hemoglobinRow.getAttribute('class')).includes('is-selected') === false,
      'previous row no longer selected',
    );
    await screenshot(browserPage, 'phase9_3_wbc_highlight.png');

    // D. Missing provenance: no highlight, but row remains selectable and editable.
    await selectMeasurement(browserPage, plateletRow, 'D: missing bbox');
    await waitForCount(
      browserPage,
      '[data-testid="measurement-highlight"]',
      0,
      'D: highlight count',
    );
    check('D: no highlight for null source_bbox', true, '0 highlights');
    check(
      'D: missing-provenance row still shows its page source label',
      /Source: Page 1/.test(
        await plateletRow.locator('.verification-row__source').innerText(),
      ),
      await plateletRow.locator('.verification-row__source').innerText(),
    );
    const plateletEdit = plateletRow.locator('.verification-action-icon-btn');
    check(
      'D: missing-provenance row remains editable',
      await plateletEdit.isEnabled(),
    );
    await plateletEdit.click();
    await browserPage.locator('.verification-edit-panel').waitFor();
    check('D: edit panel opens for null bbox', true);
    await browserPage
      .locator('.verification-edit-panel')
      .getByRole('button', { name: 'Cancel', exact: true })
      .click();
    await screenshot(browserPage, 'phase9_3_missing_provenance.png');

    // E. Invalid provenance: reversed and out-of-bounds coordinates render no highlight.
    await selectMeasurement(browserPage, hematocritRow, 'E: reversed bbox');
    await waitForCount(
      browserPage,
      '[data-testid="measurement-highlight"]',
      0,
      'E: reversed bbox highlight count',
    );
    check('E: no highlight for reversed coordinates', true, '0 highlights');
    await selectMeasurement(browserPage, rbcRow, 'E: out-of-bounds bbox');
    await waitForCount(
      browserPage,
      '[data-testid="measurement-highlight"]',
      0,
      'E: out-of-bounds bbox highlight count',
    );
    check('E: no highlight for out-of-bounds coordinates', true, '0 highlights');
    await screenshot(browserPage, 'phase9_3_invalid_provenance.png');

    // F. Existing verify action still works.
    await hematocritRow.locator('.verification-verify-btn').click();
    await hematocritRow.locator('.verification-verified-badge').waitFor();
    check(
      'F: Verify action still works',
      (await hematocritRow.locator('.verification-verified-badge').innerText()).includes(
        'Verified',
      ),
    );

    // F. Existing edit action still works and keeps the valid highlight selected.
    await selectMeasurement(browserPage, wbcRow, 'F: reselect WBC');
    await waitForCount(
      browserPage,
      '[data-testid="measurement-highlight"]',
      1,
      'F: highlight before edit',
    );
    await wbcRow.locator('.verification-action-icon-btn').click();
    const editPanel = browserPage.locator('.verification-edit-panel');
    await editPanel.waitFor();
    const resultInput = editPanel.locator('.verification-field input').nth(0);
    const originalValue = await resultInput.inputValue();
    await resultInput.fill('8.6');
    await editPanel.getByRole('button', { name: 'Save correction' }).click();
    await browserPage.waitForTimeout(600);
    check(
      'F: correction saved through the existing edit flow',
      (await wbcRow.locator('.verification-row__val').innerText()).includes('8.6'),
      `was ${originalValue}, now ${await wbcRow.locator('.verification-row__val').innerText()}`,
    );
    await waitForCount(
      browserPage,
      '[data-testid="measurement-highlight"]',
      1,
      'F: highlight survives PATCH response normalization',
    );
    await assertGeometry(
      browserPage,
      wbc,
      pageWidth,
      pageHeight,
      'F: WBC after edit',
    );

    // Keyboard selection still works after all interactions.
    await hemoglobinRow.locator('.verification-row__info').focus();
    await browserPage.keyboard.press('Enter');
    await browserPage.waitForTimeout(250);
    check(
      'Keyboard Enter selects a measurement',
      (await hemoglobinRow.getAttribute('class')).includes('is-selected'),
    );
    await waitForCount(
      browserPage,
      '[data-testid="measurement-highlight"]',
      1,
      'Keyboard highlight count',
    );
    await assertGeometry(
      browserPage,
      hemoglobin,
      pageWidth,
      pageHeight,
      'Keyboard: Hemoglobin',
    );
    await screenshot(browserPage, 'phase9_3_keyboard_selection.png');

    // -------------------------------------------------------------------------
    // G/H/I. Scanned PDF page image, OCR page switching, and digital iframe.
    // -------------------------------------------------------------------------
    const pdfVerifyUrl = `${FRONTEND_URL}/app/reports/${pdfReport.id}/verify`;
    await browserPage.goto(pdfVerifyUrl, { waitUntil: 'networkidle' });
    await browserPage.locator('.verification-row').first().waitFor();
    await waitForPageImage(browserPage, 1);
    check(
      'G: scanned PDF page 1 displays as an image',
      (await browserPage.locator('.verification-preview-img').count()) === 1,
      'image preview',
    );
    check(
      'G: scanned PDF page 1 does not render an iframe',
      (await browserPage.locator('.verification-preview-iframe').count()) === 0,
      'no iframe',
    );
    const pdfPage1NaturalSize = await renderedImageSize(browserPage);
    check(
      'G: rendered page image dimensions match OCR rendering dimensions',
      pdfPage1NaturalSize.width === pdfPage1Quality.width &&
        pdfPage1NaturalSize.height === pdfPage1Quality.height,
      `${pdfPage1NaturalSize.width} x ${pdfPage1NaturalSize.height} image, ${pdfPage1Quality.width} x ${pdfPage1Quality.height} OCR`,
    );

    const pdfPage1FirstRow = rowForMeasurement(browserPage, pdfPage1First);
    await selectMeasurement(browserPage, pdfPage1FirstRow, 'G: scanned PDF page 1 measurement');
    await waitForCount(
      browserPage,
      '[data-testid="measurement-highlight"]',
      1,
      'G: scanned PDF highlight count',
    );
    await assertGeometry(
      browserPage,
      pdfPage1First,
      pdfPage1NaturalSize.width,
      pdfPage1NaturalSize.height,
      'G: scanned PDF page 1',
    );
    await screenshot(
      browserPage,
      'phase9_4_scanned_pdf_highlight.png',
      PDF_SCREENSHOT_DIR,
    );

    const pdfPage1SecondRow = rowForMeasurement(browserPage, pdfPage1Second);
    await selectMeasurement(browserPage, pdfPage1SecondRow, 'H: second scanned page 1 measurement');
    await waitForCount(
      browserPage,
      '[data-testid="measurement-highlight"]',
      1,
      'H: scanned PDF highlight count after move',
    );
    await assertGeometry(
      browserPage,
      pdfPage1Second,
      pdfPage1NaturalSize.width,
      pdfPage1NaturalSize.height,
      'H: scanned PDF highlight moved',
    );
    check(
      'H: previous scanned PDF measurement is no longer selected',
      (await pdfPage1FirstRow.getAttribute('class')).includes('is-selected') === false,
    );

    const pdfPage2FirstRow = rowForMeasurement(browserPage, pdfPage2First);
    await selectMeasurement(browserPage, pdfPage2FirstRow, 'H: scanned PDF page 2 measurement');
    await waitForPageImage(browserPage, 2);
    check(
      'H: switching to an OCR page loads page 2 image',
      (await browserPage.locator('.verification-preview-img').getAttribute('src')).includes(
        '/pages/2/image',
      ),
      await browserPage.locator('.verification-preview-img').getAttribute('src'),
    );
    check(
      'H: page label reports page 2 of 3',
      (await browserPage.locator('.verification-page-label').innerText()) === 'Page 2 of 3',
      await browserPage.locator('.verification-page-label').innerText(),
    );
    const pdfPage2NaturalSize = await renderedImageSize(browserPage);
    check(
      'H: page 2 image dimensions match page 2 OCR rendering',
      pdfPage2NaturalSize.width === pdfPage2Quality.width &&
        pdfPage2NaturalSize.height === pdfPage2Quality.height,
      `${pdfPage2NaturalSize.width} x ${pdfPage2NaturalSize.height} image, ${pdfPage2Quality.width} x ${pdfPage2Quality.height} OCR`,
    );
    await waitForCount(
      browserPage,
      '[data-testid="measurement-highlight"]',
      1,
      'H: page 2 highlight count',
    );
    await assertGeometry(
      browserPage,
      pdfPage2First,
      pdfPage2NaturalSize.width,
      pdfPage2NaturalSize.height,
      'H: scanned PDF page 2',
    );
    await screenshot(
      browserPage,
      'phase9_4_scanned_pdf_page2.png',
      PDF_SCREENSHOT_DIR,
    );

    const pdfPage3FirstRow = rowForMeasurement(browserPage, pdfPage3First);
    await selectMeasurement(browserPage, pdfPage3FirstRow, 'I: digital PDF page 3 measurement');
    await browserPage.locator('.verification-preview-iframe').waitFor();
    check(
      'I: digital PDF page 3 retains the native iframe',
      (await browserPage.locator('.verification-preview-iframe').count()) === 1,
      'iframe preview',
    );
    check(
      'I: digital PDF page 3 does not render an OCR page image',
      (await browserPage.locator('.verification-preview-img').count()) === 0,
      'no image preview',
    );
    await waitForCount(
      browserPage,
      '[data-testid="measurement-highlight"]',
      0,
      'I: digital page highlight count',
    );
    check(
      'I: page label reports page 3 of 3',
      (await browserPage.locator('.verification-page-label').innerText()) === 'Page 3 of 3',
      await browserPage.locator('.verification-page-label').innerText(),
    );
    await screenshot(
      browserPage,
      'phase9_4_digital_pdf_page3.png',
      PDF_SCREENSHOT_DIR,
    );

    // Missing provenance on an OCR PDF page must not break verification.
    updateBbox(pdfMissingCandidate.id, '__NULL__');
    await browserPage.goto(pdfVerifyUrl, { waitUntil: 'networkidle' });
    await browserPage.locator('.verification-row').first().waitFor();
    const pdfMissingRow = rowForMeasurement(browserPage, pdfMissingCandidate);
    await selectMeasurement(browserPage, pdfMissingRow, 'J: scanned PDF missing bbox');
    await waitForPageImage(browserPage, pdfMissingCandidate.page_number);
    await waitForCount(
      browserPage,
      '[data-testid="measurement-highlight"]',
      0,
      'J: missing bbox highlight count',
    );
    check(
      'J: scanned PDF remains an image without a highlight',
      (await browserPage.locator('.verification-preview-img').count()) === 1 &&
        (await browserPage.locator('.verification-preview-iframe').count()) === 0,
    );
    check(
      'J: missing-provenance scanned PDF row remains editable',
      await pdfMissingRow.locator('.verification-action-icon-btn').isEnabled(),
    );
    await pdfMissingRow.locator('.verification-action-icon-btn').click();
    await browserPage.locator('.verification-edit-panel').waitFor();
    check('J: scanned PDF edit panel opens for null bbox', true);
    await browserPage
      .locator('.verification-edit-panel')
      .getByRole('button', { name: 'Cancel', exact: true })
      .click();
    await pdfMissingRow.locator('.verification-verify-btn').click();
    await pdfMissingRow.locator('.verification-verified-badge').waitFor();
    check('J: scanned PDF measurement verification still works', true);
    await screenshot(
      browserPage,
      'phase9_4_missing_provenance.png',
      PDF_SCREENSHOT_DIR,
    );

    check(
      'No browser console/page errors',
      consoleErrors.length === 0,
      consoleErrors.join(' | ') || 'none',
    );
  } finally {
    await context.close();
    await browser.close();
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
  console.error(`\nACCEPTANCE FAILED: ${error.message}`);
  console.error(`Results: ${RESULTS_PATH}`);
  process.exit(1);
});
