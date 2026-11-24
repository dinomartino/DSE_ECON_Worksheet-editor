import { toRuns } from '@/generate/validate';
import { createMcqQuestion, createParagraphBlock, createStructuredQuestion, createWorksheet } from '@/model/factories';
import type { BiText, McqQuestion, TableBlock, Worksheet } from '@/model/types';
import type { CompletionRequest } from '@/ai/types';

/** Test helpers for the wording enhancement (k-0549): papers with MC questions, and canned replies. */

/** "**bold**" marks become bold runs. */
export const bi = (en: string, zh = ''): BiText => ({ en: toRuns(en), zh: toRuns(zh) });

export interface McqSpec {
  stem: [string, string?] | Array<[string, string?]>;
  options: Array<[string, string?]>;
  answer?: number;
  statements?: Array<[string, string?]>;
  table?: string[][];
}

export function mcq(spec: McqSpec): McqQuestion {
  const base = createMcqQuestion();
  const stems = (Array.isArray(spec.stem[0]) ? spec.stem : [spec.stem]) as Array<[string, string?]>;
  const blocks: McqQuestion['blocks'] = stems.map(([en, zh]) => ({ ...createParagraphBlock(), text: bi(en, zh) }));
  if (spec.table) {
    const table: TableBlock = {
      kind: 'table',
      id: `${base.id}-t`,
      rows: spec.table.map((row, r) => ({ id: `r${r}`, cells: row.map((text, c) => ({ id: `c${r}-${c}`, text: bi(text, text) })) })),
    } as TableBlock;
    blocks.push(table);
  }
  return {
    ...base,
    blocks,
    options: spec.options.map(([en, zh], i) => ({ ...base.options[i] ?? { id: `${base.id}-o${i}` }, text: bi(en, zh) })),
    answerIndex: spec.answer ?? 0,
    ...(spec.statements ? { statements: spec.statements.map(([en, zh]) => bi(en, zh)) } : {}),
  };
}

export function paperOf(...questions: McqSpec[]): Worksheet {
  const essay = { ...createStructuredQuestion(), blocks: [{ ...createParagraphBlock(), text: bi('Explain why prices rise.', '解釋價格上升的原因。') }] };
  return { ...createWorksheet(), questions: [...questions.map(mcq), essay] };
}

/** The request's payload (its last user turn). */
export function polishPayload(req: CompletionRequest): {
  questions: Array<{ q: string; answer: string; languages: string[]; fields: Array<Record<string, string>>; table?: Record<string, string[]> }>;
} {
  return JSON.parse(req.turns[req.turns.length - 1].content);
}

export interface ReplyField {
  id: string;
  en?: string;
  zh?: string;
  why?: { en: string; zh: string };
}

export const polishReplyOf = (items: Array<{ q: string; answer: string; fields: ReplyField[] }>): string =>
  JSON.stringify({
    items: items.map((item) => ({
      ...item,
      fields: item.fields.map((f) => ({ en: '', zh: '', why: { en: 'House style.', zh: '依 HKDSE 風格。' }, ...f })),
    })),
  });
