/**
 * Phase 9.12.1 â€” Verification workspace redesign QA.
 *
 * Isolated stack (never the dev DB):
 *   frontend http://127.0.0.1:5174  (VITE_API_BASE=http://127.0.0.1:8001)
 *   backend  http://127.0.0.1:8001  (LABLENS_DATA_DIR=%TEMP%/opencode/lablens-phase9116-qa)
 *
 * Covers the 16-item redesign QA list:
 *   grid completeness / responsive columns / no overflow or nested scrollers,
 *   selection, zero-selection gate, one/many CTA copy, selected-only IDs,
 *   unselected stay unconfirmed, partial + full completion, correction and
 *   re-verification, viewer open/close, highlight alignment, selection + scroll
 *   survival, keyboard + touch, single confirmation control, no overlapping
 *   sticky chrome, and the all-confirmed edge case.
 */

const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const FRONTEND_URL = 'http://127.0.0.1:5174'
const API_URL = 'http://127.0.0.1:8001'
const QA_DIR = path.resolve(__dirname)
const PROJECT_ROOT = path.resolve(QA_DIR, '..', '..', '..', '..')
const CLEAN_FIXTURE = path.join(
  PROJECT_ROOT,
  'backend',
  'tests',
  'fixtures',
  'phase8_1_accuracy',
  'clean_digital_report.pdf',
)
const SCANNED_REPORT = '2875fc0b-4149-4f31-83a0-2d47bb556419' // 2-page scanned, isolated stack
const RESULTS_REPORT = 'c1eb0e44-b50d-41ba-95ce-946317899c44' // supplied "RESULTS 822" screenshot
const SHOT_DIR = path.join(QA_DIR, 'screenshots', 'phase9_12_1_final')
const RESULTS_PATH = path.join(QA_DIR, 'phase9_12_1_verification_results.json')

const WIDTHS = [
  { width: 1920, height: 1080, columns: 3 },
  { width: 1440, height: 900, columns: 3 },
  { width: 1280, height: 900, columns: 3 },
  { width: 1024, height: 900, columns: 2 },
  { width: 768, height: 1024, columns: 2 },
  { width: 390, height: 844, columns: 1 },
  { width: 360, height: 800, columns: 1 },
]

const results = {
  generated_at: new Date().toISOString(),
  frontend_url: FRONTEND_URL,
  api_url: API_URL,
  report_id: null,
  checks: [],
  screenshots: [],
  console_errors: [],
  passed: 0,
  failed: 0,
}

function check(name, condition, detail = null) {
  if (condition) {
    results.passed += 1
    results.checks.push({ name, status: 'passed', detail })
    console.log(`PASS  ${name}${detail ? ` â€” ${detail}` : ''}`)
  } else {
    results.failed += 1
    results.checks.push({ name, status: 'failed', detail })
    console.error(`FAIL  ${name}${detail ? ` â€” ${detail}` : ''}`)
  }
  return condition
}

function section(title) {
  console.log(`\n=== ${title} ===`)
}

async function apiJson(pathname, options = {}) {
  const response = await fetch(`${API_URL}${pathname}`, options)
  if (!response.ok) {
    throw new Error(
      `${options.method || 'GET'} ${pathname} -> ${response.status}: ${await response.text()}`,
    )
  }
  if (response.status === 204) return null
  return response.json()
}

async function measurements(reportId) {
  const body = await apiJson(`/api/reports/${reportId}/measurements`)
  return Array.isArray(body) ? body : body.measurements ?? []
}

function byName(rows, name) {
  return rows.find((row) => row.test_name_normalized === name || row.test_name_original === name)
}

function watchConsole(page, tag) {
  page.on('console', (message) => {
    if (message.type() === 'error' && !/Failed to load resource/i.test(message.text())) {
      results.console_errors.push(`${tag}: ${message.text()}`)
    }
  })
  page.on('pageerror', (error) => {
    results.console_errors.push(`${tag}: pageerror ${error}`)
  })
}

async function shot(page, name, fullPage = false) {
  const file = path.join(SHOT_DIR, name)
  await page.screenshot({ path: file, fullPage })
  results.screenshots.push(file)
  console.log(`SHOT  ${file}`)
}

async function openVerify(page, reportId) {
  await page.goto(`${FRONTEND_URL}/app/reports/${reportId}/verify`, {
    waitUntil: 'domcontentloaded',
  })
  await page.locator('.ve-grid').waitFor({ timeout: 30000 })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(500)
}

function roundRect(rect) {
  if (!rect) return null
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    bottom: Math.round(rect.bottom),
    right: Math.round(rect.right),
  }
}

async function pageLayout(page) {
  return page.evaluate(() => {
    const r = (selector) => {
      const el = document.querySelector(selector)
      if (!el) return null
      const box = el.getBoundingClientRect()
      const style = getComputedStyle(el)
      return {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        bottom: box.bottom,
        right: box.right,
        display: style.display,
        visibility: style.visibility,
        zIndex: style.zIndex,
      }
    }
    const grid = document.querySelector('.ve-grid')
    const columns = grid
      ? getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length
      : 0
    const cards = [...document.querySelectorAll('.ve-card')].map((card) => {
      const box = card.getBoundingClientRect()
      return {
        id: card.getAttribute('data-measurement-id'),
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        bottom: box.bottom,
        selected: card.classList.contains('is-selected'),
        confirmed: card.classList.contains('is-confirmed'),
        checked: card.querySelector('.ve-card__box')?.checked ?? false,
        name: card.querySelector('.ve-card__name')?.textContent?.trim() ?? null,
        value: card.querySelector('.ve-card__value')?.textContent?.trim() ?? null,
        unit: card.querySelector('.ve-card__unit')?.textContent?.trim() ?? null,
        edited: Boolean(card.querySelector('.ve-card__edited')),
      }
    })
    const cta = document.querySelector('.ve-confirmbar__cta')
    const nestedScrollers = [...document.querySelectorAll('.ve-page *')].filter((el) => {
      if (el.closest('.ve-modal-root')) return false
      const style = getComputedStyle(el)
      return (
        (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
        el.scrollHeight > el.clientHeight + 1
      )
    }).length
    return {
      viewport: { width: innerWidth, height: innerHeight },
      doc: {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        scrollHeight: document.documentElement.scrollHeight,
        clientHeight: document.documentElement.clientHeight,
      },
      sidebar: r('.app-sidebar'),
      mobileNav: r('.mobile-nav'),
      toolbar: r('.ve-toolbar'),
      grid: r('.ve-grid'),
      cards,
      columns,
      columnsStyle: grid ? getComputedStyle(grid).gridTemplateColumns : null,
      bar: r('.ve-confirmbar'),
      barInner: r('.ve-confirmbar__inner'),
      barCta: cta
        ? {
            text: cta.textContent.trim(),
            disabled: cta.disabled,
            ...r('.ve-confirmbar__cta'),
          }
        : null,
      barCount: document.querySelector('.ve-confirmbar__count')?.textContent?.trim() ?? null,
      barHint: document.querySelector('.ve-confirmbar__hint')?.textContent?.trim() ?? null,
      disclaimer: r('.ve-disclaimer'),
      selectedCount: document.querySelectorAll('.ve-card.is-selected').length,
      checkedCount: document.querySelectorAll('.ve-card__box:checked').length,
      nestedScrollers,
      pageScrollY: window.scrollY,
      bodyOverflow: document.body.style.overflow,
    }
  })
}

function rectsClose(a, b, tolerance = 1.5) {
  // The bar is fixed to the bottom, so only the horizontal column matters.
  return Math.abs(a.x - b.x) <= tolerance && Math.abs(a.width - b.width) <= tolerance
}

async function cardFor(page, measurementId) {
  return page.locator(`.ve-card[data-measurement-id="${measurementId}"]`)
}

async function selectViaCard(page, measurementId) {
  const card = await cardFor(page, measurementId)
  await card.locator('.ve-card__name').click()
}

async function cta(page) {
  return page.locator('.ve-confirmbar__cta')
}

async function uploadCleanReport(browser) {
  const page = await browser.newPage({ viewport: { width: 1024, height: 900 } })
  watchConsole(page, 'upload')
  await page.goto(`${FRONTEND_URL}/app/upload`, { waitUntil: 'domcontentloaded' })
  await page.locator('input[type="file"]').setInputFiles(CLEAN_FIXTURE)
  await page.locator('.upload-consent-label input[type="checkbox"]').check()
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url() === `${API_URL}/api/reports` && response.request().method() === 'POST',
    { timeout: 30000 },
  )
  await page.getByRole('button', { name: /Start analysis/i }).click()
  const response = await responsePromise
  const body = await response.json()
  results.report_id = body.id
  await page.getByRole('button', { name: /Review & verify results/i }).waitFor({
    timeout: 180000,
  })
  await page.getByRole('button', { name: /Review & verify results/i }).click()
  await page.waitForURL(/\/verify/, { timeout: 20000 })
  await page.locator('.ve-grid').waitFor({ timeout: 30000 })
  await page.close()
  return body.id
}

async function main() {
  fs.mkdirSync(SHOT_DIR, { recursive: true })
  const browser = await chromium.launch({ headless: true })

  // =========================================================================
  // Setup â€” a fresh report so every confirmation starts from zero
  // =========================================================================
  section('Setup: fresh clean report')
  const reportId = await uploadCleanReport(browser)
  const initial = await measurements(reportId)
  check('setup: fresh report has five measurements', initial.length === 5, `count=${initial.length}`)
  check(
    'setup: every fresh measurement is unverified',
    initial.every((m) => m.verification_status !== 'verified'),
    initial.map((m) => `${m.test_name_normalized}:${m.verification_status}`).join(', '),
  )
  const glucose = byName(initial, 'Glucose')
  const hba1c = byName(initial, 'HbA1c')
  const creatinine = byName(initial, 'Creatinine')
  const cholesterol = byName(initial, 'Total Cholesterol')
  const triglycerides = byName(initial, 'Triglycerides')
  check(
    'setup: required fixture measurements are present',
    Boolean(glucose && hba1c && creatinine && cholesterol && triglycerides),
  )

  // =========================================================================
  // 1. Responsive grid, bar geometry, overflow, nested scrolling
  // =========================================================================
  section('1: responsive grid + single bar at seven widths')
  for (const { width, height, columns } of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height } })
    watchConsole(page, `layout-${width}`)
    await openVerify(page, reportId)
    const layout = await pageLayout(page)
    const label = `${width}px`

    check(`${label}: five cards render`, layout.cards.length === 5, `count=${layout.cards.length}`)
    check(
      `${label}: grid has ${columns} column${columns === 1 ? '' : 's'}`,
      layout.columns === columns,
      layout.columnsStyle,
    )
    check(
      `${label}: no document horizontal overflow`,
      layout.doc.scrollWidth <= layout.doc.clientWidth + 1,
      `scrollWidth=${layout.doc.scrollWidth} clientWidth=${layout.doc.clientWidth}`,
    )
    check(`${label}: no nested page scrollers`, layout.nestedScrollers === 0, `${layout.nestedScrollers}`)
    check(
      `${label}: bar is the only sticky confirmation action`,
      (await page.getByRole('button', { name: /^Confirm|^Select at least one|^Continue to your results/i }).count()) === 1,
    )

    if (layout.sidebar && layout.sidebar.display !== 'none') {
      check(
        `${label}: bar clears the app sidebar`,
        layout.bar.x >= layout.sidebar.right - 1,
        `bar.x=${Math.round(layout.bar.x)} sidebar.right=${Math.round(layout.sidebar.right)}`,
      )
    }
    if (layout.mobileNav && layout.mobileNav.display !== 'none') {
      check(
        `${label}: bar sits above the mobile nav`,
        layout.bar.bottom <= layout.mobileNav.y + 1,
        `bar.bottom=${Math.round(layout.bar.bottom)} nav.y=${Math.round(layout.mobileNav.y)}`,
      )
    }
    check(
      `${label}: bar aligns with the content column`,
      rectsClose(layout.barInner, layout.toolbar),
      `barInner=${JSON.stringify(roundRect(layout.barInner))} toolbar=${JSON.stringify(roundRect(layout.toolbar))}`,
    )
    check(
      `${label}: confirmation CTA is fully inside the viewport`,
      layout.barCta !== null &&
        layout.barCta.x >= 0 &&
        layout.barCta.right <= width + 0.5,
      layout.barCta ? `${Math.round(layout.barCta.x)}..${Math.round(layout.barCta.right)}` : 'missing',
    )
    check(
      `${label}: zero selection shows the disabled guidance label`,
      layout.barCta?.text === 'Select at least one result to continue' && layout.barCta.disabled === true,
      `${layout.barCta?.text} disabled=${layout.barCta?.disabled}`,
    )
    check(
      `${label}: card values are prominent`,
      await page.locator('.ve-card__value').first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize) >= 24),
    )

    // Reserve check: scroll to the document end and confirm the last card and
    // disclaimer can clear the fixed bar.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await page.waitForTimeout(150)
    const atEnd = await pageLayout(page)
    const lastCard = atEnd.cards[atEnd.cards.length - 1]
    check(
      `${label}: reserved bottom space clears the last card`,
      lastCard.bottom <= atEnd.bar.y + 1,
      `lastCard.bottom=${Math.round(lastCard.bottom)} bar.y=${Math.round(atEnd.bar.y)}`,
    )
    check(
      `${label}: reserved bottom space clears the disclaimer`,
      atEnd.disclaimer.bottom <= atEnd.bar.y + 1,
      `disclaimer.bottom=${Math.round(atEnd.disclaimer.bottom)} bar.y=${Math.round(atEnd.bar.y)}`,
    )
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(100)

    await shot(page, `after-${width}.png`)
    if (width < 1280) {
      await shot(page, `after-${width}-full.png`, true)
    }
    await page.close()
  }

  // =========================================================================
  // 2. Selection, exact CTA copy, no duplicate confirmation controls
  // =========================================================================
  section('2: selection + exact CTA copy')
  const selPage = await browser.newPage({ viewport: { width: 1024, height: 900 } })
  watchConsole(selPage, 'selection')
  await openVerify(selPage, reportId)

  check(
    'selection: zero-selection CTA is disabled',
    (await (await cta(selPage)).isDisabled()) &&
      (await (await cta(selPage)).innerText()) === 'Select at least one result to continue',
  )
  const guidance = await (await cta(selPage)).evaluate((el) => {
    const style = getComputedStyle(el)
    const rgb = (value) =>
      (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number)
    const channel = (value) => {
      const c = value / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    }
    const luminance = (values) =>
      0.2126 * channel(values[0]) + 0.7152 * channel(values[1]) + 0.0722 * channel(values[2])
    const fg = luminance(rgb(style.color))
    const bg = luminance(rgb(style.backgroundColor))
    const ratio = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05)
    return { opacity: style.opacity, ratio, color: style.color, background: style.backgroundColor }
  })
  check(
    'selection: disabled guidance label stays readable',
    guidance.opacity === '1' && guidance.ratio >= 4.5,
    `opacity=${guidance.opacity} contrast=${guidance.ratio.toFixed(2)}`,
  )
  check(
    'selection: no per-card confirm controls',
    (await selPage.locator('.ve-card__action').filter({ hasText: /confirm/i }).count()) === 0,
  )
  check(
    'selection: no legacy selection bar or footer confirm',
    (await selPage.locator('.ve-selection, .ve-continue, .ve-inspect__confirm').count()) === 0,
  )
  await selectViaCard(selPage, glucose.id)
  const confirmButtons = await selPage
    .getByRole('button')
    .filter({ hasText: /confirm/i })
    .count()
  check('selection: exactly one confirm button exists', confirmButtons === 1, `count=${confirmButtons}`)
  let state = await pageLayout(selPage)
  check(
    'selection: clicking the card body selects it',
    state.selectedCount === 1 && state.checkedCount === 1,
    `selected=${state.selectedCount} checked=${state.checkedCount}`,
  )
  check(
    'selection: one selected shows singular copy',
    state.barCta.text === 'Confirm 1 result & continue' && state.barCta.disabled === false,
    state.barCta.text,
  )
  check('selection: live count reads 1 selected', state.barCount === '1 selected', state.barCount)

  await selectViaCard(selPage, hba1c.id)
  state = await pageLayout(selPage)
  check('selection: a second card adds to the selection', state.selectedCount === 2)
  check(
    'selection: two selected shows plural copy',
    state.barCta.text === 'Confirm 2 results & continue',
    state.barCta.text,
  )
  check('selection: live count reads 2 selected', state.barCount === '2 selected', state.barCount)

  await (await cardFor(selPage, glucose.id)).locator('.ve-card__box').click()
  state = await pageLayout(selPage)
  check(
    'selection: checkbox click toggles off independently',
    state.selectedCount === 1 && state.barCta.text === 'Confirm 1 result & continue',
    `${state.selectedCount} / ${state.barCta.text}`,
  )
  await selectViaCard(selPage, glucose.id)
  check('selection: reselecting restores two', (await pageLayout(selPage)).selectedCount === 2)

  const creatinineCard = await cardFor(selPage, creatinine.id)
  await creatinineCard.locator('.ve-card__meta').click()
  check(
    'selection: clicking the card foot toggles selection',
    (await pageLayout(selPage)).selectedCount === 3,
  )
  await creatinineCard.locator('.ve-card__meta').click()
  check(
    'selection: clicking the card foot again deselects',
    (await pageLayout(selPage)).selectedCount === 2,
  )

  await shot(selPage, 'after-1024-selected.png')

  // =========================================================================
  // 3. Viewer: highlight, alignment, scroll/selection survival, mobile fit
  // =========================================================================
  section('3: original report viewer')
  await selPage.evaluate(() => window.scrollTo(0, 160))
  await selPage.waitForTimeout(150)
  const scrollBefore = await selPage.evaluate(() => window.scrollY)
  const glucoseCard = await cardFor(selPage, glucose.id)
  await glucoseCard.hover()
  await selPage.waitForTimeout(220)
  const sourceButton = selPage.locator(`#ve-source-${glucose.id}`)
  check(
    'viewer: card source action is contextual (revealed on hover)',
    (await sourceButton.evaluate((el) => getComputedStyle(el.parentElement).opacity)) === '1',
  )
  await sourceButton.click()
  await selPage.locator('.ve-modal--doc').waitFor({ timeout: 10000 })
  await selPage.waitForTimeout(700)
  check(
    'viewer: modal names the measurement',
    (await selPage.locator('.ve-modal__title').innerText()).trim() === 'Glucose',
  )
  check('viewer: source highlight renders', (await selPage.locator('.ve-stage__highlight').count()) === 1)
  check('viewer: highlight legend renders', (await selPage.locator('.ve-source__legend').count()) === 1)
  check(
    'viewer: body scroll locks while open',
    (await selPage.evaluate(() => document.body.style.overflow)) === 'hidden',
  )

  const measureHighlight = () =>
    selPage.evaluate(() => {
      const frame = document.querySelector('.ve-stage__frame')
      const highlight = document.querySelector('.ve-stage__highlight')
      if (!frame || !highlight) return null
      const f = frame.getBoundingClientRect()
      const h = highlight.getBoundingClientRect()
      return {
        relX: (h.x - f.x) / f.width,
        relY: (h.y - f.y) / f.height,
        relW: h.width / f.width,
        relH: h.height / f.height,
        frameW: f.width,
        zoom: document.querySelector('.ve-stage__zoom')?.textContent,
      }
    })

  const before = await measureHighlight()
  const zoomBefore = before?.zoom
  await selPage.getByRole('button', { name: 'Zoom in' }).click()
  await selPage.waitForTimeout(350)
  const afterZoom = await measureHighlight()
  check('viewer: zoom changes the rendered scale', afterZoom?.zoom !== zoomBefore, `${zoomBefore} -> ${afterZoom?.zoom}`)
  check(
    'viewer: highlight stays aligned after zoom',
    Math.max(
      Math.abs(before.relX - afterZoom.relX),
      Math.abs(before.relY - afterZoom.relY),
      Math.abs(before.relW - afterZoom.relW),
      Math.abs(before.relH - afterZoom.relH),
    ) < 0.01,
  )
  await selPage.getByRole('button', { name: 'Reset zoom to fit page' }).click()
  await selPage.waitForTimeout(350)
  const afterReset = await measureHighlight()
  check(
    'viewer: reset restores the fitted frame and alignment',
    Math.abs(afterReset.frameW - before.frameW) < 3 &&
      Math.abs(afterReset.relX - before.relX) < 0.01 &&
      Math.abs(afterReset.relY - before.relY) < 0.01,
  )
  await shot(selPage, 'after-viewer-1024.png')

  await selPage.keyboard.press('Escape')
  await selPage.locator('.ve-modal--doc').waitFor({ state: 'detached', timeout: 10000 })
  await selPage
    .waitForFunction((id) => document.activeElement?.id === id, `ve-source-${glucose.id}`, {
      timeout: 5000,
    })
    .catch(() => {})
  await selPage.waitForTimeout(150)
  const scrollAfter = await selPage.evaluate(() => window.scrollY)
  state = await pageLayout(selPage)
  check(
    'viewer: closing preserves scroll position',
    Math.abs(scrollAfter - scrollBefore) <= 2,
    `${scrollBefore} -> ${scrollAfter}`,
  )
  check(
    'viewer: closing preserves selection',
    state.selectedCount === 2 && state.checkedCount === 2,
    `selected=${state.selectedCount}`,
  )
  check(
    'viewer: focus returns to the card source action',
    (await selPage.evaluate(() => document.activeElement?.id)) === `ve-source-${glucose.id}`,
  )

  await selPage.locator('.ve-toolbar__action').click()
  await selPage.locator('.ve-modal--doc').waitFor({ timeout: 10000 })
  await selPage.waitForTimeout(500)
  check(
    'viewer: toolbar action opens the report without a measurement highlight',
    (await selPage.locator('.ve-modal__title').innerText()).includes('clean_digital_report.pdf') &&
      (await selPage.locator('.ve-stage__highlight').count()) === 0 &&
      (await selPage.locator('.ve-source__legend').count()) === 0,
  )
  await selPage.getByRole('button', { name: 'Close original report' }).click()
  await selPage.locator('.ve-modal--doc').waitFor({ state: 'detached', timeout: 10000 })
  await selPage
    .waitForFunction(() =>
      String(document.activeElement?.className ?? '').includes('ve-toolbar__action'),
    )
    .catch(() => {})
  check(
    'viewer: focus returns to the toolbar action',
    (await selPage.evaluate(() => document.activeElement?.className ?? '')).includes('ve-toolbar__action'),
  )
  await selPage.close()

  // Mobile viewer fit
  const mobileViewer = await browser.newPage({ viewport: { width: 390, height: 844 } })
  watchConsole(mobileViewer, 'viewer-390')
  await openVerify(mobileViewer, reportId)
  const mCard = await cardFor(mobileViewer, glucose.id)
  await mCard.hover()
  await mobileViewer.locator(`#ve-source-${glucose.id}`).click({ force: true })
  await mobileViewer.locator('.ve-modal--doc').waitFor({ timeout: 10000 })
  await mobileViewer.waitForTimeout(700)
  const mobileModal = await mobileViewer.evaluate(() => {
    const modal = document.querySelector('.ve-modal--doc')
    const box = modal.getBoundingClientRect()
    return {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      bottom: box.bottom,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      highlight: document.querySelectorAll('.ve-stage__highlight').length,
      navTopElement:
        document.elementFromPoint(195, 810)?.className ?? null,
    }
  })
  check(
    'viewer-390: modal fits the viewport',
    mobileModal.x >= 0 &&
      mobileModal.y >= 0 &&
      mobileModal.width <= 390.5 &&
      mobileModal.bottom <= 844.5,
    JSON.stringify(mobileModal),
  )
  check('viewer-390: no horizontal overflow while open', mobileModal.overflow <= 1, `${mobileModal.overflow}`)
  check('viewer-390: highlight renders', mobileModal.highlight === 1)
  check(
    'viewer-390: modal covers the app nav',
    !String(mobileModal.navTopElement).includes('mobile-nav'),
    String(mobileModal.navTopElement),
  )
  await shot(mobileViewer, 'after-viewer-390.png')
  await mobileViewer.keyboard.press('Escape')
  await mobileViewer.close()

  // Mobile selected screenshot
  const mobileSelected = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await openVerify(mobileSelected, reportId)
  await selectViaCard(mobileSelected, glucose.id)
  await selectViaCard(mobileSelected, hba1c.id)
  await shot(mobileSelected, 'after-390-selected.png')
  await mobileSelected.close()

  // =========================================================================
  // 4. Multi-page scanned document: page navigation + OCR toggle
  // =========================================================================
  section('4: scanned multipage viewer')
  const scannedPage = await browser.newPage({ viewport: { width: 1024, height: 900 } })
  watchConsole(scannedPage, 'scanned')
  await openVerify(scannedPage, SCANNED_REPORT)
  const scannedMeasurements = await measurements(SCANNED_REPORT)
  const glucose2 = byName(scannedMeasurements, 'Glucose')
  check(
    'scanned: multipage report renders its five cards',
    (await scannedPage.locator('.ve-card').count()) === 5,
  )
  await scannedPage.locator('.ve-toolbar__action').click()
  await scannedPage.locator('.ve-modal--doc').waitFor({ timeout: 10000 })
  await scannedPage.waitForTimeout(900)
  check(
    'scanned: viewer opens on page 1 of 2',
    (await scannedPage.locator('.ve-source__page-label').innerText()).replace(/\s/g, '') === '1/2',
  )
  check(
    'scanned: scanned page renders as an image',
    (await scannedPage.locator('.ve-stage__image').count()) === 1 &&
      (await scannedPage.locator('.ve-source__iframe').count()) === 0,
  )
  await scannedPage.getByRole('button', { name: 'Next page' }).click()
  await scannedPage.waitForTimeout(800)
  check(
    'scanned: next page navigation reaches page 2',
    (await scannedPage.locator('.ve-source__page-label').innerText()).replace(/\s/g, '') === '2/2',
  )
  check(
    'scanned: page 2 image request is the rendered page',
    (await scannedPage.locator('.ve-stage__image').getAttribute('src'))?.includes('/pages/2/image'),
  )
  await scannedPage.getByRole('button', { name: 'OCR text' }).click()
  await scannedPage.waitForTimeout(200)
  check(
    'scanned: OCR text mode shows extracted text',
    (await scannedPage.locator('.ve-source__ocr-text').innerText()).trim().length > 10,
  )
  await scannedPage.getByRole('button', { name: 'Visual' }).click()
  await scannedPage.waitForTimeout(400)
  check('scanned: visual mode restores the page image', (await scannedPage.locator('.ve-stage__image').count()) === 1)
  await scannedPage.keyboard.press('Escape')
  await scannedPage.locator('.ve-modal--doc').waitFor({ state: 'detached', timeout: 10000 })

  // Open from a page-2 card: active page follows the measurement and highlights it.
  const glucoseCard2 = await cardFor(scannedPage, glucose2.id)
  await glucoseCard2.hover()
  await scannedPage.locator(`#ve-source-${glucose2.id}`).click()
  await scannedPage.locator('.ve-modal--doc').waitFor({ timeout: 10000 })
  await scannedPage.waitForTimeout(900)
  check(
    'scanned: card source action opens the measurement page',
    (await scannedPage.locator('.ve-source__page-label').innerText()).replace(/\s/g, '') === '2/2',
  )
  check(
    'scanned: page-2 OCR measurement gets a source highlight',
    (await scannedPage.locator('.ve-stage__highlight').count()) === 1,
  )
  await shot(scannedPage, 'after-viewer-scanned-1024.png')
  await scannedPage.keyboard.press('Escape')
  await scannedPage.close()

  // =========================================================================
  // 5. Keyboard accessibility
  // =========================================================================
  section('5: keyboard')
  const keyPage = await browser.newPage({ viewport: { width: 1024, height: 900 } })
  watchConsole(keyPage, 'keyboard')
  await openVerify(keyPage, reportId)
  await keyPage.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
  let focusedBox = false
  for (let i = 0; i < 60; i += 1) {
    await keyPage.keyboard.press('Tab')
    focusedBox = await keyPage.evaluate(() =>
      document.activeElement?.classList?.contains('ve-card__box'),
    )
    if (focusedBox) break
  }
  check('keyboard: Tab reaches a card checkbox', focusedBox)
  check(
    'keyboard: checkbox shows a visible focus ring',
    await keyPage.evaluate(() => {
      const el = document.activeElement
      if (!el) return false
      const style = getComputedStyle(el)
      return style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 1
    }),
  )
  await keyPage.keyboard.press('Space')
  check(
    'keyboard: Space toggles selection',
    (await pageLayout(keyPage)).selectedCount === 1,
  )
  await keyPage.keyboard.press('Tab')
  check(
    'keyboard: Tab moves from the checkbox to View in report',
    (await keyPage.evaluate(() => document.activeElement?.id)) === `ve-source-${glucose.id}`,
  )
  await keyPage.keyboard.press('Enter')
  await keyPage.locator('.ve-modal--doc').waitFor({ timeout: 10000 })
  check('keyboard: Enter opens the original report', true)
  await keyPage.keyboard.press('Escape')
  await keyPage.locator('.ve-modal--doc').waitFor({ state: 'detached', timeout: 10000 })
  await keyPage
    .waitForFunction((id) => document.activeElement?.id === id, `ve-source-${glucose.id}`, {
      timeout: 5000,
    })
    .catch(() => {})
  check(
    'keyboard: Escape returns focus to the opener',
    (await keyPage.evaluate(() => document.activeElement?.id)) === `ve-source-${glucose.id}`,
  )
  await keyPage.keyboard.press('Tab')
  check(
    'keyboard: Tab reaches Edit',
    (await keyPage.evaluate(() => document.activeElement?.id)) === `ve-edit-${glucose.id}`,
  )
  await keyPage.keyboard.press('Enter')
  await keyPage.locator('.ve-modal--inspect').waitFor({ timeout: 10000 })
  check('keyboard: Enter opens result details', true)
  await keyPage.keyboard.press('Escape')
  await keyPage.locator('.ve-modal--inspect').waitFor({ state: 'detached', timeout: 10000 })
  await keyPage
    .waitForFunction((id) => document.activeElement?.id === id, `ve-edit-${glucose.id}`, {
      timeout: 5000,
    })
    .catch(() => {})
  check(
    'keyboard: Escape returns focus to Edit',
    (await keyPage.evaluate(() => document.activeElement?.id)) === `ve-edit-${glucose.id}`,
  )
  await keyPage.close()

  // =========================================================================
  // 6. Touch: actions stay visible, tapping the card selects
  // =========================================================================
  section('6: touch')
  const touchContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  })
  const touchPage = await touchContext.newPage()
  watchConsole(touchPage, 'touch')
  await openVerify(touchPage, reportId)
  check(
    'touch: contextual card actions are visible without hover',
    (await touchPage.locator('.ve-card__actions').first().evaluate((el) => getComputedStyle(el).opacity)) === '1',
  )
  const tCard = await cardFor(touchPage, glucose.id)
  await tCard.locator('.ve-card__name').tap()
  check('touch: tapping the card selects it', (await pageLayout(touchPage)).selectedCount === 1)
  await touchPage.locator(`#ve-source-${glucose.id}`).tap()
  await touchPage.locator('.ve-modal--doc').waitFor({ timeout: 10000 })
  check('touch: View in report opens the viewer', true)
  await touchPage.getByRole('button', { name: 'Close original report' }).tap()
  await touchPage.locator('.ve-modal--doc').waitFor({ state: 'detached', timeout: 10000 })
  check(
    'touch: closing preserves the selection',
    (await pageLayout(touchPage)).selectedCount === 1,
  )
  await shot(touchPage, 'after-390-touch.png')
  await touchContext.close()

  // =========================================================================
  // 7. Confirmation: selected-only POST, partial completion, corrections
  // =========================================================================
  section('7: selected-only confirmation + partial completion')
  const flow = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  watchConsole(flow, 'flow')
  await openVerify(flow, reportId)
  await selectViaCard(flow, glucose.id)
  await selectViaCard(flow, hba1c.id)
  const verifyRequestPromise = flow.waitForRequest(
    (request) =>
      request.url() === `${API_URL}/api/reports/${reportId}/measurements/verify-selected` &&
      request.method() === 'POST',
  )
  await (await cta(flow)).click()
  const verifyRequest = await verifyRequestPromise
  const postedIds = JSON.parse(verifyRequest.postData() || '{}').measurement_ids ?? []
  check(
    'confirm: only the two selected ids are submitted',
    postedIds.length === 2 &&
      new Set(postedIds).size === 2 &&
      postedIds.includes(glucose.id) &&
      postedIds.includes(hba1c.id),
    postedIds.join(','),
  )
  await flow.locator('.rc').waitFor({ timeout: 20000 })
  const afterPartial = await measurements(reportId)
  const verifiedIds = afterPartial
    .filter((m) => m.verification_status === 'verified')
    .map((m) => m.id)
  check(
    'confirm: exactly the selected measurements become verified',
    verifiedIds.length === 2 &&
      verifiedIds.includes(glucose.id) &&
      verifiedIds.includes(hba1c.id),
    verifiedIds.join(','),
  )
  check(
    'confirm: the three unselected measurements remain unverified',
    [creatinine, cholesterol, triglycerides].every(
      (m) => afterPartial.find((row) => row.id === m.id).verification_status !== 'verified',
    ),
  )
  check(
    'confirm: completion opens in the partial state',
    (await flow
      .locator('.rc__eyebrow--partial')
      .evaluate((el) => el.textContent?.trim())) === 'Partially reviewed' &&
      (await flow.locator('.rc__headline').innerText()).includes('reviewed what you could'),
  )
  const partialStats = await flow.locator('.rc__stat dd').allInnerTexts()
  check(
    'completion: partial stats are 2 confirmed / 0 corrected / 3 unverified',
    partialStats[0] === '2' && partialStats[1] === '0' && partialStats[2] === '3',
    partialStats.join(' / '),
  )
  check('completion: no sticky confirm bar is present', (await flow.locator('.ve-confirmbar').count()) === 0)
  const finishPartial = flow.getByRole('button', { name: /Finish for now/i })
  check('completion: partial finish is gated on acknowledgement', await finishPartial.isDisabled())
  await flow.locator('.rc__ack-box').check()
  check('completion: acknowledgement enables finish', await finishPartial.isEnabled())
  check(
    'completion: acknowledgement verifies nothing',
    (await measurements(reportId)).filter((m) => m.verification_status === 'verified').length === 2,
  )
  await shot(flow, 'after-completion-partial-1440.png')
  await flow.getByRole('button', { name: /Return to remaining measurements/i }).click()
  await flow.locator('.ve-grid').waitFor({ timeout: 10000 })
  check('completion: returning restores the grid', (await flow.locator('.ve-card').count()) === 5)

  // Correction after confirmation must reset verification and preserve the audit trail.
  section('8: correction + explicit re-verification')
  const hba1cCard = await cardFor(flow, hba1c.id)
  await hba1cCard.hover()
  await flow.locator(`#ve-edit-${hba1c.id}`).click()
  await flow.locator('.ve-modal--inspect').waitFor({ timeout: 10000 })
  await flow.waitForTimeout(250)
  check(
    'correction: editor shows the original extracted value',
    (await flow.locator('.ve-inspect__ghost').innerText()).includes('6.2'),
  )
  check(
    'correction: confirmed measurement enters the editor as confirmed',
    (await flow.locator('.ve-inspect__statusline').innerText()).includes('Confirmed'),
  )
  const resultInput = flow.locator('.ve-inspect__edit input').first()
  await resultInput.fill('')
  check(
    'correction: empty value blocks saving',
    await flow.getByRole('button', { name: /Save correction/i }).isDisabled(),
  )
  await resultInput.fill('6.3')
  await flow.getByRole('button', { name: /Save correction/i }).click()
  await flow.waitForFunction(
    () => document.querySelector('.ve-inspect__value')?.textContent?.trim() === '6.3',
    { timeout: 10000 },
  )
  check(
    'correction: saved value updates the detail view',
    (await flow.locator('.ve-inspect__value').innerText()).trim() === '6.3',
  )
  check(
    'correction: edited marker appears',
    (await flow.locator('.ve-inspect__edited').count()) === 1,
  )
  check(
    'correction: status returns to needs review',
    (await flow.locator('.ve-inspect__statusline').innerText()).toLowerCase().includes('needs review'),
  )
  const afterCorrection = await measurements(reportId)
  const corrected = afterCorrection.find((m) => m.id === hba1c.id)
  check(
    'correction: backend reset verification status',
    corrected.verification_status !== 'verified',
    corrected.verification_status,
  )
  check('correction: backend records the correction audit row', corrected.has_corrections === true)
  check('correction: backend stores the corrected value', corrected.result_original === '6.3')
  await shot(flow, 'after-inspect-1440.png')
  await flow.keyboard.press('Escape')
  await flow.locator('.ve-modal--inspect').waitFor({ state: 'detached', timeout: 10000 })
  const cardAfterCorrection = await cardFor(flow, hba1c.id)
  check(
    'correction: card no longer claims confirmation',
    (await cardAfterCorrection.getAttribute('class'))?.includes('is-confirmed') === false,
  )
  check(
    'correction: card shows the edited marker',
    (await cardAfterCorrection.locator('.ve-card__edited').count()) === 1,
  )
  check(
    'correction: card shows the corrected value',
    (await cardAfterCorrection.locator('.ve-card__value').innerText()).trim() === '6.3',
  )

  // Re-verify the corrected value explicitly.
  await selectViaCard(flow, hba1c.id)
  check(
    're-verify: corrected value can be selected again',
    (await pageLayout(flow)).barCta.text === 'Confirm 1 result & continue',
  )
  await (await cta(flow)).click()
  await flow.locator('.rc').waitFor({ timeout: 20000 })
  const reStats = await flow.locator('.rc__stat dd').allInnerTexts()
  check(
    're-verify: completion reports 2 confirmed / 1 corrected / 3 unverified',
    reStats[0] === '2' && reStats[1] === '1' && reStats[2] === '3',
    reStats.join(' / '),
  )
  await flow.getByRole('button', { name: /Return to remaining measurements/i }).click()
  await flow.locator('.ve-grid').waitFor({ timeout: 10000 })

  // =========================================================================
  // 9. Full completion + all-confirmed edge case
  // =========================================================================
  section('9: full completion + all-confirmed edge')
  for (const m of [creatinine, cholesterol, triglycerides]) {
    await selectViaCard(flow, m.id)
  }
  check(
    'full: three selected shows plural copy',
    (await pageLayout(flow)).barCta.text === 'Confirm 3 results & continue',
  )
  await (await cta(flow)).click()
  await flow.locator('.rc').waitFor({ timeout: 20000 })
  check(
    'full: completion headline reports the complete review',
    (await flow.locator('.rc__headline').innerText()).includes('review is complete'),
  )
  const fullStats = await flow.locator('.rc__stat dd').allInnerTexts()
  check(
    'full: stats are 5 reviewed / 5 confirmed / 1 corrected',
    fullStats[0] === '5' && fullStats[1] === '5' && fullStats[2] === '1',
    fullStats.join(' / '),
  )
  check(
    'full: continue to results is available',
    await flow.getByRole('button', { name: /Continue to your results/i }).isEnabled(),
  )
  await shot(flow, 'after-completion-full-1440.png')
  await flow.getByRole('button', { name: /Back to review/i }).click()
  await flow.locator('.ve-grid').waitFor({ timeout: 10000 })
  const allConfirmed = await pageLayout(flow)
  check(
    'all-confirmed: bar reports every measurement confirmed',
    allConfirmed.barCount === '5 of 5 confirmed' &&
      allConfirmed.barCta.text === 'Continue to your results' &&
      allConfirmed.barCta.disabled === false,
    `${allConfirmed.barCount} / ${allConfirmed.barCta.text} / disabled=${allConfirmed.barCta.disabled}`,
  )
  check(
    'all-confirmed: every card is confirmed',
    (await flow.locator('.ve-card.is-confirmed').count()) === 5,
  )
  await shot(flow, 'after-1440-all-confirmed.png')
  await (await cta(flow)).click()
  await flow.locator('.rc').waitFor({ timeout: 10000 })
  check(
    'all-confirmed: continue re-enters completion instead of dead-ending',
    (await flow.locator('.rc__headline').innerText()).includes('review is complete'),
  )

  // Existing analysis hand-off still works end to end.
  await flow.getByRole('button', { name: /Continue to your results/i }).click()
  await flow.waitForURL(/\/results/, { timeout: 180000 })
  check('handoff: completion navigates to the existing results page', /\/results/.test(flow.url()))
  await flow.waitForTimeout(1200)
  await shot(flow, 'after-results-1440.png')
  await flow.close()

  // =========================================================================
  // 10. Findings: the supplied "RESULTS 822" screenshot remains reviewable
  // =========================================================================
  section('10: RESULTS 822 finding (read-only)')
  const finding = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  watchConsole(finding, 'results-822')
  await openVerify(finding, RESULTS_REPORT)
  const findingRows = await measurements(RESULTS_REPORT)
  const bogus = findingRows.find((m) => m.test_name_original === 'RESULTS')
  check(
    'finding: the RESULTS row is still present and reviewable',
    Boolean(bogus) && bogus.result_original === '822',
    bogus ? `${bogus.test_name_original} ${bogus.result_original}` : 'missing',
  )
  check(
    'finding: the row has no test code (analysis-unsupported)',
    bogus && bogus.test_code === null,
    String(bogus?.test_code),
  )
  const bogusCard = await cardFor(finding, bogus.id)
  check(
    'finding: the row appears as a normal card, not hidden or corrected',
    (await bogusCard.count()) === 1 &&
      (await bogusCard.locator('.ve-card__name').innerText()).trim() === 'RESULTS' &&
      (await bogusCard.locator('.ve-card__value').innerText()).trim() === '822',
  )
  check('finding: the row was not auto-corrected', bogus.has_corrections === false)
  const analysis = await apiJson(`/api/reports/${RESULTS_REPORT}/analysis`)
  check(
    'finding: analysis counts it as unsupported rather than using it',
    analysis.summary.total_measurements === 13 &&
      analysis.summary.unsupported === 1 &&
      analysis.summary.supported_measurements === 12,
    JSON.stringify({
      total: analysis.summary.total_measurements,
      unsupported: analysis.summary.unsupported,
      supported: analysis.summary.supported_measurements,
    }),
  )
  await bogusCard.scrollIntoViewIfNeeded()
  await bogusCard.hover()
  await shot(finding, 'finding-results-822-card.png')
  await finding.close()

  // =========================================================================
  // Wrap up
  // =========================================================================
  check('console: no page or console errors across the run', results.console_errors.length === 0, results.console_errors.join(' | '))
  results.finished_at = new Date().toISOString()
  fs.writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2))
  console.log(`\n${results.passed} passed, ${results.failed} failed`)
  console.log(`Results: ${RESULTS_PATH}`)
  await browser.close()
  process.exit(results.failed > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  fs.mkdirSync(SHOT_DIR, { recursive: true })
  fs.writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2))
  process.exit(1)
})
