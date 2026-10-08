'use client';

import type { FileRole } from '@/import';
import { CloseIcon, DocumentIcon, PdfIcon, WarningIcon } from '@/components/ui/icons';
import { IconButton } from '@/components/ui';
import type { Messages } from '@/i18n/catalogue';
import {
  NO_ANSWERS,
  OWN_ANSWERS,
  REASON_TEXT,
  answerChoices,
  papersOf,
  roleOf,
  type AnswerChoice,
  type BatchFile,
  type Links,
} from './importBatch';
import type { IMPORT_MESSAGES } from './messages';

/**
 * Several files: which are papers and which answers (the engine's guess, with its reasons,
 * and a control to change it), and each paper's answers. Nothing is read again here.
 */

type Text = Messages<typeof IMPORT_MESSAGES>;

const ROLES: ReadonlyArray<readonly [FileRole, 'roleQuestions' | 'roleAnswers' | 'roleBoth', 'roleQuestionsHint' | 'roleAnswersHint' | 'roleBothHint']> = [
  ['questions', 'roleQuestions', 'roleQuestionsHint'],
  ['answers', 'roleAnswers', 'roleAnswersHint'],
  ['both', 'roleBoth', 'roleBothHint'],
];

const PROBLEM_KEY = {
  legacyDoc: 'problemLegacyDoc',
  encrypted: 'problemEncrypted',
  notPaper: 'problemNotPaper',
  unreadable: 'problemUnreadable',
} as const;

const SELECT =
  'h-8 w-full min-w-0 cursor-pointer truncate rounded-lg border border-line bg-surface px-2 text-[12.5px] text-ink outline-none transition-colors duration-150 ease-out-soft hover:border-line-strong focus:border-accent focus:ring-2 focus:ring-accent/25';

export function LinkStep({
  text: m,
  files,
  links,
  answers,
  counts,
  onRole,
  onAnswers,
  onRemove,
  end,
}: {
  text: Text;
  /** The files still in the import. */
  files: readonly BatchFile[];
  links: Links;
  /** Each paper's answers in force (`linkedAnswers`). */
  answers: Record<string, AnswerChoice>;
  /** Questions per readable file, for its row. */
  counts: Record<string, number>;
  onRole: (id: string, role: FileRole) => void;
  onAnswers: (paperId: string, choice: AnswerChoice) => void;
  onRemove: (id: string) => void;
  /** Last in the scroller: the dialog's notice spacer. */
  end?: React.ReactNode;
}) {
  const papers = papersOf(files, links);
  const nameOf = (id: string) => files.find((f) => f.id === id)?.name ?? id;
  const choiceLabel = (choice: AnswerChoice) => (choice === NO_ANSWERS ? m.answersNone : choice === OWN_ANSWERS ? m.answersOwn : nameOf(choice));

  return (
    <div className="scroll-slim flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-[860px] space-y-6 px-6 py-5">
        <p className="text-[13px] leading-relaxed text-ink-muted">{m.linkHint}</p>

        <section aria-labelledby="import-files">
          <h3 id="import-files" className="mb-2 text-[12px] font-semibold text-ink">
            {m.filesHeading}
          </h3>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {files.map((file) => (
              <FileRow key={file.id} text={m} file={file} role={roleOf(file, links)} questions={counts[file.id]} onRole={onRole} onRemove={onRemove} />
            ))}
          </ul>
        </section>

        <section aria-labelledby="import-papers">
          <h3 id="import-papers" className="mb-2 text-[12px] font-semibold text-ink">
            {m.papersHeading}
          </h3>
          {papers.length === 0 ? (
            <p role="status" className="rounded-lg border border-warn-ink/25 bg-warn-soft px-3 py-2 text-[12.5px] text-warn-ink">
              {m.noPapers}
            </p>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
              {papers.map((paper) => {
                const choice = answers[paper.id] ?? NO_ANSWERS;
                return (
                  <li key={paper.id} data-paper={paper.name} className="grid grid-cols-[minmax(0,1fr)_minmax(0,300px)] items-center gap-4 px-4 py-2.5">
                    <p className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-ink" title={paper.name}>
                        {paper.name}
                      </span>
                      {counts[paper.id] !== undefined && <span className="text-[11.5px] text-ink-muted">{m.questionCount(counts[paper.id])}</span>}
                    </p>
                    <label className="flex min-w-0 items-center gap-2 text-[12px] text-ink-muted">
                      <span className="shrink-0">{m.answersFrom}</span>
                      <select
                        aria-label={`${m.answersFrom}: ${paper.name}`}
                        value={choice}
                        onChange={(event) => onAnswers(paper.id, event.target.value)}
                        className={SELECT}
                      >
                        {answerChoices(paper, files, links).map((c) => (
                          <option key={c} value={c}>
                            {choiceLabel(c)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
      {end}
    </div>
  );
}

function FileRow({
  text: m,
  file,
  role,
  questions,
  onRole,
  onRemove,
}: {
  text: Text;
  file: BatchFile;
  role: FileRole;
  questions?: number;
  onRole: (id: string, role: FileRole) => void;
  onRemove: (id: string) => void;
}) {
  const { outcome } = file;
  const pdf = /\.pdf$/i.test(file.name);
  const pages = outcome.pages;
  const reasons = file.guess.reasons.flatMap((r) => (REASON_TEXT[r] && r !== 'noText' ? [m[REASON_TEXT[r]!]] : []));
  const facts = [...(pages ? [m.pages(pages)] : []), ...(outcome.kind === 'ok' && role !== 'answers' && questions !== undefined ? [m.questionCount(questions)] : []), ...reasons];
  const problem =
    outcome.kind === 'problem'
      ? outcome.problem === 'scan'
        ? role === 'answers'
          ? m.scanAnswers(pages ?? 0)
          : m.scanPaper(pages ?? 0)
        : m[PROBLEM_KEY[outcome.problem]]
      : undefined;
  // A scan can only be named; what it holds decides nothing until it can be read.
  const canSetRole = outcome.kind === 'ok' || outcome.problem === 'scan';
  return (
    <li data-file={file.name} className="flex items-start gap-3 px-4 py-3">
      <span aria-hidden className={`mt-0.5 shrink-0 ${pdf ? 'text-danger-ink' : 'text-accent-ink'}`}>
        {pdf ? <PdfIcon size={18} /> : <DocumentIcon size={18} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-ink" title={file.name}>
          {file.name}
        </p>
        {facts.length > 0 && <p className="mt-0.5 text-[11.5px] leading-snug text-ink-muted">{facts.join(' · ')}</p>}
        {problem && (
          <p className="mt-1 flex items-start gap-1.5 text-[12px] leading-snug text-warn-ink">
            <WarningIcon size={13} className="mt-px shrink-0" />
            <span>{problem}</span>
          </p>
        )}
      </div>
      {canSetRole && (
        <span role="radiogroup" aria-label={`${m.roleIs}: ${file.name}`} className="flex shrink-0 overflow-hidden rounded-lg border border-line bg-surface">
          {ROLES.map(([r, label, hint]) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={role === r}
              title={m[hint]}
              onClick={() => onRole(file.id, r)}
              className={`cursor-pointer px-2.5 py-1 text-[12px] transition-colors duration-150 ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
                role === r ? 'bg-accent-soft font-semibold text-accent-ink' : 'text-ink-muted hover:bg-surface-hover hover:text-ink'
              }`}
            >
              {m[label]}
            </button>
          ))}
        </span>
      )}
      <IconButton label={m.removeFile(file.name)} onClick={() => onRemove(file.id)} className="shrink-0">
        <CloseIcon size={13} />
      </IconButton>
    </li>
  );
}
