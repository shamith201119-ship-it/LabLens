const path = require('path');
const fs = require('fs');

const playwrightPath = path.resolve(__dirname, '../qa/full-product-audit/node_modules/playwright');
const { chromium } = require(playwrightPath);

const PNG_PATH = path.resolve(__dirname, 'test_fixtures/sample_report.png');

async function testPngUpload() {
  console.log('--- TESTING PNG UPLOAD IN ACTUAL BROWSER ---');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  let reportId = null;
const page = await context.newPage();

  // Listen to network requests & responses
  page.on('request', req => {
    if (req.url().includes('/api/')) {
      console.log(`[NET REQ] ${req.method()} ${req.url()}`);
      if (req.method() === 'POST' && req.url().includes('/api/reports')) {
        console.log('   Headers:', req.headers());
      }
    }
  });

  page.on('response', async res => {
    if (res.url().includes('/api/')) {
      console.log(`[NET RES] ${res.status()} ${res.url()}`);
      if (res.url().includes('/api/reports')) {
        try {
          const body = await res.text();
          console.log(`   Response Body: ${body.substring(0, 300)}`);
          // Capture report ID from the upload POST response (201)
          if (res.status() === 201) {
            try {
              const parsed = JSON.parse(body);
              if (parsed.id) {
                reportId = parsed.id;
                console.log(`   Captured reportId: ${reportId}`);
              }
            } catch (e) {
              // ignore JSON parse errors
            }
          }
        } catch (e) {}
      }
    }
  });

  page.on('console', msg => {
    console.log(`[BROWSER CONSOLE] ${msg.type()}: ${msg.text()}`);
  });

  // Step 1: Open /app/upload
  console.log('1. Navigating to http://localhost:5173/app/upload');
  await page.goto('http://localhost:5173/app/upload', { waitUntil: 'networkidle' });

  // Step 2: Set input files
  console.log('2. Setting input file:', PNG_PATH);
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(PNG_PATH);

  // Step 3: Check preview & filename
  await page.waitForTimeout(500);
  const bodyText = await page.textContent('body');
  console.log('   Contains sample_report.png:', bodyText.includes('sample_report.png'));

  // Step 4: Check consent checkbox
  console.log('4. Checking consent checkbox');
  const consentCheckbox = page.locator('input[type="checkbox"]');
  await consentCheckbox.check();

  // Step 5: Click Start Analysis
  console.log('5. Clicking Start Analysis');
  const startBtn = page.locator('button:has-text("Start analysis")');
  const isEnabled = await startBtn.isEnabled();
  console.log('   Start analysis enabled:', isEnabled);

  await startBtn.click();

  // Step 6: Wait for pipeline progression
  console.log('6. Waiting for pipeline progression (extracting -> structuring -> ready)...');
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(1000);
    const text = await page.textContent('body');
    if (text.includes('Organising your results')) {
      console.log(`[PIPELINE] Advanced to structuring at ${i + 1}s`);
    } else if (text.includes('Analysing your findings')) {
      console.log(`[PIPELINE] Advanced to analysing at ${i + 1}s`);
    } else if (text.includes('Your results are ready') || text.includes('Your report is ready to review')) {
      console.log(`[PIPELINE] Pipeline COMPLETED SUCCESSFULLY at ${i + 1}s!`);
      break;
    } else if (text.includes('Something went wrong')) {
      console.log(`[PIPELINE] Failed at ${i + 1}s:`, text.substring(0, 300));
      break;
    }
  }

  const currentUrl = page.url();
  console.log('   Final URL:', currentUrl);
  const postClickText = await page.textContent('body');
  console.log('   Final page text snippet:', postClickText.replace(/\s+/g, ' ').substring(0, 300));

  await browser.close();
}

testPngUpload().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
