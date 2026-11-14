/**
 * Phase 9.11.6 — Loader lifecycle QA.
 *
 * Covers: cold load (loader present → exits), fast cached load, slow network,
 * refresh, route navigation (no re-show), reduced motion, hero animation
 * sequencing, and console errors. Screenshots into screenshots/phase9_11_6_loader.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://127.0.0.1:5174';
const OUT_DIR = path.join(__dirname, 'screenshots', 'phase9_11_6_loader');

const results = { checks: [], console_errors: [], passed: 0, failed: 0 };

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

async function shot(page, name) {
  const file = path.join(OUT_DIR, name);
  await page.screenshot({ path: file });
  console.log('SHOT ', file);
  return file;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  // === Cold load, normal conditions ===
  console.log('\n=== Pass A: cold load & exit ===');
  const contextA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pageA = await contextA.newPage();
  pageA.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) {
      results.console_errors.push(`A: ${m.text()}`);
    }
  });
  await pageA.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await pageA.waitForTimeout(60);
  check('loader visible on cold load', await pageA.locator('.global-loader').isVisible());
  await shot(pageA, '01-loader-cold.png');
  // Wait for exit
  await pageA.locator('.global-loader').waitFor({ state: 'detached', timeout: 10000 }).catch(() => null);
  check('loader exits within 10s', (await pageA.locator('.global-loader').count()) === 0);
  await shot(pageA, '02-after-loader.png');
  // Hero animation may be running or done; verify it is not stuck hidden
  const heroState = await pageA.evaluate(() => {
    const inner = document.querySelector('.hero__line-inner');
    const eyebrow = document.querySelector('.hero__fade');
    const innerStyle = inner ? getComputedStyle(inner).transform : null;
    const eyebrowStyle = eyebrow ? getComputedStyle(eyebrow).opacity : null;
    return { innerStyle, eyebrowStyle };
  });
  check('hero content no longer hidden after loader', heroState.eyebrowStyle === '1' || heroState.eyebrowStyle === '0.99', `eyebrow opacity=${heroState.eyebrowStyle}`);
  // Wait for hero settle and screenshot
  await pageA.waitForTimeout(1800);
  const eyebrowSettled = await pageA.evaluate(() => getComputedStyle(document.querySelector('.hero__fade')).opacity);
  check('hero eyebrow fully visible after settle', eyebrowSettled === '1', `opacity=${eyebrowSettled}`);
  await shot(pageA, '03-hero-settled.png');

  // === Client-side route navigation never re-shows loader ===
  console.log('\n=== Pass B: client-side route navigation ===');
  const startLink = pageA.getByRole('link', { name: 'Open LabLens' }).first();
  await startLink.click();
  await pageA.waitForURL(/\/app\/start/, { timeout: 20000 });
  await pageA.waitForTimeout(250);
  check('loader absent after client-side navigation to /app/start', (await pageA.locator('.global-loader').count()) === 0);
  // Navigate deeper via the app shell: /app has links into the app.
  await pageA.goto(`${BASE}/app`, { waitUntil: 'domcontentloaded' });
  await pageA.locator('.global-loader').waitFor({ state: 'detached', timeout: 20000 }).catch(() => null);
  await pageA.waitForTimeout(150);
  await pageA.getByRole('link', { name: /^My reports$/ }).first().click();
  await pageA.waitForURL(/\/app\/reports/, { timeout: 15000 });
  await pageA.waitForTimeout(200);
  check('loader absent after client-side navigation to /app/reports', (await pageA.locator('.global-loader').count()) === 0);
  check('app shell renders after navigation', await pageA.locator('.app-shell').isVisible());
  await shot(pageA, '04-app-shell.png');
  await contextA.close();

  // === Browser refresh shows loader again ===
  console.log('\n=== Pass C: refresh ===');
  const contextC = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pageC = await contextC.newPage();
  await pageC.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await pageC.reload({ waitUntil: 'domcontentloaded' });
  await pageC.waitForTimeout(60);
  check('loader visible again after refresh', await pageC.locator('.global-loader').isVisible());
  await contextC.close();

  // === Slow network (throttled) ===
  console.log('\n=== Pass D: throttled network ===');
  const contextD = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pageD = await contextD.newPage();
  const cdp = await contextD.newCDPSession(pageD);
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 500,
    downloadThroughput: (0.6 * 1024 * 1024) / 8,
    uploadThroughput: (0.3 * 1024 * 1024) / 8,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await pageD.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await pageD.waitForTimeout(80);
  check('loader visible on throttled load', await pageD.locator('.global-loader').isVisible());
  await pageD.locator('.global-loader').waitFor({ state: 'detached', timeout: 60000 }).catch(() => null);
  check('loader exits under throttling', (await pageD.locator('.global-loader').count()) === 0);
  const heroVisible = await pageD.evaluate(
    () =>
      new Promise((resolve) => {
        const checkOnce = () => (getComputedStyle(document.querySelector('.hero__fade')).opacity === '1' ? resolve(true) : false);
        if (checkOnce()) return resolve(true);
        const deadline = Date.now() + 10000;
        const poll = () => {
          if (getComputedStyle(document.querySelector('.hero__fade')).opacity === '1') return resolve(true);
          if (Date.now() > deadline) return resolve(false);
          window.setTimeout(poll, 120);
        };
        poll();
      }),
  );
  check('hero visible under throttling after exit', heroVisible);
  await shot(pageD, '05-throttled-after.png');
  await contextD.close();

  // === Reduced motion ===
  console.log('\n=== Pass E: reduced motion ===');
  const contextE = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
  });
  const pageE = await contextE.newPage();
  await pageE.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await pageE.waitForTimeout(150);
  const reducedLoader = await pageE.locator('.global-loader').count();
  check('reduced motion: loader skipped entirely', reducedLoader === 0);
  const reducedReady = await pageE.evaluate(() => document.documentElement.dataset.appReady || 'unset');
  check('reduced motion: app ready flag set', reducedReady === 'true', `ready=${reducedReady}`);
  await shot(pageE, '06-reduced-motion.png');
  await contextE.close();

  // === Mobile viewport loader ===
  console.log('\n=== Pass F: mobile loader ===');
  const contextF = await browser.newContext({ viewport: { width: 360, height: 800 } });
  const pageF = await contextF.newPage();
  await pageF.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await pageF.waitForTimeout(60);
  check('loader visible on mobile cold load', await pageF.locator('.global-loader').isVisible());
  await shot(pageF, '07-loader-360.png');
  await pageF.locator('.global-loader').waitFor({ state: 'detached', timeout: 15000 }).catch(() => null);
  check('loader exits on mobile', (await pageF.locator('.global-loader').count()) === 0);
  await shot(pageF, '08-mobile-settled.png');
  await contextF.close();

  check('no uncaught console errors (loader QA)', results.console_errors.length === 0, results.console_errors.join(' | ').slice(0, 300) || 'clean');

  await browser.close();
  fs.writeFileSync(
    path.join(OUT_DIR, '..', 'phase9_11_6_loader_results.json'),
    JSON.stringify(results, null, 2),
    'utf8',
  );
  console.log(`\nPASSED ${results.passed}  FAILED ${results.failed}`);
  if (results.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  results.failed += 1;
  results.checks.push({ name: 'loader qa completed', status: 'failed', detail: error.message });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(OUT_DIR, '..', 'phase9_11_6_loader_results.json'),
    JSON.stringify(results, null, 2),
    'utf8',
  );
  console.error(error);
  process.exit(1);
});
