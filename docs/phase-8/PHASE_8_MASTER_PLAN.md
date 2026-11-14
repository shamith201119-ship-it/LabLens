# Phase 8 — Complete UX Redesign — Master Plan

## Vision

Transform LabLens from a technically-working but developer-centric multi-panel application into a **coherent, premium, guided laboratory-report experience** that feels like a trusted companion for understanding health data.

**Tagline:** "Your lab report. Finally, in plain language."

---

## User Journey (A → Z)

```
/ (Welcome)
  → "Analyse a report" CTA
  → /app/upload (Guided Upload + Consent)
  → ProcessingExperience (Upload → Extract → Structure → Ready)
  → /app/reports/:id/results (Results Overview)
  → Expandable measurement cards with explanations
  → Clinician follow-up guidance
  → /app (Dashboard for returning users)
```

---

## Screens

### 1. Welcome Page (`/`)
- Replace existing LandingPage with minimal editorial welcome
- Headline: "Your lab report. Finally, in plain language."
- Two CTAs: "Analyse a report" → `/app/upload`, "Open dashboard" → `/app`
- Warm off-white background, forest green type, premium restraint
- Simple SVG document-to-insight illustration
- Mobile first (360px)

### 2. Guided Upload (`/app/upload`)
- File drag-and-drop → filename/size/type preview → consent → "Start analysis" CTA
- Reuses `FileDropzone`, `FilePreview`, `validateFileSelection`, `uploadReport()`
- After upload: transitions to ProcessingExperience IN PAGE (no route change)
- Consent semantics: unchanged from existing

### 3. ProcessingExperience Component
- **State machine:** `idle` → `uploading` → `extracting` → `structuring` → `ready` | `failed`
- 4 visual stages (CSS + SVG, NO Three.js):
  1. **Uploading:** "Sending your report securely" — document rise animation
  2. **Extracting:** "Reading your report" — scanner line, text appearing
  3. **Structuring:** "Organising your results" — lines becoming table rows
  4. **Ready:** "Your results are ready" — confirmation with CTA
- Bound to REAL API: upload → `POST /api/reports/{id}/extract` → poll `GET /api/reports/{id}/extract/status` → `POST /api/reports/{id}/measurements/structure`
- Handle error, timeout, partial completion
- NO fake timers, NO mocked progress

### 4. Results Overview (`/app/reports/:id/results`)
- Route: new child route under AppLayout
- Headline: "Your report, explained."
- Overview counts from actual Phase 4 data: within range, outside range, needs review, critical flags
- Three sections: Within Laboratory Range | Outside Laboratory Range | Needs Review
- Critical flags displayed prominently with alert styling
- Each measurement card: test name, result, unit, reference interval, status badge, one-sentence explanation
- Expandable "Understand this result" (Phase 5 catalogue via ExplanationsPanel patterns)
- Uses: `getAnalysis()`, `getExplanations()`, `listMeasurements()`
- NO health scores, NO disease predictions, NO arbitrary percentages

### 5. Clinician Follow-up (embedded in Results)
- "What should you do next?" section at bottom of results
- Three outcome types: Critical → contact immediately; Findings → discuss; No concerns
- Reuses `FindCareSection` and `ClinicianSummarySection` from Phase 6

### 6. Completion / Summary (at end of results)
- "Your report is ready." callout
- CTAs: Prepare for appointment, Find care, View full history

### 7. Dashboard Simplification (`/app`)
- "Welcome back." heading
- "Your laboratory reports, all in one place."
- Quick links: Continue latest report, My reports, Lab history, Find care
- Remove outdated Phase 1 placeholder content

---

## Backend Integration Plan

No new backend routes needed. All existing endpoints reused:
- `POST /api/reports` — upload
- `POST /api/reports/{id}/extract` — trigger extraction
- `GET /api/reports/{id}/extract/status` — poll status
- `POST /api/reports/{id}/measurements/structure` — structure
- `GET /api/reports/{id}/measurements` — list
- `POST /api/reports/{id}/analyse` — run analysis
- `GET /api/reports/{id}/analysis` — get analysis
- `GET /api/reports/{id}/explanations` — get explanations (Phase 5)

---

## Medical Accuracy Rules

1. All explanations come from Phase 5 curated catalogue only
2. No AI-generated medical commentary
3. No health scores or risk predictions
4. Critical flags: always show "contact your healthcare professional" language
5. "Educational purpose only" disclaimer on every results screen
6. Reference intervals shown are laboratory-provided, not population norms

---

## Design System

See `PHASE_8_DESIGN_SYSTEM.md`.

---

## Acceptance Criteria

- [ ] Welcome page renders at `/` with two CTAs working
- [ ] Upload flow at `/app/upload` accepts file, validates, shows consent, submits
- [ ] ProcessingExperience shows real API progress (not fake timers)
- [ ] Results page at `/app/reports/:id/results` shows real analysis data
- [ ] Measurement cards with explanation expansion work
- [ ] Critical flags displayed prominently
- [ ] Clinician guidance section present
- [ ] Dashboard simplified
- [ ] All Phase 1–7 existing routes still work
- [ ] `npm run typecheck` → exit 0
- [ ] `npm run lint` → exit 0
- [ ] `npm run build` → exit 0
- [ ] `cd backend && py -3.12 -m pytest -q` → 126 passed
