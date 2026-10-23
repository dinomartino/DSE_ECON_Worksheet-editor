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
 * Space above is in the sidebar panel of both kinds of question, on every paper shape. It was
 * the MC panel's, on a Paper 1 only; a long question had nowhere to set it.
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

describe.each<[string, DocumentType]>([
  ['a classroom worksheet', 'classroom'],
  ['an LQ worksheet', 'lqWorksheet'],
  ['a booklet', 'lqMock'],
  ['a Paper 1', 'paper1'],
])('the question panels on %s', (_name, documentType) => {
  it('offers Space above on an MC question, once', () => {
    const q = createMcqQuestion();
    const markup = panel(paper(documentType, [createMcqQuestion(), q]), q);
    expect(count(markup, 'Space above')).toBe(1);
    expect(markup).toContain('Paper default (');
  });

  it('offers Space above on a structured question, once', () => {
    const q = createStructuredQuestion();
    const markup = panel(paper(documentType, [createStructuredQuestion(), q]), q);
    expect(count(markup, 'Space above')).toBe(1);
    expect(markup).toContain('Paper default (');
  });
});

describe('the panels in 中文', () => {
  it('say 上方空位 on both kinds of question', () => {
    const m = createMcqQuestion();
    const s = createStructuredQuestion();
    const worksheet = paper('classroom', [createMcqQuestion(), m, s]);
    expect(panel(worksheet, m, 'zh-HK')).toContain('上方空位');
    expect(panel(worksheet, s, 'zh-HK')).toContain('上方空位');
  });
});

describe('a number the page cannot use', () => {
  it('is explained under the control on a structured question, as on an MC', () => {
    const m = createMcqQuestion();
    const s: StructuredQuestion = { ...createStructuredQuestion(), gapBefore: 4 };
    const markup = panel(paper('classroom', [m, s]), s);
    expect(markup).toContain('The question above is a different kind');
  });

  it('is not explained while there is nothing set', () => {
    const m = createMcqQuestion();
    const s = createStructuredQuestion();
    expect(panel(paper('classroom', [m, s]), s)).not.toContain('different kind');
  });
});
