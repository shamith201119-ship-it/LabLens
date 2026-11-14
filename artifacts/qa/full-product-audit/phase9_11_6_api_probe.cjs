/** Probe browser-side fetch reachability of the isolated API. */
const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:5174', { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(async () => {
    const out = {};
    for (const url of ['http://127.0.0.1:8001/api/health', 'http://localhost:8001/api/health', 'http://127.0.0.1:5174/api/health']) {
      try {
        const res = await fetch(url);
        out[url] = `${res.status} ${await res.text()}`;
      } catch (e) {
        out[url] = `FAILED: ${e.message}`;
      }
    }
    return out;
  });
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
