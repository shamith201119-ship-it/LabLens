# LabLens Phase 1.5 — Premium Motion & Composition Report

## Scope delivered

Phase 1.5 elevates the approved Phase 1 LabLens site into a premium, editorial
healthcare experience while preserving every Phase 1 route, honesty boundary
(`PROCESSING_AVAILABLE = false`, `REPORT_STORAGE_AVAILABLE = false`), and the
ivory/forest/lime/mint identity. No auth, OCR, analysis engine, backend, fake
patient records, fake results, mock APIs, or removed functionality were added.
All sample content remains explicitly synthetic/illustrative.

## Packages added

| Package | Version | Purpose |
|---|---|---|
| `lenis` | 1.3.27 | The only smooth-scroll library (marketing pages only) |
| `gsap` | 3.15.1 | Section storytelling, ScrollTrigger pinning, hero timeline |
| `@gsap/react` | 2.1.2 | `useGSAP` lifecycle integration with React Strict Mode |

Existing dependencies reused: `motion` (Framer Motion) for UI interactions,
`lucide-react` for iconography, `react-router-dom` for routing.

## Sourced / adapted components

- `src/components/landing/SmoothScroll.tsx` — single Lenis instance integrated
  with the GSAP ticker and `ScrollTrigger.update()`. Adapted from the Lenis +
  GSAP recommended integration pattern (one animation loop, no competing rAF).
  Adds anchor interception, history pushState, font/load/resize refresh, and
  Strict-Mode-safe cleanup.
- `src/components/landing/Hero.tsx` — GSAP timeline with clipped line reveals,
  staged copy, report entrance, row stagger, SVG connector draw, insight-card
  depth, and fine-pointer parallax via `gsap.quickTo`.
- `src/components/landing/HowItWorks.tsx` — five-stage pinned ScrollTrigger
  story (raw report → structured measurements → understanding → context/evidence
  → informed follow-up) with a mobile/reduced-motion stacked fallback.
- `src/components/landing/BiomarkerExplorer.tsx` — accessible tablist
  (Arrow/Home/End keyboard support) with an animated reference-range bar and
  marker; Vitamin D / Ferritin / TSH sample data (values never change).
- `src/components/landing/Capabilities.tsx` — varied 7/5 and 5/7 feature
  composition with distinct measurement/evidence/history/follow-up visuals.
- `src/components/landing/Understanding.tsx` — explorer plus a three-principle
  editorial strip.
- `src/components/landing/SectionRule.tsx` + `src/pages/LandingPage.tsx` —
  reusable animated divider and global section-rule GSAP animation.
- `src/lib/motionEnvironment.ts` — shared reduced-motion / fine-pointer helpers.
- `src/styles/phase15.css` — Lenis CSS, hero, story, explorer, product, rules,
  app micro-interactions, responsive rules.

## Licence checks

- `lenis` 1.3.27 — MIT.
- `gsap` 3.15.1, `ScrollTrigger`, `@gsap/react` 2.1.2 — GSAP standard
  "No Charge" license. Core + ScrollTrigger are free to use; no Club GSAP
  (member-only) plugins were imported.
- `motion` (Framer Motion) — MIT.
- `lucide-react` — ISC.
- `react`, `react-dom`, `react-router-dom` — MIT.

## Animation sequences

**Hero (desktop, motion allowed):** clipped line reveals (3 lines, stagger 0.09,
1.05s) → eyebrow/description/actions/assurance fades (0.62s, stagger 0.085) →
report visual entrance (0.92s) → row stagger (0.45s, stagger 0.07) → SVG
connector draw (0.9s) → insight-card reveal (0.72s). Fine-pointer parallax via
`quickTo` (0.55s). Reduced motion / touch: all skipped, content visible.

**Five-stage story (pinned, `min-width: 1024px`, motion allowed):** ScrollTrigger
scrub 0.65 over 3100px. Panels crossfade with a 0.24s overlapping window so no
blank frame. Per-stage internals: raw rows settle (0.5s, stagger 0.08), reference
bands (0.5s, stagger 0.08) + markers (0.38s), explanation rows (0.38s, stagger
0.1), evidence path draw (0.72s), follow-up items (0.38s, stagger 0.1). Mobile /
reduced motion: no pin, all five panels stack with their own headings.

**Section rules:** `scaleX` 0 → 1 over 1s as each rule enters the viewport
(`once: true`). Skipped under reduced motion.

**Biomarker explorer:** marker and band animate via CSS transitions (0.45–0.52s);
explanatory panels fade in (0.28s, staggered) on tab change. Tablist supports
Arrow/Home/End.

**App micro-interactions:** page-container children rise (0.48s, staggered),
sidebar active transitions, button/card/file-drop hover, segmented control press,
focus rings. All respect the reduced-motion overrides.

## Lenis integration details

- Single instance, created in `SmoothScroll`, driven by the GSAP ticker
  (`autoRaf: false`, `gsap.ticker.add`).
- `ScrollTrigger.update()` called on Lenis scroll; `ScrollTrigger.refresh()` on
  load/fonts/resize and route change.
- Skipped entirely for reduced motion and coarse/touch pointers (native scroll).
- Anchor links intercepted for smooth in-page scrolling with history pushState.
- Cleanup removes the ticker, destroys Lenis, reverts classes, and refreshes
  ScrollTrigger (Strict-Mode safe).

## Routes tested

| Route | Status |
|---|---|
| `/` | Pass — hero, story, explorer, product, all sections render; no console errors |
| `/app` | Pass |
| `/app/reports` | Pass |
| `/app/reports/new` | Pass — file validation + preview + clear work |
| `/app/reports/preview` | Pass |
| `/app/reports/:reportId` (unknown) | Pass — unavailable state |
| `/app/settings` | Pass — motion preference toggle sets `data-motion` |
| 404 (`/this-page-does-not-exist`) | Pass |

Additional checks: Lenis anchors/history/refresh, pin release on all five story
checkpoints (each shows exactly one panel at opacity 1.00), biomarker keyboard
tabs (ArrowRight moves focus + selection), mobile 360/390 no horizontal
overflow, reduced-motion full page renders all content (opacity 1), app routes
at mobile + reduced motion with 0 console errors.

## Performance observations

- Production build: JS 652.45 kB (gzip 209.59 kB), CSS 121.38 kB (gzip 21.49 kB).
- Animations use transform/opacity only; no WebGL, no heavy blur/shadows beyond
  the existing tokens.
- `Reveal` uses `whileInView` with `once: true` (IntersectionObserver) so
  off-screen sections are not animated.
- ScrollTrigger uses scrub 0.65 and `invalidateOnRefresh`; pin only at
  `min-width: 1024px`.
- Lenis disabled on touch/reduced-motion devices; native scroll retained.
- Cleanup on unmount prevents duplicate instances and Strict-Mode leaks.

## Remaining issues / follow-ups

1. Vite warns the JS chunk exceeds 500 kB. Code-splitting the landing page
   (lazy GSAP/Lenis) would reduce first-load cost on low-end devices; not
   required for correctness.
2. The five-stage story pin spans ~3100px (~3.5 viewport heights). Could be
   shortened if user testing shows fatigue.
3. Hero entrance uses a one-frame flash of visible content before GSAP hides it
   (no CSS pre-hide, to avoid conflicting with GSAP's transform). Negligible.
4. In-app motion preference changes after mount do not re-run GSAP on the
   landing page; navigating fresh applies the preference. Acceptable for a
   preview.
5. No automated visual-regression suite; QA was performed with Playwright
   screenshots and DOM metrics.
6. GSAP's "No Charge" license should be reviewed before any commercial
   redistribution of the built bundle.
