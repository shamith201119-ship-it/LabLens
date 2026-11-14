/**
 * Phase 9.11.4 — Review completion & responsive navigation QA.
 *
 * Isolated stack:
 *   frontend http://127.0.0.1:5174  (VITE_API_BASE=http://127.0.0.1:8001)
 *   backend  http://127.0.0.1:8001  (LABLENS_DATA_DIR=temp lablens-phase9114-qa)
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FRONTEND_URL = 'http://127.0.0.1:5174';
const API_URL = 'http://127.0.0.1:8001';
const QA_DIR = path.resolve(__dirname);
const PROJECT_ROOT = path.resolve(QA_DIR, '..', '..', '..');
const DIGITAL = path.join(PROJECT_ROOT, 'backend', 'tests', 'fixtures', 'phase8_1_accuracy', 'clean_digital_report.pdf');
const PHOTO = path.join(PROJECT_ROOT, 'backend', 'tests', 'fixtures', 'phase9_5', 'photographed_report.jpg');
const SHOT_DIR = path.join(QA_DIR, 'screenshots', 'phase9_11_4');
const RESULTS_PATH = path.join(QA_DIR, 'phase9_11_4_results.json');

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
  const reportId = body.id;
  await page.getByRole('button', { name: /Review & verify results/i }).click();
  await page.waitForURL(/\/verify/, { timeout: 15000 });
  await page.locator('.ve-workspace').waitFor({ timeout: 15000 });
  return reportId;
}

function reportFromUrl(url) {
  const match = url.match(/reports\/([^/]+)\/verify/);
  return match ? match[1] : null;
}

async function apiMeasurements(reportId) {
  const res = await fetch(`${API_URL}/api/reports/${reportId}/measurements`);
  const body = await res.json();
  return Array.isArray(body) ? body : (body.measurements ?? []);
}

async function apiAnalysis(reportId) {
  const res = await fetch(`${API_URL}/api/reports/${reportId}/analysis`);
  return res.json();
}

async function checkAllRows(page) {
  const boxes = page.locator('.ve-row .ve-checkbox');
  const count = await boxes.count();
  for (let i = 0; i < count; i += 1) {
    await boxes.nth(i).check();
  }
  return count;
}

function watchConsole(page) {
  page.on('console', (message) => {
    if (message.type() === 'error' && !/Failed to load resource/i.test(message.text())) {
      results.console_errors.push(message.text());
    }
  });
}

async function noHorizontalOverflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth <= doc.clientWidth + 1;
  });
}

async function main() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  // ===== Pass A: full verification -> completion -> results current =====
  console.log('\n=== Pass A: all verified → completion ===');
  const contextA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pageA = await contextA.newPage();
  watchConsole(pageA);
  const reportA = await uploadAndStart(pageA, DIGITAL);
  const totalRows = await checkAllRows(pageA);
  await pageA.getByRole('button', { name: /Confirm selected \(/ }).click();
  await pageA.waitForFunction(
    () => document.querySelectorAll('.ve-row.is-confirmed').length > 0,
    null,
    { timeout: 15000 },
  );
  await pageA.getByRole('button', { name: 'Confirm results & continue' }).click();
  const completionA = pageA.locator('section[aria-labelledby="rc-heading"]');
  await completionA.waitFor({ timeout: 6000 });
  await pageA.waitForTimeout(1000);
  const headlineA = await completionA.locator('#rc-heading').innerText();
  check('fully verified → completion headline shown', headlineA.includes('Your report review is complete.'), headlineA);
  const textA = await completionA.innerText();
  check('completion shows “What happens next”', /what happens next/i.test(textA));
  check('completion shows total/confirmed/corrected counters', /Total reviewed/i.test(textA) && /Confirmed/i.test(textA) && /Corrected/i.test(textA));
  check('completion does not claim medical approval', !/medically normal|medical approval|approved/i.test(textA));
  await shot(pageA, '01-full-review-completion.png', true);

  const continueCta = completionA.getByRole('button', { name: 'Continue to your results' });
  check('single obvious primary action to continue', await continueCta.isVisible());
  await continueCta.click();
  await pageA.waitForURL(/\/app\/reports\/[^/]+\/results/, { timeout: 30000 });
  const analysisA = await apiAnalysis(reportA);
  check('fully verified proceeds to results; analysis is current', analysisA.freshness === 'current', `freshness=${analysisA.freshness}`);
  const assessmentsA = Array.isArray(analysisA.assessments) ? analysisA.assessments.length : 0;
  check('analysis contains assessments after full review', assessmentsA > 0, `assessments=${assessmentsA}`);
  await pageA.waitForTimeout(400);
  await shot(pageA, '02-full-review-results.png');
  await contextA.close();

  // ===== Pass B: partial review -> acknowledgement gate =====
  console.log('\n=== Pass B: partial review → acknowledgement ===');
  const contextB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pageB = await contextB.newPage();
  watchConsole(pageB);
  const reportB = await uploadAndStart(pageB, DIGITAL);
  // Leave at least one unverified: confirm only the first row.
  const firstBox = pageB.locator('.ve-row .ve-checkbox').first();
  await firstBox.check();
  await pageB.getByRole('button', { name: /Confirm selected \(1\)/ }).click();
  await pageB.waitForTimeout(600);
  await pageB.getByRole('button', { name: 'Confirm results & continue' }).click();
  const completionB = pageB.locator('section[aria-labelledby="rc-heading"]');
  await completionB.waitFor({ timeout: 6000 });
  await pageB.waitForTimeout(1000);
  const headlineB = await completionB.locator('#rc-heading').innerText();
  check('partial review → completion headline shown', headlineB.includes("You've reviewed what you could."), headlineB);
  const textB = await completionB.innerText();
  check('partial state explains unverified exclusion', /will not be included in the analysis/i.test(textB));
  check('partial state lists confirmed/corrected/unverified counts', /Confirmed/i.test(textB) && /Corrected/i.test(textB) && /Still unverified/i.test(textB));
  check('partial state does NOT claim everything was reviewed', !/all results (are )?confirmed/i.test(textB));

  const finishBtn = completionB.getByRole('button', { name: /Finish for now/i });
  check('finish is disabled before acknowledgement', await finishBtn.isDisabled());
  await shot(pageB, '03-partial-review-gate.png', true);

  // tick acknowledgement via keyboard (Space) — exercises keyboard a11y
  const ackBox = completionB.locator('.rc__ack-box');
  await ackBox.focus();
  await pageB.keyboard.press('Space');
  await pageB.waitForTimeout(150);
  check('acknowledgement enables finish', !(await finishBtn.isDisabled()));
  await shot(pageB, '03b-partial-review-acknowledged.png');

  // acknowledgement must never verify anything
  const beforeAck = await apiMeasurements(reportB);
  const beforeUnverified = beforeAck.filter((m) => m.verification_status !== 'verified').length;
  check('acknowledgement wrote no verification changes', beforeUnverified === beforeAck.length - 1, `unverified=${beforeUnverified}`);

  // Return to remaining measurements
  await completionB.getByRole('button', { name: /Return to remaining measurements/i }).click();
  await pageB.locator('.ve-workspace').waitFor({ timeout: 5000 });
  check('returning to remaining measurements works', await pageB.locator('.ve-workspace').isVisible());
  const unverifiedRows = await pageB.locator('.ve-row:not(.is-confirmed)').count();
  check('remaining measurements still visible & unverified', unverifiedRows >= 1, `unverifiedRows=${unverifiedRows}`);

  // Back to completion, acknowledge and finish
  await pageB.getByRole('button', { name: 'Confirm results & continue' }).click();
  await completionB.waitFor({ timeout: 6000 });
  await completionB.locator('.rc__ack-box').click();
  await completionB.getByRole('button', { name: /Finish for now/i }).click();
  await pageB.waitForURL(/\/app\/reports\/[^/]+\/results/, { timeout: 30000 });
  const afterAck = await apiMeasurements(reportB);
  const stillUnverified = afterAck.filter((m) => m.verification_status !== 'verified');
  check('finishing for now did not verify any measurement', stillUnverified.length === beforeUnverified, `unverified=${stillUnverified.length}`);
  const analysisB = await apiAnalysis(reportB);
  const unverifiedIds = new Set(stillUnverified.map((m) => m.id));
  const leaked = (analysisB.assessments ?? []).some((a) => unverifiedIds.has(a.measurement_id));
  check('unverified measurements remain excluded from analysis', !leaked, `assessments=${(analysisB.assessments ?? []).length}`);
  await contextB.close();

  // ===== Pass C: correction still invalidates re-verification =====
  console.log('\n=== Pass C: correction invalidates freshness ===');
  const contextC = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pageC = await contextC.newPage();
  watchConsole(pageC);
  const reportC = await uploadAndStart(pageC, DIGITAL);
  await pageC.getByRole('button', { name: 'Edit HbA1c' }).click();
  await pageC.locator('.ve-inspect__edit input').first().fill('6.0');
  await pageC.getByRole('button', { name: /Save correction/i }).click();
  await pageC.waitForFunction(() => !document.querySelector('.ve-inspect__edit'), null, { timeout: 15000 });
  const rowC = await pageC.locator('.ve-inspect').innerText();
  check('corrected result returns to Needs review', rowC.includes('Needs review'));
  check('corrected result carries Edited marker', rowC.includes('EDITED'));
  check('corrected result is not auto-verified', (await pageC.locator('.ve-row.is-confirmed').count()) === 0);
  await shot(pageC, '04-correction-invalidation.png');

  // Wide layout: the inspection panel replaces the rail, so close it before
  // selecting all rows to re-verify.
  await pageC.getByRole('button', { name: 'Close inspection panel' }).click();
  await pageC.locator('.ve-workspace').waitFor({ timeout: 15000 });

  // confirm everything, then continue → analysis must be current and include the re-confirmed value
  await checkAllRows(pageC);
  await pageC.getByRole('button', { name: /Confirm selected \(/ }).click();
  await pageC.waitForFunction(() => document.querySelectorAll('.ve-row.is-confirmed').length > 0, null, { timeout: 15000 });
  await pageC.getByRole('button', { name: 'Confirm results & continue' }).click();
  await pageC.locator('section[aria-labelledby="rc-heading"]').waitFor({ timeout: 6000 });
  await pageC.waitForTimeout(1000);
  await pageC.locator('section[aria-labelledby="rc-heading"]').getByRole('button', { name: 'Continue to your results' }).click();
  await pageC.waitForURL(/\/results/, { timeout: 30000 });
  const analysisC = await apiAnalysis(reportC);
  check('re-verified report produces current analysis', analysisC.freshness === 'current', `freshness=${analysisC.freshness}`);
  await contextC.close();

  // ===== Pass D: mobile segmented control + bottom sheet =====
  console.log('\n=== Pass D: mobile navigation (360px / 390px) ===');
  for (const width of [360, 390]) {
    const contextD = await browser.newContext({ viewport: { width, height: 800 } });
    const pageD = await contextD.newPage();
    watchConsole(pageD);
    await uploadAndStart(pageD, DIGITAL);
    check(`${width}px: no horizontal overflow on load`, await noHorizontalOverflow(pageD));

    const tabGroup = pageD.locator('.ve-mobile-tabs[role="group"]');
    check(`${width}px: segmented control visible`, await tabGroup.isVisible());
    const docTab = pageD.getByRole('button', { name: /^Document$/ });
    const measTab = pageD.getByRole('button', { name: /Measurements \(/ });
    check(`${width}px: measurements tab active by default`, (await measTab.getAttribute('aria-pressed')) === 'true');

    await docTab.click();
    await pageD.waitForTimeout(200);
    check(`${width}px: Document tab switches panel`, (await docTab.getAttribute('aria-pressed')) === 'true');
    check(`${width}px: document panel visible in Document tab`, await pageD.locator('.ve-source').isVisible());
    check(`${width}px: workspace hidden in Document tab`, !(await pageD.locator('.ve-workspace').isVisible()));

    await measTab.click();
    await pageD.waitForTimeout(200);
    check(`${width}px: Measurements tab switches back`, await pageD.locator('.ve-workspace').isVisible());

    // tap a row → sheet opens over the Measurements tab (accepted mobile behavior)
    await pageD.getByRole('button', { name: /Inspect HbA1c/ }).first().click();
    await pageD.locator('.ve-mobile-sheet').waitFor({ timeout: 6000 });
    check(`${width}px: inspection bottom sheet opens`, await pageD.locator('.ve-mobile-sheet').isVisible());
    check(`${width}px: sheet opens over the Measurements tab`, (await measTab.getAttribute('aria-pressed')) === 'true' && (await docTab.getAttribute('aria-pressed')) === 'false');
    check(`${width}px: no horizontal overflow with sheet open`, await noHorizontalOverflow(pageD));
    await pageD.getByRole('button', { name: 'Close inspection panel' }).click();
    await pageD.waitForTimeout(200);
    check(`${width}px: sheet closes`, (await pageD.locator('.ve-mobile-sheet').count()) === 0);
    await shot(pageD, `05-mobile-${width}.png`);
    await contextD.close();
  }

  // ===== Pass E: responsive widths incl. completion =====
  console.log('\n=== Pass E: responsive matrix ===');
  for (const width of [360, 390, 768, 1280, 1440, 1920]) {
    const contextE = await browser.newContext({ viewport: { width, height: 900 } });
    const pageE = await contextE.newPage();
    watchConsole(pageE);
    await uploadAndStart(pageE, DIGITAL);
    await checkAllRows(pageE);
    await pageE.getByRole('button', { name: /Confirm selected \(/ }).click();
    await pageE.waitForFunction(() => document.querySelectorAll('.ve-row.is-confirmed').length > 0, null, { timeout: 15000 });
    await pageE.getByRole('button', { name: 'Confirm results & continue' }).click();
    const completionE = pageE.locator('section[aria-labelledby="rc-heading"]');
    await completionE.waitFor({ timeout: 6000 });
    await pageE.waitForTimeout(1000);
    check(`${width}px: completion renders`, await completionE.isVisible());
    check(`${width}px: no horizontal overflow (completion)`, await noHorizontalOverflow(pageE));
    const ringBox = await completionE.locator('.rc__ring').boundingBox();
    check(`${width}px: completion ring visible`, ringBox !== null && ringBox.width > 60);
    if (width === 1280 || width === 1920) {
      await shot(pageE, `06-completion-${width}.png`, true);
    } else if (width === 360) {
      await shot(pageE, `06-completion-${width}.png`, true);
    }
    await contextE.close();
  }

  // ===== Pass F: reduced motion + keyboard =====
  console.log('\n=== Pass F: reduced motion & keyboard ===');
  const contextF = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const pageF = await contextF.newPage();
  watchConsole(pageF);
  await uploadAndStart(pageF, DIGITAL);
  await checkAllRows(pageF);
  await pageF.getByRole('button', { name: /Confirm selected \(/ }).click();
  await pageF.waitForFunction(() => document.querySelectorAll('.ve-row.is-confirmed').length > 0, null, { timeout: 15000 });
  await pageF.getByRole('button', { name: 'Confirm results & continue' }).click();
  const completionF = pageF.locator('section[aria-labelledby="rc-heading"]');
  await completionF.waitFor({ timeout: 6000 });
  await pageF.waitForTimeout(1000);
  const ringTransition = await completionF.locator('.rc__ring-value').evaluate((el) => getComputedStyle(el).transitionProperty);
  check('reduced motion disables ring transition', ringTransition === 'none', `transition-property=${ringTransition}`);
  const innerAnim = await completionF.locator('.rc__inner').evaluate((el) => getComputedStyle(el).animationName);
  check('reduced motion disables entrance animation', innerAnim === 'none', `animation=${innerAnim}`);

  // keyboard: Tab order reaches primary CTA; Enter activates it
  await completionF.getByRole('button', { name: 'Continue to your results' }).focus();
  await pageF.keyboard.press('Enter');
  await pageF.waitForURL(/\/app\/reports\/[^/]+\/results/, { timeout: 30000 });
  check('keyboard activation of primary CTA works', true);
  await contextF.close();

  // ===== Pass G: photograph regression (smoke) =====
  console.log('\n=== Pass G: photograph fixture ===');
  const contextG = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pageG = await contextG.newPage();
  watchConsole(pageG);
  try {
    const reportG = await uploadAndStart(pageG, PHOTO);
    check('photograph fixture uploads and reaches verification', Boolean(reportG));
    await shot(pageG, '07-photo-verification.png', true);
  } catch (error) {
    check('photograph fixture uploads and reaches verification', false, error.message.slice(0, 160));
  }
  await contextG.close();

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
