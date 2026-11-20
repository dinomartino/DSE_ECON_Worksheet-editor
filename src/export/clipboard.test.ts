import { describe, expect, it } from 'vitest';
import type { OutputMode } from '@/model/types';
import { documentShape } from '@/model/documentShape';
import { listIndentScheme, PAPER1_LIST_INDENTS } from '@/model/numbering';
import { buildAcceptanceWorksheet } from '@/test/fixtures';
import { createWorksheetFrom } from '@/model/newWorksheet';
import { questionClipboardHtml, worksheetClipboardHtml, worksheetPlainText } from './clipboard';

const STUDENT_BI: OutputMode = { language: 'bilingual', version: 'student' };
const TEACHER_EN: OutputMode = { language: 'en', version: 'teacher' };

describe('Copy for Word (§7.7, §11.12)', () => {
  it('renders tables as real HTML tables with merges and borders', () => {
    const html = worksheetClipboardHtml(buildAcceptanceWorksheet(), STUDENT_BI);

    expect(html).toContain('<table');
    expect(html).toContain('border-collapse:collapse');
    expect(html).toContain('colspan="2"');
    expect(html).toContain('Quantity demanded');
    expect(html).toContain('需求量');
    // Every cell is a plain `td`: no header row, matching the reference papers — and a
    // `th` would also re-apply the browser's own bold-and-centred default on paste.
    expect(html).not.toContain('<th');
    expect(html).not.toContain('EFEFEF');
  });

  it('inlines images as data URIs so the paste carries the picture', () => {
    const html = worksheetClipboardHtml(buildAcceptanceWorksheet(), STUDENT_BI);
    expect(html).toContain('<img src="data:image/png;base64,');
    expect(html).toContain('alt="Demand curve diagram"');
  });

  it('writes numbering as literal text, which clipboard HTML cannot express natively', () => {
    const html = worksheetClipboardHtml(buildAcceptanceWorksheet(), STUDENT_BI);
    // Each marker in its gutter box, then Word's tab to the hanging indent (§ textNodeHtml).
    for (const marker of ['1.', 'A.', '(1)', '(a)']) expect(html).toContain(`>${marker}<span style='mso-tab-count:1'>&#9;</span></span>`);
  });

  it('leaves the blank line the .docx writes after every table (u-7gdr)', () => {
    const html = worksheetClipboardHtml(buildAcceptanceWorksheet(), STUDENT_BI);
    expect(html).toContain('</table><p style="height:12pt;margin:0">&nbsp;</p>');
    // Never the next line flush on a table: after `</table>` comes the blank or a caption.
    for (const after of html.split('</table>').slice(1)) expect(after).toMatch(/^<p style="(height:12pt;margin:0|[^"]*font-style:italic)/);
  });

  it('hangs a numbered paragraph as the .docx numbering does: every line at the text column (u-7gdr)', () => {
    const worksheet = buildAcceptanceWorksheet();
    const html = worksheetClipboardHtml(worksheet, STUDENT_BI);
    const scheme = listIndentScheme(documentShape(worksheet));
    const hang = (indent: { left: number; hanging: number }) => `margin-left:${indent.left / 20}pt;text-indent:-${indent.hanging / 20}pt;`;
    expect(html).toContain(hang(scheme.question[0]));
    expect(html).toContain(hang(scheme.option));
    expect(html).toContain(hang(scheme.statement));
    // The marker's box is the hang's width, so the first line's text starts at `left` too.
    expect(html).toContain(`min-width:${scheme.question[0].hanging / 20}pt;text-indent:0">1.`);
    // The exam paper hangs on its own geometry (its "1." in a 24pt gutter).
    const paper1 = createWorksheetFrom({ documentType: 'paper1', seedSample: false });
    const one = { ...paper1, questions: worksheet.questions.slice(0, 1), flow: [{ type: 'question' as const, id: worksheet.questions[0].id }] };
    expect(documentShape(one)).toBe('paper1');
    expect(worksheetClipboardHtml(one, STUDENT_BI)).toContain(hang(PAPER1_LIST_INDENTS.question[0]));
  });

  it('honours the selected language and version mode', () => {
    const worksheet = buildAcceptanceWorksheet();

    const studentBi = worksheetClipboardHtml(worksheet, STUDENT_BI);
    expect(studentBi).not.toContain('Answer:');
    expect(studentBi).not.toContain('Demand shifts left.');

    const teacherEn = worksheetClipboardHtml(worksheet, TEACHER_EN);
    expect(teacherEn).toContain('Answer: C');
    expect(teacherEn).toContain('Demand shifts left.');
    expect(teacherEn).toContain('Teacher Version / 教師版');
    // EN-only: no zh translations.
    expect(teacherEn).not.toContain('價格上升');
  });

  it('carries the font pair so the paste lands in the worksheet fonts', () => {
    const worksheet = buildAcceptanceWorksheet();
    worksheet.fonts = { latin: 'Arial', eastAsia: 'Microsoft JhengHei' };
    const html = worksheetClipboardHtml(worksheet, STUDENT_BI);
    expect(html).toContain("font-family:'Arial','Microsoft JhengHei'");
  });

  it('copies a single question when scoped to one (§7.7)', () => {
    const worksheet = buildAcceptanceWorksheet();
    const target = worksheet.questions[1];

    const html = questionClipboardHtml(worksheet, target.id, STUDENT_BI);
    expect(html).toContain('GDP平減物價指數(GDP deflator)');
    expect(html).toContain('<table');
    // Content from other questions must not come along.
    expect(html).not.toContain('Which is a public good?');
  });

  it('pastes a question at the document text size, 11pt unless it sets one', () => {
    const worksheet = buildAcceptanceWorksheet();
    const id = worksheet.questions[0].id;
    const standard = questionClipboardHtml(worksheet, id, STUDENT_BI);
    expect(standard).toContain(',serif;font-size:11pt;');
    expect(standard).not.toContain(',serif;font-size:12pt;');
    worksheet.baseFontSize = 10;
    const qab = questionClipboardHtml(worksheet, id, STUDENT_BI);
    expect(qab).toContain(',serif;font-size:10pt;');
    expect(qab).not.toContain(',serif;font-size:11pt;');
  });

  it('escapes HTML metacharacters in content', () => {
    const worksheet = buildAcceptanceWorksheet();
    const block = worksheet.questions[0].blocks[0];
    if (block.kind === 'paragraph') {
      block.text.en = [{ text: 'If P < MC & Q > 0, then "profit" falls' }];
    }
    const html = worksheetClipboardHtml(worksheet, { language: 'en', version: 'student' });
    expect(html).toContain('P &lt; MC &amp; Q &gt; 0');
    expect(html).not.toContain('P < MC & Q > 0');
  });

  it('renders a hard line break as <br/>, since a raw newline is HTML whitespace', () => {
    const worksheet = buildAcceptanceWorksheet();
    const block = worksheet.questions[0].blocks[0];
    if (block.kind === 'paragraph') {
      block.text.en = [{ text: 'Before break\nAfter break' }];
    }
    const html = worksheetClipboardHtml(worksheet, { language: 'en', version: 'student' });
    expect(html).toContain('Before break<br/>After break');
  });

  it('keeps a break inside a formatted run wrapped by that formatting', () => {
    const worksheet = buildAcceptanceWorksheet();
    const block = worksheet.questions[0].blocks[0];
    if (block.kind === 'paragraph') {
      block.text.en = [{ text: 'Bold one\nbold two', bold: true }];
    }
    const html = worksheetClipboardHtml(worksheet, { language: 'en', version: 'student' });
    expect(html).toContain('<b>Bold one<br/>bold two</b>');
  });

  it('provides a plain-text fallback flavour', () => {
    const text = worksheetPlainText(buildAcceptanceWorksheet(), { language: 'en', version: 'student' });
    expect(text).toContain('1. What happens when demand falls?');
    expect(text).toContain('A. Price rises');
    // Tables become tab-separated rows.
    expect(text).toContain('Price ($)\tQuantity demanded\tQuantity supplied');
    expect(text).not.toContain('Answer:');
  });
});

describe('stacked fraction in Copy for Word (k-0479)', () => {
  it('stacks a fraction in the HTML and writes it linear in the plain text', async () => {
    const { fractionRuns } = await import('@/model/fraction');
    const worksheet = buildAcceptanceWorksheet();
    const stem = worksheet.questions
      .flatMap((question) => question.blocks)
      .find((block) => block.kind === 'paragraph' && block.text.en.some((run) => run.text.startsWith('What happens when demand falls')));
    if (!stem || stem.kind !== 'paragraph') throw new Error('fixture has no stem paragraph');
    stem.text.en = [
      { text: 'PED = ' },
      ...fractionRuns([{ text: 'ΔQ', bold: true }], [{ text: 'Q' }, { text: '1', vertAlign: 'subscript' }]),
    ];
    const html = worksheetClipboardHtml(worksheet, TEACHER_EN);
    expect(html).toContain('display:inline-block;vertical-align:middle;text-align:center');
    expect(html).toContain('border-bottom:1px solid currentColor;padding:0 2px"><b>ΔQ</b></span>');
    expect(html).toContain('<span style="display:block;padding:0 2px">Q<sub>1</sub></span>');
    expect(html).not.toContain('⁄');
    const text = worksheetPlainText(worksheet, TEACHER_EN);
    expect(text).toContain('PED = ΔQ/Q1');
    expect(text).not.toContain('⁄');
  });
});
