import { createCoverPage, defaultCoverCode, type CoverPaperStyle } from './cover';
import { createQuestionCountElement, createSectionElement } from './flow';
import { DEFAULT_FONTS, createWorksheet, newId } from './factories';
import { DEFAULT_MARGINS } from './page';
import { createQabFurniture, QAB_MARGINS } from './pageFurniture';
import { bi, emptyBiText } from './text';
import type {
  FontPair,
  LayoutElement,
  McqQuestion,
  PageMargins,
  PaperSize,
  StructuredQuestion,
  Worksheet,
} from './types';

/**
 * What a teacher is asked before the first question exists.
 *
 * These are exactly the decisions that are made **once per document** and are painful
 * to change later — not because the app cannot change them (Setup can, and the cover
 * can be rebuilt), but because each one silently reflows everything authored under the
 * old answer: a paper-size change re-paginates, a font change re-measures every line,
 * and a cover added afterwards renumbers nothing but does move the whole body onto
 * sheet 2. Asking up front means the first question is typed into a document that is
 * already the shape it will be handed in as.
 *
 * Every field is optional and every default is the one `createWorksheet()` already
 * produces, so "skip the questions and give me a blank worksheet" is `{}` — the wizard
 * is a way to answer these sooner, never a form that must be completed first.
 */
/**
 * What kind of document the teacher is starting.
 *
 * The one answer everything else hangs off: it decides the cover, the sections, the
 * page furniture and what (if anything) is seeded — so the form asks it **first**, as
 * cards, and derives the rest instead of asking four separate questions whose answers
 * mostly imply each other. The four are the four real documents this app makes:
 *
 * - `classroom` — the ordinary worksheet. No cover, MCQ/structured sections.
 * - `paper1` — a Paper 1 mock: MCQ cover, answers on a separate sheet.
 * - `lqWorksheet` — a **plain long-question worksheet**: structured questions with
 *   dotted answer space, no exam apparatus at all. For practice sets and homework.
 * - `lqMock` — the **Question-Answer Book mimic**: Paper 2 cover with a candidate
 *   panel, Sections A/B/C with derived totals, continuous numbering, and the page
 *   frame + margin notes on every sheet (§ The LQ mode).
 */
export type DocumentType = 'classroom' | 'paper1' | 'lqWorksheet' | 'lqMock';

export interface NewWorksheetOptions {
  /**
   * The document's kind. Absent falls back to the older `cover` field — `mcq` means
   * `paper1`, `writeIn` means `lqMock` — so callers written before the type existed
   * keep producing exactly what they produced.
   */
  documentType?: DocumentType;
  title?: string;
  titleZh?: string;
  paper?: PaperSize;
  orientation?: 'portrait' | 'landscape';
  margins?: PageMargins;
  fonts?: FontPair;
  /**
   * Which mock-exam cover to build, if any. Subsumed by `documentType`; kept as the
   * fallback described there. Absent (with no type) means no cover — the ordinary
   * classroom worksheet must not opt out of exam furniture it never wanted.
   */
  cover?: CoverPaperStyle;
  /** Values for the cover's own fields; ignored when the document has no cover. */
  coverDetails?: {
    code?: string;
    school?: string;
    examName?: string;
    paperName?: string;
    timeAllowed?: string;
  };
  /**
   * Whether to ship section headings.
   *
   * True by default because that is the shape of every HKDSE paper and of
   * `createWorksheet()` today. A single-topic classroom worksheet wants neither, and
   * deleting two headings before typing is a worse first minute than a checkbox.
   * Ignored by `lqWorksheet` (a practice set has no sections) and by `lqMock` (the
   * booklet's three sections are its shape, not an option).
   */
  sections?: boolean;
  /**
   * Seed one sample question, so a shaped document opens showing what it is.
   *
   * On by default for the two LQ types and for `paper1`; ignored by the plain
   * classroom worksheet, which has no shape to demonstrate. An empty LQ document hides
   * its whole point (per-part answer space lives inside a question's panel), and an
   * empty Paper 1 hides its own — the derived lead-in count, the closing line and the
   * footer's paper code only read as a paper with a question between them. One
   * deletable question is a cheaper first minute than that.
   */
  seedSample?: boolean;
}

/**
 * The Question-Answer Book's body size, in points.
 *
 * The reference booklet sets its whole body at 10pt — measured out of the 2019 paper's
 * `document.xml` and confirmed by the manually refined export
 * (`real_life_reference/Manually refine worksheet.docx`), whose every body run is
 * `w:sz="20"` on the unchanged 240-twip line. The classroom worksheet stays at the
 * default 11 (§ `Worksheet.baseFontSize`).
 */
export const QAB_BASE_FONT_SIZE = 10;

/** The section headings a new exam-shaped document starts with. */
function defaultSections(): LayoutElement[] {
  return [
    createSectionElement(bi('Section A: Multiple Choice', '甲部：多項選擇題')),
    createSectionElement(bi('Section B: Structured Questions', '乙部：結構性問題')),
  ];
}

/**
 * The MCQ paper's own shape: the lead-in above question 1, "END OF PAPER" below the last.
 *
 * Both are what the reference (DSE 2021 P1) prints, and both are things a candidate is
 * told to rely on — instruction 2 on its cover says to check that all the questions are
 * there and to "Look for the words 'END OF PAPER' after the last question", which only
 * works if the paper actually carries them.
 *
 * The count in the lead-in is derived (§ `questionCount`); the closing line is an
 * ordinary centred text element, seeded exactly as the QAB's "END OF SECTION A" lines
 * are — a landmark a teacher can drag questions in front of, reword or delete, not
 * derived furniture. `paper1` takes no sections: an MCQ paper is one run of questions.
 */
function paper1Layout(): LayoutElement[] {
  return [
    createQuestionCountElement(),
    {
      kind: 'text',
      id: newId(),
      text: bi('END OF PAPER', '全卷完'),
      format: { bold: true, align: 'center' },
    },
  ];
}

/**
 * The Question-Answer Book's three sections.
 *
 * The reference booklet's own shape, structure only: "Section A (44 marks)" with the
 * total **derived** (`showMarks`), numbering running 1..14 straight through all three
 * sections (`restartNumbering: false` — a QAB never restarts at a section), and the
 * heading set at the body size in bold, which is how the booklet prints it (the
 * worksheet's 14pt heading style stays for worksheets). Section C's "Answer any ONE
 * question." rides as its own text element rather than inside the heading, so the
 * derived marks suffix stays attached to the section name it belongs to.
 *
 * The reference also closes each of Sections A and B with a bold centred
 * "END OF SECTION A/B" line, and the whole booklet with "END OF PAPER" — Section C has
 * no closing line of its own; the paper's end is its end. Seeded as ordinary text
 * elements, like the "Answer any ONE question." note: they are landmarks a teacher
 * drags questions in front of, not derived furniture, so a reworked paper may keep,
 * move or reword them. The Chinese sides are the HKDSE Chinese version's convention
 * (甲部完／乙部完／全卷完).
 */
function qabSections(): LayoutElement[] {
  const heading = (en: string, zh: string): LayoutElement => ({
    ...createSectionElement(bi(en, zh), false),
    showMarks: true,
    // The booklet's body size (§ `QAB_BASE_FONT_SIZE`), overriding the heading style's
    // 14pt — the reference prints "Section A (22 marks)" at the same 10pt as the
    // questions under it, bold being the only emphasis.
    format: { fontSize: QAB_BASE_FONT_SIZE, bold: true },
  });
  const endLine = (en: string, zh: string): LayoutElement => ({
    kind: 'text',
    id: newId(),
    text: bi(en, zh),
    format: { bold: true, align: 'center' },
  });
  const chooseOne: LayoutElement = {
    kind: 'text',
    id: newId(),
    text: bi('Answer any ONE question.', '任答一題。'),
    format: { bold: true },
  };
  return [
    heading('Section A', '甲部'),
    endLine('END OF SECTION A', '甲部完'),
    heading('Section B', '乙部'),
    endLine('END OF SECTION B', '乙部完'),
    heading('Section C', '丙部'),
    chooseOne,
    endLine('END OF PAPER', '全卷完'),
  ];
}

/**
 * The Question-Answer Book's running footer, in the reference's own shape.
 *
 * `footer2.xml` of the reference is one tabbed paragraph: the paper code with a live
 * page number at the left, small — "2019-DSE-ECON 2–14" at 9pt — and the bare page
 * number again at the centre, large (14pt), which is the number a candidate flips to.
 * Both are the existing `pageNumber` band field: the code is authored `prefix` wording
 * around the derived number, so it stays editable on the page and the number stays a
 * live `PAGE` field (§ a field is authored wording around a derived value).
 *
 * The booklet always prints this footer — `DocumentSettings` withholds the switch for
 * a QAB document — and never a header: the header part is the furniture's vehicle
 * (§ `isQabDocument`).
 */
function qabFooter(code: string): Worksheet['footer'] {
  return examFooter(code, 2);
}

/**
 * The running footer both exam papers carry: paper code left, page number centred.
 *
 * One shape serves Paper 1 and Paper 2 because the reference papers use one shape — the
 * paper number in the code is the only thing that differs ("…-ECON 1–17" against
 * "…-ECON 2–14"). Splitting them into two seeded footers would be two places to fix a
 * wording change, and they would drift the first time only one was touched.
 *
 * **The centre number's size is the papers' one real disagreement.** Paper 2's is 14pt,
 * large because a Question-Answer Book is a booklet a candidate flips through to find
 * where they are writing. Paper 1's is the size of the code beside it — measured off
 * page 2 of the 2021 paper at 150dpi, both clusters ~13–14px tall against Paper 2's 16px,
 * with the number centred on the page (x 623 against a page centre of 620.5) and the code
 * ranged left at the margin (x 147 ≈ 1"). An MCQ paper is read straight through and
 * answered on a separate sheet, so nothing about it needs flipping to.
 *
 * Both fields are the existing `pageNumber` band field: the code is authored `prefix`
 * wording around the derived number, so it stays editable on the page and the numbers
 * stay live `PAGE` fields (§ a field is authored wording around a derived value).
 */
function examFooter(code: string, paperNumber: 1 | 2): Worksheet['footer'] {
  const centreSize = paperNumber === 2 ? 14 : 9;
  return {
    enabled: true,
    rule: false,
    showOnFirstPage: true,
    bands: [
      {
        id: newId(),
        zones: {
          left: [
            {
              kind: 'pageNumber',
              id: newId(),
              pattern: 'plain',
              prefix: bi(
                `${code}-ECON ${paperNumber}–`,
                `${code}-ECON ${paperNumber}–`,
              ),
              format: { fontSize: 9 },
            },
          ],
          center: [
            {
              kind: 'pageNumber',
              id: newId(),
              pattern: 'plain',
              format: { fontSize: centreSize },
            },
          ],
          right: [],
        },
      },
    ],
  };
}

/**
 * Build a worksheet from the start screen's answers.
 *
 * Deliberately **layered over `createWorksheet()`** rather than assembling a document
 * from scratch: that factory is the one definition of what a new document *is* (an
 * empty header, a page-numbered footer, the schema version, the flow invariant that
 * `emptyFlow` exists to keep), and a second full constructor beside it would be a
 * second thing to update every time the model grows a field. This function's whole job
 * is to override the handful of answers the teacher gave.
 *
 * Pure, and takes no store: the wizard's job is to produce a document, and `replaceWorksheet`
 * is what installs it. That is what makes the shape testable without a DOM.
 */
/**
 * Which of the four documents the answers describe.
 *
 * `documentType` wins; the older `cover` field maps onto it so a caller written before
 * the type existed keeps producing exactly what it produced (`mcq` was always the
 * Paper 1 mock, `writeIn` was always the booklet).
 */
function resolveDocumentType(options: NewWorksheetOptions): DocumentType {
  if (options.documentType) return options.documentType;
  if (options.cover === 'mcq') return 'paper1';
  if (options.cover === 'writeIn') return 'lqMock';
  return 'classroom';
}

/**
 * A sample long question, so an LQ document opens showing what it is.
 *
 * Per-part answer space lives inside the structured panel, where an empty document
 * gives no hint it exists — seeded once, plainly worded (invented, never the
 * reference's — § copyright), and deletable in one keystroke.
 */
function sampleLqQuestion(): StructuredQuestion {
  const paragraph = (text: string, zh: string) => ({
    kind: 'paragraph' as const,
    id: newId(),
    text: bi(text, zh),
  });
  return {
    id: newId(),
    type: 'structured',
    blocks: [
      paragraph(
        'A city plans to turn a harbour-front car park into a public garden.',
        '某城市計劃將海旁停車場改建為公園。',
      ),
    ],
    parts: [
      {
        id: newId(),
        blocks: [paragraph('State the opportunity cost of the plan.', '指出該計劃的機會成本。')],
        marks: 2,
        answerSpace: 5,
      },
      {
        id: newId(),
        blocks: [
          paragraph(
            'Explain ONE reason why the garden may be under-provided by the market.',
            '解釋市場可能供應不足的一個原因。',
          ),
        ],
        marks: 4,
        answerSpace: 8,
      },
    ],
  };
}

/**
 * One sample MCQ, so a new Paper 1 opens showing its own shape.
 *
 * Seeded for the reason the LQ types seed theirs: the parts of this document that make
 * it a *paper* rather than a page — the derived lead-in count, the closing line, the
 * footer's paper code — are only legible with a question between them. It also fixes
 * the flow by construction: `paper1Layout` puts "END OF PAPER" last, and an appended
 * question with no anchor would otherwise land *after* it.
 *
 * Invented wording under the copyright window, like every other seeded question.
 */
function sampleMcqQuestion(): McqQuestion {
  return {
    id: newId(),
    type: 'mcq',
    blocks: [
      {
        kind: 'paragraph',
        id: newId(),
        text: bi(
          'A bakery raises the price of its bread and finds its total revenue falls.',
          '某麵包店提高麵包售價後，發現總收益下跌。',
        ),
      },
    ],
    options: [
      { id: newId(), text: bi('Demand for its bread is elastic.', '其麵包的需求富有彈性。') },
      { id: newId(), text: bi('Demand for its bread is inelastic.', '其麵包的需求缺乏彈性。') },
      { id: newId(), text: bi('Demand for its bread is unitary elastic.', '其麵包的需求彈性等於一。') },
      { id: newId(), text: bi('The supply of its bread has fallen.', '其麵包的供應下跌。') },
    ],
    answerIndex: 0,
    marks: 1,
  };
}

export function createWorksheetFrom(options: NewWorksheetOptions = {}): Worksheet {
  const base = createWorksheet();
  const documentType = resolveDocumentType(options);

  const title = options.title?.trim();
  const titleZh = options.titleZh?.trim();

  /*
   * Layout per document type, rebuilt rather than filtered out of the base: `flow`
   * names elements by id, so dropping `layout` entries alone would leave the flow
   * pointing at elements that no longer exist (§ the flow invariant). Both lists are
   * written together, always.
   *
   * The booklet's three sections are its shape, not an option, so `lqMock` ignores the
   * checkbox; a plain LQ practice set has no sections at all, so `lqWorksheet` does
   * too. `paper1` is one run of MCQs between its lead-in and "END OF PAPER", so it
   * ignores it as well. Only the plain classroom worksheet keeps the choice.
   */
  const sections = options.sections ?? true;
  const layout =
    documentType === 'lqMock'
      ? qabSections()
      : documentType === 'lqWorksheet'
        ? []
        : documentType === 'paper1'
          ? paper1Layout()
          : sections
            ? defaultSections()
            : [];

  /*
   * The seeded sample, LQ types only. Placed after the section run for the mock —
   * under "Section A", which is where the booklet's first question lives — and alone
   * for the plain LQ worksheet.
   */
  const seedSample = options.seedSample ?? true;
  const isLq = documentType === 'lqWorksheet' || documentType === 'lqMock';
  const questions = seedSample
    ? isLq
      ? [sampleLqQuestion()]
      : documentType === 'paper1'
        ? [sampleMcqQuestion()]
        : []
    : [];

  const coverStyle: CoverPaperStyle | undefined =
    documentType === 'paper1' ? 'mcq' : documentType === 'lqMock' ? 'writeIn' : undefined;

  const flow: Worksheet['flow'] = [
    ...layout.map((element) => ({ type: 'layout' as const, id: element.id })),
    ...questions.map((question) => ({ type: 'question' as const, id: question.id })),
  ];
  if (documentType === 'lqMock' && questions.length > 0) {
    // The sample belongs under Section A, not after Section C's "Answer any ONE
    // question." note — move its flow entry to just after the first section marker.
    const entry = flow.pop()!;
    flow.splice(1, 0, entry);
  }
  if (documentType === 'paper1' && questions.length > 0) {
    // Between the lead-in and "END OF PAPER", which is the only place a question can
    // go on this paper: appended, it would print below the line that declares the
    // paper finished.
    const entry = flow.pop()!;
    flow.splice(1, 0, entry);
  }

  return {
    ...base,
    // A fresh id per document, so "New" beside an open worksheet saves as its own entry
    // rather than overwriting the one it was started from.
    id: newId(),
    // Only a typed title is stored. An empty box stays empty — a new document carries
    // no default heading (§ `createWorksheet`); it lists as "Untitled" until named.
    ...(title || titleZh ? { title: bi(title || '', titleZh || '') } : {}),
    /*
     * A paper with a cover states its rubric there, and only there.
     *
     * `createWorksheet` seeds "Answer ALL questions." as body instructions, which is
     * right for a classroom worksheet handed out on its own. On an exam paper it prints
     * a second time directly under a cover that already says it — Paper 1's instruction
     * 3 is "All questions carry equal marks. Answer ALL questions.", and the booklet's
     * is instruction 3 too. The cover is the authority; a duplicate on page 2 reads as
     * a mistake in the paper.
     */
    ...(coverStyle ? { instructions: emptyBiText() } : {}),
    fonts: options.fonts ? { ...options.fonts } : { ...DEFAULT_FONTS },
    pageSetup: {
      paper: options.paper ?? 'A4',
      orientation: options.orientation ?? 'portrait',
      // The booklet always prints on the reference's own margins — the furniture
      // geometry and lines-per-page were measured against that column, so the answer
      // is fixed, not offered (§ `QAB_MARGINS`). Every other type takes the choice.
      margins:
        documentType === 'lqMock'
          ? { ...QAB_MARGINS }
          : { ...(options.margins ?? DEFAULT_MARGINS) },
    },
    // The booklet gets the QAB's page furniture: the frame and margin notes are as
    // much its shape as the sections are (§ `model/pageFurniture.ts`). Neutral default
    // wording — the reference's own margin sentence is rubric (§ copyright).
    // Its running footer is the reference's too — paper code left, big page number
    // centred — and it is always on (§ `qabFooter`).
    ...(documentType === 'lqMock'
      ? {
          // The booklet's 10pt body — stems, parts, marks, table cells — on the
          // unchanged 12pt line, exactly as the reference booklet is set
          // (§ `QAB_BASE_FONT_SIZE`).
          baseFontSize: QAB_BASE_FONT_SIZE,
          pageFurniture: createQabFurniture(),
          // The same code the cover's corner block prints: both fall back to the
          // derived academic year, so the footer and the cover cannot disagree
          // about which year's paper this is (§ `academicYear`).
          footer: qabFooter(options.coverDetails?.code?.trim() || defaultCoverCode()),
        }
      : {}),
    // The MCQ paper carries the same running footer, differing only in the paper
    // number and in the centre page number's size (§ `examFooter`). It takes none of
    // the booklet's other apparatus: no furniture (nothing is written in its margins)
    // and no 10pt body — the 2021 paper sets its questions at the ordinary body size.
    ...(documentType === 'paper1'
      ? { footer: examFooter(options.coverDetails?.code?.trim() || defaultCoverCode(), 1) }
      : {}),
    ...(coverStyle
      ? {
          cover: createCoverPage({
            paperStyle: coverStyle,
            // Blank fields fall through to `createCoverPage`'s own placeholders, which
            // the teacher then types over on the page — the cover is never a form to
            // complete before it can be looked at (§ `createCoverPage`).
            code: options.coverDetails?.code?.trim() || undefined,
            school: options.coverDetails?.school?.trim() || undefined,
            examName: options.coverDetails?.examName?.trim() || undefined,
            paperName: options.coverDetails?.paperName?.trim() || undefined,
            timeAllowed: options.coverDetails?.timeAllowed?.trim() || undefined,
          }),
        }
      : {}),
    questions,
    layout,
    flow,
  };
}
