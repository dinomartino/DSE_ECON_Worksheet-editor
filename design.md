# Design — Econ Worksheet Generator ("Graphite studio")

A locked design system for the app chrome. Every surface redesign reads this file
before emitting code. Do not regenerate per page — extend or amend this file when the
system needs to grow.

**The paper is out of scope.** `.paper` and everything printed on it stays hard-coded
white/near-black (`src/app/globals.css`), because the preview predicts Word's output.
This system covers only the chrome around it.

## Genre

modern-minimal — a pro drafting tool. The UI recedes; the lit white page is the hero.

## Concept

Lit paper on a dark desk. Toolbar, rails and desk are graphite (`.zone-dark`); working
panels — sidebar, dialogs, cards — are crisp light surfaces (`.zone-light` restores
them inside a dark zone). One electric-blue accent.

## Mechanism

Semantic tokens (`--surface`, `--ink`, `--line`, …) resolve through two primitive sets
in `globals.css`: `--panel-*` (light surfaces; goes dark under
`prefers-color-scheme: dark`) and `--chrome-*` (graphite always). `.zone-dark` remaps
the semantic names to the chrome set for a subtree; `.zone-light` maps them back.
Components keep using `bg-surface` / `text-ink` and never name a zone's colours.

- Zone roots: Toolbar, the rail column and the desk scroller (EditorApp), StartScreen.
- `Dialog`'s panel is always `zone-light` (dialogs open from dark zones).
- Never use raw Tailwind palette classes (`slate-*`, `sky-*`) in chrome. On-paper
  chrome is the one exception and uses literal hex by design.

## Theme (light scheme)

| Token | Panel set | Chrome set |
|---|---|---|
| surface | `oklch(97.5% 0.003 265)` | `oklch(32% 0.012 265)` |
| ink | `oklch(27% 0.015 265)` | `oklch(90% 0.005 265)` |
| ink-muted | `oklch(47% 0.018 265)` | `oklch(77% 0.01 265)` |
| line | `oklch(89% 0.006 265)` | `oklch(41% 0.01 265)` |

Deliberately **mid-contrast**: the frame is mid-graphite and the panels a shade off
pure white, so only the paper itself is `#fff` — comfortable over a long session,
and the sheet stays the brightest object. Do not push the desk darker or the panels
brighter without re-testing eye comfort.

Desk `oklch(42% 0.012 265)` · accent `oklch(55% 0.19 255)` electric blue ·
`--on-accent` white. Full values live in `globals.css`; it is the source of truth —
amend this file when they change.

## Typography

- Body + UI: Geist Sans (`next/font`), weights 400/500/600. Display type is not used;
  hierarchy is carried by size (11–15px UI ramp), weight and the uppercase Eyebrow.
- Mono: Geist Mono, data only.

## Spacing & shape

Tailwind default 4-pt scale. Radii: `rounded-lg` controls, `rounded-xl` cards,
`rounded-2xl` floating panels. Depth: dark zones are flat (no shadows); light panels
over dark zones carry `shadow-2xl`; the paper alone gets the layered `paper-shadow`.

## Motion

`--ease-out-soft` (cubic-bezier(0.22, 1, 0.36, 1)), 150–220ms, `transform`/`opacity`
and colours only. `prefers-reduced-motion` collapses everything (already in
`globals.css`). No reveals, no celebratory motion — silent success (the "Saved" notice
is the ceiling).

## Microinteractions stance

- Hover reveals chrome with `opacity`, never `display` (hit-path rule).
- Focus: `ring-2 ring-accent` + offset from the zone's own surface, never animated.
- Buttons: the shared `Button`/`IconButton` variants only; `primary` reserved for
  Export, `danger` for destructive, `subtle` recedes.

## CTA voice

Primary: filled accent, `rounded-lg`, verb-first label ("Export .docx", "Create
worksheet"). Secondary: bordered surface. No gradients, no uppercase CTAs.

## What surfaces MUST share

The token names, the zone mechanism, the accent and its restraint (≤5% of any
viewport), Geist, the Button variants, the Eyebrow treatment, `data-print-hide`
discipline for anything mounted on the page.

## What surfaces MAY differ on

Zone membership (an overlay canvas may be a light workspace), density (panels are
denser than the start screen), and which of the two zones hosts a popover (menus
inherit their zone).
