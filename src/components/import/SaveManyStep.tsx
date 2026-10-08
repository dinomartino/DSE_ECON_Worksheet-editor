'use client';

import type { BankChoice } from '@/library/bankDocs';
import type { DocumentType } from '@/model/newWorksheet';
import { Field } from '@/components/ui/Dialog';
import { Segmented } from '@/components/ui';
import { kindText, START_KINDS } from '@/components/start/startKinds';
import type { Messages } from '@/i18n/catalogue';
import { useUiLanguage } from '@/i18n/language';
import type { ChromeLeftover } from '@/import';
import { ChromeLeftovers } from './ChromeReview';
import type { IMPORT_MESSAGES } from './messages';

/**
 * Save as for several papers: each becomes a new paper of its own type (the suggestion
 * first) under a name from its file; or all go to 題庫. Nothing is written before Save.
 */

type Text = Messages<typeof IMPORT_MESSAGES>;

export interface PaperToSave {
  id: string;
  fileName: string;
  name: string;
  type: DocumentType;
  suggested: DocumentType;
  questions: number;
  /** Questions that carry an answer or scheme. */
  answered: number;
  misfit?: { kind: 'written' | 'mc'; count: number };
  /** On a mock: the file's title block lines the cover has no place for. */
  notOnCover?: ChromeLeftover[];
}

const NEW_BANK = '';
const FIELD =
  'h-8 w-full min-w-0 rounded-lg border border-line bg-surface px-2 text-[12.5px] text-ink outline-none transition-colors duration-150 ease-out-soft hover:border-line-strong focus:border-accent focus:ring-2 focus:ring-accent/25';

export function SaveManyStep({
  text: m,
  papers,
  bankOnly,
  onBankOnly,
  onName,
  onType,
  banks,
  bankTarget,
  newBankName,
  onBankTarget,
  onSubmit,
  end,
}: {
  text: Text;
  papers: readonly PaperToSave[];
  bankOnly: boolean;
  onBankOnly: (next: boolean) => void;
  onName: (id: string, name: string) => void;
  onType: (id: string, type: DocumentType) => void;
  banks: readonly BankChoice[];
  bankTarget: string;
  newBankName: string;
  onBankTarget: (id: string) => void;
  onSubmit: () => void;
  /** Last in the scroller: the dialog's notice spacer. */
  end?: React.ReactNode;
}) {
  const lang = useUiLanguage();
  const total = papers.reduce((n, p) => n + p.questions, 0);
  return (
    <form
      className="scroll-slim flex min-h-0 flex-1 flex-col overflow-y-auto"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="mx-auto w-full max-w-[860px] space-y-5 px-6 py-6">
        <Field label={m.saveAsTitle}>
          <Segmented
            label={m.saveAsTitle}
            value={bankOnly ? 'bank' : 'papers'}
            options={[
              { value: 'papers', label: m.newPapers(papers.length) },
              { value: 'bank', label: m.bankOnly },
            ]}
            onChange={(next) => onBankOnly(next === 'bank')}
          />
        </Field>

        {bankOnly ? (
          <>
            <p className="text-[12px] leading-snug text-ink-muted">{m.bankOnlyHint}</p>
            <Field label={m.bankTarget}>
              <select aria-label={m.bankTarget} value={bankTarget} onChange={(event) => onBankTarget(event.target.value)} className={`${FIELD} max-w-[360px] cursor-pointer`}>
                {banks.map((bank) => (
                  <option key={bank.id} value={bank.id}>
                    {bank.name}
                  </option>
                ))}
                <option value={NEW_BANK}>{m.newBank(newBankName)}</option>
              </select>
            </Field>
            <p className="text-[12.5px] text-ink">{m.questionCount(total)}</p>
          </>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {papers.map((paper) => (
              <li key={paper.id} data-save-paper={paper.fileName} className="space-y-1.5 px-4 py-3">
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,300px)] items-end gap-3">
                  <label className="block min-w-0">
                    <span className="mb-1 block truncate text-[11px] text-ink-muted" title={paper.fileName}>
                      {m.name} · {paper.fileName}
                    </span>
                    <input type="text" value={paper.name} aria-label={`${m.name}: ${paper.fileName}`} onChange={(event) => onName(paper.id, event.target.value)} className={FIELD} />
                  </label>
                  <label className="block min-w-0">
                    <span className="mb-1 block text-[11px] text-ink-muted">{m.paperType}</span>
                    <select
                      aria-label={`${m.paperType}: ${paper.fileName}`}
                      value={paper.type}
                      onChange={(event) => onType(paper.id, event.target.value as DocumentType)}
                      className={`${FIELD} cursor-pointer truncate`}
                    >
                      {START_KINDS.map((kind) => {
                        const title = kindText(kind.type, lang).title;
                        return (
                          <option key={kind.type} value={kind.type}>
                            {kind.type === paper.suggested ? m.suggestedType(title) : title}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                </div>
                <p className="text-[11.5px] text-ink-muted">{m.paperSummary(paper.questions, paper.answered)}</p>
                {paper.misfit && (
                  <p role="status" className="text-[11.5px] leading-snug text-warn-ink">
                    {paper.misfit.kind === 'written' ? m.misfitWritten(paper.misfit.count) : m.misfitMc(paper.misfit.count)}
                  </p>
                )}
                {paper.notOnCover?.length ? (
                  <details className="text-[11.5px]">
                    <summary className="cursor-pointer text-ink-muted transition-colors duration-150 ease-out-soft hover:text-ink">{m.notOnCover(paper.notOnCover.length)}</summary>
                    <div className="mt-1.5">
                      <ChromeLeftovers text={m} leftovers={paper.notOnCover} />
                    </div>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11.5px] text-ink-subtle">{m.nothingWritten}</p>
      </div>
      {end}
    </form>
  );
}
