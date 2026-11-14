/** Exploratory audit part 2 — completion + responsive matrix. */
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
  const body = await (await responsePromise).json();
  await page.getByText('Your report is ready', { exact: true }).waitFor({ timeout: 240000 });
  await page.getByRole('button', { name: /Review & verify results/i }).click();
  await page.waitForURL(/\/verify/, { timeout: 15000 });
  await page.locator('.ve-workspace').waitFor({ timeout: 15000 });
  return body.id;
}

async function verifyAll(reportId) {
  const res = await fetch(`${API_URL}/api/reports/${reportId}/measurements`);
  const body = await res.json(); const measurements = Array.isArray(body) ? body : (body.measurements ?? []);
  await fetch(`${API_URL}/api/reports/${reportId}/measurements/verify-selected`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ measurement_ids: measurements.map((m) => m.id) }),
  });
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
        minH: cs.minHeight,
      };
    };
    const rows = [...document.querySelectorAll('.ve-row')];
    return {
      viewport: [window.innerWidth, window.innerHeight],
      doc: [document.documentElement.clientWidth, document.documentElement.scrollWidth, document.documentElement.scrollHeight],
      split: pick('.ve-split'),
      source: pick('.ve-source'),
      workspace: pick('.ve-workspace'),
      list: pick('.ve-list'),
      row: pick('.ve-row'),
      rowCount: rows.length,
      rowHeights: rows.slice(0, 6).map((r) => Math.round(r.getBoundingClientRect().height)),
      filters: pick('.ve-filters'),
      chip: pick('.ve-chip'),
      continueBar: pick('.ve-continue'),
      cta: pick('.ve-continue__cta'),
      stage: pick('.ve-stage__viewport'),
      frame: pick('.ve-stage__frame'),
      inspect: pick('.ve-inspect'),
      completion: pick('.rc__inner'),
      headline: pick('.rc__headline'),
      stats: pick('.rc__stats'),
      ack: pick('.rc__ack'),
      ring: pick('.rc__ring'),
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

  // responsive workspace matrix
  for (const width of [360, 390, 768, 1024, 1280, 1440, 1920]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const p = await ctx.newPage();
    await p.goto(`${FRONTEND_URL}/app/reports/${reportId}/verify`, { waitUntil: 'networkidle' });
    await p.locator('.ve-overview').waitFor({ timeout: 30000 });
    await p.waitForTimeout(500);
    await shot(p, `${width}-workspace.png`, width <= 768);
    const m = await metrics(p);
    console.log(width, 'workspace', JSON.stringify({
      doc: m.doc, split: m.split?.box, source: m.source?.box, workspace: m.workspace?.box,
      list: m.list?.box, row: m.row?.box, rowHeights: m.rowHeights,
      filters: m.filters?.box, chip: m.chip?.box, chipsOverflow: m.filters?.overflowX,
      continueBar: m.continueBar?.box, cta: m.cta?.box,
      stage: m.stage?.box, frame: m.frame?.box,
    }));
    if (width <= 860) {
      await p.getByRole('button', { name: /Inspect HbA1c/ }).first().click();
      await p.locator('.ve-inspect').waitFor({ timeout: 6000 });
      await p.waitForTimeout(600);
      await shot(p, `${width}-inspection.png`);
      const im = await metrics(p);
      console.log(width, 'inspection', JSON.stringify({ doc: im.doc, inspect: im.inspect?.box }));
      await p.getByRole('button', { name: 'Close inspection panel' }).click();
    } else if (width >= 1024) {
      await p.getByRole('button', { name: /Inspect HbA1c/ }).first().click();
      await p.locator('.ve-inspect').waitFor({ timeout: 6000 });
      await p.waitForTimeout(600);
      await shot(p, `${width}-inspection.png`);
      const im = await metrics(p);
      console.log(width, 'inspection', JSON.stringify({ split: im.split?.box, source: im.source?.box, stage: im.stage?.box, frame: im.frame?.box, inspect: im.inspect?.box }));
      await p.getByRole('button', { name: 'Close inspection panel' }).click();
    }
    await ctx.close();
  }

  // partial completion matrix
  for (const width of [360, 390, 768, 1024, 1280, 1440, 1920]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const p = await ctx.newPage();
    await p.goto(`${FRONTEND_URL}/app/reports/${reportId}/verify`, { waitUntil: 'networkidle' });
    await p.locator('.ve-overview').waitFor({ timeout: 30000 });
    await p.getByRole('button', { name: 'Confirm results & continue' }).click();
    await p.locator('section[aria-labelledby="rc-heading"]').waitFor({ timeout: 6000 });
    await p.waitForTimeout(1100);
    await shot(p, `${width}-partial.png`, width <= 768);
    const m = await metrics(p);
    console.log(width, 'partial', JSON.stringify({ doc: m.doc, completion: m.completion?.box, headline: m.headline?.box, stats: m.stats?.box, ack: m.ack?.box, ring: m.ring?.box }));
    await ctx.close();
  }

  // full completion matrix
  await verifyAll(reportId);
  for (const width of [360, 390, 768, 1024, 1280, 1440, 1920]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const p = await ctx.newPage();
    await p.goto(`${FRONTEND_URL}/app/reports/${reportId}/verify`, { waitUntil: 'networkidle' });
    await p.locator('.ve-overview').waitFor({ timeout: 30000 });
    await p.getByRole('button', { name: 'Confirm results & continue' }).click();
    await p.locator('section[aria-labelledby="rc-heading"]').waitFor({ timeout: 6000 });
    await p.waitForTimeout(1100);
    await shot(p, `${width}-full.png`, width <= 768);
    const m = await metrics(p);
    console.log(width, 'full', JSON.stringify({ doc: m.doc, completion: m.completion?.box, headline: m.headline?.box, stats: m.stats?.box, ring: m.ring?.box }));
    await ctx.close();
  }

  console.log('console errors', errors);
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });


