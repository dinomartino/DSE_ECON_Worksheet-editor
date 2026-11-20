import fs from 'node:fs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { exportDocxBuffer } from '.';
import { richTextRuns } from './runs';
import { buildAcceptanceWorksheet } from '@/test/fixtures';
import { fractionRuns } from '@/model/fraction';
import type { FontPair, InlineRun, OutputMode } from '@/model/types';

const FONTS: FontPair = { latin: 'Arial', eastAsia: 'MingLiU' };
const EN: OutputMode = { language: 'bilingual', version: 'student' };

describe('stacked fraction in the .docx (k-0479)', () => {
  it('writes ΔQ over Q as Office Math between ordinary runs', () => {
    const runs: InlineRun[] = [{ text: 'PED = ' }, ...fractionRuns([{ text: 'ΔQ' }], [{ text: 'Q' }]), { text: ' end' }];
    const xml = richTextRuns(runs, FONTS);
    expect(xml).toMatch(/^<w:r><w:rPr>.*<w:t xml:space="preserve">PED = <\/w:t><\/w:r><m:oMath><m:f>/);
    expect(xml).toContain('<m:num><m:r><m:rPr><m:nor/></m:rPr><w:rPr>');
    expect(xml).toContain('<m:t xml:space="preserve">ΔQ</m:t></m:r></m:num>');
    expect(xml).toContain('<m:den><m:r><m:rPr><m:nor/></m:rPr><w:rPr>');
    expect(xml).toContain('<m:t xml:space="preserve">Q</m:t></m:r></m:den></m:f></m:oMath><w:r>');
    expect(xml).not.toContain('⁄');
  });

  it('puts a subscript inside a part into m:sSub on the character before it', () => {
    const num: InlineRun[] = [{ text: 'Q' }, { text: '2', vertAlign: 'subscript' }, { text: ' − Q' }, { text: '1', vertAlign: 'subscript' }];
    const xml = richTextRuns(fractionRuns(num, [{ text: 'Q' }, { text: '1', vertAlign: 'subscript' }]), FONTS);
    expect(xml).toContain('<m:sSub><m:e><m:r>');
    expect(xml).toContain('<m:t xml:space="preserve">Q</m:t></m:r></m:e><m:sub><m:r>');
    expect(xml).toContain('<m:t xml:space="preserve">2</m:t></m:r></m:sub></m:sSub>');
    expect(xml).not.toContain('w:vertAlign');
  });

  it('keeps bold and the run size inside the math run', () => {
    const xml = richTextRuns(fractionRuns([{ text: 'ΔP', bold: true, fontSize: 14 }], [{ text: 'P' }]), FONTS);
    expect(xml).toContain('<w:b/><w:bCs/><w:sz w:val="28"/>');
  });

  it('leaves text without a fraction byte-identical', () => {
    const runs: InlineRun[] = [{ text: 'Plain ' }, { text: 'bold', bold: true }, { text: '2', vertAlign: 'superscript' }];
    const xml = richTextRuns(runs, FONTS);
    expect(xml).not.toContain('<m:');
    expect(xml.match(/<w:r>/g)).toHaveLength(3);
  });

  it('gives only a paragraph with a fraction an atLeast line', async () => {
    const worksheet = buildAcceptanceWorksheet();
    const stem = worksheet.questions
      .flatMap((question) => question.blocks)
      .find((block) => block.kind === 'paragraph' && block.text.en.some((run) => run.text.startsWith('What happens when demand falls')));
    if (!stem || stem.kind !== 'paragraph') throw new Error('fixture has no stem paragraph');
    const before = await (await JSZip.loadAsync(await exportDocxBuffer(worksheet, EN))).file('word/document.xml')!.async('string');
    expect(before).not.toContain('w:lineRule="atLeast"');

    stem.text.en = [{ text: 'PED = ' }, ...fractionRuns([{ text: 'Q' }, { text: '2', vertAlign: 'subscript' }, { text: ' − Q' }, { text: '1', vertAlign: 'subscript', bold: true }], [{ text: 'Q' }, { text: '1', vertAlign: 'subscript' }]), { text: ' = ' }, ...fractionRuns([{ text: 'ΔQ' }], [{ text: 'Q' }])];
    const bytes = await exportDocxBuffer(worksheet, EN);
    const document = await (await JSZip.loadAsync(bytes)).file('word/document.xml')!.async('string');
    expect(document.match(/w:lineRule="atLeast"/g)).toHaveLength(1);
    expect(document).toMatch(/<w:spacing[^>]*w:line="240" w:lineRule="atLeast"\/><\/w:pPr>(?:(?!<\/w:p>)[\s\S])*<m:oMath>/);

    if (process.env.K0479_OUT) {
      fs.mkdirSync('/tmp/k0479', { recursive: true });
      fs.writeFileSync('/tmp/k0479/fraction.docx', bytes);
    }
  });
});
