import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { exportDocxBuffer } from '@/export/docx';
import { questionClipboardHtml } from '@/export/clipboard';
import { createMcqQuestion, createParagraphBlock, createStructuredQuestion, createTableBlock, createWorksheet, newId } from '@/model/factories';
import { withJustifyText } from '@/model/fonts';
import { migrate, serializeWorksheet } from '@/model/migrations';
import { bi } from '@/model/text';
import type { LayoutElement, McqQuestion, OutputMode, StructuredQuestion, Worksheet } from '@/model/types';
import { renderWorksheet } from '@/render/worksheet';
import type { RenderNode, TextNode } from '@/render/ir';
import { buildAcceptanceWorksheet, withFlow } from '@/test/fixtures';

/**
 * Document setup's "Justify text" (`Worksheet.justifyText`): the body text prints
 * justified in every backend, through the named styles in the .docx. An element's own
 * alignment wins; titles, headings, tables, tab-stop rows and the cover are untouched.
 */

const BILINGUAL: OutputMode = { language: 'bilingual', version: 'student' };

const LONG =
  'The government imposes a price ceiling below the equilibrium price, so the quantity ' +
  'demanded exceeds the quantity supplied and a shortage results in the market.';

function paper(): Worksheet {
  const stacked: McqQuestion = {
    ...createMcqQuestion(),
    blocks: [createParagraphBlock(bi(LONG, '政府把價格上限定於均衡價格以下。'))],
    statements: [bi(LONG, '甲'), bi('Supply rises.', '乙')],
    options: ['A', 'B', 'C', 'D'].map((letter, index) => ({ id: `opt-${index}`, text: bi(`${LONG} (${letter})`, '丙') })),
  };
  const inline: McqQuestion = {
    ...createMcqQuestion(),
    blocks: [createParagraphBlock(bi('Short options follow:', '短選項：'))],
    optionLayout: 'inline',
    // One line each: a bilingual option's two lines would make the row a grid.
    options: ['1', '2', '3', '4'].map((value, index) => ({ id: `in-${index}`, text: bi(value, '') })),
  };
  // A stem the teacher centred keeps its centre.
  const centred: McqQuestion = {
    ...createMcqQuestion(),
    blocks: [{ ...createParagraphBlock(bi(LONG, '置中')), format: { align: 'center' } }],
    optionAlign: 'right',
    options: ['A', 'B', 'C', 'D'].map((letter, index) => ({ id: `c-${index}`, text: bi(`${LONG} (${letter})`, '') })),
  };
  const table = createTableBlock(2, 2);
  table.rows[0].cells[0].text = bi(LONG, '表');
  const structured: StructuredQuestion = {
    ...createStructuredQuestion(),
    blocks: [createParagraphBlock(bi(LONG, '考慮一個市場。')), table],
    parts: [
      {
        id: newId(),
        blocks: [createParagraphBlock(bi(LONG, '部分'))],
        subParts: [{ id: newId(), blocks: [createParagraphBlock(bi(LONG, '小部分'))], marks: 2 }],
      },
    ],
  };
  const heading: LayoutElement = { kind: 'heading', id: 'heading', text: bi('Section A', '甲部') };
  const note: LayoutElement = { kind: 'text', id: 'note', text: bi(LONG, '附註') };
  const worksheet = withFlow(createWorksheet(), [heading, stacked, inline, centred, note, structured], { replaceLayout: true });
  worksheet.title = bi('Justified paper', '左右對齊');
  return worksheet;
}

const on = (worksheet: Worksheet) => withJustifyText(worksheet, true);

function flowText(worksheet: Worksheet): TextNode[] {
  const rendered = renderWorksheet(worksheet, BILINGUAL);
  const all: RenderNode[] = rendered.items.flatMap((item) =>
    item.type === 'question' ? item.question.nodes : item.layout.nodes,
  );
  return all.filter((node): node is TextNode => node.kind === 'text');
}

async function parts(worksheet: Worksheet) {
  const zip = await JSZip.loadAsync(await exportDocxBuffer(worksheet, BILINGUAL));
  const read = (name: string) => zip.file(name)!.async('string');
  return {
    document: await read('word/document.xml'),
    styles: await read('word/styles.xml'),
    settings: await read('word/settings.xml'),
    header: zip.file('word/header1.xml') ? await read('word/header1.xml') : '',
    names: Object.keys(zip.files).sort(),
    read,
  };
}

function styleXml(styles: string, id: string): string {
  const match = styles.match(new RegExp(`<w:style [^>]*w:styleId="${id}">.*?</w:style>`));
  expect(match, id).not.toBeNull();
  return match![0];
}

/** Every paragraph's `w:pPr` in one style, in document order. */
function paragraphProps(xml: string, styleId: string): string[] {
  return [...xml.matchAll(/<w:pPr>(?:(?!<\/w:pPr>).)*<\/w:pPr>/g)]
    .map((match) => match[0])
    .filter((props) => props.includes(`<w:pStyle w:val="${styleId}"/>`));
}

describe('Justify text: the model', () => {
  it('survives save and reload', () => {
    const reloaded = migrate(JSON.parse(JSON.stringify(serializeWorksheet(on(paper())))));
    expect(reloaded.justifyText).toBe(true);
    expect(reloaded.__unknown).toBeUndefined();
  });

  it('stores only true, and switching off leaves no field behind', () => {
    const worksheet = paper();
    expect(withJustifyText(worksheet, false)).toBe(worksheet);
    const justified = on(worksheet);
    expect(justified.justifyText).toBe(true);
    expect(on(justified)).toBe(justified);
    expect('justifyText' in withJustifyText(justified, false)).toBe(false);
  });
});

describe('Justify text: the IR', () => {
  it('justifies body paragraphs and leaves everything else as it was', () => {
    const worksheet = paper();
    const before = flowText(worksheet);
    const after = flowText(on(worksheet));
    expect(after).toHaveLength(before.length);
    after.forEach((node, index) => {
      const was = before[index];
      const body = ['Question Stem', 'Statement', 'MCQ Option', 'Sub-question', 'Sub-sub-question', 'Body'].includes(node.style);
      if (body && !was.format?.align) {
        expect(node.format?.align, node.style).toBe('justify');
        expect({ ...node, format: { ...node.format, align: undefined } }).toEqual({ ...was, format: { ...was.format, align: undefined } });
      } else {
        expect(node, node.style).toEqual(was);
      }
    });
    // The heading and the title are not body text.
    expect(after.find((node) => node.style === 'Section Heading')?.format?.align).toBeUndefined();
    expect(renderWorksheet(on(worksheet), BILINGUAL).title).toEqual(renderWorksheet(worksheet, BILINGUAL).title);
  });

  it("lets an element's own alignment win", () => {
    const nodes = flowText(on(paper()));
    expect(nodes.filter((node) => node.format?.align === 'center')).toHaveLength(1);
    // The centred question's options keep its `optionAlign`.
    expect(nodes.filter((node) => node.style === 'MCQ Option' && node.format?.align === 'right')).toHaveLength(4);
  });

  it('leaves tab-stop option rows and tables alone', () => {
    const rest = (worksheet: Worksheet) =>
      renderWorksheet(worksheet, BILINGUAL).items
        .flatMap((item) => (item.type === 'question' ? item.question.nodes : item.layout.nodes))
        .filter((node) => node.kind !== 'text' && node.kind !== 'source');
    const worksheet = paper();
    expect(rest(on(worksheet))).toEqual(rest(worksheet));
    expect(rest(worksheet).some((node) => node.kind === 'columns')).toBe(true);
    expect(rest(worksheet).some((node) => node.kind === 'table')).toBe(true);
  });

  it('leaves the cover and the masthead alone', () => {
    const worksheet = buildAcceptanceWorksheet();
    const a = renderWorksheet(worksheet, BILINGUAL);
    const b = renderWorksheet(on(worksheet), BILINGUAL);
    expect(b.cover).toEqual(a.cover);
    expect(b.bands).toEqual(a.bands);
    expect(b.instructions).toEqual(a.instructions);
  });
});

describe('Justify text: the .docx', () => {
  const BODY_STYLES = ['QuestionStem', 'Statement', 'MCQOption', 'Subquestion', 'Subsubquestion'];
  const KEPT_STYLES = ['WorksheetTitle', 'Instructions', 'SectionHeading', 'Marks', 'TableCaption', 'ImageCaption', 'Answer', 'MarkingScheme', 'BodyTextCustom', 'AnswerLine'];

  it('justifies the body styles in styles.xml, and only those', async () => {
    const { styles } = await parts(on(paper()));
    const { styles: plainStyles } = await parts(paper());
    for (const id of BODY_STYLES) {
      expect(styleXml(styles, id), id).toContain('<w:jc w:val="both"/>');
      // The w:jc is all that changes.
      expect(styleXml(styles, id).replace('<w:jc w:val="both"/>', '')).toBe(styleXml(plainStyles, id));
    }
    for (const id of KEPT_STYLES) expect(styleXml(styles, id), id).toBe(styleXml(plainStyles, id));
  });

  it('leaves the justification to the styles, stating only what differs', async () => {
    const { document } = await parts(on(paper()));
    const stems = paragraphProps(document, 'QuestionStem');
    // The centred stem states its centre; every other stem paragraph inherits.
    expect(stems.filter((props) => props.includes('<w:jc w:val="center"/>'))).toHaveLength(1);
    expect(stems.filter((props) => props.includes('<w:jc'))).toHaveLength(1);
    for (const props of paragraphProps(document, 'Subquestion')) expect(props).not.toContain('<w:jc');
    for (const props of paragraphProps(document, 'Statement')) expect(props).not.toContain('<w:jc');

    const options = paragraphProps(document, 'MCQOption');
    const rows = options.filter((props) => props.includes('<w:tabs>'));
    // The inline row says it is not justified; the centred question's options keep right.
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('<w:jc w:val="left"/>');
    expect(options.filter((props) => props.includes('<w:jc w:val="right"/>'))).toHaveLength(4);
    expect(options.filter((props) => !props.includes('<w:tabs>') && !props.includes('<w:jc'))).toHaveLength(4);

    // `Body` is shared with table cells and rows, so its prose states the justification.
    const body = paragraphProps(document, 'BodyTextCustom');
    expect(body.filter((props) => props.includes('<w:jc w:val="both"/>'))).toHaveLength(1);
    // The table's cells keep their own alignment.
    expect(body.filter((props) => props.includes('<w:jc w:val="left"/>')).length).toBeGreaterThan(0);
  });

  it('writes w:doNotExpandShiftReturn when on, and not when off', async () => {
    expect((await parts(on(paper()))).settings).toContain('<w:compat><w:doNotExpandShiftReturn/><w:compatSetting');
    expect((await parts(paper())).settings).not.toContain('doNotExpandShiftReturn');
  });

  it('exports an untouched or switched-off document byte for byte as before', async () => {
    const worksheet = buildAcceptanceWorksheet();
    const plain = await parts(worksheet);
    const off = await parts(withJustifyText(on(worksheet), false));
    expect(off.names).toEqual(plain.names);
    for (const name of plain.names.filter((entry) => entry.endsWith('.xml') && !entry.endsWith('core.xml'))) {
      expect(await off.read(name), name).toBe(await plain.read(name));
    }
    expect(plain.document + plain.styles).not.toContain('<w:jc w:val="both"/>');
  });

  it('leaves the header, the title and the cover parts alone', async () => {
    const worksheet = buildAcceptanceWorksheet();
    const plain = await parts(worksheet);
    const justified = await parts(on(worksheet));
    expect(justified.header).toBe(plain.header);
    const title = (xml: string) => paragraphProps(xml, 'WorksheetTitle');
    expect(title(justified.document)).toEqual(title(plain.document));
  });
});

describe('Justify text: the clipboard', () => {
  it('copies body paragraphs with text-align:justify, as the .docx prints them', () => {
    const worksheet = paper();
    const stacked = worksheet.questions[0];
    const html = questionClipboardHtml(on(worksheet), stacked.id, BILINGUAL);
    // The stem, two statements and four options.
    expect(html.match(/text-align:justify;/g)).toHaveLength(7);
    expect(questionClipboardHtml(worksheet, stacked.id, BILINGUAL)).not.toContain('text-align:justify');
    // An inline row stays a row.
    const inline = worksheet.questions[1];
    expect(questionClipboardHtml(on(worksheet), inline.id, BILINGUAL).match(/text-align:justify;/g)).toHaveLength(1);
  });
});
