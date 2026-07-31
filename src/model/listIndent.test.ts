import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import {
  OPTION_LIST_INDENT,
  PART_TEXT_INDENT,
  QUESTION_LIST_INDENTS,
  STATEMENT_LIST_INDENT,
  SUBPART_TEXT_INDENT,
} from './numbering';
import { exportDocxBuffer } from '@/export/docx';
import { buildAcceptanceWorksheet } from '@/test/fixtures';
import type { OutputMode } from './types';

/**
 * List geometry is one definition read by three consumers that cannot import each other.
 *
 * `export/docx/numbering.ts` writes it into `w:ind`, `Preview.tsx` lays the paper out
 * with it, and `registry/structured.ts` indents continuation paragraphs to match. A copy
 * that drifts is silent in the worst way: the preview paginates on geometry Word will not
 * reproduce, so page breaks land in different places on screen and on paper.
 *
 * These lock the shape of the staircase and the fact that all three read it.
 */
describe('list indent geometry', () => {
  it("starts each level's marker where its parent's text starts", () => {
    /*
     * The rule a real paper prints, and the reason the numbers are what they are:
     * "1." hangs in the margin with the stem at 360, "(a)" begins *at* 360 — under the
     * stem's first word — and "(i)" at 720, under part (a)'s text.
     *
     * Levels 1 and 2 were one full step too deep (1080 and 1980), which pushed a
     * sub-part a third of the way across the column and wrapped long parts early.
     */
    for (let level = 1; level < QUESTION_LIST_INDENTS.length; level += 1) {
      const marker = QUESTION_LIST_INDENTS[level].left - QUESTION_LIST_INDENTS[level].hanging;
      expect(marker).toBe(QUESTION_LIST_INDENTS[level - 1].left);
    }
  });

  it('leaves room for a three-character roman marker', () => {
    // "(iii)" collides with the text at a 360 hang; the level-2 hang is widened for it.
    expect(QUESTION_LIST_INDENTS[2].hanging).toBeGreaterThan(360);
  });

  it('indents continuation paragraphs to their own levels text column', () => {
    // A second paragraph inside part (a) carries no marker, so it is indented directly
    // to the text column its first paragraph uses.
    expect(PART_TEXT_INDENT).toBe(QUESTION_LIST_INDENTS[1].left);
    expect(SUBPART_TEXT_INDENT).toBe(QUESTION_LIST_INDENTS[2].left);
  });

  it('starts a statement marker at the stems own text column', () => {
    /*
     * The reference paper prints "(1)" flush under the first word of the stem and
     * reserves the deeper indent for the A-D options alone — the same
     * marker-starts-where-its-parents-text-starts rule the question levels follow, with
     * the stem as the parent.
     *
     * Statements shared the option indent, so the two lists stacked in one block with
     * nothing but the marker shape to separate the question from its answers.
     */
    expect(STATEMENT_LIST_INDENT.left - STATEMENT_LIST_INDENT.hanging).toBe(
      QUESTION_LIST_INDENTS[0].left,
    );

    // Options stay a step deeper than the statements, or the distinction is lost again.
    expect(OPTION_LIST_INDENT.left).toBeGreaterThan(STATEMENT_LIST_INDENT.left);
  });

  it('writes exactly these twips into numbering.xml', async () => {
    const mode: OutputMode = { language: 'bilingual', version: 'student' };
    const zip = await JSZip.loadAsync(await exportDocxBuffer(buildAcceptanceWorksheet(), mode));
    const xml = await zip.file('word/numbering.xml')!.async('string');

    for (const indent of QUESTION_LIST_INDENTS) {
      expect(xml).toContain(`<w:ind w:left="${indent.left}" w:hanging="${indent.hanging}"/>`);
    }
  });

  it('is read by the preview rather than restated as literals', () => {
    /*
     * The preview cannot be measured here (no DOM), so this asserts the *wiring*: it has
     * to consume the shared constant. A literal table in `Preview.tsx` is exactly the
     * drift this file exists to prevent, and it looks correct until a level moves.
     */
    const source = readFileSync('src/components/preview/Preview.tsx', 'utf8');
    expect(source).toContain('QUESTION_LIST_INDENTS[0]');
    expect(source).toContain('QUESTION_LIST_INDENTS[1]');
    expect(source).toContain('QUESTION_LIST_INDENTS[2]');
    expect(source).toContain('STATEMENT_LIST_INDENT');
    expect(source).toContain('OPTION_LIST_INDENT');

    // And the styles must not re-indent on top of it: `ml-6` / `ml-12` on the two
    // sub-question styles, and `ml-8` on Statement and MCQ Option, stacked a second
    // indent over the list geometry, so all four sat further right in the preview than
    // in the export. Only the paper shows it, and the paginator measures the difference.
    expect(source).toMatch(/"Sub-question":\s*""/);
    expect(source).toMatch(/"Sub-sub-question":\s*""/);
    expect(source).toMatch(/\bStatement:\s*""/);
    expect(source).toMatch(/"MCQ Option":\s*""/);
  });
});
