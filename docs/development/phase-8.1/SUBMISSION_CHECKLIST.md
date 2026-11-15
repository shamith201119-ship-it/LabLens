# LabLens â€” Submission-Readiness Checklist
> Classification: **Verified** Â· **Needs external hardware** Â· **Not yet verified** Â· **Blocked**
> Every "Verified" item carries a log in `docs/development/qa/full-product-audit/*.log` or equivalent evidence; nothing was verified by inspection of code alone.

## A. Core product flows

- [ ] Marketing site `/` loads, scrolls, hero animates after loader â€” **Verified** (landing 16/16 loader QA, 70/70 responsive sweep, 7 widths, 0 console errors)
- [ ] Welcome page `/app/start` â€” **Verified**
- [ ] Upload + consent (synthetic clean_digital_report.pdf) â€” **Verified** (upload â†’ verification workspace â†’ results; upload trace archived)
- [ ] Processing experience (live page-level progress, CPU pipeline) â€” **Verified** (Digital ~0.5 s; scanned suite included)
- [ ] Digital PDF extraction â€” **Verified** (1.0 recall/precision on synthetic fixtures; 12.0 kB results, see `ACCURACY_RESULTS.json`)
- [ ] Scanned multipage PDF OCR â€” **Verified** (OCR_text shows page text; highlight stays aligned during zoom)
- [ ] Photographed report OCR â€” **Verified** (aspect preserved; page marked photo; aligned highlights)
- [ ] GPU detection â€” **Verified** (correctly reports absent; code path never runs on this machine)
- [ ] GPU inference â€” **Needs external hardware** (PaddlePaddle has no CUDA on i3-1005G1; never measured; do not claim)
- [ ] Adaptive CPU runtime config â€” **Verified** (cpu_threads=4 / batch 1 evidence in `OCR_LAB_FULL_RESULTS.json`; 12 % wall clock with identical accuracy)
- [ ] Verification workspace (rows, filters, per-row inspect, zoom, focus order) â€” **Verified** (140/140, 20/20, 67/67, 70/70)
- [ ] Explicit "Confirm selected" bulk path (only selected rows verified) â€” **Verified** (140/140 Pass A/B)
- [ ] Inline measurement correction (Edited marker, re-verify, freshness invalidation) â€” **Verified** (140/140 Pass B + 29/29 backend tests, incl. freshness test isolated to temp DB)
- [ ] Partial completion + acknowledgement; acknowledgement verifies nothing â€” **Verified** (67/67 + 140/140; acknowledgement writes are double-checked to be absent)
- [ ] Full completion â†’ results â†’ clinician handoff â€” **Verified** (handoff visible only when analysis fresh)
- [ ] Analysis freshness (edit poisons result set) â€” **Verified** (140/140 Pass B; `test_phase9_9_2_analysis_freshness.py` 11/11)
- [ ] Results page â€” **Verified** render, including unverified-exclusion banner, withheld stale state, print styles
- [ ] Lab History + trend chart (verified-only eligible subset) â€” **Verified**
- [ ] Care navigation (Google Maps query only; no PII sent; registries listed) â€” **Verified**
- [ ] Clinician handoff print (`window.print`, filtered sections, provenance, freshness withholding) â€” **Verified** (letter-quality doc render; 67/67 includes handoff)
- [ ] Settings (motion preference, privacy honesty copy rewritten) â€” **Verified**
- [ ] 404 / not found / unknown report states â€” **Verified**

## B. Performance & loader

- [ ] JS bundle reduced 827 â†’ 639 kB raw (âˆ’23%) with route-level code splitting â€” **Verified** (build logs; gzip ~250 â†’ 207 kB)
- [ ] LCP 8,272 â†’ 684 ms on this machine (median of 3) â€” **Verified** (own LCP measurement harness, `phase9_11_6_perf.cjs`)
- [ ] CLS unchanged (0.0000) â€” **Verified**
- [ ] TBT 3,346 â†’ 367 ms â€” **Verified**
- [ ] Non-blocking font delivery with layout-stable fallback (`display=optional`) â€” **Verified** (CLS 0.0, FCP <1 s)
- [ ] Branded launch screen (cold, warm/cached, refresh, slow network, reduced-motion) â€” **Verified** (16/16 loader QA across 7 scenarios incl. CDP-throttled and reduced-motion)
- [ ] Intro animations wait for loader exit (hero, section rules) â€” **Verified**
- [ ] Route navigation never re-shows loader â€” **Verified** (client-side nav trace)
- [ ] Startup failure fallback (`StartupGuard`) â€” **Verified** (boundary exercised; renders reload affordance)
- [ ] Performance on a real mid-tier Android/iPhone â€” **Not yet verified** (headers report is this laptop's headless Chrome only)
- [ ] Performance on a fast office LAN with fonts CDN reachable â€” **Partially verified** (fonts were reachable during QA; CDN variance not characterised beyond this sandbox)

## C. Quality gates

- [ ] Lint clean (`npm run lint`) â€” **Verified**
- [ ] Typecheck clean (`tsc --noEmit`) â€” **Verified**
- [ ] Production build clean (`npm run build`) â€” **Verified**
- [ ] No console errors in any QA scenario â€” **Verified**
- [ ] No horizontal overflow at 360/390/768/1024/1280/1440/1920 â€” **Verified**
- [ ] Touch targets â‰¥44 px (checkbox, chip, row action, tab, CTA) â€” **Verified**
- [ ] Focus visibility, trap (sheet), restore-on-close (inspection, completion, rows) â€” **Verified** (incl. this phase's deterministic focus-restore fix at 1280 px, 140/140)
- [ ] Keyboard acknowledgement flow (completion gate + finish) â€” **Verified**
- [ ] Reduced-motion: animations disabled; loader skipped; app fully usable â€” **Verified**
- [ ] `scrollbar-gutter: stable` prevents scroll jumps â€” **Verified**
- [ ] Sheet spans full visual viewport at â‰¤860 px (100vw; stable-gutter) â€” **Verified**

## D. Process & environment honesty

- [ ] Dev database never touched (hash `1202e73eâ€¦` identical; 22 uploads; mtime 13 Nov) â€” **Verified**
- [ ] QA used a fresh temp DB on `:8001` (40 QA artifacts; all fixture uploads) â€” **Verified**
- [ ] Mid-phase external rebuild of `dist/` without `VITE_API_BASE=8001` â€” **Documented here**: discovered by this phase's QA (clicks reached `:8000` and failed); isolated-retry confirmed; dist rebuilt with correct env (`dist/assets/api-*.js` contains `127.0.0.1:8001`); no request to `:8000` succeeded and no data was written there â€” **Verified remediation**
- [ ] Benchmark fixture claims in marketing copy are synthetic-only â€” **Verified honest about synthetic status** in handoff/footnotes
- [ ] Demo does not imply medical power/safety claims â€” **Verified** (copy audit, Phase 9.11.6 Â§5)

## E. Not yet verified / blocked

- [ ] Physical device coverage (iPhone/Android/iPad) â€” **Not yet verified**
- [ ] Firefox and Safari â€” **Not yet verified** (Chrome/Edge engine only)
- [ ] Real NHS/hospital report files (real OCR at scale) â€” **Blocked** by consent process design; synthetic fixtures only by intent
- [ ] Clinical sign-off on explanatory content, pattern rules, reference intervals â€” **Not yet verified** (by design; catalogue and rules were never clinician-reviewed; see `LABLENS_INTELLIGENCE_AUDIT.md` Pattern-detection assessment)
- [ ] WCAG 2.1 AA audit â€” **Not yet verified** (focused keyboard/contrast checks pass; no third-party audit)
- [ ] Public deployment (hosting, domain, TLS, monitoring) â€” **Blocked** by out-of-scope dependencies (outside repo and outside this phase's permission)
- [ ] GPU inference on user NVIDIA hardware â€” **Needs external hardware**
- [ ] Upload by a true end-to-end user persona (not QA script) â€” **Not yet verified**
- [ ] Performance Lab/Lighthouse run against a hosted instance â€” **Not yet verified**
- [ ] Backend API under >1 concurrent upload â€” **Not yet verified** (no concurrency test; single-gun dev/QA stack)
- [ ] Data retention & deletion automation â€” **Not yet verified** (delete endpoints exist but are untested this phase; no schedule/policy tooling exists)

## F. Submission materials

- [ ] This report â€” **Done** (`docs/development/phase-8.1/SUBMISSION_READINESS_REPORT.md`)
- [ ] This checklist â€” **Done**
- [ ] Screenshots â€” the app contains loader (desktop/mobile), landing post-reveal, app shell, verification, completion, handoff under `docs/development/qa/full-product-audit/screenshots/phase9_11_6_*` â€” **Verified**
- [ ] Short recording of the 5-minute demo (Â§8 of report) â€” **Not yet verified** (assume record after Phase 9.12 if scope grows; acceptable to record now)
- [ ] README/demo abstract claims match this checklist â€” **Not yet verified** (out of scope of this phase)

---

**Rule of thumb:** no item on this list may be marked "Verified" without a specific artifact. Anything that requires another party or another machine stays "Not yet verified" or "Needs external hardware". Nothing is "Blocked" that could be fixed with available tools.
