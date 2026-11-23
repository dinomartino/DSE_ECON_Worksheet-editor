'use client';

import { useState, type ReactNode } from 'react';
import { Segmented } from '@/components/ui';
import { useMessages } from '@/i18n/language';
import type { LanguageMode, Worksheet } from '@/model/types';
import { useStudio } from '@/questionStudio/live';
import { setStudioTrial, studioDefaultOn } from '@/questionStudio/trial';
import type { WorksheetSummary } from '@/storage';
import { ChecksPanel } from './ChecksPanel';
import { DraftsPanel } from './DraftsPanel';
import { QUESTION_STUDIO_MESSAGES } from './messages';
import { SourcePanel } from './SourcePanel';
import { StudioError } from './StudioError';
import { STUDIO_TRIAL_MESSAGES } from './trial.messages';
import { TrialView } from './TrialView';
import { Tray } from './Tray';

/**
 * The Question studio 擬題工作室 as its own screen (k-0499, decision 2c): the start
 * screen's view beside the Question bank and the Past paper bank, shown in a develop build
 * and hidden in a release build (the trial switch, `src/questionStudio/trial.ts`). Source on the left (a key point, bank questions to write
 * like, how many and how hard, exactly what is sent), the drafts as they print in the middle,
 * the checks on the right, and a tray at the foot. Nothing is saved or sent until Write, and
 * nothing lands in a paper or the bank until Add or Keep.
 */
export function QuestionStudioScreen({
  summaries,
  settings,
  pastPapersOn,
  onHome,
  onGoTo,
  onOpenWorksheet,
  onOpenDocument,
  onError,
}: {
  summaries: readonly WorksheetSummary[];
  settings?: ReactNode;
  pastPapersOn: boolean;
  onHome: () => void;
  onGoTo: (view: 'pastpapers' | 'bank') => void;
  onOpenWorksheet: (worksheet: Worksheet, language: LanguageMode) => void;
  onOpenDocument: (docId: string, then?: () => void) => void;
  onError: (message: string) => void;
}) {
  const m = useMessages(QUESTION_STUDIO_MESSAGES);
  const t = useMessages(STUDIO_TRIAL_MESSAGES);
  const language = useStudio((s) => s.form.language);
  // Write is the studio; the Trial kit is its evidence (the 30 briefs, the marks, the bar).
  const [tab, setTab] = useState<'write' | 'trial'>('write');

  return (
    <div className="zone-light flex h-full min-h-0 flex-col bg-surface text-ink" data-studio-screen data-print-hide>
      <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-3.5 gap-y-2 whitespace-nowrap border-b border-line bg-surface px-4 py-2 md:h-12 md:flex-nowrap md:py-0">
        <button
          type="button"
          onClick={onHome}
          className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-ink-muted transition-colors duration-150 ease-out-soft hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          ← {m.home}
        </button>
        <h1 className="truncate text-[14px] font-semibold text-ink">{m.title}</h1>
        <span title={m.trialTitle} className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-muted">
          {m.trial}
        </span>
        <Segmented<'write' | 'trial'>
          label={t.tabsLabel}
          value={tab}
          onChange={setTab}
          options={[
            { value: 'write', label: t.tabWrite },
            { value: 'trial', label: t.tabTrial },
          ]}
        />
        <span className="flex-1" />
        {settings}
      </header>

      {tab === 'trial' ? (
        <TrialView />
      ) : (
        <WriteView
          summaries={summaries}
          pastPapersOn={pastPapersOn}
          onGoTo={onGoTo}
          onHome={onHome}
          onOpenWorksheet={onOpenWorksheet}
          onOpenDocument={onOpenDocument}
          onError={onError}
          language={language}
        />
      )}
    </div>
  );
}

/** The Write tab: the source, the drafts as they print and their checks, and the tray at the foot. */
function WriteView({
  summaries,
  pastPapersOn,
  onGoTo,
  onHome,
  onOpenWorksheet,
  onOpenDocument,
  onError,
  language,
}: {
  summaries: readonly WorksheetSummary[];
  pastPapersOn: boolean;
  onGoTo: (view: 'pastpapers' | 'bank') => void;
  onHome: () => void;
  onOpenWorksheet: (worksheet: Worksheet, language: LanguageMode) => void;
  onOpenDocument: (docId: string, then?: () => void) => void;
  onError: (message: string) => void;
  language: LanguageMode;
}) {
  return (
    <>
      {/* Below `lg` the three columns stack in one scroller; from `lg` each scrolls on its own. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <div className="scroll-slim shrink-0 border-b border-line lg:w-[340px] lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <SourcePanel
            pastPapersOn={pastPapersOn}
            onGoTo={onGoTo}
            onTrialOff={
              // Only where the studio is opt-in (a release build): in a develop build it is part of
              // the app, and the desktop app has no address bar to bring it back once hidden.
              studioDefaultOn()
                ? undefined
                : () => {
                    setStudioTrial(false);
                    onHome();
                  }
            }
          />
        </div>
        <main className="flex min-w-0 flex-1 flex-col lg:min-h-0">
          <div className="scroll-slim bg-desk px-6 py-5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
            <StudioError />
            <DraftsPanel language={language} />
          </div>
        </main>
        <div className="scroll-slim shrink-0 border-t border-line lg:w-[320px] lg:overflow-y-auto lg:border-l lg:border-t-0">
          <ChecksPanel />
        </div>
      </div>

      <Tray summaries={summaries} onOpenWorksheet={onOpenWorksheet} onOpenDocument={onOpenDocument} onError={onError} />
    </>
  );
}
