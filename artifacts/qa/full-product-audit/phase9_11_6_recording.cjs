/** Record a short webm of the loader lifecycle and hero entrance. */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, 'screenshots', 'phase9_11_6_recording');

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: OUT_DIR, size: { width: 1440, height: 900 } },
  });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5174/', { waitUntil: 'domcontentloaded' });
  await page.locator('.global-loader').waitFor({ state: 'detached', timeout: 15000 });
  await page.waitForTimeout(2600);
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(1200);
  await context.close();
  await browser.close();
  const files = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.webm'));
  console.log('video files:', files.join(', '));
}

main().catch((e) => { console.error(e); process.exit(1); });
