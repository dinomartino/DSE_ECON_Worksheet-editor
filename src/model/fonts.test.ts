import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildDocxParts, exportDocxBuffer } from '@/export/docx';
import { worksheetClipboardHtml } from '@/export/clipboard';
import { buildAcceptanceWorksheet } from '@/test/fixtures';
import { DEFAULT_FONTS, FONT_PRESETS } from './factories';
import { cssFontFamilies, eastAsiaFamilies } from './fonts';
import type { OutputMode } from './types';

const STUDENT_BI: OutputMode = { language: 'bilingual', version: 'student' };
const KAI = FONT_PRESETS.find((preset) => preset.label === 'Times New Roman / 標楷體')!;

describe('標楷體 font preset', () => {
  it('is offered as Times New Roman / DFKai-SB, leaving the default alone', () => {
    expect(KAI).toMatchObject({ latin: 'Times New Roman', eastAsia: 'DFKai-SB' });
    expect(DEFAULT_FONTS).toEqual({ latin: 'Times New Roman', eastAsia: 'PMingLiU' });
    expect(FONT_PRESETS[0]).toMatchObject(DEFAULT_FONTS);
  });

  it('exports exactly DFKai-SB as w:eastAsia in styles, runs and the font table', async () => {
    const worksheet = buildAcceptanceWorksheet();
    worksheet.fonts = { latin: KAI.latin, eastAsia: KAI.eastAsia };
    const expected = 'w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="DFKai-SB"';

    const parts = buildDocxParts(worksheet, STUDENT_BI);
    expect(parts.stylesXml).toContain(expected);
    expect(parts.documentXml).toContain(expected);
    expect(parts.fontTableXml).toContain('w:name="DFKai-SB"');
    // The browser stand-ins never reach Word.
    for (const xml of [parts.stylesXml, parts.documentXml, parts.fontTableXml]) {
      expect(xml).not.toMatch(/BiauKai|Kaiti|標楷體/);
    }

    const zip = await JSZip.loadAsync(await exportDocxBuffer(worksheet, STUDENT_BI));
    expect(await zip.file('word/document.xml')!.async('string')).toContain(expected);
  });

  it('gives the browser a Kai stack after the Word name', () => {
    expect(eastAsiaFamilies('DFKai-SB')).toEqual([
      'DFKai-SB',
      '標楷體',
      'BiauKai',
      'BiauKaiTC',
      'Kaiti TC',
      'STKaiti',
      'KaiTi',
    ]);
    expect(cssFontFamilies(KAI)).toBe(
      "'Times New Roman', 'DFKai-SB', '標楷體', 'BiauKai', 'BiauKaiTC', 'Kaiti TC', 'STKaiti', 'KaiTi'",
    );

    const worksheet = buildAcceptanceWorksheet();
    worksheet.fonts = { latin: KAI.latin, eastAsia: KAI.eastAsia };
    expect(worksheetClipboardHtml(worksheet, STUDENT_BI)).toContain(
      "font-family:'Times New Roman','DFKai-SB','標楷體','BiauKai','BiauKaiTC','Kaiti TC','STKaiti','KaiTi',serif;",
    );
  });

  it('leaves every other preset’s CSS exactly as it was', () => {
    for (const preset of FONT_PRESETS.filter((p) => p !== KAI)) {
      expect(cssFontFamilies(preset)).toBe(`'${preset.latin}', '${preset.eastAsia}'`);
      expect(cssFontFamilies(preset, "'", ',')).toBe(`'${preset.latin}','${preset.eastAsia}'`);
      expect(cssFontFamilies(preset, '')).toBe(`${preset.latin}, ${preset.eastAsia}`);
    }
  });
});
