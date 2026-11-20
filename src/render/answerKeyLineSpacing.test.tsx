import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AnswerKeyPreview } from '@/components/preview/AnswerKeyPreview';
import { exportAnswerKeyDocxBuffer } from '@/export/docx';
import { exactLineFor } from '@/export/docx/styles';
import { createStructuredQuestion, createWorksheet } from '@/model/factories';
import { withLineSpacing } from '@/model/lineSpacing';
import { createSchemeFromPattern } from '@/model/markSchemePatterns';
import { bi, plain } from '@/model/text';
import type { AnswerKeyLayout, AnswerKeyPreset, LanguageMode, Worksheet } from '@/model/types';
import { withFlow } from '@/test/fixtures';
import { buildKeyLineSpacingPaper as keyPaper, filled } from '@/test/keyLineSpacingFixture';
import { answerKeyParts, answerKeyView, renderCombinedAnswerKey, withSpacedKey } from './answerKey';
import type { ColumnsNode, RenderNode, TableNode, TextNode } from './ir';

/**
 * The answer key follows Document setup → Line spacing (k-0483; k-0468 gave the paper its
 * own, GitHub issue #7 point 4): the Marking scheme view, its print and its `.docx` state the
 * same box for every line of the key, by the paper's own rule — text and hung rows are spaced;
 * tables, model diagrams and gaps keep their height; the key's title keeps its box. At Single
 * nothing changes, so an old paper's key prints as it always did. The paper it runs on is
 * `src/test/keyLineSpacingFixture.ts`: MC with notes and a fraction, the marking-scheme
 * question, and a DRQ with k-0475's group headings, EC table and content max.
 */

const LANGUAGES: LanguageMode[] = ['en', 'zh', 'bilingual'];
const PRESETS: AnswerKeyPreset[] = ['classic', 'hkeaa', 'suggested', 'detailed'];

const withPreset = (worksheet: Worksheet, preset: AnswerKeyPreset, extra: AnswerKeyLayout = {}): Worksheet => ({
  ...worksheet,
  answerKeyLayout: { ...extra, preset },
});

const texts = (nodes: RenderNode[]) => nodes.filter((node): node is TextNode => node.kind === 'text');
const rows = (nodes: RenderNode[]) => nodes.filter((node): node is ColumnsNode => node.kind === 'columns');
const tables = (nodes: RenderNode[]) => nodes.filter((node): node is TableNode => node.kind === 'table');
const lineOf = (node: RenderNode) => (node.kind === 'text' || node.kind === 'columns' ? node.lineSpacing : undefined);
const without = (node: RenderNode) => ({ ...node, lineSpacing: undefined });

describe('Line spacing in the answer key: the IR', () => {
  it('changes nothing at Single: the same view, no field on any node', () => {
    for (const preset of PRESETS) {
      for (const language of LANGUAGES) {
        const base = withPreset(keyPaper(), preset);
        const view = answerKeyView(base, language);
        expect(JSON.stringify(view.nodes), `${preset} ${language}`).not.toContain('"lineSpacing"');
        expect(answerKeyView(withLineSpacing(base, 1), language), `${preset} ${language}`).toEqual(view);
        expect(withSpacedKey(view, 1)).toBe(view);
      }
    }
  });

  it('reads a spacing it cannot print as Single, as the paper does', () => {
    const base = keyPaper();
    const single = answerKeyView(base, 'en');
    for (const value of [0.5, 1, 3.5, Number.NaN]) {
      expect(answerKeyView({ ...base, lineSpacing: value }, 'en'), String(value)).toEqual(single);
    }
  });

  it.each(PRESETS)('%s: spaces every line of text and every hung row, and nothing else', (preset) => {
    for (const language of LANGUAGES) {
      const base = withPreset(keyPaper(), preset);
      const single = answerKeyView(base, language);
      const spaced = answerKeyView(withLineSpacing(base, 1.5), language);
      const tag = `${preset} ${language}`;

      // The same key: same length, same owners, same typed fields.
      expect(spaced.nodes, tag).toHaveLength(single.nodes.length);
      expect(spaced.owners, tag).toEqual(single.owners);
      expect(spaced.fields, tag).toEqual(single.fields);

      const titles = new Set(spaced.fields.map((field) => field.index));
      expect(titles.has(0)).toBe(true);
      spaced.nodes.forEach((node, index) => {
        const label = `${tag} #${index} ${node.kind}`;
        if (titles.has(index)) {
          // The key's own title lines keep their box, as the paper's title does.
          expect(node, label).toEqual(single.nodes[index]);
          expect(lineOf(node), label).toBeUndefined();
        } else if (node.kind === 'text' || node.kind === 'columns') {
          expect(node.lineSpacing, label).toBe(1.5);
          // Spacing is the only change.
          expect(without(node), label).toEqual(single.nodes[index]);
        } else {
          // Tables (the MC grid, a ruled scheme, the EC table), diagrams, gaps and breaks.
          expect(node, label).toEqual(single.nodes[index]);
        }
      });

      // Not vacuous: this key has lines, rows and tables in every style. (The Detailed table
      // puts nearly all its words in tables, which keep their rows.)
      expect(texts(spaced.nodes).filter((node) => node.lineSpacing === 1.5).length, tag).toBeGreaterThan(
        preset === 'detailed' ? 2 : 10,
      );
      expect(tables(spaced.nodes).length, tag).toBeGreaterThan(0);
      expect(spaced.nodes.some((node) => node.kind === 'spacer'), tag).toBe(true);
    }
  });

  it('Classic: question numbers, part labels, answers, points, explanations and headings are all spaced', () => {
    const { nodes } = answerKeyView(withLineSpacing(withPreset(keyPaper(), 'classic'), 1.5), 'en');
    const styles = new Set(texts(nodes).filter((node) => node.lineSpacing === 1.5).map((node) => node.style));
    for (const style of ['Section Heading', 'Question Stem', 'Sub-question', 'Sub-sub-question', 'Marking Scheme', 'Body']) {
      expect(styles.has(style as TextNode['style']), style).toBe(true);
    }
    // The hung notes under the MC grid (explanation, per-option reasons) are rows.
    expect(rows(nodes).length).toBeGreaterThan(0);
    expect(rows(nodes).every((row) => row.lineSpacing === 1.5)).toBe(true);
  });

  it('HKEAA: the legend and disclaimer, the Marks-column lines and the subtitle follow; the title stays', () => {
    const base = withPreset(keyPaper(), 'hkeaa', { subtitle: bi('Form 5 mock', '中五模擬') });
    const view = answerKeyView(withLineSpacing(base, 1.5), 'en');
    expect(view.fields.map((field) => field.index)).toEqual([0, 1]);
    // The title and subtitle are the key's own authored lines.
    expect(texts(view.nodes).slice(0, 2).map((node) => node.lineSpacing)).toEqual([undefined, undefined]);
    const column = texts(view.nodes).filter((node) => node.marksColumn !== undefined);
    expect(column.length).toBeGreaterThan(5);
    expect(column.every((node) => node.lineSpacing === 1.5)).toBe(true);
    // The legend's rows and the disclaimer are lines of the key like any other.
    expect(rows(view.nodes).length).toBeGreaterThan(3);
    expect(rows(view.nodes).every((row) => row.lineSpacing === 1.5)).toBe(true);
    expect(texts(view.nodes).some((node) => node.format?.italic && node.lineSpacing === 1.5)).toBe(true);
  });

  it('k-0475: scheme headings, the EC heading and the content mark are spaced; the EC table is a table', () => {
    for (const preset of ['classic', 'hkeaa'] as const) {
      const base = withPreset(keyPaper(), preset);
      const single = answerKeyView(base, 'en').nodes;
      const spaced = answerKeyView(withLineSpacing(base, 2), 'en').nodes;
      const headings = texts(spaced).filter((node) => node.format?.underline);
      expect(headings.length, preset).toBeGreaterThan(2);
      expect(headings.every((node) => node.lineSpacing === 2), preset).toBe(true);
      const named = (needle: string) =>
        texts(spaced).filter((node) => plain(node.text.en).includes(needle));
      expect(named('effective communication').length, preset).toBeGreaterThan(0);
      expect(named('maximum mark for content').length, preset).toBeGreaterThan(0);
      for (const node of [...named('effective communication'), ...named('maximum mark for content')]) {
        expect(node.lineSpacing, plain(node.text.en)).toBe(2);
      }
      // Its table keeps its own rows: byte for byte what Single drew.
      const ecTables = tables(spaced).filter((table) => table.blockId.startsWith('answer-key-ec-'));
      expect(ecTables.length, preset).toBeGreaterThan(0);
      expect(ecTables, preset).toEqual(tables(single).filter((table) => table.blockId.startsWith('answer-key-ec-')));
    }
  });

  it('the Marking scheme view being typed on spaces the empty points it draws to type in', () => {
    // A scheme typed so far as one reason of three: the view draws the other points (`editOnly`) to type in.
    const question = createStructuredQuestion();
    const scheme = filled(createSchemeFromPattern('reasons', 4), [bi('One reason, typed', '已輸入一項原因')]);
    question.parts = [{ ...question.parts[0], id: 'partly', marks: 4, scheme }];
    const base = withPreset(withFlow(createWorksheet(), [question]), 'classic');
    const view = answerKeyView(withLineSpacing(base, 1.15), 'en', { editing: true });
    const empty = texts(view.nodes).filter((node) => node.editOnly);
    expect(empty.length).toBeGreaterThan(0);
    expect(empty.every((node) => node.lineSpacing === 1.15)).toBe(true);
    // And the same nodes as the single view's, with only the spacing added.
    const single = answerKeyView(base, 'en', { editing: true });
    expect(view.nodes.map(without)).toEqual(single.nodes.map(without));
  });

  it('each document of a combined key follows its own paper’s spacing', () => {
    const roomy = withLineSpacing(withPreset(keyPaper(), 'classic'), 1.5);
    const tight = withPreset(keyPaper(), 'classic');
    const [first, second] = answerKeyParts([roomy, tight], 'en');
    expect(texts(first).slice(1).every((node) => node.lineSpacing === 1.5)).toBe(true);
    expect(JSON.stringify(second)).not.toContain('"lineSpacing"');
    // The joined key (what the .docx and the whole-set view lay out) is those parts and a break.
    const joined = renderCombinedAnswerKey([roomy, tight], 'en');
    expect(joined).toHaveLength(first.length + 1 + second.length);
    expect(JSON.stringify(joined.slice(first.length + 1))).not.toContain('"lineSpacing"');
  });
});

describe('Line spacing in the answer key: the page', () => {
  const page = (worksheet: Worksheet, language: LanguageMode = 'en') =>
    renderToStaticMarkup(<AnswerKeyPreview worksheet={worksheet} language={language} onEdit={() => {}} />);

  /** The opening tag of the element holding the first `text`, back to the nearest `tag`. */
  function openTag(markup: string, tag: 'p' | 'div', text: string): string {
    const at = markup.indexOf(text);
    expect(at, text).toBeGreaterThan(-1);
    const start = markup.lastIndexOf(`<${tag}`, at);
    return markup.slice(start, markup.indexOf('>', start) + 1);
  }

  it('draws no line-height of its own at Single', () => {
    const base = withPreset(keyPaper(), 'classic');
    const markup = page(base);
    expect(markup).not.toContain('line-height:');
    expect(page(withLineSpacing(base, 1))).toBe(markup);
  });

  it('draws the very box the .docx states: 18pt lines at 1.5, the heading’s own 14pt box times it', () => {
    const markup = page(withLineSpacing(withPreset(keyPaper(), 'classic'), 1.5));
    // The MC answers are the grid; the first entry with lines is the seventh question.
    expect(openTag(markup, 'p', 'Question 7')).toContain('line-height:18pt');
    expect(openTag(markup, 'p', 'Supply decreases')).toContain('line-height:18pt');
    // A hung row of the notes under the grid.
    expect(openTag(markup, 'div', 'A is wrong')).toContain('line-height:18pt');
    expect(openTag(markup, 'p', 'Section A')).toContain(`line-height:${Math.round(exactLineFor(14) * 1.5) / 20}pt`);
    // The title keeps its own box.
    expect(openTag(markup, 'p', 'Key line spacing mix')).not.toContain('line-height');
  });

  it('keeps a Marks-column paragraph spaced and clear of the column', () => {
    const markup = page(withLineSpacing(withPreset(keyPaper(), 'hkeaa'), 2));
    const tag = openTag(markup, 'p', 'Supply decreases');
    expect(tag).toContain('line-height:24pt');
    expect(tag).toContain('padding-right:54pt');
  });

  it('follows the language: 中文 and bilingual keys are spaced too', () => {
    for (const language of ['zh', 'bilingual'] as const) {
      const markup = page(withLineSpacing(withPreset(keyPaper(), 'classic'), 1.5), language);
      expect(markup, language).toContain('line-height:18pt');
      expect(openTag(markup, 'p', '供應減少'), language).toContain('line-height:18pt');
    }
  });
});

describe('Line spacing in the answer key: the .docx', () => {
  async function keyXml(worksheet: Worksheet, language: LanguageMode = 'en'): Promise<string> {
    const zip = await JSZip.loadAsync(await exportAnswerKeyDocxBuffer(worksheet, language));
    return zip.file('word/document.xml')!.async('string');
  }

  /**
   * Every paragraph of one style, in document order: its `w:pPr` and what follows it (its
   * runs). A gap between entries is a paragraph with no runs; it keeps its own height.
   */
  const paragraphsOf = (xml: string, styleId: string): Array<{ props: string; runs: string }> =>
    [...xml.matchAll(/<w:p>(<w:pPr>(?:(?!<\/w:pPr>).)*<\/w:pPr>)((?:(?!<\/w:p>)[\s\S])*)<\/w:p>/g)]
      .map((match) => ({ props: match[1], runs: match[2] }))
      .filter(({ props }) => props.includes(`<w:pStyle w:val="${styleId}"/>`));
  /** The `w:pPr` of each paragraph of a style that has text on it. */
  const paragraphProps = (xml: string, styleId: string): string[] =>
    paragraphsOf(xml, styleId)
      .filter(({ runs }) => runs !== '')
      .map(({ props }) => props);

  const tableXml = (xml: string) => (xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) ?? []).join('\n');
  const outsideTables = (xml: string) => xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, '');

  it('writes a key at Single exactly as before, in every style and language', async () => {
    for (const preset of PRESETS) {
      for (const language of LANGUAGES) {
        const base = withPreset(keyPaper(), preset);
        expect(await keyXml(withLineSpacing(base, 1), language), `${preset} ${language}`).toBe(await keyXml(base, language));
      }
    }
  });

  it('states each spaced line as an exact box: 360 at 1.5, the heading’s own box times it', async () => {
    const base = withPreset(keyPaper(), 'classic');
    for (const language of LANGUAGES) {
      const xml = outsideTables(await keyXml(withLineSpacing(base, 1.5), language));
      for (const style of ['QuestionStem', 'Subquestion', 'Subsubquestion', 'MarkingScheme']) {
        const props = paragraphProps(xml, style);
        expect(props.length, `${style} ${language}`).toBeGreaterThan(0);
        // A fraction's paragraph grows (`atLeast`, k-0479); every other line is exact.
        for (const entry of props) expect(entry, `${style} ${language}`).toMatch(/<w:spacing w:line="360" w:lineRule="(exact|atLeast)"\/>/);
      }
      for (const entry of paragraphProps(xml, 'SectionHeading')) {
        expect(entry).toContain(`w:line="${Math.round(exactLineFor(14) * 1.5)}"`);
      }
      // Body lines outside a table: the notes' heading, the totals, the figure captions…
      const body = paragraphProps(xml, 'BodyTextCustom').filter((entry) => entry.includes('w:spacing'));
      expect(body.length, language).toBeGreaterThan(0);
      for (const entry of body) expect(entry, language).toContain('w:line="360"');
      // The title keeps the style's own box: no direct spacing at all.
      const [title] = paragraphProps(xml, 'WorksheetTitle');
      expect(title, language).not.toContain('w:spacing');
    }
  });

  it('leaves every table exactly as at Single: the MC grid, the EC and level tables, the version map', async () => {
    for (const preset of PRESETS) {
      const base = withPreset(keyPaper(), preset);
      const single = tableXml(await keyXml(base));
      expect(single.length, preset).toBeGreaterThan(0);
      expect(tableXml(await keyXml(withLineSpacing(base, 2))), preset).toBe(single);
    }
  });

  it('puts a Marks-column label on its first line: the box and its paragraph state the spaced line', async () => {
    const base = withPreset(keyPaper(), 'hkeaa');
    const boxes = (xml: string) => [...xml.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/g)].map((match) => Number(match[2]));
    const single = await keyXml(base);
    // 240 twips × 635 EMU: the fixed line, and the label's paragraph states none of its own.
    expect(new Set(boxes(single))).toEqual(new Set([152400]));
    expect(single).not.toMatch(/<w:pStyle w:val="\w+"\/><w:spacing[^>]*\/><w:ind w:left="0" w:right="0"/);

    const spaced = await keyXml(withLineSpacing(base, 1.5));
    expect(boxes(spaced)).toHaveLength(boxes(single).length);
    expect(boxes(spaced).length).toBeGreaterThan(5);
    // 360 twips × 635 EMU, and the same exact line in the label's own paragraph.
    expect(new Set(boxes(spaced))).toEqual(new Set([228600]));
    const labels = [...spaced.matchAll(/<w:txbxContent><w:p><w:pPr>((?:(?!<\/w:pPr>).)*)<\/w:pPr>/g)].map((match) => match[1]);
    expect(labels).toHaveLength(boxes(spaced).length);
    for (const entry of labels) {
      expect(entry).toContain('<w:spacing w:line="360" w:lineRule="exact"/><w:ind w:left="0" w:right="0" w:firstLine="0"/>');
    }
    // And the paragraph the label rides on states that line too.
    for (const entry of paragraphProps(outsideTables(spaced), 'Subquestion')) expect(entry).toContain('w:line="360"');
  });

  it('keeps the Marks-column label on the first line at Double and in 中文', async () => {
    const base = withPreset(keyPaper(), 'hkeaa');
    for (const language of ['zh', 'bilingual'] as const) {
      const xml = await keyXml(withLineSpacing(base, 2), language);
      // 480 twips × 635 EMU.
      expect(xml, language).toContain('cy="304800"');
      expect(xml, language).toContain('<w:spacing w:line="480" w:lineRule="exact"/><w:ind w:left="0" w:right="0"');
    }
  });

  it('gives a fraction’s paragraph an atLeast line at the spaced height (k-0479 in a key)', async () => {
    const xml = outsideTables(await keyXml(withLineSpacing(withPreset(keyPaper(), 'classic'), 1.5)));
    const points = paragraphsOf(xml, 'MarkingScheme').filter(({ runs }) => runs !== '');
    const holding = points.filter(({ runs }) => runs.includes('<m:f>'));
    expect(holding.length).toBeGreaterThan(0);
    for (const { props } of holding) expect(props).toContain('<w:spacing w:line="360" w:lineRule="atLeast"/>');
    // Every other point line stays exact.
    for (const { props } of points.filter(({ runs }) => !runs.includes('<m:f>'))) {
      expect(props).toContain('<w:spacing w:line="360" w:lineRule="exact"/>');
    }
  });

  it('lets a hung row holding a fraction grow, at Single and spaced (k-0479 in the key’s notes)', async () => {
    // The notes under the MC grid are rows (a number, then the text hung at its column). A fraction
    // typed into an explanation was clipped in Word: the row said `exact`, as every row does.
    const base = withPreset(keyPaper(), 'classic');
    const hungRows = (xml: string) =>
      [...outsideTables(xml).matchAll(/<w:p>(<w:pPr>(?:(?!<\/w:pPr>).)*<\/w:pPr>)((?:(?!<\/w:p>)[\s\S])*)<\/w:p>/g)]
        .map((match) => ({ props: match[1], runs: match[2] }))
        .filter(({ props }) => props.includes('w:hanging'));
    for (const [spaced, line] of [
      [undefined, 240],
      [1.5, 360],
    ] as const) {
      const rows = hungRows(await keyXml(spaced ? withLineSpacing(base, spaced) : base));
      const grown = rows.filter(({ runs }) => runs.includes('<m:f>'));
      const plainRows = rows.filter(({ runs }) => !runs.includes('<m:f>'));
      expect(grown.length, String(spaced)).toBeGreaterThan(0);
      expect(plainRows.length, String(spaced)).toBeGreaterThan(0);
      for (const { props } of grown) expect(props, String(spaced)).toContain(`<w:spacing w:line="${line}" w:lineRule="atLeast"/>`);
      // Every other row is as it was: the style's own box at Single, an exact spaced line otherwise.
      for (const { props } of plainRows) {
        if (spaced) expect(props).toContain('<w:spacing w:line="360" w:lineRule="exact"/>');
        else expect(props).not.toContain('<w:spacing');
      }
    }
  });

  it('writes each document of a combined key at its own paper’s spacing', async () => {
    const roomy = withLineSpacing(withPreset(keyPaper(), 'classic'), 1.5);
    const tight = withPreset(keyPaper(), 'classic');
    const zip = await JSZip.loadAsync(await exportAnswerKeyDocxBuffer(roomy, 'en', [tight]));
    const xml = outsideTables(await zip.file('word/document.xml')!.async('string'));
    // The first paper's lines are spaced; the second's question numbers keep the style's box.
    const stems = paragraphProps(xml, 'QuestionStem');
    expect(stems.some((entry) => entry.includes('w:line="360"'))).toBe(true);
    expect(stems.some((entry) => !entry.includes('w:spacing'))).toBe(true);
  });
});
