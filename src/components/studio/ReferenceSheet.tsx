'use client';

import { PastPaperSheet } from '@/components/pastpapers/PastPaperSheet';
import { useMessages } from '@/i18n/language';
import { createWorksheet } from '@/model/factories';
import type { LanguageMode, Worksheet } from '@/model/types';
import type { PastPaperItem } from '@/pastpapers/pack';
import type { SourceQuestion } from '@/questionStudio/types';
import { REFERENCE_PICKER_MESSAGES } from './picker.messages';

const FRAME = createWorksheet();
const LETTERS = 'ABCD';

const textOf = (t: { en: string; zh: string } | undefined, language: LanguageMode) => (t ? (language === 'zh' ? t.zh || t.en : t.en || t.zh).trim() : '');

/**
 * One reference question as the teacher reads it (k-0529 picker preview, k-0533 badge
 * preview): its name, the answer when known, the question drawn as it prints (stem, options,
 * diagram, table, shared passage) when its printed form is at hand, else its words, and its
 * explanation when it has one. On-paper content keeps the paper's own literal colours.
 */
export function ReferenceSheet({
  reference,
  item,
  doc,
  language,
}: {
  reference: SourceQuestion;
  /** The printed form (a past-paper item, or one of the teacher's questions dressed as one). */
  item?: PastPaperItem;
  /** The document whose fonts and page it prints in; a blank one when absent. */
  doc?: Worksheet;
  language: LanguageMode;
}) {
  const m = useMessages(REFERENCE_PICKER_MESSAGES);
  const key = reference.answerIndex >= 0 ? LETTERS[reference.answerIndex] : undefined;
  const explanation = textOf(reference.explanation, language);
  return (
    <article className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm" data-reference-sheet={reference.id}>
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-ink">{reference.label}</span>
        {reference.hasFigure && (
          <span title={m.diagramTitle} className="shrink-0 rounded-full border border-line bg-surface-sunken px-2 py-0.5 text-[11px] text-ink-muted">
            {m.diagram}
          </span>
        )}
        {key && (
          <span className="shrink-0 rounded-md bg-surface-sunken px-2 py-0.5 text-[11.5px] font-medium text-ink" data-reference-answer>
            {m.answer(key)}
          </span>
        )}
      </header>
      <div className="bg-white px-2 pt-1">
        {item ? <PastPaperSheet item={item} doc={doc ?? FRAME} language={language} compact /> : <Words source={reference} language={language} />}
      </div>
      {!item && reference.hasFigure && <p className="border-t border-line px-3 py-2 text-[11.5px] text-ink-subtle">{m.wordsOnly}</p>}
      {explanation && (
        <div className="border-t border-line px-3 py-2 text-[12.5px] leading-snug text-ink-muted" data-reference-explanation>
          <span className="mr-1.5 font-medium text-ink">{m.explanation}</span>
          {explanation}
        </div>
      )}
    </article>
  );
}

/** The question's words, when its printed form is not at hand (a chat reopened later). On paper: literal colours. */
function Words({ source, language }: { source: SourceQuestion; language: LanguageMode }) {
  return (
    <div className="whitespace-pre-line px-4 py-3 font-serif text-[14.5px] leading-snug text-[#111111]">
      {source.passage && <p className="mb-2 border-b border-dashed border-[#c9c4ba] pb-2">{textOf(source.passage, language)}</p>}
      <p>{textOf(source.stem, language)}</p>
      {source.statements.length > 0 && (
        <ol className="mt-2 space-y-0.5">
          {source.statements.map((s, i) => (
            <li key={i}>
              ({i + 1}) {textOf(s, language)}
            </li>
          ))}
        </ol>
      )}
      <ol className="mt-2 space-y-0.5">
        {source.options.map((o, i) => (
          <li key={i}>
            {LETTERS[i]}. {textOf(o, language)}
          </li>
        ))}
      </ol>
    </div>
  );
}
