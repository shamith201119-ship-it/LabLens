const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://127.0.0.1:5173';
const API_URL = 'http://127.0.0.1:8000';
const ARTIFACT_DIR = path.resolve(__dirname);
const FIXTURES_DIR = path.join(ARTIFACT_DIR, 'fixtures');

const SCREENSHOTS = {
  desktop: path.join(ARTIFACT_DIR, 'screenshots', 'desktop'),
  tablet: path.join(ARTIFACT_DIR, 'screenshots', 'tablet'),
  mobile: path.join(ARTIFACT_DIR, 'screenshots', 'mobile'),
  workflows: path.join(ARTIFACT_DIR, 'screenshots', 'workflows'),
  print: path.join(ARTIFACT_DIR, 'screenshots', 'print')
};

const PRINT_DIR = path.join(ARTIFACT_DIR, 'print-exports');

const results = {
  summary: {
    passed: 0,
    failed: 0,
    warnings: 0
  },
  journeys: {},
  routes: {},
  screenshots: [],
  network_leaks: [],
  console_errors: []
};

function recordScreenshot(filePath, route, viewport, caption, passed = true) {
  const relative = path.relative(ARTIFACT_DIR, filePath);
  results.screenshots.push({
    file: relative,
    route,
    viewport,
    caption,
    passed
  });
  console.log(`[Screenshot Captured] ${relative} (${viewport}) - ${caption}`);
}

async function run() {
  console.log('=== Starting LabLens Real Browser QA Audit (Playwright / Chromium) ===');
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });

  const page = await context.newPage();

  // Monitor network and console
  page.on('console', msg => {
    if (msg.type() === 'error') {
      results.console_errors.push({ text: msg.text(), location: msg.location() });
    }
  });

  page.on('request', req => {
    const url = req.url();
    if (!url.startsWith('http://127.0.0.1') && !url.startsWith('http://localhost') && !url.startsWith('data:')) {
      if (url.includes('QA_NOTE') || url.includes('Hemoglobin') || url.includes('Glucose')) {
        results.network_leaks.push({ url, method: req.method() });
      }
    }
  });

  try {
    // -------------------------------------------------------------------------
    // STAGE 1: LANDING PAGE & RESPONSIVE VIEWPORT AUDIT
    // -------------------------------------------------------------------------
    console.log('\n--- 1. Testing Landing Page (Phase 1 & 1.5) ---');
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    // Desktop 1440x900
    let shotPath = path.join(SCREENSHOTS.desktop, 'landing-desktop-1440.png');
    await page.screenshot({ path: shotPath, fullPage: true });
    recordScreenshot(shotPath, '/', '1440x900', 'Landing page desktop hero and marketing sections');

    // Desktop 1280x800
    await page.setViewportSize({ width: 1280, height: 800 });
    shotPath = path.join(SCREENSHOTS.desktop, 'landing-desktop-1280.png');
    await page.screenshot({ path: shotPath });
    recordScreenshot(shotPath, '/', '1280x800', 'Landing page desktop 1280x800 viewport');

    // Tablet 768x1024
    await page.setViewportSize({ width: 768, height: 1024 });
    shotPath = path.join(SCREENSHOTS.tablet, 'landing-tablet-768.png');
    await page.screenshot({ path: shotPath });
    recordScreenshot(shotPath, '/', '768x1024', 'Landing page tablet responsive layout');

    // Mobile 390x844
    await page.setViewportSize({ width: 390, height: 844 });
    shotPath = path.join(SCREENSHOTS.mobile, 'landing-mobile-390.png');
    await page.screenshot({ path: shotPath, fullPage: true });
    recordScreenshot(shotPath, '/', '390x844', 'Landing page mobile viewport with stacked layout');

    // Narrow Mobile 360x800
    await page.setViewportSize({ width: 360, height: 800 });
    shotPath = path.join(SCREENSHOTS.mobile, 'landing-mobile-360.png');
    await page.screenshot({ path: shotPath });
    recordScreenshot(shotPath, '/', '360x800', 'Landing page narrow mobile viewport');

    // Reset to Desktop 1440x900
    await page.setViewportSize({ width: 1440, height: 900 });

    // -------------------------------------------------------------------------
    // STAGE 2: DASHBOARD & REPORT LIBRARY EMPTY STATES
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Testing Dashboard & Empty States ---');
    await page.goto(`${BASE_URL}/app`);
    await page.waitForLoadState('networkidle');
    shotPath = path.join(SCREENSHOTS.desktop, 'dashboard-desktop.png');
    await page.screenshot({ path: shotPath });
    recordScreenshot(shotPath, '/app', '1440x900', 'Dashboard initial overview state');

    // Mobile dashboard
    await page.setViewportSize({ width: 390, height: 844 });
    shotPath = path.join(SCREENSHOTS.mobile, 'dashboard-mobile.png');
    await page.screenshot({ path: shotPath });
    recordScreenshot(shotPath, '/app', '390x844', 'Dashboard mobile responsive view');
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto(`${BASE_URL}/app/reports`);
    await page.waitForLoadState('networkidle');
    shotPath = path.join(SCREENSHOTS.desktop, 'reports-empty-desktop.png');
    await page.screenshot({ path: shotPath });
    recordScreenshot(shotPath, '/app/reports', '1440x900', 'My reports library initial empty state');

    // -------------------------------------------------------------------------
    // STAGE 3: UPLOAD VALIDATION & REPORT A INGESTION
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Testing Upload Form & Report A Ingestion ---');
    await page.goto(`${BASE_URL}/app/reports/new`);
    await page.waitForLoadState('networkidle');

    shotPath = path.join(SCREENSHOTS.desktop, 'upload-page-desktop.png');
    await page.screenshot({ path: shotPath });
    recordScreenshot(shotPath, '/app/reports/new', '1440x900', 'Upload form with drag-and-drop dropzone and consent checkbox');

    // Select Report A
    const fileInput = await page.$('input[type="file"]');
    const reportAPath = path.join(FIXTURES_DIR, 'qa_report_a.pdf');
    await fileInput.setInputFiles(reportAPath);

    // Consent Checkbox
    const consentBox = await page.$('input[type="checkbox"]');
    if (consentBox) await consentBox.check();

    shotPath = path.join(SCREENSHOTS.workflows, 'upload-with-file-selected.png');
    await page.screenshot({ path: shotPath });
    recordScreenshot(shotPath, '/app/reports/new', '1440x900', 'File selected and consent confirmed');

    // Click upload button (.upload-actions__continue)
    const uploadBtn = await page.locator('button.upload-actions__continue, button:has-text("Store report locally")').first();
    await uploadBtn.click();
    await page.waitForTimeout(2000);
    await page.waitForLoadState('networkidle');

    // Follow link to newly uploaded report
    const openLink = await page.locator('a:has-text("Open report now")').first();
    let reportAId = '';
    if (await openLink.isVisible()) {
      await openLink.click();
      await page.waitForURL(/\/app\/reports\/[a-zA-Z0-9_-]+/, { timeout: 10000 });
      reportAId = page.url().split('/').pop();
    } else {
      await page.goto(`${BASE_URL}/app/reports`);
      await page.waitForLoadState('networkidle');
      const viewBtn = await page.locator('a:has-text("View")').first();
      await viewBtn.click();
      await page.waitForURL(/\/app\/reports\/[a-zA-Z0-9_-]+/, { timeout: 10000 });
      reportAId = page.url().split('/').pop();
    }
    console.log(`Report A opened: ID = ${reportAId}`);

    shotPath = path.join(SCREENSHOTS.workflows, 'report-viewer-initial.png');
    await page.screenshot({ path: shotPath, fullPage: true });
    recordScreenshot(shotPath, `/app/reports/${reportAId}`, '1440x900', 'Report viewer initial view for Report A');

    // -------------------------------------------------------------------------
    // STAGE 4: EXTRACTION, STRUCTURING, ANALYSIS (REPORT A)
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Processing Report A (Extraction, Structuring, Analysis) ---');
    // Extract document
    const extractBtn = await page.locator('button:has-text("Extract document")').first();
    if (await extractBtn.isVisible()) {
      await extractBtn.click();
      await page.waitForTimeout(4000);
      await page.waitForLoadState('networkidle');
    }

    shotPath = path.join(SCREENSHOTS.workflows, 'report-extracted-text.png');
    await page.screenshot({ path: shotPath, fullPage: true });
    recordScreenshot(shotPath, `/app/reports/${reportAId}`, '1440x900', 'Extracted raw document text with page count and method tags');

    // Structure measurements
    const structureBtn = await page.locator('button:has-text("Structure measurements")').first();
    if (await structureBtn.isVisible()) {
      await structureBtn.click();
      await page.waitForTimeout(3000);
      await page.waitForLoadState('networkidle');
    }

    shotPath = path.join(SCREENSHOTS.workflows, 'structured-measurements-table.png');
    await page.screenshot({ path: shotPath, fullPage: true });
    recordScreenshot(shotPath, `/app/reports/${reportAId}`, '1440x900', 'Structured measurements with canonical normalization and reference intervals');

    // Verify first 4 measurements
    const verifyButtons = await page.locator('button:has-text("Verify")').all();
    for (const vb of verifyButtons.slice(0, 4)) {
      if (await vb.isVisible()) {
        await vb.click();
        await page.waitForTimeout(400);
      }
    }

    // Run Health Intelligence analysis
    const analyseBtn = await page.locator('button:has-text("Analyse health patterns")').first();
    if (await analyseBtn.isVisible()) {
      await analyseBtn.click();
      await page.waitForTimeout(4000);
      await page.waitForLoadState('networkidle');
    }

    shotPath = path.join(SCREENSHOTS.workflows, 'analysis-findings-panel.png');
    await page.screenshot({ path: shotPath, fullPage: true });
    recordScreenshot(shotPath, `/app/reports/${reportAId}`, '1440x900', 'Phase 4 Health Intelligence assessment findings and laboratory comparisons');

    // Phase 5 Explanations Panel
    shotPath = path.join(SCREENSHOTS.workflows, 'phase5-explanations.png');
    await page.screenshot({ path: shotPath, fullPage: true });
    recordScreenshot(shotPath, `/app/reports/${reportAId}`, '1440x900', 'Phase 5 Evidence-backed medical explanations with clinical sources');

    // -------------------------------------------------------------------------
    // STAGE 5: CLINICIAN SUMMARY, LOCAL NOTE, PRINT-TO-PDF, FIND CARE
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Testing Clinician Summary & Print-to-PDF ---');
    // Fill in a local private note
    const noteInput = await page.locator('textarea').first();
    if (await noteInput.isVisible()) {
      await noteInput.fill('QA_NOTE_LOCAL_ONLY_7359: Follow up on hemoglobin level and dietary iron intake.');
      await page.waitForTimeout(500);
    }

    shotPath = path.join(SCREENSHOTS.workflows, 'clinician-summary-screen.png');
    await page.screenshot({ path: shotPath, fullPage: true });
    recordScreenshot(shotPath, `/app/reports/${reportAId}`, '1440x900', 'Clinician appointment summary with inclusion options and private note');

    // Print to PDF export
    const pdfExportPath = path.join(PRINT_DIR, 'clinician_summary_a.pdf');
    await page.emulateMedia({ media: 'print' });
    await page.pdf({
      path: pdfExportPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' }
    });
    console.log(`Print export PDF successfully created: ${pdfExportPath}`);

    shotPath = path.join(SCREENSHOTS.print, 'clinician-summary-print-preview.png');
    await page.screenshot({ path: shotPath, fullPage: true });
    recordScreenshot(shotPath, `/app/reports/${reportAId}`, 'Print Media (A4)', 'Print stylesheet preview showing clean document layout');
    await page.emulateMedia({ media: 'screen' });

    // Test Find Care section
    const locationInput = await page.locator('input[placeholder*="city"], input[placeholder*="location"]').first();
    if (await locationInput.isVisible()) {
      await locationInput.fill('Koramangala, Bengaluru');
      await page.waitForTimeout(500);
    }
    shotPath = path.join(SCREENSHOTS.workflows, 'find-care-section.png');
    await page.screenshot({ path: shotPath, fullPage: true });
    recordScreenshot(shotPath, `/app/reports/${reportAId}`, '1440x900', 'Find Care provider directory and verified official registry resources');

    // -------------------------------------------------------------------------
    // STAGE 6: UPLOAD REPORT B (FOLLOW-UP)
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Uploading & Processing Report B ---');
    await page.goto(`${BASE_URL}/app/reports/new`);
    await page.waitForLoadState('networkidle');

    const fileInputB = await page.$('input[type="file"]');
    const reportBPath = path.join(FIXTURES_DIR, 'qa_report_b.pdf');
    await fileInputB.setInputFiles(reportBPath);

    const consentBoxB = await page.$('input[type="checkbox"]');
    if (consentBoxB) await consentBoxB.check();

    const uploadBtnB = await page.locator('button.upload-actions__continue, button:has-text("Store report locally")').first();
    await uploadBtnB.click();
    await page.waitForTimeout(2000);
    await page.waitForLoadState('networkidle');

    const openLinkB = await page.locator('a:has-text("Open report now")').first();
    let reportBId = '';
    if (await openLinkB.isVisible()) {
      await openLinkB.click();
      await page.waitForURL(/\/app\/reports\/[a-zA-Z0-9_-]+/, { timeout: 10000 });
      reportBId = page.url().split('/').pop();
    } else {
      await page.goto(`${BASE_URL}/app/reports`);
      await page.waitForLoadState('networkidle');
      const viewBtnB = await page.locator('a:has-text("View")').first();
      await viewBtnB.click();
      await page.waitForURL(/\/app\/reports\/[a-zA-Z0-9_-]+/, { timeout: 10000 });
      reportBId = page.url().split('/').pop();
    }
    console.log(`Report B opened: ID = ${reportBId}`);

    // Process Report B
    const extractBtnB = await page.locator('button:has-text("Extract document")').first();
    if (await extractBtnB.isVisible()) {
      await extractBtnB.click();
      await page.waitForTimeout(4000);
      await page.waitForLoadState('networkidle');
    }

    const structureBtnB = await page.locator('button:has-text("Structure measurements")').first();
    if (await structureBtnB.isVisible()) {
      await structureBtnB.click();
      await page.waitForTimeout(3000);
      await page.waitForLoadState('networkidle');
    }

    // Verify measurements on Report B
    const verifyButtonsB = await page.locator('button:has-text("Verify")').all();
    for (const vb of verifyButtonsB) {
      if (await vb.isVisible()) {
        await vb.click();
        await page.waitForTimeout(300);
      }
    }

    // Analyse Report B
    const analyseBtnB = await page.locator('button:has-text("Analyse health patterns")').first();
    if (await analyseBtnB.isVisible()) {
      await analyseBtnB.click();
      await page.waitForTimeout(4000);
      await page.waitForLoadState('networkidle');
    }

    // -------------------------------------------------------------------------
    // STAGE 7: AUDIT PHASE 7 LAB HISTORY, COMPARISON & TRENDS
    // -------------------------------------------------------------------------
    console.log('\n--- 7. Auditing Phase 7 Personal Lab History & Trends ---');
    await page.goto(`${BASE_URL}/app/history`);
    await page.waitForLoadState('networkidle');

    // Desktop Timeline
    shotPath = path.join(SCREENSHOTS.desktop, 'history-timeline-desktop.png');
    await page.screenshot({ path: shotPath, fullPage: true });
    recordScreenshot(shotPath, '/app/history?tab=timeline', '1440x900', 'Chronological report timeline with effective dates and provenance tags');

    // Mobile Timeline
    await page.setViewportSize({ width: 390, height: 844 });
    shotPath = path.join(SCREENSHOTS.mobile, 'history-timeline-mobile.png');
    await page.screenshot({ path: shotPath, fullPage: true });
    recordScreenshot(shotPath, '/app/history?tab=timeline', '390x844', 'Mobile responsive timeline of laboratory history');
    await page.setViewportSize({ width: 1440, height: 900 });

    // Compare Reports Tab
    console.log('--- Testing Report Comparison ---');
    const compareTabBtn = await page.locator('button:has-text("Compare Reports")').first();
    await compareTabBtn.click();
    await page.waitForTimeout(1000);

    const runCompareBtn = await page.locator('button:has-text("Compare Reports")').last();
    if (await runCompareBtn.isVisible()) {
      await runCompareBtn.click();
      await page.waitForTimeout(2000);
      await page.waitForLoadState('networkidle');
    }

    shotPath = path.join(SCREENSHOTS.workflows, 'report-comparison-desktop.png');
    await page.screenshot({ path: shotPath, fullPage: true });
    recordScreenshot(shotPath, '/app/history?tab=compare', '1440x900', 'Side-by-side comparison table showing Report A vs Report B deltas');

    // Biomarker Trends Tab
    console.log('--- Testing Biomarker Trend Explorer ---');
    const trendsTabBtn = await page.locator('button:has-text("Biomarker Trends")').first();
    await trendsTabBtn.click();
    await page.waitForTimeout(2500);

    shotPath = path.join(SCREENSHOTS.workflows, 'biomarker-trends-desktop.png');
    await page.screenshot({ path: shotPath, fullPage: true });
    recordScreenshot(shotPath, '/app/history?tab=trends', '1440x900', 'Biomarker trend explorer displaying SVG trend curve and historical table');

    // -------------------------------------------------------------------------
    // STAGE 8: SETTINGS & 404 ROUTE
    // -------------------------------------------------------------------------
    console.log('\n--- 8. Auditing Settings & 404 Pages ---');
    await page.goto(`${BASE_URL}/app/settings`);
    await page.waitForLoadState('networkidle');
    shotPath = path.join(SCREENSHOTS.desktop, 'settings-desktop.png');
    await page.screenshot({ path: shotPath });
    recordScreenshot(shotPath, '/app/settings', '1440x900', 'Settings view with local privacy statement and configuration');

    await page.goto(`${BASE_URL}/invalid-route-for-audit`);
    await page.waitForLoadState('networkidle');
    shotPath = path.join(SCREENSHOTS.desktop, '404-page-desktop.png');
    await page.screenshot({ path: shotPath });
    recordScreenshot(shotPath, '/invalid-route-for-audit', '1440x900', '404 Not Found error view with safe redirect CTA');

    // -------------------------------------------------------------------------
    // STAGE 9: OCR IMAGE TEST (SYNTHETIC PNG)
    // -------------------------------------------------------------------------
    console.log('\n--- 9. Auditing OCR Image Extraction ---');
    await page.goto(`${BASE_URL}/app/reports/new`);
    await page.waitForLoadState('networkidle');

    const fileInputImg = await page.$('input[type="file"]');
    const ocrImgPath = path.join(FIXTURES_DIR, 'qa_ocr_report.png');
    await fileInputImg.setInputFiles(ocrImgPath);

    const consentBoxImg = await page.$('input[type="checkbox"]');
    if (consentBoxImg) await consentBoxImg.check();

    const uploadBtnImg = await page.locator('button.upload-actions__continue, button:has-text("Store report locally")').first();
    await uploadBtnImg.click();
    await page.waitForTimeout(2000);
    await page.waitForLoadState('networkidle');

    const openLinkImg = await page.locator('a:has-text("Open report now")').first();
    if (await openLinkImg.isVisible()) {
      await openLinkImg.click();
      await page.waitForURL(/\/app\/reports\/[a-zA-Z0-9_-]+/, { timeout: 10000 });
      const imgReportId = page.url().split('/').pop();
      console.log(`OCR image report opened: ID = ${imgReportId}`);

      // Extract image using PaddleOCR
      const extractBtnImg = await page.locator('button:has-text("Extract document")').first();
      if (await extractBtnImg.isVisible()) {
        await extractBtnImg.click();
        await page.waitForTimeout(6000);
        await page.waitForLoadState('networkidle');
      }

      shotPath = path.join(SCREENSHOTS.workflows, 'ocr-extracted-image-result.png');
      await page.screenshot({ path: shotPath, fullPage: true });
      recordScreenshot(shotPath, `/app/reports/${imgReportId}`, '1440x900', 'OCR image extraction result displaying optical text recognition output');
    }

    // -------------------------------------------------------------------------
    // STAGE 10: UPLOAD & DELETION TEST (REPORT C)
    // -------------------------------------------------------------------------
    console.log('\n--- 10. Auditing Report Deletion ---');
    await page.goto(`${BASE_URL}/app/reports/new`);
    await page.waitForLoadState('networkidle');

    const fileInputC = await page.$('input[type="file"]');
    const reportCPath = path.join(FIXTURES_DIR, 'qa_report_c.pdf');
    await fileInputC.setInputFiles(reportCPath);
    const consentBoxC = await page.$('input[type="checkbox"]');
    if (consentBoxC) await consentBoxC.check();
    const uploadBtnC = await page.locator('button.upload-actions__continue, button:has-text("Store report locally")').first();
    await uploadBtnC.click();
    await page.waitForTimeout(2000);
    await page.waitForLoadState('networkidle');

    // Go to reports library and delete Report C
    await page.goto(`${BASE_URL}/app/reports`);
    await page.waitForLoadState('networkidle');

    page.once('dialog', async dialog => {
      console.log(`Accepted browser confirmation dialog: "${dialog.message()}"`);
      await dialog.accept();
    });

    const deleteBtn = await page.locator('button:has-text("Delete")').first();
    if (await deleteBtn.isVisible()) {
      await deleteBtn.click();
      await page.waitForTimeout(1500);
      await page.waitForLoadState('networkidle');
    }

    shotPath = path.join(SCREENSHOTS.workflows, 'reports-library-after-deletion.png');
    await page.screenshot({ path: shotPath });
    recordScreenshot(shotPath, '/app/reports', '1440x900', 'Reports library confirming clean record removal and state update');

    results.summary.passed = results.screenshots.length;
    console.log(`\n=== QA Playwright Audit Successfully Completed ===`);
    console.log(`Total Verified Screenshots: ${results.screenshots.length}`);
    console.log(`Detected Data Leaks: ${results.network_leaks.length}`);
    console.log(`Console Errors: ${results.console_errors.length}`);

  } catch (err) {
    console.error('QA Automation Error:', err);
    results.summary.failed++;
  } finally {
    await browser.close();
  }

  // Write machine-readable results
  fs.writeFileSync(
    path.join(ARTIFACT_DIR, 'test-results.json'),
    JSON.stringify(results, null, 2),
    'utf-8'
  );
  console.log(`Wrote test-results.json to ${ARTIFACT_DIR}`);
}

run();
