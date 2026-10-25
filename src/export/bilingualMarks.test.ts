import { describe, expect, it } from 'vitest';
import { bi } from '@/model/text';
import type { OutputMode, StructuredQuestion, Worksheet } from '@/model/types';
import { createWorksheet } from '@/model/factories';
import { createSamplePaper } from '@/model/samplePaper';
import { buildAnswerKeyDocxParts, buildDocxParts } from '@/export/docx';
import { worksheetClipboardHtml, worksheetPlainText } from '@/export/clipboard';

/**
 * A bilingual paper shows each marks label once: "(2 marks)", not "(2 marks) （2分）"
 * (k-0201, the user on the sample paper's answer key). The number is the same on both
 * sides, so the second label only repeated it on every part. English, because a
 * bilingual paper leads in English. All three backends read the same rule
 * (§ `marksRuns`; the preview's `marksLabel` is checked in the browser).
 */
function paragraph(id: string, en: string, zh: string) {
  return { kind: 'paragraph' as const, id, text: bi(en, zh) };
}

function worksheet(): Worksheet {
  const question: StructuredQuestion = {
    id: 'q1',
    type: 'structured',
    blocks: [paragraph('stem', 'The table shows a market.', '下表顯示一個市場。')],
    parts: [
      { id: 'a', blocks: [paragraph('pa', 'State the equilibrium price.', '寫出均衡價格。')], marks: 2 },
      { id: 'b', blocks: [paragraph('pb', 'Explain the shortage.', '解釋短缺。')], marks: 4, answer: bi('Answer.', '答案。') },
      { id: 'c', blocks: [paragraph('pc', 'Name one cause.', '指出一個原因。')], marks: 1 },
    ],
  };
  const sheet = createWorksheet();
  sheet.questions = [question];
  sheet.flow = [{ type: 'question', id: question.id }];
  return sheet;
}

const BILINGUAL: OutputMode = { language: 'bilingual', version: 'student' };
const BILINGUAL_TEACHER: OutputMode = { language: 'bilingual', version: 'teacher' };
const PART_LABEL_ZH = /（\d+分）/g;

/** The .docx label's interior space is a no-break space (§ `marksText`); read it as one. */
const spaced = (xml: string) => xml.replaceAll('\u00a0', ' ');

describe('bilingual marks labels', () => {
  it('prints one English label per part in the .docx question paper', () => {
    for (const mode of [BILINGUAL, BILINGUAL_TEACHER]) {
      const xml = spaced(buildDocxParts(worksheet(), mode).documentXml);
      expect(xml.match(/\(2 marks\)/g)).toHaveLength(1);
      expect(xml.match(/\(4 marks\)/g)).toHaveLength(1);
      expect(xml.match(/\(1 mark\)/g)).toHaveLength(1);
      expect(xml.match(PART_LABEL_ZH)).toBeNull();
    }
  });

  it('prints one label per part in the bilingual answer key', () => {
    const xml = spaced(buildAnswerKeyDocxParts(worksheet(), 'bilingual').documentXml);
    expect(xml.match(/\(2 marks\)/g)).toHaveLength(1);
    expect(xml.match(/\(4 marks\)/g)).toHaveLength(1);
    expect(xml.match(PART_LABEL_ZH)).toBeNull();
  });

  it('prints one label per part in the sample paper, the file the user reported', () => {
    const sample = createSamplePaper('en');
    for (const xml of [
      spaced(buildDocxParts(sample, BILINGUAL_TEACHER).documentXml),
      spaced(buildAnswerKeyDocxParts(sample, 'bilingual').documentXml),
    ]) {
      // Its parts are worth 2, 2 and 4. The section headings keep their own wording on
      // each line ("Section B (8 marks)" over "乙部（8分）"), like "Question 4" over "第4題".
      expect(xml).not.toMatch(/（[24]分）/);
      expect(xml.match(/\(2 marks\)/g)).toHaveLength(2);
      expect(xml.match(/\(4 marks\)/g)).toHaveLength(1);
    }
  });

  it('agrees in the clipboard backend', () => {
    const text = worksheetPlainText(worksheet(), BILINGUAL);
    expect(text.match(/\(2 marks\)/g)).toHaveLength(1);
    expect(text.match(PART_LABEL_ZH)).toBeNull();
    const html = worksheetClipboardHtml(worksheet(), BILINGUAL);
    expect(html.match(/\(2 marks\)/g)).toHaveLength(1);
    expect(html.match(PART_LABEL_ZH)).toBeNull();
  });

  it('keeps each single-language label as it was', () => {
    const zh = buildDocxParts(worksheet(), { language: 'zh', version: 'student' }).documentXml;
    expect(zh.match(/（2分）/g)).toHaveLength(1);
    expect(spaced(zh)).not.toMatch(/\(2 marks\)/);
    const en = spaced(buildDocxParts(worksheet(), { language: 'en', version: 'student' }).documentXml);
    expect(en.match(/\(2 marks\)/g)).toHaveLength(1);
    expect(en.match(PART_LABEL_ZH)).toBeNull();
  });
});
