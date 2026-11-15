/**
 * Phase 9.12.2 — minimal startup loader.
 *
 * Verifies the loader is exactly: wordmark + progress bar on a flat
 * background, and that it clears the viewport without leaving scroll locked.
 * Also captures before/after stills.
 *
 * Usage: node phase9_12_2_loader_shots.cjs before|after
 */
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const FRONTEND = 'http://127.0.0.1:5174'
const OUT = path.join(__dirname, 'screenshots', 'phase9_12_2_loader')
const RESULTS = path.join(__dirname, 'phase9_12_2_loader_results.json')
const tag = process.argv[2] || 'after'

const checks = []
function check(name, ok, detail = null) {
  checks.push({ name, status: ok ? 'passed' : 'failed', detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

// Freeze the entrance so the settled composition is captured, and hold the
// bar at a representative mid-fill.
const FREEZE = `
  .global-loader,
  .global-loader * { animation: none !important; transition: none !important; }
  .global-loader { opacity: 1 !important; visibility: visible !important; }
  .global-loader__inner { opacity: 1 !important; transform: none !important; }
  .global-loader__bar-fill { transform: scaleX(0.62) !important; }
`

const STRUCTURE = () => {
  const loader = document.querySelector('.global-loader')
  const bar = document.querySelector('.global-loader__bar')
  const style = loader ? getComputedStyle(loader) : null
  const rect = bar?.getBoundingClientRect()
  return {
    loader: Boolean(loader),
    background: style?.backgroundColor ?? null,
    backgroundImage: style?.backgroundImage ?? null,
    word: document.querySelector('.global-loader__word')?.textContent?.trim() ?? null,
    wordWeight: style ? getComputedStyle(document.querySelector('.global-loader__word')).fontWeight : null,
    bars: document.querySelectorAll('.global-loader__bar').length,
    barWidth: rect ? Math.round(rect.width) : 0,
    barHeight: rect ? Math.round(rect.height) : 0,
    removed: {
      ghost: document.querySelectorAll('.global-loader__ghost').length,
      badge: document.querySelectorAll('.global-loader__badge').length,
      docnum: document.querySelectorAll('.global-loader__docnum').length,
      mark: document.querySelectorAll('.global-loader__mark').length,
      tagline: document.querySelectorAll('.global-loader__tagline').length,
      caption: document.querySelectorAll('.global-loader__caption').length,
      trace: document.querySelectorAll('.global-loader__trace').length,
    },
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch({ headless: true })

  for (const [width, height] of [
    [1440, 900],
    [390, 844],
  ]) {
    const page = await browser.newPage({ viewport: { width, height } })
    const errors = []
    page.on('console', (m) => {
      if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) errors.push(m.text())
    })
    page.on('pageerror', (e) => errors.push(String(e)))

    await page.goto(`${FRONTEND}/`, { waitUntil: 'domcontentloaded' })
    await page.locator('.global-loader').waitFor({ timeout: 5000 })
    await page.addStyleTag({ content: FREEZE })
    await page.waitForTimeout(120)

    const state = await page.evaluate(STRUCTURE)
    check(`${width}px: loader is present`, state.loader)
    check(
      `${width}px: flat background, no gradients`,
      state.backgroundImage === 'none' && state.background === 'rgb(247, 248, 243)',
      `bg=${state.background} image=${state.backgroundImage}`,
    )
    check(`${width}px: wordmark reads LabLens`, state.word === 'LabLens', state.word)
    check(`${width}px: exactly one progress bar`, state.bars === 1 && state.barHeight === 4, `${state.bars} bar(s), ${state.barHeight}px`)
    check(
      `${width}px: progress bar width is restrained`,
      state.barWidth === (width === 390 ? 190 : 240),
      `${state.barWidth}px`,
    )
    check(
      `${width}px: no removed loader decoration`,
      Object.values(state.removed).every((count) => count === 0),
      JSON.stringify(state.removed),
    )
    check(`${width}px: no horizontal overflow`, state.overflowX <= 1, `${state.overflowX}`)

    await page.screenshot({ path: path.join(OUT, `${tag}-${width}.png`) })

    // Live pass: confirm the bar is actually filling and the loader exits.
    const liveStart = Date.now()
    await page.goto(`${FRONTEND}/`, { waitUntil: 'domcontentloaded' })
    await page.locator('.global-loader').waitFor({ timeout: 5000 })
    await page.waitForTimeout(150)
    const live = await page.evaluate(() => {
      const fill = document.querySelector('.global-loader__bar-fill')
      const matrix = fill ? getComputedStyle(fill).transform : ''
      const scale = matrix.startsWith('matrix(') ? Number(matrix.slice(7).split(',')[0]) : 1
      return { scale, opacity: getComputedStyle(document.querySelector('.global-loader')).opacity }
    })
    check(`${width}px: progress bar is mid-fill in real time`, live.scale > 0.05 && live.scale < 1, `scaleX=${live.scale}`)
    await page.screenshot({ path: path.join(OUT, `${tag}-${width}-live.png`) })

    await page.locator('.global-loader').waitFor({ state: 'detached', timeout: 5000 })
    const gone = Date.now() - liveStart
    await page.waitForTimeout(100)
    const after = await page.evaluate(() => ({
      loader: document.querySelectorAll('.global-loader').length,
      overflow: document.body.style.overflow,
      loaderActive: document.documentElement.classList.contains('loader-active'),
      appReady: document.documentElement.dataset.appReady,
    }))
    check(`${width}px: loader clears the viewport`, after.loader === 0, `${gone}ms`)
    check(`${width}px: scroll lock is released`, after.overflow === '' && !after.loaderActive)
    check(`${width}px: app marks itself ready`, after.appReady === 'true')
    check(`${width}px: no console or page errors`, errors.length === 0, errors.slice(0, 2).join(' | '))
    await page.screenshot({ path: path.join(OUT, `${tag}-app-${width}.png`) })
    await page.close()
  }

  await browser.close()

  const passed = checks.filter((c) => c.status === 'passed').length
  const failed = checks.filter((c) => c.status === 'failed').length
  fs.writeFileSync(
    RESULTS,
    JSON.stringify({ tag, generated_at: new Date().toISOString(), passed, failed, checks }, null, 2),
  )
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
