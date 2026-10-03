import { describe, expect, it } from 'vitest';
import {
  createQabFurniture,
  FURNITURE_GEOMETRY,
  marginNoteSetting,
  marginNoteSides,
  QAB_MARGINS,
} from '@/model/pageFurniture';
import { bi } from '@/model/text';
import type { LanguageMode } from '@/model/types';
import { furnitureHeaderXml } from './furniture';

const FONTS = { latin: 'Times New Roman', eastAsia: 'PMingLiU' };
const EMU = 635;
const xml = (language: LanguageMode) =>
  furnitureHeaderXml(createQabFurniture(), 11906, 16838, QAB_MARGINS, FONTS, language);

/** The textbox body of one named note. */
const noteBody = (header: string, name: string) => {
  const at = header.indexOf(`name="${name}"`);
  return header.slice(at, header.indexOf('</wp:anchor>', at));
};

describe('margin note sides', () => {
  const note = createQabFurniture().marginNote!;

  it('prints one side per language, both in bilingual unless they read the same', () => {
    expect(marginNoteSides(note, 'en')).toEqual(['en']);
    expect(marginNoteSides(note, 'zh')).toEqual(['zh']);
    expect(marginNoteSides(note, 'bilingual')).toEqual(['en', 'zh']);
    expect(marginNoteSides(bi('Same', 'Same'), 'bilingual')).toEqual(['en']);
    // An empty side falls back to the other, as the preview always did.
    expect(marginNoteSides(bi('', '只有中文'), 'en')).toEqual(['zh']);
  });

  it('stacks a bilingual note, sets a Chinese one upright', () => {
    expect(marginNoteSetting(['en', 'zh'], 'bilingual')).toEqual({ verticalNote: false, stackedNote: true });
    expect(marginNoteSetting(['zh'], 'zh')).toEqual({ verticalNote: true, stackedNote: false });
    expect(marginNoteSetting(['en'], 'en')).toEqual({ verticalNote: false, stackedNote: false });
  });
});

describe('margin note in the .docx', () => {
  it('stacks EN over 中文 in a strip wide enough for both lines', () => {
    const header = xml('bilingual');
    const left = noteBody(header, 'Margin note left');
    expect(left).toContain(`cx="${FURNITURE_GEOMETRY.noteWidthStacked * EMU}"`);
    expect(left).toMatch(/will not be marked\.<\/w:t><\/w:r><w:r><w:br\/><\/w:r>.*寫於邊界以外的答案/);
    expect(left).toContain('vert="vert270"');
  });

  it('prints the bottom note as one line, the two sides side by side', () => {
    const bottom = noteBody(xml('bilingual'), 'Margin note bottom');
    expect(bottom).toContain('寫於邊界以外的答案');
    expect(bottom).not.toContain('<w:br/>');
  });

  it('leaves single-language notes as they were', () => {
    const en = xml('en');
    expect(noteBody(en, 'Margin note left')).toContain(`cx="${FURNITURE_GEOMETRY.noteWidth * EMU}"`);
    expect(en).not.toContain('寫於');
    const zh = xml('zh');
    expect(noteBody(zh, 'Margin note left')).toContain('vert="eaVert"');
    expect(zh).not.toContain('will not be marked');
  });
});
