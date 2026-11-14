/** Debug docked inspection scroll position at 1024. */
const { chromium } = require('playwright');

const FRONTEND_URL = 'http://127.0.0.1:5174';
const REPORT_ID = '0cc6827e-1722-479b-8b1a-db0e173c14bf';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${FRONTEND_URL}/app/reports/${REPORT_ID}/verify`, { waitUntil: 'networkidle' });
  await page.locator('.ve-overview').waitFor();
  await page.waitForTimeout(400);
  console.log('before', await page.evaluate(() => ({
    scrollY: Math.round(window.scrollY),
    docH: document.documentElement.scrollHeight,
    max: document.documentElement.scrollHeight - window.innerHeight,
  })));
  await page.getByRole('button', { name: /Inspect HbA1c/ }).first().click();
  await page.locator('.ve-inspect').waitFor();
  for (const wait of [50, 200, 400, 800, 1200]) {
    await page.waitForTimeout(wait);
    console.log(`step +${wait}`, await page.evaluate(() => {
      const p = document.querySelector('.ve-inspect');
      const t = document.querySelector('.ve-mobile-tabs');
      const r = p.getBoundingClientRect();
      const tr = t ? t.getBoundingClientRect() : null;
      return {
        scrollY: Math.round(window.scrollY),
        panelTop: Math.round(r.top),
        panelBottom: Math.round(r.bottom),
        tabsTop: tr ? Math.round(tr.top) : null,
        tabsVisible: t ? getComputedStyle(t).display : null,
        docH: document.documentElement.scrollHeight,
      };
    }));
  }
  console.log('scrollTo 905');
  await page.evaluate(() => window.scrollTo({ top: 905, behavior: 'auto' }));
  await page.waitForTimeout(250);
  console.log('after manual', await page.evaluate(() => {
    const p = document.querySelector('.ve-inspect');
    const r = p.getBoundingClientRect();
    return { scrollY: Math.round(window.scrollY), panelTop: Math.round(r.top), docH: document.documentElement.scrollHeight };
  }));
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
