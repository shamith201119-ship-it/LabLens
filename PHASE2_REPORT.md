# LabLens Phase 2 — Editorial Motion & Reading Chrome Report

## Scope delivered

Phase 2 turns the Phase 1.5 site into a denser, more designed editorial
experience: a longer composition, three distinct motion bands, a reading index,
a translation comparison, honest preview counts and a closing manifesto. Every
Phase 1 route, honesty boundary (`PROCESSING_AVAILABLE = false`,
`REPORT_STORAGE_AVAILABLE = false`), and the ivory/forest/lime/mint identity are
preserved. No auth, OCR, analysis engine, backend, fake patient records, fake
results, mock APIs, or removed features were added. All clinical content remains
explicitly synthetic and labelled as such.

No new runtime packages were added in Phase 2. The work reuses the existing
`lenis` 1.3.27, `gsap` 3.15.1, `@gsap/react` 2.1.2, `motion` 14.10.1,
`lucide-react` 1.70.0 and `react-router-dom` 7.18.5 stack.

## Section order

```
Hero
TrustStrip
Problem
ReaderMarquee        ← new editorial motion band
HowItWorks           ← preserved pinned five-stage story
TranslationLayer     ← new comparison slider
ProofNumbers         ← new honest inventory
Capabilities
Understanding        ← contains ContextField
Timeline
Preparation
Safety               ← lime boundary ticker
Manifesto            ← new closing statement
FinalCta
Footer
```

## New components

| Component | File | Role |
|---|---|---|
| `ScrollProgress` | `src/components/landing/ScrollProgress.tsx` | 2px reading-progress line, one passive scroll listener + one rAF |
| `SectionIndex` | `src/components/landing/SectionIndex.tsx` | Retired in the latest hero pass — no longer mounted; file retained for reference |
| `ReaderMarquee` | `src/components/landing/ReaderMarquee.tsx` | Five-movement editorial ribbon; offscreen pause, static under reduced motion |
| `TranslationLayer` | `src/components/landing/TranslationLayer.tsx` | Scroll-introduced raw/plain comparison with a real range control |
| `ProofNumbers` | `src/components/landing/ProofNumbers.tsx` | Count-up inventory (`01 / 05 / 03 / 00`) of what the preview contains |
| `Manifesto` | `src/components/landing/Manifesto.tsx` | Scroll-lit statement, lens diagram, four product principles |
| `ContextField` | `src/components/landing/ContextField.tsx` | Scroll-linked field of twelve context chips, replacing a third autoplay marquee |

Supporting changes:

- `SectionHeading` now splits headings into masked words, triggers the reveal on
  the real `motion.h2` (not the clipped spans), exposes `aria-label={text}`, and
  restores word spacing with `margin-right: 0.22em`.
- `Hero` gained a spotlight, a ghost specimen label, two source/range
  annotations and a scroll cue. The cue is now a delayed CSS animation, so a long
  GSAP timeline can never leave it hidden.
- `Capabilities` gained card spotlights, ghost numerals and a scroll-drawn
  thread connecting the four capabilities.
- `Timeline` gained a sparkline and a drawn track.
- `FinalCta` gained a clip-path/scale entrance and a step strip.
- `Footer` gained a lime top border, a back-to-top link and a giant outlined
  wordmark.
- `SectionRule` gained a centre dot that scales in with the rule.
- `src/styles/phase16.css` holds all Phase 2 composition, responsive,
  hover/focus, reduced-motion, offscreen-pause, dark-index and closing states. It
  is imported after `phase15.css` in `src/main.tsx`.

## Sourced patterns and licences

Patterns were adapted, not copied. No Aceternity, Magic UI or React Bits source
files were vendored into the repository; everything was re-implemented in the
existing vanilla CSS / GSAP / Motion stack.

| Source | Licence | Pattern adapted |
|---|---|---|
| Magic UI | MIT | Ribbon marquee (ReaderMarquee), number ticker (ProofNumbers), reading-progress bar |
| React Bits | MIT + Commons Clause | Scroll-lit word statement (Manifesto), split-word heading reveals |
| Aceternity UI | Custom Aceternity License | Spotlight cards, ghost numerals, comparison slider, pinned scrollytelling composition |
| GSAP + ScrollTrigger + `@gsap/react` | GSAP standard "No Charge" license | Pin, scrub, quickTo, scroll-triggered timelines |
| Lenis | MIT | Single smooth-scroll loop on the landing page |
| Motion (Framer Motion) | MIT | In-view reveals and app micro-interactions |
| Lucide | ISC | Icon set |
| React / React DOM / React Router | MIT | Application framework and routing |

The Aceternity License is a custom commercial licence, not MIT. The free tier
permits personal and commercial project use, but the terms should be reviewed
before redistributing the built bundle as a template. No GSAP Club (member-only)
plugins are imported.

## Animation sequences

**Hero (desktop, motion allowed):** masked line reveals (3 lines, stagger 0.08,
1.0s) → eyebrow/description/actions/assurance fades (0.55s, stagger 0.07) →
interactive translation demo entrance (0.85s) → plain-language word stagger
(0.5s, stagger 0.03). Fine-pointer: a spotlight glow follows the cursor, the
primary CTA pulls toward the cursor within 150px (magnetic), and the demo split
tracks the cursor horizontally (18–82%). Reduced motion and touch skip the
entrance and interaction. The old right-hand report card, ghost numeral,
annotations and "scroll to read" cue were removed.

**Reader marquee:** a duplicated five-item track translates continuously over
36s. The duplicate group is `aria-hidden`. Play state pauses on
`:hover`/`:focus-within` and whenever an IntersectionObserver marks the band
`is-offscreen`. Under reduced motion the track becomes a static wrapped list.

**Pinned five-stage story (preserved, `min-width: 1024px`, motion allowed):**
ScrollTrigger scrub 0.65, `end: '+=3100'`. Panels crossfade with a 0.24s
overlap. Internals: raw rows (0.5s, stagger 0.08), reference bands (0.5s,
stagger 0.08) + markers (0.38s), explanation rows (0.38s, stagger 0.1), evidence
path draw (0.72s), follow-up items (0.38s, stagger 0.1). Below 1024px or under
reduced motion, all five panels stack with their own headings and no pin.

**Translation layer:** on scroll, the split opens from 82% to 46% between
`top 82%` and `top 34%` (`scrub: 0.6`), while the panel fades and rises (0.8s).
The native range input is the real control and supports pointer and keyboard
(Arrow/Home/End). The visible handle is only an affordance. At rest the raw pane
holds `46%`, the paper is `calc(46% - 82px)` wide (max 470px), centred
vertically; plain content starts at 50% and fits without overflow. Below 768px
the panes stack, raw first, labelled `01 · As printed`.

**Proof numbers:** each value counts from 0 to `data-value` over 1.25s with
`power2.out`, while the four blocks fade/rise (0.7s, stagger 0.08). Reduced
motion shows the final numerals immediately.

**Capability thread:** the connecting line draws with `scaleX` on scroll, card
spotlights fade in on hover/focus, and ghost numerals sit behind each card.

**Context field:** two chip rows drift laterally on scroll (`xPercent` -7 and
-15, `scrub: 0.7`) between `top bottom` and `bottom top`. The duplicate row is
hidden from assistive technology. On mobile and under reduced motion the rows
become a static wrapped field.

**Manifesto:** the statement is split into words at `opacity: 0.16`, scrubbed to
`1` with a 0.08 stagger as the section crosses the viewport. The lens diagram
draws once; the four principles reveal with `Reveal`. Without motion every word
is already fully legible.

**Safety boundary ticker:** a lime band repeats the non-negotiable boundaries on
a 30s loop, pausing on hover/focus and offscreen, static under reduced motion.

**Section rules and dots:** `scaleX` 0 → 1 over 1s, `once: true`, centre dot
scales in at 0.35s with `back.out(2.4)`. Skipped under reduced motion.

**Final CTA:** clip-path/scale entrance on view, plus a numbered step strip.
**Footer:** the giant outlined wordmark is decorative and `aria-hidden`; the
back-to-top link returns to `#main-content`.

## Reading chrome details

- **ScrollProgress** updates a single `scale3d` transform inside a rAF, driven
  by passive `scroll` and `resize` listeners. It is decorative (`aria-hidden`)
  and never intercepts pointer input.
- **SectionIndex** was retired in the latest hero pass: the right-hand rail is
  no longer mounted, per the request for a simpler, less chrome-heavy page. The
  component file is retained but unused.

## Lenis integration details

- Single instance created in `SmoothScroll`, mounted only on the landing page.
- Driven by the GSAP ticker (`autoRaf: false`, `gsap.ticker.add`), with
  `ScrollTrigger.update()` on every Lenis scroll and `ScrollTrigger.refresh()` on
  load, fonts, resize and route change.
- Skipped entirely under reduced motion and coarse/touch pointers; native scroll
  is retained everywhere else.
- Anchor links are intercepted for smooth in-page scrolling with
  `history.pushState`. Lenis already honours the root
  `scroll-padding-top: 96px`, so the handler adds no offset — this avoids double
  header clearance. Verified landing position: `sectionTop: 96`.
- Cleanup removes the ticker, destroys Lenis, reverts the
  `smooth-scroll-active` class (the old `.lenis-active` marker is no longer
  used), and refreshes ScrollTrigger. Strict-Mode safe.

## Routes and QA

All eight routes were checked at six viewports — 1440 × 1000, 1280 × 900,
1024 × 900, 768 × 1000, 390 × 844 and 360 × 780:

| Route | Status |
|---|---|
| `/` | Pass — all 14 sections, no overflow, 0 console errors |
| `/app` | Pass |
| `/app/reports` | Pass — search/filter |
| `/app/reports/new` | Pass — validation, preview, clear |
| `/app/reports/preview` | Pass — viewer tabs |
| `/app/reports/unknown-report` | Pass — unavailable state |
| `/app/settings` | Pass — motion preference persists |
| `/this-page-does-not-exist` | Pass |

Full Playwright run result: **`failures: []`**, no horizontal overflow at any
viewport, exactly one `h1` per route, 0 console/page errors.

Focused checks that also pass:

- Story pin at fractions `[0.06, 0.26, 0.46, 0.66, 0.86]`: exactly one panel
  visible per stage, active `01` → `05`, pin top `96.4`.
- Section index tone is light over Product/Safety/Footer, dark elsewhere;
  `inert` + opacity 0 at the CTA/footer, restored over the manifesto.
- Translation at rest: split `46%`, raw clip `inset(0 54% 0 0)`, paper
  `452 × 208` inside the 1160 × 548 panel, no text overflow.
- Translation keyboard: 12 × ArrowLeft moves the split and divider; `aria-valuetext`
  updates.
- Marquees: paused at top, running in view, paused on hover; Safety running in
  view.
- Biomarker tabs: ArrowRight/Home/End move focus and selection.
- Mobile menu: opens, focuses “Product”, Escape closes and returns focus to the
  toggle; no overflow at 390.
- Reduced motion: no Lenis, no pin, five stacked story panels, marquee
  `animation: none`, heading words fully visible, comparison at `46%`.
- Anchor, back/forward and cross-route `/#safety` navigation all land at `96`.
- Skip link is the first tab stop; the index enters tab order after the header.

Visual QA screenshots were captured at 1440, 1024, 768, 390, 360 and under
reduced motion. Desktop page height is 16,545px with motion and 15,051px under
reduced motion.

## Performance observations

- Production build: **JS 678.47 kB (gzip 215.33 kB)**, **CSS 150.61 kB
  (gzip 26.38 kB)**.
- All motion uses transform/opacity; no WebGL, no scroll-jacking beyond Lenis,
  no large blurs or shadows.
- Marquees pause whenever offscreen via IntersectionObserver, so their
  animations do not run during the rest of the page.
- The section index and progress bar add one observer each and one passive
  scroll listener; both clean up on unmount.
- `Reveal` keeps `once: true`; ScrollTrigger work is limited to the story,
  comparison intro, proof count-up, capability thread, context field, manifesto
  and section rules.
- Lenis is disabled on touch/reduced motion; the pinned story is desktop-only.
- The build still warns that the single JS chunk exceeds 500 kB.

## Remaining issues / follow-ups

1. **JS chunk > 500 kB.** Code-splitting the landing page (lazy-loading
   GSAP/Lenis, or splitting the app shell) is the clearest next performance win
   for older hardware. Not required for correctness.
2. **No automated visual-regression suite.** QA is Playwright screenshots plus
   DOM metrics; a baseline diff would catch future layout drift.
3. **Hero intro length.** The full entrance settles around 5s including the
   ghost label. If testing shows impatience, shorten the stagger or skip the
   ghost fade on repeat visits.
4. **In-app motion preference.** Changing the setting does not re-run the
   landing page's GSAP setup until a fresh navigation. Acceptable for a preview.
5. **Story pin length.** The pin spans ~3100px (~3.5 viewport heights). It is
   deliberate, but could be shortened if readers report fatigue.
6. **Aceternity License review.** Confirm the custom licence terms before
   shipping the build as a redistributed template.
7. **GSAP "No Charge" licence review** before any commercial redistribution of
   the built bundle.
