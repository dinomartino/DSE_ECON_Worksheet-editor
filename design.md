# Design — Econ Worksheet Generator ("Warm studio")

A locked design system for the app chrome. Every surface redesign reads this file
before emitting code. Do not regenerate per page — extend or amend this file when the
system needs to grow.

**The paper is out of scope.** `.paper` and everything printed on it stays hard-coded
white/near-black (`src/app/globals.css`), because the preview predicts Word's output.
This system covers only the chrome around it.

## Genre

modern-minimal — a pro drafting tool. The UI recedes; the lit white page is the hero.

## Concept

**One tonal family.** Every chrome surface lives on a single warm-cream ramp: panels
near-white cream, bars and rails one step deeper, the desk the deepest step — and in
the dark scheme the whole ramp drops together into a warm (olive, not blue) dark.
Never a dark surface against a light one: the first cut framed light panels in
graphite and the eye paid for every glance between them. One cyan-blue accent. Warmth
is doing a job: the pure-white sheet reads cooler and brighter against cream than it
ever did against grey.

## Provenance

The warm ramp, the hue-245 accent, and the serif display voice are studied DNA,
extracted 2026-08-08 from `https://arena.ai/` (public reference; structure only, no
pixels copied). Tokens are exact where the source's CSS gave them; the display serif
carries the *role* of the source's Martina Plantijn via the free Newsreader. The
one-tonal-family rule and the zone mechanism predate the study and were kept.

## Mechanism

Semantic tokens (`--surface`, `--ink`, `--line`, …) resolve through two primitive sets
in `globals.css`: `--panel-*` (working surfaces) and `--chrome-*` (the frame — same tone, one step
deeper). `.zone-dark` remaps a subtree onto the frame set; `.zone-light` maps it
back. Both sets drop into one dark ramp under `prefers-color-scheme: dark`.
Components keep using `bg-surface` / `text-ink` and never name a zone's colours.

- Zone roots: Toolbar, the rail column and the desk scroller (EditorApp), StartScreen.
- `Dialog`'s panel is always `zone-light` (dialogs open from dark zones).
- Never use raw Tailwind palette classes (`slate-*`, `sky-*`) in chrome. On-paper
  chrome is the one exception and uses literal hex by design.

## Theme (light scheme)

| Token | Panel set | Chrome (frame) set |
|---|---|---|
| surface | `oklch(98.8% 0.006 85)` | `oklch(94.5% 0.014 85)` |
| ink | `oklch(27% 0.012 75)` | same ink — one tone, one text colour |
| line | `oklch(90% 0.012 85)` | `oklch(87% 0.013 85)` |

Desk `oklch(85% 0.016 85)` · accent `oklch(55% 0.17 245)` cyan-blue ·
`--on-accent` white. **The tonal rule:** all chrome surfaces stay within one warm
family and one lightness direction; the white paper is the brightest object (panels
are cream, never `#fff` — pure white belongs to the sheet alone). Do not reintroduce
a dark frame around light panels — it was tried and rejected for eye comfort. Full
values live in `globals.css`; amend this file when they change.

## Typography

- Body + UI: the system grotesque stack (`--font-geist-sans` is declared but no Geist
  is mounted; the fallback *is* the body face — mount Geist via `next/font` before
  claiming it). Hierarchy is carried by size (11–15px UI ramp), weight and the
  uppercase Eyebrow.
- Display: Newsreader (`next/font`, `--font-display-serif`, `font-display` utility) —
  a light editorial serif, roman only, for **at most one screen-level heading per
  screen** (currently the StartScreen greeting) plus the "W." brand monogram in the
  toolbar and start screen — ink, never a filled square. Never on the paper, never on
  controls, never italic.
- Mono: system mono stack, data only.

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

Primary: filled **neutral ink**, not accent (`--cta` / `--on-cta`; the fill inverts to
light-on-dark-label in the dark scheme), `rounded-lg`, verb-first label ("Export
.docx", "Create worksheet"). The accent never fills a button — blue marks links,
focus rings and selection only (studied from arena.ai's neutral-CTA restraint).
Secondary: bordered surface. No gradients, no uppercase CTAs.

## What surfaces MUST share

The token names, the zone mechanism, the accent and its restraint (≤5% of any
viewport), Geist, the Button variants, the Eyebrow treatment, `data-print-hide`
discipline for anything mounted on the page.

## What surfaces MAY differ on

Zone membership (an overlay canvas may be a light workspace), density (panels are
denser than the start screen), and which of the two zones hosts a popover (menus
inherit their zone).
