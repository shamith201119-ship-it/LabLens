/** Probe matchMedia reduced-motion in headless default and with CDP override. */
const { chromium } = require('playwright');

async function probe(name, setup) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  if (setup) {
    const cdp = await context.newCDPSession(page);
    await setup(cdp);
  }
  await page.goto('about:blank');
  const result = await page.evaluate(() => ({
    reduce: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    noPreference: window.matchMedia('(prefers-reduced-motion: no-preference)').matches,
  }));
  console.log(name, JSON.stringify(result));
  await browser.close();
}

(async () => {
  await probe('default');
  await probe('cdp-no-preference', (cdp) =>
    cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
    }),
  );
  await probe('cdp-reduce', (cdp) =>
    cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    }),
  );
})();
