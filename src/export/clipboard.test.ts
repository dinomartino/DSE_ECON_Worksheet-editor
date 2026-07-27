import { describe, expect, it } from 'vitest';
import type { OutputMode } from '@/model/types';
import { buildAcceptanceWorksheet } from '@/test/fixtures';
import { questionClipboardHtml, worksheetClipboardHtml, worksheetPlainText } from './clipboard';

const STUDENT_BI: OutputMode = { language: 'bilingual', version: 'student' };
const TEACHER_EN: OutputMode = { language: 'en', version: 'teacher' };

describe('Copy for Word (§7.7, §11.12)', () => {
  it('renders tables as real HTML tables with merges and borders', () => {
    const html = worksheetClipboardHtml(buildAcceptanceWorksheet(), STUDENT_BI);

    expect(html).toContain('<table');
    expect(html).toContain('border-collapse:collapse');
    expect(html).toContain('<th');
    expect(html).toContain('colspan="2"');
    expect(html).toContain('Quantity demanded');
    expect(html).toContain('需求量');
  });

  it('inlines images as data URIs so the paste carries the picture', () => {
    const html = worksheetClipboardHtml(buildAcceptanceWorksheet(), STUDENT_BI);
    expect(html).toContain('<img src="data:image/png;base64,');
    expect(html).toContain('alt="Demand curve diagram"');
  });

  it('writes numbering as literal text, which clipboard HTML cannot express natively', () => {
    const html = worksheetClipboardHtml(buildAcceptanceWorksheet(), STUDENT_BI);
    expect(html).toContain('1.&nbsp;');
    expect(html).toContain('A.&nbsp;');
    expect(html).toContain('(1)&nbsp;');
    expect(html).toContain('(a)&nbsp;');
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
    const target = worksheet.sections[0].questions[1];

    const html = questionClipboardHtml(worksheet, target.id, STUDENT_BI);
    expect(html).toContain('GDP平減物價指數(GDP deflator)');
    expect(html).toContain('<table');
    // Content from other questions must not come along.
    expect(html).not.toContain('Which is a public good?');
  });

  it('escapes HTML metacharacters in content', () => {
    const worksheet = buildAcceptanceWorksheet();
    const block = worksheet.sections[0].questions[0].blocks[0];
    if (block.kind === 'paragraph') {
      block.text.en = [{ text: 'If P < MC & Q > 0, then "profit" falls' }];
    }
    const html = worksheetClipboardHtml(worksheet, { language: 'en', version: 'student' });
    expect(html).toContain('P &lt; MC &amp; Q &gt; 0');
    expect(html).not.toContain('P < MC & Q > 0');
  });

  it('renders a hard line break as <br/>, since a raw newline is HTML whitespace', () => {
    const worksheet = buildAcceptanceWorksheet();
    const block = worksheet.sections[0].questions[0].blocks[0];
    if (block.kind === 'paragraph') {
      block.text.en = [{ text: 'Before break\nAfter break' }];
    }
    const html = worksheetClipboardHtml(worksheet, { language: 'en', version: 'student' });
    expect(html).toContain('Before break<br/>After break');
  });

  it('keeps a break inside a formatted run wrapped by that formatting', () => {
    const worksheet = buildAcceptanceWorksheet();
    const block = worksheet.sections[0].questions[0].blocks[0];
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
