/**
 * Phase 9.12.1 — zero-measurement review state.
 * Uploads a valid digital PDF with no result rows to the isolated stack and
 * verifies the honest empty state, the absence of confirmation controls and
 * responsive fit at 1440 / 390.
 */
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const FRONTEND = 'http://127.0.0.1:5174'
const API = 'http://127.0.0.1:8001'
const FIXTURE = path.join(__dirname, 'fixtures', 'empty_valid_report.pdf')
const OUT = path.join(__dirname, 'screenshots', 'phase9_12_1_final')
const RESULTS = path.join(__dirname, 'phase9_12_1_empty_state_results.json')

const results = {
  generated_at: new Date().toISOString(),
  checks: [],
  screenshot: null,
  error: null,
}

function check(name, ok, detail = null) {
  results.checks.push({ name, status: ok ? 'passed' : 'failed', detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

async function main() {
  const bytes = fs.readFileSync(FIXTURE)
  const form = new FormData()
  form.append('file', new Blob([bytes], { type: 'application/pdf' }), 'empty_valid_report.pdf')
  form.append('consent', 'true')
  const uploadRes = await fetch(`${API}/api/reports`, { method: 'POST', body: form })
  if (!uploadRes.ok) throw new Error(`upload ${uploadRes.status}: ${await uploadRes.text()}`)
  const report = await uploadRes.json()
  results.report_id = report.id
  console.log(`uploaded ${report.id}`)

  const extractRes = await fetch(`${API}/api/reports/${report.id}/extract`, { method: 'POST' })
  if (!extractRes.ok) throw new Error(`extract ${extractRes.status}: ${await extractRes.text()}`)
  const structureRes = await fetch(`${API}/api/reports/${report.id}/structure`, { method: 'POST' })
  if (!structureRes.ok) throw new Error(`structure ${structureRes.status}: ${await structureRes.text()}`)
  const structure = await structureRes.json()
  const listRes = await fetch(`${API}/api/reports/${report.id}/measurements`)
  const list = await listRes.json()
  const measurements = Array.isArray(list) ? list : list.measurements ?? []
  check(
    'fixture processed with zero measurements',
    measurements.length === 0,
    `count=${measurements.length}`,
  )
  check('structure saved zero measurements', structure.measurements_saved === 0, JSON.stringify(structure))

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
    await page.goto(`${FRONTEND}/app/reports/${report.id}/verify`, {
      waitUntil: 'domcontentloaded',
    })
    await page.locator('.ve-empty').waitFor({ timeout: 30000 })
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(400)
    const state = await page.evaluate(() => ({
      empty: document.querySelectorAll('.ve-empty').length,
      cards: document.querySelectorAll('.ve-card').length,
      grid: document.querySelectorAll('.ve-grid').length,
      bar: document.querySelectorAll('.ve-confirmbar').length,
      title: document.querySelector('.ve-empty__title')?.textContent?.trim() ?? null,
      back: document.querySelector('.ve-empty a')?.textContent?.trim() ?? null,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      nestedScrollers: [...document.querySelectorAll('.ve-page *')].filter((el) => {
        const s = getComputedStyle(el)
        return (
          (s.overflowY === 'auto' || s.overflowY === 'scroll') &&
          el.scrollHeight > el.clientHeight + 1
        )
      }).length,
    }))
    check(
      `${width}px: empty state renders`,
      state.empty === 1 && state.grid === 0 && state.cards === 0,
      JSON.stringify(state),
    )
    check(`${width}px: no confirmation bar without measurements`, state.bar === 0)
    check(
      `${width}px: empty state explains the outcome`,
      state.title === 'No measurements were extracted',
    )
    check(
      `${width}px: back to reports action is present`,
      /Back to my reports/i.test(state.back ?? ''),
    )
    check(`${width}px: no horizontal overflow`, state.overflow <= 1, `${state.overflow}`)
    check(
      `${width}px: no nested page scrollers`,
      state.nestedScrollers === 0,
      `${state.nestedScrollers}`,
    )
    check(`${width}px: no console errors`, errors.length === 0, errors.join(' | '))
    const file = path.join(OUT, `after-empty-${width}.png`)
    await page.screenshot({ path: file })
    if (!results.screenshot) results.screenshot = file
    await page.close()
  }
  await browser.close()
  results.finished_at = new Date().toISOString()
  results.passed = results.checks.filter((c) => c.status === 'passed').length
  results.failed = results.checks.filter((c) => c.status === 'failed').length
  fs.writeFileSync(RESULTS, JSON.stringify(results, null, 2))
  console.log(`\n${results.passed} passed, ${results.failed} failed`)
  process.exit(results.failed > 0 ? 1 : 0)
}

main().catch((error) => {
  results.error = String(error)
  fs.writeFileSync(RESULTS, JSON.stringify(results, null, 2))
  console.error(error)
  process.exit(1)
})
