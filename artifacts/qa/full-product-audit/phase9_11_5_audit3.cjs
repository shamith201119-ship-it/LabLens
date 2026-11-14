/** Phase 9.11.5 iterative visual/metric probe. */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FRONTEND_URL = 'http://127.0.0.1:5174';
const API_URL = 'http://127.0.0.1:8001';
const REPORT_ID = '0cc6827e-1722-479b-8b1a-db0e173c14bf';
const OUT = path.join(path.resolve(__dirname), 'screenshots', 'phase9_11_5_audit');

function metrics(page) {
  return page.evaluate(() => {
    const pick = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        display: cs.display,
        font: cs.fontSize + '/' + cs.lineHeight,
        overflowX: el.scrollWidth > el.clientWidth + 1,
        overflowY: el.scrollHeight > el.clientHeight + 1,
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
      rowBody: pick('.ve-row__body'),
      name: pick('.ve-row__name-cell'),
      value: pick('.ve-row__value'),
      range: pick('.ve-row__range'),
      status: pick('.ve-row__status'),
      rowHeights: rows.slice(0, 6).map((r) => Math.round(r.getBoundingClientRect().height)),
      filters: pick('.ve-filters'),
      chip: pick('.ve-chip'),
      chips: [...document.querySelectorAll('.ve-chip')].map((c) => {
        const r = c.getBoundingClientRect();
        return {
          text: (c.textContent || '').trim().replace(/\s+/g, ' '),
          box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
          clipped: r.right > document.querySelector('.ve-filters').getBoundingClientRect().right + 1,
        };
      }),
      filtersTail: (() => {
        const f = document.querySelector('.ve-filters');
        if (!f) return null;
        return { scrollWidth: f.scrollWidth, clientWidth: f.clientWidth };
      })(),
      search: pick('.ve-search'),
      continueBar: pick('.ve-continue'),
      cta: pick('.ve-continue__cta'),
      stage: pick('.ve-stage__viewport'),
      frame: pick('.ve-stage__frame'),
      inspect: pick('.ve-inspect'),
      tabs: pick('.ve-mobile-tabs'),
      tab: pick('.ve-tab'),
      checkbox: pick('.ve-checkbox'),
      iconBtn: pick('.ve-row__actions .ve-icon-btn'),
      closeBtn: pick('.ve-inspect .ve-icon-btn'),
      sheet: pick('.ve-mobile-sheet'),
      backdrop: pick('.ve-mobile-sheet__backdrop'),
      completion: pick('.rc__inner'),
    };
  });
}

async function shot(page, name, fullPage = false) {
  await page.screenshot({ path: path.join(OUT, name), fullPage });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  for (const width of [360, 390, 768, 1024, 1080, 1199, 1200, 1280, 1440, 1920]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await ctx.newPage();
    page.on('console', (m) => {
      if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) errors.push(`${width}: ${m.text()}`);
    });
    await page.goto(`${FRONTEND_URL}/app/reports/${REPORT_ID}/verify`, { waitUntil: 'networkidle' });
    await page.locator('.ve-overview').waitFor({ timeout: 30000 });
    await page.waitForTimeout(500);
    await shot(page, `${width}-workspace-v2.png`, width <= 768);
    const m = await metrics(page);
    console.log(width, 'workspace', JSON.stringify({
      doc: m.doc,
      split: m.split?.box,
      source: m.source?.box,
      workspace: m.workspace?.box,
      list: m.list?.box,
      row: m.row?.box,
      rowHeights: m.rowHeights,
      value: m.value?.box,
      range: m.range?.box,
      status: m.status?.box,
      filters: m.filters?.box,
      chip: m.chip?.box,
      chips: m.chips,
      filtersTail: m.filtersTail,
      search: m.search?.box,
      continueBar: m.continueBar?.box,
      cta: m.cta?.box,
      stage: m.stage?.box,
      tabs: m.tabs?.box,
      checkbox: m.checkbox?.box,
      iconBtn: m.iconBtn?.box,
    }));

    // inspection at every width
    await page.getByRole('button', { name: /Inspect HbA1c/ }).first().click();
    await page.locator('.ve-inspect').waitFor({ timeout: 6000 });
    await page.waitForTimeout(width > 860 && width < 1200 ? 900 : 500);
    await shot(page, `${width}-inspection-v2.png`);
    const im = await metrics(page);
    console.log(width, 'inspection', JSON.stringify({
      doc: im.doc,
      split: im.split?.box,
      source: im.source?.box,
      stage: im.stage?.box,
      frame: im.frame?.box,
      inspect: im.inspect?.box,
      closeBtn: im.closeBtn?.box,
      sheet: im.sheet?.box,
      backdrop: im.backdrop?.box,
      scrollY: await page.evaluate(() => Math.round(window.scrollY)),
      active: await page.evaluate(() => {
        const el = document.activeElement;
        return el ? `${el.tagName}.${el.className}` : 'none';
      }),
    }));

    if (width <= 860) {
      console.log(width, 'sheet-active', await page.evaluate(() => {
        const el = document.activeElement;
        return el ? `${el.tagName}.${el.className}` : 'none';
      }));
      console.log(width, 'body-overflow', await page.evaluate(() => getComputedStyle(document.body).overflow));
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      console.log(width, 'sheet-after-escape', await page.locator('.ve-mobile-sheet').count());
      console.log(width, 'focus-after-escape', await page.evaluate(() => {
        const el = document.activeElement;
        return el ? `${el.tagName}.${el.className} ${el.getAttribute('aria-label') || ''}` : 'none';
      }));
    } else {
      await page.getByRole('button', { name: 'Close inspection panel' }).click();
      await page.waitForTimeout(200);
      console.log(width, 'after-close', JSON.stringify({
        scrollY: await page.evaluate(() => Math.round(window.scrollY)),
        active: await page.evaluate(() => {
          const el = document.activeElement;
          return el ? `${el.tagName}.${el.className} ${el.getAttribute('aria-label') || ''}` : 'none';
        }),
      }));
    }

    // edit while inspect panel already open (wide rail mounted? reopen)
    if (width > 860) {
      await page.getByRole('button', { name: /Inspect HbA1c/ }).first().click();
      await page.locator('.ve-inspect').waitFor({ timeout: 6000 });
      await page.getByRole('button', { name: 'Edit extracted value' }).click();
      await page.waitForTimeout(350);
      console.log(width, 'edit-while-open', await page.locator('.ve-inspect__edit').count());
      if (await page.locator('.ve-inspect__edit').count()) {
        await page.getByRole('button', { name: /Cancel/i }).click();
      }
      await page.getByRole('button', { name: 'Close inspection panel' }).click().catch(() => {});
    }
    await ctx.close();
  }
  console.log('console errors', errors);
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });


