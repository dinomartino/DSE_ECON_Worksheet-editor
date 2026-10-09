import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { createMcqQuestion, createWorksheet } from '@/model/factories';
import { createLabelListElement } from '@/model/flow';
import { contentWidth, pageSetupOf } from '@/model/page';
import { bi } from '@/model/text';
import type { LayoutElement, McqQuestion, OutputMode, Worksheet } from '@/model/types';
import { withFlow } from '@/test/fixtures';
import { worksheetClipboardHtml, worksheetPlainText } from './clipboard';
import { exportDocxBuffer } from './docx';

/**
 * Side-by-side rows (inline and two-column MC options, label lists) paste as the `.docx`
 * writes them (§ ColumnsNode): one paragraph with tab stops, never a table. Rows reduce
 * to `[stops]text⇥text`, stops in twips, so the clipboard and the `.docx` compare directly.
 */
const EN: OutputMode = { language: 'en', version: 'student' };

function mcq(layout: McqQuestion['optionLayout'], words: string[]): McqQuestion {
  const question = createMcqQuestion();
  question.optionLayout = layout;
  question.options = question.options.map((option, index) => ({ ...option, text: bi(words[index], '') }));
  return question;
}

function labelList(rows: Array<[string, string]>, shape: { valueAt?: number; indent?: number; hanging?: number }): LayoutElement {
  const element = createLabelListElement(rows.length) as Extract<LayoutElement, { kind: 'labelList' }>;
  element.rows = element.rows.map((row, index) => ({
    ...row,
    label: bi(rows[index][0], ''),
    value: bi(rows[index][1], ''),
  }));
  return { ...element, ...shape };
}

const fixture = (): Worksheet =>
  withFlow(createWorksheet(), [
    mcq('inline', ['Alpha', 'Beta', 'Gamma', 'Delta']),
    mcq('columns2', ['North', 'South', 'East', 'West']),
    labelList([['Price:', 'Rises'], ['Output:', 'Falls']], { valueAt: 0.4 }),
    labelList([['(1)', 'Answer all questions.'], ['(2)', 'Write in ink.']], { indent: 720, hanging: 360 }),
  ]);

/** Each tab-row paragraph as `[left 1234][…]text⇥text`, stops in twips. */
function clipboardRows(html: string): string[] {
  return [...html.matchAll(/<p style="([^"]*tab-stops:[^"]*)">(.*?)<\/p>/g)].map(([, style, body]) => {
    const stops = (/tab-stops:([^;]*);/.exec(style)?.[1] ?? '')
      .split(' ')
      .reduce<string[]>((out, word) => {
        if (word === 'center' || word === 'right') return [...out, word];
        if (!word) return out;
        const twips = Math.round(parseFloat(word) * 20);
        const last = out[out.length - 1];
        return last === 'center' || last === 'right'
          ? [...out.slice(0, -1), `[${last} ${twips}]`]
          : [...out, `[left ${twips}]`];
      }, [])
      .join('');
    const text = body
      .replace(/<span style='mso-tab-count:1'>.*?<\/span>/g, '⇥')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ');
    return stops + text;
  });
}

/** The same skeleton of every `.docx` body paragraph. */
async function docxRows(worksheet: Worksheet): Promise<string[]> {
  const zip = await JSZip.loadAsync(await exportDocxBuffer(worksheet, EN));
  const xml = await zip.file('word/document.xml')!.async('string');
  return xml
    .replace(/<w:tab w:val="(\w+)" w:pos="(\d+)"\/>/g, '[$1 $2]')
    .replace(/<w:tab\/>/g, '⇥')
    .replace(/<\/w:p>/g, '¶')
    .replace(/<[^>]+>/g, '')
    .split('¶')
    .map((line) => line.trim());
}

describe('side-by-side rows on the clipboard', () => {
  it('pastes MC options and label lists as tab-stop paragraphs, never a table', () => {
    const html = worksheetClipboardHtml(fixture(), EN);
    expect(html).not.toContain('<table');
    expect(html).not.toContain('<td');
    const rows = clipboardRows(html);
    expect(rows.map((row) => row.replace(/\[[^\]]*\]/g, ''))).toEqual([
      'A. Alpha⇥B. Beta⇥C. Gamma⇥D. Delta',
      'A. North⇥B. South',
      'C. East⇥D. West',
      'Price:⇥Rises',
      'Output:⇥Falls',
      '(1)⇥Answer all questions.',
      '(2)⇥Write in ink.',
    ]);
  });

  it('places every stop where the .docx does', async () => {
    const worksheet = fixture();
    const rows = clipboardRows(worksheetClipboardHtml(worksheet, EN));
    const docx = await docxRows(worksheet);
    for (const row of rows) expect(docx).toContain(row);

    // And the positions themselves, from the content width after the row's indent.
    const width = contentWidth(pageSetupOf(worksheet));
    const at = (indent: number, fraction: number) => Math.round(indent + fraction * (width - indent));
    expect(rows[0]).toBe(
      `[left ${at(480, 0.25)}][left ${at(480, 0.5)}][left ${at(480, 0.75)}]` +
        'A. Alpha⇥B. Beta⇥C. Gamma⇥D. Delta',
    );
    expect(rows[1]).toBe(`[left ${at(480, 0.5)}]A. North⇥B. South`);
    expect(rows[3]).toBe(`[left ${at(480, 0.4)}]Price:⇥Rises`);
    // Hung: the value's stop is the indent itself, the label pulled back into the hang.
    expect(rows[5]).toBe('[left 720](1)⇥Answer all questions.');
  });

  it('hangs a hung list as the .docx indents it', () => {
    const html = worksheetClipboardHtml(fixture(), EN);
    expect(html).toMatch(/<p style="[^"]*margin-left:36pt;text-indent:-18pt;tab-stops:36pt;/);
    // The start screen's thumbnail cannot lay out tab stops; it sizes cells by these.
    expect(html).toContain('<span style="--w:18pt;--x:-18pt;">(1)</span>');
    expect(html).toContain('<span style="--w:25.000%;">A.&nbsp;Alpha</span>');
  });

  it('writes plain text with the same tabs', () => {
    const text = worksheetPlainText(fixture(), EN);
    expect(text).toContain('A. Alpha\tB. Beta\tC. Gamma\tD. Delta');
    expect(text).toContain('A. North\tB. South');
    expect(text).toContain('Price:\tRises');
    expect(text).toContain('(1)\tAnswer all questions.');
  });
});
