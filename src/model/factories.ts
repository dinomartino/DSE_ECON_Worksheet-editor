import { nanoid } from 'nanoid';
import { buildFromTemplate, defaultDiagramAltText } from './diagramTemplates';
import { CURRENT_SCHEMA_VERSION } from './migrations';
import { bi, emptyBiText } from './text';
import type {
  BiText,
  DiagramBlock,
  ImageBlock,
  McqQuestion,
  ParagraphBlock,
  QuestionPart,
  QuestionSubPart,
  Section,
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
    headerRowCount: 1,
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
 * reference papers print theirs. The 4:3 ratio leaves room for the axis titles that sit
 * outside the plot area without squashing the plot itself.
 */
export const DEFAULT_DIAGRAM_SIZE = { widthPx: 400, heightPx: 300 };

export function createDiagramBlock(templateId = 'blank'): DiagramBlock {
  return {
    kind: 'diagram',
    id: newId(),
    diagram: buildFromTemplate(templateId),
    widthPx: DEFAULT_DIAGRAM_SIZE.widthPx,
    heightPx: DEFAULT_DIAGRAM_SIZE.heightPx,
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

export function createSection(heading?: BiText): Section {
  return { id: newId(), heading: heading ?? emptyBiText(), questions: [] };
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
    header: {
      enabled: true,
      rule: true,
      showOnFirstPage: true,
      bands: [
        {
          id: newId(),
          zones: {
            left: [],
            center: [{ kind: 'text', id: newId(), text: bi('Economics Worksheet', '經濟科工作紙') }],
            right: [],
          },
        },
      ],
    },
    footer: {
      enabled: true,
      rule: false,
      showOnFirstPage: true,
      bands: [
        { id: newId(), zones: { left: [], center: [{ kind: 'pageNumber', id: newId() }], right: [] } },
      ],
    },
    sections: [
      { ...createSection(bi('Section A: Multiple Choice', '甲部：多項選擇題')), restartNumbering: true },
      { ...createSection(bi('Section B: Structured Questions', '乙部：結構性問題')), restartNumbering: true },
    ],
    createdAt: now,
    updatedAt: now,
  };
}
