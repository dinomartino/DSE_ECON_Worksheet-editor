import { describe, expect, it, vi } from 'vitest';
// The registry loads first: the model modules below reach back into it and need it whole.
import '@/registry';
import { renderToStaticMarkup } from 'react-dom/server';
import { UiLanguageOverride } from '@/i18n/language';
import { createWorksheetFrom, type DocumentType } from '@/model/newWorksheet';
import { rt } from '@/model/text';
import type { LayoutElement, McqQuestion, Question, StructuredQuestion, Worksheet } from '@/model/types';
import type { UiLanguage } from '@/settings/language';

const store: { worksheet: Worksheet } = { worksheet: createWorksheetFrom({ documentType: 'classroom', seedSample: false }) };
vi.mock('@/store/worksheetStore', () => ({
  useWorksheetStore: (select: (s: typeof store) => unknown) => select(store),
}));

const { PageFlowFields, pageFlowPatch } = await import('./PageFlowFields');

/**
 * A question's page choices, as drawn: Start on a new page for any kind of question, Keep this
 * question on one page for the kinds that are not already kept whole. The write itself
 * (`pageFlowPatch`) is tested here; the click through a real checkbox and what the page then
 * does are in `scripts/page-flow-verify.mjs`.
 */

const mcq = (id: string, extra: Partial<McqQuestion> = {}): McqQuestion => ({
  id,
  type: 'mcq',
  blocks: [{ id: `${id}-b`, kind: 'paragraph', text: { en: rt(id), zh: [] } }],
  options: [1, 2, 3, 4].map((n) => ({ id: `${id}-o${n}`, text: { en: rt(`o${n}`), zh: [] } })),
  answerIndex: 0,
  marks: 1,
  ...extra,
});
const structured = (id: string, extra: Partial<StructuredQuestion> = {}): StructuredQuestion => ({
  id,
  type: 'structured',
  blocks: [{ id: `${id}-b`, kind: 'paragraph', text: { en: rt(id), zh: [] } }],
  parts: [],
  ...extra,
});
const pageBreak: LayoutElement = { id: 'brk', kind: 'pageBreak' };

function paper(documentType: DocumentType, items: Array<Question | LayoutElement>): Worksheet {
  return {
    ...createWorksheetFrom({ documentType, seedSample: false }),
    questions: items.filter((item): item is Question => !('kind' in item)),
    layout: items.filter((item): item is LayoutElement => 'kind' in item),
    flow: items.map((item) => ({ type: 'kind' in item ? ('layout' as const) : ('question' as const), id: item.id })),
  } as Worksheet;
}

function draw(worksheet: Worksheet, question: Question, ui: UiLanguage = 'en'): string {
  store.worksheet = worksheet;
  return renderToStaticMarkup(
    <UiLanguageOverride.Provider value={ui}>
      <PageFlowFields question={question} onChange={() => {}} />
    </UiLanguageOverride.Provider>,
  );
}

const text = (markup: string) => markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
/** The checkboxes, in order, as `[label, checked]`. */
const boxes = (markup: string) =>
  [...markup.matchAll(/<label[^>]*>\s*<input([^>]*)\/?>([^<]*)<\/label>/g)].map((m) => [m[2].trim(), /\bchecked\b/.test(m[1])] as const);

describe('the page choices on a worksheet', () => {
  it('offers both on a structured question, neither ticked', () => {
    const b = structured('b');
    expect(boxes(draw(paper('classroom', [structured('a'), b]), b))).toEqual([
      ['Start on a new page', false],
      ['Keep this question on one page', false],
    ]);
  });

  it('shows what is set', () => {
    const b = structured('b', { startOnNewPage: true, keepOnOnePage: true });
    expect(boxes(draw(paper('classroom', [structured('a'), b]), b))).toEqual([
      ['Start on a new page', true],
      ['Keep this question on one page', true],
    ]);
  });

  it('says what keeping does, and that a question taller than a page is still split', () => {
    const b = structured('b');
    const markup = text(draw(paper('classroom', [structured('a'), b]), b));
    expect(markup).toContain('the whole question moves to the next page');
    expect(markup).toContain('taller than a page is still split');
  });

  it('offers only the new-page choice on an MC, which is always kept whole', () => {
    const b = mcq('b');
    const markup = draw(paper('classroom', [mcq('a'), b]), b);
    expect(boxes(markup)).toEqual([['Start on a new page', false]]);
    expect(text(markup)).not.toContain('Keep this question');
  });

  it('offers both on a booklet question and an LQ worksheet’s', () => {
    for (const shape of ['lqMock', 'lqWorksheet'] as const) {
      const b = structured('b');
      expect(boxes(draw(paper(shape, [structured('a'), b]), b)).map(([label]) => label), shape).toEqual([
        'Start on a new page',
        'Keep this question on one page',
      ]);
    }
  });

  it('says a Paper 1 keeps every question on one page, in place of the choice', () => {
    const b = structured('b');
    const markup = draw(paper('paper1', [structured('a'), b]), b);
    expect(boxes(markup)).toEqual([['Start on a new page', false]]);
    expect(text(markup)).toContain('A Paper 1 keeps every question on one page.');
  });
});

describe('when asking to start a new page changes nothing', () => {
  const note = (markup: string) => /data-testid="start-on-new-page-note"[^>]*>([^<]*)</.exec(markup)?.[1];

  it('says nothing while the box is not ticked', () => {
    const a = structured('a');
    expect(note(draw(paper('classroom', [a, structured('b')]), a))).toBeUndefined();
  });

  it('says nothing where a sheet really opens', () => {
    const b = structured('b', { startOnNewPage: true });
    expect(note(draw(paper('classroom', [structured('a'), b]), b))).toBeUndefined();
  });

  it('says the first question already opens the paper', () => {
    const a = structured('a', { startOnNewPage: true });
    expect(note(draw(paper('classroom', [a, structured('b')]), a))).toBe(
      'This is the first question, so it already opens the paper.',
    );
  });

  it('says a New page break straight above already starts a page', () => {
    const b = structured('b', { startOnNewPage: true });
    expect(note(draw(paper('classroom', [structured('a'), pageBreak, b]), b))).toBe(
      'A New page break sits right above, so this question already starts a page.',
    );
  });
});

describe('in Chinese', () => {
  it('reads in 繁體中文 everywhere', () => {
    const b = structured('b', { startOnNewPage: true });
    const first = structured('f', { startOnNewPage: true });
    expect(text(draw(paper('classroom', [structured('a'), b]), b, 'zh-HK'))).toContain('此題由新頁開始');
    expect(text(draw(paper('classroom', [structured('a'), b]), b, 'zh-HK'))).toContain('此題保持在同一頁');
    expect(text(draw(paper('classroom', [structured('a'), b]), b, 'zh-HK'))).toContain('高於一頁的題目仍會分頁');
    expect(text(draw(paper('classroom', [first, b]), first, 'zh-HK'))).toContain('這是第一題，本來就在試卷開首。');
    expect(text(draw(paper('classroom', [structured('a'), pageBreak, b]), b, 'zh-HK'))).toContain('上方已有「新頁面」');
    expect(text(draw(paper('paper1', [structured('a'), b]), b, 'zh-HK'))).toContain('Paper 1 的每一題都保持在同一頁。');
  });
});

describe('what ticking writes', () => {
  it('writes true when ticked and absence when cleared, never false', () => {
    expect(pageFlowPatch('startOnNewPage', true)).toEqual({ startOnNewPage: true });
    expect(pageFlowPatch('keepOnOnePage', true)).toEqual({ keepOnOnePage: true });
    const cleared = pageFlowPatch('startOnNewPage', false);
    expect(cleared).toEqual({ startOnNewPage: undefined });
    expect(Object.values(cleared)).not.toContain(false);
  });

  it('puts a cleared question back exactly as it was', () => {
    const plain = structured('b');
    const ticked = { ...plain, ...pageFlowPatch('startOnNewPage', true) };
    const cleared = { ...ticked, ...pageFlowPatch('startOnNewPage', false) };
    expect(JSON.stringify(cleared)).toBe(JSON.stringify(plain));
  });
});
