'use client';

import { useEffect, useState } from 'react';
import { ProviderFooter } from '@/components/ai/ProviderFooter';
import { useMessages } from '@/i18n/language';
import { useBriefRun, useTrialLog } from '@/questionStudio/live';
import { briefsDone, isBriefLabel, MINE, type Arm } from '@/questionStudio/trialLog';
import { Segmented } from '@/components/ui';
import { TRIAL_BRIEFS } from '@/questionStudio/trialBriefs';
import { useAiStatus } from '@/settings/aiSettings';
import { useAppDialogs } from '@/store/appDialogs';
import { RunErrorNotice } from './StudioError';
import { TrialList } from './TrialList';
import { TrialReport } from './TrialReport';
import { STUDIO_TRIAL_MESSAGES } from './trial.messages';

const heading = 'text-[13px] font-semibold text-ink';

/**
 * The trial kit (k-0499, decision 7a), the studio's second tab: the 30 invented briefs to run
 * on the teacher's own key, every draft they and the teacher's own requests made, each to mark,
 * and where the trial stands against its bar. Left: the briefs' run and the record. Middle: the
 * drafts to read. Right: the numbers and the report to copy. Shown only while the trial is on,
 * like everything else about the studio.
 */
export function TrialView() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden" data-studio-trial>
      <div className="scroll-slim shrink-0 border-b border-line lg:w-[340px] lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <BriefsPanel />
      </div>
      <main className="flex min-w-0 flex-1 flex-col lg:min-h-0">
        <div className="scroll-slim bg-desk px-6 py-5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          <TrialList />
        </div>
      </main>
      <div className="scroll-slim shrink-0 border-t border-line lg:w-[320px] lg:overflow-y-auto lg:border-l lg:border-t-0">
        <TrialReport />
      </div>
    </div>
  );
}

/** The left column: the run of the 30 briefs, the teacher's own requests, and clearing the record. */
function BriefsPanel() {
  const t = useMessages(STUDIO_TRIAL_MESSAGES);
  const runs = useTrialLog((s) => s.runs);
  const progress = useBriefRun((s) => s.progress);
  const end = useBriefRun((s) => s.end);
  const status = useAiStatus();
  const [armed, setArmed] = useState(false);
  const [arm, setArm] = useState<Arm>('refs');
  const done = briefsDone(runs, arm).size;
  const total = TRIAL_BRIEFS.length;
  const running = progress !== undefined;
  const writes = runs.filter((run) => run.ok && run.kind === 'write' && run.label === MINE).length;
  const changes = runs.filter((run) => run.ok && run.kind === 'refine' && !isBriefLabel(run.label)).length;
  const { start, stop, dismiss } = useBriefRun.getState();

  // "Click again" is for a moment: it lapses by itself.
  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(timer);
  }, [armed]);

  return (
    <div className="flex flex-col gap-5 px-4 py-4" data-trial-briefs>
      <RunErrorNotice error={end?.kind === 'error' ? end.error : undefined} onRetry={() => void start(arm)} onDismiss={dismiss} />

      <section className="flex flex-col gap-2">
        <h2 className={heading}>{t.briefsTitle}</h2>
        <p className="text-[12.5px] leading-relaxed text-ink-muted">{t.briefsBody}</p>
        <div className="flex flex-col gap-1.5" data-trial-arms>
          <span className="text-[12px] font-medium text-ink">{t.armTitle}</span>
          <Segmented<Arm>
            label={t.armTitle}
            value={arm}
            onChange={(next) => {
              if (!running) setArm(next);
            }}
            options={[
              { value: 'today', label: t.armToday },
              { value: 'refs', label: t.armRefs },
              { value: 'strict', label: t.armStrict },
            ]}
          />
          <p className="text-[11.5px] leading-snug text-ink-subtle">{t.armHint}</p>
        </div>
        <p className="text-[12.5px] tabular-nums text-ink" role="status" data-trial-progress>
          {t.briefsProgress(done, total)}
          {running && progress?.current ? ` · ${t.briefsRunning(progress.current)}` : ''}
        </p>
        <div className="flex items-center gap-2">
          {running ? (
            <button
              type="button"
              onClick={stop}
              className="cursor-pointer rounded-lg border border-line bg-surface px-3 py-1.5 text-[12.5px] font-medium text-ink hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {t.briefsStop}
            </button>
          ) : (
            done < total && (
              <button
                type="button"
                onClick={() => void start(arm)}
                data-trial-run
                className="cursor-pointer rounded-lg bg-cta px-3 py-1.5 text-[12.5px] font-medium text-on-cta hover:bg-cta-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {done === 0 ? t.briefsRun : t.briefsRunRest}
              </button>
            )
          )}
        </div>
        {end?.kind === 'stopped' && <p className="text-[12.5px] leading-relaxed text-ink-muted">{t.briefsStopped}</p>}
        {!running && done >= total && <p className="text-[12.5px] leading-relaxed text-ink-muted">{t.briefsAllDone}</p>}
        <ProviderFooter status={status} onSettings={() => useAppDialogs.getState().openSettings({ section: 'ai', focus: 'key' })} />
      </section>

      <section className="flex flex-col gap-2 border-t border-line pt-4">
        <h2 className={heading}>{t.mineTitle}</h2>
        <p className="text-[12.5px] leading-relaxed text-ink-muted">{t.mineBody}</p>
        <p className="text-[12.5px] tabular-nums text-ink">{t.mineCount(writes, changes)}</p>
      </section>

      {runs.length > 0 && (
        <section className="border-t border-line pt-4">
          <button
            type="button"
            onClick={() => {
              if (!armed) {
                setArmed(true);
                return;
              }
              setArmed(false);
              useTrialLog.getState().clear();
            }}
            disabled={running}
            data-trial-clear
            className="cursor-pointer text-[12.5px] text-ink-muted hover:text-danger-ink hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          >
            {armed ? t.clearAsk : t.clear}
          </button>
        </section>
      )}
    </div>
  );
}
