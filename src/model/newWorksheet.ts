import { createCoverPage, defaultCoverCode, type CoverPaperStyle } from './cover';
import { createSectionElement } from './flow';
import { DEFAULT_FONTS, createWorksheet, newId } from './factories';
import { DEFAULT_MARGINS } from './page';
import { createQabFurniture, QAB_MARGINS } from './pageFurniture';
import { bi } from './text';
import type {
  FontPair,
  LayoutElement,
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
   * Seed a sample long question, so the LQ shapes open showing what they are.
   *
   * On by default for the two LQ types and ignored elsewhere: an empty LQ document
   * hides its whole point (per-part answer space lives inside a question's panel), so
   * the first page would look like the classroom worksheet's until the teacher
   * discovers the field. One deletable question is a cheaper first minute than that.
   */
  seedSample?: boolean;
}

/** The section headings a new exam-shaped document starts with. */
function defaultSections(): LayoutElement[] {
  return [
    createSectionElement(bi('Section A: Multiple Choice', '甲部：多項選擇題')),
    createSectionElement(bi('Section B: Structured Questions', '乙部：結構性問題')),
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
 */
function qabSections(): LayoutElement[] {
  const heading = (en: string, zh: string): LayoutElement => ({
    ...createSectionElement(bi(en, zh), false),
    showMarks: true,
    format: { fontSize: 11, bold: true },
  });
  const chooseOne: LayoutElement = {
    kind: 'text',
    id: newId(),
    text: bi('Answer any ONE question.', '任答一題。'),
    format: { bold: true },
  };
  return [
    heading('Section A', '甲部'),
    heading('Section B', '乙部'),
    heading('Section C', '丙部'),
    chooseOne,
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
              prefix: bi(`${code}-ECON 2–`, `${code}-ECON 2–`),
              format: { fontSize: 9 },
            },
          ],
          center: [
            { kind: 'pageNumber', id: newId(), pattern: 'plain', format: { fontSize: 14 } },
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
   * too. Only the two worksheet-shaped types keep the choice.
   */
  const sections = options.sections ?? true;
  const layout =
    documentType === 'lqMock'
      ? qabSections()
      : documentType === 'lqWorksheet'
        ? []
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
  const questions = isLq && seedSample ? [sampleLqQuestion()] : [];

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

  return {
    ...base,
    // A fresh id per document, so "New" beside an open worksheet saves as its own entry
    // rather than overwriting the one it was started from.
    id: newId(),
    // Only a typed title is stored. An empty box stays empty — a new document carries
    // no default heading (§ `createWorksheet`); it lists as "Untitled" until named.
    ...(title || titleZh ? { title: bi(title || '', titleZh || '') } : {}),
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
          pageFurniture: createQabFurniture(),
          // The same code the cover's corner block prints: both fall back to the
          // derived academic year, so the footer and the cover cannot disagree
          // about which year's paper this is (§ `academicYear`).
          footer: qabFooter(options.coverDetails?.code?.trim() || defaultCoverCode()),
        }
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
