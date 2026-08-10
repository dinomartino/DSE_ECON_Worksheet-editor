/**
 * The app's face, in one definition.
 *
 * The same equilibrium cross the browser tab carries (`src/app/icon.svg`) — both
 * curves in one ink, the accent reserved for the point where they meet, inside a
 * solid corner rule. Inline SVG rather than an <img> so it inherits the chrome's
 * tokens: the tile takes `currentColor`, so the mark follows its zone's ink
 * instead of pinning a hex that only suits the light scheme.
 *
 * It replaced a serif `W.` monogram, which read as a document's initial rather
 * than as this tool's subject.
 */
export function AppMark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg
      aria-hidden
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 512 512"
      className={className}
    >
      <rect width="512" height="512" rx="114" fill="currentColor" />
      {/* Tuned for ~22px, not for the 512px tile the tab icon is drawn at: the
          cross is pulled in and the strokes thinned, because at this size the
          full-bleed geometry fuses the corner rule and the curves into one dark
          square. The axes also brighten (0.34 → 0.46) — at 22px a third of the
          surface tone disappears into the ground. */}
      <path
        d="M132 122v268h268"
        fill="none"
        stroke="var(--surface)"
        strokeWidth="17"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.46"
      />
      <g stroke="var(--surface)" strokeWidth="26" strokeLinecap="round" fill="none">
        <path d="M178 178L344 344" />
        <path d="M178 344L344 178" />
      </g>
      {/* The point is knocked out of the curves before the accent is laid in, so
          the two strokes never show through it.

          It is drawn larger than the tab icon's, deliberately: the accent dot is
          the one thing that must survive here, and at 22px the icon's own r=30
          lands on roughly one pixel of blue — present in the geometry, invisible
          on screen. Scaling it with the mark is what keeps the equilibrium
          readable as a *point* rather than a smudge in the crossing. */}
      <circle cx="261" cy="261" r="52" fill="currentColor" />
      <circle cx="261" cy="261" r="36" fill="var(--accent)" />
    </svg>
  );
}
