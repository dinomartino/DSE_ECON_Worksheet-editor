'use client';

import { useState } from 'react';
import { useMessages } from '@/i18n/language';
import { usePastPaperBank } from '@/pastpapers/bank';
import { cleanUpOldCopies, scanOldCopies, type BankReader, type CleanUpResult, type OldCopy, type OldCopyScan } from '@/pastpapers/oldCopies';
import { worksheetStore } from '@/storage';
import { useWorksheetStore } from '@/store/worksheetStore';
import { OLD_COPIES_MESSAGES } from './oldCopies.messages';

/** The app's Past paper bank, as the scan reads it: the list, then only the topics it needs. */
const appBank: BankReader = {
  manifest: async () => {
    await usePastPaperBank.getState().open();
    const state = usePastPaperBank.getState();
    if (state.status === 'off' || state.status === 'disabled') return 'off';
    return state.status === 'ready' ? state.manifest : undefined;
  },
  topic: async (id) => {
    const topic = await usePastPaperBank.getState().topic(id);
    return topic?.state === 'ready' ? topic.data.items.map((item) => item.question) : undefined;
  },
};

type Step =
  | { at: 'idle' }
  | { at: 'finding' }
  | { at: 'found'; scan: OldCopyScan; papers: number; confirming: boolean }
  | { at: 'working'; scan: OldCopyScan }
  | { at: 'done'; result: CleanUpResult }
  | { at: 'error'; reason: 'bankOff' | 'bankUnavailable' | 'failed' };

/** Most papers listed by name before "and N more". */
const SHOWN = 6;

/**
 * Settings → Past paper bank: past-paper questions copied into papers before k-0559 that the
 * 題庫 still shows. Find lists them (nothing changes); the teacher's confirm records each as a
 * past-paper copy (`pastpapers/oldCopies.ts`), which takes it out of the 題庫 and leaves every
 * paper printing as before. Nothing is deleted.
 */
export function OldCopiesCleanUp() {
  const m = useMessages(OLD_COPIES_MESSAGES);
  const [step, setStep] = useState<Step>({ at: 'idle' });

  const find = async () => {
    setStep({ at: 'finding' });
    try {
      const outcome = await scanOldCopies(worksheetStore, appBank);
      setStep(outcome.ok ? { at: 'found', scan: outcome.scan, papers: outcome.papers, confirming: false } : { at: 'error', reason: outcome.reason });
    } catch {
      setStep({ at: 'error', reason: 'failed' });
    }
  };

  const takeOut = async (scan: OldCopyScan) => {
    setStep({ at: 'working', scan });
    try {
      const editor = useWorksheetStore.getState();
      const result = await cleanUpOldCopies(scan.copies, worksheetStore, { id: editor.worksheet.id, adopt: editor.adoptSavedElsewhere });
      setStep({ at: 'done', result });
    } catch {
      setStep({ at: 'error', reason: 'failed' });
    }
  };

  const button =
    'cursor-pointer rounded-lg border border-line bg-surface px-3 py-1.5 text-[12.5px] text-ink hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-default disabled:opacity-60';

  return (
    <section data-old-copies>
      <h3 className="mb-1 text-[12px] font-semibold text-ink-muted">{m.heading}</h3>
      <p className="text-[12.5px] leading-relaxed text-ink-muted">{m.intro}</p>

      {(step.at === 'idle' || step.at === 'finding' || step.at === 'error' || step.at === 'done') && (
        <button type="button" data-old-copies-find disabled={step.at === 'finding'} onClick={() => void find()} className={`mt-2 ${button}`}>
          {step.at === 'finding' ? m.finding : m.find}
        </button>
      )}

      {step.at === 'error' && (
        <p role="alert" className="mt-2 text-[12.5px] text-danger">
          {step.reason === 'bankOff' ? m.bankOff : step.reason === 'bankUnavailable' ? m.bankUnavailable : m.failed}
        </p>
      )}

      {step.at === 'done' && (
        <p role="status" data-old-copies-done className="mt-2 text-[12.5px] text-ink">
          {m.done(step.result.recorded)}
          {step.result.skipped > 0 && <span className="block text-ink-muted">{m.skipped(step.result.skipped)}</span>}
        </p>
      )}

      {(step.at === 'found' || step.at === 'working') && <FoundList step={step} onFind={find} onTakeOut={takeOut} onConfirm={(confirming) => step.at === 'found' && setStep({ ...step, confirming })} button={button} />}
    </section>
  );
}

function FoundList({
  step,
  onFind,
  onTakeOut,
  onConfirm,
  button,
}: {
  step: Extract<Step, { at: 'found' | 'working' }>;
  onFind: () => Promise<void>;
  onTakeOut: (scan: OldCopyScan) => Promise<void>;
  onConfirm: (confirming: boolean) => void;
  button: string;
}) {
  const m = useMessages(OLD_COPIES_MESSAGES);
  const { scan } = step;
  const byPaper = new Map<string, OldCopy[]>();
  for (const copy of scan.copies) byPaper.set(copy.docId, [...(byPaper.get(copy.docId) ?? []), copy]);
  const papers = [...byPaper.values()];
  const count = scan.copies.length;
  const notes = (
    <>
      {scan.changed > 0 && <p className="mt-1.5 text-[12px] text-ink-muted">{m.changed(scan.changed)}</p>}
      {scan.notInBank > 0 && <p className="mt-1.5 text-[12px] text-ink-muted">{m.notInBank(scan.notInBank)}</p>}
    </>
  );

  if (count === 0) {
    return (
      <div role="status" data-old-copies-none className="mt-2 text-[12.5px] text-ink">
        {step.at === 'found' && m.none(step.papers)}
        {notes}
        <button type="button" onClick={() => void onFind()} className={`mt-2 ${button}`}>
          {m.find}
        </button>
      </div>
    );
  }

  return (
    <div data-old-copies-found={count} className="mt-2 text-[12.5px] text-ink">
      <p>{m.found(count, papers.length)}</p>
      <ul className="mt-1.5 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-line px-3 py-2">
        {papers.slice(0, SHOWN).map((copies) => (
          <li key={copies[0].docId} className="leading-snug">
            <span className="font-medium">{copies[0].docTitle}</span>
            <span className="text-ink-muted">
              {' · '}
              {copies.map((copy) => (copy.number !== undefined ? `${m.number(copy.number)} ${copy.tag}` : copy.tag)).join(', ')}
            </span>
          </li>
        ))}
        {papers.length > SHOWN && (
          <li className="text-ink-muted">{m.more(papers.slice(SHOWN).reduce((sum, copies) => sum + copies.length, 0))}</li>
        )}
      </ul>
      {notes}
      <p className="mt-1.5 text-[12px] leading-relaxed text-ink-muted">{m.keepNote}</p>
      {step.at === 'found' && !step.confirming && (
        <button type="button" data-old-copies-take-out onClick={() => onConfirm(true)} className={`mt-2 ${button}`}>
          {m.takeOut(count)}
        </button>
      )}
      {(step.at === 'working' || (step.at === 'found' && step.confirming)) && (
        <div role="alertdialog" aria-label={m.confirm(count)} className="mt-2 rounded-lg border border-line-strong bg-surface px-3 py-2.5">
          <p>{m.confirm(count)}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              data-old-copies-confirm
              disabled={step.at === 'working'}
              onClick={() => void onTakeOut(scan)}
              className="cursor-pointer rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-medium text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 disabled:cursor-default disabled:opacity-60"
            >
              {step.at === 'working' ? m.working : m.confirmYes}
            </button>
            <button type="button" disabled={step.at === 'working'} onClick={() => onConfirm(false)} className={button}>
              {m.cancel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
