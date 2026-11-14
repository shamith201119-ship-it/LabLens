/** Deeper diagnostics for the focus-restore path after closing inspection. */
const { chromium } = require('playwright');

const FRONTEND_URL = 'http://127.0.0.1:5174';
const REPORT = '1d6974d5-5e97-438e-84a6-fd0e3212b692';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${FRONTEND_URL}/app/reports/${REPORT}/verify`, { waitUntil: 'networkidle' });
  await page.locator('.ve-workspace').waitFor({ timeout: 30000 });
  await page.waitForTimeout(300);

  // What is focused before we click Inspect?
  const before = await page.evaluate(() => {
    const el = document.activeElement;
    return el ? `${el.tagName}.${el.className}` : 'none';
  });
  console.log('before inspect:', before);

  await page.getByRole('button', { name: /Inspect HbA1c/ }).first().click();
  await page.locator('.ve-inspect').waitFor({ timeout: 6000 });
  const during = await page.evaluate(() => {
    const el = document.activeElement;
    return el ? `${el.tagName}.${el.className}` : 'none';
  });
  console.log('during inspect:', during);

  await page.getByRole('button', { name: 'Close inspection panel' }).click();
  await page.waitForTimeout(600);

  console.log(await page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-measurement-id]')];
    const btn = document.querySelector('.ve-row__body');
    const el = document.activeElement;
    return {
      activeElement: el ? `${el.tagName}.${el.className}` : 'none',
      measuringElements: rows.length,
      firstElementHTML: btn ? btn.outerHTML.slice(0, 220) : null,
      hasInspectPanel: Boolean(document.querySelector('.ve-inspect')),
    };
  }));
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
