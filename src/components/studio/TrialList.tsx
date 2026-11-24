'use client';

import { useMemo, useState } from 'react';
import { PastPaperSheet, pastPaperSheetWidth } from '@/components/pastpapers/PastPaperSheet';
import { Segmented } from '@/components/ui';
import { useMessages } from '@/i18n/language';
import { topicNamesFor } from '@/model/topics';
import { createWorksheet } from '@/model/factories';
import { useTrialLog } from '@/questionStudio/live';
import { isBriefLabel, isMarked, shownDrafts } from '@/questionStudio/trialLog';
import { CHECK_IDS, type Finding } from '@/questionStudio/types';
import { findingText } from './findings';
import { STUDIO_FINDING_MESSAGES } from './findings.messages';
import { QUESTION_STUDIO_MESSAGES } from './messages';
import { CHECK_LABEL, Chip, StateGlyph, stateWord, toneOf } from './parts';
import { draftItem, explanationLines, letterOf } from './studioView';
import { STUDIO_TRIAL_MESSAGES } from './trial.messages';
import { TrialMarks } from './TrialMarks';
import { keyPointLabel, languageOfSides, readingList, sheetDraftOf, type ListFilter, type ListItem } from './trialView';

/** The frame every preview is drawn in: its page, fonts and size (the question's own words are the draft's). */
const FRAME = createWorksheet();
/** The list's widest: a card's paper at page width, its `p-3` and border, so no empty band (k-0546). */
const LIST_WIDTH = pastPaperSheetWidth(FRAME, true) + 2 * 12 + 2;

/**
 * The trial kit's middle column: every draft the studio showed, from the 30 invented briefs
 * and from the teacher's own requests, each drawn as it prints with its key, its checks and
 * the two marks to give it. Read from the record (`trialLog.ts`), so it is all still here
 * after a reload; the default view lists what is not marked yet, so the top card is the next
 * one to read.
 */
export function TrialList() {
  const t = useMessages(STUDIO_TRIAL_MESSAGES);
  const runs = useTrialLog((s) => s.runs);
  const [filter, setFilter] = useState<ListFilter>('todo');
  const shown = useMemo(() => shownDrafts(runs), [runs]);
  const marked = useMemo(() => shown.filter(({ entry }) => isMarked(entry)).length, [shown]);
  const items = useMemo(() => readingList(runs, filter), [runs, filter]);

  return (
    <div className="mx-auto flex flex-col gap-4" style={{ maxWidth: LIST_WIDTH }} data-trial-list>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-[15px] font-semibold text-ink">{t.listTitle}</h2>
        <span className="text-[12px] tabular-nums text-ink-subtle" role="status">
          {t.listCount(items.length, marked, shown.length)}
        </span>
        <span className="flex-1" />
        <Segmented<ListFilter>
          label={t.show}
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'todo', label: t.filterTodo },
            { value: 'all', label: t.filterAll },
            { value: 'briefs', label: t.filterBriefs },
            { value: 'mine', label: t.filterMine },
          ]}
        />
      </div>

      {items.length === 0 ? (
        <p className="mx-auto max-w-[520px] px-6 py-12 text-center text-[13px] leading-relaxed text-ink-muted" data-trial-empty>
          {shown.length === 0 ? t.listEmpty : t.listDone}
        </p>
      ) : (
        items.map((item) => <TrialCard key={`${item.run.id}:${item.entry.id}`} item={item} />)
      )}
    </div>
  );
}

function TrialCard({ item }: { item: ListItem }) {
  const { run, entry } = item;
  const m = useMessages(QUESTION_STUDIO_MESSAGES);
  const t = useMessages(STUDIO_TRIAL_MESSAGES);
  const f = useMessages(STUDIO_FINDING_MESSAGES);
  const sheet = useMemo(() => sheetDraftOf(run, entry), [run, entry]);
  const preview = useMemo(() => draftItem(sheet), [sheet]);
  const why = explanationLines(entry.draft.draft, run.request.sides);
  const look = entry.draft.status === 'look';
  const flagged = entry.draft.checks.flatMap((row) => (row.state === 'look' ? row.findings : []));
  const words = (finding: Finding) => findingText(finding, f);
  const level = run.request.level === 'same' ? m.levelSame : run.request.level === 'harder' ? m.levelHarder : m.levelEasier;
  const shape = run.request.shape === 'plain' ? m.shapePlain : run.request.shape === 'combination' ? m.shapeCombination : m.shapeAny;
  const languages = run.request.sides.length === 2 ? `${m.langEn} + ${m.langZh}` : run.request.sides[0] === 'zh' ? m.langZh : m.langEn;

  return (
    <article data-trial-draft={entry.id} data-marked={isMarked(entry)} className="rounded-xl border border-line bg-surface p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 px-1">
        <Chip tone="idle">{isBriefLabel(run.label) ? t.cardBrief(run.label) : t.cardMine}</Chip>
        <span className="min-w-0 truncate text-[12px] text-ink-muted">{t.asked(keyPointLabel(run.request.keyPoint, topicNamesFor(languageOfSides(run.request.sides))), level, shape, languages)}</span>
        <span className="flex-1" />
        <Chip tone={look ? 'look' : 'ok'}>{look ? m.statusLook : m.statusOk}</Chip>
        <span className="shrink-0 rounded-md bg-surface-sunken px-2 py-0.5 text-[11.5px] font-medium text-ink">{m.key(letterOf(entry.draft.draft.answerIndex))}</span>
      </div>

      {preview ? <PastPaperSheet item={preview} doc={FRAME} language={languageOfSides(run.request.sides)} compact /> : <p className="px-1 py-3 text-[12.5px] text-ink-muted">{m.noPreview}</p>}

      {why.length > 0 && (
        <div className="mt-2.5 space-y-0.5 px-1 text-[12.5px] leading-relaxed text-ink-muted">
          {why.map((line, i) => (
            <p key={i}>
              {i === 0 && <span className="mr-1.5 font-medium text-ink">{m.why}</span>}
              {line}
            </p>
          ))}
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 px-1" role="group" aria-label={m.checks}>
        {CHECK_IDS.map((id) => {
          const row = entry.draft.checks.find((c) => c.id === id);
          if (!row) return null;
          const label = m[CHECK_LABEL[id]];
          return (
            <Chip key={id} tone={toneOf(row.state)} title={`${label}: ${stateWord(m, row.state)}`}>
              <StateGlyph state={row.state} />
              {label}
              {row.value !== undefined && <span className="tabular-nums">{row.value}%</span>}
            </Chip>
          );
        })}
      </div>
      {flagged.length > 0 && (
        <ul className="mt-2 flex flex-col gap-0.5 px-1 text-[12px] leading-relaxed text-ink-muted">
          {flagged.map((finding, i) => (
            <li key={i}>{words(finding)}</li>
          ))}
        </ul>
      )}

      <TrialMarks entry={entry} />
    </article>
  );
}
