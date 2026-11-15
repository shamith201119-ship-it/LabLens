# Phase 9.12.2 â€” minimal startup loader

**Status:** implemented and verified
**Scope:** `src/components/loader/GlobalLoader.tsx`, `src/styles/loader.css` only.
**Environment:** isolated preview `127.0.0.1:5174` serving the production build (`VITE_API_BASE=http://127.0.0.1:8001`). No backend, OCR, extraction, or database code touched.

---

## What changed

The launch screen previously carried seven layers of decoration: a giant outlined â€œLabLensâ€ ghost word, a `Local & private` badge, a `Lab-Lens / 0.1` document number, a branded icon tile, a tagline, a caption, and two radial gradient glows behind a 2 px gradient sweep.

It is now exactly three things:

1. **Flat background** â€” `--bg` (`#f7f8f3`). No gradients, no glow, no texture.
2. **Wordmark** â€” `Lab` (800) + `Lens` (500, muted), matching `BrandLogo`'s treatment.
3. **Progress bar** â€” 4 px rounded track (`rgba(18,37,31,0.12)`) with an ink fill that advances over 420 ms. 240 px wide on desktop, 190 px on phones.

Removed entirely: `.global-loader__ghost`, `__topline`, `__badge`, `__badge-dot`, `__docnum`, `__mark`, `__tagline`, `__caption`, `__trace`, and the `loader-rise` / `loader-breathe` / `loader-trace` / `loader-beacon` keyframes.

Lifecycle stays the same: shown once per full page load, gated on `useAppReady`, scroll locked while visible, released on exit. The only timing change is the unmount delay after readiness dropping from 720 ms to 440 ms, so the scroll lock is released right after the 380 ms fade instead of 340 ms later. Reduced-motion users still skip the splash entirely.

---

## Verification

`docs/development/qa/full-product-audit/phase9_12_2_loader_shots.cjs` â†’ **24 passed, 0 failed**
(`phase9_12_2_loader_results.json`), at 1440 Ã— 900 and 390 Ã— 844:

| Check | Result |
|---|---|
| Loader present on first paint | Pass, both widths |
| Flat background, `background-image: none` | Pass â€” `rgb(247, 248, 243)` |
| Wordmark reads `LabLens` | Pass |
| Exactly one progress bar, 4 px tall | Pass â€” 240 px / 190 px |
| All seven removed decoration nodes absent | Pass â€” every count 0 |
| No horizontal overflow | Pass â€” âˆ’10 px gutter |
| Bar is genuinely mid-fill in real time | Pass â€” `scaleX` 0.83 / 0.67 at 150 ms |
| Loader clears the viewport | Pass â€” ~1.44 s from navigation |
| Scroll lock released, `appReady=true` | Pass |
| No console or page errors | Pass |

Regression re-run after the change: `phase9_12_1_verification.cjs` â†’ **179 passed, 0 failed** (verification workspace unaffected). `npm run lint` clean, `npm run typecheck` clean, production build succeeds.

### Screenshots

`docs/development/qa/full-product-audit/screenshots/phase9_12_2_loader/`

- `before-1440.png`, `before-390.png` â€” the previous branded launch screen.
- `after-1440.png`, `after-390.png` â€” settled composition, bar held at 62 % for the still.
- `after-1440-live.png`, `after-390-live.png` â€” real-time frame ~150 ms in.
- `after-app-1440.png`, `after-app-390.png` â€” app visible immediately after the loader clears.

---

## Limitation

The bar is time-based, not tied to real asset or font byte progress â€” the app only exposes a boolean readiness signal, so a true determinate bar would be fabricated. It completes in 420 ms, before the earliest possible readiness flip (450 ms), so it always reads as finished when the screen begins to fade. Capture and checks are Chromium-only.
