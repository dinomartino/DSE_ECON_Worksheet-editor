'use client';

import { useMemo } from 'react';
import { useMessages } from '@/i18n/language';
import { plain } from '@/model/text';
import { toRuns } from '@/generate/validate';
import { useStudio } from '@/questionStudio/live';
import { CHECK_IDS, type CheckRow, type Finding } from '@/questionStudio/types';
import { findingText } from './findings';
import { STUDIO_FINDING_MESSAGES } from './findings.messages';
import { QUESTION_STUDIO_MESSAGES } from './messages';
import { CHECK_LABEL, Chip, StateGlyph, stateWord, toneOf } from './parts';
import { partition, tokenCount } from './studioView';

/**
 * The right column: what was checked on the draft in focus, in words, row by row: format,
 * the key (a fresh solve from the text alone), numbers across both languages, EDB terms,
 * the syllabus's limits, question quality and near-copy. Below: notes about the whole batch,
 * what the near-copy check compared with, and what this session has used.
 */
export function ChecksPanel() {
  const m = useMessages(QUESTION_STUDIO_MESSAGES);
  const f = useMessages(STUDIO_FINDING_MESSAGES);
  const entries = useStudio((s) => s.entries);
  const focus = useStudio((s) => s.focus);
  const notes = useStudio((s) => s.notes);
  const compared = useStudio((s) => s.compared);
  const usage = useStudio((s) => s.usage);
  const model = useStudio((s) => s.model);
  const entry = entries.find((e) => e.draft.id === focus);
  const number = useMemo(() => {
    const at = partition(entries).standing.findIndex((e) => e.draft.id === focus);
    return at < 0 ? undefined : at + 1;
  }, [entries, focus]);
  const words = (finding: Finding) => findingText(finding, f);

  return (
    <aside aria-label={m.checks} className="flex flex-col gap-5 px-4 py-4 text-[12.5px]" data-studio-checks>
      <section>
        <h2 className="text-[13px] font-semibold text-ink">
          {m.checks}
          {entry && number !== undefined && <span className="ml-2 font-normal text-ink-subtle">{m.checksFor(number)}</span>}
        </h2>
        {!entry ? (
          <p className="mt-2 leading-relaxed text-ink-muted">{m.checksNone}</p>
        ) : (
          <ul className="mt-2 flex flex-col divide-y divide-line border-y border-line">
            {CHECK_IDS.map((id) => {
              const row = entry.draft.checks.find((c) => c.id === id);
              return row ? <CheckLine key={id} row={row} solve={id === 'key' ? entry.draft.solve : undefined} words={words} /> : null;
            })}
          </ul>
        )}
      </section>

      {entry && entry.request.examples.length > 0 && (
        <section data-studio-written-like>
          <h2 className="text-[13px] font-semibold text-ink">{m.writtenLike}</h2>
          <p className="mt-1 text-[11.5px] leading-relaxed text-ink-subtle">{entry.request.examples.every((e) => e.auto) ? m.writtenLikeAuto : m.writtenLikePicked}</p>
          <ul className="mt-1.5 flex flex-col gap-0.5 leading-relaxed text-ink-muted">
            {entry.request.examples.map((example) => (
              <li key={example.id}>{example.label}</li>
            ))}
          </ul>
        </section>
      )}

      {notes.length > 0 && (
        <section data-studio-notes>
          <h2 className="text-[13px] font-semibold text-ink">{m.batchNotes}</h2>
          <ul className="mt-2 flex flex-col gap-1.5 leading-relaxed text-ink-muted">
            {notes.map((note, i) => (
              <li key={`${note.id}:${i}`}>{words(note)}</li>
            ))}
          </ul>
        </section>
      )}

      <footer className="flex flex-col gap-1.5 text-[11.5px] leading-relaxed text-ink-subtle">
        {compared && entries.length > 0 && <p>{compared.past === null ? m.comparedMineOnly(compared.mine) : m.comparedWith(compared.past, compared.mine)}</p>}
        {usage.requests > 0 && (
          <p className="tabular-nums" data-studio-usage>
            {m.usage(usage.requests, tokenCount(usage.input), tokenCount(usage.output))}
            {model ? ` · ${model}` : ''}
          </p>
        )}
      </footer>
    </aside>
  );
}

function CheckLine({ row, solve, words }: { row: CheckRow; solve?: { working: string }; words: (finding: Finding) => string }) {
  const m = useMessages(QUESTION_STUDIO_MESSAGES);
  const label = m[CHECK_LABEL[row.id]];
  const working = solve?.working ? plain(toRuns(solve.working)).trim() : '';
  return (
    <li className="py-2.5" data-check-row={row.id} data-state={row.state}>
      <div className="flex items-center gap-2">
        <span className="font-medium text-ink">{label}</span>
        <span className="flex-1" />
        {row.value !== undefined && <span className="tabular-nums text-ink-subtle">{m.copyValue(row.value)}</span>}
        <Chip tone={toneOf(row.state)}>
          <StateGlyph state={row.state} />
          {stateWord(m, row.state)}
        </Chip>
      </div>
      {row.findings.length > 0 && (
        <ul className="mt-1.5 flex flex-col gap-1.5 leading-relaxed text-ink-muted">
          {row.findings.map((finding, i) => (
            <li key={`${finding.id}:${i}`}>{words(finding)}</li>
          ))}
        </ul>
      )}
      {row.id === 'key' && (
        <>
          {row.state !== 'look' && <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-subtle">{m.keyHelp}</p>}
          {working && (
            <details className="mt-1.5 text-[11.5px] text-ink-muted">
              <summary className="cursor-pointer select-none">{m.solverWorking}</summary>
              <p className="mt-1 whitespace-pre-wrap break-words leading-relaxed">{working}</p>
            </details>
          )}
        </>
      )}
    </li>
  );
}
