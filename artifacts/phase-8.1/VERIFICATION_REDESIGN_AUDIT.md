# LabLens Phase 9.11.0 — Verification Experience Audit & Redesign Specification
**Date:** 2026-11-13  
**Scope:** read-only audit and design planning. No implementation, no data changes, no dependencies.  
**Audience:** product design + frontend engineering. Everything below is specific enough to build from without inventing layout decisions.

---

## 0. What this document is

A critical audit of the current verification experience (`src/pages/VerificationPage.tsx` + `phase8.css` + backend verification APIs), followed by a complete redesign specification for the measurement verification workspace — the screen where users "make sure the results were copied correctly" before analysis.

The redesign keeps LabLens's identity (warm neutral surfaces, restrained lime/mint accents, Manrope/Inter) and replaces the mechanics with an evidence-first, bulk-by-default review workspace.

---

## 1. Current experience problems — ranked by severity

Severity: 🔴 critical · 🟡 high · 🟠 medium · ⚪ low.

### 🔴 P1 — Bulk confirmation contradicts the product's trust model
`handleVerifyAll` calls `POST /api/reports/{id}/measurements/verify-all-reviewed`, which UPDATE-verifies **every** measurement in the report with status `extracted` or `needs_review`. A single tap approves the whole report regardless of what the user reviewed. There is **no explicit-selection bulk action**. This violates the core workflow rule: bulk confirmation must apply only to explicitly selected results. The “Verify all” button gives no hint that it approves everything.

### 🔴 P2 — Verification state is illegible
Rows offer only “Verify” (unverified) or a green “Verified” badge. There is:
- no visible `needs_review` styling after a correction (row silently loses its badge),
- no "corrected" marker despite correction audit rows being written (`measurement_corrections`),
- no explicit "leave unverified" affordance or explanation of what unverified means,
- no distinction between "extracted and unconfirmed" and "corrected and awaiting re-verification".

A first-time user cannot tell what state anything is in.

### 🟡 P3 — Source comparison is fragile and inconsistent by document type
- The document column and the measurements column are fixed 50/50; the document rarely shows the crop of the selected row, only a mint box on the full page.
- Digital PDFs fall back to a browser `<iframe>` of the raw PDF **with no highlight** (highlights only render for OCR pages or when a digital page has bbox + image render).
- Photographs show the whole photo with a tiny box; no zoom, no pan, no "focus" follow of the selected row once you scroll the image.
- OCR text is a raw monospace `<pre>` dump with no structure, no confidence cue, no line anchors — unusable as a comparison aid.
- The highlight has `aria-hidden="true"` and no outline for keyboard/low-vision users.

### 🟡 P4 — Out-of-range is conflated with extraction errors (and detection is dead code)
Ground truth: the backend computes `derived_flag` ∈ `within_range | above_range | below_range | qualitative | unknown` (`_derive_flag`). The frontend in `VerificationPage.tsx` checks `m.derived_flag === 'high' || m.derived_flag === 'low'` — values the backend **never emits**, so *no row ever gets flagged as out-of-range*. The critical hook tests `includes('crit')`, while the backend applies `CRITICAL_FLAG_TOKENS`/substring `critical` to `lab_flag` (`_is_critical`); the frontend re-implements analysis logic crudely. There is also no visual grammar separating "abnormal value copied perfectly" from "this looks wrong, please check" — and since analysis admits only `verified` measurements with a `test_code`, this page is effectively the only gate to analysis.

### 🟠 P5 — Correction → re-verification handoff is unclear
After saving a correction, the measurement is set to `needs_review` and the analysis fingerprint changes (prior analysis becomes `stale`). The UI gives no notice: the row just quietly shows the Verify button again, and the results page later surfaces a generic stale alert. The link between "you changed a value" → "analysis must be re-run" is left implicit.

### 🟠 P6 — No review journey, no completion
- "Step 2 of 3 · Verification" mislabels the flow (upload → processing → **verification** → results).
- The header CTA "Confirm results & continue" is duplicated top and bottom and always re-runs analysis, even with zero changes — a new `analysis_runs` row is written on every click.
- No summary of how many remain unverified before continuing, no review-completion moment, no explanation of what happens to unverified values.
- No way to see "X of Y need my attention" at a glance.

### 🟠 P7 — Weak for 30–50 measurements
- Only ~500 px rows column, vertical scroll with a plain header (no sticky columns, no sort/filter: All / Needs review / Out of range / Corrected / Verified).
- No bulk of selection; no select-all-where; no keyboard model (j/k, v to verify, ⏎ confirm selected).
- No density toggle for very large reports.

### 🟠 P8 — Layout composition is generic dashboard
Two bordered `overflow:hidden` cards + a lime button. Nothing distinctive, nothing source-first, no editorial hierarchy, no document theatre. It reads like a CRUD form, not a premium clinical tool.

### ⚪ P9 — Cosmetic/medium defects
- Mobile tab bar is decent but cramped; no swipe; touch targets ~40 px (below 44).
- `.verification-row` mixes `onClick` on the row and a nested `role="button"` cell — double semantics; screen reader noise.
- Header eyebrow "Step 2 of 3" numbering inconsistent with processing screen's "STAGE n OF 5".
- Continue-bar copy ("Verified measurements will be included in pattern analysis") but no counter of what's unverified.
- Critical wash (`--critical-wash`) on critical rows + mint selection outline fight each other; selection is invisible in critical rows (`.is-selected.is-critical` keeps critical bg only).
- No tabular-nums on value columns; numbers don't align vertically.
- Loading is a lone spinner with no skeleton; empty state suggests checking OCR text with no next step.
- The `verification-doc-name` truncates filename with no tooltip.
- Page selector only appears when >1 page; fine, but no "jump to measurement's page" affordance from the row itself (selecting a row does jump — good — but it's undocumented).

### What works today and must be preserved
- Split view: document left, measurements right — correct topology.
- Page auto-jump to the selected measurement's page (kept latently, but needs surfacing).
- Source bbox → highlight on OCR PDF pages and on images; digital PDF highlight when bbox exists.
- Edit limited to `result_original`, `unit_original`, `reference_range_original` + optional reason — backend semantics are sound and screen-safe.
- Verification invalidation after edit (`needs_review`) and analysis staleness by fingerprint are correct — keep, surface.

---

## 2. Proposed end-to-end user journey

```
Upload → Processing (9.10.x) → VERIFICATION (this redesign) → Analysis results
                                      ↘ (stale banner if edits after analysis)
```

1. **Landing.** Header reads: eyebrow "STEP 3 OF 4 · VERIFY EXTRACTED RESULTS", headline:
   “Your report has been read.” / “Let’s make sure it was copied correctly.”
   Sub: “LabLens transcribes your report — you make sure the transcription matches the original. No medical judgment is made here.”
2. **Orientation.** Overview strip: total measurements · confirmed · need attention · corrected, plus a quiet progress ring. A single line of copy under the ring: “Confirmation only checks that the values match the report — not whether they are healthy.”
3. **Normal review.** The table is a bulk-review instrument: checkbox selection (explicit only), per-row inspection, top actions “Confirm N selected”, “Inspect”, filter chips. One click on any row opens the focused inspection panel — the document pane always stays in place.
4. **Focused inspection.** Selecting a row: document auto-jumps to the row's page, dims non-source regions, zooms toward the source bbox (scale 1.6×–2.4×), pulses the highlight once. Right rail becomes the inspection panel (or bottom sheet on mobile).
5. **Correction.** Inline fields with the original value shown as reference ghost text (never silently overwritten). Saving: measurement becomes `needs_review`; a correction chip appears on the row; a dismissible banner warns that analysis is now stale; the row is re-queued automatically (Verify button returns).
6. **Unverified outcome.** A row can be left unverified deliberately: the detail panel's secondary action is “Leave unverified” — copy: “This stays in your report unverified. Analysis won’t treat it as confirmed.” Continuing with unverified measurements is allowed; the completion screen states plainly how many remain unverified and requires acknowledgement.
7. **Completion.** Full completion moment: ring completes, summary of actions (Y confirmed · Z corrected · W left unverified), one primary CTA “Continue to your results”.
8. **Results.** Analysis reruns (the redesign navigates through a small interstitial that confirms the rerun, or skips the rerun entirely when nothing changed and reuses the fresh run — see §10 backend gaps).
9. **Stale loop.** If the user edits again from results (via report workspace), the results page shows the existing amber stale banner; a "review again" CTA returns here with the changed rows highlighted.

**Honesty note (verified against the code):** analysis only admits measurements with `verification_status == "verified"` and a `test_code` (`analyse_report`, Phase 4 eligibility). Nothing enters analysis from `extracted` or `needs_review`. The completion copy can — and must — state that unverified results are excluded from analysis. The fingerprint also includes `verification_status`, so corrections invalidate freshness as designed.

---

## 3. Desktop wireframe (min 1080–1440 px)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Reports  ›  Lab report 13 Nov 2026                       [Download]  avatar  │ ← thin contextual bar
├──────────────────────────────────────────────────────────────────────────────┤
│ STEP 3 OF 4 · VERIFY EXTRACTED RESULTS                                       │
│ Your report has been read.                                                  │
│ Let’s make sure it was copied correctly.                                    │
│  LabLens transcribes your report — you check the transcription, not          │
│  your health. Confirmed results are used for analysis; everything else      │
│  stays unverified.                                          ┌─────────────┐ │
│                                                              │   ◔ 72 %    │ │ ← progress ring (SVG)
│  18 / 25 confirmed · 4 need attention · 2 corrected         │ CONFIRMED   │ │
│                                                              └─────────────┘ │
├───────────────────────────────────┬─────────────────────────────────────────┤
│ ORIGINAL REPORT                [1/2 ▾] [Download] [Doc type: Scanned]        │ ← toolbar row
│  ┌────────────────────────────────┴─────────────────────────┐                 │
│  │                                                          │                 │
│  │   ░░░░░░░░░░░░░░░░░░░   page render at 200 DPI             │                 │
│  │   ░░░  [ 14.2 g/dL ]  ░   ← bbox highlight: lime ring +    │                 │
│  │   ░░░░░░░░░░░░░░░░░░░ ░   once-pulse on select, matches    │                 │
│  │   ░░░░░░░░░░░░░░░░░░░ ░   row                              │                 │
│  │                                                          │                 │
│  │  [ zoom −  ＋  fit ]  [Toggle OCR text ⌃]                 │                 │
│  └──────────────────────────────────────────────────────────┘                 │
│  legend: ▢ highlighted = selected measurement                     │                 │
├───────────────────────────────────┼─────────────────────────────────────────┤
│ MEASUREMENTS 25 · 14 selected? no — only on explicit toggle        │                 │
│ [ All (25) | Needs review (4) | Out of range (5) | Corrected (2) | Confirmed (16) ] │
│ ┌──────────────────────────────────────────────┐  ← sticky header  │                 │
│ │ ✓ | Biomarker        | Result      | Ref      |  St. │           │                 │
│ ├──────────────────────────────────────────────┤                 │                 │
│ │ ✓ | HEMOGLOBIN       | 14.2 g/dL   | 12.0–16.0│ ●   │ ← selected, lime ring │      │                 │
│ │ ☐ | WBC              | 8.5 x10³/uL | 4–11.0   | ●   │           │                 │
│ │   | Glucose      •   | 128 mg/dL   | 70–99    | ○   │ ← ● dot = confirmed   │      │                 │
│ │   | Creatinine   ✎   | 1.0 mg/dL   | 0.7–1.3  | ◐   │ ← ✎ corrected         │      │                 │
│ │   | Platelet Count   | 240 x10³/uL | 150–450  | ●   │           │                 │
│ └──────────────────────────────────────────────┘                 │                 │
│  Selection action bar (slides up when ≥1 checked):                 │                 │
│  ✓ 2 selected   [ Confirm selected ]  [ Inspect ]  [ Clear ]       │                 │
├───────────────────────────────────────────────────────────────────────────┤
│ 28 results confirmed · 2 corrected · 1 unverified will be excluded  │                 │
│        from analysis unless you confirm them.  [Continue to results] │                 │
├───────────────────────────────────────────────────────────────────────────┤
│ Verification compares lab transcription — not your health.                   │
└───────────────────────────────────────────────────────────────────────────┘
```

### Desktop anatomy rules
- Grid: `minmax(0, 7fr) minmax(0, 5fr)` — document 58 % / measurements 42 % (document is the evidence; it gets the space). Collapses to single column under 1080 px.
- The left column is **frozen** in place; right column scrolls independently (both have `max-height: calc(100vh - 96px)` with their own scrollbars).
- Sticky table header with tabular-nums columns and column min-widths: `sel 44px · biomarker minmax(150px,1.2fr) · result minmax(120px,0.9fr) · ref minmax(96px,0.8fr) · status 64px`.
- The selection action bar is fixed to the bottom of the right column (slides/fades in over 240 ms) — never a browser alert, never a modal.
- Row click ≠ select-checkbox. Row click = focused inspection. Checkbox = bulk. Clear separation (mouse users get it instantly; a11y users use both).
- Highlight & row sync: selecting a measurement scrolls the page viewer to its page and back-interpolates `bbox` → percent-box; transcript direction: switching to a row *without* page jump (same page) still re-pulses highlight.

### Desktop focused inspection (row → panel)
```
┌──────────────┬────────────────────────────────────────────────┐
│ (document)   │  GLUCOSE  ·  p.2                          ✕   │
│  ░░░[128]░░░ │  Extracted value  128 mg/dL  (lab flag H)     │
│              │  Ghost text (original)         128 mg/dL      │
│              │  Unit        mg/dL                             │
│              │  Reference   70–99 mg/dL (out of range)         │
│              │  ─────────────────────────────────────         │
│              │  ⚠ Out of range · copied perfectly is possible │
│              │  ── source: page 2, line 4 ──────────           │
│              │  OCR confidence 94.2 %                          │
│              │  [ Save correction ]  [ Confirm ]  [ Leave ]   │
│              │  Leave unverified = not used in analysis       │
└──────────────┴────────────────────────────────────────────────┘
```

---

## 4. Mobile wireframe (<860 px)

```
┌─────────────────────────────┐
│ Verification                ⌃│ ← back link, compact
│ Your report has been read.   │
│ 14 / 25 confirmed · 4 need   │
│ ┌ progress ring ◔ 56 % ────┐ │
│ Segmented control sticky:    │
│ [ Document | Measurements ]  │
├─────────────────────────────┤
│ MEASUREMENTS tab (default)   │
│ [All 25|Needs 4|Range 5|Corr]│ ← horizontal scroll chips
│ ☐ HEMOGLOBIN   14.2 g/dL  ● │
│ ☐ WBC            8.5      ● │
│ ▣ Glucose      128 H     ◐ │ ← checked
│ ─────────────────────────────│
│  ✓ 1 selected [Confirm 1]  │
├─────────────────────────────┤
│ Document tab: page render    │
│ + highlight + page nav +     │
│ [Open inspection]            │
├─────────────────────────────┤
│ bottom bar: Continue →       │
└─────────────────────────────┘
```

- Single column; segmented control (Document | Measurements) replaces the two `display:none` columns.
- The inspection panel becomes a **bottom sheet**: biomarker header, extracted value (large), unit/range chips, flag explanation, source strip (cropped image of the bbox region with 16 px margin at 2×), fields, actions row: [Confirm] [Save correction ×2] [Leave unverified].
- Sticky bottom bar with "X selected · Confirm selected" + a tertiary "Continue to results".
- Touch targets ≥ 44 px; row height ~64 px; selection checkbox visually 24 px box w/ 44 px hit slop.
- The desktop table becomes card-rows; columns reflow to two lines: name+page / value+unit+range; status dot right.
- Swipe-to-verify is explicitly **rejected** (destructive, accidental, contradicts explicitness); tapping the status circle toggles verification only after focus + confirmation for unverified→verified? No — tap = inspect, Confirm button inside sheet. Keep two unambiguous interactions: checkbox = bulk; row = inspect; no hidden gestures.

---

## 5. Source inspection-panel wireframe

```
┌───────────────────────── ORIGINAL ─────────────────────────┐
│ filename.pdf  ·  page 2 of 3  ·  doc type: OCR PDF    [⤓]  │
│ ┌────────────────────────────────────────────────────────┐ │
│ │                                                          │ │
│ │     ░░░░░░░░░░░ Blood Glucose ░░░░░░░░░░░░░░░░░░░░░░░░   │ │
│ │     ░░░░░░░░░░░ 128      mg/dL   H ░░░░░░░░░░░░░░░░░     │ │
│ │     ░░░░░░░░░░░ Reference: 70–99 ░░░░░░░░░░░░░░░░░░░    │ │
│ │                                ╎ lime 2px ring, soft fill│ │
│ │                                                          │ │
│ │     page 2/3         [−] 100% [+]   [ Toggle OCR text ]  │ │
│ └────────────────────────────────────────────────────────┘ │
│ Tap a measurement to jump to its source line.               │
└──────────────────────────────────────────────────────────────┘
```

### Behavioral spec
- **Image render**: `pageImageUrl` at 200 DPI; bbox is a percent-positioned `<mark>` with: lime 2 px ring (`box-shadow: 0 0 0 2px var(--lime-strong)`), 18 % lime wash fill, `border-radius: 4px`, once-per-select pulse (`@keyframes src-pulse`, 520 ms, respects reduced motion).
- **Zoom**: free zoom 60–300 % (±buttons + wheel with ctrl), fit-width default; double-click toggles fit↔1.6×; pan by drag when zoomed; “Reset to source region” button jumps and scales to the selected bbox at max safe zoom.
- **OCR text toggle**: shows the page's `raw_text` as structured lines with per-line confidence shading (translucent mint → amber → red), visually tied to bboxes when hovered (`onMouseEnter` line → highlight corresponding item box).
- **Digital PDF**: render via `pageImageUrl` (same 200-DPI path) with `method=digital` bboxes from PDF word coordinates (percent-consistent); if bbox missing, show the rendered page with a right-aligned note “Exact coordinates unavailable — use the PDF text below” plus the raw text pane. No more silent iframe.
- **Photos**: same percent-box math (page_width/height from `assess_quality`), orientation note if `possibly_blurry`; coordinates trace to the original JPEG exactly (no crops/rotations ever applied).
- **Focus coupling**: selecting any row scrolls the viewer to the row's page and (when zoomed out) auto-zooms to the source region *only if* the region is smaller than 30 % of viewport; otherwise standard pulse.
- **Keyboard**: `g` page next, `G` page prev, `+/-` zoom, `f` fit, `t` toggle OCR text.

---

## 6. Component architecture

```
VerificationExperience (page)
├── VerificationHeader
│     ├── StepEyebrow (STEP 3 OF 4)
│     ├── EditorialHeadline (two-line Manrope 800)
│     ├── ReviewProgressRing (SVG, stroke-dash)
│     └── ReviewSummary (total · confirmed · attention · corrected)
├── SourceInspector (left column)
│     ├── SourceToolbar (filename · doc type chip · page nav · download · fullscreen)
│     ├── DocumentViewer
│     │     ├── ZoomableImage (200dpi pages / images) — object-fit contain, ref for zoom math
│     │     ├── SourceHighlight (bbox mark + pulse)
│     │     ├── OcrTextPane (line list, confidence shading, line↔bbox hover link)
│     │     └── MissingCoordinatesNote (digital, no bbox)
│     └── SourceLegend (chip: highlighted = selected result)
├── ReviewWorkspace (right column)
│     ├── FilterChips (All · Needs review · Out of range · Corrected · Confirmed)
│     ├── BulkActionBar (aria-live="polite", hidden at 0 selection)
│     ├── MeasurementTable (sticky header; tbody rows)
│     │     └── MeasurementRow (checkbox · name(+✎/••••) · page tag · value · ref · range · status dot · inspect button)
│     ├── SelectionBar (Confirm N · Inspect · Clear)
│     └── ContinueFooter (live counters + CTA + tiny honesty line)
├── InspectionPanel (overlay rail / bottom sheet)
│     ├── MeasurementHeader (name · page · confidence)
│     ├── ExtractedValueDisplay (large, result_original + unit)
│     ├── ComparisonGrid (value · unit · range · flag meaning)
│     ├── GhostOriginal (pre-edit value for review)
│     ├── CorrectionForm (3 fields + reason)
│     ├── FlagExplainer (lab_flag vs derived_flag vs reference — 3 bullet rows)
│     └── InspectActions (Confirm · Save correction · Leave unverified)
├── ReviewCompletion (route state, not modal) — summary + CTA + unverified list
├── StaleAnalysisNotice (conditional, if analysis stale after edit)
├── ToastHost (correction saved · selection confirmed · analysis re-run)
└── primitives: Button, Checkbox, Chip, Tooltip, Skeleton, EmptyState, ErrorState
```

File plan (when implemented — not now): `src/components/verification/` (14 files) replacing `VerificationPage.tsx` (~1 400-line screen). `src/lib/verification.ts` for derived selectors (attention = `needs_review` ∪ (`derived_flag≠within_range` ∧ `verification_status≠verified`)), `src/styles/verification.css` (all new styles), tokens untouched. A `measurement-model.ts` mirrors API types with `hasCorrections` (see §10).

---

## 7. Interaction & motion specifications

Durations: fast 160 · med 240 · slow 520 · ring 700. Easing: `--ease-out`, `--ease-in-out`. All gated behind `prefers-reduced-motion` (final renders jump to end state; ring becomes static).

| Interaction | Spec |
|---|---|
| Select checkbox | 160 ms: box fill lime, check draw (stroke-dashoffset 24→0, 160 ms), row tint shift, counter updates, SelectionBar slides up 240 ms spring(0.2) |
| Confirm selected (bulk) | button label morphs "Confirm 3" → "✓ Confirmed" (400 ms), rows flip status dot to ● with 180 ms stagger (30 ms apart), a thin lime sweep line crosses the footer counter; one toast |
| Row click → inspect | 240 ms right-rail slide (desktop) / sheet 320 ms with overshoot 1.05→1 (mobile); document pans to source, highlight pulse once |
| Save correction | fields collapse to summary row, row gains ✎ chip + status ◐ flips back to ○ (150 ms); dismissible amber banner: “Values changed — analysis is out of date until results are re-run” with [Review changes] link |
| Zoom | wheel-zoom anchored to cursor, 120 ms ease; buttons 160 ms; fit/2x presets |
| Completion | ring stroke 0→100 % (700 ms ease-out), three summary chips fade-stagger, CTA pulses once at 400 ms; no confetti (medical context) |
| Toasts | enter 200 ms, auto-dismiss 4 s, max 2 stacked |
| Skeletons | 14 h bars, shimmer 1.4 s linear infinite, reduced-motion = static |
| Page flip | document cross-fade 200 ms; bbox retargets 160 ms |

Focus-visible rings everywhere; color not used as sole signal (icons/dots + text labels).

---

## 8. Color, typography, spacing

**Color (existing tokens, used with intent):**
- Selection/confirmed: `--lime` wash (12 %) + `--lime-strong` ring; status dot `●` lime-filled.
- Needs review: `--warning-wash` row tint? No — keep rows neutral; needs review is indicated by an **amber outline dot** `◐` + amber chip "Needs review". Red reserved for critical laboratory flags only, never for OCR uncertainty.
- Critical flag: `--critical` dot + `--critical-wash` row (3 px left bar stays, but selection overrides tint exactly as it should — selection must always win: `box-shadow: inset 3px 0 0 var(--mint)` + `outline: 1.5px solid var(--mint)`).
- Document surface: `--surface` #fff with `--bg-deep` toolbar; page render gets `--shadow-sm` and a 1 px `--border-strong` frame.
- Text: ink `--ink` for values, `--muted` labels, `--muted-soft` metadata.
- Digit columns: `--font-mono` for Result values and ranges (numbers align), `tabular-nums`.
- Accent restraint: exactly one lime element per viewport region (primary CTA or progress ring — not both).

**Typography:** Manrope 800 for headline (34/38 desktop, 26/32 mobile), Inter 400/500 body (14/20), Manrope 600 small caps eyebrows (11/letter-spacing .12em), SFMono numbers (15/20 mono 600). Values are the visual hero; test names are secondary but scannable.

**Spacing:** 4 px grid. Page gutter 24/16; section gap 20; row 12/14; modal padding 20/24 desktop, 16 mobile.

**Radii:** keep `xs 6 · sm 10 · md 14 · lg 18`; new selection checkbox uses 4 px radius.

**Elevation:** no new shadows; reuse `--shadow-xs/sm/md`.

---

## 9. States (copy included)

1. **First opening** — skeleton (toolbar bar 40 h + ring + 8 rows); header copy visible immediately (no information gate).
2. **Normal review** — §3; counters live.
3. **Selected** — SelectionBar visible; Confirm = "Confirm 3 results" (never "Verify all"); count badge in tab title on mobile.
4. **Focused inspection** — §5.
5. **Editing** — fields with ghost original values above each input; inline validation messages (e.g. "Result must look like a number, e.g. 128 or <4.0"); [Cancel] never discards without confirming when changed (two-step only if dirty).
6. **Saved correction → re-verification** — row flips to `Needs review`; correction chip ✎ persists; banner: "These values are now different from the analysed ones. Run analysis again to refresh your results." (disappears after next analysis or is dismissible but re-appears on edit).
7. **Uncertain measurement** — detail panel secondary action “Leave unverified”; microcopy: “The value stays in your report as unverified. Analysis will exclude it from confirmed results.” This row shows `○ Unverified` afterwards (distinct from pre-review ○? Same glyph, same meaning — no duplication of state; the difference is post-correction vs pre-review only).
8. **Out-of-range (copied perfectly)** — banner inside panel: "Outside the reference interval (70–99). Being outside range is often medically expected — it does not mean this row is wrong. Check the number against the report." Coloured amber, not red. Red only for lab critical flags.
9. **All confirmed** — completion state §2/§9.11: ring 100 %, chips [All confirmed · Nothing corrected/⚑ N unverified], CTA “Continue to your results”.
10. **Some unverified** — same screen with amber chip "2 unverified — they won't be used for analysis" + checkbox "I understand" required before CTA (deep-link disabled until ticked); lists the 2 names inline.
11. **Large report (≈48 rows)** — filter chips sticky; virtualized tbody (react-window not installed — use CSS containment `content-visibility: auto` on rows via `.review-row { content-visibility: auto; contain-intrinsic-size: 64px; }` — no dependency); density toggle comfortable/compact (56/44 px); "x of 25 confirmed" pinned footer; page jump list (dropdown 1..N for multi-page).
12. **Digital / scanned / photograph** — toolbar shows doc-type chip (`Digital PDF`, `Scanned PDF`, `Photo`); digital without bbox: OCR/word-pane + note, no fake highlight; photo: page frame has 3° max corner radius + EXIF-invariant note "Coordinates refer to the original photograph, unmodified"; scanned: 200-DPI render with slight paper texture? No fake texture — flat, honest.
13. **Loading / error / unavailable source** —
    - Loading: §9.1; if image request 404s: inline error state in viewer: "Couldn't render this page — you can still review the values." + [Retry]; measurements remain usable (never block review on a broken preview).
    - Error: page toast + retry button; destructive path stays in viewer only.
    - Empty (no measurements): centred illustration (empty page glyph), copy: “We couldn't find any measurements in this report. The file may be too blurry or handwritten.” + [View OCR text] + [Try a different file] + analysis skipped — "Confirm results & continue" disabled with tooltip.
14. **Stale analysis** — amber banner above the table: "Measurements changed since analysis R3. Re-run analysis to refresh your results." [Review 2 changed rows] → scrolls + pulses those rows; after re-run, banner replaced by toast "Analysis re-run — results are up to date" (green, 3 s).

**Final completion screen** copy: “Review complete. 22 confirmed · 2 corrected · 1 unverified (excluded from analysis). Your measurements will now be compared with laboratory reference intervals — this is not medical diagnosis.” [Continue to your results].

---

## 10. Backend capabilities vs missing

**Capabilities that already exist (verified in code)**
- List measurements incl. page, source_bbox, OCR confidence, extraction_method, verification_status (`extracted`, `needs_review`, `verified`), derived_flag (`within_range|above_range|below_range|qualitative|unknown`) and lab_flag (as issued by the laboratory).
- Verify one; verify all in report (indiscriminate — see P1).
- Patch correction (3 fields + optional reason) → validation → audit row (`measurement_corrections`) → always `needs_review`; parsed numeric/qualifier/range recomputed; derived_flag recomputed.
- Analysis freshness by content fingerprint — any correction/edit invalidates prior analysis automatically.
- Extraction pages metadata incl. warnings; `pageImageUrl` renders any PDF page (200 DPI) — images served directly.
- Digital words bboxes; OCR line records with bboxes.

**Missing for the redesign**
| # | Need | Proposed | Size |
|---|---|---|---|
| M1 | **Batch verify an explicit selection** | `POST /reports/{id}/measurements/verify-selected {measurement_ids: […]}` → verify only those ids; response = `{verified: N}` ; keep verify-all-reviewed but it must not power this screen | S |
| M2 | **Corrected-state flag on measurements** | add `has_corrections: true` (and optional `correction_count`) on measurement DTO; computed by joining `measurement_corrections` in `get_measurements` — needed for the "Corrected" filter + count + row chip | S |
| M3 | **Correction read surface** | `GET /reports/{id}/measurements/{id}/corrections` (optional; only if audit timeline is wanted in the panel) | M |
| M4 | **Unverify (verified → unverified)** | `POST …/unverify` or `PATCH verification_status` restricted field — needed for "Leave unverified" after a mistaken verify; today unrecoverable except by editing | S |
| M5 | **Fast continue** | when zero fields changed, reuse latest analysis instead of creating a new run; or simply warn. Avoid duplicate `analysis_runs` on repeated clicks | S |
| M6 | **Analysis re-run affordance on verify page** (M5 covers most) | none | — |
| M7 | **Explicit selected-only bulk reject/flag** | not needed — leave unverified per row only | — |

Honesty notes: `verification_status` has exactly the 3 needed values; no new statuses needed. `derived_flag` enum is `within_range|above_range|below_range|qualitative|unknown`. No schema migration required for M1/M2/M4 (M2 is computed, not stored). Analysis freshness is content-fingerprint based and includes `verification_status`, so verification changes invalidate stale results as designed — and analysis consumes only verified measurements.

**Guards to enforce in implementation**
- Bulk confirm uses M1 only; M1 requires ≥1 id; ids not in report → 404; same idempotency semantics as verify.
- M2 join is read-only. M5 must still write a new run if the fingerprint differs.

---

## 11. Implementation requirements (when authorised)

**Frontend**
1. Replace `VerificationPage.tsx` with `VerificationExperience` + 14 components (§6); keep route `/app/reports/:id/verify`.
2. Keep `PageContainer`; add `--ve-*` prefixed classes in `src/styles/verification.css`; do not edit `phase8.css` classes that others still use (delete old `.verification-*` only after cutover).
3. Threading: new `src/lib/verification.ts` selectors; `ocrExecution`-style pure functions, unit-tested.
4. No new dependencies. Percentage-based highlights (reuse current `buildHighlightStyle` logic); zoom via transform on a `<div>` wrapper (no library).
5. Content-visibility for 40+ row lists; `scrollIntoView({ block: 'nearest' })` for selection jumps.
6. a11y: checkbox trio (input + styled span + label), aria-live region for counts, 2 px focus rings, 44 px targets.
7. Reduced motion via media query + JS matchMedia for the ring/timer.
8. All copy passes a reading-age check (≤ grade 8); no clinical jargon.

**Backend (§10)**
9. M1 endpoint + tests (explicit selection only; ignores non-selected; transaction-safe).
10. M2 computed field in `get_measurements` + tests; frontend type updated.
11. M4 endpoint (only if product wants the explicit "leave unverified after verify" path — required by §9.7 to be fully reversible; without it, corrections are the only recovery, which is acceptable and documented).
12. M5 reuse-fresh-analysis rule (no new run when fingerprint unchanged) + test.

**Non-functional**
13. Playwright QA covering all 14 states + 3 document types + 30-measurement fixture; screenshot suite; keyboard-only walkthrough; reduced-motion pass.
14. Keep analysis-engine behavior untouched; keep `accuracy_evaluator` fixtures untouched.

---

## 12. Phased implementation roadmap

| Phase | Scope | Size | Depends on | Exit criteria |
|---|---|---|---|---|
| **9.11.1 Foundations (BE)** | M1, M2, M4(optional), M5; unit tests; no UI | S–M | none | verify-selected e2e test green; analysis not re-run when unchanged |
| **9.11.2 Review workspace (FE)** | verification.css + Header ring/summary + ReviewWorkspace (chips, rows, selection bar, table) replacing old list; old source column kept as-is initially | M | 9.11.1 | 30-row fixture: select → confirm selected only; keyboard pass; lint/build |
| **9.11.3 Source inspector + inspection panel** | ZoomableImage + highlight + OCR text pane + line↔bbox hover + inspection panel + correction flow + leave-unverified + stale banner | M–L | 9.11.2 | digital/scanned/photo highlight QA incl. no-bbox digital; correction→needs_review→re-run loop demonstrated |
| **9.11.4 Completion & polish** | completion screen + unverified acknowledgement gate, skeletons/empty/error states, a11y pass, reduced-motion, large-report density toggle, Playwright matrix (14 states × 3 doc types) | M | 9.11.3 | full QA matrix passes; screenshot set; product review sign-off |
| **9.11.5 — optional hardening** | Virtualized rows if needed, audit trail panel (M3), analytics events (confirm/leave/edit counts, no PHI) | S–M | 9.11.4 | telemetry reviewed for privacy |

Risks & open questions: (a) M5 reuse-fresh-analysis changes `analyse_report` entry semantics — keep behind flag. (b) Bottom-sheet gesture conflicts with iOS scroll — use button-driven sheet, no swipe. (c) 30-row table performance on low-end laptops — measure before adding virtualization. (d) Unverified-set honesty (**verified against code**): analysis already excludes unverified measurements — only `verification_status == "verified"` rows with a `test_code` are analysed (Phase 4 eligibility, `analyse_report`). The completion copy may — and should — say unverified results are excluded from analysis. One gap remains: `extracted` and `needs_review` are treated identically as "not verified", which is correct and sufficient; do not add a fourth status.

**Stop here — no implementation was performed in Phase 9.11.0.**
