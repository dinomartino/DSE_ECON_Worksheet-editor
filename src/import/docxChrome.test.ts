import { describe, expect, it } from 'vitest';
import { analyseLines, readDocx, rowText, type PageChrome } from '.';
import { field, footerPart, headerPart, makeDocx, p, para, picture, PNG_1x1, pp, r, tabs, tbl, textBox, type DocxSpec } from './fixtures/docx';

/** Header and footer parts wired to the body's section. */
function withParts(
  spec: Omit<DocxSpec, 'rels' | 'parts' | 'sectPr'> & {
    header?: string;
    footer?: string;
    firstHeader?: string;
    firstFooter?: string;
    evenHeader?: string;
    titlePg?: boolean;
    media?: Record<string, Uint8Array>;
  },
): Promise<ArrayBuffer> {
  const rels: NonNullable<DocxSpec['rels']> = {};
  const parts: Record<string, string> = {};
  const refs: string[] = [];
  const add = (id: string, kind: 'header' | 'footer', type: string, xml: string | undefined) => {
    if (xml === undefined) return;
    rels[id] = [kind, `${id}.xml`];
    parts[`word/${id}.xml`] = xml;
    refs.push(`<w:${kind}Reference w:type="${type}" r:id="${id}"/>`);
  };
  add('h1', 'header', 'default', spec.header);
  add('f1', 'footer', 'default', spec.footer);
  add('h2', 'header', 'first', spec.firstHeader);
  add('f2', 'footer', 'first', spec.firstFooter);
  add('h3', 'header', 'even', spec.evenHeader);
  if (spec.media) rels.rIdPic = ['image', 'media/pic.png'];
  return makeDocx({ ...spec, rels, parts, sectPr: `${refs.join('')}<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:left="1440" w:right="1440"/>${spec.titlePg ? '<w:titlePg/>' : ''}` });
}

const QUESTIONS = [para('1.\tWhich of the following is a free good?'), ...['A.\tair', 'B.\tbread', 'C.\ttea', 'D.\trice'].map((t) => para(t))].join('');
const chromeOf = async (bytes: ArrayBuffer): Promise<PageChrome> => {
  const read = await readDocx(bytes);
  if (!read.chrome) throw new Error('no chrome');
  return read.chrome;
};
const texts = (c: { rows: Parameters<typeof rowText>[0][] } | undefined) => c?.rows.map(rowText);

describe('docx header and footer', () => {
  it('reads tabbed pieces into zones by the tab stops, and PAGE fields as page numbers', async () => {
    const chrome = await chromeOf(
      await withParts({
        body: QUESTIONS,
        header: headerPart(pp(tabs(['center', 4513], ['right', 9026]), r('S.5 Economics\tTest 2\t') + r('P.') + field('PAGE', '3'))),
        footer: footerPart(pp(tabs(['center', 4513], ['right', 9026]), r('Page ') + field('PAGE') + r(' of ') + field('NUMPAGES', '4') + r('\tSchool copy'))),
      }),
    );
    expect(chrome.header?.rows).toEqual([
      { left: [{ kind: 'text', text: 'S.5 Economics' }], center: [{ kind: 'text', text: 'Test 2' }], right: [{ kind: 'pageNumber', pattern: 'pDot', prefix: '', suffix: '' }] },
    ]);
    expect(chrome.footer?.rows).toEqual([
      { left: [{ kind: 'pageNumber', pattern: 'longForm', prefix: '', suffix: '' }], center: [{ kind: 'text', text: 'School copy' }], right: [] },
    ]);
    expect(chrome.firstPageHeader).toBeUndefined();
  });

  it('keeps wording around a page number, reads w:fldSimple, w:ptab and w:jc', async () => {
    const chrome = await chromeOf(
      await withParts({
        body: QUESTIONS,
        header: headerPart(pp('<w:jc w:val="right"/>', r('Mock exam 2026'))),
        footer: footerPart(p(r('Copyright') + '<w:r><w:ptab w:relativeTo="margin" w:alignment="center" w:leader="none"/></w:r>' + r('- ') + '<w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple>' + r(' -'))),
      }),
    );
    expect(texts(chrome.header)).toEqual(['Mock exam 2026']);
    expect(chrome.header?.rows[0].right).toHaveLength(1);
    expect(chrome.footer?.rows[0]).toEqual({
      left: [{ kind: 'text', text: 'Copyright' }],
      center: [{ kind: 'pageNumber', pattern: 'plain', prefix: '- ', suffix: ' -' }],
      right: [],
    });
  });

  it('places a framed page number (Word’s Page Numbers gallery) on the next line’s row', async () => {
    const chrome = await chromeOf(
      await withParts({
        body: QUESTIONS,
        footer: footerPart(
          `<w:sdt><w:sdtPr><w:docPartObj><w:docPartGallery w:val="Page Numbers (Bottom of Page)"/></w:docPartObj></w:sdtPr><w:sdtContent>${pp('<w:framePr w:wrap="none" w:vAnchor="text" w:hAnchor="margin" w:xAlign="center" w:y="1"/>', field('PAGE'))}</w:sdtContent></w:sdt>` +
            para('© 2026 A Teacher'),
        ),
      }),
    );
    expect(chrome.footer?.rows).toEqual([{ left: [{ kind: 'text', text: '© 2026 A Teacher' }], center: [{ kind: 'pageNumber', pattern: 'plain', prefix: '', suffix: '' }], right: [] }]);
  });

  it('reads page 1’s own header (w:titlePg), a blank page 1, and a rule under the header', async () => {
    const own = await chromeOf(
      await withParts({
        body: QUESTIONS,
        titlePg: true,
        header: headerPart(pp('<w:pBdr><w:bottom w:val="single" w:sz="4"/></w:pBdr>', r('Unit 3 worksheet'))),
        firstHeader: headerPart(pp('<w:jc w:val="center"/>', r('Unit 3 worksheet', { b: true })) + pp(tabs(['right', 9026]), r('\tName: ') + r('          ', { u: 'single' }))),
      }),
    );
    expect(own.header).toEqual({ rows: [{ left: [{ kind: 'text', text: 'Unit 3 worksheet' }], center: [], right: [] }], rule: true });
    expect(own.firstPageHeader?.rows).toEqual([
      { left: [], center: [{ kind: 'text', text: 'Unit 3 worksheet', bold: true }], right: [] },
      { left: [], center: [], right: [{ kind: 'fillIn', prefix: 'Name:', suffix: '', widthCh: 10 }] },
    ]);
    const blank = await chromeOf(await withParts({ body: QUESTIONS, titlePg: true, header: headerPart(para('Unit 3')) }));
    expect(blank.firstPageHeader).toEqual({ rows: [] });
  });

  it('keeps pictures, text boxes, tables, a fourth piece and even pages as text to retype', async () => {
    const chrome = await chromeOf(
      await withParts({
        body: QUESTIONS,
        media: { 'media/pic.png': PNG_1x1 },
        header: headerPart(p(picture('rIdPic', 40, 20, 'School crest') + r('Holy Hill College')) + tbl([[para('Name:'), para('Class:')]]) + p(textBox(para('Draft only')))),
        footer: footerPart(para('A\tB\tC\tD')),
        evenHeader: headerPart(para('Even page header')),
        settings: '<w:evenAndOddHeaders/>',
      }),
    );
    expect(texts(chrome.header)).toEqual(['Holy Hill College']);
    expect(chrome.footer).toBeUndefined();
    expect(chrome.unsupported.map((u) => [u.where, u.reason, u.text])).toEqual([
      ['header', 'table', 'Name:\tClass:'],
      ['header', 'picture', 'School crest'],
      ['header', 'textBox', 'Draft only'],
      ['header', 'evenPages', 'Even page header'],
      ['footer', 'tooMany', 'A\tB\tC\tD'],
    ]);
  });
});

describe('docx masthead', () => {
  it('takes the heading block above the first question off the lines, fill-ins and full marks as fields', async () => {
    const read = await readDocx(
      await makeDocx({
        body: [
          pp('<w:jc w:val="center"/>', r('St Paul’s Secondary School', { b: true })),
          pp('<w:jc w:val="center"/>', r('S.4 Economics Uniform Test')),
          pp(tabs(['center', 4513], ['right', 9026]), r('Name: ________\tClass: _____ ( )\tDate: ______')),
          para('Full marks: 5 marks'),
          para(''),
          para('Answer ALL questions.'),
          QUESTIONS,
        ].join(''),
      }),
    );
    expect(read.chrome?.masthead?.map(rowText)).toEqual(['St Paul’s Secondary School', 'S.4 Economics Uniform Test', 'Name:________\tClass:_____ ( )\tDate:______', 'Full marks: 5 marks']);
    expect(read.chrome?.masthead?.[2]).toEqual({
      left: [{ kind: 'fillIn', prefix: 'Name:', suffix: '', widthCh: 8 }],
      center: [{ kind: 'fillIn', prefix: 'Class:', suffix: ' ( )', widthCh: 5 }],
      right: [{ kind: 'fillIn', prefix: 'Date:', suffix: '', widthCh: 6 }],
    });
    expect(read.chrome?.masthead?.[3].left).toEqual([{ kind: 'totalMarks', prefix: 'Full marks: ', marks: 5, suffix: ' marks' }]);
    // The instructions and the question stay; nothing of the masthead is a line any more.
    expect(read.lines.map((l) => l.text).filter(Boolean)).toEqual(['Answer ALL questions.', 'Which of the following is a free good?', 'air', 'bread', 'tea', 'rice']);
    expect(analyseLines(read).outline.questions).toHaveLength(1);
  });

  it('reads Chinese labels and a borderless table of blanks, and splits a line of more than three', async () => {
    const read = await readDocx(
      await makeDocx({
        body: [
          pp('<w:jc w:val="center"/>', r('中四經濟科測驗', { b: true })),
          tbl([[para('姓名：＿＿＿＿＿＿'), para('班別：＿＿＿'), para('學號：＿＿')]]),
          para('Name:\tClass:\tNo.:\tDate:'),
          para('1.\t以下哪一項是免費物品？'),
          ...['A.\t空氣', 'B.\t麵包', 'C.\t茶', 'D.\t米'].map((t) => para(t)),
        ].join(''),
      }),
    );
    const masthead = read.chrome?.masthead ?? [];
    expect(masthead[0].center).toEqual([{ kind: 'text', text: '中四經濟科測驗', bold: true }]);
    expect(masthead[1]).toEqual({
      left: [{ kind: 'fillIn', prefix: '姓名：', suffix: '', widthCh: 6 }],
      center: [{ kind: 'fillIn', prefix: '班別：', suffix: '', widthCh: 4 }],
      right: [{ kind: 'fillIn', prefix: '學號：', suffix: '', widthCh: 4 }],
    });
    // Four labels on one line: two rows, left to right.
    expect(masthead.slice(2).map((row) => [row.left, row.center, row.right].map((z) => z.map((f) => ('prefix' in f ? f.prefix : '')).join()))).toEqual([
      ['Name:', 'Class:', 'No.:'],
      ['Date:', '', ''],
    ]);
    expect(read.lines[0].text).toBe('以下哪一項是免費物品？');
  });

  it('leaves a paper that starts with its stimulus or first question alone', async () => {
    const stimulus = await readDocx(await makeDocx({ body: [para('Study the table below and answer Questions 1 and 2.'), QUESTIONS].join('') }));
    expect(stimulus.chrome?.masthead).toBeUndefined();
    expect(stimulus.lines[0].text).toBe('Study the table below and answer Questions 1 and 2.');
    const bare = await readDocx(await makeDocx({ body: QUESTIONS }));
    expect(bare.chrome).toBeUndefined();
  });
});
