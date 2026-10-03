import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildAnswerKeyDocxParts, exportAnswerKeyDocxBuffer, exportDocxBuffer } from '@/export/docx';
import { answerKeyClipboardHtml, worksheetClipboardHtml } from '@/export/clipboard';
import { createAnswerDiagram, createMcqQuestion, createWorksheet } from '@/model/factories';
import { bi, plain } from '@/model/text';
import type { AnswerKeyLayout, BiText, LanguageMode, McqQuestion, OutputMode, Worksheet } from '@/model/types';
import { buildAcceptanceWorksheet, withFlow } from '@/test/fixtures';
import { buildMarkSchemeWorksheet } from '@/test/markSchemeFixture';
import { parseWorksheet, stringifyWorksheet } from '@/storage/document';
import {
  answerKeyRunningHead,
  answerKeyTitle,
  answerKeyTitleOverride,
  answerKeyView,
  KEY_LAYOUT_WORDING,
  renderAnswerKey,
  renderCombinedAnswerKey,
} from './answerKey';
import { marksColumnWidth } from './answerKeySections';
import { MARK_SCHEME_WORDING } from './markScheme';
import type { ColumnsNode, RenderNode, TableNode, TextNode } from './ir';

const texts = (nodes: RenderNode[]) => nodes.filter((node): node is TextNode => node.kind === 'text');
const tables = (nodes: RenderNode[]) => nodes.filter((node): node is TableNode => node.kind === 'table');
const columns = (nodes: RenderNode[]) => nodes.filter((node): node is ColumnsNode => node.kind === 'columns');
const en = (node: { text: { en: { text: string }[] } }) => plain(node.text.en);
const withLayout = (worksheet: Worksheet, answerKeyLayout: AnswerKeyLayout): Worksheet => ({
  ...worksheet,
  answerKeyLayout,
});

function mcq(answerIndex: number, explanation?: string): McqQuestion {
  const question = createMcqQuestion();
  question.answerIndex = answerIndex;
  question.blocks = [{ kind: 'paragraph', id: `stem-${Math.random()}`, text: bi('Which is right?', '哪項正確？') }];
  if (explanation) question.explanation = bi(explanation, `解說${explanation}`);
  return question;
}

/** `count` MCQs, then the full marking-scheme question. */
function paper(count: number): Worksheet {
  const scheme = buildMarkSchemeWorksheet();
  const mcqs = Array.from({ length: count }, (_, index) => mcq(index % 4, index === 0 ? 'Because' : undefined));
  const worksheet = withFlow(createWorksheet(), [...mcqs, ...scheme.questions]);
  worksheet.title = bi('Mock', '模擬試');
  return worksheet;
}

const LANGUAGES: LanguageMode[] = ['en', 'zh', 'bilingual'];

describe('Classic is the key as it was', () => {
  it('an absent field, Classic named outright, and a newer build’s preset all print the same', () => {
    const worksheet = paper(12);
    for (const language of LANGUAGES) {
      const classic = renderAnswerKey(worksheet, language);
      for (const layout of [
        { preset: 'classic' },
        { showStems: false, mcLayout: 'grid' },
        { preset: 'omrSheet', mcLayout: 'bubbles' },
      ]) {
        expect(renderAnswerKey(withLayout(worksheet, layout as AnswerKeyLayout), language)).toEqual(classic);
      }
    }
  });

  it('writes no header part and no right indent', () => {
    const parts = buildAnswerKeyDocxParts(paper(6), 'en');
    expect(parts.headerFooter.header).toBeUndefined();
    expect(parts.documentXml).not.toMatch(/<w:ind[^>]*w:right=/);
  });
});

describe('HKEAA style', () => {
  const hkeaa = (count: number) => withLayout(paper(count), { preset: 'hkeaa' });

  it('prints the MC key as Question No. | Key in two column pairs, ruled in fives', () => {
    const [table] = tables(renderAnswerKey(hkeaa(45), 'en'));
    expect(table.columnCount).toBe(4);
    expect(table.rows).toHaveLength(26); // header + 25
    expect(table.rows[0].map((cell) => plain(cell.text.en))).toEqual(['Question No.', 'Key', 'Question No.', 'Key']);
    expect(plain(table.rows[1][0].text.en)).toBe('1.');
    expect(plain(table.rows[1][2].text.en)).toBe('26.');
    expect(plain(table.rows[25][0].text.en)).toBe('25.');
    expect(plain(table.rows[20][2].text.en)).toBe('45.');
    expect(plain(table.rows[21][2].text.en)).toBe('');
    // A rule closes every block of five, and nothing is ruled inside one.
    expect(table.rows[5][0].edges).toMatchObject({ bottom: true });
    expect(table.rows[6][0].edges).toMatchObject({ top: true, bottom: false });
    expect(table.rows[7][0].edges).toMatchObject({ top: false, bottom: false });
    // Ten questions: 1–5 | 6–10.
    const [small] = tables(renderAnswerKey(hkeaa(10), 'en'));
    expect(small.rows.slice(1).map((row) => [plain(row[0].text.en), plain(row[2].text.en)])).toEqual([
      ['1.', '6.'], ['2.', '7.'], ['3.', '8.'], ['4.', '9.'], ['5.', '10.'],
    ]);
  });

  it('keeps every long-question line out of a right-hand Marks column, marks inside it', () => {
    for (const language of LANGUAGES) {
      const view = answerKeyView(hkeaa(3), language);
      const scheme = texts(view.nodes).filter((node) => node.marksColumn !== undefined);
      expect(scheme.length).toBeGreaterThan(5);
      expect(new Set(scheme.map((node) => node.marksColumn))).toEqual(new Set([marksColumnWidth(language)]));
      // Marks never ride as "(n marks)" inside the column; points keep their "(1)".
      expect(scheme.some((node) => node.marks !== undefined)).toBe(false);
      expect(scheme.filter((node) => node.trail && plain(node.trail.en) === '(1)').length).toBeGreaterThan(2);
    }
  });

  it('puts a line’s own total in the column only where no marked scheme claims it', () => {
    const worksheet = hkeaa(0);
    const question = worksheet.questions[0] as Extract<Worksheet['questions'][number], { type: 'structured' }>;
    // (a) keeps its points' "(1)"s; a scheme-less part shows its marks as "(4)".
    question.parts[1] = { ...question.parts[1], subParts: [], marks: 4, scheme: undefined, answer: bi('Ans', '答') };
    const nodes = texts(renderAnswerKey(worksheet, 'en'));
    const label = (text: string) => nodes.find((node) => en(node) === text)!;
    expect(label('(a)').trail).toBeUndefined();
    expect(label('(b)').trail).toEqual(MARK_SCHEME_WORDING.mark(4));
  });

  it('heads every page "Marks" in the .docx, and the preview reads the same head', async () => {
    const worksheet = hkeaa(5);
    const nodes = renderAnswerKey(worksheet, 'bilingual');
    expect(answerKeyRunningHead(nodes, 'bilingual')).toBe('Marks 分數');
    const zip = await JSZip.loadAsync(await exportAnswerKeyDocxBuffer(worksheet, 'en'));
    const header = await zip.file('word/header1.xml')!.async('string');
    expect(header).toContain('Marks');
    const document = await zip.file('word/document.xml')!.async('string');
    expect(document).toContain(`w:right="${marksColumnWidth('en')}"`);
    expect(document).toContain('<w:headerReference');
    // No long questions, no column: a Paper 1 key in HKEAA style has no header.
    const mcOnly = withLayout(withFlow(createWorksheet(), [mcq(0), mcq(1)]), { preset: 'hkeaa' });
    expect(buildAnswerKeyDocxParts(mcOnly, 'en').headerFooter.header).toBeUndefined();
  });

  it('captions a model answer diagram "Figure n", its points under "Indicate in Figure n:"', () => {
    const worksheet = hkeaa(0);
    const question = worksheet.questions[0] as Extract<Worksheet['questions'][number], { type: 'structured' }>;
    question.parts[0] = { ...question.parts[0], answerDiagram: { ...createAnswerDiagram(), id: 'fig-a' } };
    question.parts[1] = { ...question.parts[1], subParts: [], marks: 2, scheme: undefined, answerDiagram: { ...createAnswerDiagram(), id: 'fig-b' } };
    for (const language of LANGUAGES) {
      const nodes = renderAnswerKey(worksheet, language);
      const at = (predicate: (node: RenderNode) => boolean) => nodes.findIndex(predicate);
      const line = (text: BiText) =>
        at((node) => node.kind === 'text' && plain(node.text.en) === plain(text.en) && plain(node.text.zh) === plain(text.zh));
      const diagram = (id: string) => at((node) => node.kind === 'diagram' && node.blockId === id);
      const firstPoint = at((node) => node.kind === 'text' && plain(node.text.en).startsWith('Supply decreases'));
      // (a): lead, points, caption, figure — HKEAA's order.
      expect(line(KEY_LAYOUT_WORDING.indicateIn(1))).toBeGreaterThan(-1);
      expect(line(KEY_LAYOUT_WORDING.indicateIn(1))).toBeLessThan(firstPoint);
      expect(firstPoint).toBeLessThan(line(KEY_LAYOUT_WORDING.figure(1)));
      expect(line(KEY_LAYOUT_WORDING.figure(1)) + 1).toBe(diagram('fig-a'));
      expect((nodes[line(KEY_LAYOUT_WORDING.indicateIn(1))] as TextNode).marksColumn).toBe(marksColumnWidth(language));
      // (b) has no scheme: its figure is numbered and captioned, with no lead.
      expect(line(KEY_LAYOUT_WORDING.figure(2)) + 1).toBe(diagram('fig-b'));
      expect(line(KEY_LAYOUT_WORDING.indicateIn(2))).toBe(-1);
    }
    // Classic prints the same diagrams uncaptioned, before the scheme, as it always has.
    const classic = renderAnswerKey(withLayout(worksheet, { preset: 'classic' }), 'en');
    expect(texts(classic).some((node) => en(node).startsWith('Figure') || en(node).startsWith('Indicate'))).toBe(false);
    const firstDiagram = classic.findIndex((node) => node.kind === 'diagram');
    const firstPoint = classic.findIndex((node) => node.kind === 'text' && plain(node.text.en).startsWith('Supply decreases'));
    expect(firstDiagram).toBeLessThan(firstPoint);
  });

  it('opens with the disclaimer and the notation legend, one side per row in bilingual', () => {
    const nodes = renderAnswerKey(hkeaa(2), 'bilingual');
    expect(texts(nodes).some((node) => node.text === KEY_LAYOUT_WORDING.disclaimer)).toBe(true);
    const legend = columns(nodes).filter((node) => node.cells.length === 2 && node.cells[1].at === 0.14);
    expect(legend).toHaveLength(KEY_LAYOUT_WORDING.legend.length * 2);
    expect(legend.every((row) => row.cells.every((cell) => cell.text.en.length === 0 || cell.text.zh.length === 0))).toBe(true);
    expect(plain(legend[2].cells[0].text.en)).toBe('max: n');
    expect(plain(legend[6].cells[0].text.zh)).toBe('最高n分');
  });

  it('prints each question’s total and drops the MC notes the preset hides', () => {
    const nodes = renderAnswerKey(hkeaa(3), 'en');
    expect(texts(nodes).map(en)).toContain('(Total: 13 marks)');
    expect(texts(nodes).map(en)).not.toContain('Explanations');
  });
});

describe('switches', () => {
  it('stems: question and part wording, typed where it prints; MC stems in the list', () => {
    const worksheet = withLayout(paper(2), { mcLayout: 'list', showStems: true });
    const nodes = renderAnswerKey(worksheet, 'en');
    const stems = texts(nodes).filter((node) => node.edit?.kind === 'blockText');
    expect(stems.map(en)).toEqual(
      expect.arrayContaining([
        'The government imposes a per-unit tax on cigarettes.',
        'Explain how the tax affects the equilibrium price of cigarettes.',
      ]),
    );
    expect(stems.every((node) => node.format?.italic)).toBe(true);
    const list = columns(nodes);
    expect(list.some((row) => row.cells[1].edit?.kind === 'blockText')).toBe(true);
    expect(list.some((row) => plain(row.cells[1].text.en) === 'Answer: A')).toBe(true);
    // Off (Classic): no stem anywhere.
    expect(texts(renderAnswerKey(paper(2), 'en')).some((node) => node.edit?.kind === 'blockText')).toBe(false);
  });

  it('totals: per section on the heading, and the paper’s at the end', () => {
    const worksheet = withLayout(paper(4), { sectionTotals: true, paperTotal: true });
    const nodes = renderAnswerKey(worksheet, 'en');
    const total = 4 + 13;
    expect(en(texts(nodes).at(-1)!)).toBe(`Total: ${total} marks`);
    const headings = texts(nodes).filter((node) => node.style === 'Section Heading');
    expect(headings.at(-1)?.marks).toBe(total);
  });

  it('MC explanations off removes them; on in the list prints them under the key', () => {
    const off = renderAnswerKey(withLayout(paper(3), { showExplanations: false }), 'en');
    expect(texts(off).map(en)).not.toContain('Explanations');
    const list = columns(renderAnswerKey(withLayout(paper(3), { mcLayout: 'list' }), 'en'));
    expect(list.some((row) => plain(row.cells[1].text.en) === 'Because')).toBe(true);
  });
});

describe('title and subtitle', () => {
  it('an override replaces the derived title side by side; the view types into it', () => {
    const worksheet = withLayout(paper(1), { title: bi('Unit 3 quiz', ''), subtitle: bi('5A', '5A') });
    expect(answerKeyTitle(worksheet)).toEqual({ en: bi('Unit 3 quiz', '').en, zh: bi('', '模擬試 — 答案及評分參考').zh });
    const view = answerKeyView(worksheet, 'en');
    expect(view.fields).toEqual([
      { index: 0, edit: { kind: 'answerKeyTitle' } },
      { index: 1, edit: { kind: 'answerKeySubtitle' } },
    ]);
    expect(en(view.nodes[1] as TextNode)).toBe('5A');
    // The export's nodes never carry the view's targets.
    expect(texts(view.nodes).some((node) => node.edit?.kind === 'answerKeyTitle')).toBe(false);
  });

  it('typing leaves a side equal to the derived title empty, so it keeps following the paper', () => {
    const worksheet = paper(1);
    const derived = answerKeyTitle(worksheet);
    expect(answerKeyTitleOverride(worksheet, { en: bi('Mine', '').en, zh: derived.zh })).toEqual({
      en: bi('Mine', '').en,
      zh: [],
    });
  });

  it('HKEAA derives "Marking scheme / 評卷參考"', () => {
    const title = answerKeyTitle(withLayout(paper(1), { preset: 'hkeaa' }));
    expect(plain(title.en)).toBe('Mock — Marking scheme');
    expect(plain(title.zh)).toBe('模擬試 — 評卷參考');
  });
});

describe('the layout is the key’s alone', () => {
  const layouts: AnswerKeyLayout[] = [
    { preset: 'hkeaa', showStems: true, paperTotal: true, sectionTotals: true, title: bi('X', 'Y'), subtitle: bi('S', 'S') },
    { mcLayout: 'list', lqLayout: 'marksColumn' },
  ];

  it('never changes the student or teacher paper, in any language', async () => {
    const worksheet = buildAcceptanceWorksheet();
    for (const layout of layouts) {
      for (const language of LANGUAGES) {
        for (const version of ['student', 'teacher'] as const) {
          const mode: OutputMode = { language, version };
          const plainZip = await JSZip.loadAsync(await exportDocxBuffer(worksheet, mode));
          const laidZip = await JSZip.loadAsync(await exportDocxBuffer(withLayout(worksheet, layout), mode));
          for (const name of ['word/document.xml', 'word/styles.xml', 'word/numbering.xml']) {
            expect(await laidZip.file(name)!.async('string')).toBe(await plainZip.file(name)!.async('string'));
          }
          expect(worksheetClipboardHtml(withLayout(worksheet, layout), mode)).toBe(worksheetClipboardHtml(worksheet, mode));
        }
      }
    }
  });

  it('the student paper still carries no answer, scheme or key wording with a layout set', async () => {
    const worksheet = withLayout(buildMarkSchemeWorksheet(), layouts[0]);
    const zip = await JSZip.loadAsync(await exportDocxBuffer(worksheet, { language: 'bilingual', version: 'student' }));
    const xml = await zip.file('word/document.xml')!.async('string');
    for (const leak of ['Supply decreases', 'Answers are for reference only', 'Marks', '評卷參考', 'Notation']) {
      expect(xml).not.toContain(leak);
    }
  });

  it('the clipboard copy of the key follows the layout', () => {
    const worksheet = withLayout(paper(2), { preset: 'hkeaa' });
    const html = answerKeyClipboardHtml(worksheet, 'en');
    expect(html).toContain('Question No.');
    expect(html).toContain(`padding-right:${marksColumnWidth('en') / 20}pt`);
  });
});

describe('combined key', () => {
  it('each part is laid out as its own document says', () => {
    const one = withLayout(paper(5), { preset: 'classic' });
    const two = withLayout(paper(5), { preset: 'hkeaa' });
    const nodes = renderCombinedAnswerKey([one, two], 'en');
    const breakAt = nodes.findIndex((node) => node.kind === 'pageBreak');
    const first = nodes.slice(0, breakAt);
    const second = nodes.slice(breakAt + 1);
    expect(texts(first).some((node) => node.marksColumn !== undefined)).toBe(false);
    expect(texts(second).some((node) => node.marksColumn !== undefined)).toBe(true);
    expect(tables(first)[0].blockId).toBe('answer-key-grid');
    expect(tables(second)[0].blockId).toBe('answer-key-mc-table');
    // The second part's own derived title names its own style.
    expect(en(second[0] as TextNode)).toBe('Mock — Marking scheme');
  });

  it('a part loaded read-only from storage keeps its layout, and the file carries its Marks head', async () => {
    const one = paper(5);
    const saved = parseWorksheet(stringifyWorksheet(withLayout(paper(2), { preset: 'hkeaa' })));
    expect(saved.answerKeyLayout).toEqual({ preset: 'hkeaa' });
    const zip = await JSZip.loadAsync(await exportAnswerKeyDocxBuffer(one, 'en', [saved]));
    const document = await zip.file('word/document.xml')!.async('string');
    expect(document).toContain('Question No.');
    expect(document).toContain(`w:right="${marksColumnWidth('en')}"`);
    expect(zip.file('word/header1.xml')).not.toBeNull();
  });
});
