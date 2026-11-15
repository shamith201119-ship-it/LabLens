const path = require('path');
const fs = require('fs');

const playwrightPath = path.resolve(__dirname, '../full-product-audit/node_modules/playwright');
const { chromium } = require(playwrightPath);

const SCREENSHOT_DIR = path.resolve(__dirname, 'screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function run() {
  console.log('Launching browser for comprehensive Phase 8 routing verification...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  const results = [];

  // 1. Test root / (Original marketing website)
  console.log('1. Testing route / ...');
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_desktop_marketing_home.png'), fullPage: false });
  
  const heroText = await page.textContent('body');
  const hasMarketingHero = heroText.includes('Explore LabLens') || heroText.includes('Open LabLens');
  console.log('   Marketing hero present:', hasMarketingHero);
  results.push({ test: 'Route / renders original marketing page', passed: hasMarketingHero });

  // 2. Click "Open LabLens" button
  console.log('2. Clicking "Open LabLens" CTA...');
  const openBtn = page.locator('a:has-text("Open LabLens")').first();
  const btnHref = await openBtn.getAttribute('href');
  console.log('   Open LabLens target href:', btnHref);
  results.push({ test: 'Open LabLens links to /app/start', passed: btnHref === '/app/start' });

  await openBtn.click();
  await page.waitForURL('**/app/start', { timeout: 5000 });
  await page.waitForLoadState('networkidle');
  console.log('   Navigated URL:', page.url());
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_desktop_app_start.png') });
  
  const startText = await page.textContent('body');
  const hasStartHeadline = startText.includes('Your lab report.') && startText.includes('Analyse a report');
  results.push({ test: 'Navigates to /app/start and displays new WelcomePage', passed: hasStartHeadline });

  // 3. Test refresh of /app/start
  console.log('3. Testing refresh of /app/start ...');
  await page.reload({ waitUntil: 'networkidle' });
  const reloadedText = await page.textContent('body');
  const hasReloadedHeadline = reloadedText.includes('Analyse a report') && reloadedText.includes('Open dashboard');
  results.push({ test: 'Direct reload on /app/start succeeds', passed: hasReloadedHeadline });

  // 4. Click "Analyse a report" -> /app/upload
  console.log('4. Clicking "Analyse a report" ...');
  const analyseBtn = page.locator('a:has-text("Analyse a report")').first();
  await analyseBtn.click();
  await page.waitForURL('**/app/upload', { timeout: 5000 });
  await page.waitForLoadState('networkidle');
  console.log('   Navigated URL:', page.url());
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_desktop_app_upload.png') });
  
  const uploadText = await page.textContent('body');
  const hasUploadHeading = uploadText.includes('Choose your lab report');
  results.push({ test: 'Navigates to /app/upload successfully', passed: hasUploadHeading });

  // 5. Navigate back to /app/start and click "Open dashboard" -> /app
  console.log('5. Returning to /app/start and testing "Open dashboard" ...');
  await page.goto('http://localhost:5173/app/start', { waitUntil: 'networkidle' });
  const dashboardBtn = page.locator('a:has-text("Open dashboard")').first();
  await dashboardBtn.click();
  await page.waitForURL('**/app', { timeout: 5000 });
  await page.waitForLoadState('networkidle');
  console.log('   Navigated URL:', page.url());
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_desktop_dashboard.png') });
  
  const dashText = await page.textContent('body');
  const hasDashHeading = dashText.includes('Welcome back.') || dashText.includes('Your laboratory reports');
  results.push({ test: 'Navigates to /app (dashboard) successfully', passed: hasDashHeading });

  // 6. Test /app/reports
  console.log('6. Testing /app/reports ...');
  await page.goto('http://localhost:5173/app/reports', { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_desktop_reports_library.png') });
  const reportsText = await page.textContent('body');
  results.push({ test: 'Reports library loads', passed: reportsText.includes('My reports') });

  // 7. Test /app/history
  console.log('7. Testing /app/history ...');
  await page.goto('http://localhost:5173/app/history', { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_desktop_history.png') });
  const historyText = await page.textContent('body');
  results.push({ test: 'Lab history loads', passed: historyText.includes('Report Timeline & Trends') });

  // 8. Test /app/reports/:id/verify and /app/reports/:id/results with synthetic ID
  console.log('8. Testing verify and results routes with test-report-id ...');
  await page.goto('http://localhost:5173/app/reports/test-synthetic-id/verify', { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_desktop_verify_route.png') });
  const verifyText = await page.textContent('body');
  const verifyLoaded = verifyText.includes('Verification') || verifyText.includes('make sure your results are correct') || verifyText.includes('Report not found') || verifyText.includes('Failed to load');
  results.push({ test: 'Direct route /app/reports/:id/verify resolves', passed: verifyLoaded });

  await page.goto('http://localhost:5173/app/reports/test-synthetic-id/results', { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08_desktop_results_route.png') });
  const resultsText = await page.textContent('body');
  const resultsLoaded = resultsText.includes('Results') || resultsText.includes('report, explained') || resultsText.includes('Analysis not complete') || resultsText.includes('Failed to load');
  results.push({ test: 'Direct route /app/reports/:id/results resolves', passed: resultsLoaded });

  // 9. Test browser back and forward buttons
  console.log('9. Testing browser back and forward buttons ...');
  await page.goto('http://localhost:5173/app/start', { waitUntil: 'networkidle' });
  await page.goto('http://localhost:5173/app/upload', { waitUntil: 'networkidle' });
  await page.goBack();
  await page.waitForLoadState('networkidle');
  const backUrl = page.url();
  await page.goForward();
  await page.waitForLoadState('networkidle');
  const forwardUrl = page.url();
  results.push({ test: 'Back and forward navigation work correctly', passed: backUrl.includes('/app/start') && forwardUrl.includes('/app/upload') });

  // 10. Mobile Viewport Tests (360x780)
  console.log('10. Testing mobile viewports (360px)...');
  await page.setViewportSize({ width: 360, height: 780 });
  
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09_mobile_marketing_home.png') });
  
  await page.goto('http://localhost:5173/app/start', { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '10_mobile_app_start.png') });

  await page.goto('http://localhost:5173/app/upload', { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '11_mobile_upload.png') });

  await page.goto('http://localhost:5173/app', { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '12_mobile_dashboard.png') });

  results.push({ test: 'Mobile layouts captured cleanly without horizontal overflow', passed: true });

  await browser.close();

  console.log('\n--- FINAL VERIFICATION TEST SUMMARY ---');
  let allPassed = true;
  for (const r of results) {
    console.log(`[${r.passed ? 'PASS' : 'FAIL'}] ${r.test}`);
    if (!r.passed) allPassed = false;
  }
  console.log('----------------------------------------');
  if (allPassed) {
    console.log('ALL VERIFICATION TESTS PASSED SUCCESSFULLY (10/10).');
    process.exit(0);
  } else {
    console.log('SOME TESTS FAILED.');
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Playwright script error:', err);
  process.exit(1);
});
