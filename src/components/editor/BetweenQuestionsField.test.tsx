import { describe, expect, it, vi } from 'vitest';
// The registry loads first: the model modules below reach back into it and need it whole.
import '@/registry';
import { renderToStaticMarkup } from 'react-dom/server';
import { UiLanguageOverride } from '@/i18n/language';
import { createMcqQuestion } from '@/model/factories';
import { createWorksheetFrom, type DocumentType } from '@/model/newWorksheet';
import type { Worksheet } from '@/model/types';
import type { UiLanguage } from '@/settings/language';

const store = {
  worksheet: createWorksheetFrom({ documentType: 'classroom', seedSample: false }),
  setExamGapLines: () => {},
};
vi.mock('@/store/worksheetStore', () => ({
  useWorksheetStore: (select: (s: typeof store) => unknown) => select(store),
}));

const { BetweenQuestionsField } = await import('./BetweenQuestionsField');

/**
 * Setup → Page → Between questions, as drawn. It was a Paper 1 control; it is now offered on
 * every shape, with the default each shape gives and a hint that says what it reaches.
 */

function paper(documentType: DocumentType, withQuestion: boolean, extra: Partial<Worksheet> = {}): Worksheet {
  const base = createWorksheetFrom({ documentType, seedSample: false });
  const questions = withQuestion ? [createMcqQuestion(), createMcqQuestion()] : [];
  return {
    ...base,
    ...extra,
    questions,
    layout: [],
    flow: questions.map((q) => ({ type: 'question' as const, id: q.id })),
  };
}

function draw(worksheet: Worksheet, ui: UiLanguage = 'en'): string {
  store.worksheet = worksheet;
  return renderToStaticMarkup(
    <UiLanguageOverride.Provider value={ui}>
      <BetweenQuestionsField />
    </UiLanguageOverride.Provider>,
  );
}

const text = (markup: string) => markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const options = (markup: string) => [...markup.matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map((m) => m[1]);
const chosen = (markup: string) => /<option[^>]*value="(\d+)"[^>]*selected/.exec(markup)?.[1];

describe('Between questions in Setup', () => {
  it.each<[string, DocumentType]>([
    ['a classroom worksheet', 'classroom'],
    ['an LQ worksheet', 'lqWorksheet'],
    ['a booklet', 'lqMock'],
    ['a Paper 1', 'paper1'],
  ])('is offered on %s, with the default and one to six lines', (_name, documentType) => {
    const markup = draw(paper(documentType, true));
    expect(text(markup)).toContain('Between questions');
    expect(options(markup).slice(1)).toEqual(['1 line', '2 lines', '3 lines', '4 lines', '5 lines', '6 lines']);
  });

  it('names the default each shape gives: one line off the exam paper, the reference paper’s three on it', () => {
    expect(options(draw(paper('classroom', true)))[0]).toBe('Default: 1 line');
    expect(options(draw(paper('lqWorksheet', true)))[0]).toBe('Default: 1 line');
    expect(options(draw(paper('lqMock', true)))[0]).toBe('Default: 1 line');
    expect(options(draw(paper('paper1', true)))[0]).toBe('Default: 3 lines (the reference paper)');
  });

  it('names the default of a paper with no question yet, so the choice reads the same before and after', () => {
    expect(options(draw(paper('classroom', false)))[0]).toBe('Default: 1 line');
    expect(options(draw(paper('paper1', false)))[0]).toBe('Default: 3 lines (the reference paper)');
  });

  it('shows the paper’s own number as the chosen one, and the default when it has none', () => {
    expect(chosen(draw(paper('classroom', true, { examGapLines: 4 })))).toBe('4');
    expect(chosen(draw(paper('classroom', true)))).toBe('0');
    expect(chosen(draw(paper('paper1', true, { examGapLines: 2 })))).toBe('2');
  });

  it('says what it reaches: two questions of one kind, and that anything between keeps the usual spacing', () => {
    const shown = text(draw(paper('classroom', true)));
    expect(shown).toContain('two questions of the same kind');
    expect(shown).toContain('two MC questions, or two structured questions');
    expect(shown).toContain('keeps the usual spacing');
    expect(shown).toContain('Space above');
  });

  it('speaks 中文 with the catalogue’s words', () => {
    const markup = draw(paper('classroom', true), 'zh-HK');
    expect(text(markup)).toContain('題目之間');
    expect(text(markup)).toContain('兩條 MC 題，或兩條結構題');
    expect(options(markup).slice(0, 3)).toEqual(['預設：1 行', '1 行', '2 行']);
    expect(options(draw(paper('paper1', true), 'zh-HK'))[0]).toBe('預設：3 行（參考試卷）');
  });

  // Every question then opens a sheet, and what opens a sheet gets no gap: the number is idle.
  it('says it has no effect while Start every question on a new page is on, but not on a Paper 1', () => {
    const idle = (markup: string) => /data-testid="between-questions-idle"[^>]*>([^<]*)</.exec(markup)?.[1];
    expect(idle(draw(paper('classroom', true)))).toBeUndefined();
    expect(idle(draw(paper('classroom', true, { startEveryQuestionOnNewPage: true })))).toBe(
      'Start every question on a new page is on, so no question sits right under another and this has no effect.',
    );
    expect(idle(draw(paper('lqMock', true, { startEveryQuestionOnNewPage: true }), 'zh-HK'))).toBe(
      '已開啟「每題由新頁開始」，題目不會緊接上一題，所以此設定暫時不起作用。',
    );
    expect(idle(draw(paper('paper1', true, { startEveryQuestionOnNewPage: true })))).toBeUndefined();
  });
});
