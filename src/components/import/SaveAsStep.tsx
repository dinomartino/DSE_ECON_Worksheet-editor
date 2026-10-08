'use client';

import type { BankChoice } from '@/library/bankDocs';
import type { DocumentType } from '@/model/newWorksheet';
import type { LanguageMode } from '@/model/types';
import { Field } from '@/components/ui/Dialog';
import { BankIcon } from '@/components/ui/icons';
import { PaperSketch } from '@/components/start/PaperSketch';
import { kindText, START_KINDS } from '@/components/start/startKinds';
import type { Messages } from '@/i18n/catalogue';
import { useUiLanguage } from '@/i18n/language';
import type { ChromeLeftover } from '@/import';
import { ChromeLeftovers } from './ChromeReview';
import type { IMPORT_MESSAGES } from './messages';

/** Where an import goes: a new document of a type, or 題庫 only. */
export type Destination = DocumentType | 'bank';

type Text = Messages<typeof IMPORT_MESSAGES>;

const NEW_BANK = '';

/**
 * Save as: the four kinds of paper as the New worksheet gallery draws them, and 題庫 only.
 * A paper takes a name (from the file); 題庫 takes a bank. A type that does not suit the
 * questions says so, and still saves.
 */
export function SaveAsStep({
  text: m,
  destination,
  suggested,
  onDestination,
  name,
  onName,
  banks,
  bankTarget,
  newBankName,
  onBankTarget,
  questions,
  mc,
  language,
  misfit,
  notOnCover,
  onSubmit,
}: {
  text: Text;
  destination: Destination;
  suggested: DocumentType;
  onDestination: (next: Destination) => void;
  name: string;
  onName: (next: string) => void;
  banks: readonly BankChoice[];
  bankTarget: string;
  newBankName: string;
  onBankTarget: (id: string) => void;
  questions: number;
  mc: number;
  language: LanguageMode;
  misfit?: { kind: 'written' | 'mc'; count: number };
  /** On a mock: the file's title block lines the cover has no place for, to copy. */
  notOnCover?: readonly ChromeLeftover[];
  onSubmit: () => void;
}) {
  const lang = useUiLanguage();
  const choices: Array<{ id: Destination; title: string; zh?: string }> = [
    ...START_KINDS.map((kind) => {
      const words = kindText(kind.type, lang);
      return { id: kind.type as Destination, title: words.title, ...(words.bilingual ? { zh: kind.titleZh } : {}) };
    }),
    { id: 'bank', title: m.bankOnly },
  ];
  const languageLabel = language === 'zh' ? m.chinese : language === 'bilingual' ? m.bilingual : m.english;
  return (
    <form
      className="scroll-slim flex min-h-0 flex-1 flex-col overflow-y-auto"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="mx-auto w-full max-w-[760px] space-y-5 px-6 py-6">
        <Field label={m.saveAsTitle}>
          <div role="radiogroup" aria-label={m.saveAsTitle} className="grid grid-cols-5 gap-3">
            {choices.map((choice) => {
              const selected = destination === choice.id;
              return (
                <button
                  key={choice.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => onDestination(choice.id)}
                  className="group flex min-w-0 cursor-pointer flex-col text-left focus-visible:outline-none"
                >
                  <span
                    className={`relative flex aspect-[4/5] items-center justify-center rounded-lg border px-[18%] py-2.5 transition-colors duration-150 ease-out-soft group-focus-visible:ring-2 group-focus-visible:ring-accent ${
                      selected ? 'border-accent bg-accent/5' : 'border-line bg-surface-sunken group-hover:bg-surface-hover'
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`pointer-events-none absolute -inset-px rounded-lg ring-1 ring-accent transition-opacity duration-150 ease-out-soft ${selected ? 'opacity-100' : 'opacity-0'}`}
                    />
                    {choice.id === 'bank' ? (
                      <span className={`transition-colors duration-150 ease-out-soft ${selected ? 'text-accent-ink' : 'text-ink-subtle group-hover:text-accent-ink'}`}>
                        <BankIcon size={30} />
                      </span>
                    ) : (
                      <span className="block w-full overflow-hidden rounded-[2px] shadow-[0_1px_2px_rgba(0,0,0,0.16),0_3px_8px_rgba(0,0,0,0.10)] ring-1 ring-black/5">
                        <PaperSketch type={choice.id} />
                      </span>
                    )}
                  </span>
                  <span
                    className={`mt-1.5 block text-[12px] font-medium leading-snug transition-colors duration-150 ease-out-soft ${
                      selected ? 'text-accent-ink' : 'text-ink group-hover:text-accent-ink'
                    }`}
                  >
                    {choice.title}
                  </span>
                  {choice.zh && (
                    <span lang="zh-HK" className="block text-[11px] leading-snug text-ink-subtle">
                      {choice.zh}
                    </span>
                  )}
                  {choice.id === suggested && <span className="mt-0.5 block text-[10.5px] font-medium text-accent-ink">{m.suggested}</span>}
                </button>
              );
            })}
          </div>
          <p key={destination} className="animate-fade-in text-[11px] leading-snug text-ink-muted">
            {destination === 'bank' ? m.bankOnlyHint : kindText(destination, lang).hint}
          </p>
        </Field>

        {misfit && (
          <p role="status" className="animate-fade-in rounded-lg border border-warn-ink/25 bg-warn-soft px-3 py-2 text-[12.5px] leading-relaxed text-warn-ink">
            {misfit.kind === 'written' ? m.misfitWritten(misfit.count) : m.misfitMc(misfit.count)}
          </p>
        )}

        {destination !== 'bank' && notOnCover?.length ? (
          <div key={destination} className="animate-fade-in">
            <ChromeLeftovers text={m} leftovers={notOnCover} />
          </div>
        ) : null}

        {destination === 'bank' ? (
          <Field label={m.bankTarget}>
            <select
              aria-label={m.bankTarget}
              value={bankTarget}
              onChange={(event) => onBankTarget(event.target.value)}
              className="h-9 w-full max-w-[360px] cursor-pointer truncate rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink outline-none transition-colors duration-150 ease-out-soft hover:border-line-strong focus:border-accent focus:ring-2 focus:ring-accent/25"
            >
              {banks.map((bank) => (
                <option key={bank.id} value={bank.id}>
                  {bank.name}
                </option>
              ))}
              <option value={NEW_BANK}>{m.newBank(newBankName)}</option>
            </select>
          </Field>
        ) : (
          <Field label={m.name} hint={m.nameHint}>
            <input
              type="text"
              value={name}
              aria-label={m.name}
              onChange={(event) => onName(event.target.value)}
              className="h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink outline-none transition-colors duration-150 ease-out-soft placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/25"
            />
          </Field>
        )}

        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 border-t border-line pt-4 text-[12.5px]">
          <dt className="text-ink-muted">{m.summary}</dt>
          <dd className="text-ink">
            {m.questionCount(questions)}
            <span className="text-ink-muted"> · {m.mixCount(mc, questions - mc)}</span>
          </dd>
          {destination !== 'bank' && (
            <>
              <dt className="text-ink-muted">{m.paperLanguage}</dt>
              <dd className="text-ink">{languageLabel}</dd>
            </>
          )}
        </dl>
      </div>
    </form>
  );
}
