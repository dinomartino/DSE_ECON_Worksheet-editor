/**
 * Not a unit test: emits the LQ (Question-Answer Book) verification fixture for
 * `scripts/lq-verify.mjs` — one booklet-shaped worksheet written twice, as the
 * exported `.docx` and as the `.worksheet.json` the harness seeds into the browser.
 *
 * The document mimics the reference booklet's *structure* (§ LQ_MODE_HANDOFF): a
 * Paper 2 cover, three sections with derived totals and continuous numbering, per-part
 * dotted answer space, a pure answer page opened by a page break, and page furniture on
 * every body sheet. All wording is invented — reproducing structure, never prose.
 *
 * Run with `LQ_DIR=... npx vitest run scripts/lq-fixtures.test.ts`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { exportDocxBuffer } from '@/export/docx';
import { createWorksheetFrom } from '@/model/newWorksheet';
import { createAnswerSpaceElement, createPageBreakElement } from '@/model/flow';
import { bi } from '@/model/text';
import type { FlowItem, StructuredQuestion } from '@/model/types';
import { stringifyWorksheet } from '@/storage';

const OUT = process.env.LQ_DIR ?? '/tmp/lq-verify';

const p = (id: string, text: string) => ({ kind: 'paragraph' as const, id, text: bi(text, '') });

/**
 * A full dotted sheet at the fixture's default A4 geometry.
 *
 * 29 lines is what the reference's pure answer pages carry at its margins; the
 * fixture's margins differ slightly, so the count here is what `lq-verify` asserted
 * the sheet actually holds. The verify run measures the rendered pitch regardless.
 */
const FULL_PAGE_LINES = 29;

it('emits the LQ fixture', async () => {
  mkdirSync(OUT, { recursive: true });
  const worksheet = createWorksheetFrom({
    documentType: 'lqMock',
    title: 'LQ harness booklet',
    coverDetails: { school: 'SAMPLE SCHOOL', examName: 'MOCK EXAMINATION' },
    // The fixture authors its own questions and rebuilds the flow positionally, so the
    // wizard's sample question must not be in it.
    seedSample: false,
  });
  worksheet.title = bi('LQ harness booklet', '');

  const questions: StructuredQuestion[] = [
    {
      id: 'q1',
      type: 'structured',
      blocks: [p('q1s', 'A town weighs two uses for a plot of reclaimed land.')],
      parts: [
        { id: 'q1a', blocks: [p('q1a1', 'State the opportunity cost of building a park there.')], marks: 2, answerSpace: 5 },
        { id: 'q1b', blocks: [p('q1b1', 'Explain how a height limit changes that cost.')], marks: 3, answerSpace: 7 },
      ],
    },
    {
      id: 'q2',
      type: 'structured',
      blocks: [p('q2s', 'A bakery replaces two ovens with one larger oven.')],
      parts: [
        { id: 'q2a', blocks: [p('q2a1', 'Identify the type of efficiency the bakery pursues.')], marks: 2, answerSpace: 5 },
        { id: 'q2b', blocks: [p('q2b1', 'Discuss ONE cost of the change to its workers.')], marks: 4, answerSpace: 9 },
      ],
    },
    {
      id: 'q3',
      type: 'structured',
      blocks: [p('q3s', 'A city considers a levy on single-use cups.')],
      parts: [
        {
          id: 'q3a',
          blocks: [p('q3a1', 'With reference to the levy:')],
          marks: 5,
          subParts: [
            { id: 'q3ai', blocks: [p('q3ai1', 'Describe its effect on quantity consumed.')], marks: 2, answerSpace: 5 },
            { id: 'q3aii', blocks: [p('q3aii1', 'Explain who bears more of its burden.')], marks: 3, answerSpace: 8 },
          ],
        },
      ],
    },
    {
      id: 'q4',
      type: 'structured',
      blocks: [p('q4s', 'A country removes a quota on imported rice.')],
      parts: [
        { id: 'q4a', blocks: [p('q4a1', 'Explain the change in the domestic price of rice.')], marks: 4, answerSpace: 10 },
        { id: 'q4b', blocks: [p('q4b1', 'Evaluate the effect on domestic growers.')], marks: 6, answerSpace: 12 },
      ],
    },
  ];
  worksheet.questions = questions;

  /*
   * Every question starts at a page top, by explicit break — the reference's own
   * convention, and what keeps Word and the preview agreeing about the sheets: the
   * preview moves a question that no longer fits *whole*, while Word would split it
   * mid-space, so a question sized near a page boundary is exactly where the two would
   * part company. A pure answer sheet follows question 2, the reference's shape for an
   * answer that outgrows its page: the break opens the sheet, the space fills it.
   */
  const breakQ2 = createPageBreakElement();
  const pureBreak = createPageBreakElement();
  const purePage = createAnswerSpaceElement(FULL_PAGE_LINES);
  const closingBreak = createPageBreakElement();
  const breakSecB = createPageBreakElement();
  /*
   * A fill element closes the booklet (§3.2): the paginator resolves its count to the
   * room left on the last sheet, and `lq-verify` asserts the browser's resolution
   * equals the count stored here — which is what the .docx exported, so the two
   * agreeing is the whole §3.2 contract ("the resolved value must reach the exporter").
   * The stored 1 is the calibrated answer for this fixture's geometry; a drift in
   * measurement, pitch or packing shows up as the harness printing a different number.
   * It has moved three times: down to 1 when each dotted line grew by the 1.5pt gap
   * above it (§ `LQ_LINE_SPACE_BEFORE_TWIPS`), back to 2 once the measurement probe was
   * given `.paper` and stopped reporting every text block taller than it renders, then
   * down to 1 again when the paginator started reserving the band the page frame closes
   * above the bottom margin (§ `frameBottomIntrusion`) — a framed sheet genuinely holds
   * ~10px less than the margins alone suggest.
   */
  const closingFill = createAnswerSpaceElement(1, true);
  worksheet.layout = [
    ...worksheet.layout,
    breakQ2,
    pureBreak,
    purePage,
    closingBreak,
    breakSecB,
    closingFill,
  ];

  // Rebuild the flow. The section elements were created by the wizard factory in
  // order A, B, C, note.
  const [secA, secB, secC, note] = worksheet.flow;
  const flow: FlowItem[] = [
    secA,
    { type: 'question', id: 'q1' },
    { type: 'layout', id: breakQ2.id },
    { type: 'question', id: 'q2' },
    { type: 'layout', id: pureBreak.id },
    { type: 'layout', id: purePage.id },
    { type: 'layout', id: closingBreak.id },
    { type: 'question', id: 'q3' },
    { type: 'layout', id: breakSecB.id },
    secB,
    { type: 'question', id: 'q4' },
    secC,
    note,
    { type: 'layout', id: closingFill.id },
  ];
  worksheet.flow = flow;

  const bytes = await exportDocxBuffer(worksheet, { language: 'en', version: 'student' });
  writeFileSync(`${OUT}/lq.docx`, bytes);
  writeFileSync(`${OUT}/lq.worksheet.json`, stringifyWorksheet(worksheet));
  console.log(`${bytes.length} bytes -> ${OUT}/lq.docx`);
});
