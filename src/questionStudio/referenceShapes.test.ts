import { describe, expect, it } from 'vitest';
import { createImageBlock, createParagraphBlock, createTableBlock, newId } from '@/model/factories';
import { bi } from '@/model/text';
import type { ContentBlock, McqQuestion, TableBlock } from '@/model/types';
import { optionLayoutMcq } from '@/test/optionLayoutFixture';
import { examplePayload, sentFigures } from './brief';
import { figureLang, MAX_FIGURES_PER_EXAMPLE, withFigures } from './figures';
import { PICTURE_MARK, sourceFromQuestion } from './source';

/**
 * k-0544: every shape a past-paper reference comes in reaches the model whole — a grid of
 * diagrams in a stem table (HKDSE 2023 Paper 1 Q36), a picture per option, tables in the
 * options, merged cells, two tables, Chinese pictures. Synthetic questions only: the bank's
 * questions never enter this repo (`scripts/studio-reference-verify.test.ts` runs the real one).
 */

/** A distinct, well-formed picture per name, so a test can tell which one was sent. */
const pic = (name: string) => `data:image/png;base64,${Buffer.from(`picture-${name}`).toString('base64')}`;

function table(cells: Array<Array<{ en: string; zh?: string; image?: string; imageZh?: string; colSpan?: number; rowSpan?: number; covered?: boolean }>>): TableBlock {
  const t = createTableBlock(cells.length, cells[0].length);
  return {
    ...t,
    rows: t.rows.map((row, r) => ({
      ...row,
      cells: row.cells.map((cell, c) => {
        const spec = cells[r][c];
        return {
          ...cell,
          text: bi(spec.en, spec.zh ?? spec.en),
          ...(spec.image ? { image: { src: spec.image, ...(spec.imageZh ? { srcZh: spec.imageZh } : {}), widthPx: 120, heightPx: 90, altText: bi('', '') } } : {}),
          ...(spec.colSpan ? { colSpan: spec.colSpan } : {}),
          ...(spec.rowSpan ? { rowSpan: spec.rowSpan } : {}),
          ...(spec.covered ? { covered: true } : {}),
        };
      }),
    })),
  };
}

const combination = [
  ['(1) and (2) only', '只有(1)、(2)'],
  ['(1) and (3) only', '只有(1)、(3)'],
  ['(2) and (4) only', '只有(2)、(4)'],
  ['(3) and (4) only', '只有(3)、(4)'],
] as const;

/** Q36's shape: a stem line, then a borderless 2×2 table of labelled pictures. */
const grid: McqQuestion = {
  ...optionLayoutMcq(['Which of the following diagrams describe a progressive tax?', '下列哪些圖描繪累進稅？'], combination),
  answerIndex: 2,
};
grid.blocks = [
  ...grid.blocks,
  {
    ...table([
      [{ en: '(1)', image: pic('1'), imageZh: pic('1zh') }, { en: '(2)', image: pic('2'), imageZh: pic('2zh') }],
      [{ en: '(3)', image: pic('3'), imageZh: pic('3zh') }, { en: '(4)', image: pic('4'), imageZh: pic('4zh') }],
    ]),
    borders: 'none',
  },
];

const withOptionBlocks = (q: McqQuestion, blocks: (i: number) => ContentBlock[]): McqQuestion => ({ ...q, options: q.options.map((o, i) => ({ ...o, blocks: blocks(i) })) });

describe('a grid of diagrams in a stem table (HKDSE 2023 Paper 1 Q36)', () => {
  const source = sourceFromQuestion(grid, { label: 'grid' });
  it('is a question with figures, each picture marked in the words by its label', () => {
    expect(source.hasFigure).toBe(true);
    expect(source.stem.en).toBe(`Which of the following diagrams describe a progressive tax?\n(1) ${PICTURE_MARK} | (2) ${PICTURE_MARK}\n(3) ${PICTURE_MARK} | (4) ${PICTURE_MARK}`);
    expect(source.figurePlaces).toEqual(['stem (1)', 'stem (2)', 'stem (3)', 'stem (4)']);
  });
  it('sends all four pictures, in order, each with where it sits', async () => {
    const [read] = await withFigures([source]);
    expect(read.figures?.map((f) => f.dataUrl)).toEqual([pic('1'), pic('2'), pic('3'), pic('4')]);
    expect(read.figureAt).toEqual(['stem (1)', 'stem (2)', 'stem (3)', 'stem (4)']);
    const [sent] = sentFigures([read], true);
    const payload = examplePayload(read, ['en'], sent.length);
    expect(payload).toMatchObject({ figures: 4, figureAt: ['stem (1)', 'stem (2)', 'stem (3)', 'stem (4)'] });
    expect(payload).not.toHaveProperty('figureNotShown');
  });
  it('a provider that cannot see pictures is told the question has some it cannot see', () => {
    expect(examplePayload(source, ['en'], 0)).toMatchObject({ figureNotShown: true });
    expect(examplePayload(source, ['en'], 0)).not.toHaveProperty('figures');
  });
  it('a 中文 paper gets the Chinese pictures; a paper with English gets the English ones', async () => {
    expect(figureLang(['zh'])).toBe('zh');
    expect(figureLang(['en', 'zh'])).toBe('en');
    const [zh] = await withFigures([source], 'zh');
    expect(zh.figures?.map((f) => f.dataUrl)).toEqual([pic('1zh'), pic('2zh'), pic('3zh'), pic('4zh')]);
    expect(zh.figuresLang).toBe('zh');
    // Read again for the other language, never served stale.
    const [en] = await withFigures([zh], 'en');
    expect(en.figures?.[0].dataUrl).toBe(pic('1'));
  });
});

describe('a picture in every option', () => {
  const q = withOptionBlocks(optionLayoutMcq(['Which diagram shows the effect?', '哪個圖顯示其影響？'], [['', ''], ['', ''], ['', ''], ['', '']]), (i) => [createImageBlock(pic(`opt${i}`), 120, 90)]);
  it('sends all four, tied to their letters, and no option goes as nothing', async () => {
    const [read] = await withFigures([sourceFromQuestion(q, { label: 'x' })]);
    expect(read.figures).toHaveLength(4);
    expect(read.figureAt).toEqual(['option A', 'option B', 'option C', 'option D']);
    const payload = examplePayload(read, ['en'], 4) as { options: Array<{ en?: string }> };
    expect(payload.options).toEqual([{ en: PICTURE_MARK }, { en: PICTURE_MARK }, { en: PICTURE_MARK }, { en: PICTURE_MARK }]);
  });
  it('a stem picture and four option pictures all fit (the bank\'s largest)', async () => {
    const both = { ...q, blocks: [...q.blocks, createImageBlock(pic('stem'), 200, 120)] };
    const [read] = await withFigures([sourceFromQuestion(both, { label: 'x' })]);
    expect(MAX_FIGURES_PER_EXAMPLE).toBeGreaterThanOrEqual(5);
    expect(read.figureAt).toEqual(['stem', 'option A', 'option B', 'option C', 'option D']);
    expect(read.figures?.map((f) => f.dataUrl)).toEqual([pic('stem'), pic('opt0'), pic('opt1'), pic('opt2'), pic('opt3')]);
  });
  it('a request that cannot carry them all says some are not shown', async () => {
    const [read] = await withFigures([sourceFromQuestion(q, { label: 'x' })]);
    expect(examplePayload(read, ['en'], 2)).toMatchObject({ figures: 2, figureAt: ['option A', 'option B'], figureNotShown: true });
  });
});

describe('tables', () => {
  it('a table under each option is sent as its words, not as a missing picture', () => {
    const q = withOptionBlocks(optionLayoutMcq(['Which will be its new balance sheet?', '新的資產負債表會是哪個？'], [['', ''], ['', ''], ['', ''], ['', '']]), (i) => [
      table([
        [{ en: 'Assets ($)' }, { en: 'Liabilities ($)' }],
        [{ en: `Reserves ${100 + i}` }, { en: `Deposits ${1000 + i}` }],
      ]),
    ]);
    const source = sourceFromQuestion(q, { label: 'x' });
    expect(source.hasFigure).toBe(false);
    expect(source.options[3].en).toBe('Assets ($) | Liabilities ($)\nReserves 103 | Deposits 1003');
    expect(examplePayload(source, ['en'], 0)).not.toHaveProperty('figureNotShown');
  });
  it('a merged heading covers each column it spans', () => {
    const q = optionLayoutMcq(['The table shows spending.', '下表顯示開支。'], combination);
    q.blocks = [
      ...q.blocks,
      table([
        [{ en: 'Price ($)', rowSpan: 2 }, { en: 'Total expenditure ($)', colSpan: 2 }, { en: '', covered: true }],
        [{ en: '', covered: true }, { en: 'Mary' }, { en: 'Peter' }],
        [{ en: '1' }, { en: '20' }, { en: '60' }],
      ]),
    ];
    expect(sourceFromQuestion(q, { label: 'x' }).stem.en).toBe(
      'The table shows spending.\nPrice ($) | Total expenditure ($) | Total expenditure ($)\nPrice ($) | Mary | Peter\n1 | 20 | 60',
    );
  });
  it('two tables in a row stay two tables', () => {
    const q = optionLayoutMcq(['Two firms.', '兩間公司。'], combination);
    q.blocks = [...q.blocks, table([[{ en: 'A' }, { en: '1' }]]), table([[{ en: 'B' }, { en: '2' }]])];
    expect(sourceFromQuestion(q, { label: 'x' }).stem.en).toBe('Two firms.\nA | 1\n\nB | 2');
  });
  it('a stem picture leaves its mark where it is printed, between the words', () => {
    const q = optionLayoutMcq(['The diagram below shows a market.', '下圖顯示一個市場。'], combination);
    q.blocks = [...q.blocks, createImageBlock(pic('d'), 200, 120), createParagraphBlock(bi('Which is right?', '哪項正確？'))];
    const source = sourceFromQuestion(q, { label: 'x' });
    expect(source.stem.zh).toBe(`下圖顯示一個市場。\n${PICTURE_MARK}\n哪項正確？`);
    expect(source.figurePlaces).toEqual(['stem']);
  });
});

describe('older saved examples', () => {
  it('an example saved before places were kept still sends its pictures, placed as "figure"', async () => {
    const q = { ...optionLayoutMcq(['Look.', '看。'], combination), id: newId() };
    q.blocks = [...q.blocks, createImageBlock(pic('old'), 200, 120)];
    const old = { ...sourceFromQuestion(q, { label: 'x' }) };
    delete old.figurePlaces;
    const [read] = await withFigures([old]);
    expect(read.figureAt).toEqual(['figure']);
  });
});
