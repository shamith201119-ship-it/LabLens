# LabLens Intelligence & Product-Readiness Audit
**Phase 9.12.0 — read-only audit, November 2026**

Author: Phase 9.12.0 audit (read-only). Prepared from the actual codebase at commit time of Phase 9.11.5 (`backend/app/**`, `src/**`, `artifacts/phase-8.1/**`), not from phase descriptions. No production code was modified, no OCR was run, no database was modified, no fixtures were uploaded, and no dependencies were added for this audit.

> Benchmark numbers cited below (`ACCURACY_RESULTS.json`, `OCR_LAB_REPORT.md`, `PERFORMANCE_RESULTS.json`) are **synthetic fixture-based engineering benchmarks, not clinical accuracy measurements** (this is the disclaimer stored inside the artifacts themselves). They are cited as evidence of engineering quality, nothing more.

---

## 1. Current intelligence architecture

### 1.1 Pipeline at a glance

```
Upload (POST /api/reports, consent timestamp recorded)
  → file validation (file_validation.py: magic bytes, extension/size limits)
  → EXTRACT (extraction_service.py):
      digital PDFs  → direct text/coords via pypdfium2 (text-layer path), no OCR
      scans/photos  → preprocess + PaddleOCR (CPU; PP-OCRv6 medium det+rec)
  → STRUCTURE (structure step): line parser + regex/unit parsing,
      test_dictionary.TEST_ALIASES (32 canonical names, normalized)
  → VERIFICATION GATE (measurement_service.py):
      every measurement starts 'extracted' → user explicitly confirms
      (verify_selected_measurements validates IDs atomically, rejects rejects
      wholesale without partial writes; corrections insert measurement_corrections
      audit rows and force verification_status back to needs_review)
  → ANALYSIS (analysis_service.py, engine phase4-deterministic-1.0,
      rule set phase4-rules-1.0):
      eligibility = verification_status='verified' AND test_code NOT NULL
      comparison vs printed reference interval (unit-aware, canonicalized units)
      pattern rules over required/optional measurement combos
      SHA-256 measurement fingerprint → analysis freshness current|stale
  → EXPLANATION OUTPUTS (explanation_service.py + catalogue/explanations.json v2.0)
      deterministic catalogue text, no model inference of any kind
  → LONGITUDINAL (history_service.py): per-biomarker observations across reports,
      verified+unqualified+numeric only; delta vs earliest observation
  → OUTPUTS: results overview, report-workspace explanation panel, printable
      clinician handoff (window.print), lab-history page with SVG trend chart
```

### 1.2 Database tables (all intelligence persists here)

`reports`, `extraction_jobs`, `page_extractions`, `report_measurements`, `measurement_corrections`, `analysis_runs` (engine_version, rule_set_version, summary JSON incl. `measurement_fingerprint`), `measurement_assessments`, `pattern_findings`. No explanation tables — explanations are computed on-demand from stored analysis + catalogue. No timelines/trends tables — history aggregates on-demand from `report_measurements`.

### 1.3 Intelligence layers, one line each

| Layer | Where | Deterministic? |
|---|---|---|
| Unit canonicalisation + dimensionally validated conversion | `analysis_service.py:21-104` | Yes (closed factor table) |
| Reference-interval comparison | `analysis_service.py:107-141` | Yes |
| Critical-flag detection | `analysis_service.py:162-167, 536-549` | Yes (lab-flag token match) |
| Pattern detection (26 rules) | `analysis_service.py:204-526` | Yes (required-status gate) |
| Measurement/pattern explanations | `explanation_service.py` + `catalogue/explanations.json` v2.0 | Yes (curated text) |
| Longitudinal trends | `history_service.py` | Yes (eligible subset, arithmetic deltas) |
| Analysis freshness fingerprinting | `_measurement_fingerprint` (analysis_service.py:169-200) | Yes (SHA-256 over analysis inputs) |

### 1.4 API surface for intelligence

`POST /analyse`, `GET /analysis`, `GET /analysis/history`, `GET /explanations`, `POST /reports/compare`, `POST /history/compare`, `GET /history`, `GET /history/biomarkers/{name}`, `GET /reports/{id}/pages/{n}/image` (page evidence). **No care-navigation or handoff endpoints exist** — both are client-side compositions of data already returned by the above. This matters: neither can leak beyond what the browser already holds.

---

## 2. Capability-by-capability assessment

### 2.1 Laboratory result interpretation (measurement cards & summary tiles)
**Where:** `ResultsOverviewPage.tsx` (tiles, grouped sections, `MeasurementResultCard.tsx`), `ClinicianSummarySection.tsx`.
**How:** Backend `_compare` (analysis_service.py:144-159) vs the lab's printed interval → `comparison_status ∈ {within_range, above_range, below_range, qualitative, unavailable, incompatible_units, review_required}`.
**Data:** value, unit, printed low/high, lab flag, derived flag, page.
**Evidence:** the stored extracted fields; status comes from them, not from the model when the lab printed a flag — the lab flag and the calculated status are kept separate and both shown ("flag comparison is the laboratory's; comparison status is ours").
**Limitations:** the UI labels the lab's printed flag (`lab_flag`) but the derived comparison is presented without explaining *which* source each line of text came from; reference ranges above/below printed "– 200" bounds are handled one-sidedly (`_resolve_comparison`, analysis_service.py:131-140).
**Understandability:** mostly good — values, ref ranges, Expandable card copy "Your result is above the reference interval printed by this laboratory."
**Explore vs diagnosis:** explicitly framed as behaviour-of-the-printed-range comparison, never as "healthy/unhealthy".
**Real value beyond extraction?** Yes — this is the core differentiator vs an ordinary OCR tool.

**Defects found (details in §8):**
- Tile semantics: "Total results" counts *all* measurements (including unverified/ineligible) while "Within range"/"Outside range" count *eligible only*. Partial verification yields Total=5, Outside=1 to a non-technical user with no qualifier. (ResultsOverviewPage.tsx:360-373, analysis_service summary :684-702.)
- "Analysis complete" badge renders unconditionally when freshness is `current`, even with 0 assessments — an empty eligibility set reads as success. (ResultsOverviewPage.tsx:322-324.)
- Unsupported (`test_code` NULL) but *verified* measurements silently disappear from every result surface. No user-facing "not supported by this analysis" affordance exists anywhere.

### 2.2 Evidence-backed explanations (Phase 5)
**Where:** `explanation_service.py` (1-awk line 190-236), rendered in `ExplanationsPanel.tsx` (report workspace) and partially in `MeasurementResultCard.tsx` (results page).
**How:** match `analysis.assessments[].test_name` (canonical) against `catalogue/explanations.json` `entries` (26 entries); for patterns, match `finding_code/rule_id` against `pattern_explanations` (26 entries). Catalogue text is static, versioned (`catalogue_version: 2.0`), and **not** generated by any model.
**Data:** the same comparison status + verification state the analysis produced.
**Evidence/sources:** each catalogue entry carries `sources` (id/title/publisher/url) rendered as external links. Entries always include `cannot_establish` and `possible_influences`, `context_factors`, `questions`.
**Limitations:**
- Coverage hole: canonical names present in `TEST_ALIASES` with **no** catalogue entry: `VLDL Cholesterol`, `Uric Acid`, `Chloride`, `Vitamin D (25-OH)`, `Vitamin B12`, `Thyroid Stimulating Hormone` — **6 canonical biomarkers** that verify, analyse and then silently vanish from explanations (explanation_service.py:197-199 skips uncatalogued tests with no fallback). The fallback plain-text path exists only for *pattern* gaps.
- Sources are generic references (ADA, ACC/AHA, ISH, KDIGO, etc.) with **no retrieval/version dates** and no claim about which exact guideline sentence supports which line of copy. They are plausible citations, not verified passages.
- `result_description` is a fixed 7-string lookup — same two sentences for every "above_range" everywhere (explanation_service.py:66-103). No situational nuance (which biomarker, how far above, concordant support).
- No provenance *link* from an explanation card back to the report page/bbox. Users cannot jump from "Hemoglobin is below range" to the highlighted pixels.
**Understandability:** readable; jargon-light; bounded claims.
**Value beyond extraction:** genuinely yes, but it delivers the same content twice in two surfaces (see §8.6 duplication).

### 2.3 Longitudinal intelligence (Phase 7)
**Where:** `history_service.py`, `/history` endpoints, `HistoryPage.tsx`, `TrendChart.tsx`.
**How biomarkers are grouped:** `test_name_normalized` equality (`TEST_ALIASES` canonicalization upstream). Cross-report identity otherwise relies on exact canonical match only.
**Units:** first-to-latest comparison only when `_norm_unit(first) == _norm_unit(latest)`; anything else reports "Observations have different units; direct arithmetic change not computed." (history_service.py:250-268). Unit-safe *conversion* (the machinery exists in analysis_service.py:85-104) is **not applied** in history — a confirmed gap, not a mistake, but it weakens trend claims for mg/dL↔g/dL cases (analysis handles conversion per-report; history reports only raw same-unit deltas).
**Variation vs signal:** **none.** No measure of ordinary within-person fluctuation, no reference spread, no comparison of in-range→in-range drift vs out-of-range→out-of-range drift. Only a min/max/threshold.
**Dates:** `sample_date` preferred over upload date, with provenance label shown (`date_provenance`), ASC ordering. **But** the SVG chart spaces points **by index, not by time** (TrendChart.tsx:62-67), so a 9-month gap and a 3-day gap look identical; this actively miscommunicates trajectory when labs are drawn at irregular intervals.
**Missing data:** silently omitted (eligibility filter upstream hides them); there is no "non-eligible observations exist" note in the trend view besides counts (`needs_review_count`/`eligible_count` are returned by the API and shown, but exclusions live under information hierarchy elsewhere).
**Reference band in chart:** none. The chart never renders the printed reference interval, so users cannot see "in range all the way" vs "hovering just above".
**Evidence preserved:** page numbers, report references, verification status per observation — yes (history_service.py:219-238).
**Value beyond extraction:** partial; the disclaimer copy is honest, but the intelligence ("what changed and is it drift or noise?") is not delivered.

### 2.4 Pattern & abnormal-result analysis (Phase 4 rules)
**Where:** `PATTERN_RULES` (analysis_service.py:204-526), 26 rules across CBC/glucose/lipids/liver/kidney; matched only against **eligible verified + supported** measurements.
**Reproducibility:** rules are pure functions; any required status that is `incompatible_units|review_required|unavailable|qualitative` cancels the rule (analysis_service.py:615). Evidence measurement IDs persisted per finding (pattern_findings table).
**Evidence links:** `evidence_measurement_ids` + `evidence_reference_ids` (pseudo refs like `page:2`) — present in storage; surfaced to the user only as names/values (ExplanationsPanel PatternCard shows measurement list; nothing links to the page image).
**Interpretation concerns:**
- Rule references carry professional-looking citations (e.g., "KDIGO Clinical Practice Guideline", "ADA Standards of Care") but with **no edition/year** — unverifiable provenance for the specific content.
- Pattern descriptions forbid diagnoses and always say "discuss with your healthcare professional" — consistent and safe.
- Findings **only fire for abnormal-required combos**; there is no "reassuring concordance" intelligence (e.g., verified Glucose+HbA1c both within range). A clean report yields zero findings and the results page presents an empty intelligence surface ("No assessments were returned" if nothing eligible, but *nothing* for a fully-normal-and-verified report except tiles).
- HbA1c text embeds "reflecting longer-term glycation over 2-3 months" — true and useful; but no entry encodes *which* fraction of sources said that (i.e., no per-sentence citation mapping).
- No rule combines abnormal with lab-stated `lab_flag` disagreement (e.g., lab says normal, calculated says above). That kind of evidence-conflict pattern — exactly the thing LabLens is positioned to surface — is not detected.
**Do these findings exceed the evidence?** No. They're deliberately conservative and print "not a medical diagnosis".
**False certainty risk:** low, but `CBC_ANEMIA_PATTERN` fires on *any* below-range Hemoglobin (s=it's presented as "may be worth considering together" — fine). A frank educational relation, not a probability claim.

### 2.5 Critical-flag surfacing
**Where:** `_is_critical` (analysis_service.py:162-167) — substring match `critical|crit|panic|critical value|critical finding` on `lab_flag`, case-insensitive. 
**QA:** flags computed on *eligible verified only* for the analysis path; the frontend handoff uses a *separate* patient-scope check across all measurements (ClinicianSummarySection.tsx:70-74) — two different implementations of the same predicate (substring search) that can disagree on edge cases ("critical if present anywhere, even unverified"). The handoff intentionally includes *any* critical flag even from an unverified row, which is the correct conservative direction; `ExplanationsPanel` critical section likewise. These are consistent in intent but duplicated in code (3 sites: analysis_service, explanation_service, ClinicianSummarySection).
**Value:** high and honest — one of the most useful things LabLens legitimately does.

### 2.6 Care navigation (`FindCareSection.tsx`, `lib/careNavigation.ts`)
**Where:** static category list + location string → `buildMapsSearchUrl()` (query-only Google Maps deep link); India-specific official registries (NMC, State Medical Council), eSanjeevani telemedicine portal, verification disclaimer, "no health data included" callout.
**Evidence-linkage:** **none, by design** — suggestions are not parameterized by results, and the privacy box explains exactly what is sent (keywords+city only).
**Appropriateness:** no urgency language, no treatment advice, no affiliation/endorsement claims, no pricing; explicit "LabLens does not independently verify providers" disclaimer.
**Gaps:** all resources are India-specific (mislabelled for non-Indian users); links to external government portals have no checking/date pinning; "consult online via eSanjeevani" invites users toward a service that — if introduced improperly in a demo — could look like referral monetization; it is not evidence-linked to the abnormality; there is no "urgent care" path for critical flags (correctly so, but un-signposted for users who need it more than they need a registry search).

### 2.7 Clinician handoff (`ClinicianSummarySection.tsx`)
**Print doc:** 6 sections (Overview counts; measurements table w/ comparison status + review state; supported patterns; educational explanations; discussion questions; personal notes) — plus stale-state withholding and print CSS with `no-print` controls.
**Strengths:** full measurement table with values/units/printed ranges/flags; critical-flag banner unsuppressed; pattern evidence IDs + limitations included; personal notes stay local-only and never transmitted (text area is purely client state).
**Serious gaps:**
1. **Provenance about corrections is missing.** The table shows `Original: …` only for *test-name* normalization changes. It does **not** show: whether a value was corrected by the user (has_corrections), what it was corrected *from* (measurement_corrections.original_payload), when, or why. A clinician reading the handoff cannot distinguish machine extraction from patient-edited transcription. For a tool whose whole premise is "extraction is imperfect — verify", omitting correction provenance undercuts the pitch to clinicians.
2. **No page provenance.** `page_number` exists on every measurement and is used throughout verification; the handoff table never shows it. A doctor cannot trace a value back to a source page in the printed doc.
3. **No freshness/integrity footer for history** — the printable doc carries upload date and generation date but not analysis run id/fingerprint/engine version; a printed doc cannot be tied back to a specific `analysis_runs` row. (`engine_version`/`rule_set_version`/`analysis_id` are returned by `/analysis` and simply not rendered.)
4. **No `sample_date` usage** — date of draw is a blood-science variable; the form shows only *upload* and *generation* dates.
5. The "what happened between verification and analysis" story (unverified rows withheld and by how much) is explained on-screen but not written into the printed document.
**Freshness handling:** when stale, comparison statuses, patterns, explanations, and questions are **withheld** and counts are suppressed, showing `Not current — re-run analysis` per row and an ANALYSIS OUTDATED banner. This is the correct behaviour and is verified by QA. However, the document offers no *positive* path inside print itself (no "this is a historical snapshot — re-generate before clinical use" front-page verdict, which is exactly what a clinician would want painted on the cover).

### 2.8 Stale-analysis protection
`_measurement_fingerprint` (SHA-256) is recomputed over every analysis input incl. `verification_status`; any edit, confirm or revert changes the digest; older runs remain but are strictly labelled stale with the reason "Measurements changed after this analysis was generated; re-run analysis." Re-analysis keeps history of all runs (`GET /analysis/history`). **This is a genuinely differentiated safeguard.** It is the single most honest mechanism in the product.

### 2.9 Verification acknowledgement flow (Phase 9.11.4)
Partial acknowledgement is honest by construction: ticking acknowledge writes nothing, unverified stay unverified and are excluded by the eligibility filter, and the finish button is gated on the acknowledgement. Verified by 140/140 final QA and 67/67 regression QA and 29/29 backend tests.

### 2.10 Comparison engine (`compare_reports`)
Consecutive-pair deltas per test name across two *specific* reports; absolute + percentage change, unit-normalization attempt with explicit `incompatible_units` fallback; disclaimer text is honest ("no trends are inferred from single data points"). No report-date semantics in ordering beyond `created_at` sort; no witness of analysis status; no reference-interval comparison (only raw deltas). UX placement is the report workspace (`ReportViewerPage` compare select), not lab history and not results.

### 2.11 Catalogue & content management
Single JSON file, versioned manually (`catalogue_version: 2.0`), no content pipeline, no translation hooks, no linting for banned claims, no per-field citation mapping. 26 measurement entries, 26 pattern entries. Coverage counted against `TEST_ALIASES` confirms exactly **6 canonical biomarkers lack any explanation** (set enumerated in §2.2).

---

## 3. Detailed explanation-quality audit

| Question | Finding |
|---|---|
| Generated from deterministic rules or other sources? | Deterministic catalogue; no LLM anywhere in the runtime. Good. |
| Are supporting measurements identified? | Yes for patterns (ids persisted + names/values rendered); **No** measurement URLs/links; no page links. |
| Can source provenance be followed from insight to report? | **No.** No jump path exists from any explanation to the page image or bbox. |
| Distinguish established fact from uncertainty? | Imitated — each card shows `cannot_establish` + limitations — but the uncertainty is **boilerplate per test**, not conditional on this measurement's margin (6.2 vs range 4.0-5.6 is "above" with identical copy to 5.61 vs same range). |
| Could different explanations contradict one another? | Low risk: single static catalogue, one text per test per state. Subtle conflict possible between pattern copy ("concordant elevation is important information") and a normal result when only *one* of the two is above (pattern won't fire — consistent). No contradiction detected. |
| Claims exceeding the evidence? | Minor: rule citations ("ADA Standards of Care") lack edition/date. No numeric medical claims are made by the product. |
| Educational vs diagnostic? | Educational, but "You have a concordant elevation" tone edges toward clinical *judgement phrasing* without adding clinical value (it adds a metaphtinguished band, not information). |

**Biggest explanation opportunities (deterministic, safe):**
1. **Why this deserves attention** in one sentence parameterized by *margin* and *concordance* (e.g., "This is the first time this value has been recorded above range" / "Blood glucose above range confirms the HbA1c finding").
2. **What changed** vs last verified result (reusing `compare_reports` machinery per-biomarker) — "HbA1c went 5.9 → 6.2 (+0.3). This isn't diagnosis; it continues the pattern from March."
3. **What to ask your doctor** — already present (`questions`) but deduplicated and contextual (not merely fixed per-test).
4. **What would change this finding** (deterministic: re-test conditions, fasting state, common medications) — catalogue already holds `context_factors`/`possible_influences`; surfacing them as "What should you rule out first?" doubles their utility with zero new medical claims.
5. **Provenance jump**: a per-card "View on the report" link → `/verify?page=N&measurement=ID` opens the verification view anchored to the evidence. This is the single biggest cheap win.

---

## 4. Longitudinal intelligence assessment (detailed)

**Grouping & identity** — `test_name_normalized` equality across reports; safe (no merges across families), but brittle — same concept under two aliases both mapping to one canonical is fine; the inverse is an *alias miss* that silently splits a biomarker timeline (e.g., "FBS" vs "fasting glucose" both → Glucose; OK).
**Dates** — `sample_date` preferred with provenance tag; ordering ASC; correct. **Spacing is by index** — wrong for irregular draws.
**Eligibility** — verified + numeric + unqualified only; explicit exclusions with reasons per observation — honest and correct.
**Units** — same-unit-only arithmetic; `_compare_pair` allows canonical conversion (mg/dl↔g/dl etc.) but `history_service.get_biomarker_history` **does not** use it for trend deltas — inconsistent between the two surfaces comparing the same two numbers.
**Signal vs noise** — absent entirely. `` → movement in either direction reads as "higher vs earliest" with no normalization for analytical variation or lot-to-lot range printing.
**Reference frame** — none in the chart; printed intervals change between laboratories and even between analysers at the same lab, and the product never says so in the frame of the data (it does say so in disclaimers, which is audit-trail honest but not *in situ* useful).
**Latest vs earliest** — trend delta = earliest → latest by eligibility order; a 10-observation series ignores the 9 intermediate points entirely for its headline.
**Evidence preserved** — page, report, verification status, filename; yes.
**Verdict:** genuinely better than average lab-report portals for *honesty* (missing data never hidden, no smoothing, no fake interpolation), but delivers almost nothing an attentive patient can't read off a printout — no reference band, no time axis, no previous-point comparison, no variation awareness, no abnormality timeline.

---

## 5. Pattern-detection assessment

**What works** (genuinely impressive):
- Closed universe of evidence: only verified + supported inputs; silence beats guessing — zero patterns will fire on bad/suspect data.
- Every fired finding is frozen into `pattern_findings.evidence_measurement_ids` with the rule version and engine version at fire time; reproducible from the row.
- `missing_context` is exposed per finding — the product tells you *what evidence would be needed to act* before asserting anything.
- Fail-quiet incompatible-unit guard (analysis_service.py:615).
- Rejection of diagnoses + universal "discuss with your clinician" framing — consistent and correctly calibrated.

**What's thin**:
- **26 rules**, nearly all single-organ-domain; **no cross-system interplay** (e.g., HbA1c × Triglycerides [metabolic-adjacent], Hemoglobin × Iron-ish stores pairs are fine as educational relations but absent); **no electrolyte/anion/osmolar patterns** though Sodium/Potassium/Chloride have catalogue entries and are eligible for analysis.
- **No absence-of-findings signal**: the headline intelligence ("no supported patterns") is never presented positively. Partially deliberate, partially polish gap.
- **No evidence-conflict rule**: Lab flag vs calculated status disagreement is a computable event (e.g., lab prints "H", calculation within range, or the reverse) and is currently silently discarded from the intelligence surface. For a "we check the lab's transcription" product, this is an *on-brand* miss.
- **No serial-pattern rule** (value crossed range boundary between two reports). The machinery exists (compare engine); it isn't wired into findings.
- **Rules are not date-pinned**; "reviewed" status strings exist but no reviewer identity/date enforcement.
**No finding fabricates support**; every description lists patient_context_needed. False certainty risk is low. *Increasing the number of medical claims to look intelligent would be an error; the next rules should stay this conservative (e.g., concordant-elevation vs reassuring-concordance) or be rejected.*

---

## 6. Care-navigation assessment

**What it is** — specialty-filtered Google Maps query (query-only), India-specific NMC/State-Council registries, eSanjeevani portal, privacy callout ("No report data…is ever included").
**Evidence-linkage** — none (safe; no pretend precision).
**Urgency language** — none (safe).
**Treatment instructions** — none (safe).
**Verification of credentials** — explicitly disclaimed (good); links rotated by official bodies; not date-pinned.
**Unsupported urgency** — absent; the critical-flag path routes to "contact your clinician or the issuing laboratory promptly" which is a care-appropriate absolute.
**Gaps** — geography lock (India); no detection of healthcare emergency surface (intentionally absent — fine for a tool not designed for triage); no link to the *specific* discussion this user needs (e.g., lipid pattern → could point to lipid clinics *as a search category only* — but margin scoring for this would require endorsement the product can't stand behind); typo rate on external URLs could silently dead-end the user.

**Verdict:** does not overclaim, does not manipulate; it is commodity-quality UX but honest. It is not (and should not be) a "care recommendation" engine.

---

## 7. Clinician-handoff assessment

**What's strong:** honest freshness semantics (withholding + banner), original-name preservation, unsuppressed critical banner, measurement table with per-row review status, pattern evidence + limitations printed, trade of explanation content you can read aloud to a clinician, print CSS already in place, personal notes never leave the browser, generation date + upload date.
**What undermines it as a professional artefact:**
1. **No correctness provenance** — no edited/original values, no correction timestamp or audit-trail reference. The clinician cannot tell a transcription artifact from a patient-edited value. *This is the single biggest credibility gap.*
2. **No source-page column** though `page_number` is universally available — the doctor can't say "page 2 shows 128" without the original PDF.
3. **No analysis-run identity** — no `analysis_id`, `engine_version`, `rule_set_version`, or fingerprint on the printed doc; no way to tie the document to the database row or to reputation/claims.
4. **No draw date** (`sample_date` exists on rows and is never printed).
5. **Exclusion ledger missing** — the printed doc does not state how many measurements were withheld from analysis and why (verified vs unverified), though the on-screen flow says so. A clinician seeing 1/5 assessed has no way to know the other 4 were deliberately excluded, not silently misread.
6. Explanations grid in print duplicates the report-workspace explanatory copy verbatim (it is the same catalogue, which is fine) but is opt-in; clinicians asked "what was excluded and why" is the question the doc can't answer.
7. Header says "LAB-lens"-style branding with **no medical-governance footer** (e.g. "Educational summary compiled by patient from their laboratory report; not for clinical decision-making without source review" is half-present, but "not for filing in an EHR" is absent — could be pasted into one).

**Measured positively: it is the best of the outputs and still not yet a "clinical conversation-preparation document"** — it is a clean educational reprint. Turning it into the latter is a *writing + layout* problem, not a new-dependency problem.

---

## 8. First-time-user journey problems

Trace: **Upload → Processing → Verification → Results → Explanations → Trends → Care nav → Handoff**

1. **Upload → Processing** — analysis is auto-run *before verification* (ProcessingExperience.tsx:302-303). This is harmless (Phase 4 eligibility will exclude everything until user confirms) but it means the user has already spent their one "analysis run" before seeing the document. No confusion results; analyses are re-runnable.
2. **Processing experience** — authentic page-level progress (not simulated), honest; on CPU hardware the photo path runs ~39-59 s (PERFORMANCE_RESULTS.json) — acceptable but must be communicated with care (it says it will be some time; good).
3. **Verification** — genuinely differentiated; choices clear (bulk confirm vs per-row edit). **Confusion:** after analysis runs pre-verification, users landing on results see "1/5 eligible" without ever being told *analysis was already run*. Not a bug, but a comprehension debt.
4. **Results page** —
   a. Tiles mix denominators (§2.1) — the single clearest comprehension defect in the product.
   b. "Analysis complete" unconditional success styling (§2.1).
   c. **Patterns are absent** — `ResultsOverviewPage` contains no reference to `findings`. A user with Glucose+HbA1c concordant elevation — the single best story in the catalogue — lands on results and *does not see it*; it lives two clicks away inside the report workspace's Explanation panel and inside the printable handoff.
   d. **Explanations live elsewhere** — full explanation cards are only in the report-workspace panel; results cards carry only status chips (still useful, but the same job in two places, with different verbosity).
   e. **No completion of the loop** — no results CTA says where to go next (print the summary? compare across reports? see the trend?). "Back to report workspace" is a small grey link (ResultsOverviewPage.tsx:307-310).
   f. **Within-range section is collapsed** — correct default for abnormal reports; but nothing says "X within range, no assessment shown because all normal" — the reassurance case (all verified, all normal) gets *zero* intelligence language.
   g. **Stale path** — honest wall with *one* CTA (open workspace). It should inline-restart analysis in place with a single button (the backend `POST /analyse` is idempotent and cheap); forcing a context switch to refresh results breaks the "one obvious next step" principle.
5. **Explanations (report workspace)** — correct but must be discovered by scrolling; expanded-by-default is off; the panel has no "2 new" hint connecting it to the verification.
6. **Trends** — chart truth but: index-spaced x axis, no reference band, delta flashes vs *earliest*, not previous. No CTA anywhere links to it (users must find "Lab History" in the nav; the sidebar is the only path from results).
7. **Care nav** — "Google Maps query" is fine; buried at the very bottom of results; never contextualized by the abnormal findings that justified the visit.
8. **Repeated information:** explanation boilerplate appears in two surfaces; findings appear only in handoff + workspace; freshness copy appears in results, handoff, explanations, completion — consistent, but wordy.
9. **Misinterpretation risks:** a non-technical user can read "1 Outside range" as "1 health problem" — needs "% of verified results outside the printed range" framing and explicit "this is not a health verdict" in the same block (not in a footnote a thousand pixels away).
10. **Users misread flags:** both "lab flag" and "LabLens comparison status" are shown without a one-line decoder; users cannot know which one the app acted on (it acted on *neither for eligibility* — it acted on verification state — but on the printed range for comparison).
11. **Verified-but-unsupported silent drop** (§2.1) — nothing on any screen says a measurement was excluded for lack of support.
12. **The ⭐ best moment** — the verification "Edited → needs review" loop and the stale invalidation — is currently visible only inside the report workspace. That is where the trust story lives, and it's off the critical path to results.

**Proposed information hierarchy for results (read-only recommendation):**

1. **Verdict first** — "5 verified · 2 above the printed interval · no critical flags" + one line of what LabLens did (compared to printed ranges, not diagnosis).
2. **Critical alert** (if any), unsuppressed.
3. **Needs attention** (outside range, worst-margin first) — already first.
4. **What this means** — the one-line educational sentence per abnormal card (expand on demand).
5. **What you verified** — explicit ledger: "3 of 5 verified · 2 excluded: 2 unsupported, 1 unreviewed" with jump links into verification.
6. **Patterns** — any fired/none ("No supported pattern across these results" is informative).
7. **What changed** — vs last verified report (previous absolute + %).
8. **Print for your appointment** — primary CTA, not footer link; print doc gains §7 rows.
9. **Trend** — link into history with the biomarker pre-selected.
10. **Care links** — surfaced under "Want to discuss?" with no urgency copy.
11. Within-range (collapsed by default, shown with count).
12. Unverified/unsupported disclosure (the honesty ledger).

---

## 9. Missing high-value capabilities — classification

| # | Capability | Status | Notes |
|---|---|---|---|
| 1 | Concise evidence-backed biomarker explainers | **Already implemented** | Catalogue + cards; see quality audit §3 |
| 2 | Meaningful report-to-report comparison | **Partially** | compare engine exists; hidden in workspace; not linked from results; deltas only |
| 3 | "What changed and by how much" | **Partially** | % + abs change available; trends show earliest→latest only; no previous-point display |
| 4 | Trending with variation awareness | **Partially** | eligible-subset only; no time axis, no reference band, no personal-baseline flag |
| 5 | Related-measurement context (concordance) | **Already implemented** | concordant patterns exist (Glucose+HbA1c, LDL+TG, ALT+AST, Crea+BUN) — biggest intelligent surface; hidden from results |
| 6 | Evidence links insight → report image | **Missing** | bboxes + page provenance everywhere except the explanation/results layer — cheap to add |
| 7 | User-friendly summary of verified results | **Missing** | verdict banner absent; totals mislabelled (§2.1) |
| 8 | Better appointment preparation | **Partially** | questions exist (in cards + print); no "what to bring/repeat/avoid before retesting" context; no freshness row |
| 9 | Missing-data / unit-consistency awareness | **Missing** in results surface (partial in trend chips) | QA has this — analysis limitations strings exist but are not rendered in results |
| 10 | Confidence & uncertainty anchored in evidence | **Partially** | catalogue says "cannot_establish"; no per-margin language; unverified pill exists |
| 11 | Edited-value provenance in handoff | **Missing** | correction audit exists, never printed |
| 12 | Reference band in trend | **Missing** (in scope: no new deps) | plain SVG rect; consistent with existing TrendChart |
| 13 | Date-axis trend scaling | **Missing** | linear time scaling; small change |
| 14 | Delta vs previous point | **Missing** | predecessor to calculate trivially |
| 15 | Reassuring-concordance finding | **Unsafe without evidence** | "normal pair" claims easy to write but need clinical sign-off; NOT recommended yet |
| 16 | Direction-of-change "improvement" assessment | **Unsafe** | must remain unstated; even "improving" is a clinical claim |
| 17 | Symptom triage / urgency interpreter | **Unsafe** | out of scope entirely |
| 18 | LLM-authored personalized explanations | **Requires external dependency + PHI policy** | contradicts local-first privacy guarantee; not necessary |
| 19 | External lab databases (reference ranges by lab) | **Requires external data** | currently user-printed ranges only (correct design — we must not substitute another lab's intervals) |
| 20 | Pinned guideline citations with snapshot dates | **Partially requires content work** | citation IDs + retrieval dates can be added to catalogue now; no new deps |
| 21 | Multi-analyte pattern rules (e.g., lipids+liver) | **Unsafe without clinician review** | allowed only after reviewed rules are written & provenance'd |
| 22 | Cross-lab comparable-unit trend conversion | **Partially implemented** (engine exists; history ignores it) | deterministic, low risk |
| 23 | Correction diff view in results ("you changed X→Y") | **Partially implemented** | audit rows exist; nothing renders original vs corrected side-by-side |
| 24 | Analysis-exclusion transparency banner | **Missing** | "2 of 5 were not analysed" — trivial change, high trust value |
| 25 | "Report quality summary" (extraction confidence by field) | **Partially** | OCR confidence suppressed by design (no confidence shown for digital; shown for OCR rows) — intentional; keep |

Nothing on this list fabricates support. Items 15, 16, 17, 18, 19, 21 require content/clinical governance that currently doesn't exist — flagged, not scheduled.

---

## 10. Safety and privacy findings

**Strengths (verified in code, not claims):**
- Local-first: `LABLENS_DATA_DIR`, WAL SQLite, no telemetry, no auth server, no external calls at runtime except user-clicked external links (care registries, Google Maps query, sources).
- File validation (`file_validation.py`) magic-byte + extension queueing before processing.
- SHA-256 content hashing on upload; consent timestamp recorded.
- Correction audit rows (`measurement_corrections` original/corrected payload + timestamp + optional reason).
- Fingerprint freshness: any mutation invalidates analysis; older runs remain labelled stale; current only ever describes the present fingerprint.
- Unverified/unsupported exclusion is *structural*, not UI-deep — ineligible rows never reach comparison.
- No logging surface for measurement values anywhere in `backend/app/**` (grep: no `logger.`/`print(` on medical data; OCR runtime logs only execution metadata).
- Frontend: no `console.*` of measurements in `src/**`.
- Personal notes: purely `useState`, never transmitted, intentionally clearable.
- Report deletion cascades FK rows (DB pragma foreign_keys=ON; delete endpoint for reports exists).
- Stale mode never shows analysis-derived guidance (verified by 9.11.5 QA, B-pass).
- Acknowledgement check does not write (Phase 9.11.4, 67/67).

**Gaps (all flagged, none fixed in this audit):**
1. **No access control.** Anyone with the machine and the port can `GET /api/reports/{id}/measurements`. Acceptable for a single-user demo on localhost; **not** for any multi-tenant deployment. The audit statement "your data never leaves this machine" is true today (loopback) but is an accidental property of deployment, not of design.
2. **At-rest plaintext.** Measurements, extracted text and corrections are plain SQLite + files — OS-level encryption absent. Recommend documenting as a deployment requirement, not storing differently.
3. **Citations lack retrieval dates**; pattern rule "reference" strings are unverifiable by a reader.
4. **Audit-chain integrity** for corrections relies on app-level consistency, not on any hash chaining; acceptable, but call it what it is.
5. **PII surface in QA artefacts**: this repo's QA uploads were synthetic 2026-11-10 Jane Doe fixtures — no real PII; but earlier real-user dev DB contains user-chosen uploads; offline screenshots exist under `artifacts/` — please keep that folder out of any public demo material.
6. **Handoff lacks review provenance** (§7.1) — a trust gap *and* a claim-integrity gap (the document cannot falsifiably tie itself to a specific verification state).
7. **No session timeout / screen lock** on results — the PDF print view leaks into it if left open; cosmetic, not a threat model change.
8. **`sample_date` is free text** — a malicious or mistaken date can order timelines nonsensically; the UI never questions obviously wrong dates (e.g., 1995, 2099).
9. **Explanations return external links** without `rel="noopener"` misuse — actually handled correctly (`noopener noreferrer`). Good.
10. **No export / "delete my data" path in UI besides report deletion in reports list** — deletion exists per report (`DELETE /reports/{id}`); nothing wipes the QA DB or the *user's* data remotely (correct).
11. **Analysis reference string leaks** — not patient data; fine.
12. **Duplicate critical-flag predicates** (three implementations, substring-based) — not a privacy issue; a drift issue: results treats handoff-critical differently from analysis-critical under edge spellings like "panic range" (all three check substring so they actually agree; drift risk noted for maintainability).

**Serious trust gaps requiring attention first:** §10.1 (access control), §10.6 (handoff provenance — it's also §7.1), §10.5 (artefact PII hygiene).

---

## 11. Hackathon evaluator perspective

**Genuinely technically impressive (demonstration-worthy):**
1. **End-to-end local trust pipeline** — OCR→bbox→verify→fingerprint→analyse, all local, reproducible, no hidden cloud. Few entries will have this depth end-to-end.
2. **Fingerprint-based analysis invalidation** — deterministically tie the health of any shown result to the exact verification state that produced it. Provably honest: edit a verified row and everything downstream poisons itself; revert and it heals. **This is the strongest 30-second demo.**
3. **Verification gate + exclusion honesty** — eligibility rules in `analyse_report` are structural, not a UI label.
4. **Freshness withholding in print** — the clinician document refuses to be used on stale data and says why per-row.
5. **Measurement-bound pattern engine** with frozen evidence IDs and explicit `missing_context` marketing honesty ("what we'd need to know").
6. **Date-provenance trends** with rejection reasons per observation (unused by charts but honest at API level).
7. **Verified benchmark artefacts** — `ACCURACY_RESULTS.json`: 6 fixtures, 29/29 measurements, 1.0 recall/precision **on synthetic fixtures**; `OCR_LAB_FULL_RESULTS.json`: CPU-tuned (cpu_threads=4, batch=1) 12% faster with bit-identical accuracy; `PERFORMANCE_RESULTS.json`: 0.46–0.58 s digital, ~39 s JPG photo on a 2-core i3-1005G1 @ 1.20GHz (no GPU present) — real hardware numbers.
8. **67/67 + 140/140 + 29/29** all-green QA evidence bound to the repo.

**Standard CRUD (weak with evaluators):** upload list, report library, search/filter, empty states, settings. Do not lead with these.

**What is differentiated every time:** verification gate, exclusion honesty, freshness fingerprint, acknowledgement flow, handoff withholding, measurement-bound pattern with `missing_context`.

**Synthetic / unvalidated (say it out loud):**
- All accuracy numbers are synthetic-fixture engineering benchmarks; **no clinical validation exists**.
- Photographed-report benchmark used one synthetic warped photo.
- “26 reviewed pattern rules" — "reviewed" is a status string, not an audit by a clinical board.
- No external lab has ever run its real report files through it.
- The app cannot detect lab error; it detects transcription error and standard-range comparisons.
- Explanations are deliberately shallow-safe; nobody should call them "medical advice".

**Credibility risks:**
- Any claim of "AI doctor" / "diagnoses" / "clinical-grade" — instant reject by judges who read the disclaimer wall.
- Yielding a fake "100% accuracy" headline without context — yields a correct but misleading headline; the artefact itself carries the honest disclaimer — use it verbatim.
- Demoing with a *pre-verified* report hides the product's entire value proposition.
- Showing the "Photographed report" flow badly (blurry, unverifiable) overclaims; use the same fixture gauntlet that has QA artefacts.

**Suggested demo narrative (verified functionality only, ~6 minutes):**
1. Open upload screen; upload `clean_digital_report.pdf` (2 s). Show consent timestamp + SHA256 in reports list.
2. Watch page-level OCR-free extraction progress (authentic, not simulated); analysis **automatically runs** and will show nothing eligible — point at the denominator.
3. Open verification; select HbA1c row; confirm **only it**; confirm selected (1).
4. Show results: **"Analysis complete"** with 1 eligible result — the honest counts; point at the unanalysed 4.
5. Edit the HbA1c value (6.2 → 6.0); announce → everything silently invalidates; land on `/results` shows **stale** with no guidance and **no handoff exit**.
6. Re-verify → analysis reruns (or is current) → results return; open clinician handoff; **Print**; the footer lists upload date + generation date (and, in the proposed Phase 9.12.x, edited provenance).
7. Open Lab History; pick HbA1c; show verified-only trend; exclusions visible; note the honest "units differ → Δ not computed" when a unit mismatch fixture is used.
8. Close with the QA numbers: 29/29 tests, 140/140 browser checks, 0 console errors, fingerprint invariants. No medical claims anywhere.

**Judges' bottom line should be:** "It refuses to lie to you in the product's own user interface." That is the sentence this product is built to deserve.

---

## 12. Ranked implementation roadmap (Phase 9.12+)

Ranked by user value ÷ effort, with safety first where violation would be fatal.

### Tier 1 — Quick, high-impact (1–3 sessions each, no engine changes)

1. **Results-page exclusion ledger & denominator truth.** Single line copy + tiles re-labelled ("5 measured · 1 verified & analysed"); hide "Analysis complete" badge unless freshness current; banner for unanalysed measurements with jump to verification. *Strengthens the honesty differentiator instantly; pure UI.*
2. **Handoff provenance rows.** Add per row: page number, edited-marker, and a footer block: `analysis_id`, `engine_version`, `rule_set_version`, fingerprint (truncated), `sample_date` per row. *Differentiates vs every competitor trying to wedge into clinical review.*
3. **Results stale → inline re-run button.** One POST to `/analyse` then refresh; removes the dead-end wall.
4. **Trends v2 (in-scope only):** linear time axis, reference band rectangle (from printed interval per point), previous-point delta callout. *Trend is currently the weakest feature nobody sees.*
5. **Per-explanation evidence jump link** — "View on report" anchors to `/verify?page=N&id=M` with the row pre-focused.
6. **Verdict banner + explicit good-state copy** for all-verified/all-normal reports ("No elevated results" is a message, not silence).
7. **Freshness chip on history list** — timeline already fetches `analysis_freshness`; render it on each report row so trends never silently rely on outdated runs.
8. **`catalogue_version` + `analysis_id` surface in print footer & results footer.**

### Tier 2 — Moderate (1–2 sessions each)

9. **Unit-safe trend conversion** — reuse `UNIT_FACTORS` in `get_biomarker_history` before declaring "units differ" (keeps limitation copy for what remains incomparable).
10. **Previous-vs-latest delta** in trend summary ("+25 mg/dL vs your previous verified result" rather than vs earliest).
11. **Markers for excluded observations** in chart (hollow dots + legend "excluded — unverified").
12. **Electrolyte/hepatic/renal adjacent pattern rules v1** — *only with clinical sign-off*; e.g., Na+K mass/concentration-irrelevance protections, ALT+AST+ALP trio (liver synthetic panel), Crea+eGFR concordance.
13. **Evidence-conflict finding** — lab flag vs calculated status disagreement surfaced as its own informational card (e.g., "lab flagged HIGH, calculation does not confirm — worth asking why"). On-brand, low risk, zero medical content added.
14. **Normal-range good-state and exclusion transparency** on handoff print as well.

### Tier 3 — Substantial engineering projects

15. **Per-measurement delta vs your own history** on the results page ("HbA1c 6.2 — previous verified 5.9 (Mar): +0.3 ↑"), with reference frame per report.
16. **Editor-level catalogue tooling** — per-sentence citation IDs, retrieval dates, banned-phrase lint (e.g., guarantees, treatment imperatives). No models.
17. **Verification hand-off export.** ICS-style appointment agenda PDF? No — instead: one-page "pre-appointment one-pager" print variant consisting of delta highlights + question list only.
18. **Insight engine extensions (tightly governed):** absence-of-findings positive copy; multi-analyte groups (lipids+liver) v2 after clinical review.

### Tier 4 — Do not build (or require other phases first)

19. Symptom→lab triage, treatment suggestions, dosage-adjacent copy, "AI assessment" framing, external clinical APIs, biomarkers beyond printed ranges, replacing lab-printed ranges with external reference databases, any automatic "improvement" verdicts, **any LLM network call containing report data** (breaks local-first privacy and cannot be proven accurate).

---

## 13. Recommended next phase — Phase 9.12.1: "Evidence You Can Hand Over"

Precisely scoped. **No new features, no engine changes, no dependency changes, no catalogue semantics changes beyond additions.** One goal: make the three output surfaces that claim to be *honest* actually carry the evidence that backs the claim.

**Scope (in order):**

**A. Results honesty (Tier 1)**
- Fix SummaryTile semantics: one "Measured / Verified / Analysed" trio; eligible only in "Analysed"; unanalysed count explicitly shown; amber for partially-analysed.
- Unconditional "Analysis complete" badge → render only when `freshness==='current'`.
- Exclusion ledger banner: "3 of 5 were not analysed (2 unsupported, 1 unverified) — why?" with CTA to verification.
- Reassuring empty-state copy (all verified, zero abnormal: "No elevated or lowered results").
- Below-fold CTA: "Print for your appointment" (primary) — links scrolls to `.handoff-section`.

**B. Handoff provenance (Tier 1)**
- Page number column in Section 2 table.
- "Original vs corrected" inline marker for corrected rows: `<del>6.2</del> → 6.0 (corrected 14 Jun, reason: mis-OCR)`.
- Footer block: `Analysis: <id> · engine phase4-deterministic-1.0 · rules phase4-rules-1.0 · catalogue 2.0 · generated <ts> · upload <ts> · sample date(s) shown per row`.
- Exclusion ledger summary at top of doc (mirror of results banner) — the clinician's first question is the one that doc currently can't answer.

**C. Trend v2 (Tier 1)**
- Linear time axis; reference band per point; previous-point delta; excluded-point hollow markers; footnote directives.

**D. Explanation evidence jump links**
- Each explanation card: "View on report" anchor; patterns card: "See pages 1–2"; no new routes — reuse `/verify?page=N&focus=<measurement_id>`.

**E. Catalogue completeness for existing canonical tests**
- Add the 6 missing entries (VLDL, Uric Acid, Chloride, Vitamin D (25-OH), Vitamin B12, TSH), keeping the catalogue's house style (`cannot_establish`, `sources` with note "Reference on file; edition unspecified — verify"). No new claim classes.

**F. Sidebar discoverability** — results page gets a single "Discuss with your clinician" CTA to `/history` and a single "Print appointment summary" CTA to handoff; removes the need to know where handoff/history live.

**Exclusions:** no new pattern rules, no units changes, no navigation changes, no auth, no exports beyond existing window.print.

**Exit criteria:** usage docs unchanged promise; 140/140 same-panel QA reruns green; 67/67 completion-regression green; 29/29 backend green; print artefact visually contains the new provenance footer with zero overflow at 1280/1440/360; demonstrate in one live run.

**Effort estimate:** ~2 focused sessions for A–D, ~1 for E–F; ~1 verification session.

---

## 14. Explicit list of limitations & unsupported claims

1. **No clinical validation.** LabLens has never been evaluated against real clinical workflows, judged by clinicians, or tested on real-world hospital report volumes. Everything labelled accuracy is a synthetic-fixture engineering benchmark (self-declared in `ACCURACY_RESULTS.json` and `OCR_LAB_REPORT.md`).
2. **No clinical-governance board.** "Reviewed" rules, catalogue content and copy were not signed off by a clinician; they are carefully written but not clinically ratified.
3. **No regulatory status.** Not a medical device; not an LDT; not cleared for diagnosis, triage, or treatment decisions anywhere.
4. **Benchmark accuracy is fixture-conditioned.** 1.0 recall on 6 synthetic files is excellent engineering hygiene and nothing else; real-world handwriting, multi-column layouts, non-English reports, faxes, and thermal-print degradation remain unmeasured.
5. **GPU inference path is untested.** Hardware absent on the development machine; CPU fallback and its 12% tuning gain are real and measured; GPU claims are unknown.
6. **Citations are unverified** — catalogue and pattern rules reference guideline bodies without edition/retrieval date; supplying them is Tier 2 work, not a silent fix.
7. **Reference ranges are the lab's own, only.** LabLens does not normalize against population intervals and explicitly should not; drift between laboratories is real and unaddressed (disclaimered only).
8. **The comparison engine verifies transcription, not biology.** A verified row still requires clinical context that LabLens neither has nor seeks.
9. **Freshness is honest but blind.** Any measurement/state change marks analysis stale even if clinically irrelevant to the affected biomarker (e.g., editing a *different, unrelated* biomarker invalidates shared analysis runs) — deliberate and correct, but a coarser blast radius than ideal.
10. **No accessibility audit of the print output** exists (print CSS is present; screen-reader-on-print is untested).
11. **Local-only means machine-bound** — analyses and corrections live in one SQLite file on one disk; loss of the machine loses the history; no export exists. This is the cost of the privacy guarantee and should be documented publicly, not hidden.
12. **The audit can't see what users actually do** — no telemetry exists (deliberately); usage claims about "what users misread" in §8 are inferred from the code's communication design, not observed sessions.
13. **Photo benchmark** used a single synthetic warped image; nothing in this audit validates behaviour on genuinely glare-shifted, rotated, folded documents.
14. **India-first care links** are where they are because LabLens targets an Indian healthcare buyer; nothing generalizes them.
15. **None of the "AI" claims in marketing copy should survive this document** — LabLens is a deterministic pipeline with excellent honesty machinery and no generative component. That is a feature; keep it that way.

---

### Appendix A — Key source locations (for implementers)

- Fingerprint & freshness: `backend/app/services/analysis_service.py:169, 736, 880, 897`
- Eligibility gate: `analysis_service.py:557-560`
- Unit canonical rules: `analysis_service.py:20-104`
- Critical-flag predicates (3 sites, keep in sync): `analysis_service.py:162`, `explanation_service.py:56`, `ClinicianSummarySection.tsx:70` + `ClinicianSummarySection.tsx:284`
- Handoff gaps (§7): `src/components/ClinicianSummarySection.tsx` (Section 2 table ≈ lines 267-329; print footer ≈ lines 415-423)
- Trend limits: `src/components/TrendChart.tsx:62-118` (index axis, no reference band)
- ExplanationsPanel duplication: `src/pages/ReportViewerPage.tsx:610` vs `src/components/MeasurementResultCard.tsx`
- Results tiles/denominators: `src/pages/ResultsOverviewPage.tsx:358-383`
- Catalogue: `backend/app/catalogue/explanations.json` (v2.0, 26/26 entries)
- Missing canonical coverage: `backend/app/services/test_dictionary.py:74-81` vs `explanations.json` `entries`

### Appendix B — QA evidence already bound to this codebase

`ACCURACY_RESULTS.json` (2026-11-12): 6 fixtures / 29 measurements / 1.0 recall & precision (synthetic). `OCR_LAB_FULL_RESULTS.json` (Phase 9.10.1, this machine): CPU tuned 4 threads/batch 1, 162.0→142.5 s five-category wall clock, accuracy bit-identical. `PERFORMANCE_RESULTS.json`: digital 0.46–0.58 s; JPG photo 38.97 s on i3-1005G1. Phase 9.11.5 browser verification: 140/140 (+67/67 completion regression, +20/20 inspection regression). Phase 4/5/6/7/9-test suites: 29/29 focused pass on isolated DB (see Phase 9.11.5 run log). Ekspermentálně: GPU path untested.
