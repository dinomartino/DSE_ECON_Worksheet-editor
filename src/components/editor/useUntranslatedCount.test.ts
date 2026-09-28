import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDiagramBlock, createStructuredQuestion, createWorksheet } from '@/model/factories';
import { bi } from '@/model/text';
import { countUntranslated } from '@/model/textWalk';
import type { LanguageMode, StructuredQuestion, TableBlock, VersionMode, Worksheet } from '@/model/types';
import { structuredType } from '@/registry/structured';
import { buildTranslateFixture } from '@/test/translateFixture';
import { untranslatedCount } from './useUntranslatedCount';

const MODES: Array<[LanguageMode, VersionMode]> = [
  ['en', 'student'], ['en', 'teacher'],
  ['zh', 'student'], ['zh', 'teacher'],
  ['bilingual', 'student'], ['bilingual', 'teacher'],
];

/** A bilingual document with exactly one one-sided text: `edit` adds it. */
function withGap(edit: (question: StructuredQuestion, ws: Worksheet) => void): Worksheet {
  const ws = createWorksheet();
  const question = createStructuredQuestion();
  question.blocks = [{ kind: 'paragraph', id: 'stem', text: bi('Explain.', '解釋。') }];
  question.parts[0].blocks = [];
  ws.questions = [question];
  edit(question, ws);
  return ws;
}

const table = (text: string): TableBlock => ({
  kind: 'table', id: 't', rows: [{ id: 'r', cells: [{ id: 'c', text: bi(text, '') }] }],
});

/** Which of the six editions count the gap, in MODES order. */
const counted = (ws: Worksheet) => MODES.map(([language, version]) => countUntranslated(ws, { language, version }));

describe('countUntranslated: the mode × version table', () => {
  it('counts nothing on a fully bilingual document', () => {
    expect(counted(withGap(() => {}))).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('a printed English-only line counts wherever 中文 prints', () => {
    const ws = withGap((q) => q.blocks.push({ kind: 'paragraph', id: 'p', text: bi('Demand rises.', '') }));
    expect(counted(ws)).toEqual([0, 0, 1, 1, 1, 1]);
  });

  it('a 中文-only line counts wherever English prints', () => {
    const ws = withGap((q) => q.blocks.push({ kind: 'paragraph', id: 'p', text: bi('', '需求上升。') }));
    expect(counted(ws)).toEqual([1, 1, 0, 0, 1, 1]);
  });

  it('teacher text counts only in the teacher version', () => {
    const ws = withGap((q) => { q.parts[0].answer = bi('Because.', ''); });
    expect(counted(ws)).toEqual([0, 0, 0, 1, 0, 1]);
  });

  it('a symbol-only cell counts only in the one-language edition that prints its gap', () => {
    expect(counted(withGap((q) => q.blocks.push(table('2024'))))).toEqual([0, 0, 1, 1, 0, 0]);
    expect(counted(withGap((q) => q.blocks.push(table('Total'))))).toEqual([0, 0, 1, 1, 1, 1]);
  });

  it('a diagram symbol never counts; a diagram word does', () => {
    const symbol = withGap((q) => {
      const block = createDiagramBlock('blank');
      block.diagram.title = bi('E₀', '');
      q.blocks.push(block);
    });
    expect(counted(symbol)).toEqual([0, 0, 0, 0, 0, 0]);
    const word = withGap((q) => {
      const block = createDiagramBlock('blank');
      block.diagram.title = bi('Market for rice', '');
      q.blocks.push(block);
    });
    expect(counted(word)).toEqual([0, 0, 1, 1, 1, 1]);
  });

  it('a symbol-only answer-graph title never counts', () => {
    const ws = withGap((q) => { q.parts[0].answerGraph = { lines: 6, xTitle: bi('Q', '') }; });
    expect(counted(ws)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('unprinted text never counts: a disabled footer, a question-level graph under parts', () => {
    const footer = withGap((_, ws) => {
      ws.footer = { enabled: false, bands: [{ id: 'b', zones: { left: [{ kind: 'text', id: 'f', text: bi('Footer', '') }], center: [], right: [] } }] };
    });
    expect(counted(footer)).toEqual([0, 0, 0, 0, 0, 0]);
    footer.footer!.enabled = true;
    expect(counted(footer)).toEqual([0, 0, 1, 1, 1, 1]);

    const graph = withGap((q) => { q.answerGraph = { lines: 6, xTitle: bi('Quantity of rice', '') }; });
    expect(counted(graph)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('alt text never counts', () => {
    const ws = withGap((q) => {
      const block = createDiagramBlock('blank');
      block.altText = bi('A demand curve', '');
      q.blocks.push(block);
    });
    expect(counted(ws)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('counts text outside questions: cover, bands, layout, title', () => {
    const ws = withGap((_, doc) => {
      doc.title = bi('Mock exam', '');
      doc.layout = [...doc.layout, { kind: 'text', id: 'n', text: bi('Read carefully.', '') }];
      doc.cover = { headLines: [{ id: 'h', text: bi('Economics', '') }] };
    });
    expect(countUntranslated(ws, { language: 'zh', version: 'student' })).toBe(3);
  });
});

describe('untranslatedCount (the toolbar pill)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('agrees with countUntranslated in every edition', () => {
    const ws = buildTranslateFixture();
    ws.title = bi('Kitchen sink', '');
    (ws.questions[1] as StructuredQuestion).parts[0].answer = bi('Because.', '');
    ws.questions[0].blocks[0] = { kind: 'paragraph', id: 'x', text: bi('', '哪項？') };
    for (const [language, version] of MODES) {
      expect(untranslatedCount(ws, { language, version })).toBe(countUntranslated(ws, { language, version }));
    }
  });

  it('re-walks only the questions an edit replaced', () => {
    const spy = vi.spyOn(structuredType, 'mapTexts');
    const ws = createWorksheet();
    ws.questions = [createStructuredQuestion(), createStructuredQuestion(), createStructuredQuestion()];
    const mode = { language: 'bilingual', version: 'teacher' } as const;

    untranslatedCount(ws, mode);
    expect(spy).toHaveBeenCalledTimes(3);
    untranslatedCount({ ...ws }, mode);
    expect(spy).toHaveBeenCalledTimes(3);

    const edited = { ...ws, questions: [ws.questions[0], { ...ws.questions[1] }, ws.questions[2]] };
    untranslatedCount(edited, mode);
    expect(spy).toHaveBeenCalledTimes(4);
    untranslatedCount(edited, { ...mode, language: 'zh' });
    expect(spy).toHaveBeenCalledTimes(7);
  });
});
