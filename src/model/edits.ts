import type {
  Band,
  BandField,
  BandFieldSide,
  BiText,
  ContentBlock,
  DiagramBlock,
  HeaderFooter,
  LayoutElement,
  Question,
  RunFormatPatch,
  TableBlock,
  TextFormat,
  Worksheet,
} from './types';
import type { EditTarget } from '@/render/ir';
/*
 * A *value* import from `render/`, which `model/` otherwise avoids.
 *
 * It is safe here and only here: `render/diagram.ts` imports nothing but **types** from
 * `model/`, so the edge is one-way at runtime and no cycle forms. The alternative — a
 * second copy of the measurement in `model/` — is the thing the whole "one projection,
 * shared" rule exists to prevent: the panel, the page drag and the renderer would each
 * have their own idea of how tall a titled diagram is.
 */
import { diagramSize } from '@/render/diagram';
import { applyBandFieldSide, bandFieldSideText } from './bandSegments';
import { applyRunFormat } from './text';

/**
 * Applying an in-place edit from the preview.
 *
 * The preview renders IR nodes that carry an `EditTarget` naming where their text
 * came from; this module turns such a target back into a document mutation. Keeping
 * it here — rather than in the store — means the resolution rules are unit-testable
 * without a React tree.
 *
 * Two properties matter:
 *
 *  - **Addressed by id, never by position.** A stale index would write into the
 *    wrong question after a reorder; ids stay correct.
 *  - **Patch, never replace.** Every write merges into the existing `BiText`
 *    (`{ ...text, en }`), so editing in English-only mode cannot clear the Chinese
 *    side (§5.2) — the same rule the sidebar inputs follow.
 */

/** Rewrite one paragraph block's text, wherever it sits in a block list. */
function patchBlocks(
  blocks: ContentBlock[],
  blockId: string,
  patch: (block: ContentBlock) => ContentBlock,
): ContentBlock[] {
  return blocks.map((block) => (block.id === blockId ? patch(block) : block));
}

/**
 * Every block list a question owns, at any depth. Question types differ in shape,
 * so this walks the optional `parts`/`subParts` structure generically rather than
 * switching on a concrete type id (§9).
 */
function questionBlockLists(question: Question): ContentBlock[][] {
  const lists: ContentBlock[][] = [question.blocks];
  const parts = (question as { parts?: Array<{ blocks: ContentBlock[]; subParts?: Array<{ blocks: ContentBlock[] }> }> })
    .parts;
  for (const part of parts ?? []) {
    lists.push(part.blocks);
    for (const sub of part.subParts ?? []) lists.push(sub.blocks);
  }
  return lists;
}

/** Does this question contain the given block anywhere? */
export function questionOwnsBlock(question: Question, blockId: string): boolean {
  return questionBlockLists(question).some((blocks) =>
    blocks.some((block) => block.id === blockId),
  );
}

/** The question a target belongs to, if it names one. Used to sync selection. */
export function targetQuestionId(worksheet: Worksheet, target: EditTarget): string | undefined {
  if ('questionId' in target) return target.questionId;
  if (target.kind === 'blockText' || target.kind === 'blockCaption' || target.kind === 'tableCell') {
    for (const question of worksheet.questions) {
      if (questionOwnsBlock(question, target.blockId)) return question.id;
    }
  }
  return undefined;
}

/** Apply an edit to a block anywhere in the document. */
function mapAllBlocks(
  worksheet: Worksheet,
  blockId: string,
  patch: (block: ContentBlock) => ContentBlock,
): Worksheet {
  const mapQuestion = (question: Question): Question => {
    const next = { ...question, blocks: patchBlocks(question.blocks, blockId, patch) } as Question;
    const parts = (next as { parts?: Array<{ blocks: ContentBlock[]; subParts?: Array<{ blocks: ContentBlock[] }> }> })
      .parts;
    if (parts) {
      (next as { parts: unknown }).parts = parts.map((part) => ({
        ...part,
        blocks: patchBlocks(part.blocks, blockId, patch),
        subParts: part.subParts?.map((sub) => ({
          ...sub,
          blocks: patchBlocks(sub.blocks, blockId, patch),
        })),
      }));
    }
    return next;
  };

  return { ...worksheet, questions: worksheet.questions.map(mapQuestion) };
}

/** Write `text` to one band field, leaving field kinds that have no text alone. */
/**
 * Write authored text into one side of a band field.
 *
 * Every kind is writable now, not just `text`. A computed field is authored wording
 * around a derived value, and `applyBandFieldSide` knows where each kind stores its
 * wording — so this no longer decides which fields are editable, only which field is
 * named. The previous `field.kind === 'text'` guard was the reason a `fillIn` label
 * could be typed into and silently discarded: the IR advertised it as editable while
 * this dropped the write on the floor.
 */
function patchBandFields(
  fields: BandField[] | undefined,
  fieldId: string,
  side: BandFieldSide,
  text: BiText,
): BandField[] {
  return (fields ?? []).map((field) =>
    field.id === fieldId ? applyBandFieldSide(field, side, text) : field,
  );
}

/**
 * Layout elements that carry authored text and per-element formatting.
 *
 * `section` is one of them: a section heading is typed on the page like any other
 * heading now, so the same `layoutText` target that reaches a note reaches it too.
 * Defined once because "which kinds have text?" is asked when writing text, when
 * merging formatting, and when reading formatting back — three answers that must agree.
 */
type TextLayoutElement = Extract<
  LayoutElement,
  { kind: 'heading' | 'text' | 'partHeader' | 'section' }
>;

function isTextLayoutElement(element: LayoutElement): element is TextLayoutElement {
  return (
    element.kind === 'heading' ||
    element.kind === 'text' ||
    element.kind === 'partHeader' ||
    element.kind === 'section'
  );
}

/** Map one layout element by id, leaving the rest of the document alone. */
function mapLayoutElement(
  worksheet: Worksheet,
  target: { elementId: string },
  patch: (element: LayoutElement) => LayoutElement,
): Worksheet {
  return {
    ...worksheet,
    layout: worksheet.layout.map((element) =>
      element.id === target.elementId ? patch(element) : element,
    ),
  };
}

/** Map one question by id, leaving the rest of the document alone. */
function mapQuestionById(
  worksheet: Worksheet,
  questionId: string,
  patch: (question: Question) => Question,
): Worksheet {
  return {
    ...worksheet,
    questions: worksheet.questions.map((question) =>
      question.id === questionId ? patch(question) : question,
    ),
  };
}

/**
 * Write `text` to the field named by `target`.
 *
 * Returns the worksheet unchanged when the target no longer resolves — a block that
 * was deleted while its editor was open, say — so a stale edit is dropped rather
 * than throwing or corrupting the document.
 */
export function applyEditTarget(
  worksheet: Worksheet,
  target: EditTarget,
  text: BiText,
): Worksheet {
  switch (target.kind) {
    case 'worksheetTitle':
      return { ...worksheet, title: text };

    case 'worksheetInstructions':
      return { ...worksheet, instructions: text };

    case 'blockText':
      return mapAllBlocks(worksheet, target.blockId, (block) =>
        block.kind === 'paragraph' ? { ...block, text } : block,
      );

    case 'layoutText':
      return mapLayoutElement(worksheet, target, (element) =>
        isTextLayoutElement(element) ? { ...element, text } : element,
      );

    case 'labelListCell':
      return mapLayoutElement(worksheet, target, (element) =>
        element.kind !== 'labelList'
          ? element
          : {
              ...element,
              rows: element.rows.map((row) =>
                row.id === target.rowId ? { ...row, [target.column]: text } : row,
              ),
            },
      );

    // Bands live on the worksheet, not in a section, so they get their own walk. Only
    // authored text is writable; a derived total has nowhere to write back to.
    //
    // All five band lists are walked — masthead, header, footer and each edge's page-1
    // variant — because a `bandField` target carries only a field id and the same `Band`
    // model backs every one of them.
    case 'bandField': {
      // Defaulted rather than required, so a target built before sides existed still
      // writes the text it always wrote — a `text` field's prefix is its whole text.
      const side = target.side ?? 'prefix';
      const patchBands = (bands: Band[] | undefined) =>
        (bands ?? []).map((band) => ({
          ...band,
          zones: {
            left: patchBandFields(band.zones?.left, target.fieldId, side, text),
            center: patchBandFields(band.zones?.center, target.fieldId, side, text),
            right: patchBandFields(band.zones?.right, target.fieldId, side, text),
          },
        }));
      const patchEdge = (value: HeaderFooter | undefined): HeaderFooter | undefined =>
        value
          ? {
              ...value,
              bands: patchBands(value.bands),
              ...(value.firstPage
                ? { firstPage: { ...value.firstPage, bands: patchBands(value.firstPage.bands) } }
                : {}),
            }
          : value;

      return {
        ...worksheet,
        bands: worksheet.bands ? patchBands(worksheet.bands) : worksheet.bands,
        header: patchEdge(worksheet.header),
        footer: patchEdge(worksheet.footer),
      };
    }

    case 'blockCaption':
      return mapAllBlocks(worksheet, target.blockId, (block) =>
        block.kind === 'table' || block.kind === 'image' ? { ...block, caption: text } : block,
      );

    case 'tableCell':
      return mapAllBlocks(worksheet, target.blockId, (block) =>
        block.kind !== 'table'
          ? block
          : {
              ...block,
              rows: block.rows.map((row) => ({
                ...row,
                cells: row.cells.map((cell) =>
                  cell.id === target.cellId ? { ...cell, text } : cell,
                ),
              })),
            },
      );

    case 'mcqOption':
      return mapQuestionById(worksheet, target.questionId, (question) => {
        const options = (question as { options?: Array<{ id: string }> }).options;
        if (!options) return question;
        return {
          ...question,
          options: options.map((option) =>
            option.id === target.optionId ? { ...option, text } : option,
          ),
        } as Question;
      });

    case 'mcqStatement':
      return mapQuestionById(worksheet, target.questionId, (question) => {
        const statements = (question as { statements?: BiText[] }).statements;
        if (!statements || !statements[target.index]) return question;
        return {
          ...question,
          statements: statements.map((statement, index) =>
            index === target.index ? text : statement,
          ),
        } as Question;
      });

    case 'mcqExplanation':
      return mapQuestionById(
        worksheet,
        target.questionId,
        (question) => ({ ...question, explanation: text }) as Question,
      );

    case 'partAnswer':
      return mapQuestionById(worksheet, target.questionId, (question) => {
        const parts = (question as { parts?: Array<{ id: string }> }).parts;
        if (!parts) return question;
        return {
          ...question,
          parts: parts.map((part) => (part.id === target.partId ? { ...part, answer: text } : part)),
        } as Question;
      });

    case 'subPartAnswer':
      return mapQuestionById(worksheet, target.questionId, (question) => {
        const parts = (question as { parts?: Array<{ id: string; subParts?: Array<{ id: string }> }> })
          .parts;
        if (!parts) return question;
        return {
          ...question,
          parts: parts.map((part) =>
            part.id !== target.partId
              ? part
              : {
                  ...part,
                  subParts: part.subParts?.map((sub) =>
                    sub.id === target.subPartId ? { ...sub, answer: text } : sub,
                  ),
                },
          ),
        } as Question;
      });

    default:
      return worksheet;
  }
}

/**
 * Which targets carry their own formatting.
 *
 * Formatting attaches to whole elements, not to the two language sides separately: a
 * heading is one paragraph in Word regardless of how many languages it stacks, so
 * per-side sizes could not be exported faithfully.
 */
export function isFormattable(target: EditTarget): boolean {
  return (
    target.kind === 'worksheetTitle' ||
    target.kind === 'worksheetInstructions' ||
    target.kind === 'blockText' ||
    target.kind === 'layoutText' ||
    target.kind === 'bandField' ||
    /*
     * A table cell formats like any other text element.
     *
     * It was the one editable surface on the page the toolbar refused: a teacher could
     * type into a cell but not bold it, so the panel's own note ("type on the page") led
     * to a field the page's own controls did not serve. That matters more in a table than
     * anywhere else, because an HKDSE table has no header row to carry emphasis —
     * per-cell formatting is *the* mechanism a distribution table's headings use (§tables).
     */
    target.kind === 'tableCell'
  );
}

/**
 * Merge `patch` into the formatting of the element named by `target`.
 *
 * Merging rather than replacing lets the toolbar send one property at a time, and
 * an explicitly `undefined` value clears an override so the named style takes over
 * again. Non-formattable targets are returned unchanged.
 */
export function applyFormatTarget(
  worksheet: Worksheet,
  target: EditTarget,
  patch: TextFormat,
): Worksheet {
  const merge = (current: TextFormat | undefined): TextFormat | undefined => {
    const next: TextFormat = { ...current, ...patch };
    // Drop keys that were cleared, then drop the object entirely once nothing is
    // overridden, so a reset leaves no empty husk in the saved document.
    for (const key of Object.keys(next) as Array<keyof TextFormat>) {
      if (next[key] === undefined) delete next[key];
    }
    return Object.keys(next).length > 0 ? next : undefined;
  };

  switch (target.kind) {
    case 'worksheetTitle':
      return { ...worksheet, titleFormat: merge(worksheet.titleFormat) };

    case 'worksheetInstructions':
      return { ...worksheet, instructionsFormat: merge(worksheet.instructionsFormat) };


    case 'blockText':
      return mapAllBlocks(worksheet, target.blockId, (block) =>
        block.kind === 'paragraph' ? { ...block, format: merge(block.format) } : block,
      );

    case 'tableCell':
      return mapTableBlock(worksheet, target.blockId, (block) => ({
        ...block,
        rows: block.rows.map((row) => ({
          ...row,
          cells: row.cells.map((cell) =>
            cell.id === target.cellId ? { ...cell, format: merge(cell.format) } : cell,
          ),
        })),
      }));

    case 'layoutText':
      return mapLayoutElement(worksheet, target, (element) =>
        isTextLayoutElement(element) ? { ...element, format: merge(element.format) } : element,
      );

    case 'bandField': {
      /*
       * Every band list, not just the masthead.
       *
       * A `bandField` target names a field by id alone, and the identical `Band` model
       * backs the masthead, the header, the footer and each of their page-1 variants —
       * so formatting that searched only `worksheet.bands` silently did nothing when the
       * selected field lived in a header, which is exactly what "cannot change the text
       * settings in the header" looked like.
       */
      const mapFields = (fields: BandField[] | undefined) =>
        (fields ?? []).map((field) =>
          field.id === target.fieldId ? { ...field, format: merge(field.format) } : field,
        );
      const mapBands = (bands: Band[] | undefined) =>
        (bands ?? []).map((band) => ({
          ...band,
          zones: {
            left: mapFields(band.zones?.left),
            center: mapFields(band.zones?.center),
            right: mapFields(band.zones?.right),
          },
        }));
      const mapEdge = (value: HeaderFooter | undefined): HeaderFooter | undefined =>
        value
          ? {
              ...value,
              bands: mapBands(value.bands),
              ...(value.firstPage
                ? { firstPage: { ...value.firstPage, bands: mapBands(value.firstPage.bands) } }
                : {}),
            }
          : value;

      return {
        ...worksheet,
        bands: worksheet.bands ? mapBands(worksheet.bands) : worksheet.bands,
        header: mapEdge(worksheet.header),
        footer: mapEdge(worksheet.footer),
      };
    }

    default:
      return worksheet;
  }
}

/** The formatting currently in effect on a target, for showing toolbar state. */
export function formatOfTarget(
  worksheet: Worksheet,
  target: EditTarget,
): TextFormat | undefined {
  switch (target.kind) {
    case 'worksheetTitle':
      return worksheet.titleFormat;
    case 'worksheetInstructions':
      return worksheet.instructionsFormat;
    case 'blockText': {
      for (const question of worksheet.questions) {
        for (const blocks of questionBlockLists(question)) {
          const match = blocks.find((block) => block.id === target.blockId);
          if (match && match.kind === 'paragraph') return match.format;
        }
      }
      return undefined;
    }
    case 'tableCell': {
      // Searched the same way `applyFormatTarget` writes, so the toolbar reports the
      // state of the cell it is about to change.
      for (const question of worksheet.questions) {
        for (const blocks of questionBlockLists(question)) {
          const match = blocks.find((block) => block.id === target.blockId);
          if (match && match.kind === 'table') {
            for (const row of match.rows) {
              const cell = row.cells.find((entry) => entry.id === target.cellId);
              if (cell) return cell.format;
            }
          }
        }
      }
      return undefined;
    }
    case 'layoutText': {
      const element = worksheet.layout.find((entry) => entry.id === target.elementId);
      return element && isTextLayoutElement(element) ? element.format : undefined;
    }
    case 'bandField': {
      // Searched in the same order `applyFormatTarget` writes, so the toolbar always
      // reports the state of the field it is about to change.
      const lists: Array<Band[] | undefined> = [
        worksheet.bands,
        worksheet.header?.bands,
        worksheet.header?.firstPage?.bands,
        worksheet.footer?.bands,
        worksheet.footer?.firstPage?.bands,
      ];
      for (const bands of lists) {
        for (const band of bands ?? []) {
          for (const zone of ['left', 'center', 'right'] as const) {
            const match = band.zones?.[zone]?.find((field) => field.id === target.fieldId);
            if (match) return match.format;
          }
        }
      }
      return undefined;
    }
    default:
      return undefined;
  }
}

/**
 * The current text of a target, or undefined when it no longer resolves.
 *
 * Needed by the per-run path: formatting a *range* has to read the runs it is about to
 * split, and the toolbar has to report what those characters already carry. Deliberately
 * built from the same target vocabulary as `applyEditTarget`, so a target that can be
 * written can also be read.
 */
export function textOfTarget(worksheet: Worksheet, target: EditTarget): BiText | undefined {
  switch (target.kind) {
    case 'worksheetTitle':
      return worksheet.title;
    case 'worksheetInstructions':
      return worksheet.instructions;
    case 'blockText': {
      for (const question of worksheet.questions) {
        for (const blocks of questionBlockLists(question)) {
          const match = blocks.find((block) => block.id === target.blockId);
          if (match && match.kind === 'paragraph') return match.text;
        }
      }
      return undefined;
    }
    case 'tableCell': {
      // Reported here so a cell gains **per-run** formatting for free: this and
      // `applyEditTarget` are the read and the write `applyRunFormatTarget` composes,
      // and `applyEditTarget` already knew the kind. Without this side, bolding a phrase
      // inside a cell resolved to no text and silently did nothing.
      for (const question of worksheet.questions) {
        for (const blocks of questionBlockLists(question)) {
          const match = blocks.find((block) => block.id === target.blockId);
          if (match && match.kind === 'table') {
            for (const row of match.rows) {
              const cell = row.cells.find((entry) => entry.id === target.cellId);
              if (cell) return cell.text;
            }
          }
        }
      }
      return undefined;
    }
    case 'layoutText': {
      const element = worksheet.layout.find((entry) => entry.id === target.elementId);
      return element && isTextLayoutElement(element) ? element.text : undefined;
    }
    case 'bandField': {
      const lists: Array<Band[] | undefined> = [
        worksheet.bands,
        worksheet.header?.bands,
        worksheet.header?.firstPage?.bands,
        worksheet.footer?.bands,
        worksheet.footer?.firstPage?.bands,
      ];
      for (const bands of lists) {
        for (const band of bands ?? []) {
          for (const zone of ['left', 'center', 'right'] as const) {
            const match = band.zones?.[zone]?.find((field) => field.id === target.fieldId);
            // Every kind reports text now: a computed field's *wording* is authored, so
            // it carries runs and can take per-run formatting like any other text. Only
            // the derived value between the two sides cannot, and that is not a target.
            if (match) return bandFieldSideText(match, target.side ?? 'prefix');
          }
        }
      }
      return undefined;
    }
    default:
      return undefined;
  }
}

/**
 * Format the characters in `[start, end)` of one language side of `target`.
 *
 * This is the per-run counterpart to `applyFormatTarget`: instead of an override on the
 * whole element, it rewrites the element's runs so only the selected characters carry
 * the new attributes. That is what lets one question stem hold a 14pt bold phrase inside
 * ordinary body text.
 *
 * Built by composing the existing read and write rather than adding a third walk over
 * the target vocabulary — a new `EditTarget` kind then only has to be taught to
 * `textOfTarget` and `applyEditTarget` to gain per-run formatting for free.
 */
export function applyRunFormatTarget(
  worksheet: Worksheet,
  target: EditTarget,
  side: 'en' | 'zh',
  start: number,
  end: number,
  patch: RunFormatPatch,
): Worksheet {
  const current = textOfTarget(worksheet, target);
  if (!current) return worksheet;

  const next = applyRunFormat(current[side], start, end, patch);
  if (next === current[side]) return worksheet;
  return applyEditTarget(worksheet, target, { ...current, [side]: next });
}

/**
 * The smallest a resized block may get.
 *
 * Matches the sidebar's own floor (§5.3) so the two surfaces cannot disagree about
 * what is too small, and stops a stray flick of the pointer collapsing a diagram to
 * nothing — a zero-width block would export as a `w:drawing` Word reports as damaged.
 */
export const MIN_BLOCK_WIDTH_PX = 40;

/** The intrinsic aspect ratio a resize keeps locked (height ÷ width). */
export function blockAspectRatio(block: ContentBlock): number {
  if (block.kind === 'image') {
    return block.naturalWidthPx && block.naturalHeightPx
      ? block.naturalHeightPx / block.naturalWidthPx
      : block.heightPx / block.widthPx;
  }
  if (block.kind === 'diagram') return block.heightPx / block.widthPx;
  return 1;
}

/** The current printed size of a sizeable block, or undefined if it has none. */
export function blockSize(
  worksheet: Worksheet,
  blockId: string,
): { widthPx: number; heightPx: number; ratio: number } | undefined {
  for (const question of worksheet.questions) {
    for (const blocks of questionBlockLists(question)) {
      const match = blocks.find((block) => block.id === blockId);
      if (match && (match.kind === 'image' || match.kind === 'diagram')) {
        return {
          widthPx: match.widthPx,
          heightPx: match.heightPx,
          ratio: blockAspectRatio(match),
        };
      }
    }
  }
  return undefined;
}

/**
 * The diagram block with this id, or undefined.
 *
 * Exists so a double-click on the page can open the drawing canvas without the preview
 * knowing where blocks live: it reports an id, and the host resolves it. Narrowed to
 * diagrams because they are the only block kind with an editor to open — an uploaded
 * picture has nothing behind it.
 */
export function findDiagramBlock(
  worksheet: Worksheet,
  blockId: string,
): DiagramBlock | undefined {
  for (const question of worksheet.questions) {
    for (const blocks of questionBlockLists(question)) {
      const match = blocks.find((block) => block.id === blockId);
      if (match?.kind === 'diagram') return match;
    }
  }
  return undefined;
}

/**
 * Replace one block wherever it lives, by id.
 *
 * The sidebar edits blocks through the `onChange(blocks)` chain of the panel that owns
 * them, which a surface opened from the *page* has no route into. This gives the drawing
 * canvas one when it is opened by double-clicking a diagram, without either surface
 * needing to know which question or part the block sits under.
 */
export function replaceBlockById(
  worksheet: Worksheet,
  blockId: string,
  next: ContentBlock,
): Worksheet {
  // Guarded on kind so a stale handle cannot turn a diagram into a paragraph — the id
  // is the address, but the kind is what the callers' types were written against.
  return mapAllBlocks(worksheet, blockId, (block) => (block.kind === next.kind ? next : block));
}

/**
 * Transform one table block in place, by id.
 *
 * `replaceBlockById` needs the finished block, which means the caller must first find it
 * — and a drag handle on the page holds a boundary index and a fraction, not a table. This
 * hands the current block to a pure verb from `model/table.ts` and puts the result back,
 * so the page and the sidebar reach the same verbs by the same route (§tables: a verb
 * implemented twice eventually means two things).
 *
 * A block of another kind is left alone rather than thrown over: an id can go stale
 * between a pointer-down and the commit on release.
 */
export function mapTableBlock(
  worksheet: Worksheet,
  blockId: string,
  patch: (block: TableBlock) => TableBlock,
): Worksheet {
  return mapAllBlocks(worksheet, blockId, (block) =>
    block.kind === 'table' ? patch(block) : block,
  );
}

/**
 * Resize an image or diagram block to `widthPx`, height following from the block's own
 * aspect ratio.
 *
 * Width is the only input, which is what keeps the two resize surfaces — the sidebar's
 * number field and the drag handle on the page — from being able to produce a shape the
 * other cannot. Blocks that carry no size are returned untouched, so a stale drag
 * against a deleted block is dropped rather than throwing.
 */
export function applyResizeBlock(
  worksheet: Worksheet,
  blockId: string,
  widthPx: number,
): Worksheet {
  return mapAllBlocks(worksheet, blockId, (block) => {
    if (block.kind !== 'image' && block.kind !== 'diagram') return block;
    const width = Math.max(MIN_BLOCK_WIDTH_PX, Math.round(widthPx));

    // A diagram is *measured*, not scaled. Its height is whatever the plot plus the text
    // around it needs at this width, so dragging it wider must re-measure rather than
    // keep the old proportion — otherwise a titled diagram, whose box is taller than 4:3,
    // would carry that extra room forward at every new width and grow a blank strip.
    if (block.kind === 'diagram') {
      return { ...block, ...diagramSize(block.diagram, width, 'bilingual') };
    }

    return {
      ...block,
      widthPx: width,
      heightPx: Math.max(1, Math.round(width * blockAspectRatio(block))),
    };
  });
}

/**
 * What pressing Delete on the selected element removes.
 *
 * Deleting is not simply "clear the text" — the sensible unit differs per target.
 * Removing a stem paragraph should remove the *block*; removing a statement should
 * drop it from the list so the remaining ones renumber; and an MCQ option cannot be
 * removed at all, because §7.2 fixes the option count at four.
 */
export type DeletableKind =
  | 'block'
  | 'layout'
  | 'statement'
  | 'part'
  | 'subPart'
  | 'question'
  | 'caption'
  | 'answer'
  | 'cell'
  /** Emptied in place: the field stays on the worksheet but stops printing. */
  | 'clear';

export interface DeletePlan {
  kind: DeletableKind;
  /** Short human description, for the confirmation affordance in the UI. */
  label: string;
}

/**
 * Describe what deleting `target` would do, or `undefined` when the target is not
 * deletable. The UI uses this both to decide whether Delete does anything and to
 * name the thing in its hint.
 */
export function describeDelete(target: EditTarget): DeletePlan | undefined {
  switch (target.kind) {
    case 'blockText':
      return { kind: 'block', label: 'paragraph' };
    case 'layoutText':
      return { kind: 'layout', label: 'element' };
    case 'blockCaption':
      return { kind: 'caption', label: 'caption' };
    case 'tableCell':
      return { kind: 'cell', label: 'cell contents' };
    case 'mcqStatement':
      return { kind: 'statement', label: 'statement' };
    case 'mcqExplanation':
      return { kind: 'answer', label: 'explanation' };
    case 'partAnswer':
    case 'subPartAnswer':
      return { kind: 'answer', label: 'answer' };
    // The title and instructions are fields rather than list items, so there is no row
    // to remove — clearing the text *is* the delete, and an empty one stops rendering.
    // Delete is offered anyway because the printed block is selectable on the page, and
    // a selection that ignores the Delete key reads as a broken control.
    case 'worksheetTitle':
      return { kind: 'clear', label: 'title' };
    case 'worksheetInstructions':
      return { kind: 'clear', label: 'instructions' };
    // An MCQ always has exactly four options (§7.2), and a section heading is a layout
    // element reached through `layoutText`.
    default:
      return undefined;
  }
}

const EMPTY: BiText = { en: [], zh: [] };

/** Remove a block by id from every list it could belong to. */
function removeBlock(worksheet: Worksheet, blockId: string): Worksheet {
  const strip = (blocks: ContentBlock[]) => blocks.filter((block) => block.id !== blockId);

  return {
    ...worksheet,
    questions: worksheet.questions.map((question) => {
      const next = { ...question, blocks: strip(question.blocks) } as Question;
      const parts = (next as { parts?: Array<{ blocks: ContentBlock[]; subParts?: Array<{ blocks: ContentBlock[] }> }> })
        .parts;
      if (parts) {
        (next as { parts: unknown }).parts = parts.map((part) => ({
          ...part,
          blocks: strip(part.blocks),
          subParts: part.subParts?.map((sub) => ({ ...sub, blocks: strip(sub.blocks) })),
        }));
      }
      return next;
    }),
  };
}

/**
 * Apply the deletion described by `describeDelete`.
 *
 * Returns the worksheet unchanged for targets that are not deletable, so a stray
 * keypress on a fixed field is a no-op rather than a surprise.
 */
export function applyDeleteTarget(worksheet: Worksheet, target: EditTarget): Worksheet {
  const plan = describeDelete(target);
  if (!plan) return worksheet;

  switch (target.kind) {
    case 'blockText':
      return removeBlock(worksheet, target.blockId);

    // Dropped from both the element list and the flow, so no stale entry is left
    // behind pointing at something that no longer exists.
    case 'layoutText':
      return {
        ...worksheet,
        layout: worksheet.layout.filter((element) => element.id !== target.elementId),
        flow: worksheet.flow.filter((entry) => entry.id !== target.elementId),
      };

    case 'blockCaption':
      return mapAllBlocks(worksheet, target.blockId, (block) =>
        block.kind === 'table' || block.kind === 'image'
          ? { ...block, caption: undefined }
          : block,
      );

    // A cell cannot leave the grid without breaking the table's geometry, so
    // deleting one empties it.
    case 'tableCell':
      return applyEditTarget(worksheet, target, EMPTY);

    // Emptied rather than removed: `title` still names the document in the outline, the
    // saved-file list and the download filename, so the field has to outlive the printed
    // block. `renderWorksheet` drops both nodes once they are empty.
    case 'worksheetTitle':
    case 'worksheetInstructions':
      return applyEditTarget(worksheet, target, EMPTY);

    case 'mcqStatement':
      return mapQuestionById(worksheet, target.questionId, (question) => {
        const statements = (question as { statements?: BiText[] }).statements;
        if (!statements) return question;
        const next = statements.filter((_, index) => index !== target.index);
        return { ...question, statements: next.length > 0 ? next : undefined } as Question;
      });

    case 'mcqExplanation':
      return mapQuestionById(
        worksheet,
        target.questionId,
        (question) => ({ ...question, explanation: undefined }) as Question,
      );

    case 'partAnswer':
      return mapQuestionById(worksheet, target.questionId, (question) => {
        const parts = (question as { parts?: Array<{ id: string }> }).parts;
        if (!parts) return question;
        return {
          ...question,
          parts: parts.map((part) =>
            part.id === target.partId ? { ...part, answer: undefined } : part,
          ),
        } as Question;
      });

    case 'subPartAnswer':
      return mapQuestionById(worksheet, target.questionId, (question) => {
        const parts = (question as { parts?: Array<{ id: string; subParts?: Array<{ id: string }> }> })
          .parts;
        if (!parts) return question;
        return {
          ...question,
          parts: parts.map((part) =>
            part.id !== target.partId
              ? part
              : {
                  ...part,
                  subParts: part.subParts?.map((sub) =>
                    sub.id === target.subPartId ? { ...sub, answer: undefined } : sub,
                  ),
                },
          ),
        } as Question;
      });

    default:
      return worksheet;
  }
}
