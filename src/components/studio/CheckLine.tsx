'use client';

import { useMessages } from '@/i18n/language';
import { plain } from '@/model/text';
import { toRuns } from '@/generate/validate';
import type { CheckRow, Finding } from '@/questionStudio/types';
import { QUESTION_STUDIO_MESSAGES } from './messages';
import { CHECK_LABEL, Chip, StateGlyph, stateWord, toneOf } from './parts';

/** One check of a draft in words: its state, what it found, and for the key the solver's working. */
export function CheckLine({ row, solve, words }: { row: CheckRow; solve?: { working: string }; words: (finding: Finding) => string }) {
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
