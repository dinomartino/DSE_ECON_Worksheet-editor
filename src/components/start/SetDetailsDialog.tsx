'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui';
import { Dialog, Field } from '@/components/ui/Dialog';
import { WarningIcon } from '@/components/ui/icons';
import { useMessages } from '@/i18n/language';
import { normaliseClassName, parseClasses } from '@/model/classes';
import { setRoleOf } from '@/model/paperSet';
import {
  detailDrift,
  paperDetails,
  startingDetails,
  type DetailsPatch,
  type DetailText,
  type Drift,
  type SetDetail,
} from '@/model/setDetails';
import type { Worksheet } from '@/model/types';
import { worksheetTitle } from '@/storage';
import { SET_DETAILS_MESSAGES } from './SetDetailsDialog.messages';
import { SET_MESSAGES } from './sets.messages';

const INPUT =
  'h-9 w-full min-w-0 rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink outline-none transition-colors duration-150 ease-out-soft placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/25';

/** Classes as the box shows them, and back: "6A 6B". */
const classesText = (classes: readonly string[]) => classes.join(' ');
const classesOf = (text: string) => parseClasses(text).classes.map(normaliseClassName);

/**
 * The detail values as the dialog holds them, and which ones the teacher changed: only those
 * are written (`DetailsPatch`), so opening the dialog to rename the set never rewrites a cover.
 */
export interface DetailsDraft {
  name: string;
  school: DetailText;
  exam: DetailText;
  satOn: string;
  classes: string;
  touched: ReadonlySet<SetDetail>;
}

export function draftPatch(draft: DetailsDraft): DetailsPatch {
  const patch: DetailsPatch = {};
  if (draft.touched.has('school')) patch.school = { en: draft.school.en.trim(), zh: draft.school.zh.trim() };
  if (draft.touched.has('exam')) patch.exam = { en: draft.exam.en.trim(), zh: draft.exam.zh.trim() };
  if (draft.touched.has('satOn')) patch.satOn = draft.satOn;
  if (draft.touched.has('classes')) patch.classes = classesOf(draft.classes);
  return patch;
}

/**
 * Set details (k-0299 step B): the set's name and the details kept in step across its papers
 * (school, examination line, date sat, classes). Opened from a set's ⋯ on the start screen or
 * the editor's set strip, with every member loaded. Where the papers disagree it says so,
 * paper by paper, with "Use … on every paper". Apply writes the set name and the details the
 * teacher changed to every paper; a paper whose cover has no such line keeps its own.
 */
export function SetDetailsDialog({
  name,
  papers,
  onClose,
  onApply,
}: {
  name: string;
  /** Every member, as stored (the open one as the editor holds it). */
  papers: readonly Worksheet[];
  onClose: () => void;
  onApply: (name: string, patch: DetailsPatch) => void;
}) {
  const m = useMessages(SET_DETAILS_MESSAGES);
  const sm = useMessages(SET_MESSAGES);
  const [draft, setDraft] = useState<DetailsDraft>(() => {
    const start = startingDetails(papers);
    return {
      name,
      school: start.school ?? { en: '', zh: '' },
      exam: start.exam ?? { en: '', zh: '' },
      satOn: start.satOn ?? '',
      classes: classesText(start.classes),
      touched: new Set(),
    };
  });
  const drift = useMemo(() => detailDrift(papers), [papers]);
  const ordered = useMemo(
    () => [...papers].sort((a, b) => (setRoleOf(a) === 'paper1' ? 0 : 1) - (setRoleOf(b) === 'paper1' ? 0 : 1)),
    [papers],
  );
  const roleOf = (paper: Worksheet) => {
    const role = setRoleOf(paper);
    return role === 'paper1' ? sm.paper1 : role === 'paper2' ? sm.paper2 : sm.examPaper;
  };
  const titleOf = (id: string) => {
    const paper = papers.find((p) => p.id === id);
    return paper ? `${roleOf(paper)} · ${worksheetTitle(paper)}` : id;
  };
  const change = <K extends 'school' | 'exam' | 'satOn' | 'classes'>(field: K, value: DetailsDraft[K]) =>
    setDraft((d) => ({ ...d, [field]: value, touched: new Set([...d.touched, field]) }));
  const fieldLabel: Record<SetDetail, string> = { school: m.school, exam: m.exam, satOn: m.satOn, classes: m.classes };
  const applySuggestion = (d: Drift) => {
    const s = d.suggestion;
    if (s === undefined) return;
    if (d.field === 'school' || d.field === 'exam') change(d.field, s as DetailText);
    else if (d.field === 'satOn') change('satOn', s as string);
    else change('classes', classesText(s as string[]));
  };
  const suggestionText = (d: Drift) => {
    const s = d.suggestion;
    if (s === undefined) return undefined;
    if (typeof s === 'string') return s;
    if (Array.isArray(s)) return classesText(s);
    return s.en || s.zh;
  };
  const trimmed = draft.name.trim();
  const formId = 'set-details-form';

  return (
    <Dialog
      title={m.title}
      description={m.description}
      width={560}
      onClose={onClose}
      footer={
        <>
          <Button variant="subtle" onClick={onClose}>
            {m.cancel}
          </Button>
          <Button variant="primary" type="submit" form={formId} disabled={!trimmed}>
            {m.apply}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        data-set-details
        className="space-y-4 px-5 py-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (trimmed) onApply(trimmed, draftPatch(draft));
        }}
      >
        <Field label={m.setName}>
          <input
            type="text"
            value={draft.name}
            aria-label={m.setName}
            onChange={(event) => setDraft((d) => ({ ...d, name: event.target.value }))}
            className={INPUT}
          />
        </Field>

        {(['school', 'exam'] as const).map((field) => (
          <Field key={field} label={fieldLabel[field]} hint={field === 'school' ? m.schoolHint : m.examHint}>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                type="text"
                value={draft[field].en}
                aria-label={`${fieldLabel[field]} · ${m.english}`}
                placeholder={m.english}
                onChange={(event) => change(field, { ...draft[field], en: event.target.value })}
                className={INPUT}
              />
              <input
                type="text"
                lang="zh-HK"
                value={draft[field].zh}
                aria-label={`${fieldLabel[field]} · ${m.chinese}`}
                placeholder={m.chinese}
                onChange={(event) => change(field, { ...draft[field], zh: event.target.value })}
                className={INPUT}
              />
            </div>
          </Field>
        ))}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={m.satOn}>
            <input
              type="date"
              value={draft.satOn}
              aria-label={m.satOn}
              onChange={(event) => change('satOn', event.target.value)}
              className={INPUT}
            />
          </Field>
          <Field label={m.classes}>
            <input
              type="text"
              value={draft.classes}
              aria-label={m.classes}
              placeholder={m.classesPlaceholder}
              onChange={(event) => change('classes', event.target.value)}
              className={INPUT}
            />
          </Field>
        </div>
        <p className="-mt-2 text-[11px] leading-snug text-ink-subtle">{m.whoHint}</p>

        {drift.length > 0 && (
          <section aria-label={m.differs} data-set-drift className="space-y-2.5 rounded-lg bg-warn-soft px-3 py-2.5 text-warn-ink">
            <p className="flex items-center gap-1.5 text-[12px] font-semibold">
              <WarningIcon size={14} />
              {m.differs}
            </p>
            {drift.map((d) => {
              const offer = suggestionText(d);
              const done = draft.touched.has(d.field);
              return (
                <div key={d.field} data-drift={d.field} className="text-[12px] leading-snug">
                  <p className="font-medium">{fieldLabel[d.field]}</p>
                  <ul className="mt-0.5 space-y-0.5 opacity-90">
                    {d.values.map((v) => (
                      <li key={v.id} className="truncate">
                        {m.says(
                          titleOf(v.id),
                          v.value ?? ((d.field === 'school' || d.field === 'exam') ? m.noLineShort : m.nothing),
                        )}
                      </li>
                    ))}
                  </ul>
                  {d.field === 'satOn' && <p className="mt-0.5 opacity-80">{m.datesNote}</p>}
                  {offer && !done && (
                    <button
                      type="button"
                      onClick={() => applySuggestion(d)}
                      className="mt-1 cursor-pointer text-[12px] font-medium underline decoration-current/40 underline-offset-4 hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      {m.useOnEvery(offer)}
                    </button>
                  )}
                  {done && <p className="mt-1 font-medium">{m.willApply}</p>}
                </div>
              );
            })}
          </section>
        )}

        <Field label={m.papers}>
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface text-[12.5px]">
            {ordered.map((paper) => {
              const details = paperDetails(paper);
              const missing = (['school', 'exam'] as const).filter((field) => !details[field]);
              return (
                <li key={paper.id} className="px-2.5 py-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 text-[11px] font-semibold text-ink-muted">{roleOf(paper)}</span>
                    <span className="min-w-0 truncate text-ink">{worksheetTitle(paper)}</span>
                  </span>
                  {missing.map((field) => (
                    <span key={field} className="mt-0.5 block text-[11px] text-ink-subtle">
                      {m.noLine(fieldLabel[field].toLowerCase())}
                    </span>
                  ))}
                </li>
              );
            })}
          </ul>
        </Field>
      </form>
    </Dialog>
  );
}
