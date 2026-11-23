'use client';

import { useMemo, useState } from 'react';
import { revealQuestion } from '@/components/bank/page/bankReturn';
import { useMessages } from '@/i18n/language';
import type { LanguageMode, Worksheet } from '@/model/types';
import { emptyPaperFor } from '@/pastpapers/actions';
import { buildsOf, insertIntoOpenPaper, keepInMyBank, languageOf, paperName, type InsertResult } from '@/questionStudio/deliver';
import type { SheetDraft } from '@/questionStudio/session';
import type { WorksheetSummary } from '@/storage';
import { notify } from '@/store/notices';
import { QUESTION_STUDIO_MESSAGES } from './messages';

/**
 * The tray at the foot (Past paper bank's own anatomy): the accepted drafts go into a new
 * worksheet, a new Paper 1, one of the teacher's papers (one commit, one ⌘Z), or their own
 * question bank. Nothing lands until a button here is pressed; drafts that landed leave the
 * sheet.
 */
export function Tray({
  items,
  busyRun,
  onDelivered,
  onClear,
  summaries,
  onOpenWorksheet,
  onOpenDocument,
  onError,
}: {
  /** The accepted drafts, in the paper's order. */
  items: readonly SheetDraft[];
  /** The AI is working: nothing lands meanwhile. */
  busyRun: boolean;
  /** These drafts became questions (Add, Keep). */
  onDelivered: (from: readonly SheetDraft[]) => void;
  onClear: () => void;
  summaries: readonly WorksheetSummary[];
  onOpenWorksheet: (worksheet: Worksheet, language: LanguageMode) => void;
  onOpenDocument: (docId: string, then?: () => void) => void;
  onError: (message: string) => void;
}) {
  const m = useMessages(QUESTION_STUDIO_MESSAGES);
  const [target, setTarget] = useState('new:classroom');
  const [busy, setBusy] = useState(false);
  const papers = useMemo(
    () => [...summaries].filter((s) => s.kind !== 'bank').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 12),
    [summaries],
  );
  if (items.length === 0) return null;

  const landed = (result: InsertResult, from: readonly SheetDraft[]) => {
    if (!result.ok) {
      onError(result.reason === 'readOnly' ? m.readOnlyPaper : m.deliverFailed);
      return;
    }
    onDelivered(from);
    notify({ id: 'studio-added', tone: 'info', body: m.added(result.ids.length) });
    if (result.ids[0]) revealQuestion(result.ids[0]);
  };

  const add = () => {
    const from = items;
    const builds = buildsOf(from);
    if (builds.length === 0) return;
    setBusy(true);
    try {
      if (target.startsWith('new:')) {
        const language = languageOf(from);
        onOpenWorksheet(emptyPaperFor(target === 'new:paper1' ? 'paper1' : 'classroom', paperName(from, language)), language);
        landed(insertIntoOpenPaper(builds), from);
        return;
      }
      onOpenDocument(target, () => landed(insertIntoOpenPaper(builds), from));
    } finally {
      setBusy(false);
    }
  };

  const keep = async () => {
    const from = items;
    setBusy(true);
    try {
      const done = await keepInMyBank(buildsOf(from));
      if (done.copied === 0) notify({ id: 'studio-kept', tone: 'info', body: m.keptNone });
      else notify({ id: 'studio-kept', tone: 'success', body: done.already > 0 ? m.keptSome(done.copied, done.already, done.bankName) : m.kept(done.copied, done.bankName) });
      onDelivered(from);
    } catch (error) {
      onError(error instanceof Error ? error.message : m.deliverFailed);
    } finally {
      setBusy(false);
    }
  };

  const disabled = busy || busyRun;
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-line bg-surface px-6 py-3" role="region" aria-label={m.picked(items.length)} data-studio-tray>
      <span className="text-[13px] font-medium text-ink">{m.picked(items.length)}</span>
      <button type="button" onClick={onClear} className="cursor-pointer text-[12.5px] text-ink-muted hover:text-ink hover:underline">
        {m.clear}
      </button>
      <span className="hidden min-w-0 max-w-[340px] text-[12px] leading-snug text-ink-subtle xl:block">{m.trayNote}</span>
      <span className="flex-1" />
      <button
        type="button"
        disabled={disabled}
        onClick={() => void keep()}
        className="cursor-pointer rounded-lg border border-line bg-surface px-3 py-1.5 text-[12.5px] text-ink hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
      >
        {m.keepInBank}
      </button>
      <label className="flex items-center gap-2 text-[12.5px] text-ink-muted">
        {m.addTo}
        <select
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          className="h-8 max-w-[260px] rounded-lg border border-line bg-surface px-2 text-[12.5px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <option value="new:classroom">{m.newWorksheet}</option>
          <option value="new:paper1">{m.newPaper1}</option>
          {papers.length > 0 && (
            <optgroup label={m.recentPapers}>
              {papers.map((paper) => (
                <option key={paper.id} value={paper.id}>
                  {paper.title}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      <button
        type="button"
        disabled={disabled}
        onClick={add}
        className="cursor-pointer rounded-lg bg-cta px-3.5 py-1.5 text-[12.5px] font-medium text-on-cta hover:bg-cta-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
      >
        {m.add}
      </button>
    </div>
  );
}
