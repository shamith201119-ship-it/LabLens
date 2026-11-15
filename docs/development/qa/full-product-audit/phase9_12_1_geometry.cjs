/** Geometry probe for the Phase 9.12.1 card grid + confirm bar. */
const { chromium } = require('playwright')
const path = require('path')

const FRONTEND = 'http://127.0.0.1:5174'
const REPORT_ID = '8e49fe68-074c-4126-b0a6-c63c17c5e206'
const OUT = path.join(__dirname, 'screenshots', 'phase9_12_1')

const rect = (r) => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) })

async function main() {
  const browser = await chromium.launch({ headless: true })
  for (const width of [1920, 1440, 1280, 1024, 768, 390, 360]) {
    const page = await browser.newPage({ viewport: { width, height: width < 500 ? 844 : 900 } })
    await page.goto(`${FRONTEND}/app/reports/${REPORT_ID}/verify`, { waitUntil: 'domcontentloaded' })
    await page.locator('.ve-grid').waitFor({ timeout: 30000 })
    await page.waitForTimeout(300)
    const data = await page.evaluate(() => {
      const b = (sel) => {
        const el = document.querySelector(sel)
        if (!el) return null
        const r = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), display: cs.display, z: cs.zIndex }
      }
      const cards = [...document.querySelectorAll('.ve-card')].map((el) => {
        const part = (s) => {
          const p = el.querySelector(s)
          if (!p) return null
          const r = p.getBoundingClientRect()
          return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
        }
        return {
          card: (() => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } })(),
          name: part('.ve-card__name'),
          reading: part('.ve-card__reading'),
          foot: part('.ve-card__foot'),
          actions: (() => { const p = el.querySelector('.ve-card__actions'); return p ? { opacity: getComputedStyle(p).opacity } : null })(),
        }
      })
      return {
        viewport: { w: innerWidth, h: innerHeight },
        sidebar: b('.app-sidebar'),
        main: b('.app-main'),
        page: b('.ve-page'),
        toolbar: b('.ve-toolbar'),
        grid: b('.ve-grid'),
        bar: b('.ve-confirmbar'),
        barInner: b('.ve-confirmbar__inner'),
        barMeta: b('.ve-confirmbar__meta'),
        barCta: b('.ve-confirmbar__cta'),
        mobileNav: b('.mobile-nav'),
        cards,
        docScroll: { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth },
        pageBottom: (() => {
          const d = document.querySelector('.ve-disclaimer')
          return d ? Math.round(d.getBoundingClientRect().bottom) : null
        })(),
      }
    })
    console.log(`\n=== ${width} ===`)
    console.log(JSON.stringify(data))
    await page.screenshot({ path: path.join(OUT, `geom-${width}.png`) })
    await page.close()
  }
  await browser.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
