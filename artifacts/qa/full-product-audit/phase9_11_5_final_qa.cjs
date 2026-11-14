/**
 * Phase 9.11.5 — Final verification experience & release QA.
 *
 * Isolated stack (never the dev DB):
 *   frontend http://127.0.0.1:5174  (VITE_API_BASE=http://127.0.0.1:8001)
 *   backend  http://127.0.0.1:8001  (LABLENS_DATA_DIR=%TEMP%/opencode/lablens-phase9115-qa)
 *
 * Reuses three existing isolated digital QA reports and uploads the scanned
 * multipage + photographed fixtures for the source-viewer regression.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FRONTEND_URL = 'http://127.0.0.1:5174';
const API_URL = 'http://127.0.0.1:8001';
const QA_DIR = path.resolve(__dirname);
const PROJECT_ROOT = path.resolve(QA_DIR, '..', '..', '..');
const SCANNED = path.join(PROJECT_ROOT, 'backend', 'tests', 'fixtures', 'phase9_5', 'multipage_scanned_report.pdf');
const PHOTO = path.join(PROJECT_ROOT, 'backend', 'tests', 'fixtures', 'phase9_5', 'photographed_report.jpg');
const SHOT_DIR = path.join(QA_DIR, 'screenshots', 'phase9_11_5_final');
const RESULTS_PATH = path.join(QA_DIR, 'phase9_11_5_final_results.json');

// Fresh uploads for a clean full run (this phase's isolated stack).
const REPORT_PARTIAL = '4c20657a-e2f4-4854-921e-3a07c0bb8ab1';
const REPORT_LIFECYCLE = '5b5d0abd-e89e-4959-a8c6-9c1df8a8ab62';

const results = {
  generated_at: new Date().toISOString(),
  frontend_url: FRONTEND_URL,
  api_url: API_URL,
  reports: { partial: REPORT_PARTIAL, lifecycle: REPORT_LIFECYCLE },
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

async function apiJson(pathname, options = {}) {
  const response = await fetch(`${API_URL}${pathname}`, options);
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${pathname} -> ${response.status}: ${await response.text()}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function measurements(reportId) {
  const body = await apiJson(`/api/reports/${reportId}/measurements`);
  return Array.isArray(body) ? body : body.measurements ?? [];
}

async function analysis(reportId) {
  return apiJson(`/api/reports/${reportId}/analysis`);
}

function watchConsole(page, tag) {
  page.on('console', (message) => {
    if (message.type() === 'error' && !/Failed to load resource/i.test(message.text())) {
      results.console_errors.push(`${tag}: ${message.text()}`);
    }
  });
}

async function noHorizontalOverflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth <= doc.clientWidth + 1;
  });
}

async function openVerification(page, reportId) {
  await page.goto(`${FRONTEND_URL}/app/reports/${reportId}/verify`, { waitUntil: 'networkidle' });
  await page.locator('.ve-workspace, .ve-inspect').first().waitFor({ timeout: 30000 });
}

async function waitForConfirmedRows(page, count) {
  await page.waitForFunction(
    (expected) => document.querySelectorAll('.ve-row.is-confirmed').length === expected,
    count,
    { timeout: 20000 },
  );
}

async function checkAllRows(page) {
  const boxes = page.locator('.ve-row .ve-checkbox');
  const count = await boxes.count();
  for (let i = 0; i < count; i += 1) {
    if (!(await boxes.nth(i).isChecked())) await boxes.nth(i).check();
  }
  return count;
}

async function uploadAndOpen(page, fixture, tag) {
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
  await page.waitForTimeout(1200);
  await shot(page, `${tag}-processing.png`);
  await page.getByText('Your report is ready', { exact: true }).waitFor({ timeout: 300000 });
  await page.getByRole('button', { name: /Review & verify results/i }).click();
  await page.waitForURL(/\/verify/, { timeout: 20000 });
  await page.locator('.ve-workspace, .ve-inspect').first().waitFor({ timeout: 30000 });
  return body.id;
}

function highlightMetrics() {
  return (() => {
    const frame = document.querySelector('.ve-stage__frame');
    const highlight = document.querySelector('[data-testid="measurement-highlight"]');
    const image = document.querySelector('.ve-stage__image');
    if (!frame) return null;
    const f = frame.getBoundingClientRect();
    const h = highlight ? highlight.getBoundingClientRect() : null;
    return {
      frame: { x: f.x, y: f.y, width: f.width, height: f.height },
      highlight: h
        ? {
            x: h.x,
            y: h.y,
            width: h.width,
            height: h.height,
            relX: (h.x - f.x) / f.width,
            relY: (h.y - f.y) / f.height,
            relW: h.width / f.width,
            relH: h.height / f.height,
          }
        : null,
      image: image
        ? { naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight }
        : null,
      zoom: document.querySelector('.ve-stage__zoom')?.textContent ?? null,
    };
  })();
}

async function sampleHighlight(page) {
  return page.evaluate(highlightMetrics);
}

function alignmentDelta(a, b) {
  if (!a?.highlight || !b?.highlight) return Number.POSITIVE_INFINITY;
  return Math.max(
    Math.abs(a.highlight.relX - b.highlight.relX),
    Math.abs(a.highlight.relY - b.highlight.relY),
    Math.abs(a.highlight.relW - b.highlight.relW),
    Math.abs(a.highlight.relH - b.highlight.relH),
  );
}

async function main() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  const beforePartial = await measurements(REPORT_PARTIAL);
  const beforeLifecycle = await measurements(REPORT_LIFECYCLE);

  // =========================================================================
  // Pass A — selected-only confirmation, partial completion, ack integrity
  // =========================================================================
  console.log('\n=== Pass A: selected-only, partial completion, analysis exclusion ===');
  const contextA = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pageA = await contextA.newPage();
  watchConsole(pageA, 'A');
  const requestsA = [];
  pageA.on('request', (request) => requestsA.push({ url: request.url(), method: request.method() }));
  await openVerification(pageA, REPORT_PARTIAL);
  check('A: five rows render before review', (await pageA.locator('.ve-row').count()) === 5);
  check('A: workspace starts with zero confirmed', (await pageA.locator('.ve-row.is-confirmed').count()) === 0);

  const targetA = beforePartial.find((m) => m.test_name_normalized === 'HbA1c');
  const unselectedA = beforePartial.filter((m) => m.id !== targetA.id);
  const getRequestsBefore = requestsA.filter((r) => r.method === 'GET' && /\/measurements$/.test(r.url)).length;
  const imageRequestsBefore = requestsA.filter((r) => /\/pages\/1\/image/.test(r.url)).length;

  await pageA.locator(`#confirm-select-${targetA.id}`).check();
  check('A: selecting one row selects exactly one', (await pageA.locator('.ve-checkbox:checked').count()) === 1);
  await pageA.getByRole('button', { name: /Confirm selected \(1\)/ }).click();
  await waitForConfirmedRows(pageA, 1);
  check('A: selected result becomes confirmed', (await pageA.locator('.ve-row.is-confirmed').count()) === 1);

  const afterSelectedA = await measurements(REPORT_PARTIAL);
  const byIdA = new Map(afterSelectedA.map((m) => [m.id, m]));
  check('A: selected measurement is verified', byIdA.get(targetA.id)?.verification_status === 'verified');
  check(
    'A: unselected measurements remain unchanged',
    unselectedA.every((m) => {
      const now = byIdA.get(m.id);
      return now && now.verification_status === m.verification_status && now.result_original === m.result_original;
    }),
  );
  const getRequestsAfter = requestsA.filter((r) => r.method === 'GET' && /\/measurements$/.test(r.url)).length;
  check('A: confirmation does not refetch the measurement list', getRequestsAfter === getRequestsBefore, `GET /measurements ${getRequestsBefore}→${getRequestsAfter}`);

  const announcement = await pageA.locator('.ve-sr-only[role="status"]').innerText();
  check('A: confirmation is announced to screen readers', /1 result confirmed/i.test(announcement), announcement);
  const staleAfterConfirm = await analysis(REPORT_PARTIAL);
  check('A: existing analysis is no longer reported current after confirmation', staleAfterConfirm.freshness === 'stale', `freshness=${staleAfterConfirm.freshness}`);

  await pageA.getByRole('button', { name: 'Confirm results & continue' }).click();
  const completionA = pageA.locator('section[aria-labelledby="rc-heading"]');
  await completionA.waitFor({ timeout: 6000 });
  await pageA.waitForTimeout(1100);
  check('A: partial completion headline is shown', (await completionA.locator('#rc-heading').innerText()).includes("You've reviewed what you could."));
  const completionTextA = await completionA.innerText();
  check('A: partial completion names 4 still unverified', /Still unverified\s*4/i.test(completionTextA.replace(/\n+/g, ' ')), completionTextA.replace(/\s+/g, ' ').slice(0, 160));
  check('A: completion explicitly excludes unverified results', /not used in analysis/i.test(completionTextA));
  const finishA = completionA.getByRole('button', { name: /Finish for now/i });
  check('A: finish is gated before acknowledgement', await finishA.isDisabled());
  check('A: heading receives focus on completion', await pageA.evaluate(() => document.activeElement?.id === 'rc-heading'));
  await shot(pageA, '01-partial-completion-1280.png', true);

  const ackA = completionA.locator('.rc__ack-box');
  await ackA.focus();
  await pageA.keyboard.press('Space');
  check('A: acknowledgement can be ticked by keyboard', await ackA.isChecked());
  check('A: acknowledgement enables finish', !(await finishA.isDisabled()));
  const beforeFinishA = await measurements(REPORT_PARTIAL);
  check('A: acknowledgement itself verifies nothing', beforeFinishA.filter((m) => m.verification_status === 'verified').length === 1);

  await completionA.getByRole('button', { name: /Return to remaining measurements/i }).click();
  await pageA.locator('.ve-workspace').waitFor({ timeout: 5000 });
  check('A: return to review keeps 4 results unverified', (await pageA.locator('.ve-row:not(.is-confirmed)').count()) === 4);
  check('A: focus returns to the primary review CTA', await pageA.evaluate(() => document.activeElement?.classList.contains('ve-continue__cta')));

  await pageA.getByRole('button', { name: 'Confirm results & continue' }).click();
  await completionA.waitFor({ timeout: 6000 });
  await completionA.locator('.rc__ack-box').check();
  await completionA.getByRole('button', { name: /Finish for now/i }).click();
  await pageA.waitForURL(/\/app\/reports\/[^/]+\/results/, { timeout: 30000 });
  const afterFinishA = await measurements(REPORT_PARTIAL);
  check('A: leaving review keeps the 4 results unverified', afterFinishA.filter((m) => m.verification_status !== 'verified').length === 4);

  const analysisA = await analysis(REPORT_PARTIAL);
  check('A: refreshed analysis is current', analysisA.freshness === 'current', `freshness=${analysisA.freshness}`);
  const verifiedIdsA = new Set(afterFinishA.filter((m) => m.verification_status === 'verified').map((m) => m.id));
  const assessmentIdsA = new Set((analysisA.assessments ?? []).map((a) => a.measurement_id));
  check('A: unverified measurements are excluded from analysis', [...assessmentIdsA].every((id) => verifiedIdsA.has(id)), `assessments=${assessmentIdsA.size}`);
  check('A: partial analysis includes only the confirmed result', assessmentIdsA.size === 1 && verifiedIdsA.size === 1, `assessments=${assessmentIdsA.size}`);
  await shot(pageA, '02-partial-results-1280.png');
  await contextA.close();

  // =========================================================================
  // Pass B — full review, correction invalidation, re-verify, stale handoff
  // =========================================================================
  console.log('\n=== Pass B: full completion, correction, stale analysis, handoff ===');
  const contextB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pageB = await contextB.newPage();
  watchConsole(pageB, 'B');
  await openVerification(pageB, REPORT_LIFECYCLE);
  const countB = await checkAllRows(pageB);
  check('B: all five rows selectable', countB === 5);
  await pageB.getByRole('button', { name: /Confirm selected \(5\)/ }).click();
  await waitForConfirmedRows(pageB, 5);
  check('B: full selection verifies all five', (await pageB.locator('.ve-row.is-confirmed').count()) === 5);

  await pageB.getByRole('button', { name: 'Confirm results & continue' }).click();
  const completionB = pageB.locator('section[aria-labelledby="rc-heading"]');
  await completionB.waitFor({ timeout: 6000 });
  await pageB.waitForTimeout(1100);
  check('B: full completion headline is shown', (await completionB.locator('#rc-heading').innerText()).includes('Your report review is complete.'));
  const completionTextB = await completionB.innerText();
  check('B: full completion reports reviewed/confirmed counts', /Total reviewed\s*5/i.test(completionTextB.replace(/\n+/g, ' ')) && /Confirmed\s*5/i.test(completionTextB.replace(/\n+/g, ' ')));
  await shot(pageB, '03-full-completion-1440.png', true);
  await completionB.getByRole('button', { name: 'Continue to your results' }).click();
  await pageB.waitForURL(/\/results/, { timeout: 30000 });
  const analysisB1 = await analysis(REPORT_LIFECYCLE);
  check('B: full completion produces current analysis', analysisB1.freshness === 'current' && (analysisB1.assessments ?? []).length > 0, `freshness=${analysisB1.freshness} assessments=${(analysisB1.assessments ?? []).length}`);
  await pageB.locator('.handoff-section').waitFor({ timeout: 15000 }).catch(() => null);
  check('B: current results page offers clinician handoff', await pageB.locator('.handoff-section').isVisible());
  await pageB.waitForTimeout(500);
  await shot(pageB, '04-full-results-1440.png', true);

  // Correct HbA1c from the row pencil.
  await openVerification(pageB, REPORT_LIFECYCLE);
  await pageB.getByRole('button', { name: 'Edit HbA1c' }).click();
  await pageB.locator('.ve-inspect__edit').waitFor({ timeout: 6000 });
  await pageB.locator('.ve-inspect__edit input').first().fill('6.0');
  await pageB.getByRole('button', { name: /Save correction/i }).click();
  await pageB.waitForFunction(() => !document.querySelector('.ve-inspect__edit'), null, { timeout: 20000 });
  const panelAfterEdit = await pageB.locator('.ve-inspect').innerText();
  check('B: corrected result shows Edited marker', /edited/i.test(panelAfterEdit));
  check('B: corrected result returns to Needs review', /needs review/i.test(panelAfterEdit));
  const announcementB = await pageB.locator('.ve-sr-only[role="status"]').innerText();
  check('B: correction is announced', /correction saved/i.test(announcementB), announcementB);

  const afterEditB = await measurements(REPORT_LIFECYCLE);
  const hba1cB = afterEditB.find((m) => m.test_name_normalized === 'HbA1c');
  check('B: corrected value persists', hba1cB?.result_original === '6.0', `value=${hba1cB?.result_original}`);
  check('B: correction invalidates verification', hba1cB?.verification_status === 'needs_review');
  check('B: corrected audit metadata is preserved', hba1cB?.has_corrections === true);

  await pageB.reload({ waitUntil: 'networkidle' });
  await pageB.locator('.ve-workspace').waitFor({ timeout: 20000 });
  const rowB = pageB.locator('.ve-row').filter({ hasText: 'HbA1c' });
  check('B: corrected history survives reload', /edited/i.test(await rowB.innerText()));
  check('B: corrected row is still unverified after reload', /needs review/i.test(await rowB.innerText()));

  await pageB.goto(`${FRONTEND_URL}/app/reports/${REPORT_LIFECYCLE}/results`, { waitUntil: 'networkidle' });
  await pageB.locator('.results-stale-alert').waitFor({ timeout: 10000 });
  const staleTextB = await pageB.locator('.results-stale-alert').innerText();
  check('B: stale analysis is never shown as current guidance', /out of date/i.test(staleTextB));
  check('B: stale results page withholds clinician handoff', (await pageB.locator('.handoff-section').count()) === 0);
  const staleAnalysisB = await analysis(REPORT_LIFECYCLE);
  const staleAssessment = (staleAnalysisB.assessments ?? []).find((a) => a.test_name === 'HbA1c');
  check('B: stale analysis keeps the pre-correction snapshot', staleAssessment?.value === '6.2', `value=${staleAssessment?.value}`);
  await shot(pageB, '05-stale-results-1440.png', true);

  // Re-verify the corrected result, then refresh analysis.
  await openVerification(pageB, REPORT_LIFECYCLE);
  await pageB.getByRole('button', { name: /Inspect HbA1c/ }).first().click();
  await pageB.locator('.ve-inspect').waitFor({ timeout: 6000 });
  await pageB.getByRole('button', { name: 'Confirm this result' }).click();
  await pageB.waitForFunction(() => document.querySelector('.ve-inspect')?.innerText.includes('Confirmed'), null, { timeout: 20000 });
  const reVerifiedB = await measurements(REPORT_LIFECYCLE);
  check('B: corrected result can be explicitly re-confirmed', reVerifiedB.every((m) => m.verification_status === 'verified'));
  check('B: re-confirmation preserves correction history', reVerifiedB.find((m) => m.test_name_normalized === 'HbA1c')?.has_corrections === true);
  await pageB.getByRole('button', { name: 'Close inspection panel' }).click();
  await pageB.getByRole('button', { name: 'Confirm results & continue' }).click();
  await completionB.waitFor({ timeout: 6000 });
  await pageB.waitForTimeout(900);
  await completionB.getByRole('button', { name: 'Continue to your results' }).click();
  await pageB.waitForURL(/\/results/, { timeout: 30000 });
  await pageB.locator('.handoff-section').waitFor({ timeout: 15000 }).catch(() => null);
  const refreshedB = await analysis(REPORT_LIFECYCLE);
  const refreshedHba1c = (refreshedB.assessments ?? []).find((a) => a.test_name === 'HbA1c');
  check('B: re-verified report returns current analysis', refreshedB.freshness === 'current', `freshness=${refreshedB.freshness}`);
  check('B: refreshed analysis uses the corrected value', refreshedHba1c?.value === '6.0', `value=${refreshedHba1c?.value}`);
  check('B: refreshed results page restores clinician handoff', await pageB.locator('.handoff-section').isVisible());
  check('B: current handoff shows no stale warning', (await pageB.locator('.doc-stale-box').count()) === 0);
  await pageB.waitForTimeout(400);
  await shot(pageB, '06-refreshed-results-1440.png', true);
  await contextB.close();

  // =========================================================================
  // Pass C — source viewer regression: digital, scanned, photograph
  // =========================================================================
  console.log('\n=== Pass C: source viewer regression ===');
  const contextC = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pageC = await contextC.newPage();
  watchConsole(pageC, 'C');

  // Digital PDF
  await openVerification(pageC, REPORT_PARTIAL);
  const requestsC = [];
  pageC.on('request', (request) => requestsC.push({ url: request.url(), method: request.method() }));
  await pageC.getByRole('button', { name: /Inspect HbA1c/ }).first().click();
  await pageC.locator('.ve-inspect').waitFor({ timeout: 6000 });
  await pageC.locator('[data-testid="measurement-highlight"]').waitFor({ timeout: 6000 });
  const digitalFit = await sampleHighlight(pageC);
  check('C: digital PDF highlight has real geometry', digitalFit?.highlight && digitalFit.highlight.width > 2 && digitalFit.highlight.height > 1);
  check(
    'C: digital image keeps its natural aspect ratio',
    digitalFit?.image && Math.abs(digitalFit.image.naturalWidth / digitalFit.image.naturalHeight - digitalFit.frame.width / digitalFit.frame.height) < 0.02,
  );
  const imageRequestsBeforeC = requestsC.filter((r) => /\/pages\/|\/download/.test(r.url)).length;
  await pageC.getByRole('button', { name: 'Zoom in' }).click();
  await pageC.waitForTimeout(400);
  const digitalZoom = await sampleHighlight(pageC);
  check('C: digital highlight stays aligned at zoom', alignmentDelta(digitalFit, digitalZoom) < 0.01, `delta=${alignmentDelta(digitalFit, digitalZoom).toFixed(4)}`);
  check('C: zoom changes the frame size', digitalZoom.frame.width > digitalFit.frame.width + 2);
  await pageC.getByRole('button', { name: 'Reset zoom to fit page' }).click();
  await pageC.waitForTimeout(300);
  const digitalReset = await sampleHighlight(pageC);
  check('C: reset restores the fitted frame', Math.abs(digitalReset.frame.width - digitalFit.frame.width) < 3);
  const imageRequestsAfterC = requestsC.filter((r) => /\/pages\/|\/download/.test(r.url)).length;
  check('C: opening inspection does not reload the document', imageRequestsAfterC === imageRequestsBeforeC, `${imageRequestsBeforeC}→${imageRequestsAfterC}`);
  await pageC.getByRole('button', { name: 'Close inspection panel' }).click();
  await shot(pageC, '07-digital-source-1440.png');

  // Scanned multipage PDF
  const scannedId = await uploadAndOpen(pageC, SCANNED, '08-scanned');
  results.reports.scanned = scannedId;
  check('C: scanned multipage report reaches verification', Boolean(scannedId));
  check('C: scanned report exposes page navigation', (await pageC.locator('.ve-source__pagination').count()) === 1);
  check('C: scanned report starts on page 1 of 2', (await pageC.locator('.ve-source__page-label').innerText()).includes('1 / 2'));
  await pageC.getByRole('button', { name: /Inspect Glucose/ }).first().click();
  await pageC.locator('.ve-inspect').waitFor({ timeout: 6000 });
  await pageC.waitForTimeout(600);
  check('C: selecting a page-2 result jumps the source to page 2', (await pageC.locator('.ve-source__page-label').innerText()).includes('2 / 2'));
  await pageC.locator('[data-testid="measurement-highlight"]').waitFor({ timeout: 6000 });
  const scannedFit = await sampleHighlight(pageC);
  check(
    'C: scanned highlight stays inside the page frame',
    scannedFit?.highlight &&
      scannedFit.highlight.relX >= -0.001 &&
      scannedFit.highlight.relY >= -0.001 &&
      scannedFit.highlight.relX + scannedFit.highlight.relW <= 1.001 &&
      scannedFit.highlight.relY + scannedFit.highlight.relH <= 1.001,
  );
  await pageC.getByRole('button', { name: 'Zoom in' }).click();
  await pageC.waitForTimeout(400);
  const scannedZoom = await sampleHighlight(pageC);
  check('C: scanned highlight stays aligned at zoom', alignmentDelta(scannedFit, scannedZoom) < 0.015, `delta=${alignmentDelta(scannedFit, scannedZoom).toFixed(4)}`);
  await pageC.getByRole('button', { name: 'Reset zoom to fit page' }).click();
  await pageC.waitForTimeout(300);
  await pageC.getByRole('button', { name: 'OCR text' }).click();
  const ocrText = await pageC.locator('.ve-source__ocr-text').innerText();
  check('C: OCR text mode shows the scanned page text', /glucose|hemoglobin|wbc/i.test(ocrText), ocrText.replace(/\s+/g, ' ').slice(0, 80));
  await pageC.getByRole('button', { name: 'Visual' }).click();
  await pageC.waitForTimeout(300);
  await shot(pageC, '09-scanned-source-1440.png');

  // Page mismatch / missing highlight fallback must degrade gracefully.
  await pageC.getByRole('button', { name: 'Previous page' }).click();
  await pageC.waitForTimeout(300);
  check('C: page navigation returns to page 1', (await pageC.locator('.ve-source__page-label').innerText()).includes('1 / 2'));
  const mismatchHighlight = await pageC.locator('[data-testid="measurement-highlight"]').count();
  check('C: page mismatch removes the overlay without breaking the viewer', mismatchHighlight === 0);
  check('C: source image still renders after mismatch', await pageC.locator('.ve-stage__image').isVisible());

  // Photograph / crop + overlay alignment
  const photoId = await uploadAndOpen(pageC, PHOTO, '10-photo');
  results.reports.photo = photoId;
  check('C: photographed report reaches verification', Boolean(photoId));
  check('C: photograph is labelled as a photo', (await pageC.locator('.ve-source__doctype').innerText()).toLowerCase().includes('photo'));
  await pageC.getByRole('button', { name: /Inspect Hemoglobin/ }).first().click();
  await pageC.locator('.ve-inspect').waitFor({ timeout: 6000 });
  await pageC.locator('[data-testid="measurement-highlight"]').waitFor({ timeout: 6000 });
  const photoFit = await sampleHighlight(pageC);
  check(
    'C: photograph keeps its processed aspect ratio',
    photoFit?.image && Math.abs(photoFit.image.naturalWidth / photoFit.image.naturalHeight - photoFit.frame.width / photoFit.frame.height) < 0.02,
    photoFit?.image ? `${photoFit.image.naturalWidth}×${photoFit.image.naturalHeight}` : 'no image',
  );
  check(
    'C: photograph highlight stays inside the frame',
    photoFit?.highlight &&
      photoFit.highlight.relX >= -0.001 &&
      photoFit.highlight.relY >= -0.001 &&
      photoFit.highlight.relX + photoFit.highlight.relW <= 1.001 &&
      photoFit.highlight.relY + photoFit.highlight.relH <= 1.001,
  );
  check('C: photograph highlight is a local region, not the whole page', photoFit.highlight.relW < 0.9 && photoFit.highlight.relH < 0.25);
  await pageC.getByRole('button', { name: 'Zoom in' }).click();
  await pageC.waitForTimeout(400);
  const photoZoom = await sampleHighlight(pageC);
  check('C: photograph highlight stays aligned at zoom', alignmentDelta(photoFit, photoZoom) < 0.015, `delta=${alignmentDelta(photoFit, photoZoom).toFixed(4)}`);
  await pageC.getByRole('button', { name: 'Reset zoom to fit page' }).click();
  await pageC.waitForTimeout(300);
  await shot(pageC, '11-photo-source-1440.png');
  await contextC.close();

  // =========================================================================
  // Pass D — responsive matrix, a11y, motion, touch targets
  // =========================================================================
  console.log('\n=== Pass D: responsive, accessibility, motion ===');
  const widths = [360, 390, 768, 1024, 1280, 1440, 1920];
  for (const width of widths) {
    const contextD = await browser.newContext({ viewport: { width, height: 900 } });
    const pageD = await contextD.newPage();
    watchConsole(pageD, `${width}px`);
    await openVerification(pageD, REPORT_PARTIAL);
    await pageD.waitForTimeout(300);
    check(`${width}px: no horizontal overflow`, await noHorizontalOverflow(pageD));
    await shot(pageD, `12-workspace-${width}.png`, width <= 768);

    const layout = await pageD.evaluate(() => {
      const source = document.querySelector('.ve-source');
      const workspace = document.querySelector('.ve-workspace');
      const tabs = document.querySelector('.ve-mobile-tabs');
      const filters = document.querySelector('.ve-filters');
      const chips = [...document.querySelectorAll('.ve-chip')];
      const cta = document.querySelector('.ve-continue__cta');
      const split = document.querySelector('.ve-split');
      const rect = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height), bottom: Math.round(r.bottom) };
      };
      return {
        tabsDisplay: tabs ? getComputedStyle(tabs).display : 'none',
        splitColumns: split ? getComputedStyle(split).gridTemplateColumns : '',
        source: rect(source),
        workspace: rect(workspace),
        split: rect(split),
        cta: rect(cta),
        filters: rect(filters),
        filtersOverflow: filters ? filters.scrollWidth > filters.clientWidth + 1 : false,
        chips: chips.map((chip) => {
          const r = chip.getBoundingClientRect();
          return { right: r.right, clipped: filters ? r.right > filters.getBoundingClientRect().right + 1 : false };
        }),
      };
    });

    if (width <= 1199) {
      check(`${width}px: segmented Document/Measurements control is visible`, layout.tabsDisplay === 'flex');
      const tracks = layout.splitColumns.trim().split(/\s+/).filter(Boolean);
      check(`${width}px: panels stack in a single column`, tracks.length === 1, `grid-template-columns=${layout.splitColumns}`);
    } else {
      check(`${width}px: desktop layout hides segmented control`, layout.tabsDisplay === 'none');
      check(`${width}px: desktop layout uses two columns`, layout.workspace.x > layout.source.x + layout.source.width - 2);
      check(`${width}px: all measurement filters are visible`, layout.chips.every((chip) => !chip.clipped) && !layout.filtersOverflow);
      check(`${width}px: primary review CTA is above the fold`, layout.cta && layout.cta.bottom <= 900, layout.cta ? `bottom=${layout.cta.bottom}` : 'missing');
    }

    if (width <= 768) {
      const targets = await pageD.evaluate(() => {
        const rect = (el) => {
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { width: Math.round(r.width), height: Math.round(r.height) };
        };
        return {
          checkbox: rect(document.querySelector('.ve-row__select')),
          icon: rect(document.querySelector('.ve-row__actions .ve-icon-btn')),
          chip: rect(document.querySelector('.ve-chip')),
          tab: rect(document.querySelector('.ve-tab')),
          cta: rect(document.querySelector('.ve-continue__cta')),
        };
      });
      const min = (target) => target && target.width >= 44 && target.height >= 44;
      check(`${width}px: checkbox target is at least 44px`, min(targets.checkbox), JSON.stringify(targets.checkbox));
      check(`${width}px: row action target is at least 44px`, min(targets.icon), JSON.stringify(targets.icon));
      check(`${width}px: filter chip target is at least 44px`, min(targets.chip), JSON.stringify(targets.chip));
      check(`${width}px: tab target is at least 44px`, min(targets.tab), JSON.stringify(targets.tab));
      check(`${width}px: primary CTA is at least 44px`, min(targets.cta), JSON.stringify(targets.cta));
    }

    if (width === 1024) {
      await pageD.getByRole('button', { name: /Inspect HbA1c/ }).first().click();
      await pageD.locator('.ve-inspect').waitFor({ timeout: 6000 });
      await pageD.waitForTimeout(900);
      const panelTop = await pageD.locator('.ve-inspect').evaluate((el) => el.getBoundingClientRect().top);
      check('1024px: docked inspection is scrolled into view', panelTop >= 60 && panelTop <= 200, `top=${Math.round(panelTop)}`);
      check('1024px: inspection auto-switches to Document tab', (await pageD.getByRole('button', { name: /^Document$/ }).getAttribute('aria-pressed')) === 'true');
      await shot(pageD, '13-docked-inspection-1024.png');
      await pageD.getByRole('button', { name: 'Close inspection panel' }).click();
      await pageD.waitForTimeout(250);
      check('1024px: closing docked inspection returns to Measurements', (await pageD.getByRole('button', { name: /Measurements \(/ }).getAttribute('aria-pressed')) === 'true');
      check('1024px: focus returns to the inspected row', await pageD.evaluate(() => document.activeElement?.classList.contains('ve-row__body')));
    }

    if (width === 1280) {
      await pageD.getByRole('button', { name: /Inspect HbA1c/ }).first().click();
      await pageD.locator('.ve-inspect').waitFor({ timeout: 6000 });
      await pageD.waitForTimeout(400);
      check('1280px: inspection replaces the measurement rail', (await pageD.locator('.ve-workspace').count()) === 0 && (await pageD.locator('.ve-inspect').isVisible()));
      await shot(pageD, '14-rail-inspection-1280.png');
      await pageD.getByRole('button', { name: 'Close inspection panel' }).click();
      await pageD.waitForTimeout(250);
      check('1280px: closing inspection restores the measurement rail', await pageD.locator('.ve-workspace').isVisible());
      check('1280px: focus returns to the inspected row', await pageD.evaluate(() => document.activeElement?.classList.contains('ve-row__body')));
    }

    if (width === 360) {
      // Keyboard focus visibility: checkbox → row body.
      const firstCheckbox = pageD.locator('.ve-checkbox').first();
      await firstCheckbox.focus();
      await pageD.keyboard.press('Tab');
      const focusStyle = await pageD.evaluate(() => {
        const el = document.activeElement;
        if (!el) return null;
        const style = getComputedStyle(el);
        return { className: el.className, outlineWidth: style.outlineWidth, outlineStyle: style.outlineStyle, outlineColor: style.outlineColor };
      });
      check('360px: keyboard focus is visible on the row body', focusStyle?.className.includes('ve-row__body') && focusStyle.outlineStyle !== 'none' && parseFloat(focusStyle.outlineWidth) >= 2, JSON.stringify(focusStyle));
      const searchByName = await pageD.getByRole('textbox', { name: 'Search measurements' }).count();
      check('360px: search input has an accessible name', searchByName === 1);

      // Bottom sheet via keyboard + focus trap + Escape + focus restore.
      await pageD.locator('.ve-row__body').first().focus();
      await pageD.keyboard.press('Enter');
      const sheet = pageD.locator('.ve-mobile-sheet');
      await sheet.waitFor({ timeout: 6000 });
      await pageD.waitForTimeout(400);
      const sheetA11y = await pageD.evaluate(() => {
        const el = document.querySelector('.ve-mobile-sheet');
        const active = document.activeElement;
        return {
          role: el?.getAttribute('role'),
          modal: el?.getAttribute('aria-modal'),
          label: el?.getAttribute('aria-label'),
          inside: Boolean(el && active && el.contains(active)),
          bodyOverflow: getComputedStyle(document.body).overflow,
        };
      });
      check('360px: sheet exposes a labelled modal dialog', sheetA11y.role === 'dialog' && sheetA11y.modal === 'true' && /Inspect/.test(sheetA11y.label || ''), JSON.stringify(sheetA11y));
      check('360px: focus moves inside the sheet', sheetA11y.inside);
      check('360px: sheet locks background scroll', sheetA11y.bodyOverflow === 'hidden');

      await pageD.keyboard.press('Shift+Tab');
      check('360px: focus trap keeps reverse Tab inside the sheet', await pageD.evaluate(() => {
        const el = document.querySelector('.ve-mobile-sheet');
        return Boolean(el && el.contains(document.activeElement));
      }));
      await pageD.keyboard.press('Escape');
      await pageD.waitForTimeout(300);
      check('360px: Escape closes the sheet', (await pageD.locator('.ve-mobile-sheet').count()) === 0);
      check('360px: focus returns to the inspected row', await pageD.evaluate(() => document.activeElement?.classList.contains('ve-row__body')));
      check('360px: body scroll is restored after close', (await pageD.evaluate(() => getComputedStyle(document.body).overflow)) !== 'hidden');

      // Backdrop click closes.
      await pageD.locator('.ve-row__body').first().click();
      await sheet.waitFor({ timeout: 6000 });
      await pageD.waitForTimeout(300);
      await pageD.locator('.ve-mobile-sheet__backdrop').click({ position: { x: 10, y: 10 } });
      await pageD.waitForTimeout(300);
      check('360px: backdrop click closes the sheet', (await pageD.locator('.ve-mobile-sheet').count()) === 0);

      // Partial completion at mobile width.
      await pageD.getByRole('button', { name: 'Confirm results & continue' }).click();
      const completionD = pageD.locator('section[aria-labelledby="rc-heading"]');
      await completionD.waitFor({ timeout: 6000 });
      await pageD.waitForTimeout(1000);
      check('360px: completion renders without overflow', await noHorizontalOverflow(pageD));
      check('360px: completion heading receives focus', await pageD.evaluate(() => document.activeElement?.id === 'rc-heading'));
      const ackLabel = await completionD.locator('.rc__ack').innerText();
      check('360px: acknowledgement text is explicit', /remain unverified/i.test(ackLabel));
      await shot(pageD, '15-partial-completion-360.png', true);
    }

    if (width === 768) {
      const docTab = pageD.getByRole('button', { name: /^Document$/ });
      const measTab = pageD.getByRole('button', { name: /Measurements \(/ });
      await docTab.click();
      await pageD.waitForTimeout(200);
      check('768px: Document tab shows the source', await pageD.locator('.ve-source').isVisible());
      check('768px: Document tab hides measurements', !(await pageD.locator('.ve-workspace').isVisible()));
      await measTab.click();
      await pageD.waitForTimeout(200);
      check('768px: Measurements tab restores the list', await pageD.locator('.ve-workspace').isVisible());
      await pageD.getByRole('button', { name: /Inspect HbA1c/ }).first().click();
      await pageD.locator('.ve-mobile-sheet').waitFor({ timeout: 6000 });
      check('768px: inspection remains a bottom sheet below 861px', await pageD.locator('.ve-mobile-sheet').isVisible());
      await shot(pageD, '16-mobile-sheet-768.png');
      await pageD.getByRole('button', { name: 'Close inspection panel' }).click();
    }

    await contextD.close();
  }

  // Reduced motion at desktop and mobile.
  console.log('\n=== Pass E: reduced motion ===');
  const contextE = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const pageE = await contextE.newPage();
  watchConsole(pageE, 'reduced-motion');
  await openVerification(pageE, REPORT_PARTIAL);
  await pageE.getByRole('button', { name: /Inspect HbA1c/ }).first().click();
  await pageE.locator('.ve-inspect').waitFor({ timeout: 6000 });
  const inspectAnim = await pageE.locator('.ve-inspect').evaluate((el) => getComputedStyle(el).animationName);
  check('reduced motion: inspection panel has no entrance animation', inspectAnim === 'none', `animation=${inspectAnim}`);
  await pageE.getByRole('button', { name: 'Close inspection panel' }).click();
  await pageE.getByRole('button', { name: 'Confirm results & continue' }).click();
  const completionE = pageE.locator('section[aria-labelledby="rc-heading"]');
  await completionE.waitFor({ timeout: 6000 });
  const innerAnim = await completionE.locator('.rc__inner').evaluate((el) => getComputedStyle(el).animationName);
  const ringTransition = await completionE.locator('.rc__ring-value').evaluate((el) => getComputedStyle(el).transitionProperty);
  check('reduced motion: completion has no entrance animation', innerAnim === 'none', `animation=${innerAnim}`);
  check('reduced motion: ring does not transition', ringTransition === 'none', `transition=${ringTransition}`);
  await contextE.close();

  const contextF = await browser.newContext({ viewport: { width: 390, height: 900 }, reducedMotion: 'reduce' });
  const pageF = await contextF.newPage();
  watchConsole(pageF, 'reduced-motion-mobile');
  await openVerification(pageF, REPORT_PARTIAL);
  await pageF.locator('.ve-row__body').first().click();
  await pageF.locator('.ve-mobile-sheet').waitFor({ timeout: 6000 });
  const sheetAnim = await pageF.locator('.ve-mobile-sheet').evaluate((el) => getComputedStyle(el).animationName);
  const backdropAnim = await pageF.locator('.ve-mobile-sheet__backdrop').evaluate((el) => getComputedStyle(el).animationName);
  check('reduced motion: sheet and backdrop do not animate', sheetAnim === 'none' && backdropAnim === 'none', `${sheetAnim}/${backdropAnim}`);
  await contextF.close();

  // Contrast: scoped muted-soft token against the page background.
  const contrastRatio = (() => {
    const luminance = (hex) => {
      const value = hex.replace('#', '');
      const channels = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255);
      const linear = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    };
    const a = luminance('64706a');
    const b = luminance('f7f8f3');
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  })();
  check('contrast: scoped muted-soft passes AA', contrastRatio >= 4.5, `ratio=${contrastRatio.toFixed(2)}`);

  check('no uncaught console errors', results.console_errors.length === 0, results.console_errors.join(' | ').slice(0, 400) || 'clean');

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
