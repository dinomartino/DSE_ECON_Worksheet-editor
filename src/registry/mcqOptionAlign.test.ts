import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { exportDocxBuffer } from '@/export/docx';
import { questionClipboardHtml } from '@/export/clipboard';
import { createMcqQuestion, createWorksheet } from '@/model/factories';
import { applyFormatTarget, formatOfTarget, isAlignOnly, isFormattable } from '@/model/edits';
import { migrate, serializeWorksheet } from '@/model/migrations';
import { bi } from '@/model/text';
import type { McqOptionLayout, McqQuestion, OutputMode, TextAlign, Worksheet } from '@/model/types';
import { renderWorksheet } from '@/render/worksheet';
import type { EditTarget, RenderNode } from '@/render/ir';
import { withFlow } from '@/test/fixtures';
import { mcqType } from './mcq';

/**
 * GitHub #2: MC options justify (靠齊) like the stem. One setting on the question,
 * `optionAlign`, printed on every stacked option line in all three backends; a tab-stop
 * row (inline, columns2) ignores it and keeps it.
 */

const STUDENT_EN: OutputMode = { language: 'en', version: 'student' };

const LONG =
  'The government imposes a price ceiling below the equilibrium price, so the quantity ' +
  'demanded exceeds the quantity supplied and a shortage results in the market.';

function paper(options: { layout?: McqOptionLayout; align?: TextAlign } = {}): {
  worksheet: Worksheet;
  question: McqQuestion;
} {
  const question: McqQuestion = {
    ...createMcqQuestion(),
    options: ['A', 'B', 'C', 'D'].map((letter, index) => ({
      id: `opt-${index}`,
      text: bi(`${LONG} (${letter})`, ''),
    })),
    ...(options.layout ? { optionLayout: options.layout } : {}),
    ...(options.align ? { optionAlign: options.align } : {}),
  };
  return { worksheet: withFlow(createWorksheet(), [question]), question };
}

function optionTarget(question: McqQuestion, index = 0): EditTarget {
  return { kind: 'mcqOption', questionId: question.id, optionId: question.options[index].id };
}

function optionNodes(worksheet: Worksheet): RenderNode[] {
  return renderWorksheet(worksheet, STUDENT_EN).questions[0].nodes.filter(
    (node) => (node.kind === 'text' || node.kind === 'columns') && node.style === 'MCQ Option',
  );
}

async function documentXml(worksheet: Worksheet): Promise<string> {
  const zip = await JSZip.loadAsync(await exportDocxBuffer(worksheet, STUDENT_EN));
  return zip.file('word/document.xml')!.async('string');
}

/** Every MCQOption paragraph's properties, in document order. */
function optionParagraphProps(xml: string): string[] {
  return [...xml.matchAll(/<w:pPr>(?:(?!<\/w:pPr>).)*w:pStyle w:val="MCQOption"(?:(?!<\/w:pPr>).)*<\/w:pPr>/g)].map(
    (match) => match[0],
  );
}

describe('MC option alignment: the model', () => {
  it('survives save and reload', () => {
    const { worksheet } = paper({ align: 'justify' });
    const reloaded = migrate(JSON.parse(JSON.stringify(serializeWorksheet(worksheet))));
    expect((reloaded.questions[0] as McqQuestion).optionAlign).toBe('justify');
    expect(reloaded.__unknown).toBeUndefined();
  });

  it('is set and cleared from any option, the same toggle as the stem', () => {
    const { worksheet, question } = paper();
    expect(isFormattable(optionTarget(question))).toBe(true);
    expect(isAlignOnly(optionTarget(question))).toBe(true);
    expect(formatOfTarget(worksheet, optionTarget(question))).toBeUndefined();

    const justified = applyFormatTarget(worksheet, optionTarget(question, 2), { align: 'justify' });
    expect((justified.questions[0] as McqQuestion).optionAlign).toBe('justify');
    // One setting for the question: every option reports it.
    expect(formatOfTarget(justified, optionTarget(question, 0))).toEqual({ align: 'justify' });

    const cleared = applyFormatTarget(justified, optionTarget(question, 1), { align: undefined });
    expect('optionAlign' in cleared.questions[0]).toBe(false);
  });

  it('ignores every format but alignment', () => {
    const { worksheet, question } = paper();
    expect(applyFormatTarget(worksheet, optionTarget(question), { bold: true, fontSize: 14 })).toBe(worksheet);
  });

  it('follows its question through a version shuffle', () => {
    const { question } = paper({ align: 'justify' });
    const shuffled = mcqType.variant!({ ...question }, { seed: 7, version: 1 }).question;
    expect(shuffled.optionAlign).toBe('justify');
  });
});

describe('MC option alignment: the three backends', () => {
  it('puts the alignment on every stacked option line in the IR', () => {
    const nodes = optionNodes(paper({ align: 'justify' }).worksheet);
    expect(nodes).toHaveLength(4);
    for (const node of nodes) {
      expect(node.kind).toBe('text');
      expect(node.kind === 'text' && node.format).toEqual({ align: 'justify' });
    }
    // Absent: no format at all, as before.
    for (const node of optionNodes(paper().worksheet)) {
      expect(node.kind === 'text' && 'format' in node).toBe(false);
    }
  });

  it('exports w:jc "both" on each option paragraph, and nothing new when absent', async () => {
    const justified = optionParagraphProps(await documentXml(paper({ align: 'justify' }).worksheet));
    expect(justified).toHaveLength(4);
    for (const props of justified) {
      expect(props).toContain('<w:jc w:val="both"/>');
      // Still a native list item: the letter hangs exactly as before.
      expect(props).toContain('<w:numPr>');
    }

    const plainXml = await documentXml(paper().worksheet);
    const plainProps = optionParagraphProps(plainXml);
    expect(plainProps).toHaveLength(4);
    for (const props of plainProps) expect(props).not.toContain('<w:jc');
    // Justify adds the w:jc and nothing else.
    expect(justified.map((props) => props.replace('<w:jc w:val="both"/>', ''))).toEqual(plainProps);
  });

  it('keeps a bilingual option\'s English line ragged in Word, as on the page', async () => {
    // The English side ends in a w:br; without the switch Word stretches that line.
    const settings = async (worksheet: Worksheet) => {
      const zip = await JSZip.loadAsync(await exportDocxBuffer(worksheet, STUDENT_EN));
      return zip.file('word/settings.xml')!.async('string');
    };
    expect(await settings(paper({ align: 'justify' }).worksheet)).toContain('<w:compat><w:doNotExpandShiftReturn/><w:compatSetting');
    expect(await settings(paper({ align: 'center' }).worksheet)).not.toContain('doNotExpandShiftReturn');
    expect(await settings(paper().worksheet)).not.toContain('doNotExpandShiftReturn');
  });

  it.each(['inline', 'columns2'] as const)('a %s row ignores it, byte for byte', async (layout) => {
    const { worksheet } = paper({ layout });
    const aligned = { ...worksheet, questions: [{ ...worksheet.questions[0], optionAlign: 'justify' }] } as Worksheet;
    expect(optionNodes(aligned)).toEqual(optionNodes(worksheet));
    expect(await documentXml(aligned)).toBe(await documentXml(worksheet));
    // Kept, so it applies again once the options stack.
    expect((aligned.questions[0] as McqQuestion).optionAlign).toBe('justify');
  });

  it('copies as text-align on each option line', () => {
    const { worksheet, question } = paper({ align: 'justify' });
    const html = questionClipboardHtml(worksheet, question.id, STUDENT_EN);
    expect(html.match(/text-align:justify;/g)).toHaveLength(4);
    const { worksheet: before, question: same } = paper();
    expect(questionClipboardHtml(before, same.id, STUDENT_EN)).not.toContain('text-align:justify');
  });
});
