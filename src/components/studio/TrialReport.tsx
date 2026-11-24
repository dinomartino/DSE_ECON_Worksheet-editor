'use client';

import { useMemo } from 'react';
import { useMessages } from '@/i18n/language';
import { useTrialLog } from '@/questionStudio/live';
import { BAR, reportText, tally, type Gate } from '@/questionStudio/trialScore';
import type { Arm } from '@/questionStudio/trialLog';
import { notify } from '@/store/notices';
import { Chip, type Tone } from './parts';
import { tokenCount } from './studioView';
import { STUDIO_TRIAL_MESSAGES } from './trial.messages';

/**
 * The trial kit's right column: where the trial stands against its bar (the key is defensible
 * on 90% or more of what is shown, 60% or more is usable as it stands or after one edit, no
 * near-copy is ever shown), the checks the studio ran over what it showed, what it cost, and the
 * report as text to copy. The numbers are `trialScore.tally`, the same the Copy button writes out.
 */
export function TrialReport() {
  const t = useMessages(STUDIO_TRIAL_MESSAGES);
  const runs = useTrialLog((s) => s.runs);
  const saveFailed = useTrialLog((s) => s.saveFailed);
  const score = useMemo(() => tally(runs), [runs]);
  const text = useMemo(() => reportText(runs), [runs]);
  const { bar, local, drafts, marks, cost, byArm } = score;
  const armName: Record<Arm, string> = { today: t.armToday, refs: t.armRefs, strict: t.armStrict, style: t.armPicked };
  const share = (got: number, of: number) => (of > 0 ? `${Math.round((got / of) * 100)}% (${got}/${of})` : '–');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      notify({ id: 'studio-trial-copied', tone: 'info', body: t.copied });
    } catch {
      notify({ id: 'studio-trial-copied', tone: 'info', body: t.copyFailed });
    }
  };

  const verdict = bar.verdict === 'pass' ? t.verdictPass : bar.verdict === 'fail' ? t.verdictFail : t.verdictPending;
  const verdictTone: Tone = bar.verdict === 'pass' ? 'ok' : bar.verdict === 'fail' ? 'fail' : 'idle';

  return (
    <aside aria-label={t.report} className="flex flex-col gap-5 px-4 py-4 text-[12.5px]" data-trial-report>
      <section>
        <h2 className="text-[13px] font-semibold text-ink">{t.report}</h2>
        <p className="mt-1 flex items-center gap-2 leading-relaxed text-ink-muted">
          <Chip tone={verdictTone}>{verdict}</Chip>
          <span className="tabular-nums">{t.markedOf(marks.marked, marks.shown)}</span>
        </p>
        <ul className="mt-3 flex flex-col divide-y divide-line border-y border-line">
          <GateRow label={t.gateKey} gate={bar.keyDefensible} need={t.gateNeed(BAR.keyDefensible)} percent />
          <GateRow label={t.gateUse} gate={bar.usable} need={t.gateNeed(BAR.usable)} percent />
          <GateRow label={t.gateCopy} gate={bar.nearCopy} need={t.gateZero} />
        </ul>
        {local.bankMissing > 0 && <p className="mt-2 leading-relaxed text-warn-ink">{t.noBank(local.bankMissing)}</p>}
      </section>

      <section>
        <h2 className="text-[13px] font-semibold text-ink">{t.localTitle}</h2>
        <ul className="mt-2 flex flex-col gap-1 leading-relaxed text-ink-muted">
          <Count label={t.localAgree} value={`${local.keyAgree} / ${drafts.shown}`} />
          <Count label={t.localLint} value={local.lint} />
          <Count label={t.localSyllabus} value={local.syllabus} />
          <Count label={t.localNumbers} value={local.numbers} />
          <Count label={t.localTerms} value={local.terms} />
          {local.copyMax !== undefined && local.copyP90 !== undefined && <li>{t.localCopy(local.copyMax, local.copyP90)}</li>}
          <li>{t.localWarned(drafts.warned, drafts.warnedBy.copy, drafts.warnedBy.shape)}</li>
        </ul>
      </section>

      <section data-trial-style>
        <h2 className="text-[13px] font-semibold text-ink">{t.styleTitle}</h2>
        {score.style.dseMarked + score.style.testedMarked === 0 ? (
          <p className="mt-2 leading-relaxed text-ink-muted">{t.styleNone}</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1 leading-relaxed text-ink-muted">
            {byArm.map((a) => (
              <li key={a.arm} className="tabular-nums" data-trial-arm={a.arm}>
                {t.styleLine(armName[a.arm], share(a.dseYes, a.dseMarked), share(a.testedYes, a.testedMarked))}
              </li>
            ))}
          </ul>
        )}
      </section>

      {cost.runs > 0 && (
        <section>
          <h2 className="text-[13px] font-semibold text-ink">{t.costTitle}</h2>
          <p className="mt-2 leading-relaxed text-ink-muted">{t.cost(cost.requests, tokenCount(cost.input + cost.output), Math.round(cost.ms / cost.runs / 1000))}</p>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => void copy()}
          className="cursor-pointer self-start rounded-lg bg-cta px-3 py-1.5 text-[12.5px] font-medium text-on-cta hover:bg-cta-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {t.copyReport}
        </button>
        <details className="rounded-lg border border-line bg-surface px-3 py-2">
          <summary className="cursor-pointer select-none text-[12.5px] text-ink">{t.showReport}</summary>
          <textarea readOnly value={text} aria-label={t.showReport} rows={12} className="mt-2 w-full resize-y rounded-md border border-line bg-surface-sunken p-2 font-mono text-[11px] leading-snug text-ink" />
        </details>
        <p className="leading-relaxed text-ink-subtle">{t.recordNote}</p>
        {saveFailed && <p className="leading-relaxed text-danger-ink">{t.saveFailed}</p>}
      </section>
    </aside>
  );
}

function GateRow({ label, gate, need, percent = false }: { label: string; gate: Gate; need: string; percent?: boolean }) {
  const t = useMessages(STUDIO_TRIAL_MESSAGES);
  const state = gate.pass === undefined ? t.gatePending(gate.of, BAR.minMarked) : gate.pass ? t.gatePass : t.gateFail;
  const tone: Tone = gate.pass === undefined ? 'idle' : gate.pass ? 'ok' : 'fail';
  return (
    <li className="flex flex-col gap-1 py-2" data-gate={label}>
      <div className="flex items-center gap-2">
        <span className="font-medium text-ink">{label}</span>
        <span className="flex-1" />
        {gate.pass !== undefined && <Chip tone={tone}>{state}</Chip>}
      </div>
      <div className="flex items-baseline gap-2 text-ink-muted">
        <span className="text-[15px] font-semibold tabular-nums text-ink">{gate.percent === undefined ? '–' : percent ? `${gate.percent}%` : gate.got}</span>
        <span className="tabular-nums">{t.gateCounts(gate.got, gate.of)}</span>
        <span className="text-ink-subtle">{need}</span>
      </div>
      {gate.pass === undefined && <span className="text-ink-subtle">{state}</span>}
    </li>
  );
}

function Count({ label, value }: { label: string; value: number | string }) {
  return (
    <li className="flex items-baseline gap-2">
      <span className="flex-1">{label}</span>
      <span className="tabular-nums text-ink">{value}</span>
    </li>
  );
}
