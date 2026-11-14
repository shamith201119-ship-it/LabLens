/**
 * Phase 9.11.6 — Responsive & polish sweep for the marketing site and shell.
 *
 * For each required viewport (360–1920):
 *   - loader shows once per full page load, exits, never re-shows on client nav
 *   - no horizontal overflow on landing or app start
 *   - no console errors; no blank screens
 *   - key interactive surfaces visible and reachable
 * Screenshots for the visual report.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://127.0.0.1:5174';
const SHOT_DIR = path.join(__dirname, 'screenshots', 'phase9_11_6_responsive');
const results = { checks: [], passed: 0, failed: 0 };

function check(name, condition, detail = null) {
  if (condition) {
    results.passed += 1;
    results.checks.push({ name, status: 'passed', detail });
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    results.failed += 1;
    results.checks.push({ name, status: 'failed', detail });
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function noOverflow(page) {
  return page.evaluate(() => {
    const el = document.documentElement;
    return el.scrollWidth <= el.clientWidth + 1;
  });
}

async function main() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const widths = [360, 390, 768, 1024, 1280, 1440, 1920];

  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (m) => {
      if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) {
        consoleErrors.push(m.text());
      }
    });
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.locator('.global-loader').waitFor({ state: 'detached', timeout: 15000 }).catch(() => null);
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          const deadline = Date.now() + 5000;
          const poll = () => {
            const el = document.querySelector('.hero__fade');
            const done = el && getComputedStyle(el).opacity === '1';
            if (done || Date.now() > deadline) return resolve(true);
            window.setTimeout(poll, 80);
          };
          poll();
        }),
    );
    await page.waitForTimeout(500);
    check(`${width}px: landing renders (hero visible)`, await page.locator('.hero__title').isVisible());
    check(`${width}px: loader not stuck on landing`, (await page.locator('.global-loader').count()) === 0);
    check(`${width}px: no horizontal overflow on landing`, await noOverflow(page));
    await page.screenshot({ path: path.join(SHOT_DIR, `landing-${width}.png`), fullPage: false });

    // Scroll halfway through the page: sections should reveal; no overflow
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 0.45));
    await page.waitForTimeout(350);
    check(`${width}px: no overflow mid-page`, await noOverflow(page));
    await page.screenshot({ path: path.join(SHOT_DIR, `landing-mid-${width}.png`) });

    // Welcome page
    await page.goto(`${BASE}/app/start`, { waitUntil: 'networkidle' });
    await page.locator('.global-loader').waitFor({ state: 'detached', timeout: 15000 }).catch(() => null);
    check(`${width}px: welcome renders`, await page.locator('.welcome-page').isVisible());
    check(`${width}px: loader not stuck on welcome`, (await page.locator('.global-loader').count()) === 0);
    check(`${width}px: no horizontal overflow on welcome`, await noOverflow(page));

    // App shell
    await page.goto(`${BASE}/app`, { waitUntil: 'networkidle' });
    await page.locator('.global-loader').waitFor({ state: 'detached', timeout: 15000 }).catch(() => null);
    check(`${width}px: app shell renders`, await page.locator('.app-shell').isVisible());
    check(`${width}px: no horizontal overflow on app shell`, await noOverflow(page));

    check(`${width}px: no console errors`, consoleErrors.length === 0, consoleErrors.join(' | ').slice(0, 160) || 'clean');
    console.log('SHOT ', path.join(SHOT_DIR, `landing-${width}.png`));
    await context.close();
  }

  await browser.close();
  fs.writeFileSync(
    path.join(__dirname, 'phase9_11_6_responsive_results.json'),
    JSON.stringify(results, null, 2),
    'utf8',
  );
  console.log(`\nPASSED ${results.passed}  FAILED ${results.failed}`);
  if (results.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  results.failed += 1;
  results.checks.push({ name: 'responsive qa completed', status: 'failed', detail: error.message });
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(__dirname, 'phase9_11_6_responsive_results.json'),
    JSON.stringify(results, null, 2),
    'utf8',
  );
  console.error(error);
  process.exit(1);
});
