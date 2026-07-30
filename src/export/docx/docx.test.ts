import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildDocxParts, docxFileName, exportDocxBuffer } from '.';
import { buildAcceptanceWorksheet } from '@/test/fixtures';
import {
  createBand,
  createFillInField,
  createTextField,
  createTotalMarksField,
} from '@/model/bands';
import {
  createAnswerLinesElement,
  createDividerElement,
  createHeadingElement,
  createLabelListElement,
  createPageBreakElement,
  createPartHeaderElement,
  createSpacerElement,
} from '@/model/flow';
import { applyResizeBlock } from '@/model/edits';
import { DEFAULT_CELL_PADDING, patchCell, setPadding } from '@/model/table';
import { BAND_ROW_TWIPS, MARGIN_PRESETS, bandsHeight, cmToTwips } from '@/model/page';
import { FIXED_LINE_TWIPS, exactLineFor } from './styles';
import { createWorksheet } from '@/model/factories';
import { applyRunFormat, bi, plain } from '@/model/text';
import { renderWorksheet } from '@/render/worksheet';
import type { TextNode } from '@/render/ir';
import type { LayoutElement, OutputMode, TableBlock, Worksheet } from '@/model/types';

const STUDENT_BI: OutputMode = { language: 'bilingual', version: 'student' };
const TEACHER_BI: OutputMode = { language: 'bilingual', version: 'teacher' };

async function unzip(mode: OutputMode) {
  const worksheet = buildAcceptanceWorksheet();
  const bytes = await exportDocxBuffer(worksheet, mode);
  const zip = await JSZip.loadAsync(bytes);
  const read = async (path: string) => {
    const file = zip.file(path);
    if (!file) throw new Error(`Missing part: ${path}`);
    return file.async('string');
  };
  return { zip, read, worksheet };
}

describe('docx package structure (§7.1, §11.1)', () => {
  it('contains every part Word requires, with matching content types', async () => {
    const { zip, read } = await unzip(STUDENT_BI);

    for (const path of [
      '[Content_Types].xml',
      '_rels/.rels',
      'word/document.xml',
      'word/styles.xml',
      'word/numbering.xml',
      'word/settings.xml',
      'word/fontTable.xml',
      'word/header1.xml',
      'word/footer1.xml',
      'word/_rels/document.xml.rels',
      'docProps/core.xml',
      'docProps/app.xml',
    ]) {
      expect(zip.file(path), path).toBeTruthy();
    }

    const contentTypes = await read('[Content_Types].xml');
    for (const part of ['/word/document.xml', '/word/numbering.xml', '/word/styles.xml', '/word/header1.xml']) {
      expect(contentTypes).toContain(`PartName="${part}"`);
    }
  });

  it('declares every relationship the document references', async () => {
    const { read } = await unzip(STUDENT_BI);
    const document = await read('word/document.xml');
    const rels = await read('word/_rels/document.xml.rels');

    const referenced = [...document.matchAll(/r:(?:id|embed)="(rId\d+)"/g)].map((m) => m[1]);
    expect(referenced.length).toBeGreaterThan(0);
    for (const relId of new Set(referenced)) {
      expect(rels, `relationship ${relId}`).toContain(`Id="${relId}"`);
    }
  });

  it('is well-formed XML in every part', async () => {
    const { zip } = await unzip(TEACHER_BI);
    const { XMLValidator } = await import('fast-xml-parser');
    for (const path of Object.keys(zip.files)) {
      if (!path.endsWith('.xml') && !path.endsWith('.rels')) continue;
      const xml = await zip.file(path)!.async('string');
      const result = XMLValidator.validate(xml);
      expect(result, `${path}: ${JSON.stringify(result)}`).toBe(true);
    }
  });
});

describe('native numbering (§7.2, §11.2)', () => {
  it('defines the three abstract multilevel definitions', async () => {
    const { read } = await unzip(STUDENT_BI);
    const numbering = await read('word/numbering.xml');

    expect(numbering).toContain('w:abstractNumId="0"');
    expect(numbering).toContain('w:abstractNumId="1"');
    expect(numbering).toContain('w:abstractNumId="2"');
    // Questions: decimal / lowerLetter / lowerRoman with parenthesised labels.
    expect(numbering).toContain('<w:numFmt w:val="decimal"/>');
    expect(numbering).toContain('<w:numFmt w:val="lowerLetter"/>');
    expect(numbering).toContain('<w:numFmt w:val="lowerRoman"/>');
    expect(numbering).toContain('<w:numFmt w:val="upperLetter"/>');
    expect(numbering).toContain('<w:lvlText w:val="(%2)"/>');
    expect(numbering).toContain('<w:lvlText w:val="(%3)"/>');
    // Every abstract definition must declare nine levels.
    const levelsPerAbstract = numbering
      .split('<w:abstractNum ')
      .slice(1)
      .map((chunk) => (chunk.match(/<w:lvl w:ilvl=/g) ?? []).length);
    expect(levelsPerAbstract).toEqual([9, 9, 9]);
  });

  it('gives every question its own option numbering instance so lettering restarts at A', async () => {
    const { read, worksheet } = await unzip(STUDENT_BI);
    const numbering = await read('word/numbering.xml');
    const document = await read('word/document.xml');

    // One w:num per MCQ referencing the option abstract definition (abstractNumId 1).
    const optionNums = [...numbering.matchAll(/<w:num w:numId="(\d+)"><w:abstractNumId w:val="1"\/>/g)];
    // Counted by what the questions *are* rather than by which section held them —
    // only option-bearing questions open an option stream.
    const mcqCount = worksheet.questions.filter((question) => 'options' in question).length;
    expect(optionNums.length).toBe(mcqCount);

    // Each of those numIds is actually used by option paragraphs in the body.
    for (const [, numId] of optionNums) {
      expect(document).toContain(`<w:numId w:val="${numId}"/>`);
    }

    // Statements likewise get their own per-question instance.
    const statementNums = [...numbering.matchAll(/<w:abstractNumId w:val="2"\/>/g)];
    expect(statementNums.length).toBe(1); // only question 2 has statements
  });

  it('forces each option/statement instance to restart, so options are never E-H', async () => {
    const { read } = await unzip(STUDENT_BI);
    const numbering = await read('word/numbering.xml');

    // Instances sharing an abstract definition otherwise continue one counter, which
    // renders question 2's options as E. F. G. H. instead of A. B. C. D.
    const instances = [...numbering.matchAll(/<w:num w:numId="\d+">([\s\S]*?)<\/w:num>/g)].map(
      (m) => m[1],
    );
    const optionInstances = instances.filter((body) => body.includes('w:val="1"/>'));
    expect(optionInstances.length).toBeGreaterThan(1);
    for (const body of instances) {
      const abstractId = /<w:abstractNumId w:val="(\d+)"\/>/.exec(body)?.[1];
      if (abstractId === '1' || abstractId === '2') {
        expect(body, `abstract ${abstractId} must restart`).toContain('<w:startOverride w:val="1"/>');
      }
    }
  });

  it('restarts question numbering natively when a section asks for it', async () => {
    const { read } = await unzip(STUDENT_BI);
    const numbering = await read('word/numbering.xml');
    const document = await read('word/document.xml');

    const questionNums = [...numbering.matchAll(/<w:num w:numId="(\d+)">((?:(?!<\/w:num>)[\s\S])*)<\/w:num>/g)]
      .filter(([, , body]) => /<w:abstractNumId w:val="0"\/>/.test(body));

    // The fixture's two sections both restart, so there are two question streams:
    // the first continuous, the second overriding back to 1.
    expect(questionNums.length).toBe(2);
    expect(questionNums[0][2]).not.toContain('w:startOverride');
    expect(questionNums[1][2]).toContain('<w:startOverride w:val="1"/>');
    for (const [, numId] of questionNums) {
      expect(document).toContain(`<w:numId w:val="${numId}"/>`);
    }
  });

  it('shares one question stream when a section continues numbering', async () => {
    const worksheet = buildAcceptanceWorksheet();
    const sectionB = worksheet.layout.filter((e) => e.kind === 'section')[1];
    if (sectionB.kind === 'section') sectionB.restartNumbering = false;
    const { numberingXml, documentXml } = buildDocxParts(worksheet, STUDENT_BI);

    const questionNums = [...numberingXml.matchAll(/<w:num w:numId="(\d+)">((?:(?!<\/w:num>)[\s\S])*)<\/w:num>/g)]
      .filter(([, , body]) => /<w:abstractNumId w:val="0"\/>/.test(body));

    expect(questionNums.length).toBe(1);
    expect(questionNums[0][2]).not.toContain('w:startOverride');
    // Structured parts still ride levels 1-2 of that same shared stream.
    expect(documentXml).toContain('<w:ilvl w:val="2"/>');
  });

  it('numbers questions, parts and sub-parts through one shared list, not literal text', async () => {
    const { read } = await unzip(STUDENT_BI);
    const document = await read('word/document.xml');

    // Parts/sub-parts ride levels 1 and 2 of the question definition.
    expect(document).toContain('<w:ilvl w:val="0"/>');
    expect(document).toContain('<w:ilvl w:val="1"/>');
    expect(document).toContain('<w:ilvl w:val="2"/>');

    // No question/part/option label is ever typed into the text.
    expect(document).not.toMatch(/<w:t[^>]*>\s*\d+\.\s*</);
    expect(document).not.toMatch(/<w:t[^>]*>\s*\(a\)/);
    expect(document).not.toMatch(/<w:t[^>]*>\s*A\.\s*</);
  });
});

describe('styles (§7.3, §11.3)', () => {
  it('defines all named styles and attaches every paragraph to one', async () => {
    const { read } = await unzip(TEACHER_BI);
    const styles = await read('word/styles.xml');
    const document = await read('word/document.xml');

    for (const name of [
      'Question Stem', 'MCQ Option', 'Statement', 'Sub-question', 'Sub-sub-question',
      'Marks', 'Table Caption', 'Image Caption', 'Section Heading', 'Answer', 'Marking Scheme',
    ]) {
      expect(styles, name).toContain(`<w:name w:val="${name}"/>`);
    }

    // Every w:p in the body carries a pStyle.
    const paragraphs = document.match(/<w:p>(?:(?!<\/w:p>)[\s\S])*<\/w:p>/g) ?? [];
    expect(paragraphs.length).toBeGreaterThan(10);
    for (const paragraph of paragraphs) {
      expect(paragraph, paragraph.slice(0, 120)).toContain('<w:pStyle');
    }
  });

  it('gives the answer-line style a between-border so Word draws every rule', async () => {
    // Word collapses consecutive paragraphs sharing one border set into a single
    // bordered block and draws the bottom rule only once — under the last of them.
    // w:between rules the interior boundaries, so without it an N-line answer block
    // prints as a single line. Regression guard for exactly that.
    const { read } = await unzip(TEACHER_BI);
    const styles = await read('word/styles.xml');

    const style = styles.match(
      /<w:style w:type="paragraph" w:styleId="AnswerLine">[\s\S]*?<\/w:style>/,
    )?.[0];
    expect(style).toBeDefined();
    expect(style).toContain('<w:between w:val="single" w:sz="6" w:space="1" w:color="A6A6A6"/>');
    expect(style).toContain('<w:bottom w:val="single" w:sz="6" w:space="1" w:color="A6A6A6"/>');
    // An empty paragraph is only as tall as its line height, which is not a writing
    // line — the style is what gives each rule room to write on.
    expect(style).toContain('w:line="480" w:lineRule="exact"');
  });
});

/**
 * The reference paper's vertical rhythm, mirrored (§7.3).
 *
 * `real_life_reference/DBS_Assessment1.docx` carries `w:line="240" w:lineRule="exact"`
 * on 275 of its 296 paragraphs over a style with `w:after="0"`: all of its rhythm comes
 * from one fixed 12pt line box and none from paragraph spacing. These guard that shape,
 * because every part of it fails silently — a dropped `w:line` looks like one paragraph
 * set slightly loose, which nobody reports as a bug but which shifts every page break
 * after it.
 */
describe('fixed line spacing (§7.3)', () => {
  it('gives every paragraph style a fixed 12pt line and no paragraph spacing', async () => {
    const { read } = await unzip(TEACHER_BI);
    const styles = await read('word/styles.xml');

    const paragraphStyles = [
      ...styles.matchAll(
        /<w:style w:type="paragraph"[^>]*w:styleId="([^"]+)"[\s\S]*?<\/w:style>/g,
      ),
    ];
    expect(paragraphStyles.length).toBeGreaterThan(10);

    for (const [xml, id] of paragraphStyles) {
      const spacing = xml.match(/<w:spacing[^/]*\/>/)?.[0];
      expect(spacing, `${id} states its own spacing`).toBeDefined();
      // Never inherited: direct formatting replaces the whole `w:spacing` element, so a
      // style that omitted `w:line` would depend on the inheritance chain to supply it.
      expect(spacing, `${id} sets an exact line`).toContain('w:lineRule="exact"');
      expect(spacing, `${id} has no space before`).toContain('w:before="0"');
      expect(spacing, `${id} has no space after`).toContain('w:after="0"');
    }
  });

  it('sets the body styles to 11pt text in a 12pt box, as the reference does', async () => {
    const { read } = await unzip(TEACHER_BI);
    const styles = await read('word/styles.xml');

    const body = styles.match(
      /<w:style w:type="paragraph" w:styleId="QuestionStem">[\s\S]*?<\/w:style>/,
    )?.[0];
    expect(body).toContain('w:line="240" w:lineRule="exact"');
    expect(body).toContain('<w:sz w:val="22"/>');
  });

  it('keeps a larger style in a box that can hold it', async () => {
    // An exact line box does not grow, so a 16pt title in a 12pt box would be clipped.
    const { read } = await unzip(TEACHER_BI);
    const styles = await read('word/styles.xml');

    const title = styles.match(
      /<w:style w:type="paragraph" w:styleId="WorksheetTitle">[\s\S]*?<\/w:style>/,
    )?.[0];
    expect(title).toContain(`w:line="${exactLineFor(16)}" w:lineRule="exact"`);
    expect(exactLineFor(16)).toBeGreaterThan(320); // 16pt needs more than a 16pt box.
    // Body-sized and smaller text shares the one rhythm.
    expect(exactLineFor(11)).toBe(240);
    expect(exactLineFor(10)).toBe(240);
    expect(exactLineFor(undefined)).toBe(240);
  });

  it('restates the line when a teacher overrides paragraph spacing', async () => {
    // Direct formatting replaces the style's `w:spacing` element rather than merging
    // into it, so an override that emitted only `w:after` would drop that one paragraph
    // off the fixed rhythm.
    const worksheet = buildAcceptanceWorksheet();
    const heading = { ...createHeadingElement(bi('Spaced', '間距')), format: { spaceAfter: 12 } };
    worksheet.layout = [...worksheet.layout, heading];
    worksheet.flow = [...worksheet.flow, { type: 'layout', id: heading.id }];

    const zip = await JSZip.loadAsync(await exportDocxBuffer(worksheet, STUDENT_BI));
    const document = await zip.file('word/document.xml')!.async('string');
    expect(document).toContain('w:after="240"');
    expect(document).toMatch(/<w:spacing[^/]*w:after="240"[^/]*w:lineRule="exact"\/>/);
  });

  it('leaves table cells on the shared rhythm', async () => {
    // A cell paragraph used to carry its own before/after with no line, which put every
    // table row off the grid the rest of the page sits on.
    const { read } = await unzip(STUDENT_BI);
    const document = await read('word/document.xml');
    const cell = document.match(/<w:tc>[\s\S]*?<\/w:tc>/)?.[0];
    expect(cell).toBeDefined();
    expect(cell).not.toContain('<w:spacing w:before="20" w:after="20"/>');
  });

  /**
   * The reference paper separates every sub-unit with a blank line: stem, blank,
   * the (1)(2)(3) statements, blank, the A–D options; and stem, blank, (a), blank, (b).
   * With no paragraph spacing anywhere, a spent line is the only way to open that air,
   * so these assert the *structure* of the emitted paragraphs.
   */
  it('separates a stem, its statements and its options with blank lines', () => {
    const worksheet = buildAcceptanceWorksheet();
    const rendered = renderWorksheet(worksheet, { language: 'en', version: 'student' });

    // Question 2 of the fixture is the MCQ that carries statements.
    const mcq = rendered.items.find(
      (item) =>
        item.type === 'question' &&
        item.question.nodes.some((node) => node.kind === 'text' && node.listRef?.definition === 'statement'),
    );
    expect(mcq?.type).toBe('question');
    const nodes = mcq!.type === 'question' ? mcq!.question.nodes : [];

    const firstStatement = nodes.findIndex(
      (n) => n.kind === 'text' && n.listRef?.definition === 'statement',
    );
    const lastStatement = nodes.map((n) => n.kind === 'text' && n.listRef?.definition === 'statement')
      .lastIndexOf(true);
    const firstOption = nodes.findIndex(
      (n) =>
        (n.kind === 'text' && n.listRef?.definition === 'option') ||
        (n.kind === 'columns' && n.style === 'MCQ Option'),
    );

    // A blank immediately before the statement block, and another before the options.
    expect(nodes[firstStatement - 1].kind).toBe('spacer');
    expect(nodes[lastStatement + 1].kind).toBe('spacer');
    expect(nodes[firstOption - 1].kind).toBe('spacer');
  });

  it('separates each part and sub-part of a structured question', () => {
    const worksheet = buildAcceptanceWorksheet();
    const rendered = renderWorksheet(worksheet, { language: 'en', version: 'student' });

    const structured = rendered.items.find(
      (item) =>
        item.type === 'question' &&
        item.question.nodes.some((node) => node.kind === 'text' && node.style === 'Sub-question'),
    );
    const nodes = structured!.type === 'question' ? structured!.question.nodes : [];

    // Every part and sub-part is immediately preceded by a blank line.
    for (const style of ['Sub-question', 'Sub-sub-question'] as const) {
      const indices = nodes.flatMap((n, i) => (n.kind === 'text' && n.style === style ? [i] : []));
      expect(indices.length).toBeGreaterThan(0);
      // Only the first node of each part carries the list marker; the gap belongs there.
      for (const i of indices) {
        if (!(nodes[i].kind === 'text' && (nodes[i] as TextNode).listRef)) continue;
        expect(nodes[i - 1]?.kind, `${style} at ${i} follows a blank`).toBe('spacer');
      }
    }
  });

  it('separates consecutive questions, and gaps the first item below a title', () => {
    const worksheet = buildAcceptanceWorksheet();
    const rendered = renderWorksheet(worksheet, { language: 'en', version: 'student' });

    /*
     * The acceptance worksheet has a title, which prints *above* the flow — so its first
     * item is not at the top of the page and needs its gap like any other item.
     *
     * This assertion used to demand the opposite, because the rule keyed on flow index 0
     * alone. That made the same element space differently depending only on position: a
     * section first in the flow printed tight under the header rule, while an identical
     * one further down had air above it, and the gap reappeared as soon as anything was
     * dragged in front of it.
     */
    const firstNodes = rendered.items[0].type === 'question'
      ? rendered.items[0].question.nodes
      : rendered.items[0].layout.nodes;
    expect(rendered.title).toBeDefined();
    expect(firstNodes[0].kind).toBe('spacer');

    // Every later question leads with one.
    const questions = rendered.items.filter((item) => item.type === 'question');
    for (const item of questions.slice(1)) {
      const nodes = item.type === 'question' ? item.question.nodes : [];
      expect(nodes[0].kind).toBe('spacer');
    }
  });

  it('adds no gap before the first item at the true top of the page', () => {
    // Nothing above the flow — no masthead, no title, no instructions — so a gap there
    // would only shift the top margin.
    const worksheet = buildAcceptanceWorksheet();
    const bare = {
      ...worksheet,
      bands: [],
      title: { en: [], zh: [] },
      instructions: { en: [], zh: [] },
    };
    const rendered = renderWorksheet(bare, { language: 'en', version: 'student' });

    const firstNodes = rendered.items[0].type === 'question'
      ? rendered.items[0].question.nodes
      : rendered.items[0].layout.nodes;
    expect(firstNodes[0].kind).not.toBe('spacer');
  });

  it('exports each blank line as an empty styled paragraph on the shared rhythm', async () => {
    const { read } = await unzip(STUDENT_BI);
    const document = await read('word/document.xml');

    // A blank line is a real `w:p` — it has to occupy a line to be a gap at all — and
    // carries the Body style plus the fixed 12pt box like every other paragraph.
    const blanks = document.match(
      /<w:p><w:pPr><w:pStyle w:val="BodyTextCustom"\/><w:spacing w:line="240" w:lineRule="exact"\/><\/w:pPr><\/w:p>/g,
    );
    expect(blanks?.length ?? 0).toBeGreaterThan(3);
  });

  it('measures a band row as the same fixed line the exporter writes', () => {
    // `model/` cannot import `export/`, so the row height is duplicated there. If the
    // exported line changes and the estimate does not, every header offset drifts.
    expect(BAND_ROW_TWIPS).toBe(FIXED_LINE_TWIPS);
    expect(bandsHeight([createBand()])).toBe(FIXED_LINE_TWIPS);
  });
});

describe('fonts and CJK (§7.4, §11.4)', () => {
  it('sets Latin and eastAsia faces separately on defaults, styles and runs', async () => {
    const { read } = await unzip(STUDENT_BI);
    const styles = await read('word/styles.xml');
    const document = await read('word/document.xml');

    const expected = 'w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="PMingLiU"';
    expect(styles).toContain('<w:docDefaults>');
    expect(styles).toContain(expected);
    expect(document).toContain(expected);
    expect(styles).toContain('w:eastAsia="zh-HK"');

    // A mixed Latin+CJK string stays in ONE run; Word applies the right font per
    // character via w:eastAsia, which is what §11.4 asks for.
    expect(document).toContain('GDP平減物價指數(GDP deflator)');
  });

  it('honours a per-worksheet font pair', async () => {
    const worksheet = buildAcceptanceWorksheet();
    worksheet.fonts = { latin: 'Arial', eastAsia: 'Microsoft JhengHei' };
    const parts = buildDocxParts(worksheet, STUDENT_BI);
    expect(parts.stylesXml).toContain('w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Microsoft JhengHei"');
    expect(parts.fontTableXml).toContain('w:name="Microsoft JhengHei"');
  });
});

describe('tables and images (§7.5, §11.5, §11.6)', () => {
  it('emits real tables with cantSplit rows and merged cells', async () => {
    const { read } = await unzip(STUDENT_BI);
    const document = await read('word/document.xml');

    expect(document).toContain('<w:tbl>');
    expect(document).toContain('<w:tblGrid>');
    expect(document).toContain('<w:cantSplit/>');
    expect(document).toContain('<w:gridSpan w:val="2"/>');
    expect(document).toContain('<w:tblBorders>');
  });

  /*
   * An HKDSE table is uniform: plain ruled cells, no shaded or bold header row.
   *
   * There was a `headerRowCount` driving `w:tblHeader`, an `EFEFEF` fill and bold runs,
   * defaulting to 1 — so every table exported with a grey bold top row that none of the
   * reference papers has. It also could not describe a distribution table, whose headings
   * run across the top *and* down the left with an empty corner, which is why emphasis is
   * per-cell formatting now rather than a row count.
   */
  it('rules every cell alike, with no header shading, bold or repeat', async () => {
    const { read } = await unzip(STUDENT_BI);
    const document = await read('word/document.xml');

    expect(document).not.toContain('<w:tblHeader/>');
    expect(document).not.toContain('EFEFEF');
  });

  /*
   * Cell padding and column widths (§tables).
   *
   * Word has table-level `w:tblCellMar` and cell-level `w:tcMar` and nothing between, so
   * a row's or a column's padding can only reach Word flattened onto the cells it covers.
   * These assert the flattening, and that a table nobody has touched is unchanged.
   */
  const withTable = async (edit: (block: TableBlock) => TableBlock) => {
    const worksheet = buildAcceptanceWorksheet();
    const question = worksheet.questions[1];
    question.blocks = question.blocks.map((block) =>
      block.kind === 'table' && !block.rows.some((row) => row.cells.some((c) => c.covered))
        ? edit(block)
        : block,
    );
    const bytes = await exportDocxBuffer(worksheet, STUDENT_BI);
    const zip = await JSZip.loadAsync(bytes);
    return zip.file('word/document.xml')!.async('string');
  };

  /** The `w:tcMar` of every cell in the fixture's 3×3 schedule table, in order. */
  const marginsOf = (document: string) => {
    const table = document.slice(document.indexOf('<w:tbl>'), document.indexOf('</w:tbl>'));
    return [...table.matchAll(/<w:tcMar>(.*?)<\/w:tcMar>/g)].map(([, body]) => ({
      top: Number(/w:top w:w="(\d+)"/.exec(body)?.[1]),
      left: Number(/w:left w:w="(\d+)"/.exec(body)?.[1]),
      bottom: Number(/w:bottom w:w="(\d+)"/.exec(body)?.[1]),
      right: Number(/w:right w:w="(\d+)"/.exec(body)?.[1]),
    }));
  };

  it('writes the built-in padding onto every cell, unchanged from the old default', async () => {
    // 60/108 are the numbers `w:tblCellMar` alone used to carry. An untouched table must
    // print exactly as it did before padding was settable — the rule TextFormat follows.
    const document = await withTable((block) => block);
    for (const margin of marginsOf(document)) {
      expect(margin).toEqual(DEFAULT_CELL_PADDING);
    }
  });

  it('flattens a row’s padding onto that row’s cells only', async () => {
    const document = await withTable((block) =>
      setPadding(block, 'row', { rowIndex: 1, cellIndex: 0 }, { top: 300, bottom: 300 }),
    );
    const margins = marginsOf(document);
    // Row 1 is cells 3–5 of a 3×3 grid.
    expect(margins.slice(3, 6).map((m) => m.top)).toEqual([300, 300, 300]);
    expect(margins.slice(0, 3).map((m) => m.top)).toEqual([60, 60, 60]);
    expect(margins.slice(6).map((m) => m.top)).toEqual([60, 60, 60]);
  });

  it('flattens a column’s padding down the column', async () => {
    const document = await withTable((block) =>
      setPadding(block, 'column', { rowIndex: 0, cellIndex: 0 }, { left: 400 }),
    );
    const margins = marginsOf(document);
    expect([margins[0].left, margins[3].left, margins[6].left]).toEqual([400, 400, 400]);
    expect([margins[1].left, margins[4].left, margins[7].left]).toEqual([108, 108, 108]);
  });

  it('sizes w:gridCol from the stored widths and sums them to the content width', async () => {
    // The reference cost-output table: one wide label column, the rest narrow. Equal
    // thirds cannot express it, and the preview would then paginate on geometry Word
    // will not reproduce.
    const document = await withTable((block) => ({ ...block, columnWidths: [0.5, 0.25, 0.25] }));
    const grid = /<w:tblGrid>(.*?)<\/w:tblGrid>/.exec(document)![1];
    const widths = [...grid.matchAll(/w:w="(\d+)"/g)].map(([, w]) => Number(w));

    expect(widths).toHaveLength(3);
    expect(widths[0]).toBeCloseTo(widths[1] * 2, -1);
    // Exactly the content width: rounding each column on its own leaves the grid short
    // or long, and Word settles that by visibly stretching the final column.
    expect(widths.reduce((sum, w) => sum + w, 0)).toBe(
      Number(/<w:tblW w:w="(\d+)"/.exec(document)![1]),
    );
  });

  it('gives a merged cell the summed width of the columns it spans', async () => {
    const document = await withTable((block) => ({ ...block, columnWidths: [0.5, 0.25, 0.25] }));
    const total = Number(/<w:tblW w:w="(\d+)"/.exec(document)![1]);
    const table = document.slice(document.indexOf('<w:tbl>'), document.indexOf('</w:tbl>'));
    const first = Number(/<w:tcW w:w="(\d+)"/.exec(table)![1]);
    expect(first).toBeCloseTo(total / 2, -1);
  });

  it('carries a cell’s own formatting into its runs', async () => {
    // A cell is a `w:p` in a `w:tc`, so it takes direct formatting like a stem does —
    // which is what lets the toolbar bold a heading cell in a paper that has no header row.
    const document = await withTable((block) =>
      patchCell(block, 0, 0, { format: { bold: true, fontSize: 14 } }),
    );
    const table = document.slice(document.indexOf('<w:tbl>'), document.indexOf('</w:tbl>'));
    const firstCell = table.slice(0, table.indexOf('</w:tc>'));
    expect(firstCell).toContain('<w:b/>');
    expect(firstCell).toContain('<w:sz w:val="28"/>');
  });

  it('keeps the cell’s own alignment over any align in its format', async () => {
    // `CellAlign` is what the panel and the page both set; a `TextFormat.align` arriving
    // from the shared toolbar must not quietly overrule the control that names the cell.
    const document = await withTable((block) =>
      patchCell(block, 0, 0, { align: 'center', format: { align: 'right' } }),
    );
    const table = document.slice(document.indexOf('<w:tbl>'), document.indexOf('</w:tbl>'));
    const firstCell = table.slice(0, table.indexOf('</w:tc>'));
    expect(firstCell).toContain('<w:jc w:val="center"/>');
    expect(firstCell).not.toContain('<w:jc w:val="right"/>');
  });

  it('embeds image bytes in word/media with alt text on the drawing', async () => {
    const { zip, read } = await unzip(STUDENT_BI);
    const document = await read('word/document.xml');
    const contentTypes = await read('[Content_Types].xml');

    const media = Object.values(zip.files)
      .filter((entry) => !entry.dir && entry.name.startsWith('word/media/'))
      .map((entry) => entry.name);
    expect(media).toEqual(['word/media/image1.png']);

    const bytes = await zip.file(media[0])!.async('uint8array');
    // Real PNG magic number — proves actual bytes, not a link (§11.6).
    expect([...bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);

    expect(document).toContain('<w:drawing>');
    expect(document).toContain('<wp:inline');
    expect(document).toContain('descr="Demand curve diagram"');
    expect(document).not.toContain('http://localhost');
    expect(contentTypes).toContain('Extension="png"');
  });
});

describe('page breaks (§7.6, §11.7)', () => {
  it('keeps question paragraphs together', async () => {
    const { read } = await unzip(STUDENT_BI);
    const styles = await read('word/styles.xml');
    const document = await read('word/document.xml');

    expect(styles).toContain('<w:keepLines/>');
    expect(document).toContain('<w:keepNext/>');
  });
});

describe('student vs teacher output (§11.8)', () => {
  it('student export contains no answers, explanations or marking scheme anywhere', async () => {
    const { read, zip } = await unzip(STUDENT_BI);
    const document = await read('word/document.xml');
    const core = await read('docProps/core.xml');

    expect(document).not.toContain('Answer:');
    expect(document).not.toContain('答案');
    expect(document).not.toContain('Teacher Version');
    expect(document).not.toContain('Demand shifts left.');
    expect(document).not.toContain('The price where Qd = Qs.');
    expect(document).not.toContain(`w:pStyle w:val="Answer"`);
    expect(document).not.toContain(`w:pStyle w:val="MarkingScheme"`);

    // Metadata must not leak either.
    expect(core).not.toContain('Teacher');
    for (const path of Object.keys(zip.files)) {
      if (!path.endsWith('.xml')) continue;
      const xml = await zip.file(path)!.async('string');
      expect(xml, path).not.toContain('Demand shifts left.');
    }
  });

  it('teacher export contains answers, marking scheme and a labelled header', async () => {
    const { read } = await unzip(TEACHER_BI);
    const document = await read('word/document.xml');
    const header = await read('word/header1.xml');

    expect(document).toContain('Answer: C');
    expect(document).toContain('答案：C');
    expect(document).toContain('Demand shifts left.');
    expect(document).toContain('The price where Qd = Qs.');
    expect(document).toContain('w:pStyle w:val="Answer"');
    expect(document).toContain('w:pStyle w:val="MarkingScheme"');
    expect(document).toContain('Teacher Version / 教師版');
    expect(header).toContain('Teacher Version / 教師版');
  });
});

describe('language modes (§11.9)', () => {
  it('EN-only contains no Chinese content and ZH-only no English content', async () => {
    const worksheet = buildAcceptanceWorksheet();

    const en = buildDocxParts(worksheet, { language: 'en', version: 'student' }).documentXml;
    const zh = buildDocxParts(worksheet, { language: 'zh', version: 'student' }).documentXml;

    const bodyText = (xml: string) =>
      [...xml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]).join(' ');

    // EN-only must contain none of the zh-side translations. It may still contain
    // CJK characters that the teacher typed into the English side on purpose —
    // "GDP平減物價指數(GDP deflator)" is exactly the §11.4 mixed-run case — so the
    // assertion targets the actual translation strings, not the CJK block.
    const enText = bodyText(en);
    for (const zhOnly of [
      '當需求下降時會發生甚麼？', '價格上升', '經濟科工作紙', '甲部：多項選擇題',
      '定義均衡價格。', '表一：市場表', '需求量',
    ]) {
      expect(enText, zhOnly).not.toContain(zhOnly);
    }
    expect(enText).toContain('What happens when demand falls?');
    expect(enText).toContain('GDP平減物價指數(GDP deflator)');

    const zhText = bodyText(zh);
    expect(zhText).toMatch(/[一-鿿]/);
    expect(zhText).not.toContain('What happens when demand falls?');
    expect(zhText).not.toContain('Price rises');
  });

  it('bilingual puts English first, stacked inside one paragraph so list numbers are not doubled', async () => {
    const { read } = await unzip(STUDENT_BI);
    const document = await read('word/document.xml');

    const enIndex = document.indexOf('What happens when demand falls?');
    const zhIndex = document.indexOf('當需求下降時會發生甚麼？');
    expect(enIndex).toBeGreaterThan(-1);
    expect(zhIndex).toBeGreaterThan(enIndex);

    // The stacked pair is separated by a soft break, inside a single w:p.
    const between = document.slice(enIndex, zhIndex);
    expect(between).toContain('<w:br/>');
    expect(between).not.toContain('</w:p>');
  });
});

describe('marks and file naming (§3.5, §7.1)', () => {
  it('renders per-part marks and a computed question total', async () => {
    const { read } = await unzip(STUDENT_BI);
    const document = await read('word/document.xml');

    expect(document).toContain('(3 marks)');
    expect(document).toContain('（3分）');
    // Part (b) has sub-parts 2+2+3 = 7; question total 3 + 7 + 5 = 15. The fixture's
    // first structured question opts in to the total via `showTotalMarks`.
    expect(document).toContain('(Total: 15 marks)');
    expect(document).toContain('（共15分）');
    expect(document).toContain('w:pStyle w:val="Marks"');
  });

  it('omits the question total unless it is opted in', async () => {
    // Parts normally carry their own marks, so the trailing sum is off by default —
    // the fixture's *second* structured question leaves the flag unset. Exactly one
    // "(Total:" line may appear, from the question that asked for it.
    const { read } = await unzip(STUDENT_BI);
    const document = await read('word/document.xml');
    expect((document.match(/\(Total: /g) ?? []).length).toBe(1);
  });

  it('names files per the PRD pattern', () => {
    const worksheet = buildAcceptanceWorksheet();
    expect(docxFileName(worksheet, TEACHER_BI)).toBe('S5 Economics Test (Teacher) (Bilingual).docx');
    expect(docxFileName(worksheet, { language: 'en', version: 'student' })).toBe(
      'S5 Economics Test (Student) (EN).docx',
    );
  });

  it('emits a native PAGE field in the footer', async () => {
    const { read } = await unzip(STUDENT_BI);
    const footer = await read('word/footer1.xml');
    expect(footer).toContain('PAGE');
    expect(footer).toContain('w:fldCharType="begin"');
    expect(footer).toContain('w:fldCharType="end"');
  });

  it('sets A4 portrait with 2.54cm margins', async () => {
    const { read } = await unzip(STUDENT_BI);
    const document = await read('word/document.xml');
    expect(document).toContain('<w:pgSz w:w="11906" w:h="16838"/>');
    expect(document).toContain('w:top="1440"');
  });

  /*
   * A header lives in the margin, not in the text column.
   *
   * `w:header` is where the header *starts* from the page edge; Word grows it downward
   * and only pushes body text down once it passes `w:top`. Both offsets used to be a
   * hardcoded 720 against a 1440 top margin, so a multi-row header overflowed and shoved
   * the questions down — adding a header silently cost content space. The reference paper
   * this project is modelled on uses 567, comfortably clearing its own header.
   */
  it('pulls w:header up so a tall header stays inside the top margin', async () => {
    const worksheet = buildAcceptanceWorksheet();
    worksheet.header = {
      enabled: true,
      rule: true,
      bands: Array.from({ length: 3 }, () =>
        createBand({ center: [createTextField(bi('SCHOOL NAME', ''))] }),
      ),
    };

    const zip = await JSZip.loadAsync(await exportDocxBuffer(worksheet, STUDENT_BI));
    const document = await zip.file('word/document.xml')!.async('string');

    const offset = Number(/w:header="(\d+)"/.exec(document)?.[1]);
    expect(offset).toBeLessThan(720);
    // The rows end at or before where the body text starts.
    expect(offset + bandsHeight(worksheet.header.bands, true)).toBeLessThanOrEqual(1440);
  });

  it('leaves a one-line footer at Word’s own default offset', async () => {
    const { read } = await unzip(STUDENT_BI);
    const document = await read('word/document.xml');
    // The fixture's footer is a single page-number row, which fits under 720 easily —
    // so nothing should be pulled toward the edge for no reason.
    expect(document).toContain('w:footer="720"');
  });
});

describe('masthead bands, part headers and label lists', () => {
  async function open(worksheet: Worksheet, mode: OutputMode = STUDENT_BI) {
    const zip = await JSZip.loadAsync(await exportDocxBuffer(worksheet, mode));
    return zip.file('word/document.xml')!.async('string');
  }

  it('prints band zones as one tabbed row, replacing the plain title', async () => {
    const worksheet = buildAcceptanceWorksheet();
    worksheet.bands = [
      createBand({
        left: [createTextField(bi('Form 5', '中五'))],
        center: [createTextField(bi('Economics Paper 1', '經濟卷一'))],
        right: [createFillInField(bi('Name:', '姓名：'), 10)],
      }),
    ];
    const document = await open(worksheet);

    expect(document).toContain('Form 5');
    expect(document).toContain('Economics Paper 1');
    // A fill-in prints its label plus a rule of the requested width. Two runs, because
    // the label is authored text and the rule is generated from `widthCh`.
    expect(document).toContain('Name:');
    expect(document).toContain('>__________<');
    // Centre and right zones sit at fixed half/full positions of the content width.
    expect(document).toContain('<w:tab w:val="center" w:pos="4513"/>');
    expect(document).toContain('<w:tab w:val="right" w:pos="9026"/>');
    // The bare title paragraph is gone: the title is a band field now.
    expect(document).not.toContain('w:pStyle w:val="WorksheetTitle"');
  });

  it('derives "Full marks" from the questions rather than storing it', async () => {
    const worksheet = buildAcceptanceWorksheet();
    worksheet.bands = [createBand({ left: [createTotalMarksField()] })];

    /*
     * The wording and the total are separate runs: a field's prefix and suffix are
     * authored rich text a teacher can format independently, so the derived number
     * between them cannot share a `w:t` with them. Asserted as the runs actually
     * emitted, which is also what proves the number is still derived — the total moves
     * while the wording around it does not.
     */
    const before = await open(worksheet);
    expect(before).toContain('Full marks: ');
    expect(before).toContain('>24<');
    expect(before).toContain(' marks');

    const mcq = worksheet.questions[0];
    if (mcq.type === 'mcq') mcq.marks = 6;
    expect(await open(worksheet)).toContain('>29<');
  });

  it('derives a part header total from its own section', async () => {
    const worksheet = buildAcceptanceWorksheet();
    const header = createPartHeaderElement(bi('Part A: Multiple-choice questions', '甲部'));
    // Directly under Section A's heading, so its derived total is Section A's.
    const sectionA = worksheet.layout.find((e) => e.kind === 'section')!;
    worksheet.layout = [...worksheet.layout, header];
    const at = worksheet.flow.findIndex((entry) => entry.id === sectionA.id);
    worksheet.flow.splice(at + 1, 0, { type: 'layout', id: header.id });

    const document = await open(worksheet);
    // The authored text and the derived suffix are separate runs (rich text is emitted
    // run per run), so they are asserted separately rather than as one string.
    expect(document).toContain('Part A: Multiple-choice questions');
    // Section A is five 1-mark MCQs; section B's 19 must not leak in.
    expect(document).toContain('>(5 marks)<');
    expect(document).toContain('>（5分）<');
    expect(document).not.toContain('(19 marks)');
  });

  it('omits the marks suffix when a part header opts out', async () => {
    const worksheet = buildAcceptanceWorksheet();
    const header = createPartHeaderElement(bi('Part A', '甲部'));
    if (header.kind === 'partHeader') header.showMarks = false;
    worksheet.layout = [...worksheet.layout, header];
    worksheet.flow = [...worksheet.flow, { type: 'layout', id: header.id }];

    const document = await open(worksheet);
    expect(document).toContain('Part A');
    expect(document).not.toContain('Part A (');
  });

  it('exports a label list as borderless tabbed rows, not a table', async () => {
    const worksheet = buildAcceptanceWorksheet();
    const list = createLabelListElement(0);
    if (list.kind === 'labelList') {
      list.rows = [
        { id: 'r1', label: bi('First preference:', '第一選擇：'), value: bi('Watching a movie', '看電影') },
        { id: 'r2', label: bi('Second preference:', '第二選擇：'), value: bi('Joining a yoga class', '瑜伽課') },
      ];
    }
    worksheet.layout = [...worksheet.layout, list];
    worksheet.flow = [...worksheet.flow, { type: 'layout', id: list.id }];

    const document = await open(worksheet);
    expect(document).toContain('First preference:');
    expect(document).toContain('Watching a movie');
    // Two rows, each a paragraph with one tab stop for the value column.
    const rows = document.match(/<w:tabs><w:tab w:val="left" w:pos="\d+"\/><\/w:tabs>/g) ?? [];
    expect(rows.length).toBe(2);
    // Crucially not a table: a bordered grid is what this element exists to avoid.
    const tableCount = (document.match(/<w:tbl>/g) ?? []).length;
    expect(tableCount).toBe((await open(buildAcceptanceWorksheet())).match(/<w:tbl>/g)!.length);
  });

  it('keeps the plain title when a worksheet has no bands', async () => {
    const document = await open(buildAcceptanceWorksheet());
    expect(document).toContain('w:pStyle w:val="WorksheetTitle"');
  });
});

describe('MCQ option layout (inline / columns)', () => {
  async function open(worksheet: Worksheet, mode: OutputMode = STUDENT_BI) {
    const zip = await JSZip.loadAsync(await exportDocxBuffer(worksheet, mode));
    return zip.file('word/document.xml')!.async('string');
  }

  /** Set the first MCQ's layout, leaving everything else alone. */
  function withLayout(layout: 'stacked' | 'inline' | 'columns2') {
    const worksheet = buildAcceptanceWorksheet();
    const mcq = worksheet.questions[0];
    if (mcq.type === 'mcq') mcq.optionLayout = layout;
    return worksheet;
  }

  it('stacks by default, keeping option letters as native Word numbering', async () => {
    const document = await open(buildAcceptanceWorksheet());
    // The §7.2 invariant: no option letter is ever typed into the text.
    expect(document).not.toMatch(/<w:t[^>]*>\s*A\.\s*</);
    expect(document).toContain('<w:ilvl w:val="0"/>');
  });

  it('puts all four options on one line with tab stops when inline', async () => {
    const document = await open(withLayout('inline'));
    // Four options across the row: three tab stops and three tab runs after the first.
    expect(document).toContain('<w:tab w:val="left"');
    expect(document).toContain('<w:r><w:tab/></w:r>');
    // Markers become literal here, because one paragraph cannot carry four list numbers.
    expect(document).toMatch(/<w:t xml:space="preserve">A\. <\/w:t>/);
    expect(document).toMatch(/<w:t xml:space="preserve">D\. <\/w:t>/);
  });

  it('emits two rows of two for the 2-column layout', async () => {
    const document = await open(withLayout('columns2'));
    // A and C start their rows, so only B and D follow a tab.
    const rows = document.match(/<w:tabs><w:tab w:val="left"[^>]*\/><\/w:tabs>/g) ?? [];
    expect(rows.length).toBe(2);
    expect(document).toMatch(/<w:t xml:space="preserve">C\. <\/w:t>/);
  });

  it('derives tab stops from the live content width, not a fixed A4 assumption', async () => {
    const narrow = withLayout('inline');
    narrow.pageSetup = {
      paper: 'A4',
      orientation: 'portrait',
      margins: { top: 1440, right: 2880, bottom: 1440, left: 2880 },
    };
    const wide = withLayout('inline');
    wide.pageSetup = {
      paper: 'A3',
      orientation: 'landscape',
      margins: { top: 720, right: 720, bottom: 720, left: 720 },
    };

    const stops = (xml: string) =>
      [...xml.matchAll(/<w:tab w:val="left" w:pos="(\d+)"\/>/g)].map((m) => Number(m[1]));

    const narrowStops = stops(await open(narrow));
    const wideStops = stops(await open(wide));
    expect(narrowStops.length).toBeGreaterThan(0);
    // A wider text column pushes every stop further right.
    expect(Math.max(...wideStops)).toBeGreaterThan(Math.max(...narrowStops));
  });

  it('still marks the correct answer in the teacher version when inline', async () => {
    const document = await open(withLayout('inline'), TEACHER_BI);
    expect(document).toMatch(/Answer: [A-D]/);
  });

  it('separates a marker from its text with an ordinary space, not a hard one', async () => {
    // A non-breaking space here stops Word wrapping between the letter and the option,
    // and is invisible in every diff and screenshot — so it gets asserted instead.
    const document = await open(withLayout('inline'));
    expect(document).not.toContain('\u00a0');
  });
});

describe('layout elements in the section flow', () => {
  async function open(worksheet: Worksheet) {
    const zip = await JSZip.loadAsync(await exportDocxBuffer(worksheet, STUDENT_BI));
    return zip.file('word/document.xml')!.async('string');
  }

  /** Put one element after the first question. */
  function withElement(element: LayoutElement) {
    const worksheet = buildAcceptanceWorksheet();
    worksheet.layout = [...worksheet.layout, element];
    const at = worksheet.flow.findIndex((entry) => entry.id === worksheet.questions[0].id);
    worksheet.flow.splice(at + 1, 0, { type: 'layout', id: element.id });
    return worksheet;
  }

  it('exports a divider as a bottom-bordered paragraph', async () => {
    const document = await open(withElement(createDividerElement()));
    expect(document).toContain('<w:bottom w:val="single" w:sz="6" w:space="1" w:color="808080"/>');
  });

  it('exports a spacer as an exact-height empty paragraph', async () => {
    const document = await open(withElement(createSpacerElement(60)));
    // 60pt is 1200 twentieths of a point.
    expect(document).toContain('<w:spacing w:line="1200" w:lineRule="exact"/>');
  });

  it('exports answer lines as one styled paragraph per line', async () => {
    const document = await open(withElement(createAnswerLinesElement(5)));
    expect((document.match(/<w:pStyle w:val="AnswerLine"\/>/g) ?? []).length).toBe(5);
  });

  it('leaves answer-line paragraphs free of direct formatting', async () => {
    // Word flags a directly formatted paragraph with a marker in the left margin, so
    // the rule and the writing height belong to the style, not to each paragraph.
    const document = await open(withElement(createAnswerLinesElement(4)));
    expect(document).toContain('<w:p><w:pPr><w:pStyle w:val="AnswerLine"/></w:pPr></w:p>');
    // The border and the writing height appear nowhere in the body — they are the
    // style's job. Asserted per answer-line paragraph rather than over the whole
    // document, because a deliberate spacer elsewhere legitimately sets an exact line.
    const answerLines =
      document.match(/<w:p><w:pPr><w:pStyle w:val="AnswerLine"\/>[\s\S]*?<\/w:p>/g) ?? [];
    expect(answerLines.length).toBe(4);
    for (const paragraph of answerLines) {
      expect(paragraph).not.toContain('w:lineRule="exact"');
      expect(paragraph).not.toContain('A6A6A6');
    }
  });

  it('exports a page break as a real Word page break', async () => {
    const document = await open(withElement(createPageBreakElement()));
    expect(document).toContain('<w:br w:type="page"/>');
  });

  it('exports a free heading with its own text and honours its formatting', async () => {
    const heading = createHeadingElement(bi('Part 1: Short Questions', '第一部分：短問題'));
    if (heading.kind === 'heading') heading.format = { fontSize: 16, align: 'center' };
    const document = await open(withElement(heading));
    expect(document).toContain('Part 1: Short Questions');
    expect(document).toContain('第一部分：短問題');
    expect(document).toContain('<w:sz w:val="32"/>');
    expect(document).toContain('<w:jc w:val="center"/>');
  });

  it('places the element between the questions it was dropped between', async () => {
    const worksheet = withElement(createDividerElement());
    const document = await open(worksheet);
    const first = document.indexOf('What happens when demand falls?');
    const rule = document.indexOf('w:color="808080"');
    const second = document.indexOf('Study the table below');
    expect(first).toBeGreaterThan(-1);
    expect(rule).toBeGreaterThan(first);
    expect(second).toBeGreaterThan(rule);
  });

  it('leaves question numbering untouched — layout elements take no number', async () => {
    const document = await open(withElement(createDividerElement()));
    // Five MCQs still produce exactly five numbered stems in section A's stream.
    const stems = (document.match(/w:pStyle w:val="QuestionStem"/g) ?? []).length;
    const baseline = (await open(buildAcceptanceWorksheet())).match(/w:pStyle w:val="QuestionStem"/g);
    expect(stems).toBe(baseline!.length);
  });
});

describe('per-element formatting overrides', () => {
  async function documentXml(worksheet: Worksheet) {
    const zip = await JSZip.loadAsync(await exportDocxBuffer(worksheet, STUDENT_BI));
    return zip.file('word/document.xml')!.async('string');
  }

  it('writes size, weight, colour, alignment and spacing as direct formatting', async () => {
    const worksheet = buildAcceptanceWorksheet();
    worksheet.titleFormat = {
      fontSize: 22,
      bold: true,
      italic: true,
      underline: true,
      align: 'left',
      color: 'C00000',
      spaceBefore: 6,
      spaceAfter: 12,
    };
    const document = await documentXml(worksheet);

    // Word stores half-points, so 22pt is 44.
    expect(document).toContain('<w:sz w:val="44"/>');
    expect(document).toContain('<w:szCs w:val="44"/>');
    expect(document).toContain('<w:color w:val="C00000"/>');
    expect(document).toContain('<w:jc w:val="left"/>');
    // Spacing is in twentieths of a point: 6pt -> 120, 12pt -> 240.
    expect(document).toContain('w:before="120"');
    expect(document).toContain('w:after="240"');
    // The named style still supplies everything else.
    expect(document).toContain('w:pStyle w:val="WorksheetTitle"');
  });

  it('maps justify onto OOXML "both"', async () => {
    const worksheet = buildAcceptanceWorksheet();
    worksheet.instructionsFormat = { align: 'justify' };
    expect(await documentXml(worksheet)).toContain('<w:jc w:val="both"/>');
  });

  /**
   * Per-run formatting — different sizes and colours inside ONE paragraph.
   *
   * The point of the feature: a teacher selects three words in a stem and enlarges just
   * those. That has to survive as several `w:r` in one `w:p`, each with its own
   * `w:rPr`, or the export silently flattens the emphasis the page showed.
   */
  it('exports differently formatted runs inside a single paragraph', async () => {
    const worksheet = buildAcceptanceWorksheet();
    // "Answer ALL questions." with only "ALL" enlarged and reddened.
    const source = worksheet.instructions!.en;
    const start = plain(source).indexOf('ALL');
    worksheet.instructions = {
      ...worksheet.instructions!,
      en: applyRunFormat(source, start, start + 3, { fontSize: 18, color: 'C00000' }),
    };

    const document = await documentXml(worksheet);
    const paragraph = document.match(
      /<w:p><w:pPr><w:pStyle w:val="Instructions"\/>[\s\S]*?<\/w:p>/,
    )?.[0];
    expect(paragraph).toBeDefined();

    // Three runs on the English side: before, the emphasised word, after.
    expect(paragraph).toContain('<w:t xml:space="preserve">Answer </w:t>');
    expect(paragraph).toContain('<w:t xml:space="preserve">ALL</w:t>');
    expect(paragraph).toContain('<w:t xml:space="preserve"> questions.</w:t>');

    // Only the middle run carries the overrides. 18pt is 36 half-points.
    const emphasised = paragraph!.match(
      /<w:r>(?:(?!<\/w:r>)[\s\S])*<w:t xml:space="preserve">ALL<\/w:t><\/w:r>/,
    )?.[0];
    expect(emphasised).toContain('<w:sz w:val="36"/>');
    expect(emphasised).toContain('<w:color w:val="C00000"/>');

    const plainRun = paragraph!.match(
      /<w:r>(?:(?!<\/w:r>)[\s\S])*<w:t xml:space="preserve">Answer <\/w:t><\/w:r>/,
    )?.[0];
    expect(plainRun).not.toContain('<w:sz');
    expect(plainRun).not.toContain('<w:color');
  });

  it('lets a run override the element font pair', async () => {
    const worksheet = buildAcceptanceWorksheet();
    const source = worksheet.instructions!.en;
    worksheet.instructions = {
      ...worksheet.instructions!,
      en: applyRunFormat(source, 0, 6, {
        fonts: { latin: 'Arial', eastAsia: 'Microsoft JhengHei' },
      }),
    };

    const document = await documentXml(worksheet);
    expect(document).toContain('w:ascii="Arial"');
    expect(document).toContain('w:eastAsia="Microsoft JhengHei"');
    // The rest of the document still uses the worksheet pair.
    expect(document).toContain('w:ascii="Times New Roman"');
  });

  it('keeps a run bold when its element is bold, and adds its own size', async () => {
    // Flags OR with the element; values replace it. A run inside a bold heading stays
    // bold while carrying its own size.
    const worksheet = buildAcceptanceWorksheet();
    worksheet.titleFormat = { bold: true };
    const source = worksheet.title.en;
    worksheet.title = {
      ...worksheet.title,
      en: applyRunFormat(source, 0, 2, { fontSize: 20 }),
    };

    const document = await documentXml(worksheet);
    const sized = document.match(
      /<w:r>(?:(?!<\/w:r>)[\s\S])*<w:sz w:val="40"\/>(?:(?!<\/w:r>)[\s\S])*<\/w:r>/,
    )?.[0];
    expect(sized).toBeDefined();
    expect(sized).toContain('<w:b/>');
  });

  it('applies a per-element font override without changing the rest', async () => {
    const worksheet = buildAcceptanceWorksheet();
    const heading = worksheet.layout.find((e) => e.kind === 'section')!;
    if (heading.kind === 'section') {
      heading.format = { fonts: { latin: 'Arial', eastAsia: 'Microsoft JhengHei' } };
    }
    const document = await documentXml(worksheet);
    expect(document).toContain('w:ascii="Arial"');
    expect(document).toContain('w:eastAsia="Microsoft JhengHei"');
    // The worksheet default is still used elsewhere.
    expect(document).toContain('w:ascii="Times New Roman"');
  });

  it('emits no direct formatting at all when nothing is overridden', async () => {
    const document = await documentXml(buildAcceptanceWorksheet());
    // Run-level overrides are absent entirely; named styles supply size and colour.
    expect(document).not.toContain('<w:sz ');
    expect(document).not.toContain('<w:color ');
    // `w:jc` and `w:spacing` also serve table cells and centred images, so the
    // meaningful check is that the overridable paragraphs carry nothing but their
    // named style — exactly the output this file produced before formatting existed.
    expect(document).toContain('<w:pPr><w:pStyle w:val="WorksheetTitle"/></w:pPr>');
    expect(document).toContain('<w:pPr><w:pStyle w:val="Instructions"/></w:pPr>');
    expect(document).toContain('<w:pPr><w:pStyle w:val="SectionHeading"/><w:keepNext/></w:pPr>');
  });
});

describe('page setup and authored header/footer', () => {
  /** Unzip an arbitrary worksheet, not just the acceptance fixture. */
  async function open(worksheet: Worksheet, mode: OutputMode = STUDENT_BI) {
    const zip = await JSZip.loadAsync(await exportDocxBuffer(worksheet, mode));
    const read = async (path: string) => {
      const file = zip.file(path);
      if (!file) throw new Error(`Missing part: ${path}`);
      return file.async('string');
    };
    return { zip, read };
  }

  it('writes the chosen paper size, orientation and margins into sectPr', async () => {
    const worksheet = buildAcceptanceWorksheet();
    worksheet.pageSetup = {
      paper: 'Letter',
      orientation: 'landscape',
      margins: { top: 720, right: 500, bottom: 800, left: 1000 },
    };
    const { read } = await open(worksheet);
    const document = await read('word/document.xml');

    // Letter is 12240 x 15840; landscape swaps them.
    expect(document).toContain('w:w="15840"');
    expect(document).toContain('w:h="12240"');
    expect(document).toContain('w:orient="landscape"');
    expect(document).toContain('w:top="720"');
    expect(document).toContain('w:left="1000"');
  });

  it('renders authored left/centre/right zones separated by tabs', async () => {
    const worksheet = buildAcceptanceWorksheet();
    worksheet.header = {
      enabled: true,
      rule: true,
      showOnFirstPage: true,
      bands: [
        {
          id: 'b1',
          zones: {
            left: [{ kind: 'text', id: 'l', text: bi('Form 5', '中五') }],
            center: [{ kind: 'text', id: 'c', text: bi('Economics', '經濟') }],
            right: [{ kind: 'text', id: 'r', text: bi('Name: ______', '姓名：______') }],
          },
        },
      ],
    };
    const { read } = await open(worksheet);
    const header = await read('word/header1.xml');

    expect(header).toContain('Form 5');
    expect(header).toContain('Economics');
    expect(header).toContain('Name: ______');
    // Two tabs separate three occupied slots.
    expect(header.match(/<w:tab\/>/g)?.length).toBe(2);
    // Centre and right stops derive from the content width (11906 - 1440 - 1440 = 9026).
    expect(header).toContain('w:val="center" w:pos="4513"');
    expect(header).toContain('w:val="right" w:pos="9026"');
    expect(header).toContain('<w:bottom w:val="single"');
  });

  it('supports "Page X of Y" as live PAGE and NUMPAGES fields', async () => {
    const worksheet = buildAcceptanceWorksheet();
    worksheet.footer = {
      enabled: true,
      showOnFirstPage: true,
      // One field with the long-form pattern, rather than four parts a teacher had to
      // assemble by hand. It still emits both live fields.
      bands: [
        {
          id: 'b1',
          zones: { left: [], center: [{ kind: 'pageNumber', id: 'p', pattern: 'longForm' }], right: [] },
        },
      ],
    };
    const { read } = await open(worksheet);
    const footer = await read('word/footer1.xml');

    expect(footer).toContain('PAGE');
    expect(footer).toContain('NUMPAGES');
    expect(footer.match(/w:fldCharType="begin"/g)?.length).toBe(2);
  });

  it('omits the footer part entirely when the footer is disabled', async () => {
    const worksheet = buildAcceptanceWorksheet();
    worksheet.header = { enabled: false, bands: [] };
    worksheet.footer = { enabled: false, bands: [] };
    const { zip, read } = await open(worksheet);

    expect(zip.file('word/footer1.xml')).toBeNull();
    expect(zip.file('word/header1.xml')).toBeNull();

    const document = await read('word/document.xml');
    expect(document).not.toContain('footerReference');
    expect(document).not.toContain('headerReference');

    // The invariant that matters: no dangling references, and no content type for
    // a part that is not in the package.
    const contentTypes = await read('[Content_Types].xml');
    expect(contentTypes).not.toContain('/word/footer1.xml');
  });

  it('suppresses a footer on page 1 via titlePg while keeping the header there', async () => {
    const worksheet = buildAcceptanceWorksheet();
    worksheet.header = {
      enabled: true,
      showOnFirstPage: true,
      bands: [
        { id: 'h1', zones: { left: [], center: [{ kind: 'text', id: 'c', text: bi('Quiz', '測驗') }], right: [] } },
      ],
    };
    worksheet.footer = {
      enabled: true,
      showOnFirstPage: false,
      bands: [
        { id: 'f1', zones: { left: [], center: [{ kind: 'pageNumber', id: 'p' }], right: [] } },
      ],
    };
    const { zip, read } = await open(worksheet);
    const document = await read('word/document.xml');

    expect(document).toContain('<w:titlePg/>');
    expect(document).toContain('w:type="first"');

    // Page 1's footer is blank, but its header must still carry the real content —
    // titlePg switches BOTH parts to the "first" reference at once.
    expect(await read('word/footer2.xml')).not.toContain('PAGE');
    expect(await read('word/header2.xml')).toContain('Quiz');

    const rels = await read('word/_rels/document.xml.rels');
    const referenced = [...document.matchAll(/r:(?:id|embed)="(rId\d+)"/g)].map((m) => m[1]);
    for (const relId of new Set(referenced)) {
      expect(rels, `relationship ${relId}`).toContain(`Id="${relId}"`);
    }
    for (const path of ['word/header2.xml', 'word/footer2.xml']) {
      expect(zip.file(path), path).toBeTruthy();
    }
  });

  it('keeps the teacher marker in the header even with no authored header text', async () => {
    const worksheet = buildAcceptanceWorksheet();
    worksheet.header = { enabled: false, bands: [] };
    const { read } = await open(worksheet, TEACHER_BI);
    expect(await read('word/header1.xml')).toContain('Teacher Version / 教師版');
  });
});

/**
 * A picture resized on the page prints at the size the teacher dragged to.
 *
 * The drag writes `widthPx`/`heightPx` on the block, which is the same pair the
 * sidebar's number field writes — so this pins down that the resize surface added to
 * the preview cannot produce a document that prints at some other size.
 */
describe('resized pictures export at their new size', () => {
  async function documentXml(worksheet: Worksheet) {
    const zip = await JSZip.loadAsync(await exportDocxBuffer(worksheet, STUDENT_BI));
    return zip.file('word/document.xml')!.async('string');
  }

  const EMU_PER_PX = 9525; // 96 dpi, matching body.ts

  it('writes the dragged width and height into wp:extent', async () => {
    const worksheet = buildAcceptanceWorksheet();
    const image = worksheet.questions[1].blocks.find((b) => b.kind === 'image');
    if (image?.kind !== 'image') throw new Error('fixture has no image block');

    const before = await documentXml(worksheet);
    expect(before).toContain(
      `<wp:extent cx="${image.widthPx * EMU_PER_PX}" cy="${image.heightPx * EMU_PER_PX}"/>`,
    );

    const resized = applyResizeBlock(worksheet, image.id, 320);
    const after = await documentXml(resized);
    // 200x150 scaled to 320 wide is 240 tall.
    expect(after).toContain(`<wp:extent cx="${320 * EMU_PER_PX}" cy="${240 * EMU_PER_PX}"/>`);
    expect(after).not.toContain(`cx="${image.widthPx * EMU_PER_PX}"`);
  });

  it('leaves the package structurally sound, with every relationship resolved', async () => {
    const worksheet = buildAcceptanceWorksheet();
    const image = worksheet.questions[1].blocks.find((b) => b.kind === 'image');
    if (image?.kind !== 'image') throw new Error('fixture has no image block');

    const zip = await JSZip.loadAsync(
      await exportDocxBuffer(applyResizeBlock(worksheet, image.id, 41), STUDENT_BI),
    );
    const document = await zip.file('word/document.xml')!.async('string');
    const rels = await zip.file('word/_rels/document.xml.rels')!.async('string');

    // A resize must not orphan the image part — Word reports a dangling r:embed as a
    // repair error, which is the failure mode this whole check exists to catch.
    for (const match of document.matchAll(/r:(?:id|embed)="(rId\d+)"/g)) {
      expect(rels, `relationship ${match[1]}`).toContain(`Id="${match[1]}"`);
    }
    // Even at the floor, no zero-dimension drawing.
    expect(document).not.toMatch(/<wp:extent cx="0"|cy="0"\/>/);
  });
});

/**
 * Custom and preset margins reach `w:pgMar` untouched.
 *
 * Margins are the one page-setup value with two entry points — a preset and the custom
 * fields — so the contract worth pinning is that both are written to the document
 * verbatim, in twips, with no unit conversion in between.
 */
describe('margin presets and custom margins export verbatim', () => {
  it('writes the worksheet preset into w:pgMar', async () => {
    const preset = MARGIN_PRESETS.find((entry) => entry.label.startsWith('Worksheet'))!;
    const worksheet = buildAcceptanceWorksheet();
    worksheet.pageSetup = {
      paper: 'A4',
      orientation: 'portrait',
      margins: { ...preset.margins },
    };

    const zip = await JSZip.loadAsync(await exportDocxBuffer(worksheet, STUDENT_BI));
    const document = await zip.file('word/document.xml')!.async('string');
    expect(document).toContain(
      `<w:pgMar w:top="1440" w:right="850" w:bottom="1440" w:left="850"`,
    );
  });

  it('applies a band field’s own formatting in the exported header', async () => {
    const worksheet = buildAcceptanceWorksheet();
    const field = createTextField(bi('Big bold header', '大字'));
    field.format = { fontSize: 18, bold: true, color: 'C00000' };
    worksheet.header = { enabled: true, bands: [createBand({ center: [field] })] };

    const zip = await JSZip.loadAsync(await exportDocxBuffer(worksheet, STUDENT_BI));
    const header = await zip.file('word/header1.xml')!.async('string');

    // Word stores half-points, so 18pt is w:sz 36.
    expect(header).toContain('<w:sz w:val="36"/>');
    expect(header).toContain('<w:b/>');
    expect(header).toContain('<w:color w:val="C00000"/>');
    expect(header).toContain('Big bold header');
  });

  it('formats a field in the footer and the masthead the same way', async () => {
    const worksheet = buildAcceptanceWorksheet();
    const footField = createTextField(bi('Small print', '小字'));
    footField.format = { fontSize: 8, italic: true };
    worksheet.footer = { enabled: true, bands: [createBand({ left: [footField] })] };

    const zip = await JSZip.loadAsync(await exportDocxBuffer(worksheet, STUDENT_BI));
    const footer = await zip.file('word/footer1.xml')!.async('string');
    expect(footer).toContain('<w:sz w:val="16"/>');
    expect(footer).toContain('<w:i/>');
  });

  it('gives page 1 its own header part when firstPage rows are set', async () => {
    const worksheet = buildAcceptanceWorksheet();
    worksheet.header = {
      enabled: true,
      rule: true,
      bands: [createBand({ left: [createTextField(bi('Running header', '頁眉'))] })],
      firstPage: {
        bands: [createBand({ center: [createTextField(bi('Cover page only', '封面'))] })],
      },
    };

    const zip = await JSZip.loadAsync(await exportDocxBuffer(worksheet, STUDENT_BI));
    const document = await zip.file('word/document.xml')!.async('string');

    // w:titlePg plus a first-type reference is how Word models "page 1 differs".
    expect(document).toContain('<w:titlePg/>');
    expect(document).toContain('<w:headerReference w:type="first"');
    expect(document).toContain('<w:headerReference w:type="default"');

    const running = await zip.file('word/header1.xml')!.async('string');
    const first = await zip.file('word/header2.xml')!.async('string');
    expect(running).toContain('Running header');
    expect(running).not.toContain('Cover page only');
    expect(first).toContain('Cover page only');
    expect(first).not.toContain('Running header');
  });

  it('emits a header part when only page 1 carries rows', async () => {
    // A cover-only header: nothing on continuation pages, a name rule on page 1. The
    // running bands are empty, so testing only those would drop the part entirely.
    const worksheet = buildAcceptanceWorksheet();
    worksheet.header = {
      enabled: true,
      bands: [],
      firstPage: { bands: [createBand({ right: [createFillInField(bi('Name:', '姓名：'))] })] },
    };

    const zip = await JSZip.loadAsync(await exportDocxBuffer(worksheet, STUDENT_BI));
    const document = await zip.file('word/document.xml')!.async('string');
    expect(document).toContain('<w:titlePg/>');
    expect(zip.file('word/header2.xml')).toBeTruthy();
    expect(await zip.file('word/header2.xml')!.async('string')).toContain('Name:');
  });

  it('still blanks page 1 when showOnFirstPage is false', async () => {
    const worksheet = buildAcceptanceWorksheet();
    worksheet.header = {
      enabled: true,
      bands: [createBand({ left: [createTextField(bi('Every page', '每頁'))] })],
      showOnFirstPage: false,
    };

    const zip = await JSZip.loadAsync(await exportDocxBuffer(worksheet, STUDENT_BI));
    const document = await zip.file('word/document.xml')!.async('string');
    expect(document).toContain('<w:titlePg/>');

    const first = await zip.file('word/header2.xml')!.async('string');
    expect(first).not.toContain('Every page');
  });

  it('leaves an unchanged first page with no titlePg at all', async () => {
    const worksheet = buildAcceptanceWorksheet();
    worksheet.header = {
      enabled: true,
      bands: [createBand({ left: [createTextField(bi('Every page', '每頁'))] })],
    };

    const zip = await JSZip.loadAsync(await exportDocxBuffer(worksheet, STUDENT_BI));
    const document = await zip.file('word/document.xml')!.async('string');
    expect(document).not.toContain('<w:titlePg/>');
    expect(document).not.toContain('w:type="first"');
  });

  it('exports a hard line break as w:br inside one paragraph, not as a new paragraph', async () => {
    const worksheet = buildAcceptanceWorksheet();
    const question = worksheet.questions[0];
    const stem = question.blocks.find((block) => block.kind === 'paragraph');
    if (!stem || stem.kind !== 'paragraph') throw new Error('fixture has no stem paragraph');
    stem.text = bi('Before break\nAfter break', '斷行前\n斷行後');

    const zip = await JSZip.loadAsync(await exportDocxBuffer(worksheet, STUDENT_BI));
    const document = await zip.file('word/document.xml')!.async('string');

    // The two halves are separate w:t runs joined by a break…
    expect(document).toContain('<w:t xml:space="preserve">Before break</w:t>');
    expect(document).toContain('<w:t xml:space="preserve">After break</w:t>');
    expect(document).toContain('<w:t xml:space="preserve">斷行前</w:t>');
    // …and no raw newline is left inside a w:t, which Word would render as a space.
    expect(document).not.toMatch(/<w:t[^>]*>[^<]*\n[^<]*<\/w:t>/);
  });

  it('keeps a broken line in the same list item, so it takes one number', async () => {
    const worksheet = buildAcceptanceWorksheet();
    const question = worksheet.questions[0];
    const stem = question.blocks.find((block) => block.kind === 'paragraph');
    if (!stem || stem.kind !== 'paragraph') throw new Error('fixture has no stem paragraph');
    stem.text = bi('Line one\nLine two', '');

    const zip = await JSZip.loadAsync(await exportDocxBuffer(worksheet, STUDENT_BI));
    const document = await zip.file('word/document.xml')!.async('string');

    // Both halves live inside a single <w:p>: splitting into two paragraphs would
    // consume a second list number and print "1." then "2." for one question.
    const paragraphs = document.split('<w:p>');
    const owner = paragraphs.find((p) => p.includes('Line one'));
    expect(owner).toBeDefined();
    expect(owner).toContain('Line two');
    expect(owner).toContain('<w:br/>');
  });

  it('writes an arbitrary custom margin, so the typed value is what prints', async () => {
    const worksheet = buildAcceptanceWorksheet();
    // 3.2 cm top, as the custom field would store it.
    worksheet.pageSetup = {
      paper: 'A4',
      orientation: 'portrait',
      margins: { top: cmToTwips(3.2), right: 850, bottom: 1440, left: 850 },
    };

    const zip = await JSZip.loadAsync(await exportDocxBuffer(worksheet, STUDENT_BI));
    const document = await zip.file('word/document.xml')!.async('string');
    expect(document).toContain(`w:top="${cmToTwips(3.2)}"`);
    expect(cmToTwips(3.2)).toBe(1814);
  });

  /*
   * Clearing the title has to remove the paragraph, not just its text.
   *
   * An unconditional title node made the block undeletable: emptying it left a blank
   * centred paragraph holding 12pt of `spaceAfter` at the top of page 1, which reads as
   * a gap the teacher has no way to reach. The field itself survives — it still names
   * the document in the outline and the download filename — so the guard is on the
   * printed paragraph rather than on `worksheet.title`.
   */
  /*
   * A new document must not print its own name twice.
   *
   * The factory used to ship a header band holding the same words as `title`, so a
   * fresh worksheet exported "Economics Worksheet" as a running header *and* as the
   * title block underneath it. The title is the copy that stays, because it also names
   * the document in the outline and the download filename.
   */
  it('prints a new document’s title once, not as a header as well', async () => {
    const worksheet = createWorksheet();
    const name = plain(worksheet.title.en);
    expect(name).toBeTruthy();

    const zip = await JSZip.loadAsync(await exportDocxBuffer(worksheet, STUDENT_BI));
    const document = await zip.file('word/document.xml')!.async('string');
    expect(document.split(name)).toHaveLength(2);

    // No header part at all, so there is nowhere for a second copy to hide.
    expect(zip.file('word/header1.xml')).toBeNull();
  });

  it('drops the title paragraph once the title is cleared', async () => {
    const open = async (worksheet: Worksheet) => {
      const zip = await JSZip.loadAsync(await exportDocxBuffer(worksheet, STUDENT_BI));
      return zip.file('word/document.xml')!.async('string');
    };

    const worksheet = buildAcceptanceWorksheet();
    expect(await open(worksheet)).toContain('<w:pStyle w:val="WorksheetTitle"/>');

    worksheet.title = { en: [], zh: [] };
    expect(await open(worksheet)).not.toContain('<w:pStyle w:val="WorksheetTitle"/>');
  });
});
