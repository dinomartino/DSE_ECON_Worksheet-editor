'use client';

import type { ReactNode } from 'react';

/**
 * The right panel's visual system (k-0474): one calm colour per *kind of thing*, so a
 * teacher can tell at a glance whether a card is the question text, a source, a part, a
 * sub-part or the teacher-only answer and marking — the user found them all the same
 * colour, told apart only by borders.
 *
 * Built from the existing theme tokens only, so every theme (light, dark, sepia, high
 * contrast…) gets its own version for free:
 *
 * | kind      | colour                 | reads as                         |
 * |-----------|------------------------|----------------------------------|
 * | `stem`    | neutral (`line-strong`)| the question's own text          |
 * | `source`  | green (`ok`)           | data the students read           |
 * | `part`    | blue (`accent`)        | what the students answer         |
 * | `subPart` | lighter blue           | nested inside its part           |
 * | `scheme`  | amber (`warn-ink`)     | teacher only: answer and marking |
 *
 * A card is `<PanelKindCard kind=…>` or, where a component already draws its own box,
 * `panelKindProps(kind)` spread onto it plus `PanelKindChip` in its header. The colour
 * lives in one CSS variable per card (`--kind`, `--kind-ink`); `globals.css` § Panel kinds
 * draws the left stripe, the tinted header (`.panel-kind-head`), the chip and the
 * selection ring — the ring lands on the innermost card holding the page's selection, the
 * same control `markPanelTarget` tints.
 *
 * Other panels (the marking-scheme editor, k-0475) use `kind="scheme"` rather than
 * inventing their own colours.
 */
export type PanelKind = 'stem' | 'source' | 'part' | 'subPart' | 'scheme';

/** The two variables a kind sets; everything else in § Panel kinds reads them. */
const KIND_VARS: Record<PanelKind, string> = {
  stem: '[--kind:var(--line-strong)] [--kind-ink:var(--ink-muted)]',
  source: '[--kind:var(--ok)] [--kind-ink:var(--ok)]',
  part: '[--kind:var(--accent)] [--kind-ink:var(--accent-ink)]',
  subPart: '[--kind:color-mix(in_oklab,var(--accent)_50%,var(--surface))] [--kind-ink:var(--accent-ink)]',
  scheme: '[--kind:var(--warn-ink)] [--kind-ink:var(--warn-ink)]',
};

/** Spread onto an element that is a kind's card: the stripe, border and ring come with it. */
export function panelKindProps(kind: PanelKind, className = ''): { 'data-panel-kind': PanelKind; className: string } {
  return { 'data-panel-kind': kind, className: `panel-kind ${KIND_VARS[kind]} ${className}`.trim() };
}

/** The kind's colour for a chip, label or icon outside a card (the "where am I" line). */
export function panelKindVars(kind: PanelKind): string {
  return KIND_VARS[kind];
}

/** A small label in the kind's colour: "Source A", "(b)", "Teacher only". */
export function PanelKindChip({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`panel-kind-chip ${className}`}>{children}</span>;
}

/**
 * A card of one kind: a tinted header (chip, a muted line saying what it is, actions) over
 * its body. `anchor` names it for the "where am I" line, which scrolls to it.
 */
export function PanelKindCard({
  kind,
  chip,
  title,
  actions,
  children,
  anchor,
  editTarget,
  className = '',
}: {
  kind: PanelKind;
  chip: ReactNode;
  title?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  anchor?: string;
  /** The control key the page selects this card by (§ panelTarget). */
  editTarget?: string;
  className?: string;
}) {
  return (
    <section
      {...panelKindProps(kind, `group/block ${className}`)}
      data-panel-anchor={anchor}
      data-edit-target={editTarget}
    >
      <header className="panel-kind-head flex min-h-8 items-center gap-2 px-2 py-1">
        <PanelKindChip>{chip}</PanelKindChip>
        {title && <span className="min-w-0 flex-1 truncate text-[11px] text-ink-muted">{title}</span>}
        {!title && <span className="flex-1" />}
        {actions}
      </header>
      {children && <div className="px-2 pb-2 pt-1.5">{children}</div>}
    </section>
  );
}
