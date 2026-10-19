/**
 * The cover's "For examiner's use" marks grid (§ `CoverPage.examinerGrid`).
 *
 * Only a switch is stored; the numbers and marks are derived from the questions on every
 * render. What these pin: the packing wraps a long paper into bands that fit the column,
 * the grid totals what the paper totals ("answer any ONE" counts once), both backends
 * see one IR, a cover without the switch exports exactly as before, and the switch
 * survives a save without raising the schema mark.
 */
import { describe, expect, it } from 'vitest';
import { withFlow } from '@/test/fixtures';
import { buildDocxParts } from '@/export/docx';
import { renderWorksheet } from '@/render/worksheet';
import { parseWorksheet, stringifyWorksheet } from '@/storage';
import {
  COVER_GRID,
  COVER_PANEL,
  createCoverPage,
  examinerGridBands,
  examinerGridWidth,
} from './cover';
import { createMcqQuestion, createParagraphBlock, createStructuredQuestion, createWorksheet, newId } from './factories';
import { createSectionElement } from './flow';
import { worksheetMarks } from './marks';
import { serializeWorksheet } from './migrations';
import { bi, plain } from './text';
import type { CoverPaperStyle } from './coverTypes';
import type { LanguageMode, LayoutElement, OutputMode, StructuredQuestion, Worksheet } from './types';

type Section = Extract<LayoutElement, { kind: 'section' }>;

const mode = (language: LanguageMode = 'en', version: OutputMode['version'] = 'student'): OutputMode => ({
  language,
  version,
});

function lq(marks: number, answer = ''): StructuredQuestion {
  const question = createStructuredQuestion();
  question.blocks = [createParagraphBlock(bi('A market.', '一個市場。'))];
  question.parts = [
    {
      id: newId(),
      blocks: [createParagraphBlock(bi('Explain.', '解釋。'))],
      marks,
      ...(answer ? { answer: bi(answer, answer) } : {}),
    },
  ];
  return question;
}

function paper(style: CoverPaperStyle, marks: number[], grid = true): Worksheet {
  const worksheet = createWorksheet();
  worksheet.cover = { ...createCoverPage({ paperStyle: style }), ...(grid ? { examinerGrid: true } : {}) };
  worksheet.questions = marks.map((value) => {
    if (style === 'writeIn') return lq(value);
    const question = createMcqQuestion();
    question.marks = value;
    return question;
  });
  return worksheet;
}

const A4_TEXT = 9026;
/** The panel column as printed on A4 at 1 inch (`fitCoverColumns`). */
const PANEL = { left: 5328, gap: 144, right: 3554 };

describe('examinerGridBands', () => {
  const fits = (sizes: number[], width: number) =>
    sizes.every((size, index) => {
      const total = index === sizes.length - 1 ? COVER_GRID.totalWidth : 0;
      return COVER_GRID.labelWidth + size * COVER_GRID.cellWidth + total <= width;
    });

  it('keeps a short paper in one band', () => {
    expect(examinerGridBands(6, A4_TEXT)).toEqual([6]);
    expect(examinerGridBands(0, A4_TEXT)).toEqual([0]);
  });

  it('wraps a long paper into balanced bands that fit the column', () => {
    // 45 MCQs (a DSE Paper 1) across a full page: two bands, the Total closing the last.
    expect(examinerGridBands(45, A4_TEXT)).toEqual([23, 22]);
    const panel = examinerGridWidth(PANEL, A4_TEXT, true);
    expect(panel).toBe(PANEL.right - COVER_PANEL.indent - COVER_GRID.previewGutter);
    expect(examinerGridBands(10, panel)).toEqual([4, 3, 3]);
    // The Total never stands alone in its band while a question could join it.
    expect(examinerGridBands(20, panel)).toEqual([5, 4, 4, 4, 3]);
    expect(examinerGridBands(16, panel)).toEqual([5, 4, 4, 3]);
    for (const count of [1, 3, 7, 12, 19, 33, 60]) {
      for (const width of [panel, A4_TEXT, 4000]) {
        const sizes = examinerGridBands(count, width);
        expect(sizes.reduce((sum, size) => sum + size, 0), `${count} @ ${width}`).toBe(count);
        expect(fits(sizes, width), `${count} @ ${width}: ${sizes}`).toBe(true);
        if (count > 0) expect(sizes.at(-1), `${count} @ ${width}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('the examiner’s grid in the IR', () => {
  it('prints nothing unless the cover asks for it', () => {
    expect(renderWorksheet(paper('writeIn', [6, 8], false), mode()).cover?.examinerGrid).toBeUndefined();
  });

  it('derives each number and full mark, and the paper total', () => {
    const grid = renderWorksheet(paper('writeIn', [6, 8, 10]), mode()).cover!.examinerGrid!;
    expect(grid.placement).toBe('panel');
    expect(grid.indent).toBe(COVER_PANEL.indent);
    expect(grid.bands[0].rows.map((row) => plain(row.cells[0].text.en))).toEqual([
      'Question No.',
      'Full marks',
      'Marks',
    ]);
    // Read the bands back as one sequence: numbers 1–3, marks 6/8/10, Total 24.
    const numbers = grid.bands.flatMap((band) => band.rows[0].cells.slice(1).map((cell) => plain(cell.text.en)));
    const full = grid.bands.flatMap((band) => band.rows[1].cells.slice(1).map((cell) => plain(cell.text.en)));
    expect(numbers).toEqual(['1', '2', '3', 'Total']);
    expect(full).toEqual(['6', '8', '10', '24']);
    // The marker's row is empty boxes, and no cell is editable: every number is derived.
    for (const band of grid.bands) {
      expect(band.rows[2].cells.slice(1).every((cell) => plain(cell.text.en) === '')).toBe(true);
      expect(band.rows.flatMap((row) => row.cells).every((cell) => cell.edit === undefined)).toBe(true);
      expect(band.rows.every((row) => row.cells.length === band.columns.length)).toBe(true);
    }
  });

  it('follows a re-marked question without anything stored changing', () => {
    const worksheet = paper('writeIn', [6, 8]);
    (worksheet.questions[1] as StructuredQuestion).parts[0].marks = 12;
    const grid = renderWorksheet(worksheet, mode()).cover!.examinerGrid!;
    const full = grid.bands.flatMap((band) => band.rows[1].cells.slice(1).map((cell) => plain(cell.text.en)));
    expect(full).toEqual(['6', '12', '18']);
  });

  it('totals an “answer any ONE” section as the paper does', () => {
    const a = createSectionElement(bi('Section A', '甲部'));
    const b: Section = { ...createSectionElement(bi('Section B', '乙部')), answerCount: 1 };
    const worksheet = withFlow(createWorksheet(), [a, lq(6), lq(8), b, lq(10), lq(12)], { replaceLayout: true });
    worksheet.cover = { ...createCoverPage({ paperStyle: 'writeIn' }), examinerGrid: true };
    const grid = renderWorksheet(worksheet, mode()).cover!.examinerGrid!;
    const last = grid.bands.at(-1)!;
    expect(plain(last.rows[1].cells.at(-1)!.text.en)).toBe(String(worksheetMarks(worksheet)));
    expect(worksheetMarks(worksheet)).toBe(26);
  });

  it('follows the instructions on a cover with no panel, full width', () => {
    const grid = renderWorksheet(paper('mcq', Array(45).fill(1)), mode()).cover!.examinerGrid!;
    expect(grid.placement).toBe('main');
    expect(grid.indent).toBe(0);
    expect(grid.bands.map((band) => band.columns.length - 1)).toEqual([23, 23]);
  });

  it('prints labels in the document’s language, numbers once in bilingual', () => {
    const zh = renderWorksheet(paper('writeIn', [6]), mode('zh')).cover!.examinerGrid!;
    const heading = zh.heading.at(-1)!;
    expect(heading.kind === 'text' ? plain(heading.text.zh) : '').toBe('閱卷員專用');
    expect(zh.bands[0].rows.map((row) => plain(row.cells[0].text.zh))).toEqual(['題號', '滿分', '得分']);

    const both = renderWorksheet(paper('writeIn', [6]), mode('bilingual')).cover!.examinerGrid!;
    const number = both.bands[0].rows[0].cells[1];
    expect(plain(number.text.en)).toBe('1');
    expect(number.text.zh).toEqual([]);
    // Bilingual labels stack two lines, so their rows are two lines tall.
    expect(both.bands[0].rows[0].height).toBe(2 * COVER_GRID.lineRowHeight);
  });
});

describe('the examiner’s grid in the .docx', () => {
  const coverXmlOf = (worksheet: Worksheet, output = mode()) => {
    const document = buildDocxParts(worksheet, output).documentXml;
    // The cover ends at its nextPage section break.
    return document.slice(0, document.indexOf('<w:type w:val="nextPage"/>'));
  };

  it('is a ruled table in the right column, at the IR’s widths', () => {
    const worksheet = paper('writeIn', [6, 8, 10]);
    const cover = coverXmlOf(worksheet);
    const right = cover.slice(cover.indexOf('<w:br w:type="column"/>'));
    expect(right).toContain('For examiner’s use only');
    expect(right).toContain('Question No.');
    expect(right).toContain(`<w:gridCol w:w="${COVER_GRID.labelWidth}"/>`);
    expect(right).toContain(`<w:gridCol w:w="${COVER_GRID.totalWidth}"/>`);
    expect(right).toContain(`<w:tblInd w:w="${COVER_PANEL.indent}" w:type="dxa"/>`);
    expect(right).toContain(`<w:trHeight w:val="${COVER_GRID.boxHeight}" w:hRule="atLeast"/>`);
    // The total is the paper's.
    expect(right).toContain('>24<');
  });

  it('follows the instructions on a one-column cover', () => {
    const cover = coverXmlOf(paper('mcq', [1, 1, 1]));
    expect(cover).not.toContain('<w:br w:type="column"/>');
    expect(cover).toContain('For examiner’s use only');
  });

  it('leaves a cover without the switch exactly as it was', () => {
    const off = paper('writeIn', [6, 8], false);
    const explicit: Worksheet = { ...off, cover: { ...off.cover!, examinerGrid: false } };
    const xml = buildDocxParts(off, mode()).documentXml;
    expect(xml).not.toContain('examiner');
    expect(buildDocxParts(explicit, mode()).documentXml).toBe(xml);
  });

  it('carries nothing from the teacher copy onto the student copy', () => {
    const worksheet = paper('writeIn', [6]);
    worksheet.questions = [lq(6, 'SECRET-MODEL-ANSWER')];
    const student = coverXmlOf(worksheet, mode('en', 'student'));
    const teacher = coverXmlOf(worksheet, mode('en', 'teacher'));
    expect(student).not.toContain('SECRET-MODEL-ANSWER');
    // The grid itself is the same on both copies: it holds no teacher content.
    const grid = (xml: string) => xml.slice(xml.indexOf('For examiner'));
    expect(grid(student)).toBe(grid(teacher));
  });
});

describe('storing the switch', () => {
  it('survives a save and reload, and keeps the document at schema 1', () => {
    const worksheet = paper('writeIn', [6, 8]);
    const reopened = parseWorksheet(stringifyWorksheet(worksheet));
    expect(reopened.cover?.examinerGrid).toBe(true);
    // An older build keeps the key (the cover is passed through whole) and simply
    // prints no grid — nothing typed is lost and nothing mis-prints, so no bump.
    expect(serializeWorksheet(worksheet).schemaVersion).toBe(1);
  });
});
