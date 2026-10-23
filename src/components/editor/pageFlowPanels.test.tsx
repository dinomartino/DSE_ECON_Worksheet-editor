import { describe, expect, it, vi } from 'vitest';
// The registry loads first: the model modules below reach back into it and need it whole.
import '@/registry';
import { renderToStaticMarkup } from 'react-dom/server';
import { UiLanguageOverride } from '@/i18n/language';
import { createMcqQuestion, createStructuredQuestion } from '@/model/factories';
import { createWorksheetFrom, type DocumentType } from '@/model/newWorksheet';
import type { McqQuestion, OutputMode, Question, StructuredQuestion, Worksheet } from '@/model/types';
import type { UiLanguage } from '@/settings/language';

const store: { worksheet: Worksheet; mode: OutputMode; selectedTargetKey?: string } = {
  worksheet: createWorksheetFrom({ documentType: 'classroom', seedSample: false }),
  mode: { language: 'en', version: 'teacher' },
};
vi.mock('@/store/worksheetStore', () => ({
  useWorksheetStore: (select: (s: typeof store) => unknown) => select(store),
}));

const { McqEditorPanel } = await import('./McqEditorPanel');
const { StructuredEditorPanel } = await import('./StructuredEditorPanel');

/**
 * The page choices are in the sidebar panel of both kinds of question, on every paper shape:
 * Start on a new page on both; Keep this question on one page only where nothing already keeps the
 * question whole (not an MC, which always is; not on a Paper 1, which keeps every question).
 */

function paper(documentType: DocumentType, questions: Question[]): Worksheet {
  return {
    ...createWorksheetFrom({ documentType, seedSample: false }),
    questions,
    layout: [],
    flow: questions.map((q) => ({ type: 'question' as const, id: q.id })),
  };
}

function panel(worksheet: Worksheet, question: Question, ui: UiLanguage = 'en'): string {
  store.worksheet = worksheet;
  return renderToStaticMarkup(
    <UiLanguageOverride.Provider value={ui}>
      {question.type === 'mcq' ? (
        <McqEditorPanel question={question as McqQuestion} onChange={() => {}} />
      ) : (
        <StructuredEditorPanel question={question as StructuredQuestion} onChange={() => {}} />
      )}
    </UiLanguageOverride.Provider>,
  );
}

const count = (text: string, needle: string) => text.split(needle).length - 1;

describe.each<[string, DocumentType, boolean]>([
  ['a classroom worksheet', 'classroom', true],
  ['an LQ worksheet', 'lqWorksheet', true],
  ['a booklet', 'lqMock', true],
  ['a Paper 1', 'paper1', false],
])('the question panels on %s', (_name, documentType, offersKeep) => {
  it('offers Start on a new page on an MC question, once, and no choice to keep it whole', () => {
    const q = createMcqQuestion();
    const markup = panel(paper(documentType, [createMcqQuestion(), q]), q);
    expect(count(markup, 'Start on a new page')).toBe(1);
    expect(markup).not.toContain('Keep this question on one page');
  });

  it('offers Start on a new page on a structured question, once', () => {
    const q = createStructuredQuestion();
    expect(count(panel(paper(documentType, [createStructuredQuestion(), q]), q), 'Start on a new page')).toBe(1);
  });

  it(
    offersKeep
      ? 'offers Keep this question on one page on a structured question, once'
      : 'says a Paper 1 keeps every question on one page, in place of the choice',
    () => {
      const q = createStructuredQuestion();
      const markup = panel(paper(documentType, [createStructuredQuestion(), q]), q);
      expect(count(markup, 'Keep this question on one page')).toBe(offersKeep ? 1 : 0);
      expect(markup.includes('A Paper 1 keeps every question on one page.')).toBe(!offersKeep);
    },
  );
});

describe('the panels in 中文', () => {
  it('say 此題由新頁開始 on both kinds of question, and 此題保持在同一頁 on the structured one', () => {
    const m = createMcqQuestion();
    const s = createStructuredQuestion();
    const worksheet = paper('classroom', [createMcqQuestion(), m, s]);
    expect(panel(worksheet, m, 'zh-HK')).toContain('此題由新頁開始');
    expect(panel(worksheet, m, 'zh-HK')).not.toContain('此題保持在同一頁');
    expect(panel(worksheet, s, 'zh-HK')).toContain('此題由新頁開始');
    expect(panel(worksheet, s, 'zh-HK')).toContain('此題保持在同一頁');
  });
});

describe('a choice that changes nothing', () => {
  it('is explained under the box on the first question, on either kind', () => {
    const m: McqQuestion = { ...createMcqQuestion(), startOnNewPage: true };
    const s: StructuredQuestion = { ...createStructuredQuestion(), startOnNewPage: true };
    expect(panel(paper('classroom', [m, createMcqQuestion()]), m)).toContain('already opens the paper');
    expect(panel(paper('classroom', [s, createStructuredQuestion()]), s)).toContain('already opens the paper');
  });

  it('is not explained where the page really does start', () => {
    const s: StructuredQuestion = { ...createStructuredQuestion(), startOnNewPage: true };
    expect(panel(paper('classroom', [createStructuredQuestion(), s]), s)).not.toContain('already opens the paper');
  });
});
