import { createCoverPage, type CoverPaperStyle } from './cover';
import { createSectionElement } from './flow';
import { DEFAULT_FONTS, createWorksheet, newId } from './factories';
import { DEFAULT_MARGINS } from './page';
import { bi } from './text';
import type { FontPair, LayoutElement, PageMargins, PaperSize, Worksheet } from './types';

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
export interface NewWorksheetOptions {
  title?: string;
  titleZh?: string;
  paper?: PaperSize;
  orientation?: 'portrait' | 'landscape';
  margins?: PageMargins;
  fonts?: FontPair;
  /**
   * Which mock-exam cover to build, if any.
   *
   * Absent means no cover — the ordinary classroom worksheet, which is the common case
   * and must not be made to opt out of exam furniture it never wanted.
   */
  cover?: CoverPaperStyle;
  /** Values for the cover's own fields; ignored when `cover` is absent. */
  coverDetails?: {
    code?: string;
    school?: string;
    examName?: string;
    paperName?: string;
    timeAllowed?: string;
  };
  /**
   * Whether to ship the "Section A / Section B" headings.
   *
   * True by default because that is the shape of every HKDSE paper and of
   * `createWorksheet()` today. A single-topic classroom worksheet wants neither, and
   * deleting two headings before typing is a worse first minute than a checkbox.
   */
  sections?: boolean;
}

/** The section headings a new exam-shaped document starts with. */
function defaultSections(): LayoutElement[] {
  return [
    createSectionElement(bi('Section A: Multiple Choice', '甲部：多項選擇題')),
    createSectionElement(bi('Section B: Structured Questions', '乙部：結構性問題')),
  ];
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
export function createWorksheetFrom(options: NewWorksheetOptions = {}): Worksheet {
  const base = createWorksheet();

  const title = options.title?.trim();
  const titleZh = options.titleZh?.trim();

  const sections = options.sections ?? true;
  // Rebuilt rather than filtered out of the base: `flow` names the elements by id, so
  // dropping `layout` entries alone would leave the flow pointing at elements that no
  // longer exist (§ the flow invariant). Both lists are written together, always.
  const layout = sections ? defaultSections() : [];

  return {
    ...base,
    // A fresh id per document, so "New" beside an open worksheet saves as its own entry
    // rather than overwriting the one it was started from.
    id: newId(),
    // Only a typed title replaces the default. An empty box means "I have not decided",
    // and the placeholder is a better document name than "" — which the storage index
    // would show as "Untitled" and the .docx would download as `worksheet.docx`.
    ...(title || titleZh
      ? { title: bi(title || base.title.en[0]?.text || '', titleZh || '') }
      : {}),
    fonts: options.fonts ? { ...options.fonts } : { ...DEFAULT_FONTS },
    pageSetup: {
      paper: options.paper ?? 'A4',
      orientation: options.orientation ?? 'portrait',
      margins: { ...(options.margins ?? DEFAULT_MARGINS) },
    },
    ...(options.cover
      ? {
          cover: createCoverPage({
            paperStyle: options.cover,
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
    questions: [],
    layout,
    flow: layout.map((element) => ({ type: 'layout' as const, id: element.id })),
  };
}
