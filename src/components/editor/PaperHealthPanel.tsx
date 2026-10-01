'use client';

import { useMemo } from 'react';
import {
  checkPaper,
  type HealthFinding,
  type PaperHealthReport,
  type QuestionRef,
} from '@/model/paperHealth';
import type { LanguageMode, VersionMode, Worksheet } from '@/model/types';
import { useGlossary } from '@/glossary/useGlossary';
import { termSummary } from '@/translate/termCheck';
import { PAPER_CHECK_OPEN_AI } from '@/components/translate/copy';
import { resolveMessages } from '@/i18n/catalogue';
import { uiLanguage, useMessages, useUiLanguage } from '@/i18n/language';
import type { UiLanguage } from '@/settings/language';
import { PAPER_CHECK_MESSAGES } from './shell.messages';

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
  return rest > 0 ? `${text.join(', ')} ${resolveMessages(PAPER_CHECK_MESSAGES, uiLanguage()).more(rest)}` : text.join(', ');
}

/** "32 questions · 58 marks · ~70 min estimate · 60 min allowed". */
export function summaryLine(report: PaperHealthReport, lang: UiLanguage = uiLanguage()): string {
  const m = resolveMessages(PAPER_CHECK_MESSAGES, lang);
  const parts = [m.questions(report.questionCount), m.marks(report.totalMarks), m.estimate(report.minutes)];
  if (report.statedMinutes !== undefined) parts.push(m.allowed(report.statedMinutes));
  return parts.join(' · ');
}

/**
 * The pre-print paper check, read-only, for the top of the Export dialog. Chrome only —
 * it never reaches the paper. An all-clear paper reads as one quiet line.
 */
export function PaperHealthPanel({
  worksheet,
  language,
  version,
  onOpenAi,
}: {
  worksheet: Worksheet;
  /** The edition being exported; untranslated strings are judged only for zh / bilingual. */
  language?: LanguageMode;
  version?: VersionMode;
  /** The `untranslated` and `terminology` findings' "Open ✦ AI" link; absent (read-only) → no link. */
  onOpenAi?: (finding: 'untranslated' | 'terminology') => void;
}) {
  const m = useMessages(PAPER_CHECK_MESSAGES);
  const lang = useUiLanguage();
  // No terminology finding until the glossary has loaded.
  const glossary = useGlossary();
  const terms = useMemo(() => (glossary ? termSummary(worksheet, glossary) : undefined), [worksheet, glossary]);
  const report = useMemo(
    () => checkPaper(worksheet, { language, version, terms }),
    [worksheet, language, version, terms],
  );
  const actionFor = ({ id }: HealthFinding): FindingAction | undefined =>
    onOpenAi && (id === 'untranslated' || id === 'terminology')
      ? { label: PAPER_CHECK_OPEN_AI, run: () => onOpenAi(id) }
      : undefined;

  if (report.questionCount === 0) {
    return (
      <p data-print-hide className="text-[11px] text-ink-muted">
        {m.noQuestions}
      </p>
    );
  }

  if (report.findings.length === 0) {
    return (
      <p data-print-hide className="flex items-center gap-1.5 text-[11px] text-ink-muted">
        <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-ok" />
        <span>
          {summaryLine(report, lang)} · <span className="text-ink-subtle">{m.nothingToCheck}</span>
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
      aria-label={m.paperCheck}
      className="space-y-2 rounded-lg border border-line bg-surface-sunken p-2.5 text-[11px] leading-relaxed text-ink-muted"
    >
      <p className="font-medium text-ink">{summaryLine(report, lang)}</p>

      {sections.length > 0 && (
        <p>{sections.map((section) => `${section.label} ${section.marks}`).join(' · ')}</p>
      )}

      {report.letters.keyed > 0 && <LetterBar report={report} flagged={flagged} />}

      <ul className="space-y-1">
        {report.findings.map((finding, index) => (
          <FindingRow key={`${finding.id}-${index}`} finding={finding} action={actionFor(finding)} />
        ))}
      </ul>
    </section>
  );
}

/** Key counts per letter, each over a hairline bar scaled to the most-used letter. */
function LetterBar({ report, flagged }: { report: PaperHealthReport; flagged: Set<string> }) {
  const m = useMessages(PAPER_CHECK_MESSAGES);
  const { letters, counts } = report.letters;
  const most = Math.max(1, ...letters.map((letter) => counts[letter]));
  return (
    <div className="flex gap-2" aria-label={m.keyLetters}>
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

type FindingAction = { label: string; run: () => void };

function FindingRow({ finding, action }: { finding: HealthFinding; action?: FindingAction }) {
  const m = useMessages(PAPER_CHECK_MESSAGES);
  const warn = finding.severity === 'warn';
  const refs = formatRefs(finding.questions);
  return (
    <li className="flex gap-1.5">
      <span
        aria-label={warn ? m.warning : m.note}
        className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${warn ? 'bg-warn-ink' : 'bg-line-strong'}`}
      />
      <span className={warn ? 'text-ink' : ''}>
        {finding.message}
        {refs && <span className="text-ink-subtle"> {refs}</span>}
        {action && (
          <>
            {' '}
            <button
              type="button"
              onClick={action.run}
              className="cursor-pointer font-medium text-accent-ink underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
            >
              {action.label}
            </button>
          </>
        )}
      </span>
    </li>
  );
}
