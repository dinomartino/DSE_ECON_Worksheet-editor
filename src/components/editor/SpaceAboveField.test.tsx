import { describe, expect, it, vi } from 'vitest';
// The registry loads first: the model modules below reach back into it and need it whole.
import '@/registry';
import { renderToStaticMarkup } from 'react-dom/server';
import { UiLanguageOverride } from '@/i18n/language';
import { createWorksheetFrom, type DocumentType } from '@/model/newWorksheet';
import { rt } from '@/model/text';
import type { McqQuestion, Question, StructuredQuestion, Worksheet } from '@/model/types';
import type { UiLanguage } from '@/settings/language';

const store: { worksheet: Worksheet } = { worksheet: createWorksheetFrom({ documentType: 'classroom', seedSample: false }) };
vi.mock('@/store/worksheetStore', () => ({
  useWorksheetStore: (select: (s: typeof store) => unknown) => select(store),
}));

const { MAX_GAP_LINES, SpaceAboveField, spaceAbovePatch } = await import('./SpaceAboveField');

/**
 * A question's Space above, as drawn, on every paper shape and for either kind of question.
 * The write itself (`spaceAbovePatch`) is tested here; the click through a real select, and
 * what the page then draws, are in `scripts/question-gap-verify.mjs`.
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

function paper(documentType: DocumentType, questions: Question[], extra: Partial<Worksheet> = {}): Worksheet {
  return {
    ...createWorksheetFrom({ documentType, seedSample: false }),
    ...extra,
    questions,
    layout: [],
    flow: questions.map((q) => ({ type: 'question' as const, id: q.id })),
  } as Worksheet;
}

function draw(worksheet: Worksheet, question: Question, ui: UiLanguage = 'en'): string {
  store.worksheet = worksheet;
  return renderToStaticMarkup(
    <UiLanguageOverride.Provider value={ui}>
      <SpaceAboveField question={question} onChange={() => {}} />
    </UiLanguageOverride.Provider>,
  );
}

const text = (markup: string) => markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const options = (markup: string) => [...markup.matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map((m) => m[1]);
const chosen = (markup: string) => /<option[^>]*value="(\d+)"[^>]*selected/.exec(markup)?.[1];

describe('the Space above choices', () => {
  it('offers the paper default, then one to nine lines, on a classroom worksheet', () => {
    const a = mcq('a');
    const markup = draw(paper('classroom', [mcq('z'), a]), a);
    expect(text(markup)).toContain('Space above');
    expect(options(markup)).toEqual([
      'Paper default (1 line)',
      '1 line', '2 lines', '3 lines', '4 lines', '5 lines', '6 lines', '7 lines', '8 lines', '9 lines',
    ]);
    expect(options(markup)).toHaveLength(MAX_GAP_LINES + 1);
  });

  it('names the default each shape gives: the reference paper’s three on a Paper 1, one line anywhere else', () => {
    const first = (shape: DocumentType, question: Question) => options(draw(paper(shape, [mcq('z'), question]), question))[0];
    const a = mcq('a');
    expect(first('paper1', a)).toBe('Paper default (3 lines)');
    expect(first('classroom', a)).toBe('Paper default (1 line)');
    expect(first('lqWorksheet', structured('s'))).toBe('Paper default (1 line)');
    expect(first('lqMock', structured('s'))).toBe('Paper default (1 line)');
  });

  it('names Setup’s number as the paper default once it is chosen, on any shape', () => {
    const a = mcq('a');
    expect(options(draw(paper('classroom', [mcq('z'), a], { examGapLines: 4 }), a))[0]).toBe('Paper default (4 lines)');
    expect(options(draw(paper('paper1', [mcq('z'), a], { examGapLines: 2 }), a))[0]).toBe('Paper default (2 lines)');
  });

  it('shows the question’s own number as the chosen one, and the default when it has none', () => {
    const own = mcq('a', { gapBefore: 5 });
    expect(chosen(draw(paper('classroom', [mcq('z'), own]), own))).toBe('5');
    const none = mcq('b');
    expect(chosen(draw(paper('classroom', [mcq('z'), none]), none))).toBe('0');
  });

  it('is the same control for a structured question', () => {
    const own = structured('s', { gapBefore: 3 });
    const markup = draw(paper('classroom', [structured('t'), own]), own);
    expect(text(markup)).toContain('Space above');
    expect(chosen(markup)).toBe('3');
  });

  it('speaks 中文 with the catalogue’s words', () => {
    const a = mcq('a', { gapBefore: 2 });
    const markup = draw(paper('classroom', [mcq('z'), a]), a, 'zh-HK');
    expect(text(markup)).toContain('上方空位');
    expect(options(markup).slice(0, 3)).toEqual(['試卷預設（1 行）', '1 行', '2 行']);
  });
});

describe('writing the choice', () => {
  it('clears the field for the paper default, so the question keeps following Setup', () => {
    expect(spaceAbovePatch(0)).toEqual({ gapBefore: undefined });
    expect('gapBefore' in spaceAbovePatch(0)).toBe(true);
  });

  it('stores a chosen number as it is', () => {
    for (const lines of [1, 2, 5, 9]) expect(spaceAbovePatch(lines)).toEqual({ gapBefore: lines });
  });
});

describe('the note under the control', () => {
  const note = (markup: string) => /data-testid="space-above-note">([^<]*)</.exec(markup)?.[1];

  it('says nothing while the number can be used', () => {
    const b = mcq('b', { gapBefore: 4 });
    expect(note(draw(paper('classroom', [mcq('a'), b]), b))).toBeUndefined();
  });

  it('says nothing while the question has no number of its own, wherever it stands', () => {
    const first = mcq('a');
    const underOther = mcq('c');
    expect(note(draw(paper('classroom', [first, structured('s'), underOther]), first))).toBeUndefined();
    expect(note(draw(paper('classroom', [first, structured('s'), underOther]), underOther))).toBeUndefined();
  });

  it('says why a number on the first item cannot be used', () => {
    const first = mcq('a', { gapBefore: 4 });
    expect(note(draw(paper('classroom', [first, mcq('b')]), first))).toBe(
      'This is the first thing on the paper, so there is nothing to space it from.',
    );
  });

  it('says why a number under a question of another kind cannot be used', () => {
    const b = mcq('b', { gapBefore: 4 });
    expect(note(draw(paper('classroom', [structured('s'), b]), b))).toBe(
      'Only counts straight under a question of the same kind. The question above is a different kind, so it keeps the usual spacing.',
    );
  });

  it('says why a number under a heading, a note or a page break cannot be used', () => {
    const b = mcq('b', { gapBefore: 4 });
    const w = paper('classroom', [mcq('a'), b]);
    w.layout = [{ id: 'br', kind: 'pageBreak' }];
    w.flow = [{ type: 'question', id: 'a' }, { type: 'layout', id: 'br' }, { type: 'question', id: 'b' }];
    expect(note(draw(w, b))).toBe(
      'Only counts straight under a question of the same kind. Something else sits above this one, so it keeps the usual spacing.',
    );
  });

  it('says why a number on a question that starts a new page cannot be used', () => {
    const b = mcq('b', { gapBefore: 4, startOnNewPage: true });
    expect(note(draw(paper('classroom', [mcq('a'), b]), b))).toBe(
      'This question starts a new page, so no space is left above it.',
    );
    expect(note(draw(paper('classroom', [mcq('a'), b]), b, 'zh-HK'))).toBe('這題由新頁開始，上方不留空位。');
  });

  it('is said in 中文 too', () => {
    const b = mcq('b', { gapBefore: 4 });
    expect(note(draw(paper('classroom', [structured('s'), b]), b, 'zh-HK'))).toBe(
      '只在同類型題目的正下方生效。上一題是另一種類型，所以維持一般間距。',
    );
  });
});
