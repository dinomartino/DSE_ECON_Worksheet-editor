'use client';

import type { ReactNode } from 'react';
import type { BankRow as BankRowData, BankUse } from '@/library/types';
import { plain } from '@/model/text';
import type { LanguageMode } from '@/model/types';
import { getQuestionType } from '@/registry';

/**
 * One question-bank row, shared by the editor's 題庫 tab and the Question bank page.
 * Presentational: facts as quiet tabular text, no chips; the only colour is amber for
 * "used with this class". The caller owns every action through the slots.
 */
export interface BankRowProps {
  row: BankRowData;
  /** The paper's language: picks the excerpt side and flags a missing one. Default 'en'. */
  language?: LanguageMode;
  /** The trailing action (e.g. an Insert button); hidden while `inPaper`. */
  action?: ReactNode;
  /** A leading slot (e.g. the bank page's checkbox). */
  leading?: ReactNode;
  /** Already in the open paper (matched by rootId): dimmed, action replaced by where it is. */
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
}

export function BankRow({
  row,
  language = 'en',
  action,
  leading,
  inPaper,
  usedWithClass,
  versions = 1,
  onVersions,
  hideSource,
  selected = false,
  onSelect,
}: BankRowProps) {
  const excerpt = language === 'zh' ? row.excerpt.zh : row.excerpt.en;
  const missing = missingLanguageLabel(row, language);
  return (
    <div
      data-bank-row={row.questionId}
      aria-selected={selected}
      className={`group relative flex items-start gap-2.5 border-b border-line py-2.5 pl-3.5 pr-3.5 transition-colors duration-150 ease-out-soft ${
        selected ? 'bg-surface-hover' : 'hover:bg-surface-hover'
      }`}
    >
      <span
        aria-hidden
        className={`absolute inset-y-1 left-0 w-0.5 rounded-full bg-accent transition-[opacity,scale] duration-150 ease-out-soft ${
          selected ? 'scale-y-100 opacity-100' : 'scale-y-50 opacity-0'
        }`}
      />
      {leading && <span className="shrink-0 pt-0.5">{leading}</span>}
      <div className={`min-w-0 flex-1 ${inPaper ? 'opacity-55' : ''}`}>
        <button
          type="button"
          onClick={onSelect}
          disabled={!onSelect}
          className="block w-full cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 disabled:cursor-default"
        >
          <span className="line-clamp-2 text-xs leading-snug text-ink" title={excerpt}>
            {excerpt || <span className="text-ink-subtle">Untitled question</span>}
          </span>
        </button>
        <div className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px] tabular-nums text-ink-subtle">
          <span>{typeLabel(row.typeId)}</span>
          <span>{marksLabel(row.marks)}</span>
          {row.tags.length > 0 && <span>{row.tags.join(' · ')}</span>}
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
      <span className="shrink-0 pt-px text-xs">
        {inPaper ? (
          <span className="text-ink-subtle">In this paper{inPaper.number !== undefined ? ` · Q${inPaper.number}` : ''}</span>
        ) : (
          action
        )}
      </span>
    </div>
  );
}

/** "MCQ", "Structured": the registry's short label, never a branch on the id. */
export function typeLabel(typeId: string): string {
  const definition = getQuestionType(typeId);
  const label = definition?.summary?.label.en ?? (definition ? plain(definition.displayName.en) : undefined) ?? typeId;
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

/** "Used with 5A · Mar 2026". */
export function usedLabel(use: BankUse): string {
  const when = Date.parse(use.docUpdatedAt);
  return `Used with ${use.classTag ?? 'this class'}${Number.isNaN(when) ? '' : ` · ${MONTH.format(when)}`}`;
}
