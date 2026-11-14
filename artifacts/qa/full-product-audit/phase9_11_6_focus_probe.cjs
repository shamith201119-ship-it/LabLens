/** Reproduce the 1280px close → focus-restore check with diagnostics. */
const { chromium } = require('playwright');

const FRONTEND_URL = 'http://127.0.0.1:5174';
const REPORT = '1d6974d5-5e97-438e-84a6-fd0e3212b692';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('console', (m) => console.log('CONSOLE', m.type(), m.text().slice(0, 120)));
  await page.goto(`${FRONTEND_URL}/app/reports/${REPORT}/verify`, { waitUntil: 'networkidle' });
  await page.locator('.ve-workspace, .ve-inspect').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /Inspect HbA1c/ }).first().click();
  await page.locator('.ve-inspect').waitFor({ timeout: 6000 });
  await page.waitForTimeout(300);
  console.log('inspected ok');
  await page.getByRole('button', { name: 'Close inspection panel' }).click();
  for (const wait of [50, 150, 300, 600, 1200]) {
    await page.waitForTimeout(wait);
    console.log(`after +${wait}`, await page.evaluate(() => {
      const el = document.activeElement;
      return el ? `${el.tagName} class=${el.className} data-mid=${el.dataset?.measurementId ?? ''} text=${(el.textContent || '').trim().slice(0, 30)}` : 'none';
    }));
  }
  console.log('rail rows:', await page.locator('.ve-row__body').count());
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
