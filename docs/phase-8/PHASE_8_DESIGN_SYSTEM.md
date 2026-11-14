# Phase 8 — Design System

## Color Tokens (from tokens.css)

```
--bg: #f7f8f3          (warm off-white, page background)
--bg-deep: #eef2ea     (slightly deeper bg, card sections)
--surface: #ffffff     (card/panel background)
--ink: #12251f         (forest green, primary text)
--ink-soft: #21382f    (slightly softer ink)
--muted: #5b675f       (secondary text)
--muted-soft: #78837c  (tertiary text, labels)
--border: #e4eae3      (card borders)
--lime: #c9f277        (lime green, accent/success/CTA)
--mint: #78cfc0        (teal mint, positive status)
--warning: #e8ab58     (amber, needs attention)
--critical: #d85d5d    (red, critical flags)
```

## Typography

```
--font-display: "Manrope"   (headings, display text)
--font-body: "Inter"        (body, UI text)
--font-mono: monospace      (lab values, tabular data)
```

### Type Scale for Phase 8
- Welcome headline: 52–68px, Manrope 700, letter-spacing -0.03em
- Section heading: 28–36px, Manrope 700
- Card title: 16–18px, Manrope 600
- Body: 14–15px, Inter 400
- Lab value: 15px, tabular-nums, Inter 500
- Label/kicker: 10px, uppercase, letter-spacing 0.1em

## Component Patterns

### Processing Stage Card
- Full-width centered card, max-width 560px
- Stage indicator: numbered dots (1–4)
- Animated SVG illustration area
- Stage label: 20px Manrope 600
- Sub-label: 14px muted

### Measurement Result Card
- Status stripe on left border (lime/mint/amber/critical color)
- Test name: 15px Manrope 600
- Value + unit: 18px tabular-nums
- Reference range: 12px muted
- Status badge: right-aligned
- Expandable content: smooth height transition

### Section Separator
- Light border-bottom, 24px vertical padding
- Section eyebrow: uppercase, 10px, letter-spacing 0.1em

## Motion Principles

1. **Real state only** — animations reflect actual API state changes
2. **Smooth, not flashy** — 240–520ms transitions, no bouncy overrides
3. **Compositing-safe** — only `transform` and `opacity` for animations
4. **Reduced motion** — all animations wrapped in `@media (prefers-reduced-motion: reduce)` with instant/no-motion fallback
5. **Exit animations** — stage transitions should fade-out old, fade-in new

### Processing Animation Keyframes (CSS)
```css
@keyframes p8-scan-line {
  from { transform: translateY(0); }
  to   { transform: translateY(100%); }
}
@keyframes p8-fade-in {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes p8-pulse-ring {
  0%, 100% { opacity: 0.3; transform: scale(1); }
  50%       { opacity: 0.6; transform: scale(1.08); }
}
```

## Mobile Layouts

- 360px min-width guaranteed
- Welcome: stacked, single-column, CTAs full-width
- Upload: single card, dropzone full-width
- Processing: centered card, full-width at mobile
- Results: single-column cards, collapsed by default
- Dashboard: 2-column quick links → 1-column at <640px

## Accessibility

- All interactive elements: visible focus ring (2px offset, ink color)
- Status-only information: never conveyed by color alone (use text + icon)
- Critical alerts: `role="alert"` for critical flags
- Processing stage: `aria-live="polite"` for stage changes
- Reduced motion: all CSS animations gated
