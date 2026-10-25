import { beforeEach, describe, expect, it } from 'vitest';
// The registry loads first: the model modules below reach back into it and need it whole.
import '@/registry';
import JSZip from 'jszip';
import { exportDocxBuffer } from '@/export/docx';
import {
  createParagraphBlock,
  createSourceBlock,
  createStructuredQuestion,
  createTableBlock,
  createWorksheet,
} from './factories';
import { createStimulusElement } from './flow';
import { migrate, serializeWorksheet } from './migrations';
import { joinParagraph, splitParagraph } from './paragraphs';
import { bi, plain } from './text';
import type { ContentBlock, ParagraphBlock, StructuredQuestion, Worksheet } from './types';
import { withFlow } from '@/test/fixtures';
import { useWorksheetStore } from '@/store/worksheetStore';

/**
 * k-0200: Enter in a question's text starts a new paragraph, as in Word, and Backspace at a
 * paragraph's start (Delete at its end) joins it back. These are the model's halves; the keys
 * are driven in Chrome by `scripts/word-typing-verify.mjs`.
 */

const STEM = 'A price ceiling is set below the equilibrium price.';
const STEM_ZH = '價格上限設於均衡價格之下。';

function paper(blocks?: ContentBlock[]): { worksheet: Worksheet; question: StructuredQuestion } {
  const question = createStructuredQuestion();
  question.blocks = blocks ?? [{ ...createParagraphBlock(bi(STEM, STEM_ZH)), format: { bold: true } }];
  return { worksheet: withFlow(createWorksheet(), [question]), question };
}

const stem = (worksheet: Worksheet) => (worksheet.questions[0] as StructuredQuestion).blocks as ParagraphBlock[];
const texts = (worksheet: Worksheet, side: 'en' | 'zh' = 'en') => stem(worksheet).map((block) => plain(block.text[side]));

describe('Enter splits a paragraph', () => {
  it('at the caret: the words after it start a new paragraph with the same format', () => {
    const { worksheet, question } = paper();
    const at = STEM.indexOf(' below');
    const split = splitParagraph(worksheet, question.blocks[0].id, 'en', at, at, 'new');
    expect(texts(split)).toEqual(['A price ceiling is set', ' below the equilibrium price.']);
    const [first, second] = stem(split);
    expect(first.id).toBe(question.blocks[0].id);
    expect(second.id).toBe('new');
    expect(second.format).toEqual({ bold: true });
    // The Chinese stays with the first paragraph; the new one asks for its own.
    expect(plain(first.text.zh)).toBe(STEM_ZH);
    expect(second.text.zh).toEqual([]);
  });

  it('at the end makes an empty paragraph, and over a selection drops the selected words', () => {
    const { worksheet, question } = paper();
    const id = question.blocks[0].id;
    expect(texts(splitParagraph(worksheet, id, 'en', STEM.length, STEM.length, 'n'))).toEqual([STEM, '']);
    const from = STEM.indexOf(' is set');
    const to = from + ' is set'.length;
    expect(texts(splitParagraph(worksheet, id, 'en', from, to, 'n'))).toEqual(['A price ceiling', ' below the equilibrium price.']);
  });

  it('in Chinese moves the Chinese and leaves the English with the first paragraph', () => {
    const { worksheet, question } = paper();
    const split = splitParagraph(worksheet, question.blocks[0].id, 'zh', 4, 4, 'n');
    expect(texts(split, 'zh')).toEqual(['價格上限', '設於均衡價格之下。']);
    expect(texts(split, 'en')).toEqual([STEM, '']);
  });

  it('keeps bold and other run formats on both sides of the break', () => {
    const block = createParagraphBlock({ en: [{ text: 'Price ' }, { text: 'ceiling', bold: true }, { text: ' rules.' }], zh: [] });
    const { worksheet } = paper([block]);
    const split = splitParagraph(worksheet, block.id, 'en', 9, 9, 'n');
    expect(stem(split)[0].text.en).toEqual([{ text: 'Price ' }, { text: 'cei', bold: true }]);
    expect(stem(split)[1].text.en).toEqual([{ text: 'ling', bold: true }, { text: ' rules.' }]);
  });

  it('works in every block list: a part, a sub-part, a source panel, a layout element', () => {
    const question = createStructuredQuestion();
    const part = question.parts[0];
    part.blocks = [createParagraphBlock(bi('Explain one effect.', ''))];
    part.subParts = [{ id: 's', blocks: [createParagraphBlock(bi('Draw a diagram.', ''))], marks: 2 }];
    const source = createSourceBlock();
    source.blocks = [createParagraphBlock(bi('In 2024 the government set rents.', ''))];
    question.blocks = [source];
    const stimulus = createStimulusElement();
    stimulus.blocks = [createParagraphBlock(bi('Read the passage.', ''))];
    const worksheet = withFlow(createWorksheet(), [stimulus, question]);

    const inPart = splitParagraph(worksheet, part.blocks[0].id, 'en', 7, 7, 'a');
    expect((inPart.questions[0] as StructuredQuestion).parts[0].blocks.map((b) => plain((b as ParagraphBlock).text.en))).toEqual(['Explain', ' one effect.']);
    const inSub = splitParagraph(worksheet, part.subParts[0].blocks[0].id, 'en', 4, 4, 'b');
    expect((inSub.questions[0] as StructuredQuestion).parts[0].subParts![0].blocks).toHaveLength(2);
    const inSource = splitParagraph(worksheet, source.blocks[0].id, 'en', 7, 7, 'c');
    const body = ((inSource.questions[0] as StructuredQuestion).blocks[0] as typeof source).blocks;
    expect(body.map((b) => plain((b as ParagraphBlock).text.en))).toEqual(['In 2024', ' the government set rents.']);
    const inLayout = splitParagraph(worksheet, stimulus.blocks[0].id, 'en', 4, 4, 'd');
    const element = inLayout.layout.find((e) => e.id === stimulus.id) as typeof stimulus;
    expect(element.blocks).toHaveLength(2);
    // Only the list that changed is new: the rest of the paper keeps its identity.
    expect(inLayout.questions[0]).toBe(worksheet.questions[0]);
    expect(inPart.layout).toBe(worksheet.layout);
  });

  it('changes nothing for a block that is not a paragraph, or not there', () => {
    const table = createTableBlock(2, 2);
    const { worksheet } = paper([table]);
    expect(splitParagraph(worksheet, table.id, 'en', 0, 0, 'n')).toBe(worksheet);
    expect(splitParagraph(worksheet, 'missing', 'en', 0, 0, 'n')).toBe(worksheet);
  });
});

describe('Backspace and Delete join paragraphs', () => {
  it('Backspace at the start joins into the paragraph before, the caret where they meet', () => {
    const { worksheet, question } = paper();
    const at = STEM.indexOf(' below');
    const split = splitParagraph(worksheet, question.blocks[0].id, 'en', at, at, 'new');
    const joined = joinParagraph(split, 'new', 'en', 'backward')!;
    expect(joined.blockId).toBe(question.blocks[0].id);
    expect(joined.caret).toBe(at);
    // Enter then Backspace is no change at all.
    expect(stem(joined.worksheet)).toEqual(stem(worksheet));
  });

  it('Delete at the end pulls the next paragraph in', () => {
    const { worksheet, question } = paper();
    const split = splitParagraph(worksheet, question.blocks[0].id, 'en', 7, 7, 'new');
    const joined = joinParagraph(split, question.blocks[0].id, 'en', 'forward')!;
    expect(joined.caret).toBe(7);
    expect(stem(joined.worksheet)).toEqual(stem(worksheet));
  });

  it('keeps both translations apart with a line break when both paragraphs have one', () => {
    const one = createParagraphBlock(bi('First.', '第一。'));
    const two = createParagraphBlock(bi('Second.', '第二。'));
    const { worksheet } = paper([one, two]);
    const joined = joinParagraph(worksheet, two.id, 'en', 'backward')!;
    const [block] = stem(joined.worksheet);
    expect(plain(block.text.en)).toBe('First.Second.');
    expect(plain(block.text.zh)).toBe('第一。\n第二。');
  });

  it('does nothing at the first paragraph, at the last, or next to a table', () => {
    const one = createParagraphBlock(bi('First.', ''));
    const table = createTableBlock(1, 1);
    const two = createParagraphBlock(bi('Second.', ''));
    const { worksheet } = paper([one, table, two]);
    expect(joinParagraph(worksheet, one.id, 'en', 'backward')).toBeUndefined();
    expect(joinParagraph(worksheet, two.id, 'en', 'forward')).toBeUndefined();
    expect(joinParagraph(worksheet, two.id, 'en', 'backward')).toBeUndefined();
    expect(joinParagraph(worksheet, one.id, 'en', 'forward')).toBeUndefined();
  });
});

describe('a split paper saves, reopens, exports and undoes', () => {
  beforeEach(() => {
    useWorksheetStore.setState({ worksheet: paper().worksheet, past: [], future: [], readOnly: false });
  });

  it('reopens with both paragraphs, and needs no new schema version', () => {
    const { worksheet, question } = paper();
    const split = splitParagraph(worksheet, question.blocks[0].id, 'en', 22, 22, 'new');
    const saved = serializeWorksheet(split);
    expect(saved.schemaVersion).toBe(1);
    const reopened = migrate(JSON.parse(JSON.stringify(saved)));
    expect(texts(reopened)).toEqual(texts(split));
    expect(reopened.__unknown).toBeUndefined();
  });

  it('prints the two paragraphs in the .docx, the question number on the first', async () => {
    const { worksheet, question } = paper();
    const split = splitParagraph(worksheet, question.blocks[0].id, 'en', 22, 22, 'new');
    const zip = await JSZip.loadAsync(await exportDocxBuffer(split, { language: 'en', version: 'student' }));
    const xml = await zip.file('word/document.xml')!.async('string');
    const paragraphs = [...xml.matchAll(/<w:p>[\s\S]*?<\/w:p>|<w:p [\s\S]*?<\/w:p>/g)].map((m) => m[0]);
    const first = paragraphs.findIndex((p) => p.includes('A price ceiling is set<'));
    const second = paragraphs.findIndex((p) => p.includes(' below the equilibrium price.'));
    expect(first).toBeGreaterThanOrEqual(0);
    expect(second).toBe(first + 1);
    expect(paragraphs[first]).toContain('w:numPr');
    expect(paragraphs[second]).not.toContain('w:numPr');
  });

  it('is one undo step, and redo puts it back', () => {
    const store = useWorksheetStore.getState();
    const before = store.worksheet;
    const id = (before.questions[0] as StructuredQuestion).blocks[0].id;
    store.commit((draft) => splitParagraph(draft, id, 'en', 22, 22, 'new'));
    expect(texts(useWorksheetStore.getState().worksheet)).toHaveLength(2);
    useWorksheetStore.getState().undo();
    expect(useWorksheetStore.getState().worksheet).toBe(before);
    useWorksheetStore.getState().redo();
    expect(texts(useWorksheetStore.getState().worksheet)).toEqual(['A price ceiling is set', ' below the equilibrium price.']);
  });
});
