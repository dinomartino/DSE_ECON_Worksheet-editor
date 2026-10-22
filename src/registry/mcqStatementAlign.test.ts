import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { exportDocxBuffer } from '@/export/docx';
import { questionClipboardHtml } from '@/export/clipboard';
import { createMcqQuestion, createWorksheet } from '@/model/factories';
import { applyFormatTarget, formatOfTarget, isAlignOnly, isFormattable } from '@/model/edits';
import { migrate, serializeWorksheet } from '@/model/migrations';
import { bi } from '@/model/text';
import type { McqQuestion, OutputMode, TextAlign, Worksheet } from '@/model/types';
import { renderWorksheet } from '@/render/worksheet';
import type { EditTarget, RenderNode } from '@/render/ir';
import { withFlow } from '@/test/fixtures';
import { mcqType } from './mcq';

/**
 * GitHub #3: the (1)(2)(3) statements of a combination MC justify like the options do.
 * One setting on the question, `statementAlign`, printed on every statement line in all
 * three backends and independent of `optionAlign`. Absent = nothing changes.
 */

const STUDENT_EN: OutputMode = { language: 'en', version: 'student' };
const STUDENT_BOTH: OutputMode = { language: 'bilingual', version: 'student' };

function paper(align?: TextAlign): { worksheet: Worksheet; question: McqQuestion } {
  const question: McqQuestion = {
    ...createMcqQuestion(),
    statements: [
      bi('A price ceiling set below the equilibrium price causes a shortage in the market.', '價格上限設於均衡價格之下會令市場出現短缺。'),
      bi('Producers earn more revenue when demand is price inelastic and price rises.', '當需求缺乏價格彈性而價格上升時，生產者收益增加。'),
      bi('The government always gains tax revenue.', '政府必然增加稅收。'),
    ],
    ...(align ? { statementAlign: align } : {}),
  };
  return { worksheet: withFlow(createWorksheet(), [question]), question };
}

const statementTarget = (question: McqQuestion, index = 0): EditTarget => ({
  kind: 'mcqStatement',
  questionId: question.id,
  index,
});

function statementNodes(worksheet: Worksheet, mode = STUDENT_EN): RenderNode[] {
  return renderWorksheet(worksheet, mode).questions[0].nodes.filter(
    (node) => node.kind === 'text' && node.style === 'Statement',
  );
}

async function documentXml(worksheet: Worksheet, mode = STUDENT_EN): Promise<string> {
  const zip = await JSZip.loadAsync(await exportDocxBuffer(worksheet, mode));
  return zip.file('word/document.xml')!.async('string');
}

function statementParagraphProps(xml: string): string[] {
  return [...xml.matchAll(/<w:pPr>(?:(?!<\/w:pPr>).)*w:pStyle w:val="Statement"(?:(?!<\/w:pPr>).)*<\/w:pPr>/g)].map(
    (match) => match[0],
  );
}

describe('statement alignment: the model', () => {
  it('survives save and reload, and an old document without it opens unchanged', () => {
    const { worksheet } = paper('justify');
    const reloaded = migrate(JSON.parse(JSON.stringify(serializeWorksheet(worksheet))));
    expect((reloaded.questions[0] as McqQuestion).statementAlign).toBe('justify');
    expect(reloaded.__unknown).toBeUndefined();
    const plain = migrate(JSON.parse(JSON.stringify(serializeWorksheet(paper().worksheet))));
    expect('statementAlign' in plain.questions[0]).toBe(false);
  });

  it('is set and cleared from any statement, separately from the options', () => {
    const { worksheet, question } = paper();
    expect(isFormattable(statementTarget(question))).toBe(true);
    expect(isAlignOnly(statementTarget(question))).toBe(true);
    expect(formatOfTarget(worksheet, statementTarget(question))).toBeUndefined();

    const justified = applyFormatTarget(worksheet, statementTarget(question, 2), { align: 'justify' });
    const q = justified.questions[0] as McqQuestion;
    expect(q.statementAlign).toBe('justify');
    expect(q.optionAlign).toBeUndefined();
    expect(formatOfTarget(justified, statementTarget(question, 0))).toEqual({ align: 'justify' });

    const cleared = applyFormatTarget(justified, statementTarget(question, 1), { align: undefined });
    expect('statementAlign' in cleared.questions[0]).toBe(false);
  });

  it('leaves optionAlign alone, and the options alone', () => {
    const { worksheet, question } = paper();
    const withOptions = { ...worksheet, questions: [{ ...question, optionAlign: 'justify' }] } as Worksheet;
    const next = applyFormatTarget(withOptions, statementTarget(question), { align: 'justify' });
    expect((next.questions[0] as McqQuestion).optionAlign).toBe('justify');
    expect((next.questions[0] as McqQuestion).statementAlign).toBe('justify');
  });

  it('ignores every format but justify or left', () => {
    const { worksheet, question } = paper();
    expect(applyFormatTarget(worksheet, statementTarget(question), { bold: true })).toBe(worksheet);
    expect(applyFormatTarget(worksheet, statementTarget(question), { align: 'center' })).toBe(worksheet);
    const left = applyFormatTarget(worksheet, statementTarget(question), { align: 'left' });
    expect((left.questions[0] as McqQuestion).statementAlign).toBe('left');
  });

  it('follows its question through a version shuffle', () => {
    const { question } = paper('justify');
    const shuffled = mcqType.variant!({ ...question }, { seed: 7, version: 1 }).question;
    expect(shuffled.statementAlign).toBe('justify');
  });
});

describe('statement alignment: the three backends', () => {
  it('stamps every statement line in the IR, and nothing when absent', () => {
    const nodes = statementNodes(paper('justify').worksheet);
    expect(nodes).toHaveLength(3);
    for (const node of nodes) expect(node.kind === 'text' && node.format).toEqual({ align: 'justify' });
    for (const node of statementNodes(paper().worksheet)) expect(node.kind === 'text' && 'format' in node).toBe(false);
  });

  it('wins over the document: left opts out of Justify text', () => {
    const { worksheet } = paper('left');
    const doc = { ...worksheet, justifyText: true } as Worksheet;
    for (const node of statementNodes(doc)) expect(node.kind === 'text' && node.format).toEqual({ align: 'left' });
  });

  it.each([STUDENT_EN, STUDENT_BOTH])('exports w:jc both on each statement, adding nothing else (%o)', async (mode) => {
    const justified = statementParagraphProps(await documentXml(paper('justify').worksheet, mode));
    expect(justified).toHaveLength(3);
    for (const props of justified) {
      expect(props).toContain('<w:jc w:val="both"/>');
      expect(props).toContain('<w:numPr>');
    }
    const plain = statementParagraphProps(await documentXml(paper().worksheet, mode));
    for (const props of plain) expect(props).not.toContain('<w:jc');
    expect(justified.map((props) => props.replace('<w:jc w:val="both"/>', ''))).toEqual(plain);
  });

  it('keeps a bilingual statement\'s English line ragged in Word, as on the page', async () => {
    const zip = await JSZip.loadAsync(await exportDocxBuffer(paper('justify').worksheet, STUDENT_BOTH));
    expect(await zip.file('word/settings.xml')!.async('string')).toContain('doNotExpandShiftReturn');
  });

  it('copies as text-align on each statement line', () => {
    const { worksheet, question } = paper('justify');
    expect(questionClipboardHtml(worksheet, question.id, STUDENT_BOTH).match(/text-align:justify;/g)).toHaveLength(3);
    const { worksheet: before, question: same } = paper();
    expect(questionClipboardHtml(before, same.id, STUDENT_BOTH)).not.toContain('text-align:justify');
  });
});
