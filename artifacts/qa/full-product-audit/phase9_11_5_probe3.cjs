/** Debug handoff + correction marker visibility. */
const { chromium } = require('playwright');

const FRONTEND_URL = 'http://127.0.0.1:5174';
const REPORT = '5f3325ec-0a56-4727-9a9b-62023c361e69';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('console', (m) => console.log('CONSOLE', m.type(), m.text()));

  await page.goto(`${FRONTEND_URL}/app/reports/${REPORT}/results`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  console.log('RESULTS', await page.evaluate(() => {
    const hs = document.querySelector('.handoff-section');
    const h = hs ? hs.getBoundingClientRect() : null;
    return {
      handoffCount: document.querySelectorAll('.handoff-section').length,
      handoffBox: h ? [Math.round(h.x), Math.round(h.y), Math.round(h.width), Math.round(h.height)] : null,
      handoffDisplay: hs ? getComputedStyle(hs).display : null,
      handoffVisibility: hs ? getComputedStyle(hs).visibility : null,
      docHeight: document.documentElement.scrollHeight,
      hasStale: Boolean(document.querySelector('.results-stale-alert')),
      text: (document.body.innerText || '').slice(0, 600),
    };
  }));

  await page.goto(`${FRONTEND_URL}/app/reports/${REPORT}/verify`, { waitUntil: 'networkidle' });
  await page.locator('.ve-workspace').waitFor();
  const row = page.locator('.ve-row').filter({ hasText: 'HbA1c' });
  console.log('ROW', (await row.innerText()).replace(/\n/g, ' | '));
  console.log('ROW HTML', (await row.innerHTML()).slice(0, 1200));
  await page.getByRole('button', { name: 'Inspect HbA1c' }).click();
  await page.locator('.ve-inspect').waitFor();
  await page.waitForTimeout(300);
  console.log('PANEL', (await page.locator('.ve-inspect').innerText()).replace(/\n/g, ' | '));
  console.log('PANEL HTML', (await page.locator('.ve-inspect').innerHTML()).slice(0, 1800));
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
