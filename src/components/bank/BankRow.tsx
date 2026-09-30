'use client';

import { tagText } from '@/model/patterns';
import type { KeyboardEvent, ReactNode } from 'react';
import type { BankRow as BankRowData, BankUse } from '@/library/types';
import { plain } from '@/model/text';
import type { LanguageMode } from '@/model/types';
import { getQuestionType } from '@/registry';
import { GripIcon } from '@/components/ui/icons';
import type { RowDragProps } from './bankDrag';

/**
 * One question-bank row, shared by the editor's 題庫 tab and the Question bank page.
 * Presentational: facts as quiet tabular text, no chips; the only colour is amber for
 * "used with this class". The caller owns every action: a drag, and Enter on the focused row.
 */
export interface BankRowProps {
  row: BankRowData;
  /** The paper's language: picks the excerpt side and flags a missing one. Default 'en'. */
  language?: LanguageMode;
  /** A leading slot (e.g. the bank page's checkbox). */
  leading?: ReactNode;
  /** Already in the open paper (matched by rootId): dimmed, and says where it is. */
  inPaper?: { number?: number };
  /** The most recent use with the paper's class (`usedWithClass`): amber meta text. */
  usedWithClass?: BankUse;
  /** Distinct versions of this question (`BankGroup.versions`); more than 1 shows "N versions". */
  versions?: number;
  onVersions?: () => void;
  /** Hide "source doc · Q n" (e.g. when the list is already filtered to one document). */
  hideSource?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  /** Drag the row onto the page (`useBankRowDrag`): a grip, and the grab cursor. */
  drag?: RowDragProps;
  /** This row's question is in hand. */
  dragging?: boolean;
  /** The keyboard path: the row takes focus, and Enter or Space runs this. */
  onActivate?: () => void;
  /** What the focused row does, for assistive tech ("Drag onto the page, or press Enter…"). */
  activateHint?: string;
  /** A list with one Tab stop passes -1 to every row but its current one. Default 0. */
  tabIndex?: 0 | -1;
}

export function BankRow({
  row,
  language = 'en',
  leading,
  inPaper,
  usedWithClass,
  versions = 1,
  onVersions,
  hideSource,
  selected = false,
  onSelect,
  drag,
  dragging = false,
  onActivate,
  activateHint,
  tabIndex = 0,
}: BankRowProps) {
  const excerpt = language === 'zh' ? row.excerpt.zh : row.excerpt.en;
  const missing = missingLanguageLabel(row, language);
  const excerptText = (
    <span className="line-clamp-2 text-xs leading-snug text-ink" title={excerpt}>
      {excerpt || <span className="text-ink-subtle">Untitled question</span>}
    </span>
  );
  return (
    <div
      data-bank-row={row.questionId}
      {...drag}
      {...(onActivate
        ? {
            role: 'group',
            tabIndex,
            'aria-label': excerpt || 'Untitled question',
            ...(activateHint ? { 'aria-description': activateHint } : {}),
            onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
              // Only the row itself: Enter on its versions button is that button's.
              if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
              event.preventDefault();
              onActivate();
            },
          }
        : {})}
      className={`group relative flex items-start gap-2.5 border-b border-line py-2.5 pl-5 pr-3.5 transition-[background-color,box-shadow] duration-150 ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
        selected || dragging ? 'bg-surface-hover' : 'hover:bg-surface-hover'
      } ${drag ? 'cursor-grab select-none hover:shadow-[inset_0_0_0_1px_var(--line-strong)] active:cursor-grabbing' : ''} ${dragging ? 'opacity-60' : ''}`}
    >
      {drag && (
        <span
          aria-hidden
          title="Drag onto the page"
          className="pointer-events-none absolute left-1 top-[11px] text-ink-subtle transition-colors duration-150 ease-out-soft group-hover:text-accent-ink"
        >
          <GripIcon size={14} />
        </span>
      )}
      <span
        aria-hidden
        className={`absolute inset-y-1 left-0 w-0.5 rounded-full bg-accent transition-[opacity,scale] duration-150 ease-out-soft ${
          selected ? 'scale-y-100 opacity-100' : 'scale-y-50 opacity-0'
        }`}
      />
      {leading && <span className="shrink-0 pt-0.5">{leading}</span>}
      <div className={`min-w-0 flex-1 ${inPaper ? 'opacity-55' : ''}`}>
        {onSelect ? (
          <button
            type="button"
            onClick={onSelect}
            className="block w-full cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1"
          >
            {excerptText}
          </button>
        ) : (
          // Not a disabled button: a disabled control swallows the press a drag starts from.
          <div className="block w-full text-left">{excerptText}</div>
        )}
        <div className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px] tabular-nums text-ink-subtle">
          <span>{typeLabel(row.typeId)}</span>
          <span>{marksLabel(row.marks)}</span>
          {row.tags.length > 0 && <span>{row.tags.map(tagText).join(' · ')}</span>}
          {row.hasDiagram && <span>◩ diagram</span>}
          {!hideSource && <span>{sourceLabel(row)}</span>}
          {missing && <span>{missing}</span>}
          {usedWithClass && <span className="text-warn-ink">{usedLabel(usedWithClass)}</span>}
          {versions > 1 &&
            (onVersions ? (
              <button
                type="button"
                onClick={onVersions}
                className="cursor-pointer text-ink-muted underline-offset-2 hover:text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {versions} versions
              </button>
            ) : (
              <span>{versions} versions</span>
            ))}
        </div>
      </div>
      {inPaper && (
        <span className="shrink-0 pt-px text-xs text-ink-muted">
          In this paper{inPaper.number !== undefined ? ` · Q${inPaper.number}` : ''}
        </span>
      )}
    </div>
  );
}

/** "MCQ", "LQ": the registry's short label, never a branch on the id. */
export function typeLabel(typeId: string): string {
  const definition = getQuestionType(typeId);
  const summary = definition?.summary;
  const label =
    (summary?.short ?? summary?.label)?.en ?? (definition ? plain(definition.displayName.en) : undefined) ?? typeId;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function marksLabel(marks: number): string {
  return `${marks} ${marks === 1 ? 'mark' : 'marks'}`;
}

/** "Mock 2025 · Q14"; a bank document's rows name the bank. */
export function sourceLabel(row: Pick<BankRowData, 'docTitle' | 'number'>): string {
  return row.number !== undefined ? `${row.docTitle} · Q${row.number}` : row.docTitle;
}

/** "中文 only" / "English only" when the paper prints a language the question lacks. */
export function missingLanguageLabel(row: Pick<BankRowData, 'languages'>, language: LanguageMode): string | undefined {
  const hasEn = row.languages.includes('en');
  const hasZh = row.languages.includes('zh');
  if (!hasEn && !hasZh) return undefined;
  if (!hasEn && language !== 'zh') return '中文 only';
  if (!hasZh && language !== 'en') return 'English only';
  return undefined;
}

const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });

/** "Mar 2026" for a use date; empty when it will not parse. */
function monthOf(use: Pick<BankUse, 'usedOn'>): string {
  const when = Date.parse(use.usedOn);
  return Number.isNaN(when) ? '' : MONTH.format(when);
}

/** "Used with 5A, 5B · Mar 2026". */
export function usedLabel(use: BankUse): string {
  const month = monthOf(use);
  return `Used with ${use.classes?.join(', ') || 'this class'}${month ? ` · ${month}` : ''}`;
}

/** Who sat a paper and when: "5A, 5B · Mar 2026"; a paper naming no class says so. */
export function sittingLabel(use: BankUse): string {
  const month = monthOf(use);
  return `${use.classes?.join(', ') || 'No class'}${month ? ` · ${month}` : ''}`;
}
