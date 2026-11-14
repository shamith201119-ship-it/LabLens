/**
 * LabLens QA Browser Test Suite
 * Tests all routes, workflows, and UI components using Playwright.
 * Uses REAL browser automation against the running dev server.
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const QA_DIR = path.dirname(__filename);
const SS_DIR = path.join(QA_DIR, 'screenshots');
const DESKTOP_DIR = path.join(SS_DIR, 'desktop');
const MOBILE_DIR = path.join(SS_DIR, 'mobile');
const TABLET_DIR = path.join(SS_DIR, 'tablet');
const WORKFLOW_DIR = path.join(SS_DIR, 'workflows');

// Make sure dirs exist
[DESKTOP_DIR, MOBILE_DIR, TABLET_DIR, WORKFLOW_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

const FRONTEND_URL = 'http://127.0.0.1:5174';
const BACKEND_URL = 'http://127.0.0.1:8001';

const ROUTES = [
  { path: '/', name: 'landing' },
  { path: '/app', name: 'dashboard' },
  { path: '/app/reports', name: 'reports' },
  { path: '/app/reports/new', name: 'new_report' },
  { path: '/app/settings', name: 'settings' },
  { path: '/app/history', name: 'history' },
  { path: '/nonexistent-route', name: '404' },
];

const DESKTOP_VIEWPORT = { width: 1440, height: 900 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };
const TABLET_VIEWPORT = { width: 768, height: 1024 };

const results = {
  screenshots_captured: 0,
  pages_tested: [],
  console_errors: {},
  workflow_tests: [],
  issues: [],
};

async function takeScreenshot(page, name, dir) {
  const ssPath = path.join(dir, `${name}.png`);
  await page.screenshot({ path: ssPath, fullPage: true });
  results.screenshots_captured++;
  return ssPath;
}

async function checkConsoleErrors(page, routeName) {
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  return errors;
}

async function testRoute(browser, route, viewportLabel, viewport, dir) {
  const context = await browser.newContext({
    viewport: viewport,
    userAgent: viewportLabel === 'mobile' ? 
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1' : undefined
  });
  const page = await context.newPage();
  const errors = [];
  
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  
  page.on('pageerror', err => {
    errors.push(`PAGE ERROR: ${err.message}`);
  });

  let status = 'PASS';
  let loadTime = 0;
  
  try {
    const start = Date.now();
    await page.goto(`${FRONTEND_URL}${route.path}`, { 
      waitUntil: 'networkidle',
      timeout: 15000 
    });
    loadTime = Date.now() - start;
    await page.waitForTimeout(1500); // Allow React hydration
    
    const ssName = `${viewportLabel}_${route.name}`;
    await takeScreenshot(page, ssName, dir);
    
    // Check page title / content basics
    const title = await page.title();
    const bodyText = await page.evaluate(() => document.body.innerText);
    const is404 = bodyText.toLowerCase().includes('not found') || bodyText.toLowerCase().includes('page not found');
    
    if (route.name === '404' && !is404) {
      status = 'WARNING: Expected 404 page';
      results.issues.push({ severity: 'P3-MINOR', route: route.path, msg: '404 route may not render NotFoundPage properly' });
    }
    
  } catch (err) {
    status = `FAIL: ${err.message}`;
    results.issues.push({ severity: 'P1-MAJOR', route: route.path, viewport: viewportLabel, msg: err.message });
  }
  
  results.console_errors[`${viewportLabel}_${route.name}`] = errors;
  
  if (errors.length > 0) {
    results.issues.push({
      severity: 'P2-MODERATE',
      route: route.path,
      viewport: viewportLabel,
      msg: `${errors.length} console error(s): ${errors[0]}`
    });
  }
  
  await context.close();
  return { route: route.path, viewport: viewportLabel, status, loadTime, errors };
}

async function testUploadWorkflow(browser) {
  console.log('Testing upload workflow...');
  const context = await browser.newContext({ viewport: DESKTOP_VIEWPORT });
  const page = await context.newPage();
  const workflowErrors = [];
  
  page.on('console', msg => {
    if (msg.type() === 'error') workflowErrors.push(msg.text());
  });
  
  const workflowResult = { name: 'upload_workflow', steps: [], status: 'PASS' };
  
  try {
    // Navigate to new report page
    await page.goto(`${FRONTEND_URL}/app/reports/new`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);
    await takeScreenshot(page, 'workflow_01_new_report_page', WORKFLOW_DIR);
    workflowResult.steps.push({ step: 'Navigate to new report', status: 'PASS' });
    
    // Look for file input or upload area
    const fileInput = page.locator('input[type="file"]');
    const hasFileInput = await fileInput.count() > 0;
    
    if (hasFileInput) {
      // Try uploading a test PDF
      const pdfPath = path.join(QA_DIR, 'qa_report_a.pdf');
      if (fs.existsSync(pdfPath)) {
        await fileInput.setInputFiles(pdfPath);
        await page.waitForTimeout(2000);
        await takeScreenshot(page, 'workflow_02_file_selected', WORKFLOW_DIR);
        workflowResult.steps.push({ step: 'File selected', status: 'PASS' });
        
        // Look for consent checkbox or upload button
        const consentCheck = page.locator('[data-testid="consent-checkbox"], input[type="checkbox"]').first();
        if (await consentCheck.count() > 0) {
          await consentCheck.check();
          await page.waitForTimeout(500);
          await takeScreenshot(page, 'workflow_03_consent_checked', WORKFLOW_DIR);
          workflowResult.steps.push({ step: 'Consent checkbox', status: 'PASS' });
        }
        
        // Look for submit/upload button
        const uploadBtn = page.locator('button:has-text("Upload"), button:has-text("Submit"), button[type="submit"]').first();
        if (await uploadBtn.count() > 0) {
          await uploadBtn.click();
          await page.waitForTimeout(3000);
          await takeScreenshot(page, 'workflow_04_after_upload', WORKFLOW_DIR);
          workflowResult.steps.push({ step: 'Upload submitted', status: 'PASS' });
        }
      } else {
        workflowResult.steps.push({ step: 'PDF not found', status: 'SKIP' });
      }
    } else {
      workflowResult.steps.push({ step: 'File input not found', status: 'WARNING' });
      results.issues.push({ severity: 'P2-MODERATE', route: '/app/reports/new', msg: 'File input element not found on new report page' });
    }
    
  } catch (err) {
    workflowResult.status = `FAIL: ${err.message}`;
    workflowResult.steps.push({ step: 'Upload workflow', status: `ERROR: ${err.message}` });
    results.issues.push({ severity: 'P1-MAJOR', route: '/app/reports/new', msg: `Upload workflow failed: ${err.message}` });
  }
  
  await context.close();
  return workflowResult;
}

async function testHistoryTabs(browser) {
  console.log('Testing History page tabs...');
  const context = await browser.newContext({ viewport: DESKTOP_VIEWPORT });
  const page = await context.newPage();
  const histResult = { name: 'history_tabs', steps: [], status: 'PASS' };
  
  try {
    await page.goto(`${FRONTEND_URL}/app/history`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1500);
    await takeScreenshot(page, 'history_01_initial', WORKFLOW_DIR);
    histResult.steps.push({ step: 'Navigate to history', status: 'PASS' });
    
    // Look for tabs - Timeline, Compare, Trends
    const tabs = ['Timeline', 'Compare', 'Trends'];
    for (const tabName of tabs) {
      const tab = page.locator(`[role="tab"]:has-text("${tabName}"), button:has-text("${tabName}")`).first();
      if (await tab.count() > 0) {
        await tab.click();
        await page.waitForTimeout(1000);
        const ssName = `history_tab_${tabName.toLowerCase()}`;
        await takeScreenshot(page, ssName, WORKFLOW_DIR);
        histResult.steps.push({ step: `History ${tabName} tab`, status: 'PASS' });
      } else {
        histResult.steps.push({ step: `History ${tabName} tab`, status: 'NOT_FOUND' });
        results.issues.push({ severity: 'P2-MODERATE', route: '/app/history', msg: `Tab "${tabName}" not found` });
      }
    }
    
  } catch (err) {
    histResult.status = `FAIL: ${err.message}`;
  }
  
  await context.close();
  return histResult;
}

async function testSidebarNavigation(browser) {
  console.log('Testing sidebar navigation...');
  const context = await browser.newContext({ viewport: DESKTOP_VIEWPORT });
  const page = await context.newPage();
  const navResult = { name: 'sidebar_nav', steps: [], status: 'PASS' };
  
  try {
    await page.goto(`${FRONTEND_URL}/app`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1500);
    await takeScreenshot(page, 'nav_01_dashboard', WORKFLOW_DIR);
    navResult.steps.push({ step: 'Dashboard loaded', status: 'PASS' });
    
    // Test navigation links
    const navLinks = [
      { text: 'Reports', expectedUrl: '/app/reports' },
      { text: 'History', expectedUrl: '/app/history' },
      { text: 'Settings', expectedUrl: '/app/settings' },
    ];
    
    for (const link of navLinks) {
      const navLink = page.locator(`nav a:has-text("${link.text}"), [role="navigation"] a:has-text("${link.text}")`).first();
      if (await navLink.count() > 0) {
        await navLink.click();
        await page.waitForTimeout(1000);
        const currentUrl = page.url();
        const urlMatch = currentUrl.includes(link.expectedUrl);
        const ssName = `nav_to_${link.text.toLowerCase()}`;
        await takeScreenshot(page, ssName, WORKFLOW_DIR);
        navResult.steps.push({ 
          step: `Navigate to ${link.text}`, 
          status: urlMatch ? 'PASS' : `URL_MISMATCH: got ${currentUrl}` 
        });
      } else {
        navResult.steps.push({ step: `Nav link ${link.text}`, status: 'NOT_FOUND' });
        results.issues.push({ severity: 'P2-MODERATE', route: '/app', msg: `Sidebar link "${link.text}" not found` });
      }
    }
    
  } catch (err) {
    navResult.status = `FAIL: ${err.message}`;
  }
  
  await context.close();
  return navResult;
}

async function testMobileNav(browser) {
  console.log('Testing mobile navigation...');
  const context = await browser.newContext({ 
    viewport: MOBILE_VIEWPORT,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'
  });
  const page = await context.newPage();
  const mobileResult = { name: 'mobile_nav', steps: [], status: 'PASS' };
  
  try {
    await page.goto(`${FRONTEND_URL}/app`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1500);
    await takeScreenshot(page, 'mobile_01_dashboard', MOBILE_DIR);
    mobileResult.steps.push({ step: 'Mobile dashboard loaded', status: 'PASS' });
    
    // Look for mobile nav (hamburger or bottom nav)
    const hamburger = page.locator('button[aria-label*="menu"], button[aria-label*="Menu"], [data-testid="mobile-menu"]').first();
    const bottomNav = page.locator('[data-testid="bottom-nav"], nav.mobile, .mobile-nav').first();
    
    if (await hamburger.count() > 0) {
      await hamburger.click();
      await page.waitForTimeout(500);
      await takeScreenshot(page, 'mobile_02_menu_open', MOBILE_DIR);
      mobileResult.steps.push({ step: 'Mobile hamburger menu', status: 'PASS' });
    } else if (await bottomNav.count() > 0) {
      await takeScreenshot(page, 'mobile_02_bottom_nav', MOBILE_DIR);
      mobileResult.steps.push({ step: 'Mobile bottom nav present', status: 'PASS' });
    } else {
      mobileResult.steps.push({ step: 'Mobile nav element', status: 'NOT_FOUND' });
      results.issues.push({ severity: 'P3-MINOR', route: '/app', msg: 'Mobile nav hamburger/bottom-nav not found by standard selectors' });
    }
    
  } catch (err) {
    mobileResult.status = `FAIL: ${err.message}`;
  }
  
  await context.close();
  return mobileResult;
}

async function testFindCare(browser) {
  console.log('Testing Find Care section...');
  const context = await browser.newContext({ viewport: DESKTOP_VIEWPORT });
  const page = await context.newPage();
  const careResult = { name: 'find_care', steps: [], status: 'PASS' };
  
  try {
    await page.goto(`${FRONTEND_URL}/app`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1500);
    
    // Look for Find Care section on dashboard
    const findCare = page.locator(':text("Find Care"), :text("find care"), :text("Find a Doctor")').first();
    if (await findCare.count() > 0) {
      await takeScreenshot(page, 'findcare_01_found', WORKFLOW_DIR);
      careResult.steps.push({ step: 'Find Care section visible', status: 'PASS' });
    } else {
      careResult.steps.push({ step: 'Find Care section', status: 'NOT_FOUND_ON_DASHBOARD' });
      
      // Check settings page
      await page.goto(`${FRONTEND_URL}/app/settings`, { waitUntil: 'networkidle', timeout: 10000 });
      await page.waitForTimeout(1000);
      const findCare2 = page.locator(':text("Find Care"), :text("find care"), :text("Find a Doctor"), :text("Care"), :text("Provider")').first();
      if (await findCare2.count() > 0) {
        await takeScreenshot(page, 'findcare_02_settings', WORKFLOW_DIR);
        careResult.steps.push({ step: 'Find Care in settings', status: 'PASS' });
      }
    }
    
  } catch (err) {
    careResult.status = `FAIL: ${err.message}`;
  }
  
  await context.close();
  return careResult;
}

async function main() {
  console.log('=== LabLens QA Browser Test Suite ===');
  console.log(`Frontend: ${FRONTEND_URL}`);
  console.log(`Backend: ${BACKEND_URL}`);
  console.log('');
  
  let browser;
  try {
    browser = await chromium.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage']
    });
    console.log('Chromium launched successfully');
  } catch (err) {
    console.error('BLOCKED: Could not launch Chromium:', err.message);
    process.exit(1);
  }
  
  // Test all routes at desktop and mobile
  console.log('\n--- Testing routes at desktop (1440x900) ---');
  for (const route of ROUTES) {
    const result = await testRoute(browser, route, 'desktop', DESKTOP_VIEWPORT, DESKTOP_DIR);
    results.pages_tested.push(result);
    console.log(`  ${route.path}: ${result.status} (${result.loadTime}ms, ${result.errors.length} console errors)`);
  }
  
  console.log('\n--- Testing routes at mobile (390x844) ---');
  for (const route of ROUTES) {
    const result = await testRoute(browser, route, 'mobile', MOBILE_VIEWPORT, MOBILE_DIR);
    results.pages_tested.push(result);
    console.log(`  ${route.path}: ${result.status} (${result.errors.length} console errors)`);
  }
  
  console.log('\n--- Testing routes at tablet (768x1024) ---');
  for (const route of ROUTES) {
    const result = await testRoute(browser, route, 'tablet', TABLET_VIEWPORT, TABLET_DIR);
    results.pages_tested.push(result);
    console.log(`  ${route.path}: ${result.status} (${result.errors.length} console errors)`);
  }
  
  // Workflow tests
  console.log('\n--- Workflow Tests ---');
  const uploadResult = await testUploadWorkflow(browser);
  results.workflow_tests.push(uploadResult);
  console.log(`Upload workflow: ${uploadResult.status}`);
  uploadResult.steps.forEach(s => console.log(`  - ${s.step}: ${s.status}`));
  
  const histResult = await testHistoryTabs(browser);
  results.workflow_tests.push(histResult);
  console.log(`History tabs: ${histResult.status}`);
  histResult.steps.forEach(s => console.log(`  - ${s.step}: ${s.status}`));
  
  const navResult = await testSidebarNavigation(browser);
  results.workflow_tests.push(navResult);
  console.log(`Sidebar navigation: ${navResult.status}`);
  navResult.steps.forEach(s => console.log(`  - ${s.step}: ${s.status}`));
  
  const mobileResult = await testMobileNav(browser);
  results.workflow_tests.push(mobileResult);
  console.log(`Mobile navigation: ${mobileResult.status}`);
  mobileResult.steps.forEach(s => console.log(`  - ${s.step}: ${s.status}`));
  
  const careResult = await testFindCare(browser);
  results.workflow_tests.push(careResult);
  console.log(`Find Care: ${careResult.status}`);
  careResult.steps.forEach(s => console.log(`  - ${s.step}: ${s.status}`));
  
  await browser.close();
  
  // Summary
  console.log('\n=== BROWSER TEST SUMMARY ===');
  console.log(`Screenshots captured: ${results.screenshots_captured}`);
  console.log(`Routes tested: ${results.pages_tested.length}`);
  console.log(`Workflow tests: ${results.workflow_tests.length}`);
  console.log(`Issues found: ${results.issues.length}`);
  
  const passCount = results.pages_tested.filter(p => p.status === 'PASS').length;
  const failCount = results.pages_tested.filter(p => p.status.startsWith('FAIL')).length;
  console.log(`Route test results: ${passCount} PASS, ${failCount} FAIL`);
  
  if (results.issues.length > 0) {
    console.log('\nIssues:');
    results.issues.forEach(i => console.log(`  [${i.severity}] ${i.route || ''}: ${i.msg}`));
  }
  
  // Save JSON results
  const resultsPath = path.join(QA_DIR, 'browser-test-results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to: ${resultsPath}`);
  
  return results;
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
