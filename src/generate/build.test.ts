import JSZip from 'jszip';
import { beforeEach, describe, expect, it } from 'vitest';
import { presetFor } from '@/ai/providers';
import { exportDocxBuffer } from '@/export/docx';
import { resolveFlow } from '@/model/flow';
import { createWorksheetFrom } from '@/model/newWorksheet';
import { plain } from '@/model/text';
import type { LayoutElement, McqQuestion, StructuredQuestion, Worksheet } from '@/model/types';
import { useWorksheetStore } from '@/store/worksheetStore';
import { scriptedClient } from '@/translate/testKit';
import { buildBatch, sourceParagraphs } from './build';
import { SOURCE_EN, mcqReply, replyText, structuredReply } from './fixtures';
import { recipeFor } from './recipe';
import { generateFromSource } from './run';

const preset = presetFor('gemini');

async function batchFor(ws: Worksheet, questions: unknown[], sides: Array<'en' | 'zh'> = ['en']) {
  const recipe = recipeFor(ws);
  const out = await generateFromSource(
    { source: SOURCE_EN, recipe, sides },
    { client: scriptedClient([replyText(questions)]), preset, glossary: null },
    new AbortController().signal,
  );
  if (!out.ok) throw new Error('expected ok');
  return buildBatch(out.items, recipe, SOURCE_EN, out.sourceSide);
}

/** Flow as short labels: question type, or the layout element's kind and plain text. */
function flowLabels(ws: Worksheet): string[] {
  return resolveFlow(ws).map((item) => {
    if (item.type === 'question') return item.question.type;
    const text = 'text' in item.element ? plain(item.element.text.en) : '';
    return text ? `${item.element.kind}:${text}` : item.element.kind;
  });
}

const store = () => useWorksheetStore.getState();

describe('sourceParagraphs', () => {
  it('keeps the pasted text verbatim, one paragraph per blank-line block, on its own side', () => {
    const blocks = sourceParagraphs('First line\nsecond line.\r\n\r\n  Indented.  \n\n\n', 'en');
    expect(blocks.map((b) => b.text)).toEqual([
      { en: [{ text: 'First line\nsecond line.' }], zh: [] },
      { en: [{ text: '  Indented.' }], zh: [] },
    ]);
  });
});

describe('insertQuestionBatch', () => {
  beforeEach(() => {
    store().replaceWorksheet(createWorksheetFrom({ documentType: 'paper1' }));
  });

  it('Paper 1: a shared stimulus and four MCQs land ahead of END OF PAPER, as one undo', async () => {
    const before = store().worksheet;
    const batch = await batchFor(before, [mcqReply('en', { combination: true }), mcqReply('en'), mcqReply('en'), mcqReply('en')]);
    const report = store().insertQuestionBatch(batch.builds.map((b) => b.build), { worksheetId: before.id, lead: batch.lead });
    if (!report.ok) throw new Error('refused');
    const ws = store().worksheet;
    expect(report.committed).toBe(ws);
    expect(flowLabels(ws)).toEqual(['questionCount', 'mcq', 'stimulus', 'mcq', 'mcq', 'mcq', 'mcq', 'text:END OF PAPER']);
    const stimulus = ws.layout.find((e) => e.id === report.leadId) as Extract<LayoutElement, { kind: 'stimulus' }>;
    expect(stimulus.span).toBe(4);
    expect(stimulus.blocks.map((b) => (b.kind === 'paragraph' ? plain(b.text.en) : ''))).toEqual(SOURCE_EN.split('\n\n'));
    const combo = ws.questions.find((q) => q.id === report.questionIds[0]) as McqQuestion;
    expect(combo.statements).toHaveLength(3);
    expect(combo.answerIndex).toBe(3);
    expect(combo.options.map((o) => plain(o.text.en))).toEqual(['(1) and (2) only', '(1) and (3) only', '(2) and (3) only', '(1), (2) and (3)']);
    expect(combo.marks).toBe(1);
    expect(plain(combo.explanation?.en)).toBe('All three follow from the source.');
    expect(store().insertAnchorId).toBe(report.questionIds[3]);

    store().undo();
    expect(store().worksheet).toBe(before);
  });

  it('an explicit anchor wins: the batch lands behind it, in order', async () => {
    const ws0 = store().worksheet;
    const sample = ws0.questions[0].id;
    const lead = ws0.flow[0].id;
    store().setInsertAnchor(lead);
    const batch = await batchFor(ws0, [mcqReply('en'), mcqReply('en')]);
    const report = store().insertQuestionBatch(batch.builds.map((b) => b.build), { worksheetId: ws0.id, lead: batch.lead });
    if (!report.ok) throw new Error('refused');
    expect(flowLabels(store().worksheet)).toEqual(['questionCount', 'stimulus', 'mcq', 'mcq', 'mcq', 'text:END OF PAPER']);
    expect(store().worksheet.questions.map((q) => q.id)).toEqual([...report.questionIds, sample]);
  });

  it('is refused for another document or a read-only one, and commits nothing', async () => {
    const ws0 = store().worksheet;
    const batch = await batchFor(ws0, [mcqReply('en')]);
    const builds = batch.builds.map((b) => b.build);
    expect(store().insertQuestionBatch(builds, { worksheetId: 'other' })).toEqual({ ok: false, refused: 'otherDocument' });
    useWorksheetStore.setState({ readOnly: true });
    expect(store().insertQuestionBatch(builds, { worksheetId: ws0.id })).toEqual({ ok: false, refused: 'readOnly' });
    useWorksheetStore.setState({ readOnly: false });
    expect(store().worksheet).toBe(ws0);
    expect(store().past).toHaveLength(0);
  });

  it('a Question-Answer Book: one structured question with the source panel, marks, scheme and answer space', async () => {
    store().replaceWorksheet(createWorksheetFrom({ documentType: 'lqMock' }));
    const ws0 = store().worksheet;
    const batch = await batchFor(ws0, [structuredReply('en', [2, 4, 4])]);
    expect(batch.lead).toBeUndefined();
    const report = store().insertQuestionBatch(batch.builds.map((b) => b.build), { worksheetId: ws0.id });
    if (!report.ok) throw new Error('refused');
    const labels = flowLabels(store().worksheet);
    // Unanchored: under the last section, ahead of END OF PAPER.
    expect(labels.slice(-3)).toEqual(['text:Answer any ONE question.', 'structured', 'text:END OF PAPER']);
    const q = store().worksheet.questions.find((x) => x.id === report.questionIds[0]) as StructuredQuestion;
    expect(q.blocks.map((b) => b.kind)).toEqual(['paragraph', 'source']);
    const panel = q.blocks[1] as Extract<StructuredQuestion['blocks'][number], { kind: 'source' }>;
    expect(panel.label).toBeUndefined();
    expect(panel.blocks).toHaveLength(2);
    expect(q.parts.map((p) => p.marks)).toEqual([2, 4, 4]);
    expect(q.parts.map((p) => p.answerSpace)).toEqual([5, 8, 8]);
    expect(q.parts.every((p) => p.scheme?.routes[0].groups[0].points.length === p.marks)).toBe(true);
    expect(q.parts[0].blocks[0].kind === 'paragraph' && q.parts[0].blocks[0].text.en).toEqual([
      { text: 'State ' }, { text: 'ONE', bold: true }, { text: ' effect of the tax on retailers.' },
    ]);
  });

  it('a document with generated questions exports a .docx with the source, stems and keys', async () => {
    store().replaceWorksheet(createWorksheetFrom({ documentType: 'classroom' }));
    const ws0 = store().worksheet;
    const batch = await batchFor(ws0, [mcqReply('both', { combination: true }), mcqReply('both'), mcqReply('both'), structuredReply('both', [2, 3])], ['en', 'zh']);
    const report = store().insertQuestionBatch(batch.builds.map((b) => b.build), { worksheetId: ws0.id, lead: batch.lead });
    if (!report.ok) throw new Error('refused');
    const ws = store().worksheet;
    for (const mode of [{ language: 'bilingual', version: 'teacher' }, { language: 'en', version: 'student' }] as const) {
      const zip = await JSZip.loadAsync(await exportDocxBuffer(ws, mode));
      const xml = await zip.file('word/document.xml')!.async('string');
      expect(xml).toContain('raised the tobacco tax by 32% in 2024');
      expect(xml).toContain('(1) and (2) only');
      expect(xml).toContain('With reference to the source, explain the change in sales.');
      expect(xml).not.toMatch(/\*\*/);
      if (mode.version === 'teacher') expect(xml).toContain('參考答案');
      else expect(xml).not.toContain('A model answer.');
    }
  });
});
