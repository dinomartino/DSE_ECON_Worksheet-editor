import { describe, expect, it } from 'vitest';
import type { ContentBlock, McqQuestion, Question, StructuredQuestion } from '@/model/types';
import { listQuestionTypes } from '@/registry';
import { analyseLines, buildImport, previewFigure, readPaste, type Analysis, type OutBlock, type Pin } from '.';

/** Invented papers; pictures are made-up data URLs, never real exam figures. */
const PNG = (tag: string) => `data:image/png;base64,iVBORw0KGgo${tag}`;
const image = (id: string, line: number, extra: Partial<Extract<Pin, { kind: 'image' }>['image']> = {}): Pin => ({
  kind: 'image',
  id,
  line,
  image: { src: PNG(id), widthPx: 400, heightPx: 300, naturalWidthPx: 1200, naturalHeightPx: 900, ...extra },
});

const materialize = (analysis: Analysis, preview = false): Question[] =>
  buildImport(analysis, { preview }).builds.map((b) => {
    const fresh = listQuestionTypes().find((t) => t.id === b.typeId)!.create();
    return b.fill(fresh) as Question;
  });

const kinds = (blocks: readonly OutBlock[]) => blocks.map((b) => (b.kind === 'image' ? (b.pin ?? (b.missing ? 'slot' : 'img')) : b.kind));
const srcs = (blocks: readonly ContentBlock[]) => blocks.filter((b) => b.kind === 'image').map((b) => (b.kind === 'image' ? b.src : ''));

const STRUCTURED = ['1.\tA market for rice.', 'More text about the market.', 'a)\tState the law of demand.', '(i)\tName one factor.', '(ii)\tName another.', 'b)\tExplain the change.', '2.\tWhat is GDP?'].join('\n');
const MC = ['1.\tWhich curve shifts?', 'A.\tdemand', 'B.\tsupply', 'C.\tboth', 'D.\tneither'].join('\n');

describe('image pins', () => {
  it('go right after their line, in the stem, a part or a sub-part', () => {
    const read = readPaste({ plain: STRUCTURED });
    const result = analyseLines(read, { pins: [image('p0', 0), image('p3', 3), image('p5', 5)] });
    const q = result.outline.questions[0];
    expect(kinds(q.stem)).toEqual(['paragraph', 'p0', 'paragraph']);
    expect(kinds(q.parts[0].subParts[0].blocks)).toEqual(['paragraph', 'p3']);
    expect(kinds(q.parts[1].blocks)).toEqual(['paragraph', 'p5']);
    // A part's own line: into that part, after its text.
    const onPart = analyseLines(read, { pins: [image('pa', 2)] }).outline.questions[0].parts[0];
    expect(kinds(onPart.blocks)).toEqual(['paragraph', 'pa']);
  });

  it('keep line order, several to a question, two on one line in the order added', () => {
    const read = readPaste({ plain: STRUCTURED });
    const result = analyseLines(read, { pins: [image('late', 1), image('early', 0), image('late2', 1)] });
    expect(kinds(result.outline.questions[0].stem)).toEqual(['paragraph', 'early', 'paragraph', 'late', 'late2']);
  });

  it('build as image blocks the way imageBlockFromFile makes them', () => {
    const read = readPaste({ plain: STRUCTURED });
    const [q] = materialize(analyseLines(read, { pins: [image('p0', 0)] })) as StructuredQuestion[];
    const block = q.blocks[1];
    expect(block).toMatchObject({ kind: 'image', src: PNG('p0'), widthPx: 400, heightPx: 300, naturalWidthPx: 1200, naturalHeightPx: 900 });
    // A real build never uses the preview's ids.
    expect(previewFigure(block.id)).toBeUndefined();
    const [shown] = materialize(analyseLines(read, { pins: [image('p0', 0)] }), true) as StructuredQuestion[];
    expect(previewFigure(shown.blocks[1].id)).toEqual({ pin: 'p0' });
  });

  it('on an MC stem go in the stem; on an option, under that option at option width', () => {
    const read = readPaste({ plain: MC });
    const result = analyseLines(read, { pins: [image('stem', 0), image('optC', 3)] });
    const [q] = materialize(result) as McqQuestion[];
    expect(srcs(q.blocks)).toEqual([PNG('stem')]);
    expect(q.options[2].blocks).toHaveLength(1);
    expect(q.options[2].blocks![0]).toMatchObject({ kind: 'image', widthPx: 240, heightPx: 180, naturalWidthPx: 1200 });
    expect(q.options[0].blocks).toBeUndefined();
  });

  it('survive re-analysis and other pins: the picture follows its line', () => {
    const read = readPaste({ plain: STRUCTURED });
    const pins: Pin[] = [image('fig', 1), { kind: 'newQuestion', line: 1 }, { kind: 'role', line: 2, role: 'question' }];
    const result = analyseLines(read, { pins });
    const owner = result.roles[1].question!;
    expect(owner).toBe(1);
    expect(kinds(result.outline.questions[owner].stem)).toEqual(['paragraph', 'fig']);
    // Taking the pin back takes the picture with it.
    const without = analyseLines(read, { pins: pins.slice(1) });
    expect(JSON.stringify(without.outline)).not.toContain('fig');
  });
});

describe('figure slots', () => {
  const LOST = '<p>1. Study the market.</p><p><img src="file:///C:/Users/x/clip_image002.png" width="300" height="200"></p><p>(a) Explain.</p>';

  it('a picture lost in the paste is a slot until filled or dismissed', () => {
    const read = readPaste({ html: LOST });
    const lost = read.lines.find((l) => l.image)!.i;
    const plain = analyseLines(read);
    expect(plain.flags.map((f) => f.kind)).toContain('imageLost');
    const [shown] = materialize(plain, true) as StructuredQuestion[];
    expect(shown.blocks.map((b) => (b.kind === 'image' ? previewFigure(b.id) : b.kind))).toEqual(['paragraph', { slot: lost }]);
    expect(srcs((materialize(plain)[0] as StructuredQuestion).blocks)).toEqual([]);

    const filled = analyseLines(read, { pins: [image('fill', lost)] });
    expect(filled.flags.map((f) => f.kind)).not.toContain('imageLost');
    expect(srcs((materialize(filled)[0] as StructuredQuestion).blocks)).toEqual([PNG('fill')]);

    const dismissed = analyseLines(read, { pins: [{ kind: 'noPicture', line: lost }] });
    expect(dismissed.flags.map((f) => f.kind)).not.toContain('imageLost');
    expect(JSON.stringify(materialize(dismissed, true))).not.toContain('pi-slot:');
  });

  it('a caption or reference with no picture is a slot, flagged to check', () => {
    const cases: Array<[string, number]> = [
      [['1.\tStudy the market for tea.', 'Figure 1', 'a)\tExplain the shift.'].join('\n'), 1],
      [['1.\tRefer to the diagram below.', 'a)\tExplain the shift.'].join('\n'), 0],
      [['1.\t根據下圖回答問題。', '(a)\t解釋需求的變化。'].join('\n'), 0],
      [['1.\t細閱以下資料。', '圖一', '(a)\t解釋需求的變化。'].join('\n'), 1],
      [['1.\tStudy the source.', 'Source A', 'a)\tExplain.'].join('\n'), 1],
    ];
    for (const [plain, line] of cases) {
      const result = analyseLines(readPaste({ plain }));
      const flag = result.flags.find((f) => f.kind === 'figureMissing');
      expect(flag, plain).toMatchObject({ line, question: 0 });
      const blocks = JSON.stringify(materialize(result, true));
      expect(blocks, plain).toContain(`pi-slot:${line}`);
      expect(JSON.stringify(materialize(result)), plain).not.toContain('pi-slot:');
    }
  });

  it('puts a caption’s slot right after the caption', () => {
    const plain = ['1.\tStudy the market for tea.', 'Figure 1: The market for tea', 'Tea prices rose.', 'a)\tExplain.'].join('\n');
    const result = analyseLines(readPaste({ plain }));
    expect(kinds(result.outline.questions[0].stem)).toEqual(['paragraph', 'paragraph', 'slot', 'paragraph']);
  });

  it('leaves alone captions that have their picture or table, and sentences that only mention one', () => {
    const fine = [
      ['1.\tThe table below shows the output.', 'Workers\tOutput', '1\t10', '2\t25', 'a)\tFind the marginal product.'].join('\n'),
      ['1.\tFigure 1 shows the market for tea.', 'a)\tExplain.'].join('\n'),
      ['1.\tStudy the source.', 'Source A', 'Tea prices rose by 10% in 2025.', 'a)\tExplain.'].join('\n'),
    ];
    for (const plain of fine) expect(analyseLines(readPaste({ plain })).flags.map((f) => f.kind), plain).not.toContain('figureMissing');
    const pictured = `<p>1. Refer to the diagram below.</p><p><img src="${PNG('x')}" width="300" height="200"></p><p>Figure 1</p><p>(a) Explain.</p>`;
    expect(analyseLines(readPaste({ html: pictured })).flags.map((f) => f.kind)).not.toContain('figureMissing');
  });

  it('a filled or dismissed caption is no longer flagged', () => {
    const read = readPaste({ plain: ['1.\tStudy the market for tea.', 'Figure 1', 'a)\tExplain.'].join('\n') });
    for (const pin of [image('f', 1), { kind: 'noPicture', line: 1 } as Pin]) {
      const result = analyseLines(read, { pins: [pin] });
      expect(result.flags.map((f) => f.kind)).not.toContain('figureMissing');
    }
    expect(kinds(analyseLines(read, { pins: [image('f', 1)] }).outline.questions[0].stem)).toEqual(['paragraph', 'paragraph', 'f']);
  });
});
