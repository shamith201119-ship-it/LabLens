/** 360px viewport-only completion screenshot (no fullPage stitching). */
const { chromium } = require('playwright');
const path = require('path');

const FRONTEND_URL = 'http://127.0.0.1:5174';
const API_URL = 'http://127.0.0.1:8001';
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, 'screenshots', 'phase9_11_5_final', '15-partial-completion-360-viewport.png');

// A lifecycle report stays 5/5 verified after the QA run; use the partial
// report so the acknowledgement-gated CTA is the interesting state.
const REPORT = '795793a1-b9dd-4a38-b432-571e905569cb';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 360, height: 800 } })).newPage();
  await page.goto(`${FRONTEND_URL}/app/reports/${REPORT}/verify`, { waitUntil: 'networkidle' });
  await page.locator('.ve-workspace').waitFor({ timeout: 20000 });
  await page.getByRole('button', { name: 'Confirm results & continue' }).click();
  const completion = page.locator('section[aria-labelledby="rc-heading"]');
  await completion.waitFor({ timeout: 6000 });
  await page.waitForTimeout(800);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(500);
  await page.screenshot({ path: OUT });
  const metrics = await page.evaluate(() => {
    const nav = document.querySelector('.mobile-nav');
    const cta = document.querySelector('.ve-continue__cta');
    const main = document.querySelector('.app-main');
    const rect = (el) => el ? el.getBoundingClientRect() : null;
    const n = rect(nav);
    const m = main ? getComputedStyle(main) : null;
    return {
      appMainPaddingBottom: m?.paddingBottom ?? null,
      nav: n ? { top: n.top, height: n.height } : null,
      scrollHeight: document.documentElement.scrollHeight,
      viewport: window.innerHeight,
    };
  });
  console.log(JSON.stringify(metrics, null, 2));
  console.log('SHOT', OUT);
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
