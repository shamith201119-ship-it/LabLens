const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  for (const width of [390, 768]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await ctx.newPage();
    await page.goto('http://127.0.0.1:5174/app/upload', { waitUntil: 'networkidle' });
    await page.locator('input[type="file"]').setInputFiles('backend/tests/fixtures/phase8_1_accuracy/clean_digital_report.pdf');
    await page.locator('input[type="checkbox"]').check();
    const p = page.waitForResponse((r) => r.url().includes('/api/reports') && r.request().method() === 'POST', { timeout: 30000 });
    await page.getByRole('button', { name: /Start analysis/i }).click();
    await p;
    await page.getByText('Your report is ready', { exact: true }).waitFor({ timeout: 120000 });
    await page.getByRole('button', { name: /Review & verify results/i }).click();
    await page.waitForURL(/\/verify/);
    await page.locator('.ve-workspace').waitFor({ timeout: 15000 });
    const boxes = page.locator('.ve-row .ve-checkbox');
    const n = await boxes.count();
    for (let i = 0; i < n; i += 1) await boxes.nth(i).check();
    await page.getByRole('button', { name: /Confirm selected \(/ }).click();
    await page.waitForFunction(() => document.querySelectorAll('.ve-row.is-confirmed').length > 0, null, { timeout: 15000 });
    await page.getByRole('button', { name: 'Confirm results & continue' }).click();
    await page.locator('section[aria-labelledby="rc-heading"]').waitFor({ timeout: 6000 });
    await page.waitForTimeout(1100);
    await page.screenshot({ path: `artifacts/qa/full-product-audit/screenshots/phase9_11_4/06-completion-${width}.png`, fullPage: true });
    console.log('SHOT', width);
    await ctx.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
