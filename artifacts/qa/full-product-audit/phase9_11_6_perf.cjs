/**
 * Phase 9.11.6 — Performance baseline / comparison harness.
 *
 * Measures, over N runs (default 3, report median):
 *   - TTFB, DCL, loadEventEnd (navigation timing)
 *   - LCP and CLS (PerformanceObserver, buffered)
 *   - Long tasks and TBT estimate
 *   - Total JS bytes transferred
 *   - Hero entrance frame stability (rAF deltas for ~2.5 s after navigation)
 *
 * Usage:
 *   node phase9_11_6_perf.cjs [before|after] [--url <base>] [--runs N]
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const MODE = process.argv[2] === 'after' ? 'after' : 'before';
const argv = process.argv.slice(2);
const urlArg = argv.find((a, i) => argv[i - 1] === '--url');
const base = urlArg || 'http://127.0.0.1:5174';
const runsArg = argv.find((a, i) => argv[i - 1] === '--runs');
const RUNS = runsArg ? Number(runsArg) : 3;

const OUT_DIR = path.join(__dirname);
const RESULTS_PATH = path.join(OUT_DIR, `phase9_11_6_perf_${MODE}.json`);

function initObservers() {
  window.__perf = { lcp: undefined, cls: 0, longtasks: [], shifts: 0 };
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.startTime) window.__perf.lcp = entry.startTime;
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {}
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) {
          window.__perf.cls += entry.value || 0;
          window.__perf.shifts += 1;
        }
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch {}
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__perf.longtasks.push({ start: entry.startTime, duration: entry.duration });
      }
    }).observe({ type: 'longtask', buffered: true });
  } catch {}
}

function collectFrames() {
  window.__frames = [];
  let last = performance.now();
  const loop = (now) => {
    window.__frames.push(now - last);
    last = now;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function sampleFrames(durationMs) {
  return new Promise((resolve) => {
    const deltas = [];
    let last = performance.now();
    const deadline = last + durationMs;
    const tick = (now) => {
      deltas.push(now - last);
      last = now;
      if (now < deadline) {
        requestAnimationFrame(tick);
      } else {
        resolve(deltas);
      }
    };
    requestAnimationFrame(tick);
  });
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

async function measureRoute(browser, route, { throttle = null, heroSample = false } = {}) {
  const runs = [];
  for (let i = 0; i < RUNS; i += 1) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    if (throttle) {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 400,
        downloadThroughput: (0.8 * 1024 * 1024) / 8,
        uploadThroughput: (0.4 * 1024 * 1024) / 8,
      });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    }
    const jsResponses = [];
    page.on('response', async (response) => {
      const request = response.request();
      if (request.resourceType() === 'script') {
        const headers = response.headers();
        const size = Number(headers['content-length'] || 0);
        try {
          if (!size) {
            const buffer = await response.body();
            jsResponses.push(buffer.length);
            return;
          }
        } catch {
          // fall back to content-length
        }
        jsResponses.push(size);
      }
    });
    await page.addInitScript(initObservers);
    await page.addInitScript(collectFrames);
    await page.goto(`${base}${route}`, { waitUntil: 'networkidle', timeout: 60000 });

    let frameStats = null;
    if (heroSample) {
      const deltas = await page.evaluate(() => {
        const all = window.__frames || [];
        // Frames collected during the first ~3 seconds after navigation start
        let elapsed = 0;
        const early = [];
        for (const delta of all) {
          elapsed += delta;
          if (elapsed > 3000) break;
          early.push(delta);
        }
        return early;
      });
      const sorted = [...deltas].sort((a, b) => a - b);
      const budget = 1000 / 60;
      frameStats = {
        frames: deltas.length,
        p50: Math.round(median(deltas) * 100) / 100,
        p95: Math.round(sorted[Math.floor(deltas.length * 0.95)] * 100) / 100,
        max: Math.round(Math.max(...deltas) * 100) / 100,
        overBudget: deltas.filter((d) => d > budget * 2).length,
      };
    }

    await page.waitForTimeout(400);
    const m = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const paint = performance.getEntriesByType('paint');
      const perf = window.__perf || {};
      const longtasks = perf.longtasks || [];
      const tbt = longtasks.reduce((total, t) => total + Math.max(0, t.duration - 50), 0);
      return {
        ttfb: Math.round(nav.responseStart * 10) / 10,
        domContentLoaded: Math.round(nav.domContentLoadedEventEnd * 10) / 10,
        loadEventEnd: Math.round(nav.loadEventEnd * 10) / 10,
        firstPaint: paint.find((p) => p.name === 'first-paint')?.startTime ?? null,
        firstContentfulPaint: paint.find((p) => p.name === 'first-contentful-paint')?.startTime ?? null,
        lcp: perf.lcp ?? null,
        cls: Number((perf.cls ?? 0).toFixed(4)),
        clsShifts: perf.shifts ?? 0,
        longTasks: longtasks.length,
        tbtMs: Math.round(tbt),
        longTaskEntries: longtasks.slice(0, 8).map((t) => ({ start: Math.round(t.start), duration: Math.round(t.duration) })),
      };
    });
    m.jsBytes = jsResponses.reduce((a, b) => a + b, 0);
    if (frameStats) m.frameStats = frameStats;
    runs.push(m);
    await context.close();
  }

  const pick = (fn) => median(runs.map(fn));
  return {
    runs,
    median: {
      ttfb: pick((r) => r.ttfb),
      domContentLoaded: pick((r) => r.domContentLoaded),
      loadEventEnd: pick((r) => r.loadEventEnd),
      firstPaint: pick((r) => r.firstPaint ?? 0),
      firstContentfulPaint: pick((r) => r.firstContentfulPaint ?? 0),
      lcp: pick((r) => r.lcp ?? 0),
      cls: pick((r) => r.cls),
      longTasks: pick((r) => r.longTasks),
      tbtMs: pick((r) => r.tbtMs),
      jsBytes: pick((r) => r.jsBytes),
      frameStats: heroSample ? runs[0].frameStats : undefined,
    },
  };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const results = {
    mode: MODE,
    base,
    generated_at: new Date().toISOString(),
    landing: await measureRoute(browser, '/', { heroSample: true }),
    welcome: await measureRoute(browser, '/app/start', {}),
    landingThrottled: await measureRoute(browser, '/', { throttle: true }),
  };
  await browser.close();
  fs.writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2), 'utf8');
  console.log(JSON.stringify(results.median ? results.median : results.landing.median, null, 2));
  console.log('\nsaved', RESULTS_PATH);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
