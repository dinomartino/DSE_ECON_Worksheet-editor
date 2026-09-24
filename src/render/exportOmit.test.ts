import { describe, expect, it } from 'vitest';
import { createAnswerLinesElement, createAnswerSpaceElement } from '@/model/flow';
import { createWorksheetFrom } from '@/model/newWorksheet';
import type { OutputMode, Worksheet } from '@/model/types';
import { buildDocxParts } from '@/export/docx';
import { ANSWER_LINE_STYLE_ID, LQ_ANSWER_LINE_STYLE_ID } from '@/export/docx/styles';
import { omittableParts, paperMode } from '@/components/editor/exportSession';
import { renderWorksheet } from './worksheet';

/** The export dialog's "Include" toggles: `OutputMode.omitCover` / `omitAnswerSpace`. */

const STUDENT: OutputMode = { language: 'en', version: 'student' };

/** The QAB mock (cover + per-part answer space), plus a fill element and ruled lines. */
function booklet(): Worksheet {
  const worksheet = createWorksheetFrom({ documentType: 'lqMock' });
  const fill = createAnswerSpaceElement(20, true);
  const ruled = createAnswerLinesElement(4);
  worksheet.layout = [...worksheet.layout, fill, ruled];
  worksheet.flow = [
    ...worksheet.flow,
    { type: 'layout', id: fill.id },
    { type: 'layout', id: ruled.id },
  ];
  return worksheet;
}

const kinds = (worksheet: Worksheet, mode: OutputMode) =>
  renderWorksheet(worksheet, mode).items.flatMap((item) =>
    (item.type === 'question' ? item.question.nodes : item.layout.nodes).map((node) => node.kind),
  );

describe('export omissions', () => {
  it('omitCover drops the cover and nothing else', () => {
    const worksheet = booklet();
    const full = renderWorksheet(worksheet, STUDENT);
    const bare = renderWorksheet(worksheet, { ...STUDENT, omitCover: true });
    expect(full.cover).toBeDefined();
    expect(bare.cover).toBeUndefined();
    expect(kinds(worksheet, { ...STUDENT, omitCover: true })).toEqual(kinds(worksheet, STUDENT));
  });

  it('omitAnswerSpace drops dotted space, fill elements and ruled lines', () => {
    const worksheet = booklet();
    const full = kinds(worksheet, STUDENT);
    expect(full).toContain('answerSpace');
    expect(full).toContain('answerLines');

    const mode = { ...STUDENT, omitAnswerSpace: true };
    const bare = kinds(worksheet, mode);
    expect(bare).not.toContain('answerSpace');
    expect(bare).not.toContain('answerLines');
    // Only writing room goes: every other node survives, in order.
    expect(bare).toEqual(full.filter((kind) => kind !== 'answerSpace' && kind !== 'answerLines'));
    // The flow elements are gone as items, so no fill is left to end a sheet.
    const rendered = renderWorksheet(worksheet, mode);
    const layoutIds = rendered.items.flatMap((item) =>
      item.type === 'layout' ? [item.layout.elementId] : [],
    );
    for (const element of worksheet.layout) {
      if (element.kind === 'answerSpace' || element.kind === 'answerLines') {
        expect(layoutIds).not.toContain(element.id);
      }
    }
    expect(renderWorksheet(worksheet, mode).cover).toBeDefined();
  });

  it('reaches the .docx: no cover section, no answer-line paragraphs or styles', () => {
    const worksheet = booklet();
    const full = buildDocxParts(worksheet, STUDENT);
    expect(full.documentXml).toContain('w:equalWidth="0"');
    expect(full.documentXml).toContain(LQ_ANSWER_LINE_STYLE_ID);
    expect(full.documentXml).toContain(`w:val="${ANSWER_LINE_STYLE_ID}"`);

    const noCover = buildDocxParts(worksheet, { ...STUDENT, omitCover: true });
    expect(noCover.documentXml).not.toContain('w:equalWidth="0"');
    expect(noCover.headerFooter.footerCover).toBeUndefined();

    const noSpace = buildDocxParts(worksheet, { ...STUDENT, omitAnswerSpace: true });
    expect(noSpace.documentXml).not.toContain(LQ_ANSWER_LINE_STYLE_ID);
    expect(noSpace.documentXml).not.toContain(`w:val="${ANSWER_LINE_STYLE_ID}"`);
    expect(noSpace.stylesXml).not.toContain(LQ_ANSWER_LINE_STYLE_ID);
  });

  it('the dialog sets a flag only when a box is unticked, and offers only what exists', () => {
    const base = { what: 'paper' as const, language: 'en' as const, version: 'student' as const };
    expect(paperMode(base)).toEqual({ language: 'en', version: 'student' });
    expect(paperMode({ ...base, includeCover: true, includeAnswerSpace: true })).toEqual({
      language: 'en',
      version: 'student',
    });
    expect(paperMode({ ...base, includeCover: false, includeAnswerSpace: false })).toEqual({
      language: 'en',
      version: 'student',
      omitCover: true,
      omitAnswerSpace: true,
    });

    expect(omittableParts(booklet(), STUDENT)).toEqual({ cover: true, answerSpace: true });
    const classroom = createWorksheetFrom({ documentType: 'classroom' });
    expect(omittableParts(classroom, STUDENT)).toEqual({ cover: false, answerSpace: false });
  });
});
