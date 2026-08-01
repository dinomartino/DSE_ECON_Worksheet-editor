import { nanoid } from 'nanoid';
import { buildFromTemplate, defaultDiagramAltText } from './diagramTemplates';
// `flow` imports `newId` from here in turn. The cycle is safe because both sides use the
// other only inside function bodies, never at module top level — the same care the
// `migrations` import below is commented for.
import { createSectionElement } from './flow';
import { CURRENT_SCHEMA_VERSION } from './migrations';
import { bi, emptyBiText } from './text';
// Value import from `render/` — safe for the reason spelled out in `model/edits.ts`:
// `render/diagram.ts` takes only types from `model/`, so the edge stays one-way.
import { diagramSize } from '@/render/diagram';
import type {
  BiText,
  DiagramBlock,
  ImageBlock,
  LayoutElement,
  McqQuestion,
  ParagraphBlock,
  QuestionPart,
  QuestionSubPart,
  StructuredQuestion,
  TableBlock,
  TableCell,
  TableRow,
  Worksheet,
} from './types';

export const newId = () => nanoid(10);

export const DEFAULT_FONTS = { latin: 'Times New Roman', eastAsia: 'PMingLiU' };

export const FONT_PRESETS = [
  { label: 'Times New Roman / 新細明體', latin: 'Times New Roman', eastAsia: 'PMingLiU' },
  { label: 'Times New Roman / 微軟正黑體', latin: 'Times New Roman', eastAsia: 'Microsoft JhengHei' },
  { label: 'Arial / 微軟正黑體', latin: 'Arial', eastAsia: 'Microsoft JhengHei' },
  { label: 'Calibri / 新細明體', latin: 'Calibri', eastAsia: 'PMingLiU' },
];

export function createParagraphBlock(text: BiText = emptyBiText()): ParagraphBlock {
  return { kind: 'paragraph', id: newId(), text };
}

export function createTableCell(text: BiText = emptyBiText()): TableCell {
  return { id: newId(), text };
}

export function createTableRow(columns: number): TableRow {
  return {
    id: newId(),
    cells: Array.from({ length: columns }, () => createTableCell()),
  };
}

export function createTableBlock(rows = 3, columns = 3): TableBlock {
  return {
    kind: 'table',
    id: newId(),
    rows: Array.from({ length: rows }, () => createTableRow(columns)),
  };
}

export function createImageBlock(src: string, widthPx: number, heightPx: number): ImageBlock {
  return {
    kind: 'image',
    id: newId(),
    src,
    widthPx,
    heightPx,
    naturalWidthPx: widthPx,
    naturalHeightPx: heightPx,
    altText: emptyBiText(),
  };
}

/**
 * Default printed size for a diagram, in px at 96dpi.
 *
 * About 4.2in wide — a little over half the A4 text column, which is how large the
 * reference papers print theirs. Only the width is a choice: the height is measured from
 * what the diagram draws, so the constant's `heightPx` is the *bare* template's measured
 * height and exists only for callers that need a size before a diagram exists.
 */
export const DEFAULT_DIAGRAM_SIZE = { widthPx: 400, heightPx: 300 };

export function createDiagramBlock(templateId = 'blank'): DiagramBlock {
  const diagram = buildFromTemplate(templateId);
  return {
    kind: 'diagram',
    id: newId(),
    diagram,
    // Measured rather than assumed: a template with a two-line bilingual axis title needs
    // a taller box than a bare one, and starting at a flat 4:3 would squash it from the
    // moment it is inserted.
    ...diagramSize(diagram, DEFAULT_DIAGRAM_SIZE.widthPx, 'bilingual'),
    altText: defaultDiagramAltText(templateId),
  };
}

export function createMcqQuestion(): McqQuestion {
  return {
    id: newId(),
    type: 'mcq',
    blocks: [createParagraphBlock()],
    marks: 1,
    options: Array.from({ length: 4 }, () => ({ id: newId(), text: emptyBiText() })),
    answerIndex: 0,
  };
}

export function createSubPart(): QuestionSubPart {
  return { id: newId(), blocks: [createParagraphBlock()], marks: 2 };
}

export function createPart(): QuestionPart {
  return { id: newId(), blocks: [createParagraphBlock()], marks: 4 };
}

export function createStructuredQuestion(): StructuredQuestion {
  return {
    id: newId(),
    type: 'structured',
    blocks: [createParagraphBlock()],
    parts: [createPart()],
  };
}

export function createWorksheet(): Worksheet {
  const now = new Date().toISOString();
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: newId(),
    title: bi('Economics Worksheet', '經濟科工作紙'),
    instructions: bi('Answer ALL questions.', '回答全部問題。'),
    fonts: { ...DEFAULT_FONTS },
    pageSetup: { paper: 'A4', orientation: 'portrait', margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
    /*
     * The header starts empty.
     *
     * It used to ship a centre field holding the same words as `title`, so a new
     * document printed "Economics Worksheet" twice — once in the header and again as
     * the title block below it. The title is the copy worth keeping: it also names the
     * document in the outline, the saved-file list and the download filename, so
     * dropping *it* would leave every new worksheet reading "Untitled".
     *
     * Enabled rather than off, so `DocumentSettings` shows its presets and its "type on
     * the page" hint instead of a bare switch; the rule is off because an empty band
     * would otherwise print a hairline across every page with nothing above it.
     */
    header: { enabled: true, rule: false, showOnFirstPage: true, bands: [] },
    footer: {
      enabled: true,
      rule: false,
      showOnFirstPage: true,
      bands: [
        { id: newId(), zones: { left: [], center: [{ kind: 'pageNumber', id: newId() }], right: [] } },
      ],
    },
    ...emptyFlow([
      createSectionElement(bi('Section A: Multiple Choice', '甲部：多項選擇題')),
      createSectionElement(bi('Section B: Structured Questions', '乙部：結構性問題')),
    ]),
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * A document body holding only layout elements.
 *
 * The flow is written out explicitly rather than left absent: `resolveFlow` appends
 * unmentioned elements, so two headings with no flow would resolve in array order by
 * luck rather than by intent, and the first question added would land after both.
 */
function emptyFlow(layout: LayoutElement[]): Pick<Worksheet, 'questions' | 'layout' | 'flow'> {
  return {
    questions: [],
    layout,
    flow: layout.map((element) => ({ type: 'layout' as const, id: element.id })),
  };
}
