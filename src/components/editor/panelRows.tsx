'use client';

import type { ReactNode } from 'react';
import { plain } from '@/model/text';
import type { BiText, ContentBlock } from '@/model/types';

/**
 * The compact rows the slimmed panels are built from.
 *
 * The sidebar no longer mirrors printed text as editable fields — the page is the one
 * place words are typed (§ the paper owns the words). What remains of a paragraph in
 * the panel is an *address*: a one-line excerpt naming the block so it can be
 * reordered, deleted, and scrolled to, never retyped here.
 */

/**
 * Scroll the page to the element rendering this edit-target key.
 *
 * The page marks its text with `data-page-target` (§ TextNodeView); a row that names
 * one can take the teacher there. Centred, because the sheet is much taller than the
 * sidebar and "nearest" routinely leaves the target under the toolbar.
 */
export function scrollPageTo(targetKey: string): void {
  document
    .querySelector(`#print-root [data-page-target="${CSS.escape(targetKey)}"]`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/** One line of a bilingual value, preferring whichever side has words. */
export function biExcerpt(value: BiText | undefined): string {
  if (!value) return '';
  return plain(value.en) || plain(value.zh);
}

/** The first paragraph's text, for naming a collapsed card or a block row. */
export function excerptOfBlocks(blocks: ContentBlock[]): string {
  const para = blocks.find((block) => block.kind === 'paragraph');
  return para && para.kind === 'paragraph' ? biExcerpt(para.text) : '';
}

/**
 * A grid-sized number input for the mark scheme rows: `NumberField`'s semantics —
 * clearable means the caller handles `undefined`, an emptied box elsewhere stays 0 —
 * at a width that fits two per 400px row beside a letter and an excerpt. The name
 * rides as `aria-label`/`title` because the column header above names the column.
 */
export function MiniNumber({
  label,
  value,
  onChange,
  placeholder,
  min = 0,
}: {
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  placeholder?: string;
  min?: number;
}) {
  return (
    <input
      type="number"
      min={min}
      value={value ?? ''}
      placeholder={placeholder}
      aria-label={label}
      title={label}
      className="h-7 w-12 shrink-0 rounded-md border border-line bg-surface px-1.5 text-right text-xs tabular-nums text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/25"
      onChange={(event) => {
        if (event.target.value.trim() === '') {
          onChange(undefined);
          return;
        }
        onChange(Math.max(min, Number(event.target.value) || 0));
      }}
    />
  );
}

/**
 * A row standing in for text that is typed on the page: an address, not a field.
 *
 * The marker-and-excerpt region is a button that **scrolls the page to the text it
 * names** (the reverse of the page's scroll-into-panel), so the row answers "where is
 * this?" with the page itself. `actions` dock behind the caller's hover-reveal —
 * reorder and delete arrive exactly as the old field rows did.
 */
export function ExcerptRow({
  marker,
  text,
  emptyHint = 'Empty — type on the page',
  targetKey,
  actions,
  badge,
}: {
  /** Short leading glyph or label: `¶`, `A.`, `(1)` … */
  marker?: ReactNode;
  text: string;
  /** Shown when the excerpt is empty, so a blank block still has a visible row. */
  emptyHint?: string;
  /** `data-edit-target` key, so the page's selection can scroll this row into view. */
  targetKey?: string;
  actions?: ReactNode;
  /** A state that must show without hover, e.g. "Pinned"; beside the text. */
  badge?: ReactNode;
}) {
  const body = (
    <>
      {marker !== undefined && (
        <span className="w-5 shrink-0 text-center text-[11px] font-medium tabular-nums text-ink-subtle">
          {marker}
        </span>
      )}
      {text ? (
        <span className="min-w-0 flex-1 truncate text-xs text-ink-muted">{text}</span>
      ) : (
        <span className="min-w-0 flex-1 truncate text-xs italic text-ink-subtle">
          {emptyHint}
        </span>
      )}
    </>
  );

  return (
    <div
      data-edit-target={targetKey}
      className="group/row flex min-h-7 items-center gap-1.5 rounded-md border border-transparent px-1 py-0.5 transition-colors hover:border-line hover:bg-surface-sunken"
    >
      {targetKey ? (
        <button
          type="button"
          title="Show on the page"
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          onClick={() => scrollPageTo(targetKey)}
        >
          {body}
        </button>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-1.5">{body}</span>
      )}
      {badge}
      {actions && (
        <span className="flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100">
          {actions}
        </span>
      )}
    </div>
  );
}
