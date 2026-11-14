/** Exploratory audit for Phase 9.11.5 (not the final QA artifact). */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FRONTEND_URL = 'http://127.0.0.1:5174';
const API_URL = 'http://127.0.0.1:8001';
const QA_DIR = path.resolve(__dirname);
const PROJECT_ROOT = path.resolve(QA_DIR, '..', '..', '..');
const DIGITAL = path.join(PROJECT_ROOT, 'backend', 'tests', 'fixtures', 'phase8_1_accuracy', 'clean_digital_report.pdf');
const OUT = path.join(QA_DIR, 'screenshots', 'phase9_11_5_audit');

async function upload(page) {
  await page.goto(`${FRONTEND_URL}/app/upload`, { waitUntil: 'networkidle' });
  await page.locator('input[type="file"]').setInputFiles(DIGITAL);
  await page.locator('input[type="checkbox"]').check();
  const responsePromise = page.waitForResponse(
    (r) => r.url() === `${API_URL}/api/reports` && r.request().method() === 'POST',
    { timeout: 30000 },
  );
  await page.getByRole('button', { name: /Start analysis/i }).click();
  const response = await responsePromise;
  const body = await response.json();
  await page.getByText('Your report is ready', { exact: true }).waitFor({ timeout: 240000 });
  await page.getByRole('button', { name: /Review & verify results/i }).click();
  await page.waitForURL(/\/verify/, { timeout: 15000 });
  await page.locator('.ve-workspace').waitFor({ timeout: 15000 });
  return body.id;
}

function metrics(page) {
  return page.evaluate(() => {
    const pick = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        font: cs.fontSize + '/' + cs.lineHeight,
        overflowX: el.scrollWidth > el.clientWidth + 1,
        color: cs.color,
        bg: cs.backgroundColor,
      };
    };
    return {
      viewport: [window.innerWidth, window.innerHeight],
      docScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      split: pick('.ve-split'),
      source: pick('.ve-source'),
      workspace: pick('.ve-workspace'),
      header: pick('.ve-overview'),
      tab: pick('.ve-mobile-tabs'),
      row: pick('.ve-row'),
      rowBody: pick('.ve-row__body'),
      name: pick('.ve-row__name'),
      value: pick('.ve-row__value-main'),
      range: pick('.ve-row__range'),
      status: pick('.ve-row__status'),
      filters: pick('.ve-filters'),
      search: pick('.ve-search'),
      continueBar: pick('.ve-continue'),
      cta: pick('.ve-continue__cta'),
      stage: pick('.ve-stage__viewport'),
      frame: pick('.ve-stage__frame'),
      inspect: pick('.ve-inspect'),
      completion: pick('.rc__inner'),
      headline: pick('.rc__headline'),
      rcStats: pick('.rc__stats'),
      ack: pick('.rc__ack'),
    };
  });
}

async function shot(page, name, fullPage = false) {
  await page.screenshot({ path: path.join(OUT, name), fullPage });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) errors.push(m.text());
  });
  const reportId = await upload(page);

  await page.waitForTimeout(500);
  await shot(page, '1440-workspace.png');
  console.log('1440 workspace', JSON.stringify(await metrics(page), null, 1));

  await page.getByRole('button', { name: /Inspect HbA1c/ }).first().click();
  await page.waitForTimeout(600);
  await shot(page, '1440-inspection.png');
  console.log('1440 inspection', JSON.stringify(await metrics(page), null, 1));

  await page.getByRole('button', { name: 'Edit HbA1c' }).click();
  await page.waitForTimeout(300);
  await shot(page, '1440-edit.png');
  await page.getByRole('button', { name: /Cancel/i }).click();

  // responsive matrix on the same report
  for (const width of [360, 390, 768, 1024, 1280, 1920]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const p = await ctx.newPage();
    p.on('console', (m) => {
      if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) errors.push(m.text());
    });
    await p.goto(`${FRONTEND_URL}/app/reports/${reportId}/verify`, { waitUntil: 'networkidle' });
    await p.locator('.ve-workspace').waitFor({ timeout: 30000 });
    await p.waitForTimeout(400);
    await shot(p, `${width}-workspace.png`, width <= 768);
    const m = await metrics(p);
    console.log(width, 'workspace', JSON.stringify({
      viewport: m.viewport,
      docScrollWidth: m.docScrollWidth,
      split: m.split && m.split.box,
      source: m.source && m.source.box,
      workspace: m.workspace && m.workspace.box,
      room: m.workspace && m.workspace.box[2],
      row: m.row && m.row.box,
      name: m.name && m.name.font,
      value: m.value && m.value.font,
      range: m.range && m.range.font,
      tab: m.tab && m.tab.box,
      filters: m.filters && m.filters.box,
      search: m.search && m.search.box,
      continueBar: m.continueBar && m.continueBar.box,
      stage: m.stage && m.stage.box,
      frame: m.frame && m.frame.box,
      overflow: m.viewport[0] < m.docScrollWidth,
    }));
    if (width <= 860) {
      await p.getByRole('button', { name: /Inspect HbA1c/ }).first().click();
      await p.locator('.ve-inspect').waitFor({ timeout: 6000 });
      await p.waitForTimeout(600);
      await shot(p, `${width}-inspection.png`);
      const im = await metrics(p);
      console.log(width, 'inspection', JSON.stringify({ inspect: im.inspect && im.inspect.box, overflow: im.viewport[0] < im.docScrollWidth }));
      await p.getByRole('button', { name: 'Close inspection panel' }).click();
    }
    await ctx.close();
  }

  // completion both states
  const ctxC = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pC = await ctxC.newPage();
  pC.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) errors.push(m.text()); });
  await pC.goto(`${FRONTEND_URL}/app/reports/${reportId}/verify`, { waitUntil: 'networkidle' });
  await pC.locator('.ve-workspace').waitFor({ timeout: 30000 });
  await pC.getByRole('button', { name: 'Confirm results & continue' }).click();
  await pC.locator('section[aria-labelledby="rc-heading"]').waitFor({ timeout: 6000 });
  await pC.waitForTimeout(1200);
  await shot(pC, '1440-completion-partial.png', true);
  console.log('1440 partial', JSON.stringify(await metrics(pC), null, 1));
  for (const width of [360, 390, 768, 1024, 1280, 1920]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const p = await ctx.newPage();
    await p.goto(`${FRONTEND_URL}/app/reports/${reportId}/verify`, { waitUntil: 'networkidle' });
    await p.locator('.ve-workspace').waitFor({ timeout: 30000 });
    await p.getByRole('button', { name: 'Confirm results & continue' }).click();
    await p.locator('section[aria-labelledby="rc-heading"]').waitFor({ timeout: 6000 });
    await p.waitForTimeout(1100);
    await shot(p, `${width}-completion.png`, true);
    const m = await metrics(p);
    console.log(width, 'completion', JSON.stringify({
      docScrollWidth: m.docScrollWidth,
      completion: m.completion && m.completion.box,
      headline: m.headline && m.headline.box,
      stats: m.rcStats && m.rcStats.box,
      ack: m.ack && m.ack.box,
      overflow: m.viewport[0] < m.docScrollWidth,
    }));
    await ctx.close();
  }
  await ctxC.close();
  console.log('console errors', errors);
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
