import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildDocxParts, exportDocxBuffer } from '@/export/docx';
import { worksheetClipboardHtml } from '@/export/clipboard';
import { buildAcceptanceWorksheet } from '@/test/fixtures';
import { DEFAULT_FONTS, FONT_PRESETS } from './factories';
import { useWorksheetStore } from '@/store/worksheetStore';
import { FIXED_LINE_TWIPS } from '@/export/docx/styles';
import { bodyTextSizeOf, cssFontFamilies, eastAsiaFamilies, withBodyTextSize } from './fonts';
import { migrate, serializeWorksheet } from './migrations';
import { createWorksheetFrom, QAB_BASE_FONT_SIZE } from './newWorksheet';
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

describe('the document text size (10 / 11 / 12 pt)', () => {
  it('stores 10 and 12, and 11 as absence', () => {
    const plain = buildAcceptanceWorksheet();
    expect(bodyTextSizeOf(plain)).toBe(11);
    const twelve = withBodyTextSize(plain, 12);
    expect(twelve.baseFontSize).toBe(12);
    expect(withBodyTextSize(plain, 10).baseFontSize).toBe(10);
    const back = withBodyTextSize(twelve, 11);
    expect('baseFontSize' in back).toBe(false);
    expect(JSON.stringify(serializeWorksheet(back))).toBe(JSON.stringify(serializeWorksheet(plain)));
    // A no-op hands back the same object, so no undo step is recorded.
    expect(withBodyTextSize(plain, 11)).toBe(plain);
    expect(withBodyTextSize(twelve, 12)).toBe(twelve);
  });

  it('leaves the seeded defaults alone', () => {
    expect(createWorksheetFrom({ documentType: 'lqMock' }).baseFontSize).toBe(QAB_BASE_FONT_SIZE);
    expect(createWorksheetFrom({}).baseFontSize).toBeUndefined();
  });

  it('survives a save and reload', () => {
    const twelve = withBodyTextSize(buildAcceptanceWorksheet(), 12);
    expect(migrate(JSON.parse(JSON.stringify(serializeWorksheet(twelve)))).baseFontSize).toBe(12);
  });

  it('is one undo step', () => {
    useWorksheetStore.setState({ worksheet: buildAcceptanceWorksheet(), past: [], future: [], dirty: false });
    const store = () => useWorksheetStore.getState();
    store().commit((draft) => withBodyTextSize(draft, 12));
    expect(store().worksheet.baseFontSize).toBe(12);
    expect(store().past).toHaveLength(1);
    store().commit((draft) => withBodyTextSize(draft, 12));
    expect(store().past).toHaveLength(1);
    store().undo();
    expect(store().worksheet.baseFontSize).toBeUndefined();
    expect(store().canUndo()).toBe(false);
  });

  it('exports 12pt body styles on the unchanged 240-twip line', () => {
    const styles = buildDocxParts(withBodyTextSize(buildAcceptanceWorksheet(), 12), STUDENT_BI).stylesXml;
    expect(styles).toContain('<w:sz w:val="24"/><w:szCs w:val="24"/>');
    for (const id of ['Normal', 'QuestionStem', 'MCQOption', 'Subquestion']) {
      const style = styles.match(new RegExp(`<w:style w:type="paragraph"(?: w:default="1")? w:styleId="${id}">[\\s\\S]*?</w:style>`));
      expect(style![0]).toContain(`w:line="${FIXED_LINE_TWIPS}" w:lineRule="exact"`);
      expect(style![0]).toContain('<w:sz w:val="24"/>');
    }
    // The display styles keep their own sizes.
    const title = styles.match(/<w:style w:type="paragraph" w:styleId="WorksheetTitle">[\s\S]*?<\/w:style>/);
    expect(title![0]).toContain('<w:sz w:val="32"/>');
  });
});
