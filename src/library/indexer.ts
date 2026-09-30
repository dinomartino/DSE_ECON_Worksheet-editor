import { flattenBlocks, questionBlockLists } from '@/model/edits';
import { questionExcerpt } from '@/model/excerpt';
import { questionMarks } from '@/model/marks';
import { cleanClasses, dateOfUse } from '@/model/classes';
import { computeNumbering } from '@/model/numbering';
import { plain } from '@/model/text';
import { isSymbolOnly } from '@/model/symbols';
import { questionTexts } from '@/model/textWalk';
import { rootIdOf } from '@/model/lineage';
import { tagSearchWords } from '@/model/patterns';
import { tagStateOf } from '@/model/tagSlots';
import type { Question, Worksheet } from '@/model/types';
import { worksheetTitle } from '@/storage/document';
import type { WorksheetSummary } from '@/storage/types';
import { contentKey } from './contentKey';
import { rowTagFields } from './sharedTags';
import type { BankLang, BankRow } from './types';

/** Longest stored excerpt, in characters; a row shows one or two lines of it. */
export const EXCERPT_MAX = 200;

/**
 * The bank rows of one saved document, in printed order. `summary` (its index row) names
 * it and stamps its freshness; the use date is the document's own (`dateOfUse`). A `bankHidden` document, or one of a kind this build does not know, yields none. Text only — images never enter a row.
 */
export function rowsOf(worksheet: Worksheet, summary?: Pick<WorksheetSummary, 'title' | 'updatedAt'>): BankRow[] {
  if (worksheet.bankHidden) return [];
  // Only papers (no kind) and banks hold questions for the bank. A later build's kind
  // (notes, say) yields none: never a paper, never a use.
  const kind = worksheet.kind as unknown;
  if (kind !== undefined && kind !== 'bank') return [];
  const numbering = computeNumbering(worksheet);
  const classes = cleanClasses(worksheet.classes);
  const doc = {
    docId: worksheet.id,
    docTitle: summary?.title ?? worksheetTitle(worksheet),
    docUpdatedAt: summary?.updatedAt ?? worksheet.updatedAt,
    usedOn: dateOfUse(worksheet),
    docKind: worksheet.kind === 'bank' ? ('bank' as const) : ('paper' as const),
    ...(classes ? { classes } : {}),
  };
  const ordered = numbering.questions.map((entry) => entry.question);
  return ordered.map((question) => rowOf(question, doc, numbering.byQuestionId.get(question.id)?.number));
}

type DocFields = Pick<BankRow, 'docId' | 'docTitle' | 'docUpdatedAt' | 'usedOn' | 'docKind' | 'classes'>;

function rowOf(question: Question, doc: DocFields, number: number | undefined): BankRow {
  // Total over any saved shape: a tag or a rootId that is not a string is left in the
  // document and ignored here, so one odd question never stops the bank. On a question
  // tagged per part, `tags` is derived (every part's topics, then free tags).
  const tagFields = rowTagFields(tagStateOf(question));
  const tags = tagFields.tags;
  const printed = questionTexts(question).filter((slot) => slot.role === 'print' && !slot.unprinted);
  const words: string[] = [];
  const has = { en: false, zh: false };
  for (const slot of printed) {
    const en = plain(slot.text.en).trim();
    const zh = plain(slot.text.zh).trim();
    if (en) words.push(en);
    if (zh) words.push(zh);
    // E₀, `MC = MR`: printed the same in both editions, so no evidence of a language.
    has.en ||= Boolean(en) && !isSymbolOnly(slot.text.en);
    has.zh ||= Boolean(zh) && !isSymbolOnly(slot.text.zh);
  }
  for (const tag of tags) words.push(...tagSearchWords(tag));
  const languages = (['en', 'zh'] as BankLang[]).filter((lang) => has[lang]);
  return {
    ...doc,
    questionId: question.id,
    rootId: rootIdOf(question),
    typeId: question.type,
    marks: questionMarks(question),
    tags,
    ...(typeof question.tagsAt === 'string' ? { tagsAt: question.tagsAt } : {}),
    ...(tagFields.slots ? { slots: tagFields.slots, ownTags: tagFields.ownTags } : {}),
    excerpt: {
      en: questionExcerpt(question, 'en', EXCERPT_MAX),
      zh: questionExcerpt(question, 'zh', EXCERPT_MAX),
    },
    searchText: words.join('\n').toLowerCase(),
    hasDiagram: questionBlockLists(question).some((list) =>
      flattenBlocks(list).some((block) => block.kind === 'diagram' || block.kind === 'image'),
    ),
    languages,
    contentKey: contentKey(question),
    ...(number !== undefined ? { number } : {}),
  };
}
