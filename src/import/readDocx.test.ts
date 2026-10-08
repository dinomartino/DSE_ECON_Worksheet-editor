import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { analyseLines, buildImport, DocxReadError, readDocx, readPaste, type ImageRef } from '.';
import { abstractNum, chart, EMF, group, looseLabel, looseLine, makeDocx, num, p, para, picture, PNG_1x1, r, tbl, textBox } from './fixtures/docx';
import { scoreAnalysis } from './fixtures/score';
import type { ExpectedQuestion } from './fixtures/expected';

const COMBO = ['(1) and (2) only', '(1) and (3) only', '(2) and (3) only', '(1), (2) and (3)'];

async function analyse(spec: Parameters<typeof makeDocx>[0], options?: Parameters<typeof readDocx>[1]) {
  const read = await readDocx(await makeDocx(spec), options);
  return { read, analysis: analyseLines(read) };
}

function expectOutline(analysis: ReturnType<typeof analyseLines>, questions: ExpectedQuestion[], lead?: string) {
  const score = scoreAnalysis(analysis, { kind: 'ok', questions, ...(lead ? { lead } : {}) });
  expect(score.failures).toEqual([]);
  expect(score.got).toBe(questions.length);
}

const rejection = async (bytes: ArrayBuffer | Uint8Array) => {
  try {
    await readDocx(bytes instanceof Uint8Array ? (bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer) : bytes);
  } catch (e) {
    return e instanceof DocxReadError ? e.kind : `other: ${String(e)}`;
  }
  return 'read';
};

describe('docx reader: list numbering', () => {
  it('reads an auto-numbered MC paper: statements, options per question, an option table, a highlighted answer', async () => {
    const { read, analysis } = await analyse({
      numbering: [
        abstractNum(1, [['decimal', '%1.']]),
        abstractNum(2, [['upperLetter', '%1.']]),
        abstractNum(3, [['decimal', '(%1)']]),
        num(1, 1),
        num(2, 3),
        num(3, 2, 1),
        num(4, 2, 1),
        num(5, 2, 1),
      ].join(''),
      body: [
        para('Part A: Multiple-choice questions'),
        para('A bakery hires two more workers. Which of the following must be true?', { num: [1, 0] }),
        para('Its total output rises.', { num: [2, 0] }),
        para('Its total cost rises.', { num: [2, 0] }),
        para('Its average cost falls.', { num: [2, 0] }),
        para(COMBO[0], { num: [3, 0] }),
        para(COMBO[1], { num: [3, 0] }),
        p(r(COMBO[2], { highlight: 'yellow' }), { num: [3, 0] }),
        para(COMBO[3], { num: [3, 0] }),
        para('Which of the following is a free good?', { num: [1, 0] }),
        ...['sea water in the ocean', 'a free newspaper', 'tap water', 'a free sample'].map((t) => para(t, { num: [4, 0] })),
        para('Study the table below.', { num: [1, 0] }),
        tbl([[para('Year'), para('Output (units)')], [para('2024'), para('40')], [para('2025'), para('55')]]),
        para('Which statement is correct?'),
        tbl([[para('output rose', { num: [5, 0] }), para('output fell', { num: [5, 0] })], [para('output was unchanged', { num: [5, 0] }), para('none of the above', { num: [5, 0] })]]),
      ].join(''),
    });
    expect(read.source).toBe('docx');
    expect(read.lines.filter((l) => l.labelSource === 'list').map((l) => l.label)).toEqual(['1.', '(1)', '(2)', '(3)', 'A.', 'B.', 'C.', 'D.', '2.', 'A.', 'B.', 'C.', 'D.', '3.']);
    expectOutline(analysis, [
      { stem: 'A bakery hires two more workers.', kind: 'mc', statements: 3, options: COMBO, answer: 2 },
      { stem: 'Which of the following is a free good?', kind: 'mc', options: ['sea water', 'a free newspaper', 'tap water', 'a free sample'] },
      { stem: 'Study the table below. Year Output (units)', kind: 'mc', options: ['output rose', 'output fell', 'output was unchanged', 'none of the above'] },
    ]);
  });

  it('counts multi-level lists: parts restart under each question, sub-parts under each part', async () => {
    const { read, analysis } = await analyse({
      numbering: abstractNum(10, [['decimal', '%1.'], ['lowerLetter', '(%2)'], ['lowerRoman', '(%3)']]) + num(10, 10),
      body: [
        para('Hong Kong runs a largely free market.', { num: [10, 0] }),
        para('Explain what is meant by a free market.\t(2 marks)', { num: [10, 1] }),
        para('\t\t', {}),
        para('Discuss one benefit of the market for', { num: [10, 1] }),
        para('consumers, and', { num: [10, 2] }),
        para('firms.', { num: [10, 2] }),
        para('\t(4 marks)'),
        para('A government builds a new road.', { num: [10, 0] }),
        para('Define opportunity cost.\t(2 marks)', { num: [10, 1] }),
      ].join(''),
    });
    expect(read.lines.filter((l) => l.labelSource === 'list').map((l) => `${l.label}@${l.depth}`)).toEqual(['1.@0', '(a)@1', '(b)@1', '(i)@2', '(ii)@2', '2.@0', '(a)@1']);
    expectOutline(analysis, [
      {
        stem: 'Hong Kong runs',
        kind: 'structured',
        parts: [
          { text: 'Explain what is meant', marks: 2 },
          { text: 'Discuss one benefit', marks: 4, subParts: [{ text: 'consumers' }, { text: 'firms' }] },
        ],
      },
      { stem: 'A government builds', kind: 'structured', parts: [{ text: 'Define opportunity cost.', marks: 2 }] },
    ]);
  });

  it('restarts numbering where a new list instance overrides the start', async () => {
    const { read, analysis } = await analyse({
      numbering: abstractNum(20, [['decimal', '%1.']]) + num(20, 20) + num(21, 20, 1),
      body: [
        para('Section A'),
        para('What is scarcity?\t(2 marks)', { num: [20, 0] }),
        para('What is a free good?\t(2 marks)', { num: [20, 0] }),
        para('Section B'),
        para('What is division of labour?\t(3 marks)', { num: [21, 0] }),
        para('What is a public good?\t(3 marks)', { num: [21, 0] }),
      ].join(''),
    });
    expect(read.lines.filter((l) => l.label).map((l) => l.label)).toEqual(['1.', '2.', '1.', '2.']);
    expect(analysis.outline.questions).toHaveLength(4);
    expect(analysis.flags.map((f) => f.kind)).not.toContain('numberRestart');
  });

  it('continues a list whose second instance shares the abstract list', async () => {
    const { read } = await analyse({
      numbering: abstractNum(1, [['decimal', '%1.']]) + num(1, 1) + num(2, 1),
      body: [para('one', { num: [1, 0] }), para('two', { num: [2, 0] }), para('three', { num: [1, 0] })].join(''),
    });
    expect(read.lines.map((l) => l.label)).toEqual(['1.', '2.', '3.']);
  });

  it('numbers through a paragraph style, and formats Chinese counting and circled numbers', async () => {
    const styles =
      '<w:style w:type="paragraph" w:styleId="Q"><w:name w:val="Question"/><w:pPr><w:numPr><w:numId w:val="30"/></w:numPr></w:pPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="S"><w:name w:val="Section"/><w:pPr><w:numPr><w:numId w:val="31"/></w:numPr></w:pPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="T"><w:name w:val="Statement"/><w:pPr><w:numPr><w:numId w:val="32"/></w:numPr></w:pPr></w:style>';
    const { read } = await analyse({
      styles,
      numbering: [abstractNum(30, [['decimal', '%1.']]), abstractNum(31, [['chineseCounting', '%1、']]), abstractNum(32, [['decimalEnclosedCircle', '%1']]), num(30, 30), num(31, 31), num(32, 32)].join(''),
      body: [para('選擇題', { style: 'S' }), para('下列哪項是稀有物品？', { style: 'Q' }), para('空氣', { style: 'T' }), para('陽光', { style: 'T' }), para('問答題', { style: 'S' })].join(''),
    });
    expect(read.lines.map((l) => [l.label, l.labelInfo?.family])).toEqual([
      ['一、', '一、'],
      ['1.', 'n.'],
      ['(1)', '(n)'],
      ['(2)', '(n)'],
      ['二、', '一、'],
    ]);
  });
});

describe('docx reader: what the paste loses', () => {
  it('places a text box where its anchor is, reading one branch of the alternate content', async () => {
    const box = textBox(para('Source A: Rents in Mong Kok') + para('Shop rents rose by 8% in 2025 while sales rose by 2%.'));
    const { read, analysis } = await analyse({
      numbering: abstractNum(1, [['decimal', '%1.'], ['lowerLetter', '(%2)']]) + num(1, 1),
      body: [
        para('Study Source A and answer the question.', { num: [1, 0] }),
        p(box),
        para('Explain one reason for the rise in rents.\t(3 marks)', { num: [1, 1] }),
        para('Suggest one policy to help shop owners.\t(2 marks)', { num: [1, 1] }),
      ].join(''),
    });
    expect(read.lines.filter((l) => l.text.startsWith('Source A'))).toHaveLength(1);
    const texts = read.lines.map((l) => l.text).filter(Boolean);
    expect(texts.indexOf('Source A: Rents in Mong Kok')).toBeLessThan(texts.indexOf('Explain one reason for the rise in rents.'));
    expectOutline(analysis, [
      { stem: 'Study Source A', kind: 'structured', parts: [{ text: 'Explain one reason', marks: 3 }, { text: 'Suggest one policy', marks: 2 }] },
    ]);
  });

  it('puts a box set above its paragraph before that paragraph', async () => {
    const { read } = await analyse({ body: p(textBox(para('Source B: Exports in 2025 fell by 3% compared with 2024.'), -150) + r('1.\tWhat happened to exports?')) });
    expect(read.lines.map((l) => l.text)).toEqual(['Source B: Exports in 2025 fell by 3% compared with 2024.', 'What happened to exports?']);
  });

  it('reads pictures with their display size, and marks EMF, charts, drawn diagrams and links as slots', async () => {
    const { read, analysis } = await analyse({
      rels: {
        rId5: ['image', 'media/image1.png'],
        rId6: ['image', 'media/image2.emf'],
        rId7: ['chart', 'charts/chart1.xml'],
        rId8: ['image', 'https://example.com/a.png'],
      },
      media: { 'media/image1.png': PNG_1x1, 'media/image2.emf': EMF },
      numbering: abstractNum(1, [['decimal', '%1.']]) + num(1, 1),
      body: [
        para('Study the photo below. Explain one cost of the project.\t(3 marks)', { num: [1, 0] }),
        p(picture('rId5', 200, 100, 'A harbour')),
        para('Study the diagram. Explain the change in price.\t(3 marks)', { num: [1, 0] }),
        p(picture('rId6', 300, 200)),
        para('Study the chart. Describe the trend.\t(2 marks)', { num: [1, 0] }),
        p(chart('rId7')),
        para('Study Figure 1. Explain the shortage.\t(4 marks)', { num: [1, 0] }),
        p(group(['Price ($)', 'Quantity', 'S', 'D', '0'])),
        para('Study the logo. Name the firm.\t(1 mark)', { num: [1, 0] }),
        p(picture('rId8', 50, 50)),
      ].join(''),
    });
    const images = read.lines.filter((l) => l.image).map((l) => l.image!);
    expect(images[0]).toMatchObject({ widthPx: 200, heightPx: 100, naturalWidthPx: 1, naturalHeightPx: 1, alt: 'A harbour' });
    expect(images[0].src).toMatch(/^data:image\/png;base64,iVBOR/);
    expect(images.slice(1).map((i) => [i.src, i.alt])).toEqual([['', 'emf'], ['', 'chart'], ['', 'drawing'], ['', 'linked']]);
    // The group's axis labels belong to the slot, not the text.
    expect(read.lines.some((l) => l.text === 'Price ($)')).toBe(false);
    expect(analysis.flags.filter((f) => f.kind === 'imageLost').map((f) => f.question)).toEqual([1, 2, 3, 4]);
    const batch = buildImport(analysis);
    expect(batch.builds).toHaveLength(5);
    expect(buildImport(analysis, { preview: true }).builds).toHaveLength(5);
  });

  it('takes the pictures out of a group, and its long text boxes; short labels stay with the picture', async () => {
    const { read } = await analyse({
      rels: { rId5: ['image', 'media/image1.png'] },
      media: { 'media/image1.png': PNG_1x1 },
      body: p(group(['US', 'April 2025: tariffs of 25% were announced on imported steel.'], [['rId5', 120, 80]])),
    });
    expect(read.lines.map((l) => (l.image ? `img ${l.image.widthPx}x${l.image.heightPx}` : l.text))).toEqual(['img 120x80', 'April 2025: tariffs of 25% were announced on imported steel.']);
  });

  it('pools an ungrouped diagram drawn shape by shape into one slot, keeping its caption', async () => {
    const { read, analysis } = await analyse({
      numbering: abstractNum(1, [['decimal', '%1.'], ['lowerLetter', '(%2)']]) + num(1, 1),
      body: [
        para('A firm is the only seller of a drug.', { num: [1, 0] }),
        p(looseLabel('Figure 1')),
        p(looseLine() + looseLine() + looseLabel('P') + looseLabel('Q')),
        p(looseLabel('D: Demand') + looseLabel('MC: Marginal cost')),
        para('Explain how it sets its price.\t(4 marks)', { num: [1, 1] }),
        para('Explain whether it is efficient.\t(3 marks)', { num: [1, 1] }),
      ].join(''),
    });
    expect(read.lines.filter((l) => l.text || l.image).map((l) => (l.image ? `slot:${l.image.alt}` : l.text))).toEqual([
      'A firm is the only seller of a drug.',
      'Figure 1',
      'slot:drawing',
      'Explain how it sets its price.',
      'Explain whether it is efficient.',
    ]);
    expectOutline(analysis, [{ stem: 'A firm is the only seller', kind: 'structured', parts: [{ text: 'Explain how', marks: 4 }, { text: 'Explain whether', marks: 3 }] }]);
  });

  it('hands pictures to prepareImage, and a null result leaves a slot', async () => {
    const seen: string[] = [];
    const prepareImage = async (blob: Blob): Promise<ImageRef | null> => {
      seen.push(blob.type);
      return seen.length === 1 ? { src: 'data:image/png;base64,SMALL', naturalWidthPx: 1, naturalHeightPx: 1 } : null;
    };
    const { read } = await analyse(
      {
        rels: { rId5: ['image', 'media/a.png'], rId6: ['image', 'media/b.png'] },
        media: { 'media/a.png': PNG_1x1, 'media/b.png': PNG_1x1 },
        body: p(picture('rId5', 80, 40)) + p(picture('rId6', 80, 40)),
      },
      { prepareImage },
    );
    expect(seen).toEqual(['image/png', 'image/png']);
    expect(read.lines.map((l) => l.image && [l.image.src, l.image.widthPx])).toEqual([['data:image/png;base64,SMALL', 80], ['', 80]]);
  });
});

describe('docx reader: runs and paragraphs', () => {
  it('keeps formatting, accepts insertions, drops deletions, hidden text and field codes', async () => {
    const field = '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> REF Table1 </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>Table 1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>';
    const { read } = await analyse({
      body: [
        p(r('Explain ') + '<w:ins w:id="1" w:author="t"><w:r><w:t xml:space="preserve">why </w:t></w:r></w:ins>' + '<w:del w:id="2" w:author="t"><w:r><w:delText>how </w:delText></w:r></w:del>' + r('the price of ') + r('H', { b: true }) + r('2', { vert: 'subscript' }) + r('O rises', { i: true }) + r(' (secret)', { vanish: true }) + r(', see ') + field + r('.')),
        p(r('Cost ') + '<w:r><w:sym w:font="Symbol" w:char="F0B4"/></w:r>' + r(' 2 = ‘double’') + '<w:r><w:br/></w:r>' + r('next line')),
        p('<w:r><w:br w:type="page"/></w:r>'),
        para('After the break'),
        p('<m:oMath><m:f><m:num><m:r><m:t>a</m:t></m:r></m:num><m:den><m:r><m:t>b</m:t></m:r></m:den></m:f></m:oMath>'),
      ].join(''),
    });
    const [first, second, third, , fifth, sixth] = read.lines;
    expect(first.text).toBe('Explain why the price of H2O rises, see Table 1.');
    expect(first.runs.find((x) => x.text === 'H')).toMatchObject({ bold: true });
    expect(first.runs.find((x) => x.text === '2')).toMatchObject({ vertAlign: 'subscript' });
    expect(second.text).toBe('Cost × 2 = ‘double’');
    expect(third.text).toBe('next line');
    expect(fifth).toMatchObject({ text: 'After the break', pageBreak: true });
    expect(sixth.text).toBe('a/b');
  });

  it('turns tab-only and dotted lines into answer space, and reads a bold option as the answer', async () => {
    const { read, analysis } = await analyse({
      body: [
        para('1.\tWhich is a factor of production?'),
        para('A.\tmoney'),
        p(r('B.\t', { b: true }) + r('land', { b: true })),
        para('C.\tprofit'),
        para('D.\tinterest'),
        para('2.\tDefine land.\t(2 marks)'),
        p(r('\t\t', { u: 'dotted' })),
        para('……………………………………………………'),
        p(r('          ', { u: 'single' })),
      ].join(''),
    });
    expect(read.lines.slice(6).map((l) => l.tabOnly)).toEqual([true, true, true]);
    expectOutline(analysis, [
      { stem: 'Which is a factor', kind: 'mc', options: ['money', 'land', 'profit', 'interest'], answer: 1 },
      { stem: 'Define land.', kind: 'structured', marks: 2, answerSpace: 3 },
    ]);
  });

  it('reads typed labels the way the Word paste does', async () => {
    const plain = '\t1.\tA shop cuts its prices.\n\t\t(a)\tExplain the effect on revenue.\t(3 marks)\n\t\t(b)\tSuggest one risk.\t(2 marks)\n\t2.\tWhat is GDP?\t(2 marks)';
    const fromDocx = (await analyse({ body: plain.split('\n').map((l) => para(l)).join('') })).analysis;
    const fromPaste = analyseLines(readPaste({ plain }));
    const shape = (a: typeof fromDocx) => a.outline.questions.map((q) => [q.kind, q.parts.map((x) => [x.label, x.marks]), q.marks]);
    expect(shape(fromDocx)).toEqual(shape(fromPaste));
    expect(shape(fromDocx)).toHaveLength(2);
  });

  it('reads a Chinese paper', async () => {
    const { analysis } = await analyse({
      numbering: abstractNum(1, [['decimal', '%1.'], ['lowerLetter', '(%2)']]) + num(1, 1),
      body: [
        para('甲部'),
        para('某城市的租金上升。', { num: [1, 0] }),
        para('解釋租金上升對小商戶的影響。\t（4分）', { num: [1, 1] }),
        para('建議一項政府可採取的措施。\t（2分）', { num: [1, 1] }),
        para('試以供求圖解釋最低工資的影響。\t（6分）', { num: [1, 0] }),
      ].join(''),
    });
    expectOutline(analysis, [
      { stem: '某城市的租金上升。', kind: 'structured', side: 'zh', parts: [{ text: '解釋租金上升', marks: 4 }, { text: '建議一項', marks: 2 }] },
      { stem: '試以供求圖', kind: 'structured', side: 'zh', marks: 6 },
    ]);
  });

  it('treats a one-column table as a frame and keeps a data table as rows', async () => {
    const { read } = await analyse({
      body: [tbl([[para('Source C: A news report') + para('Retail sales fell for the third month in a row.')]]), tbl([[para('Year'), para('Sales')], [para('2025'), p(r('$1') + '<w:r><w:br/></w:r>' + r('million'))]])].join(''),
    });
    expect(read.lines.map((l) => (l.cells ? l.cells.map((c) => c.map((x) => x.text).join('')) : l.text))).toEqual([
      'Source C: A news report',
      'Retail sales fell for the third month in a row.',
      ['Year', 'Sales'],
      ['2025', '$1 million'],
    ]);
  });
});

describe('docx reader: the file', () => {
  it('takes the title from the core properties, then a title style, then the running header', async () => {
    expect((await readDocx(await makeDocx({ title: 'Mock Paper 1', body: para('x') }))).title).toBe('Mock Paper 1');
    const styles = '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/></w:style>';
    expect((await readDocx(await makeDocx({ styles, body: para('Name: ______') + para('Market Failure Quiz', { style: 'Title' }) }))).title).toBe('Market Failure Quiz');
    const header = '<?xml version="1.0"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>S.5 Economics Test 2</w:t></w:r><w:r><w:tab/><w:t>Name: ________</w:t></w:r></w:p></w:hdr>';
    const fromHeader = await readDocx(await makeDocx({ rels: { rIdH: ['header', 'header1.xml'] }, parts: { 'word/header1.xml': header }, body: para('1.\tWhat is a market?') }));
    expect(fromHeader.title).toBe('S.5 Economics Test 2');
    expect(fromHeader.lines.some((l) => l.text.includes('Economics Test'))).toBe(false);
  });

  it('reads a document whose generator chose other namespace prefixes', async () => {
    const doc = '<?xml version="1.0"?><x:document xmlns:x="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><x:body><x:p><x:r><x:t>1.&#9;Tom &amp; Mary&#8217;s shop &lt;closed&gt;.</x:t></x:r></x:p></x:body></x:document>';
    const read = await readDocx(await makeDocx({ body: '', parts: { 'word/document.xml': doc } }));
    expect(read.lines.map((l) => [l.label, l.text])).toEqual([['1.', 'Tom & Mary’s shop <closed>.']]);
  });

  it('says why a file cannot be read', async () => {
    expect(await rejection(new TextEncoder().encode('%PDF-1.7 not a word file'))).toBe('notDocx');
    const ole = new Uint8Array(4096);
    ole.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    expect(await rejection(ole)).toBe('notDocx');
    ole.set([...'EncryptionInfo'].flatMap((c) => [c.charCodeAt(0), 0]), 1024);
    expect(await rejection(ole)).toBe('encrypted');
    expect(await rejection(Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5]))).toBe('unreadable');
    const sheet = new JSZip();
    sheet.file('[Content_Types].xml', '<Types/>');
    sheet.file('xl/workbook.xml', '<workbook/>');
    expect(await rejection(await sheet.generateAsync({ type: 'arraybuffer' }))).toBe('notDocx');
    expect(await rejection(await makeDocx({ body: '', parts: { 'word/document.xml': 'not xml at all' } }))).toBe('unreadable');
  });
});
