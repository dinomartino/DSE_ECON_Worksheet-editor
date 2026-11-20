'use client';

import type { ReactNode } from 'react';
import { createDrqContent, referencedSources, sourceLetter, withSourceReference } from '@/model/drq';
import { contentWidth, pageSetupOf } from '@/model/page';
import type { ContentBlock, StructuredQuestion } from '@/model/types';
import { useWorksheetStore } from '@/store/worksheetStore';
import { Button } from '@/components/ui';
import { ChevronRightIcon } from '@/components/ui/icons';
import { useMessages } from '@/i18n/language';
import { DRQ_PANEL_MESSAGES } from './drqPanel.messages';
import { panelLocation } from './panelLocation';
import { PanelKindChip, panelKindProps, panelKindVars } from './panelKinds';

/**
 * The structured-question panel's DRQ pieces (k-0474), kept out of
 * `StructuredEditorPanel.tsx` so that file — which the marking-scheme work also edits —
 * only places them.
 */

/** Scroll the panel to a card by its `data-panel-anchor`. */
function scrollToAnchor(from: HTMLElement, anchor: string) {
  const root = from.closest('[data-panel-root]') ?? document;
  const card = root.querySelector(`[data-panel-anchor="${CSS.escape(anchor)}"]`);
  card?.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

/**
 * The sticky "where am I" line: Question text › Source B, or (c) › (ii) › Teacher only,
 * each crumb in its kind's colour and a button back to its card. Follows what was clicked
 * on the page; says nothing when nothing inside the question is selected.
 */
export function PanelWhereAmI({ question }: { question: StructuredQuestion }) {
  const m = useMessages(DRQ_PANEL_MESSAGES);
  const key = useWorksheetStore((s) => s.selectedTargetKey);
  const crumbs = panelLocation(question, key, {
    stem: m.stem,
    source: m.sourceLabel,
    teacher: m.teacherOnly,
  });
  if (crumbs.length === 0) return null;
  return (
    <nav
      aria-label={m.where}
      data-print-hide
      className="sticky -top-3.5 z-10 -mx-3.5 -mt-3.5 mb-3 flex min-h-9 items-center gap-1 border-b border-line bg-surface/95 px-3.5 py-1.5 backdrop-blur-sm"
    >
      <span className="mr-1 shrink-0 text-[11px] text-ink-subtle">{m.where}</span>
      {crumbs.map((crumb, index) => (
        <span key={crumb.anchor} className="flex min-w-0 items-center gap-1">
          {index > 0 && <ChevronRightIcon size={10} className="text-ink-subtle" />}
          <button
            type="button"
            onClick={(event) => scrollToAnchor(event.currentTarget, crumb.anchor)}
            className={`${panelKindVars(crumb.kind)} cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent`}
          >
            <PanelKindChip>{crumb.label}</PanelKindChip>
          </button>
        </span>
      ))}
    </nav>
  );
}

/** The question's text as a card of its own kind, with its label. */
export function StemCard({ hint, children }: { hint: string; children: ReactNode }) {
  const m = useMessages(DRQ_PANEL_MESSAGES);
  return (
    <section {...panelKindProps('stem', 'space-y-2 p-2 pl-3')} data-panel-anchor="stem">
      <div className="flex items-center gap-2">
        <PanelKindChip>{m.stem}</PanelKindChip>
        <span className="truncate text-[11px] text-ink-subtle">{hint}</span>
      </div>
      {children}
    </section>
  );
}

/**
 * Offered while the question is still blank: one click fills it as a DRQ (Sources A–D,
 * parts (a)–(e)). Nothing is lost, because there is nothing yet; ⌘Z takes it back.
 */
export function DrqStarterCard({ onStart }: { onStart: (content: ReturnType<typeof createDrqContent>) => void }) {
  const m = useMessages(DRQ_PANEL_MESSAGES);
  const columnTwips = useWorksheetStore((s) => contentWidth(pageSetupOf(s.worksheet)));
  return (
    <section {...panelKindProps('source', 'p-2.5 pl-3')} data-drq-starter>
      <p className="text-[13px] font-semibold text-ink">{m.drqTitle}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{m.drqHint}</p>
      <Button size="sm" variant="primary" className="mt-2" onClick={() => onStart(createDrqContent(columnTwips))}>
        {m.drqStart}
      </Button>
    </section>
  );
}

/**
 * "Refer to: [A] [B] [C] [D]" — toggles that write the part's opening "Refer to Source …."
 * in both languages, one per source in the question's text. Shown only when the question
 * has sources.
 */
export function ReferToRow({
  stem,
  blocks,
  onChange,
}: {
  stem: readonly ContentBlock[];
  blocks: ContentBlock[];
  onChange: (blocks: ContentBlock[]) => void;
}) {
  const m = useMessages(DRQ_PANEL_MESSAGES);
  const letters = stem
    .filter((block): block is Extract<ContentBlock, { kind: 'source' }> => block.kind === 'source')
    .map((block, ordinal) => sourceLetter(block, ordinal));
  if (letters.length === 0) return null;
  const chosen = new Set(referencedSources(blocks));
  return (
    <div role="group" aria-label={m.referToHint} title={m.referToHint} className="flex flex-wrap items-center gap-1">
      <span className="pr-1 text-[11px] text-ink-subtle">{m.referTo}</span>
      {letters.map((letter) => {
        const on = chosen.has(letter);
        return (
          <button
            key={letter}
            type="button"
            aria-pressed={on}
            aria-label={m.referToSource(letter)}
            onClick={() => {
              const next = new Set(chosen);
              if (on) next.delete(letter);
              else next.add(letter);
              onChange(withSourceReference(blocks, [...next]));
            }}
            className={`${panelKindVars('source')} h-6 min-w-6 cursor-pointer rounded-full border px-1.5 text-[11px] font-semibold transition-colors duration-150 ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              on
                ? 'border-transparent bg-[color-mix(in_oklab,var(--kind)_14%,var(--surface))] text-[color-mix(in_oklab,var(--kind-ink)_80%,var(--ink))]'
                : 'border-line text-ink-muted hover:bg-surface-hover'
            }`}
          >
            {letter}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The teacher-only half of a leaf — its answer, model diagram and marking scheme — in the
 * scheme kind's amber, so it never reads as something students see. The marking-scheme
 * editor (k-0475) sits inside as it is.
 */
export function TeacherArea({ anchor, children }: { anchor: string; children: ReactNode }) {
  const m = useMessages(DRQ_PANEL_MESSAGES);
  return (
    <div {...panelKindProps('scheme', 'space-y-2 p-2 pl-3')} data-panel-anchor={anchor}>
      <div className="flex items-center gap-2">
        <PanelKindChip>{m.teacherOnly}</PanelKindChip>
        <span className="truncate text-[11px] text-ink-subtle">{m.answerAndMarking}</span>
      </div>
      {children}
    </div>
  );
}
