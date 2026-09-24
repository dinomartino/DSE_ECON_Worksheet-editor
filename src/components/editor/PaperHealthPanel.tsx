'use client';

import { useMemo } from 'react';
import {
  checkPaper,
  type HealthFinding,
  type PaperHealthReport,
  type QuestionRef,
} from '@/model/paperHealth';
import type { LanguageMode, Worksheet } from '@/model/types';

export { countWarnings } from '@/model/paperHealth';

/**
 * Question refs as one short line: consecutive numbers collapse to a range, a section
 * prefix prints once per run of its section, and past `max` groups the rest is a count.
 */
export function formatRefs(refs: QuestionRef[] | undefined, max = 8): string {
  if (!refs || refs.length === 0) return '';
  const groups: Array<{ prefix: string; from: number; to: number }> = [];
  for (const ref of refs) {
    const prefix = ref.label.slice(0, ref.label.length - `Q${ref.number}`.length);
    const last = groups[groups.length - 1];
    if (last && last.prefix === prefix && ref.number === last.to + 1) last.to = ref.number;
    else groups.push({ prefix, from: ref.number, to: ref.number });
  }
  const text = groups.slice(0, max).map((group, index) => {
    const lead = index > 0 && groups[index - 1].prefix === group.prefix ? '' : group.prefix;
    return group.from === group.to ? `${lead}Q${group.from}` : `${lead}Q${group.from}–Q${group.to}`;
  });
  const rest = groups.slice(max).reduce((sum, group) => sum + group.to - group.from + 1, 0);
  return rest > 0 ? `${text.join(', ')} +${rest} more` : text.join(', ');
}

/** "32 questions · 58 marks · ~70 min estimate · 60 min allowed". */
export function summaryLine(report: PaperHealthReport): string {
  const parts = [
    `${report.questionCount} ${report.questionCount === 1 ? 'question' : 'questions'}`,
    `${report.totalMarks} ${report.totalMarks === 1 ? 'mark' : 'marks'}`,
    `~${report.minutes} min estimate`,
  ];
  if (report.statedMinutes !== undefined) parts.push(`${report.statedMinutes} min allowed`);
  return parts.join(' · ');
}

/**
 * The pre-print paper check, read-only, for the top of the Export dialog. Chrome only —
 * it never reaches the paper. An all-clear paper reads as one quiet line.
 */
export function PaperHealthPanel({
  worksheet,
  language,
}: {
  worksheet: Worksheet;
  /** The edition being exported; untranslated strings are judged only for zh / bilingual. */
  language?: LanguageMode;
}) {
  const report = useMemo(() => checkPaper(worksheet, { language }), [worksheet, language]);

  if (report.questionCount === 0) {
    return (
      <p data-print-hide className="text-[11px] text-ink-muted">
        No questions yet.
      </p>
    );
  }

  if (report.findings.length === 0) {
    return (
      <p data-print-hide className="flex items-center gap-1.5 text-[11px] text-ink-muted">
        <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-ok" />
        <span>
          {summaryLine(report)} · <span className="text-ink-subtle">nothing to check</span>
        </span>
      </p>
    );
  }

  const flagged = new Set(
    report.findings.flatMap((finding) =>
      finding.id === 'letterBalance' && finding.letter ? [finding.letter] : [],
    ),
  );
  const sections = report.sections.length > 1 ? report.sections : [];

  return (
    <section
      data-print-hide
      aria-label="Paper check"
      className="space-y-2 rounded-lg border border-line bg-surface-sunken p-2.5 text-[11px] leading-relaxed text-ink-muted"
    >
      <p className="font-medium text-ink">{summaryLine(report)}</p>

      {sections.length > 0 && (
        <p>{sections.map((section) => `${section.label} ${section.marks}`).join(' · ')}</p>
      )}

      {report.letters.keyed > 0 && <LetterBar report={report} flagged={flagged} />}

      <ul className="space-y-1">
        {report.findings.map((finding, index) => (
          <FindingRow key={`${finding.id}-${index}`} finding={finding} />
        ))}
      </ul>
    </section>
  );
}

/** Key counts per letter, each over a hairline bar scaled to the most-used letter. */
function LetterBar({ report, flagged }: { report: PaperHealthReport; flagged: Set<string> }) {
  const { letters, counts } = report.letters;
  const most = Math.max(1, ...letters.map((letter) => counts[letter]));
  return (
    <div className="flex gap-2" aria-label="Answer key letters">
      {letters.map((letter) => {
        const warn = flagged.has(letter);
        return (
          <div key={letter} className="w-9 space-y-0.5">
            <div className={warn ? 'font-semibold tabular-nums text-warn-ink' : 'tabular-nums'}>
              {letter} <span className={warn ? '' : 'text-ink'}>{counts[letter]}</span>
            </div>
            <div className="h-[3px] rounded-full bg-line">
              <div
                className={`h-full rounded-full ${warn ? 'bg-warn-ink' : 'bg-ink-subtle'}`}
                style={{ width: `${(counts[letter] / most) * 100}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FindingRow({ finding }: { finding: HealthFinding }) {
  const warn = finding.severity === 'warn';
  const refs = formatRefs(finding.questions);
  return (
    <li className="flex gap-1.5">
      <span
        aria-label={warn ? 'Warning' : 'Note'}
        className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${warn ? 'bg-warn-ink' : 'bg-line-strong'}`}
      />
      <span className={warn ? 'text-ink' : ''}>
        {finding.message}
        {refs && <span className="text-ink-subtle"> {refs}</span>}
      </span>
    </li>
  );
}
