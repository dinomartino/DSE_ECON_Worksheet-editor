import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { presetFor } from '@/ai/providers';
import { exportDocxBuffer } from '@/export/docx';
import { createParagraphBlock, createStructuredQuestion, createWorksheet } from '@/model/factories';
import { createWorksheetFrom } from '@/model/newWorksheet';
import { isRichTextEmpty } from '@/model/text';
import { collectTexts, mapWorksheetTexts } from '@/model/textWalk';
import { applyTranslationBatch } from '@/model/translationApply';
import type { SlotGroup, TextSlot } from '@/model/textSlots';
import type { OutputMode, ParagraphBlock, RichText, StructuredQuestion, Worksheet } from '@/model/types';
import { buildAcceptanceWorksheet } from '@/test/fixtures';
import { buildMarkSchemeWorksheet } from '@/test/markSchemeFixture';
import { fakeGlossary } from './fakeGlossary';
import { defaultTranslateOptions, planFromSlots, planTranslation } from './plan';
import { runTranslation, writesFor } from './run';
import { oneSided, referenceClient, reply, scriptedClient } from './testKit';
import type { TranslateOptions } from './types';

/**
 * The engine's output is safe to export: decoded runs carry no wire tag, a blank prints as
 * underlined spaces, a subscript as w:vertAlign, and derived text (numbers, marks) prints
 * once. Part one writes the results by hand into a question it built; part two runs the
 * real walker and apply over a whole fixture once P-TEXT is in the tree.
 */

const WIRE_TAG = /<\/?(?:b|i|u|sub|sup|s\d)>|<(?:blank|br)\s*\/?>|&lt;\/?(?:b|i|u|sub|sup|s\d|blank|br)/;

async function documentXml(ws: Worksheet, mode: OutputMode): Promise<string> {
  const zip = await JSZip.loadAsync(await exportDocxBuffer(ws, mode));
  return zip.file('word/document.xml')!.async('string');
}

const paragraph = (en: RichText): ParagraphBlock => ({ ...createParagraphBlock(), text: { en, zh: [] } });

function englishPaper(): { ws: Worksheet; question: StructuredQuestion } {
  const question: StructuredQuestion = {
    ...createStructuredQuestion(),
    blocks: [
      paragraph([
        { text: 'The price rises from P' }, { text: '1', vertAlign: 'subscript' }, { text: ' to P' },
        { text: '2', vertAlign: 'subscript' }, { text: ', so output falls by ' },
        { text: ' '.repeat(12), underline: true }, { text: ' units.' },
      ]),
      paragraph([{ text: '$14 000' }]),
    ],
  };
  question.parts = [{ ...question.parts[0], marks: 4, blocks: [paragraph([{ text: 'Give ' }, { text: 'TWO', bold: true }, { text: ' reasons.' }])] }];
  return { ws: { ...createWorksheet(), questions: [question] }, question };
}

const group: SlotGroup = { kind: 'question', id: 'q', label: 'Question 1' };
function slotOf(path: string, block: ParagraphBlock, kind: TextSlot['kind']): TextSlot {
  return { path, text: block.text, kind, role: 'print', group, questionId: 'q', flowId: 'q', blockIds: [block.id] };
}

describe('engine output exports leak-free', () => {
  it('a blank, a subscript and bold survive into the .docx; marks and numbers print once', async () => {
    const { ws, question } = englishPaper();
    const [stem, money] = question.blocks as ParagraphBlock[];
    const part = question.parts[0].blocks[0] as ParagraphBlock;
    // The symbol-only line stays out of the plan (P-TEXT's isSymbolOnly; copySymbols off).
    const slots = [slotOf('stem', stem, 'stem'), slotOf('part', part, 'part')];
    const options: TranslateOptions = {
      directions: { toZh: true, toEn: true }, includeTeacher: true, includeDiagramLabels: true,
      copySymbols: { toZh: false, toEn: false },
    };
    const plan = planFromSlots(ws.id, slots, { kind: 'paper' }, options);
    const client = scriptedClient([reply([
      ['t1', '價格由P<sub>1</sub>上升至P<sub>2</sub>，因此產量減少<blank/>單位。'],
      ['t2', '舉出<b>兩個</b>原因。'],
    ])]);
    const deps = { client, preset: { ...presetFor('gemini'), concurrency: 1 }, model: 'm', glossary: fakeGlossary() };
    const outcome = await runTranslation(plan, deps, new AbortController().signal, () => {});
    const writes = writesFor(plan, outcome, new Set(plan.jobs.keys()), true);
    expect(writes.map((w) => w.path)).toEqual(['stem', 'part']);

    // What P-TEXT's apply does, by hand for the two paths this test built.
    const next = new Map(writes.map((w) => [w.path, w.next]));
    const translated: Worksheet = {
      ...ws,
      questions: [{
        ...question,
        blocks: [{ ...stem, text: { ...stem.text, zh: next.get('stem')! } }, money],
        parts: [{ ...question.parts[0], blocks: [{ ...part, text: { ...part.text, zh: next.get('part')! } }] }],
      }],
    };

    const zh = await documentXml(translated, { language: 'zh', version: 'student' });
    expect(zh).toContain('單位。');
    expect(zh).not.toMatch(WIRE_TAG);
    expect(zh).toMatch(/<w:u w:val="single"\/>(?:(?!<\/w:r>).)*<w:t xml:space="preserve"> {12}<\/w:t>/);
    expect(zh.match(/<w:vertAlign w:val="subscript"\/>/g)).toHaveLength(2);
    expect(zh).toMatch(/<w:b\/>(?:(?!<\/w:r>).)*<w:t[^>]*>兩個<\/w:t>/);
    expect(zh.match(/4分/g)).toHaveLength(1);

    const bilingual = await documentXml(translated, { language: 'bilingual', version: 'student' });
    expect(bilingual).not.toMatch(WIRE_TAG);
    expect(bilingual).toContain('Give ');
    // An uncopied symbol-only line prints once in EN+中.
    expect(bilingual.match(/\$14 000/g)).toHaveLength(1);
  });
});

// ---- part two: the real walker and apply (skipped until P-TEXT is in the tree) ----

const DOCUMENTS: Array<[string, () => Worksheet]> = [
  ['acceptance fixture', buildAcceptanceWorksheet],
  ['mark scheme fixture', buildMarkSchemeWorksheet],
  ...(['classroom', 'paper1', 'lqWorksheet', 'lqMock'] as const).map(
    (documentType): [string, () => Worksheet] => [`preset ${documentType}`, () => createWorksheetFrom({ documentType })],
  ),
];
const walkerReady = collectTexts(buildAcceptanceWorksheet()).length > 0;

describe.skipIf(!walkerReady)('an English-only paper translated end to end', () => {
  for (const [name, build] of DOCUMENTS) {
    it(`${name}: plan → run → apply → .docx matches the bilingual original`, async () => {
      const original = build();
      const english = oneSided(original, 'en');
      const mode: OutputMode = { language: 'zh', version: 'teacher' };
      const plan = planTranslation(english, { kind: 'paper' }, defaultTranslateOptions(mode, true));
      const deps = { client: referenceClient(original), preset: { ...presetFor('gemini'), concurrency: 1 }, model: 'm', glossary: null };
      const outcome = await runTranslation(plan, deps, new AbortController().signal, () => {});
      const writes = writesFor(plan, outcome, new Set(plan.jobs.keys()), true);
      const { worksheet: translated, report } = applyTranslationBatch(english, writes);
      expect(report.skipped).toEqual([]);

      // The original, less whatever the run left empty (failed rows, one-sided originals).
      const filled = new Map(collectTexts(translated).map((slot) => [slot.path, slot.text]));
      const expected = mapWorksheetTexts(original, (slot) =>
        filled.get(slot.path) && isRichTextEmpty(filled.get(slot.path)!.zh) ? { ...slot.text, zh: [] } : slot.text);

      for (const language of ['zh', 'bilingual'] as const) {
        const got = await documentXml(translated, { language, version: 'teacher' });
        expect(got).not.toMatch(WIRE_TAG);
        expect(got, `${name} (${language})`).toBe(await documentXml(expected, { language, version: 'teacher' }));
      }
    });
  }
});
