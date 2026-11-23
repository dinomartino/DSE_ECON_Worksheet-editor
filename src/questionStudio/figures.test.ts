import { describe, expect, it } from 'vitest';
import { optionLayoutMcq, withFigures } from '@/test/optionLayoutFixture';
import { figureBlocksOf, figuresOfBlocks, withFigures as readFigures, MAX_FIGURES_PER_EXAMPLE } from './figures';
import { searchRows } from './references';
import { sourceFromQuestion } from './source';
import { EXAMPLE } from './fixtures';
import { parseSearch, type SearchRow } from '@/pastpapers/pack';

const base = optionLayoutMcq(['Which is right?', '哪項正確？'], [['a', 'a'], ['b', 'b'], ['c', 'c'], ['d', 'd']]);

describe('a question\'s pictures', () => {
  it('finds image and diagram blocks in the stem, the passage and the options, in reading order', () => {
    expect(figureBlocksOf(base)).toEqual([]);
    const withImages = withFigures(base, 'image');
    expect(figureBlocksOf(withImages)).toHaveLength(4);
    expect(sourceFromQuestion(withImages, { label: 'x' })).toMatchObject({ hasFigure: true });
    expect(sourceFromQuestion(withImages, { label: 'x' }).figureBlocks).toHaveLength(4);
    expect(sourceFromQuestion(base, { label: 'x' }).figureBlocks).toBeUndefined();
  });
  it('reads stored images as data URLs, at most the cap, and skips anything unusable', async () => {
    const blocks = figureBlocksOf(withFigures(base, 'image'));
    const read = await figuresOfBlocks(blocks);
    expect(read).toHaveLength(MAX_FIGURES_PER_EXAMPLE);
    expect(read[0].dataUrl).toMatch(/^data:image\/png;base64,/);
    // An asset id or a remote address is not a picture the engine can send.
    const odd = blocks.map((b) => (b.kind === 'image' ? { ...b, src: 'asset-123' } : b));
    expect(await figuresOfBlocks(odd)).toEqual([]);
  });
  it('a diagram needs a canvas: without one it is skipped, never an error', async () => {
    expect(await figuresOfBlocks(figureBlocksOf(withFigures(base, 'diagram')))).toEqual([]);
  });
  it('withFigures reads each example once and keeps the blocks', async () => {
    const source = sourceFromQuestion(withFigures(base, 'image'), { label: 'x' });
    const [done] = await readFigures([source]);
    expect(done.figures).toHaveLength(MAX_FIGURES_PER_EXAMPLE);
    expect(done.figureBlocks).toHaveLength(4);
    const [again] = await readFigures([done]);
    expect(again).toBe(done);
    expect(await readFigures([EXAMPLE])).toEqual([EXAMPLE]);
  });
});

describe('searching the bank for a question to write like', () => {
  const rows = parseSearch(
    {
      version: 1,
      questions: [
        { topic: 't', source: 'DSE2019/P1/Q5', en: 'Price elasticity of demand falls when', zh: '需求價格彈性' },
        { topic: 't', source: 'DSE2021/P1/Q9', en: 'Elasticity and total revenue', zh: '彈性與總收益' },
        { topic: 't', source: 'CE2005/P1/Q2', en: 'Price elasticity of supply', zh: '供應彈性' },
        { topic: 't', source: 'DSE2015/P1/Q1', en: 'Inflation measured by CPI', zh: '通脹' },
      ],
    },
    [{ id: 't', title: { en: 't', zh: 't' }, order: 1, file: 't.json' }],
  ) as SearchRow[];
  it('matches every word in either language, newest HKDSE first', () => {
    expect(rows).toHaveLength(4);
    expect(searchRows(rows, 'elasticity').map((r) => r.source.tag)).toEqual(['DSE2021/P1/Q9', 'DSE2019/P1/Q5', 'CE2005/P1/Q2']);
    expect(searchRows(rows, 'elasticity 2019').map((r) => r.source.tag)).toEqual(['DSE2019/P1/Q5']);
    expect(searchRows(rows, '彈性').length).toBe(3);
    expect(searchRows(rows, 'nothing here')).toEqual([]);
    expect(searchRows(rows, '', 2)).toHaveLength(2);
  });
});
