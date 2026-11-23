'use client';

import { useMemo } from 'react';
import { ProviderFooter } from '@/components/ai/ProviderFooter';
import { Segmented } from '@/components/ui';
import { useMessages } from '@/i18n/language';
import { topicNamesFor } from '@/model/topics';
import { sentSummary } from '@/questionStudio/brief';
import { useStudio } from '@/questionStudio/live';
import { canWrite, requestOf } from '@/questionStudio/session';
import { BATCH_SIZES, MAX_EXAMPLES, MAX_NOTE_CHARS, type Level, type Shape } from '@/questionStudio/types';
import type { LanguageMode } from '@/model/types';
import { useAiStatus } from '@/settings/aiSettings';
import { useAppDialogs } from '@/store/appDialogs';
import { lookupCode } from '@/syllabus';
import { QUESTION_STUDIO_MESSAGES } from './messages';
import { keyPointGroups, syllabusName, tokenCount } from './studioView';

const label = 'text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-subtle';

/**
 * The left column: what to write about (a syllabus key point, and the bank questions to
 * write like), how many and how hard, and exactly what Write sends. Nothing is sent until
 * the teacher presses Write; the list under "Sends this to" is built from the same brief the
 * request is (`sentSummary`), so it cannot say less than what goes.
 */
export function SourcePanel({ pastPapersOn, onGoTo, onTrialOff }: { pastPapersOn: boolean; onGoTo: (view: 'pastpapers' | 'bank') => void; onTrialOff?: () => void }) {
  const m = useMessages(QUESTION_STUDIO_MESSAGES);
  const form = useStudio((s) => s.form);
  // Syllabus names are paper words: the language the studio writes in, not the interface's (k-0500).
  const names = topicNamesFor(form.language, 'wide');
  const phase = useStudio((s) => s.phase);
  const { setForm, removeExample, write, stop } = useStudio.getState();
  const status = useAiStatus();
  const running = phase.kind === 'running';
  const groups = useMemo(() => keyPointGroups(names), [names]);
  const hit = lookupCode(form.keyPoint);
  const keyPoint = hit && !hit.point ? hit.keyPoint : undefined;
  const sent = useMemo(() => sentSummary(requestOf(form)), [form]);
  const sideNames = (language: LanguageMode) => (language === 'en' ? m.langEn : language === 'zh' ? m.langZh : `${m.langEn} + ${m.langZh}`);
  const levelWord = form.level === 'same' ? m.levelSame : form.level === 'harder' ? m.levelHarder : m.levelEasier;
  const usesZh = form.language !== 'en';

  const stage =
    phase.kind !== 'running'
      ? ''
      : phase.target
        ? m.stageChange
        : phase.stage === 'solve'
          ? m.stageSolve
          : phase.stage === 'rewrite'
            ? m.stageRewrite
            : m.stageWrite;

  return (
    <div className="flex flex-col gap-5 px-4 py-4" data-studio-source>
      <h2 className="text-[13px] font-semibold text-ink">{m.source}</h2>
      <section className="-mt-2 flex flex-col gap-2">
        <label htmlFor="studio-key-point" className={label}>
          {m.keyPoint}
        </label>
        <select
          id="studio-key-point"
          value={keyPoint ? form.keyPoint : ''}
          disabled={running}
          onChange={(event) => setForm({ keyPoint: event.target.value })}
          className="h-9 w-full rounded-lg border border-line bg-surface px-2 text-[13px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
        >
          <option value="">{m.chooseKeyPoint}</option>
          {groups.map((group) => (
            <optgroup key={group.code} label={group.name}>
              {group.options.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        {keyPoint && keyPoint.points.length > 0 && (
          <fieldset className="mt-1 flex flex-col gap-1" disabled={running}>
            <legend className="mb-1 text-[12px] text-ink-muted">{m.points}</legend>
            {keyPoint.points.map((point) => (
              <label key={point.code} className="flex cursor-pointer items-start gap-2 text-[12.5px] text-ink">
                <input
                  type="checkbox"
                  checked={form.points.includes(point.code)}
                  onChange={(event) => setForm({ points: event.target.checked ? [...form.points, point.code] : form.points.filter((code) => code !== point.code) })}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
                />
                <span>{syllabusName(point, names)}</span>
              </label>
            ))}
            <p className="text-[11.5px] text-ink-subtle">{m.allPoints}</p>
          </fieldset>
        )}

        {keyPoint && (
          <details className="text-[12px] text-ink-muted">
            <summary className="cursor-pointer select-none">{m.limits(keyPoint.notRequired.length)}</summary>
            {keyPoint.notRequired.length === 0 ? (
              <p className="mt-1.5">{m.limitsNone}</p>
            ) : (
              <ul className="mt-1.5 list-disc space-y-1 pl-4">
                {keyPoint.notRequired.map((limit) => (
                  <li key={limit}>{limit}</li>
                ))}
              </ul>
            )}
          </details>
        )}
      </section>

      <section className="flex flex-col gap-2" data-studio-examples>
        <div className="flex items-baseline gap-2">
          <h2 className={label}>{m.examples}</h2>
          <span className="text-[11.5px] tabular-nums text-ink-subtle">{m.examplesCount(form.examples.length, MAX_EXAMPLES)}</span>
        </div>
        {form.examples.length === 0 ? (
          <p className="text-[12px] leading-relaxed text-ink-muted">{m.examplesEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {form.examples.map((example) => {
              const words = (usesZh && !example.stem.en ? example.stem.zh : example.stem.en || example.stem.zh).replace(/\s+/g, ' ');
              return (
                <li key={example.id} className="flex items-start gap-2 rounded-lg border border-line bg-surface px-2.5 py-2" data-studio-example={example.id}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-medium text-ink">{example.label}</span>
                    <span className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-ink-muted">{words}</span>
                    {example.hasFigure && <span className="mt-0.5 block text-[11px] text-warn-ink">{m.figureNotSent}</span>}
                  </span>
                  <button
                    type="button"
                    disabled={running}
                    aria-label={m.removeExample(example.label)}
                    onClick={() => removeExample(example.id)}
                    className="shrink-0 cursor-pointer rounded px-1 text-[14px] leading-none text-ink-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex flex-wrap gap-3 text-[12px]">
          {pastPapersOn && (
            <button type="button" onClick={() => onGoTo('pastpapers')} className="cursor-pointer font-medium text-accent-ink hover:underline">
              {m.fromPastPapers} →
            </button>
          )}
          <button type="button" onClick={() => onGoTo('bank')} className="cursor-pointer font-medium text-accent-ink hover:underline">
            {m.fromMyBank} →
          </button>
        </div>
      </section>

      <section className="flex flex-col gap-1">
        <Row title={m.count}>
          <Segmented
            label={m.count}
            value={String(form.count)}
            options={BATCH_SIZES.map((n) => ({ value: String(n), label: String(n) }))}
            onChange={(value) => setForm({ count: Number(value) as (typeof BATCH_SIZES)[number] })}
          />
        </Row>
        <Row title={m.level}>
          <Segmented<Level>
            label={m.level}
            value={form.level}
            options={[
              { value: 'same', label: m.levelSame, title: m.levelTitle },
              { value: 'harder', label: m.levelHarder, title: m.levelTitle },
              { value: 'easier', label: m.levelEasier, title: m.levelTitle },
            ]}
            onChange={(level) => setForm({ level })}
          />
        </Row>
        <Row title={m.shape}>
          <Segmented<Shape>
            label={m.shape}
            value={form.shape}
            options={[
              { value: 'any', label: m.shapeAny },
              { value: 'plain', label: m.shapePlain, title: m.shapePlainTitle },
              { value: 'combination', label: m.shapeCombination, title: m.shapeCombinationTitle },
            ]}
            onChange={(shape) => setForm({ shape })}
          />
        </Row>
        <Row title={m.language}>
          <Segmented<LanguageMode>
            label={m.language}
            value={form.language}
            options={[
              { value: 'en', label: m.langEn },
              { value: 'zh', label: m.langZh },
              { value: 'bilingual', label: m.langBoth },
            ]}
            onChange={(language) => setForm({ language })}
          />
        </Row>
      </section>

      <section className="flex flex-col gap-1.5">
        <label htmlFor="studio-note" className={label}>
          {m.note}
        </label>
        <textarea
          id="studio-note"
          value={form.note}
          maxLength={MAX_NOTE_CHARS}
          rows={2}
          disabled={running}
          placeholder={m.notePlaceholder}
          onChange={(event) => setForm({ note: event.target.value })}
          className="w-full resize-y rounded-lg border border-line bg-surface px-2.5 py-2 text-[12.5px] text-ink outline-none placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/25 disabled:opacity-60"
        />
      </section>

      <section className="rounded-lg border border-line bg-surface-sunken px-3 py-2.5" data-studio-sends>
        <h2 className="text-[12px] font-semibold text-ink">{m.sends(status.preset.label)}</h2>
        <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[12px] leading-relaxed text-ink-muted">
          <li>{m.sendsKeyPoint(sent.points)}</li>
          {sent.limits > 0 && <li>{m.sendsLimits(sent.limits)}</li>}
          {sent.examples > 0 && <li>{m.sendsExamples(sent.examples, tokenCount(sent.exampleChars))}</li>}
          {sent.note && <li>{m.sendsNote}</li>}
          {usesZh && <li>{m.sendsTerms}</li>}
          <li>{m.sendsMake(sent.count, levelWord, sideNames(form.language))}</li>
        </ul>
        {sent.examples > 0 && <p className="mt-1.5 text-[11.5px] leading-relaxed text-warn-ink">{m.sendsExamplesRisk}</p>}
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-subtle">{m.sendsNothing}</p>
      </section>

      <section className="flex flex-col gap-2">
        {running ? (
          <>
            <div role="status" className="flex items-center gap-2 text-[12.5px] text-ink">
              <span aria-hidden>✦</span>
              <span className="min-w-0 flex-1 truncate">{stage}</span>
              <span className="shrink-0 tabular-nums text-ink-subtle">{m.progress(phase.done, phase.total)}</span>
            </div>
            <span className="h-1 w-full overflow-hidden rounded-full bg-line" aria-hidden>
              <span className="block h-full rounded-full bg-accent transition-[width] duration-300 ease-out-soft" style={{ width: `${Math.min(100, (phase.done / Math.max(1, phase.total)) * 100)}%` }} />
            </span>
            <button type="button" onClick={stop} className="h-9 cursor-pointer rounded-lg border border-line bg-surface text-[13px] font-medium text-ink hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
              {m.stop}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={!canWrite(form)}
              onClick={() => void write()}
              data-studio-write
              className="h-9 cursor-pointer rounded-lg bg-cta text-[13px] font-medium text-on-cta hover:bg-cta-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              {m.write(form.count)}
            </button>
            {!canWrite(form) && <p className="text-[11.5px] text-ink-subtle">{m.needKeyPoint}</p>}
          </>
        )}
      </section>

      <div className="-mx-4 border-t border-line">
        <ProviderFooter status={status} onSettings={() => useAppDialogs.getState().openSettings({ section: 'ai', focus: 'key' })} />
      </div>

      <p className="flex flex-wrap items-center gap-x-2 text-[11px] leading-relaxed text-ink-subtle">
        <span>{m.trialFoot}</span>
        {onTrialOff && (
          <button type="button" onClick={onTrialOff} data-studio-trial-off className="cursor-pointer font-medium text-accent-ink hover:underline">
            {m.trialOff}
          </button>
        )}
      </p>
    </div>
  );
}

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[4.5rem] shrink-0 text-[12px] text-ink-muted">{title}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
