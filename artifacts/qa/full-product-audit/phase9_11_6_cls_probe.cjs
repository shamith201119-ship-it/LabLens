/** Fingerprint the single 0.14 layout-shift on the landing page. */
const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.addInitScript(() => {
    window.__shifts = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        for (const source of entry.sources) {
          const node = source.node;
          window.__shifts.push({
            time: Math.round(entry.startTime),
            value: entry.value,
            hadRecentInput: entry.hadRecentInput,
            node: node ? `${node.tagName}.${(node.className || '').toString().split(' ')[0]}` : 'unknown',
            previousRect: source.previousRect,
            currentRect: source.currentRect,
          });
        }
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto('http://127.0.0.1:5174', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1200);
  const shifts = await page.evaluate(() => window.__shifts);
  console.log(JSON.stringify(shifts, null, 2));
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
