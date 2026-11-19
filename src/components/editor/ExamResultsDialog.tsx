'use client';

import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui';
import { Dialog, Field } from '@/components/ui/Dialog';
import { useMessages } from '@/i18n/language';
import { formatPercent, mcPercentOf, parsePercent } from '@/model/examResults';
import { bi, isBiTextEmpty, plain } from '@/model/text';
import type { BiText, ExamResults, Worksheet } from '@/model/types';
import { collectAnswerKey, UNANSWERED_MARK, type KeyChoice } from '@/render/answerKey';
import { EXAM_RESULTS_MESSAGES } from './ExamResults.messages';

const INPUT =
  'h-8 w-full min-w-0 rounded-md border bg-surface px-2 text-right text-[13px] tabular-nums text-ink outline-none transition-colors duration-150 ease-out-soft placeholder:text-ink-subtle focus:ring-2';
const TEXTAREA =
  'min-h-[84px] w-full min-w-0 resize-y rounded-lg border border-line bg-surface px-2.5 py-2 text-[13px] leading-snug text-ink outline-none transition-colors duration-150 ease-out-soft placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/25';

type Side = { en: string; zh: string };

/** What the dialog holds: each MC question's typed %, and the two comments as plain text. */
export interface ExamResultsDraft {
  percents: Record<string, string>;
  mc: Side;
  sq: Side;
}

/** The MC questions of a paper, numbered as it prints them, under their section headings. */
export interface ResultGroup {
  heading?: BiText;
  choices: KeyChoice[];
}

/** The paper's MC questions in order, grouped by section, and whether it has structured questions. */
export function resultRows(worksheet: Worksheet): { groups: ResultGroup[]; structured: boolean } {
  const data = collectAnswerKey(worksheet);
  return {
    groups: data.groups
      .filter((group) => group.choices.length > 0)
      .map((group) => ({ heading: group.heading, choices: group.choices })),
    structured: data.groups.some((group) => group.schemes.length > 0),
  };
}

const sideOf = (text: BiText | undefined): Side => ({ en: plain(text?.en), zh: plain(text?.zh) });

/** The dialog's starting values, read from what is stored. */
export function startingDraft(worksheet: Worksheet, groups: ResultGroup[]): ExamResultsDraft {
  const percents: Record<string, string> = {};
  for (const choice of groups.flatMap((group) => group.choices)) {
    const value = mcPercentOf(worksheet.examResults, choice.questionId);
    percents[choice.questionId] = value === undefined ? '' : formatPercent(value);
  }
  return { percents, mc: sideOf(worksheet.examResults?.mcComments), sq: sideOf(worksheet.examResults?.sqComments) };
}

/** Whether any typed % cannot be stored. */
export function draftInvalid(draft: ExamResultsDraft): boolean {
  return Object.values(draft.percents).some((text) => parsePercent(text) === 'invalid');
}

/**
 * The results to store: `previous` (so a newer build's own keys survive), with the %s of
 * the questions the paper has now (a deleted question's % goes) and the comments as typed.
 * Empty parts are left out; `withExamResults` drops the field when nothing is left.
 */
export function draftResults(draft: ExamResultsDraft, previous: ExamResults | undefined): ExamResults {
  const mcPercent: Record<string, number> = {};
  for (const [id, text] of Object.entries(draft.percents)) {
    const value = parsePercent(text);
    if (typeof value === 'number') mcPercent[id] = value;
  }
  const comment = (side: Side): BiText | undefined => {
    const text = bi(side.en.trim(), side.zh.trim());
    return isBiTextEmpty(text) ? undefined : text;
  };
  const { mcPercent: _p, mcComments: _m, sqComments: _s, ...rest } = previous ?? {};
  void _p;
  void _m;
  void _s;
  const mc = comment(draft.mc);
  const sq = comment(draft.sq);
  return {
    ...rest,
    ...(Object.keys(mcPercent).length > 0 ? { mcPercent } : {}),
    ...(mc ? { mcComments: mc } : {}),
    ...(sq ? { sqComments: sq } : {}),
  };
}

/**
 * Exam results (k-0471, GitHub #6): after the exam the teacher types each MC question's %
 * correct and the candidates' performance; Save stores them (`Worksheet.examResults`) in one
 * undoable step, and the answer key prints them ("A (65%)", and a Candidates' performance
 * section at its end). Opened from the Marking scheme view's Layout tab.
 */
export function ExamResultsDialog({
  worksheet,
  onClose,
  onSave,
}: {
  worksheet: Worksheet;
  onClose: () => void;
  onSave: (results: ExamResults) => void;
}) {
  const m = useMessages(EXAM_RESULTS_MESSAGES);
  const { groups, structured } = useMemo(() => resultRows(worksheet), [worksheet]);
  const [draft, setDraft] = useState<ExamResultsDraft>(() => startingDraft(worksheet, groups));
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const choices = groups.flatMap((group) => group.choices);
  const invalid = draftInvalid(draft);
  const formId = 'exam-results-form';
  const named = groups.length > 1 || groups.some((group) => group.heading && !isBiTextEmpty(group.heading));

  const setPercent = (id: string, text: string) =>
    setDraft((d) => ({ ...d, percents: { ...d.percents, [id]: text } }));
  const setComment = (which: 'mc' | 'sq', side: keyof Side, text: string) =>
    setDraft((d) => ({ ...d, [which]: { ...d[which], [side]: text } }));
  const clearAll = () =>
    setDraft((d) => ({
      percents: Object.fromEntries(Object.keys(d.percents).map((id) => [id, ''])),
      mc: { en: '', zh: '' },
      sq: { en: '', zh: '' },
    }));

  const commentField = (which: 'mc' | 'sq', label: string) => (
    <Field label={label}>
      <div className="grid gap-2 sm:grid-cols-2">
        <textarea
          value={draft[which].en}
          aria-label={`${label} · ${m.english}`}
          placeholder={m.english}
          onChange={(event) => setComment(which, 'en', event.target.value)}
          className={TEXTAREA}
        />
        <textarea
          lang="zh-HK"
          value={draft[which].zh}
          aria-label={`${label} · ${m.chinese}`}
          placeholder={m.chinese}
          onChange={(event) => setComment(which, 'zh', event.target.value)}
          className={TEXTAREA}
        />
      </div>
    </Field>
  );

  const position = new Map(choices.map((choice, at) => [choice.questionId, at]));
  return (
    <Dialog
      title={m.title}
      description={m.description}
      width={640}
      onClose={onClose}
      footer={
        <>
          <Button variant="subtle" onClick={clearAll}>
            {m.clearAll}
          </Button>
          <span className="flex-1" />
          <Button variant="subtle" onClick={onClose}>
            {m.cancel}
          </Button>
          <Button variant="primary" type="submit" form={formId} disabled={invalid}>
            {m.save}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        data-exam-results
        className="space-y-5 px-5 py-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!invalid) onSave(draftResults(draft, worksheet.examResults));
        }}
      >
        <section className="space-y-2">
          <div>
            <h3 className="text-[13px] font-medium text-ink">{m.percentHeading}</h3>
            <p className="text-[11px] text-ink-muted">{choices.length > 0 ? m.percentHint : m.noMc}</p>
          </div>
          {groups.map((group, groupIndex) => (
            <div key={groupIndex} className="space-y-1.5">
              {named && group.heading && !isBiTextEmpty(group.heading) && (
                <p className="text-[11px] font-semibold text-ink-muted">
                  {plain(group.heading.en) || plain(group.heading.zh)}
                </p>
              )}
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-x-3 gap-y-1.5">
                {group.choices.map((choice) => {
                  const at = position.get(choice.questionId) ?? 0;
                  const text = draft.percents[choice.questionId] ?? '';
                  const bad = parsePercent(text) === 'invalid';
                  return (
                    <li key={choice.questionId} data-percent-row={choice.number} className="flex items-center gap-1.5">
                      <span className="w-7 shrink-0 text-right text-[12px] tabular-nums text-ink-muted">{choice.number}.</span>
                      <span
                        className="w-4 shrink-0 text-center text-[13px] font-semibold text-ink"
                        title={choice.letter ? undefined : m.noKey}
                      >
                        {choice.letter ?? UNANSWERED_MARK}
                      </span>
                      <input
                        ref={(element) => {
                          inputs.current[at] = element;
                        }}
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={text}
                        aria-label={m.percentLabel(choice.number)}
                        aria-invalid={bad || undefined}
                        onChange={(event) => setPercent(choice.questionId, event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
                          event.preventDefault();
                          const next = inputs.current[at + 1];
                          if (next) {
                            next.focus();
                            next.select();
                          }
                        }}
                        className={`${INPUT} ${
                          bad ? 'border-danger focus:border-danger focus:ring-danger/25' : 'border-line focus:border-accent focus:ring-accent/25'
                        }`}
                      />
                      <span className="shrink-0 text-[12px] text-ink-muted">%</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {invalid && (
            <p role="alert" className="text-[11px] font-medium text-danger-ink">
              {m.invalid}
            </p>
          )}
        </section>

        <section className="space-y-3">
          <div>
            <h3 className="text-[13px] font-medium text-ink">{m.performanceHeading}</h3>
            <p className="text-[11px] text-ink-muted">{m.performanceHint}</p>
          </div>
          {(choices.length > 0 || draft.mc.en || draft.mc.zh) && commentField('mc', m.mcComments)}
          {(structured || draft.sq.en || draft.sq.zh || choices.length === 0) && commentField('sq', m.sqComments)}
        </section>
      </form>
    </Dialog>
  );
}
