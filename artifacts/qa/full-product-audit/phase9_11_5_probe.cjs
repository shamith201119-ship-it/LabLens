/** Targeted a11y/interaction probe for Phase 9.11.5. */
const { chromium } = require('playwright');
const path = require('path');

const FRONTEND_URL = 'http://127.0.0.1:5174';
const API_URL = 'http://127.0.0.1:8001';
const QA_DIR = path.resolve(__dirname);
const PROJECT_ROOT = path.resolve(QA_DIR, '..', '..', '..');
const DIGITAL = path.join(PROJECT_ROOT, 'backend', 'tests', 'fixtures', 'phase8_1_accuracy', 'clean_digital_report.pdf');

async function upload(page) {
  await page.goto(`${FRONTEND_URL}/app/upload`, { waitUntil: 'networkidle' });
  await page.locator('input[type="file"]').setInputFiles(DIGITAL);
  await page.locator('input[type="checkbox"]').check();
  const rp = page.waitForResponse((r) => r.url() === `${API_URL}/api/reports` && r.request().method() === 'POST', { timeout: 30000 });
  await page.getByRole('button', { name: /Start analysis/i }).click();
  const body = await (await rp).json();
  await page.getByText('Your report is ready', { exact: true }).waitFor({ timeout: 240000 });
  await page.getByRole('button', { name: /Review & verify results/i }).click();
  await page.waitForURL(/\/verify/, { timeout: 15000 });
  await page.locator('.ve-overview').waitFor({ timeout: 15000 });
  return body.id;
}

function contrast(fg, bg) {
  const parse = (c) => {
    const m = c.match(/rgba?\(([\d.]+), ([\d.]+), ([\d.]+)/);
    if (!m) return null;
    return [+m[1], +m[2], +m[3]];
  };
  const lum = (rgb) => {
    const a = rgb.map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  };
  const f = parse(fg), b = parse(bg);
  if (!f || !b) return null;
  const l1 = lum(f), l2 = lum(b);
  return ((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const reportId = await upload(page);

  // edit while panel already open
  await page.getByRole('button', { name: /Inspect HbA1c/ }).first().click();
  await page.locator('.ve-inspect').waitFor();
  await page.getByRole('button', { name: 'Edit HbA1c' }).click();
  await page.waitForTimeout(300);
  console.log('edit-while-open count:', await page.locator('.ve-inspect__edit').count());

  // close then open edit
  await page.getByRole('button', { name: 'Close inspection panel' }).click();
  await page.getByRole('button', { name: 'Edit HbA1c' }).click();
  await page.waitForTimeout(300);
  console.log('edit-after-close count:', await page.locator('.ve-inspect__edit').count());
  if (await page.locator('.ve-inspect__edit').count()) {
    await page.getByRole('button', { name: /Cancel/i }).click();
  }
  await page.getByRole('button', { name: 'Close inspection panel' }).click().catch(() => {});

  // rows + contrast
  const colors = await page.evaluate(() => {
    const out = [];
    for (const sel of ['.ve-row__name', '.ve-row__meta', '.ve-row__page', '.ve-row__flag', '.ve-row__range', '.ve-row__status-label', '.ve-workspace__counter', '.ve-workspace__hint', '.ve-chip__count', '.ve-counts__item dt', '.ve-lede', '.ve-honesty', '.ve-source__legend', '.ve-stage__zoom']) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const cs = getComputedStyle(el);
      let bg = cs.backgroundColor;
      let p = el;
      while ((bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') && p.parentElement) {
        p = p.parentElement;
        bg = getComputedStyle(p).backgroundColor;
      }
      if (bg === 'rgba(0, 0, 0, 0)') bg = 'rgb(255, 255, 255)';
      out.push({ sel, text: (el.textContent || '').trim().slice(0, 30), font: cs.fontSize, weight: cs.fontWeight, color: cs.color, bg });
    }
    return out;
  });
  for (const c of colors) console.log('contrast', c.sel, c.font, c.weight, contrast(c.color, c.bg), c.color, c.bg, JSON.stringify(c.text));

  // tab order and accessible names on verification page
  const snap = await page.accessibility.snapshot({ interestingOnly: true });
  const flat = [];
  const walk = (n, d = 0) => { flat.push(' '.repeat(d) + n.role + ' ' + (n.name || '') + (n.checked !== undefined ? ` checked=${n.checked}` : '') + (n.disabled ? ' disabled' : '')); (n.children || []).forEach((c) => walk(c, d + 1)); };
  walk(snap);
  console.log(flat.slice(0, 120).join('\n'));

  // mobile sheet focus + escape + background scroll
  const mctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const mp = await mctx.newPage();
  await mp.goto(`${FRONTEND_URL}/app/reports/${reportId}/verify`, { waitUntil: 'networkidle' });
  await mp.locator('.ve-overview').waitFor();
  await mp.getByRole('button', { name: /Inspect HbA1c/ }).first().click();
  await mp.locator('.ve-mobile-sheet').waitFor();
  await mp.waitForTimeout(500);
  console.log('sheet active element:', await mp.evaluate(() => {
    const el = document.activeElement;
    return el ? `${el.tagName}.${el.className} ${el.getAttribute('aria-label') || ''}` : 'none';
  }));
  console.log('body overflow while sheet:', await mp.evaluate(() => getComputedStyle(document.body).overflow));
  await mp.keyboard.press('Escape');
  await mp.waitForTimeout(300);
  console.log('sheet after Escape:', await mp.locator('.ve-mobile-sheet').count());
  // tab 30 times, see if focus escapes
  let escaped = false;
  for (let i = 0; i < 30; i += 1) {
    await mp.keyboard.press('Tab');
    const inside = await mp.evaluate(() => document.querySelector('.ve-mobile-sheet')?.contains(document.activeElement));
    if (!inside) { escaped = true; break; }
  }
  console.log('focus escapes sheet within 30 tabs:', escaped);
  await mctx.close();

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
