import type { Glossary } from '@/glossary/types';
import type { JobResult } from '@/translate/types';
import * as copy from './copy';
import { RichRuns } from './RichRuns';
import { locationLabel, type ReviewItem } from './translateSession';

export type NoteTone = 'fail' | 'warn' | 'note' | 'ok';
export interface RowNote { tone: NoteTone; text: string; title?: string }

const TONE: Record<NoteTone, string> = {
  fail: 'text-danger-ink',
  warn: 'text-warn-ink',
  note: 'text-ink-muted',
  ok: 'text-ok',
};
const ORDER: Record<NoteTone, number> = { fail: 0, warn: 1, note: 2, ok: 3 };

/** A row's notes, only when it is not plainly ready: fail, warn, note, then what was fixed. */
export function rowNotes(result: JobResult, glossary: Glossary | null): RowNote[] {
  if (result.status === 'ready') return [];
  if (result.status === 'failed') {
    if (result.error?.kind === 'safety') return [{ tone: 'fail', text: copy.SAFETY_ROW }];
    const reason = result.issues.find((i) => i.severity === 'fail')?.message ?? result.error?.message ?? 'no answer';
    return [{ tone: 'fail', text: copy.failedRow(reason) }];
  }
  const notes: RowNote[] = result.issues.map((issue) => ({ tone: issue.severity, text: issue.message }));
  for (const term of result.terms) {
    if (term.severity !== 'warn' && term.severity !== 'note') continue;
    const raw = glossary?.entries.find((e) => e.id === term.entryId)?.raw;
    notes.push({
      tone: term.severity,
      text: term.conflict ? copy.conflictChip(term.conflict.form, term.conflict.meansEn) : copy.termChip(term.state, term.en, term.expected),
      ...(raw ? { title: `${term.en}: ${raw}` } : {}),
    });
  }
  for (const fix of result.fixes) {
    notes.push({ tone: 'ok', text: fix.how === 'simplified' ? copy.SIMPLIFIED_FIXED : copy.termFixed(fix.from, fix.to) });
  }
  return notes.sort((a, b) => ORDER[a.tone] - ORDER[b.tone]);
}

/**
 * One proposal, read-only: a tick, where it prints, the source, the proposed runs and any
 * notes. Corrections happen on the page after inserting — there is no field here.
 */
export function ReviewRow({
  item,
  groupLabel,
  ticked,
  onTick,
  glossary,
}: {
  item: ReviewItem;
  groupLabel: string;
  ticked: boolean;
  onTick: (value: boolean) => void;
  glossary: Glossary | null;
}) {
  const { job, result } = item;
  const failed = result.status === 'failed';
  const toZh = job.direction === 'toZh';
  const where = locationLabel(job, groupLabel);
  const notes = rowNotes(result, glossary);
  const copies = job.slots.length;
  const body = (
    <>
      <span className="flex w-5 shrink-0 justify-center pt-0.5">
        {!failed && (
          <input
            type="checkbox"
            checked={ticked}
            onChange={(event) => onTick(event.target.checked)}
            className="h-4 w-4 cursor-pointer accent-[var(--accent)]"
          />
        )}
      </span>
      <span className="w-32 shrink-0 pt-px text-xs text-ink-muted">
        {where}
        {copies > 1 && (
          <span title={copy.appearsTimes(copies)} className="ml-1 tabular-nums text-ink-subtle">
            ×{copies}
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="line-clamp-2 block text-xs text-ink-muted">
          <RichRuns runs={job.source} lang={toZh ? 'en' : 'zh-HK'} />
        </span>
        {job.replacing && job.slots[0] && (
          <span className="block text-[13px] text-ink-subtle line-through">
            <RichRuns runs={job.slots[0].targetSnapshot} lang={toZh ? 'zh-HK' : 'en'} />
          </span>
        )}
        {result.runs && (
          <span className="block text-[13px] leading-relaxed text-ink">
            <RichRuns runs={result.runs} lang={toZh ? 'zh-HK' : 'en'} />
          </span>
        )}
        {notes.map((note, i) => (
          <span key={i} title={note.title} className={`block text-[11px] ${TONE[note.tone]}`} data-note={note.tone}>
            {note.text}
          </span>
        ))}
      </span>
    </>
  );
  // A failed row cannot be ticked, so it is not a label.
  return failed ? (
    <li className="flex gap-3 py-2 opacity-80" data-row={item.key} data-status="failed">
      {body}
    </li>
  ) : (
    <li data-row={item.key} data-status={result.status}>
      <label className="flex cursor-pointer gap-3 rounded-md py-2 transition-colors duration-150 ease-out-soft hover:bg-surface-hover">
        {body}
      </label>
    </li>
  );
}
