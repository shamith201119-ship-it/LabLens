/** Visual probe for modals after the Phase 9.12.1 fixes. */
const { chromium } = require('playwright')
const path = require('path')

const FRONTEND = 'http://127.0.0.1:5174'
const REPORT = '8e49fe68-074c-4126-b0a6-c63c17c5e206'
const OUT = path.join(__dirname, 'screenshots', 'phase9_12_1')

async function main() {
  const browser = await chromium.launch({ headless: true })
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height } })
    await page.goto(`${FRONTEND}/app/reports/${REPORT}/verify`, { waitUntil: 'domcontentloaded' })
    await page.locator('.ve-grid').waitFor({ timeout: 30000 })
    await page.waitForTimeout(300)
    const id = await page.locator('.ve-card').first().getAttribute('data-measurement-id')
    await page.locator('.ve-card').first().hover()
    await page.locator(`#ve-source-${id}`).click({ force: true })
    await page.locator('.ve-modal--doc').waitFor({ timeout: 10000 })
    await page.waitForTimeout(800)
    await page.screenshot({ path: path.join(OUT, `modal-viewer-${width}.png`) })
    const info = await page.evaluate(() => {
      const modal = document.querySelector('.ve-modal--doc')
      const root = document.querySelector('.ve-modal-root')
      const nav = document.querySelector('.mobile-nav')
      const r = modal.getBoundingClientRect()
      const navRect = nav.getBoundingClientRect()
      const navTopEl = document.elementFromPoint(navRect.x + navRect.width / 2, navRect.y + 20)
      return {
        modal: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        rootZ: getComputedStyle(root).zIndex,
        navZ: getComputedStyle(nav).zIndex,
        navTopElement: navTopEl ? navTopEl.className : null,
        highlight: document.querySelectorAll('.ve-stage__highlight').length,
        sourceToolbar: document.querySelector('.ve-source__toolbar')?.getBoundingClientRect().height,
        viewport: { w: innerWidth, h: innerHeight },
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }
    })
    console.log(width, JSON.stringify(info))
    await page.keyboard.press('Escape')
    await page.locator('.ve-modal--doc').waitFor({ state: 'detached', timeout: 10000 })

    await page.locator('.ve-card').nth(1).hover()
    await page.locator(`#ve-edit-${await page.locator('.ve-card').nth(1).getAttribute('data-measurement-id')}`).click({ force: true })
    await page.locator('.ve-modal--inspect').waitFor({ timeout: 10000 })
    await page.waitForTimeout(400)
    await page.screenshot({ path: path.join(OUT, `modal-inspect-${width}.png`) })
    await page.keyboard.press('Escape')
    await page.close()
  }
  await browser.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
