import { describe, expect, it } from 'vitest';
import type { ContentBlock, McqQuestion, Question, StructuredQuestion } from '@/model/types';
import { listQuestionTypes } from '@/registry';
import { analyseLines, buildImport, pictureHome, previewFigure, readPaste, type Analysis, type OutBlock, type Pin } from '.';

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

describe('MC questions that ask about pictures', () => {
  const mc = (stem: string, options: string[]) => [`1.\t${stem}`, ...options.map((o, k) => `${'ABCD'[k]}.\t${o}`.trimEnd())].join('\n');
  const asked = (plain: string) =>
    analyseLines(readPaste({ plain }))
      .flags.filter((f) => f.kind === 'figureAsked' || f.kind === 'figureMissing')
      .map((f) => `${f.kind}@${f.line}`);

  it('puts a slot under each option when the options name pictures', () => {
    const cases = [
      mc('下列哪一個圖表示需求下降？', ['圖甲', '圖乙', '圖丙', '圖丁']),
      mc('哪幅圖顯示供應增加？', ['圖一', '圖二', '圖三', '圖四']),
      mc('Which diagram shows a fall in demand?', ['P', 'Q', 'R', 'S']),
      mc('Which of the following graphs shows a rise in supply?', ['W', 'X', 'Y', 'Z']),
      mc('In which of the following figures is demand perfectly elastic?', ['Figure 1', 'Figure 2', 'Figure 3', 'Figure 4']),
      mc('Which of the following shows a movement along the curve?', ['Diagram A', 'Diagram B', 'Diagram C', 'Diagram D']),
      mc('Which one is correct?', ['(1)', '(2)', '(3)', '(4)']),
      mc('Which diagram shows a fall in demand?', ['', '', '', '']),
    ];
    for (const plain of cases) expect(asked(plain), plain).toEqual(['figureAsked@1', 'figureAsked@2', 'figureAsked@3', 'figureAsked@4']);
  });

  it('builds the option slots at option width, and a picture pin fills one of them', () => {
    const read = readPaste({ plain: mc('下列哪一個圖表示需求下降？', ['圖甲', '圖乙', '圖丙', '圖丁']) });
    const [shown] = materialize(analyseLines(read), true) as McqQuestion[];
    expect(shown.options.map((o) => o.blocks?.map((b) => [previewFigure(b.id), b.kind === 'image' && b.widthPx]))).toEqual(
      [1, 2, 3, 4].map((line) => [[{ slot: line }, 240]]),
    );
    // A bare-label option is an option without text, not a detached letter.
    const bare = analyseLines(readPaste({ plain: mc('Which diagram shows a fall in demand?', ['', '', '', '']) }));
    expect(bare.flags.map((f) => f.kind)).not.toContain('optionsByOrder');
    expect(bare.outline.questions[0].options.map((o) => o.lines)).toEqual([[1], [2], [3], [4]]);
    const filled = analyseLines(read, { pins: [image('b', 2)] });
    expect(filled.flags.filter((f) => f.kind === 'figureAsked').map((f) => f.line)).toEqual([1, 3, 4]);
    const [q] = materialize(filled) as McqQuestion[];
    expect(q.options.map((o) => srcs(o.blocks ?? []))).toEqual([[], [PNG('b')], [], []]);
  });

  it('puts one slot after the stem when it asks for a picture but the options are text, or name points', () => {
    expect(asked(mc('Which of the following diagrams best shows a public good?', ['one', 'two', 'three', 'four']))).toEqual(['figureMissing@0']);
    expect(asked(mc('Which diagram shows the effect of a subsidy?', ['a rise in price', 'a fall in price', 'no change', 'a shortage']))).toEqual(['figureAsked@0']);
    expect(asked(mc('下列哪一個圖表顯示價格上限？', ['價格上升', '價格下降', '沒有改變', '出現短缺']))).toEqual(['figureAsked@0']);
    expect(asked(mc('Which point shows the new equilibrium?', ['P', 'Q', 'R', 'S']))).toEqual(['figureAsked@0']);
    // The slot goes after the whole stem.
    const two = ['1.\tA tax is imposed on wine.', 'Which point shows the new equilibrium?', 'A.\tP', 'B.\tQ', 'C.\tR', 'D.\tS'].join('\n');
    expect(asked(two)).toEqual(['figureAsked@1']);
    expect(kinds(analyseLines(readPaste({ plain: two })).outline.questions[0].stem)).toEqual(['paragraph', 'paragraph', 'slot']);
  });

  it('leaves alone questions that only look alike', () => {
    const quiet = [
      mc('Which of the following is a feature of a table tennis club?', ['It is a free good.', 'It is a public good.', 'It is a club good.', 'It is a merit good.']),
      mc('以下哪一項是公共物品？', ['燈塔', '公園', '麵包', '汽車']),
      mc('下列哪一項表示需求上升？', ['價格上升', '價格下降', '收入上升', '收入下降']),
      mc('Which curve shifts when income rises?', ['demand', 'supply', 'both', 'neither']),
      mc('How many workers should the firm hire?', ['1', '2', '3', '4']),
      mc('Firm W and firm X sell rice. Which firm earns more?', ['W', 'X', 'both', 'neither']),
      mc('Country W has more capital than country X. Which country exports cars?', ['W', 'X', 'Y', 'Z']),
      ['1.\tWhich firm earns the most?', 'Firm\tProfit', 'W\t10', 'X\t20', 'Y\t30', 'Z\t40', 'A.\tW', 'B.\tX', 'C.\tY', 'D.\tZ'].join('\n'),
    ];
    for (const plain of quiet) expect(asked(plain), plain).toEqual([]);
  });

  it('counts a picture already there: in the stem, or under the options', () => {
    const png = PNG('x');
    const stem = `<p>1. 下列哪一個圖表示需求下降？</p><p><img src="${png}" width="300" height="200"></p><p>A. 圖甲</p><p>B. 圖乙</p><p>C. 圖丙</p><p>D. 圖丁</p>`;
    expect(analyseLines(readPaste({ html: stem })).flags.map((f) => f.kind)).not.toContain('figureAsked');
    // Word's "A.⇥[picture]": each picture goes under its option, and the question is answered.
    const options = `<p>1.\tWhich of the following diagrams shows a fall in demand?</p>${'ABCD'
      .split('')
      .map((l) => `<p>${l}.<span style='mso-tab-count:1'> </span><img src="${png}" width="160" height="120"></p>`)
      .join('')}`;
    const result = analyseLines(readPaste({ html: options }));
    expect(result.flags.map((f) => f.kind).filter((k) => k.startsWith('figure') || k === 'optionsByOrder')).toEqual([]);
    const [q] = materialize(result) as McqQuestion[];
    expect(q.options.map((o) => o.blocks?.length)).toEqual([1, 1, 1, 1]);
    expect(q.options[0].blocks![0]).toMatchObject({ kind: 'image', src: png, widthPx: 160 });
    // Lost ones (file://) are slots under their options.
    const lost = analyseLines(readPaste({ html: options.replaceAll(png, 'file:///C:/x/clip_image001.png') }));
    expect(lost.flags.filter((f) => f.kind === 'imageLost')).toHaveLength(4);
    const [shown] = materialize(lost, true) as McqQuestion[];
    expect(shown.options.map((o) => o.blocks?.map((b) => previewFigure(b.id)))).toEqual([2, 4, 6, 8].map((line) => [{ slot: line }]));
  });
});

describe('a picture on a line outside every question', () => {
  const PAPER = ['Section A', '1.\tWhat is GDP?', '2.\tWhat is inflation?', 'Section B', '3.\tWhat is a tax?', 'END OF PAPER'].join('\n');

  it('opens the next question, deliberately: pictureHome says which', () => {
    const read = readPaste({ plain: PAPER });
    const plain = analyseLines(read);
    expect(plain.roles[3].role).toBe('heading');
    expect(pictureHome(plain.outline, plain.roles, 3)).toBe(2);
    expect(pictureHome(plain.outline, plain.roles, 0)).toBe(0);
    expect(pictureHome(plain.outline, plain.roles, 1)).toBe(0);
    const result = analyseLines(read, { pins: [image('h', 3)] });
    expect(kinds(result.outline.questions[2].stem)).toEqual(['h', 'paragraph']);
    expect(kinds(result.outline.questions[1].stem)).toEqual(['paragraph']);
  });

  it('has no home after the last question, and is never put into it', () => {
    const read = readPaste({ plain: PAPER });
    const plain = analyseLines(read);
    expect(plain.roles[5].question).toBeUndefined();
    expect(pictureHome(plain.outline, plain.roles, 5)).toBeUndefined();
    const result = analyseLines(read, { pins: [image('end', 5)] });
    expect(JSON.stringify(result.outline)).not.toContain('"end"');
  });
});
