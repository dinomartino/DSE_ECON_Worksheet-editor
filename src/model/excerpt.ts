import { plain } from './text';
import type { BiText, ContentBlock, LanguageMode, Question } from './types';

/**
 * One-line plain-text excerpts: the Outline row, the panels' block rows, the question bank.
 * Bilingual-aware — the asked-for side first, the other when it is empty ('bilingual' reads
 * as English first).
 */

type ExcerptLang = LanguageMode;

/** A bilingual value as plain text, preferring `lang` and falling back to the other side. */
export function biTextExcerpt(value: BiText | undefined, lang: ExcerptLang = 'en'): string {
  if (!value) return '';
  return lang === 'zh' ? plain(value.zh) || plain(value.en) : plain(value.en) || plain(value.zh);
}

/** The first paragraph's text in a block list; '' when there is none. */
export function blocksExcerpt(blocks: ContentBlock[], lang: ExcerptLang = 'en'): string {
  const para = blocks.find((block) => block.kind === 'paragraph');
  return para && para.kind === 'paragraph' ? biTextExcerpt(para.text, lang) : '';
}

/**
 * A question's stem as short plain text: its first paragraph in `lang` (else the other
 * language). `max` cuts at a word boundary with '…'; absent returns the whole paragraph.
 */
export function questionExcerpt(question: Question, lang: ExcerptLang = 'en', max?: number): string {
  const text = blocksExcerpt(question.blocks, lang);
  return max === undefined ? text : clip(text, max);
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
