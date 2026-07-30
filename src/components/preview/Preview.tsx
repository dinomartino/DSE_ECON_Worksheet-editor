"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  bandsHeight,
  bandsOverflow,
  bandsShouldRender,
  headerFooterOffsets,
  defaultFooter,
  defaultHeader,
  firstPageHeaderFooter,
  headerFooterOf,
  isHeaderFooterActive,
  pageDimensions,
  pageSetupOf,
  twipsToMm,
} from "@/model/page";
import { zonesOf, type ZoneName } from "@/model/bands";
import { describeDelete, isFormattable } from "@/model/edits";
import { worksheetMarks } from "@/model/marks";
import {
  commonRunFormat,
  marksAnchorRuns,
  plain,
  runLines,
  trailingBlankLines,
} from "@/model/text";
import type {
  Band,
  BandFieldSide,
  BiText,
  HeaderFooter,
  LanguageMode,
  OutputMode,
  RunFormat,
  TextFormat,
  Worksheet,
} from "@/model/types";
import { isModalLayerOpen } from "@/components/ui/modalLayer";
import { useWorksheetStore, type BandScope } from "@/store/worksheetStore";
import { diagramSvg } from "@/render/diagram";
import type { EditTarget, RenderNode, TextNode } from "@/render/ir";
import { bandFieldText, renderWorksheet } from "@/render/worksheet";
import { listQuestionTypes, requireQuestionType } from "@/registry";
import {
  computeNumbering,
  OPTION_LIST_INDENT,
  QUESTION_LIST_INDENTS,
  STATEMENT_LIST_INDENT,
} from "@/model/numbering";

/** Human name per layout kind, for the drag ghost. */
const LAYOUT_DRAG_NAME: Record<string, string> = {
  heading: "Heading",
  text: "Text",
  spacer: "Blank space",
  divider: "Divider",
  pageBreak: "New page",
  answerLines: "Answer lines",
  partHeader: "Part header",
  labelList: "Label list",
};
import { IconButton } from "@/components/ui";
import { DragGhost, hideNativeDragImage } from "@/components/ui/DragGhost";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  CloseIcon,
  GripIcon,
  McqIcon,
  MinusIcon,
  PlusIcon,
  StructuredIcon,
} from "@/components/ui/icons";
import { BandEditor, bandFieldStyle, withPageNumber } from "./BandEditor";

/**
 * What an editable row of zones needs from its host.
 *
 * One shape for the masthead, the header and the footer: they are all `Band[]` and all
 * edited through `BandEditor`, so a second spelling of these four verbs would only be a
 * place for them to drift apart.
 */
export interface BandEditingHandlers {
  /** Move a field to a zone, landing before `beforeId` when given. */
  onMove: (bandId: string, fieldId: string, zone: ZoneName, beforeId?: string) => void;
  /** Write authored text into one side of a field; see `BandEditor`'s own prop. */
  onEditField: (fieldId: string, text: BiText, side: BandFieldSide) => void;
  onRemoveField: (fieldId: string) => void;
  onAddField: (bandId: string, zone: ZoneName) => void;
  /**
   * Add a whole printed row, and remove one.
   *
   * On the page rather than only in the settings dialog, because a header's *rows* are
   * as visible as its text and the dialog is the one place you cannot see them — it
   * covers the page it is describing. Optional so a read-only preview stays read-only.
   */
  onAddRow?: (scope: BandScope) => void;
  onRemoveRow?: (bandId: string) => void;
  /** Selection, so a band field can carry the format toolbar like any other text. */
  selection?: {
    isSelected: (fieldId: string, side: BandFieldSide) => boolean;
    onSelect: (fieldId: string, side: BandFieldSide) => void;
    onClear: () => void;
  };
}
import { FormatToolbar } from "./FormatToolbar";
import { InlineEditable, type TextSelection } from "./InlineEditable";
import { ResizableBlock } from "./ResizableBlock";
import { ResizableRows } from "./ResizableRows";
import { MIN_ANSWER_LINES, MIN_SPACER_PT } from "@/model/flow";
import { ANSWER_LINE_HEIGHT_TWIPS } from "@/export/docx/styles";
import {
  compositionKey as keyOfComposition,
  composePages,
  marqueeBounds,
  marqueeCatches,
  packPages,
  type PackItem,
  type PageComposition,
} from "./pagination";

// Re-exported so the page rail keeps importing the type from the component that
// publishes it, rather than having to know pagination is factored out.
export type { PageComposition };

/**
 * Live print preview — the centrepiece of the editor (§5.1), and the third consumer
 * of the render IR, so it always agrees with the .docx on content, ordering,
 * numbering and teacher-only filtering. It approximates the Word output; the .docx
 * is the source of truth for appearance.
 *
 * Clicking a question selects it and loads its inputs into the right sidebar.
 */

/** CSS reference pixels per millimetre (96 dpi / 25.4). */
const MM_TO_PX = 96 / 25.4;

/** CSS reference pixels per point (96 dpi / 72). */
const PT_TO_PX = 96 / 72;

/**
 * One ruled answer line's pitch, in page pixels.
 *
 * Taken from the exporter's `ANSWER_LINE_HEIGHT_TWIPS` rather than chosen here, because
 * the two have to agree about how tall N lines are. The preview used `1.2em` plus a
 * `mb-3` margin, which is a different height *and* a font-relative one — so a block of
 * twenty lines occupied one amount of page on screen and another in Word. That was
 * cosmetic while the paginator kept every element whole; it stops being cosmetic once
 * the block can split across a page boundary, since the sheet it splits on is decided
 * by this number.
 */
const ANSWER_LINE_PITCH_PX = (ANSWER_LINE_HEIGHT_TWIPS / 20) * PT_TO_PX;

/** How much one drag step changes a spacer. Points are too fine to drag one at a time. */
const SPACER_STEP_PT = 6;

function runSpans(runs: BiText["en"], key: string) {
  return runs.map((runItem, index) => {
    // A hard line break (Shift+Enter, stored as `\n`) becomes a real <br/>. Rendered
    // as raw text it would collapse to a space, exactly as it does in Word and in the
    // clipboard HTML — the page has to agree with what exports.
    const lines = runLines(runItem.text);
    let content: React.ReactNode =
      lines.length === 1
        ? runItem.text
        : lines.map((line, lineIndex) => (
            <Fragment key={lineIndex}>
              {lineIndex > 0 && <br />}
              {line}
            </Fragment>
          ));
    if (runItem.bold) content = <strong>{content}</strong>;
    if (runItem.italic) content = <em>{content}</em>;
    if (runItem.underline) content = <u>{content}</u>;
    if (runItem.vertAlign === "superscript") content = <sup>{content}</sup>;
    if (runItem.vertAlign === "subscript") content = <sub>{content}</sub>;

    /*
     * A run's own size, colour and font, mirroring `richTextRuns` in the exporter — this
     * is what makes a 14pt phrase inside an 11pt stem visible on the page rather than
     * only in Word.
     *
     * `lineHeight` is deliberately left alone. The sheet is on a fixed 12pt grid (see
     * `.paper`), and a taller run inside a line must not push that line apart, exactly
     * as `w:lineRule="exact"` refuses to grow. So an enlarged run overflows its line box
     * on screen the same way it does in print.
     */
    const style: React.CSSProperties = {};
    if (runItem.fontSize !== undefined) style.fontSize = `${runItem.fontSize}pt`;
    if (runItem.color) style.color = `#${runItem.color}`;
    if (runItem.fonts) {
      style.fontFamily = `'${runItem.fonts.latin}', '${runItem.fonts.eastAsia}', serif`;
    }
    const styled = Object.keys(style).length > 0 ? style : undefined;

    return (
      <span key={`${key}-${index}`} style={styled}>
        {content}
      </span>
    );
  });
}

/**
 * Render a bilingual value, making each language side editable in place when the IR
 * gave it an edit target.
 *
 * In bilingual mode both sides render but stay *separately* editable, so clicking
 * the Chinese line writes only `zh`. Without a target (derived text such as a marks
 * total) it falls through to plain, non-editable spans.
 */
function richNodes(
  text: BiText | undefined,
  language: LanguageMode,
  edit?: EditTarget,
  ctx?: EditContext,
  /** Tab handler, supplied only by table cells so a table walks like Word's. */
  onTab?: (backwards: boolean) => boolean,
) {
  if (!text) return null;

  const editable = (sideKey: "en" | "zh", placeholder: string) => {
    const rendered = runSpans(text[sideKey], sideKey);
    if (!edit || !ctx) return rendered;
    return (
      <InlineEditable
        value={text}
        side={sideKey}
        placeholder={placeholder}
        selected={ctx.isSelected(edit, sideKey)}
        onSelect={() => ctx.onSelectElement(edit, sideKey)}
        onDeselect={ctx.onClearSelection}
        onCommit={(next) => ctx.onEdit(edit, next)}
        onFlush={(next) => ctx.onEditKeepingSelection(edit, next)}
        onSelectionChange={ctx.onTextSelectionChange}
        keepEditing={ctx.keepEditing}
        onTab={onTab}
      >
        {rendered}
      </InlineEditable>
    );
  };

  if (language === "en") return editable("en", "Double-click to add English");
  if (language === "zh") return editable("zh", "Double-click to add 中文");

  // In bilingual mode an empty side still needs a click target, otherwise the only
  // way to add the missing translation would be the sidebar.
  const hasEn = text.en.length > 0;
  const hasZh = text.zh.length > 0;
  const showEn = hasEn || Boolean(edit);
  const showZh = hasZh || Boolean(edit);

  // A soft break rather than block elements, so the English half stays on the same
  // line as its list marker — this mirrors the docx, where the two languages share
  // one numbered paragraph separated by `w:br` (§5.4).
  return (
    <>
      {showEn && editable("en", "Double-click to add English")}
      {showEn && showZh && <br />}
      {showZh && editable("zh", "Double-click to add 中文")}
    </>
  );
}

/*
 * Paper styles carry no vertical margin.
 *
 * The .docx sets every paragraph to a fixed 12pt line with `w:before`/`w:after` of zero
 * (see `export/docx/styles.ts`), mirroring the reference paper, so the preview must not
 * add margins of its own: a `mt-3` here is a gap that exists on screen and not in Word,
 * and the paginator measures the screen — every such margin is a page that breaks in the
 * wrong place. Font size and leading come from `.paper`, which pins both to the exported
 * values; only the size *deltas* (title, headings, captions) are named here.
 */
const STYLE_CLASS: Record<string, string> = {
  "Worksheet Title": "text-center font-bold paper-line-16",
  Instructions: "italic",
  "Section Heading": "font-bold paper-line-14",
  "Question Stem": "",
  Statement: "ml-8",
  "MCQ Option": "ml-8",
  /*
   * No margin of their own: a part's indent comes from the list geometry.
   *
   * These carried `ml-6` / `ml-12` *on top of* the `paddingLeft` derived from
   * `QUESTION_LIST_INDENTS`, so every part and sub-part was indented twice — once by the
   * numbering the export uses and again by a class the export knows nothing about. The
   * preview therefore started (a) and (i) further right than Word does and wrapped their
   * text earlier, which is half of why long parts broke lines in the wrong places.
   *
   * A part with no `listRef` (a continuation paragraph) is positioned by `node.indent`
   * instead, which the registry sets from the same constants.
   */
  "Sub-question": "",
  "Sub-sub-question": "",
  Marks: "text-right",
  "Table Caption": "text-center italic paper-line-10",
  "Image Caption": "text-center italic paper-line-10",
  Answer: "font-bold text-red-700 dark:text-red-400",
  "Marking Scheme": "text-[#4a30c2] ml-4",
  Body: "",
};

function marksLabel(marks: number, language: LanguageMode): string {
  const en = `(${marks} ${marks === 1 ? "mark" : "marks"})`;
  const zh = `（${marks}分）`;
  if (language === "en") return en;
  if (language === "zh") return zh;
  return `${en} ${zh}`;
}

/**
 * "(4 marks)" sits at the right-hand end of the paragraph's **last line**.
 *
 * The `.docx` gets this from a right tab stop: a `w:tab` run after the text against a
 * stop at the content edge, so the marks flow to the end of the paragraph and land on
 * whichever line that turns out to be. A tab stop reserves nothing on the *other* lines
 * — only the final line is shortened — which is why the body text has to wrap exactly as
 * it would with no marks at all.
 *
 * No single CSS property expresses that, and the two obvious ones both fail:
 *
 * - **`float: right` is placed on the first line with room**, not the last. A float is
 *   positioned when a line box is built and does not participate in inline layout, so
 *   emitting it after the text does not pin it to the final line: when the last line's
 *   remaining width is narrower than the label, the float moves *down*, and because it is
 *   out of flow the paragraph does not grow to contain it — the marks then print in the
 *   next paragraph's 12pt line box and overprint it. That is visible only on the lengths
 *   where the tail happens not to fit, which is why it read as intermittent.
 * - **`text-align-last: justify`** stretches the body text's word spacing, and a
 *   full-width flexible gap wraps to its own line regardless.
 *
 * So the reserve and the placement are separated, and the reserve *is* the label:
 *
 * - An **invisible twin** rides inline at the very end of the text. Being in flow, it
 *   shortens only the line the text actually ends on, and being the label itself it
 *   reserves exactly the right width at any font size — no measurement, nothing to keep
 *   in step. A fixed-width shim cannot do this: where the shim fits but the label does
 *   not, the two overprint.
 * - The **visible copy is pinned bottom-right**. The paragraph's last line *is* its
 *   bottom, so `bottom: 0` lands on that line whatever the paragraph's height, and
 *   `right: 0` right-aligns it at the content edge like the tab stop. (The paragraph is
 *   already `relative`, for the list marker.)
 *
 * When the marks genuinely do not fit, the twin wraps and carries the last word with it,
 * so both end up on a new final line together — which is what Word's tab stop does too.
 *
 * `aria-hidden` on the twin keeps the label out of the accessibility tree twice, and both
 * copies are `nowrap` so neither splits "(4" from "marks)".
 */
function MarksTrail({
  marks,
  language,
  blankLines,
}: {
  marks: number;
  language: LanguageMode;
  blankLines: number;
}) {
  const label = marksLabel(marks, language);
  return (
    <>
      {/*
        The reserve can only ride at the very end of the inline flow: the text is owned by
        a contenteditable (`InlineEditable`), and injecting a sibling inside it would put
        React in charge of nodes the browser is mutating (\u00a7 a contenteditable is an
        uncontrolled input). So when the text ends in hard breaks the reserve lands on the
        trailing blank line and shortens *that* \u2014 harmless, since nothing is written there.

        It means the reserve protects only the common case, where the marks share the last
        line with wrapped text. A *hard-broken* final line that already reaches the right
        edge can still be overlapped, and Word is in exactly the same position: a right
        tab stop cannot push a line that a `w:br` has already ended either. Matching that
        is the point \u2014 the preview must not invent a wrap the .docx will not reproduce.
      */}
      <span className="whitespace-nowrap" aria-hidden style={{ visibility: "hidden" }}>
        {/*
          An em space (U+2003), spelled as an escape because an invisible character
          cannot be seen to be load-bearing. It must not be a plain space: the twin
          abuts the text's own inline content and HTML collapses a space at that
          boundary, so the gap would vanish and the marks could butt against the last
          word. It rides inside the hidden twin, so it reserves room without printing.
        */}
        {`\u2003${label}`}
      </span>
      <span
        className="absolute right-0 whitespace-nowrap"
        style={{
          /*
           * `bottom: 0` is the paragraph's last line \u2014 which is an *empty* one when the
           * text ends in hard breaks. Lifting by one line-height per trailing blank line
           * puts the label back on the last line that says something, while the blank
           * lines still print as the vertical space they are.
           *
           * `lh` resolves against this element's own computed line-height, so it stays
           * correct on the styles that scale their exact line box (\u00a7 `exact` does not
           * grow) instead of assuming the 12pt body grid.
           */
          bottom: blankLines ? `${blankLines}lh` : 0,
        }}
      >
        {label}
      </span>
    </>
  );
}

/**
 * What the docked format toolbar says it is acting on.
 *
 * The bar sits at the top of the column rather than beside its subject, so it has to
 * name it — a toolbar in a fixed place with no label leaves the user guessing which of
 * several selectable things it will change.
 */
const TARGET_NAME: Record<EditTarget["kind"], string> = {
  worksheetTitle: "Title",
  worksheetInstructions: "Instructions",
  blockText: "Paragraph",
  blockCaption: "Caption",
  tableCell: "Table cell",
  mcqOption: "Option",
  mcqStatement: "Statement",
  mcqExplanation: "Explanation",
  partAnswer: "Answer",
  subPartAnswer: "Answer",
  layoutText: "Text element",
  // One name for all five band lists — masthead, header, footer and their page-1
  // variants — because a `bandField` target does not say which one it came from.
  bandField: "Field",
  labelListCell: "Label row",
};

/**
 * A run's shared formatting, in the shape the toolbar already speaks.
 *
 * The bar reports and edits a `TextFormat` (an element's overrides); a selection carries
 * a `RunFormat`. The overlapping fields are the ones a range can actually carry — size,
 * colour, the three flags — so the adapter is a projection rather than a conversion, and
 * paragraph-level fields (alignment, spacing) simply have no run equivalent.
 */
function runFormatToTextFormat(run: RunFormat): TextFormat {
  return {
    ...(run.fontSize !== undefined ? { fontSize: run.fontSize } : {}),
    ...(run.color !== undefined ? { color: run.color } : {}),
    ...(run.bold !== undefined ? { bold: run.bold } : {}),
    ...(run.italic !== undefined ? { italic: run.italic } : {}),
    ...(run.underline !== undefined ? { underline: run.underline } : {}),
    ...(run.fonts !== undefined ? { fonts: run.fonts } : {}),
  };
}

/**
 * The `w:ind` geometry of each numbered level, in twips — the *same numbers*
 * `export/docx/numbering.ts` writes into `numbering.xml`, not an approximation of them.
 *
 * Word's model is `left` + `hanging`: the paragraph's text column sits at `left`, and
 * the **marker alone** is pulled back by `hanging` into the margin. Every line of the
 * paragraph — wrapped lines and the lines after a hard break alike — starts at `left`.
 *
 * The preview used to express this as `padding-left: 18pt; text-indent: -18pt`, which
 * is a *different* shape: CSS `text-indent` moves the first line only, so line 1 began
 * 18pt left of every other line. On a real question that read as the second line being
 * indented — and it disagreed with both Word and the reference paper, where a stem's
 * wrapped lines align flush under the first word with only the number in the margin.
 */
/*
 * The same twips `export/docx/numbering.ts` writes into `w:ind`, taken from the one
 * definition in `model/numbering.ts` rather than restated — the paginator measures these
 * boxes, so a preview on different geometry breaks pages where Word will not.
 */
const LIST_INDENT_TWIPS: Record<string, { left: number; hanging: number }> = {
  'question:0': QUESTION_LIST_INDENTS[0],
  'question:1': QUESTION_LIST_INDENTS[1],
  'question:2': QUESTION_LIST_INDENTS[2],
  'option:0': OPTION_LIST_INDENT,
  'statement:0': STATEMENT_LIST_INDENT,
};

/** Twips to points, the unit the preview lays the paper out in. */
const TWIPS_PER_PT = 20;

type EditHandler = (target: EditTarget, next: BiText) => void;

/** Everything the editable spans need, bundled so it threads through one prop. */
export interface EditContext {
  onEdit: EditHandler;
  /**
   * Commit text **without** ending the selection — used to flush typing that has not
   * been committed yet before the toolbar formats a range of it.
   *
   * Separate from `onEdit` because that one clears `selectedElement` (an edit normally
   * *is* the end of the interaction), and clearing it here would take the toolbar away
   * mid-gesture, before the click that opened it could act.
   */
  onEditKeepingSelection: EditHandler;
  onSelectElement: (target: EditTarget, side: "en" | "zh") => void;
  onClearSelection: () => void;
  isSelected: (target: EditTarget, side: "en" | "zh") => boolean;
  /**
   * The characters selected inside the field being edited, so the format toolbar can
   * act on a range rather than on the whole element (§ per-run formatting).
   *
   * `undefined` means no range — a caret, or no open editor — and the toolbar falls
   * back to formatting the element as a whole, which is still the right default for
   * "make this whole heading bigger".
   */
  textSelection?: TextSelection;
  onTextSelectionChange?: (selection: TextSelection | undefined) => void;
  /** True while a toolbar click is in flight, so the field must not close on blur. */
  keepEditing?: boolean;
  /**
   * The table cell being worked in, and how to change it.
   *
   * The sidebar's table panel is structure-only (§tables): its align, merge and
   * insert-row-above verbs all need a subject, and the subject is chosen here, on the
   * page, because that is where a table is legible at full width. So the page reports
   * the cell and the panel acts on it — the alternative was the panel rendering its own
   * grid of inputs, which is what made a 13-row table 26 tiny fields in a 380px column.
   */
  activeCell?: { blockId: string; cellId: string };
  onActivateCell?: (cell: { blockId: string; cellId: string }) => void;
  /**
   * Resizing a picture on the page.
   *
   * Separate from the text selection above because a block has no language side: a
   * diagram is one object, not an English half and a Chinese half, so folding it into
   * `selectedElement` would need a meaningless `side` and would let the format toolbar
   * point at something with no text to format.
   *
   * Omitted when the host passes no resize handler, which is what keeps a read-only
   * preview free of handles.
   */
  resize?: {
    /** Preview zoom, so a pointer delta converts back to page pixels. */
    scale: number;
    /** The text column in page pixels — the widest a block may be dragged. */
    maxWidthPx: number;
    selectedBlockId?: string;
    onSelectBlock: (blockId: string) => void;
    onResizeBlock: (blockId: string, widthPx: number) => void;
    /**
     * Open a block's own editor — double-clicking a diagram on the page opens the
     * drawing canvas. Absent when the host provides no editor to open, which is what
     * keeps a plain uploaded picture from advertising an action it does not have.
     */
    onOpenBlock?: (blockId: string) => void;
  };
  /**
   * Extending answer lines and spacers on the page.
   *
   * Separate from `resize` above because the two address different things in different
   * units: `resize` sizes a *block* inside a question by width, these size a *layout
   * element* by a count of lines or points. Sharing one handler would mean an id whose
   * meaning depends on which kind of element it happens to name.
   *
   * Selection is deliberately not separate — a layout element is already selectable on
   * the page (that is what arms Delete for it), so the handles simply appear on the
   * element that selection already points at.
   */
  resizeRows?: {
    /** Preview zoom, so a pointer delta converts to page pixels. */
    scale: number;
    selectedElementId?: string;
    onSelectElement: (elementId: string) => void;
    onResizeRows: (elementId: string, value: number) => void;
    /**
     * Page pixels this element could still grow into before its sheet is full.
     *
     * Read at pointer-down rather than passed as a number, because the blocks that
     * carry the handles are built before this render's pagination has run — see
     * `slackRef`.
     */
    slackFor: (elementId: string) => number;
  };
}

/**
 * Per-element overrides as inline CSS.
 *
 * Only what the teacher set is emitted, so the Tailwind class for the named style
 * still supplies everything else — the same layering the .docx uses, which is what
 * keeps the two in agreement.
 */
function formatStyle(format: TextFormat | undefined): React.CSSProperties {
  if (!format) return {};
  return {
    ...(format.fontSize !== undefined
      ? { fontSize: `${format.fontSize}pt` }
      : {}),
    ...(format.bold !== undefined
      ? { fontWeight: format.bold ? 700 : 400 }
      : {}),
    ...(format.italic !== undefined
      ? { fontStyle: format.italic ? "italic" : "normal" }
      : {}),
    ...(format.underline !== undefined
      ? { textDecoration: format.underline ? "underline" : "none" }
      : {}),
    ...(format.align ? { textAlign: format.align } : {}),
    ...(format.color ? { color: `#${format.color}` } : {}),
    ...(format.spaceBefore !== undefined
      ? { marginTop: `${format.spaceBefore}pt` }
      : {}),
    ...(format.spaceAfter !== undefined
      ? { marginBottom: `${format.spaceAfter}pt` }
      : {}),
    ...(format.fonts
      ? {
          fontFamily: `'${format.fonts.latin}', '${format.fonts.eastAsia}', serif`,
        }
      : {}),
  };
}

function TextNodeView({
  node,
  language,
  ctx,
}: {
  node: TextNode;
  language: LanguageMode;
  ctx?: EditContext;
}) {
  const listIndent = node.listRef
    ? (LIST_INDENT_TWIPS[`${node.listRef.definition}:${node.listRef.level}`] ??
      LIST_INDENT_TWIPS['question:0'])
    : undefined;

  return (
    <p
      className={`${STYLE_CLASS[node.style] ?? ""} relative`}
      style={{
        ...(node.indent ? { marginLeft: `${node.indent / 20}pt` } : undefined),
        /*
         * Word's `w:ind`, expressed directly: the whole paragraph sits at `left`, and
         * the marker hangs back into the margin (drawn absolutely, below). *No*
         * `text-indent` — that moves only the first line, which is what made line 1
         * start left of every other line and read as "the second line is indented".
         */
        ...(listIndent
          ? { paddingLeft: `${listIndent.left / TWIPS_PER_PT}pt` }
          : undefined),
        // Applied last so a deliberate override beats the style default.
        ...formatStyle(node.format),
      }}
    >
      {listIndent && node.listRef && (
        /*
         * The marker is derived, never stored, so it always matches the export.
         *
         * Positioned out of the flow rather than sitting at the head of the text: an
         * in-flow marker has to be pulled left by `text-indent`, which drags the whole
         * first *line* with it. Taking it out of the flow moves the number alone and
         * leaves every line of the paragraph flush at `left`, exactly as Word lays a
         * `w:hanging` list out and as the reference paper prints.
         */
        <span
          className="absolute font-medium"
          style={{ left: `${(listIndent.left - listIndent.hanging) / TWIPS_PER_PT}pt` }}
        >
          {node.listRef.marker}
        </span>
      )}
      {richNodes(node.text, language, node.edit, ctx)}
      {node.marks !== undefined && (
        <MarksTrail
          marks={node.marks}
          language={language}
          // Trailing hard breaks print, but the marks must not hang on an empty final
          // line. Counted from the text actually being shown, so a language mode that
          // renders only one side counts that side's breaks.
          blankLines={trailingBlankLines(marksAnchorRuns(node.text, language))}
        />
      )}
    </p>
  );
}

/**
 * A diagram on the page, drawn as live SVG rather than as the exported PNG.
 *
 * It stays sharp at any preview zoom, and it comes out of the very same renderer the
 * .docx exporter rasterizes — so what is on the page cannot disagree with what prints.
 * Its own component because it needs the worksheet font pair from the store, and a
 * hook cannot live inside `NodeView`'s branch.
 */
function DiagramNodeView({
  node,
  language,
  ctx,
}: {
  node: Extract<RenderNode, { kind: "diagram" }>;
  language: LanguageMode;
  ctx?: EditContext;
}) {
  const fonts = useWorksheetStore((s) => s.worksheet.fonts);

  // Rendered at the stored size and then scaled to whatever the drag is showing, so an
  // in-flight resize does not re-run the SVG renderer on every pointer move — the
  // geometry is unchanged, only the box it fills is.
  //
  // Memoised on exactly the four inputs, because the string is handed to
  // `dangerouslySetInnerHTML`: a fresh-but-identical string makes React replace the
  // markup, so the browser reparses and re-lays-out the whole SVG. Unmemoised that
  // happened on every ancestor render — every hover, every marquee frame — which is the
  // one case where re-running a pure function is not the expensive half.
  const svg = useMemo(
    () => diagramSvg(node.diagram, {
      widthPx: node.widthPx,
      heightPx: node.heightPx,
      language,
      fonts,
    }),
    [node.diagram, node.widthPx, node.heightPx, language, fonts],
  );

  const picture = (
    <div
      className="mx-auto inline-block h-full w-full"
      style={{ lineHeight: 0 }}
      role="img"
      aria-label={
        plain(node.altText.en) || plain(node.altText.zh) || "Economics diagram"
      }
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );

  return (
    <div className="my-2 text-center">
      <SizedBlock
        blockId={node.blockId}
        widthPx={node.widthPx}
        heightPx={node.heightPx}
        ctx={ctx}
        fallbackWidth
        openable
      >
        {picture}
      </SizedBlock>
      {node.caption && (
        <p className={STYLE_CLASS["Image Caption"]}>
          {richNodes(node.caption, language, node.captionEdit, ctx)}
        </p>
      )}
    </div>
  );
}

/**
 * A picture on the page, resizable when the host allows editing.
 *
 * Two renderings of the same block rather than one that conditionally grows handles,
 * because a read-only preview (and the print output) must contain no interactive chrome
 * at all — not hidden chrome, none. `fallbackWidth` keeps the diagram's original
 * fixed-width wrapper for that path, since an SVG told to fill `100%` of an unsized box
 * would collapse.
 */
function SizedBlock({
  blockId,
  widthPx,
  heightPx,
  ctx,
  fallbackWidth,
  openable,
  children,
}: {
  blockId: string;
  widthPx: number;
  heightPx: number;
  ctx?: EditContext;
  fallbackWidth?: boolean;
  /** Does this block have an editor to open on double-click? Diagrams do. */
  openable?: boolean;
  children: React.ReactNode;
}) {
  const resize = ctx?.resize;
  if (!resize) {
    return fallbackWidth ? (
      <div
        className="mx-auto inline-block"
        style={{ width: widthPx, height: heightPx, lineHeight: 0 }}
      >
        {children}
      </div>
    ) : (
      <>{children}</>
    );
  }

  return (
    <ResizableBlock
      blockId={blockId}
      widthPx={widthPx}
      heightPx={heightPx}
      // Taken from the block's *current* size rather than from the model's natural
      // dimensions, so the ratio the drag locks is the one already on the page.
      ratio={heightPx / widthPx}
      scale={resize.scale}
      maxWidthPx={resize.maxWidthPx}
      selected={resize.selectedBlockId === blockId}
      onSelect={() => resize.onSelectBlock(blockId)}
      onOpen={
        openable && resize.onOpenBlock ? () => resize.onOpenBlock?.(blockId) : undefined
      }
      onResize={resize.onResizeBlock}
    >
      {children}
    </ResizableBlock>
  );
}

/**
 * The ruled lines themselves.
 *
 * The pitch is fixed in points rather than in `em`, so N lines occupy the same height
 * here as the exporter's N `AnswerLine` paragraphs do. The rule sits on the bottom of
 * each row, which is what makes the *last* line ruled rather than leaving a bare gap —
 * the same shape `w:between` plus `w:bottom` produces in Word (§"Answer lines are a
 * style").
 */
function AnswerLinesView({ lines }: { lines: number }) {
  return (
    <div>
      {Array.from({ length: Math.max(0, lines) }, (_, index) => (
        <div
          key={index}
          className="border-b border-slate-400"
          style={{ height: ANSWER_LINE_PITCH_PX }}
        />
      ))}
    </div>
  );
}

/**
 * Answer lines or a spacer, extendable when the host allows editing.
 *
 * Two renderings of the same element rather than one that conditionally grows a handle,
 * for the reason `SizedBlock` gives: a read-only preview and the print output must
 * contain no interactive chrome at all, not hidden chrome. An element the IR gave no
 * `elementId` — anything rendered outside the document flow — also takes the plain
 * path, since there would be nothing for a commit to address.
 */
function SizedRows({
  node,
  ctx,
  value,
  pxPerUnit,
  min,
  step,
  unit,
  children,
}: {
  node: { elementId?: string };
  ctx?: EditContext;
  value: number;
  pxPerUnit: number;
  min: number;
  step: number;
  unit: [string, string];
  /** Draw at a given size — the in-flight one while dragging, the stored one otherwise. */
  children: (value: number) => React.ReactNode;
}) {
  const resize = ctx?.resizeRows;
  const elementId = node.elementId;
  if (!resize || !elementId) return <>{children(value)}</>;

  return (
    <ResizableRows
      elementId={elementId}
      value={value}
      pxPerUnit={pxPerUnit}
      min={min}
      maxFor={() => resize.slackFor(elementId)}
      step={step}
      unit={unit}
      scale={resize.scale}
      selected={resize.selectedElementId === elementId}
      onSelect={() => resize.onSelectElement(elementId)}
      onResize={resize.onResizeRows}
    >
      {children}
    </ResizableRows>
  );
}

function NodeView({
  node,
  language,
  ctx,
}: {
  node: RenderNode;
  language: LanguageMode;
  ctx?: EditContext;
}) {
  if (node.kind === "text")
    return <TextNodeView node={node} language={language} ctx={ctx} />;

  if (node.kind === "table") {
    /*
     * Tab order: every editable cell, row by row.
     *
     * Built from the IR rather than from the DOM, so it is the document's own order and
     * not whatever the browser's focus traversal makes of nested contenteditables.
     * Covered cells are excluded — they print nothing, so landing in one would write
     * text that never appears.
     */
    const tabOrder = node.rows
      .flatMap((row) => row)
      .filter((cell) => !cell.covered && cell.edit?.kind === "tableCell")
      .map((cell) => (cell.edit as { blockId: string; cellId: string }));

    /**
     * Move to the neighbouring cell, or report that there is none.
     *
     * Focus is moved by *asking the next cell's field to open*, which the page does by
     * clicking it — the fields are contenteditables created on demand, so there is no
     * persistent element to `.focus()`. `requestAnimationFrame` waits for the outgoing
     * field to unmount first; without it the click lands on a node React is replacing.
     */
    const moveCell = (fromCellId: string, backwards: boolean): boolean => {
      const at = tabOrder.findIndex((cell) => cell.cellId === fromCellId);
      const next = at < 0 ? undefined : tabOrder[at + (backwards ? -1 : 1)];
      if (!next) return false;
      ctx?.onActivateCell?.(next);
      requestAnimationFrame(() => {
        const cellNode = document.querySelector<HTMLElement>(
          `[data-table-cell="${CSS.escape(next.cellId)}"] [role="textbox"]`,
        );
        // A double-click is what opens a field on the page, so that is what a Tab has to
        // reproduce; focusing the idle span alone would only select it.
        cellNode?.dispatchEvent(
          new MouseEvent("dblclick", { bubbles: true, cancelable: true }),
        );
      });
      return true;
    };

    return (
      <div className="my-2">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <tbody>
              {node.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => {
                    if (cell.covered) return null;
                    const address =
                      cell.edit?.kind === "tableCell" ? cell.edit : undefined;
                    const isActive =
                      address !== undefined &&
                      ctx?.activeCell?.blockId === address.blockId &&
                      ctx.activeCell.cellId === address.cellId;
                    return (
                      <td
                        key={cellIndex}
                        data-table-cell={address?.cellId}
                        colSpan={cell.colSpan > 1 ? cell.colSpan : undefined}
                        rowSpan={cell.rowSpan > 1 ? cell.rowSpan : undefined}
                        /*
                         * Uniform, plain-ruled cells — no header shading or bold, which no
                         * HKDSE table has (§tables). Literal hex is the token rule, since
                         * this is drawn on the paper and must not follow the app theme.
                         *
                         * The active cell takes a tint so the sidebar's "cell R2C3" and
                         * its align/merge buttons have a visible subject; it is
                         * `data-print-hide`-equivalent by being a background only, which
                         * the print rules already neutralise.
                         */
                        /*
                         * An inset ring, not a tint: the selected *question* already
                         * paints `#f6f3ff` across its whole box, so a tinted cell was
                         * invisible inside it — which left the sidebar saying "cell R2C1"
                         * with nothing on the page to say which one that was. A ring
                         * paints inside the border box, so it also reserves no space and
                         * cannot shift the table's geometry.
                         */
                        className={`border border-slate-500 px-1.5 py-1 align-middle ${
                          isActive ? "ring-2 ring-inset ring-[#7c5cff]" : ""
                        }`}
                        style={{ textAlign: cell.align }}
                        /*
                         * Capture, not bubble.
                         *
                         * The cell's editable text calls `stopPropagation` on click —
                         * rightly, since selecting the *question* is the wrapper's job and
                         * a click on the text means the text. But that also stopped the
                         * cell ever being reported, so the sidebar's align and merge
                         * buttons had no subject and never appeared. Capture runs on the
                         * way down, before the child can stop anything, and it changes
                         * nothing about what the click then goes on to do.
                         */
                        onClickCapture={() => {
                          if (address) ctx?.onActivateCell?.(address);
                        }}
                      >
                        {richNodes(cell.text, language, cell.edit, ctx,
                          address
                            ? (backwards) => moveCell(address.cellId, backwards)
                            : undefined,
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {node.caption && (
          <p className={STYLE_CLASS["Table Caption"]}>
            {richNodes(node.caption, language, node.captionEdit, ctx)}
          </p>
        )}
      </div>
    );
  }

  if (node.kind === "columns") {
    // `at` is already a fraction of the row's own width (the IR normalises for
    // `indent`), so a percentage inside the shifted container is exactly right.
    const span = (from: number, to: number) => `${(to - from) * 100}%`;

    return (
      <div
        className={`${STYLE_CLASS[node.style] ?? ""} flex ${
          node.rule ? "border-b border-slate-400 pb-0.5" : ""
        }`}
        style={{
          marginLeft: node.indent ? `${node.indent / 20}pt` : undefined,
        }}
      >
        {node.cells.map((cell, index) => (
          <span
            key={index}
            className="min-w-0"
            style={{
              // The last cell takes the rest of the row so long text can still wrap.
              flex:
                index < node.cells.length - 1
                  ? `0 0 ${span(cell.at, node.cells[index + 1].at)}`
                  : "1 1 auto",
              textAlign: cell.align,
              ...formatStyle(cell.format),
            }}
          >
            {cell.marker && (
              <span className="font-medium">{cell.marker}&nbsp;</span>
            )}
            {richNodes(cell.text, language, cell.edit, ctx)}
          </span>
        ))}
      </div>
    );
  }

  if (node.kind === "spacer") {
    return (
      <SizedRows
        node={node}
        ctx={ctx}
        value={node.heightPt}
        pxPerUnit={PT_TO_PX}
        min={MIN_SPACER_PT}
        step={SPACER_STEP_PT}
        unit={["pt", "pt"]}
      >
        {(heightPt) => <div style={{ height: `${heightPt}pt` }} aria-hidden />}
      </SizedRows>
    );
  }

  if (node.kind === "divider") {
    return <hr className="my-2 border-t border-slate-400" />;
  }

  if (node.kind === "answerLines") {
    return (
      <SizedRows
        node={node}
        ctx={ctx}
        value={node.lines}
        pxPerUnit={ANSWER_LINE_PITCH_PX}
        min={MIN_ANSWER_LINES}
        step={1}
        unit={["line", "lines"]}
      >
        {(lines) => <AnswerLinesView lines={lines} />}
      </SizedRows>
    );
  }

  if (node.kind === "pageBreak") {
    // Nothing is drawn here. A manual page break is handled by the paginator, which
    // starts a new sheet at this point — so the break shows up as an actual page
    // edge rather than as a marker printed inside one long page. Rendering anything
    // would put a stray gap at the top of the following page.
    return null;
  }

  if (node.kind === "diagram") {
    return <DiagramNodeView node={node} language={language} ctx={ctx} />;
  }

  if (node.kind === "image") {
    return (
      <div className="my-2 text-center">
        <SizedBlock
          blockId={node.blockId}
          widthPx={node.widthPx}
          heightPx={node.heightPx}
          ctx={ctx}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={node.src}
            alt={plain(node.altText.en) || plain(node.altText.zh) || ""}
            width={node.widthPx}
            height={node.heightPx}
            className="mx-auto inline-block"
          />
        </SizedBlock>
        {node.caption && (
          <p className={STYLE_CLASS["Image Caption"]}>
            {richNodes(node.caption, language, node.captionEdit, ctx)}
          </p>
        )}
      </div>
    );
  }

  return null;
}

/**
 * The click target that activates a dimmed region.
 *
 * Double-click rather than a single click, matching Word and matching the rule the rest
 * of the page already follows for text: one click selects, two commit to editing. A
 * single click here would make the dimming pointless — the pointer crosses the header on
 * its way to the toolbar constantly, and any of those journeys would activate it.
 *
 * It is a `button` rather than a bare div so the region is reachable without a pointer:
 * `Enter` on the focused button does what the double-click does. It carries no visible
 * styling of its own — the dimming *is* the affordance, and a hover tint on a region
 * that is meant to recede would defeat the effect it exists to create.
 */
function RegionWake({
  label,
  onWake,
  single,
}: {
  label: string;
  onWake: () => void;
  /**
   * Wake on a single click rather than a double.
   *
   * Word asks for a double-click to step *into* the furniture, but only a single click to
   * come back out to the body — leaving is the cheaper, more common move, and the body is
   * where a worksheet is mostly written. It also keeps the escape route honest: with the
   * body dimmed and inert, a click on blank paper cannot reach the sheet's own
   * "clear the selection" handler, so without this there is no one-click way back.
   */
  single?: boolean;
}) {
  return (
    <button
      type="button"
      data-print-hide
      aria-label={label}
      title={single ? label : `${label} (double-click)`}
      className="paper-region-wake"
      onDoubleClick={(event) => {
        // The sheet's own click handler treats a landing on non-selectable space as
        // "clear everything", which includes returning focus to the body — so without
        // this the activation would be undone by the same gesture that made it.
        event.stopPropagation();
        onWake();
      }}
      // A single click must not fall through to the paper underneath either: that would
      // clear the selection as a side effect of aiming at an inactive region.
      onClick={(event) => {
        event.stopPropagation();
        if (single) onWake();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          onWake();
        }
      }}
    />
  );
}

/**
 * Header / footer chrome.
 *
 * Rendered in the page margin at true scale so the teacher sees the printed layout.
 *
 * Page-number tokens render twice, and which one is seen depends on the medium. On
 * screen they are a chip (`#` / `N`), because the .docx carries them as Word `PAGE`
 * and `NUMPAGES` *fields* whose value only exists once Word paginates — printing a
 * literal "1" in the preview would be a promise the export cannot keep. In print they
 * become the real number, because the PDF *is* the final paginated artifact and a
 * chip on paper would be a defect. The two are swapped by the print stylesheet.
 */
function HeaderFooterBand({
  value,
  language,
  edge,
  pageNumber,
  pageCount,
  totalMarks,
  editing,
  editable,
}: {
  value: HeaderFooter;
  language: LanguageMode;
  edge: "header" | "footer";
  /** 1-based index of the sheet this band belongs to. */
  pageNumber: number;
  pageCount: number;
  totalMarks: number;
  /**
   * Editing handlers, or undefined for a read-only preview.
   *
   * Present means the rows render through `BandEditor` — the same surface the masthead
   * uses — so clicking header text edits it in place and a field can be dragged between
   * the three zones. That reuse is the whole point of a header row being a `Band`.
   */
  editing?: BandEditingHandlers;
  /**
   * Whether this preview allows editing at all — which is *not* the same question as
   * whether this region is the one currently being edited.
   *
   * The two were one flag, and conflating them broke the idle state: an idle region
   * receives no handlers, so a header whose rows are all blank (the default) counted as
   * "nothing to draw" and rendered nothing — leaving no rows to see and nothing to
   * double-click back into. A region must stay visible while it is inactive, or it cannot
   * be reactivated. Only a genuinely read-only preview (a thumbnail, the print path)
   * should collapse an empty band list.
   */
  editable?: boolean;
}) {
  /*
   * Page 1 may print something different, or nothing at all (§ `HeaderFooter.firstPage`).
   * Resolved through the same helper the exporter uses, so what is previewed on page 1 is
   * what Word puts there — the preview used to ignore this entirely, which is why a
   * header suppressed on page 1 still appeared on the first sheet on screen.
   */
  const resolved =
    pageNumber === 1
      ? firstPageHeaderFooter(value)
      : { bands: value.bands ?? [], rule: value.rule, differs: false };

  if (!value.enabled) return null;

  /*
   * Which of the two row lists a structural edit here belongs to.
   *
   * Page 1 only owns its rows when the document is actually in "different" mode; in
   * "same" mode the first sheet shows the *running* rows, and adding a row there must
   * add it to every page — which is what the teacher is looking at and editing.
   */
  const scope: BandScope = pageNumber === 1 && value.firstPage ? "firstPage" : "running";

  /*
   * An empty band list still renders while editing, so there is somewhere to put the
   * first row. Returning null here meant a header whose page-1 rows had all been deleted
   * vanished from the sheet entirely, leaving no surface to rebuild it on and no way back
   * except the dialog.
   *
   * `bandsShouldRender` owns the rule so it can be tested without a DOM — the inline
   * version of it was wrong in a way that only showed up as a surface vanishing mid-edit.
   *
   * Keyed on `editable`, not on `editing`: an idle region has no handlers but must still
   * be drawn, or there is nothing left on the page to double-click back into.
   */
  const bands = resolved.bands;
  if (!bandsShouldRender(bands, Boolean(editing) || Boolean(editable))) return null;

  const body = editing ? (
    <BandEditor
      bands={bands}
      language={language}
      totalMarks={totalMarks}
      onMove={editing.onMove}
      onEditField={editing.onEditField}
      onRemoveField={editing.onRemoveField}
      onAddField={editing.onAddField}
      onAddRow={editing.onAddRow ? () => editing.onAddRow!(scope) : undefined}
      onRemoveRow={editing.onRemoveRow}
      page={{ number: pageNumber, count: pageCount }}
      // Named per surface, and page 1 says so — three band lists print on one sheet and
      // they look alike, so "which header am I changing" has to be visible where the
      // change is made rather than only in a dialog that covers it.
      label={
        scope === "firstPage"
          ? `Page 1 ${edge}`
          : value.firstPage
            ? `${edge === "header" ? "Header" : "Footer"} · pages 2+`
            : edge === "header"
              ? "Header · every page"
              : "Footer · every page"
      }
      selection={editing.selection}
    />
  ) : (
    bands.map((band) => (
      <ReadOnlyBandRow
        key={band.id}
        band={band}
        language={language}
        totalMarks={totalMarks}
        page={{ number: pageNumber, count: pageCount }}
      />
    ))
  );

  return (
    <div
      // The printed rows, and the only thing the paginator may measure — the region's
      // wake overlay is a sibling and would otherwise be counted as header height.
      data-band-rows
      /*
       * Header and footer text is **black**, like every other mark on the paper.
       *
       * It was `text-slate-600`, which is wrong twice over. The exporter writes no
       * `w:color` for these runs, so Word prints them black — a grey preview was
       * therefore lying about the document, the same way the dropped `w:jc` was. And a
       * `slate` token is a *chrome* colour: the paper never themes, so anything drawn on
       * it takes a literal value (§ UI tokens vs the paper).
       *
       * The rule keeps its own grey: it is a hairline, and `#999999` is the literal the
       * exporter puts in `w:pBdr`.
       */
      className={`flex items-baseline gap-2 text-xs text-[#111111] ${
        edge === "header"
          ? resolved.rule
            ? "mb-2 border-b border-[#999999] pb-1"
            : "mb-2"
          : resolved.rule
            ? "mt-2 border-t border-[#999999] pt-1"
            : "mt-2"
      }`}
    >
      <div className="flex-1">{body}</div>
    </div>
  );
}

/**
 * One header row, rendered without any editing chrome.
 *
 * Used by the read-only preview and the print path, where `BandEditor`'s zone outlines
 * and add buttons must not appear at all — not hidden, absent (§ read-only preview).
 */
function ReadOnlyBandRow({
  band,
  language,
  totalMarks,
  page,
}: {
  band: Band;
  language: LanguageMode;
  totalMarks: number;
  /** The sheet being drawn, so a page-number field prints its number (§ `withPageNumber`). */
  page?: { number: number; count: number };
}) {
  const zones = zonesOf(band);
  const cell = (name: ZoneName, align: string) => (
    <div className={`flex-1 ${align}`}>
      {zones[name].map((field) => (
        // `bandFieldStyle` is shared with `BandEditor` rather than reimplemented, and it
        // was previously missing here entirely: a field's `fontSize`, weight, colour and
        // font were dropped, so a 14pt bold title previewed *and printed* at the
        // container's 12pt. That also made the region focus look like a bug — entering
        // the header seemed to enlarge its text, when the idle state was the wrong one.
        // `whitespace-pre-wrap` for the reason `BandEditor` sets it: a field's wording
        // carries its own spacing ("Full marks: " · 45 · " marks"), and HTML would
        // collapse it away — here on the path that actually prints and becomes the PDF.
        <span key={field.id} className="mx-0.5 whitespace-pre-wrap" style={bandFieldStyle(field)}>
          {/* The sheet is passed to `bandFieldText`, which substitutes the page number
              only when one is given — the .docx backend passes none, so Word still gets
              the placeholder it needs to emit a live PAGE field rather than a literal
              frozen to whichever page the preview happened to draw.

              Rendered through `richNodes` in every case, including page numbers: the
              wording around a number is authored rich text now, so flattening it to
              `plain` here would drop a bold or coloured run that the editing path and
              the export both honour. */}
          {richNodes(bandFieldText(field, totalMarks, page), language)}
        </span>
      ))}
    </div>
  );
  return (
    <div className="flex items-baseline gap-2">
      {cell("left", "text-left")}
      {cell("center", "text-center")}
      {cell("right", "text-right")}
    </div>
  );
}

/**
 * One draggable item on the page.
 *
 * Direct manipulation is the point: the teacher grabs the thing itself rather than a
 * proxy row in a list. The drop indicator is drawn on the hovered item's leading or
 * trailing edge depending on which half the pointer is in, so the insertion point is
 * always visible before the drop commits.
 *
 * The handle is a hover-revealed grip rather than the whole element, because the
 * element's text is already a click target for editing — making the text itself
 * draggable would make it impossible to select a word.
 */
/*
 * How tall a row must be to carry the grip's chevrons.
 *
 * The full pill is 34px: a 12px grip glyph, two 8px chevrons and 2px of padding. Below
 * that the chevrons come off and the glyph alone stands in, so a short row's handle cannot
 * spill onto its neighbours'.
 *
 * The 34 is deliberately a **constant, not a measurement** — see `showChevrons` for why
 * measuring it closes a loop.
 */
const CHEVRON_MIN_HEIGHT_PX = 34;

function DraggableItem({
  id,
  dragId,
  onDragStart,
  onDragEnd,
  onDrop,
  multiSelected,
  dragCount,
  runRole,
  runLength,
  isInsertAnchor,
  onAnchorHere,
  onInsertHere,
  children,
  className = "",
}: {
  id: string;
  dragId?: string;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDrop: (position: "before" | "after") => void;
  /** Part of a marquee/⌘A multi-selection. */
  multiSelected?: boolean;
  /**
   * How many items this grip would carry — the selection size when the item is part of
   * one, otherwise 1. Only used to decide whether the whole selection should read as
   * in-flight, so the other members dim alongside the one under the pointer.
   */
  dragCount?: number;
  /**
   * Where this item sits in an unbroken run of selected items.
   *
   * A selection of adjacent items shows **one** tall pill spanning the run rather than
   * a stack of identical small ones: the run moves as a single thing, so one handle is
   * the honest control for it, and a column of pills invites aiming at a particular one
   * as though they did different things. `head` draws the pill and stretches it over
   * the members below; `tail` members draw none. A gap in the selection starts a new
   * run, so two separate groups keep two separate handles.
   */
  runRole?: "head" | "tail";
  /** How many items the pill must span, when this item is a run's `head`. */
  runLength?: number;
  /**
   * This item is the add rail's insertion anchor: the next thing added lands directly
   * below it, and the caret says so.
   */
  isInsertAnchor?: boolean;
  /** Claim this item's trailing edge as the insert position, from the gap's `+`. */
  onAnchorHere?: () => void;
  /** Open the insert menu for this position. */
  onInsertHere?: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  const [edge, setEdge] = useState<"before" | "after" | undefined>();
  // In flight either because this is the grabbed item, or because it travels with it as
  // part of the same selection. Without the second case a bulk drag dimmed one item
  // while four others sat still, reading as "only this one is moving".
  const isDragging =
    dragId === id || (Boolean(dragId) && multiSelected && (dragCount ?? 1) > 1);
  const isTarget = Boolean(dragId) && !isDragging;

  /*
   * How far a run's merged pill has to stretch.
   *
   * Measured rather than derived: the members are separate siblings of unknown and
   * unequal height — a one-line divider and a five-part structured question are both
   * one item — so the span is only knowable from the laid-out DOM. It is re-measured
   * whenever the run's identity or length changes, and on resize, because a reflow that
   * rewraps a question changes the run's height without changing its membership.
   *
   * The pill is positioned from *this* item's top, so the height wanted is the distance
   * from here to the last member's bottom.
   */
  const rootRef = useRef<HTMLDivElement>(null);
  const [runHeight, setRunHeight] = useState<number | undefined>();
  const isRunHead = runRole === "head" && (runLength ?? 1) > 1;

  /*
   * This item's own height, so the grip can never be taller than the row it belongs to.
   *
   * The document runs on a fixed 12pt line with no paragraph spacing (§ One fixed line),
   * so a one-line item's row is ~20px while the grip's intrinsic content — two chevrons,
   * a grip glyph and its padding — is 34px. Every short row therefore grew a pill that
   * spilled 14–26px into its neighbours, and a column of headings and questions rendered
   * as a stack of overlapping chips.
   */
  const [itemHeight, setItemHeight] = useState<number | undefined>();

  /*
   * Measured, and **only stored when it actually changes**.
   *
   * This is a `ResizeObserver` whose result feeds a style on a child of the very node it
   * observes (the grip's `maxHeight`), which is a feedback loop by construction: measure →
   * setState → re-style → observe → measure. It stayed quiet while the two values happened
   * to agree, and ran away as soon as they could not — sub-pixel heights never settle, so
   * React saw an unbounded update chain and threw "Maximum update depth exceeded".
   *
   * Rounding is what closes it. A fractional height read back from `getBoundingClientRect`
   * differs from the integer that produced it, so every pass looked like a change; whole
   * pixels give the loop a fixed point to land on. Comparing before setting then makes the
   * steady state cost nothing at all, which also stops the observer re-rendering a page of
   * items whenever anything reflows.
   */
  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const measure = () => {
      const next = Math.round(node.getBoundingClientRect().height);
      setItemHeight((current) => (current === next ? current : next));
    };
    const frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [id]);

  /*
   * Does this row have room for the chevrons?
   *
   * A merged pill always keeps them, spanning a whole run and so tall by construction.
   * Every other row decides from `itemHeight` — and that decision is a **feedback loop**,
   * because the chevrons live inside the grip, the grip is inside the box the
   * `ResizeObserver` above watches, and the pill is `overflow-hidden` under a `maxHeight`
   * cap taken from the same measurement. Dropping the chevrons changes the pill's content
   * height, the observer fires, the height re-reads on the other side of the threshold,
   * and they come back. That is bistable rather than convergent, so it never settles and
   * React eventually reports "Maximum update depth exceeded" from this component's
   * `measure`.
   *
   * Two things keep it closed, and both are needed:
   *
   *  - **A fixed threshold**, never one derived from what is currently drawn. The
   *    comparison is against a constant, so for a given measured height the answer is the
   *    same every pass. That is what makes the state a fixed point: the observer can fire
   *    as often as it likes and the decision does not move.
   *  - **Rounding, in the observer.** A real item measures 36.3535…, so an unguarded
   *    `setItemHeight` wrote a different number every pass and kept the chain alive even
   *    when the chevron decision was stable.
   *
   * Before first measurement the chevrons are **off** rather than on. Either default is a
   * guess for one frame, and hiding is the safe one: a pill drawn too tall for its row
   * overlaps its neighbours, where one drawn too short merely looks plain.
   */
  const showChevrons = isRunHead || (itemHeight ?? 0) >= CHEVRON_MIN_HEIGHT_PX;

  useEffect(() => {
    // A stale height on a non-head needs no clearing: the pill below only reads
    // `runHeight` when `isRunHead`, and the next run this item heads re-measures before
    // painting. Clearing it here would be a synchronous setState in an effect for a
    // value nothing is currently rendering.
    if (!isRunHead) return;
    const measure = () => {
      const node = rootRef.current;
      if (!node) return;
      /*
       * Walk the *wrappers*, not this element.
       *
       * Each block is rendered inside its own `<div key={block.key}>` on the sheet, so
       * `DraggableItem`'s root has no siblings at all — walking from it found nothing
       * and the pill stayed one item tall. The wrapper is what sits in the page's flex
       * column beside the run's other members.
       */
      let last: Element = node.parentElement ?? node;
      for (let step = 1; step < (runLength ?? 1); step += 1) {
        const next = last.nextElementSibling;
        // A run split by a page break loses its remaining members to the next sheet, so
        // the walk simply stops and the pill spans the part on this page.
        if (!next) break;
        last = next;
      }
      // Rounded and compared before storing, for the same reason `itemHeight` is: this
      // observes the whole page column and writes a `height` back onto a node inside it,
      // so an unconditional setState is a loop that a fractional pixel keeps alive.
      const next = Math.round(
        last.getBoundingClientRect().bottom - node.getBoundingClientRect().top,
      );
      setRunHeight((current) => (current === next ? current : next));
    };
    // After the selection's re-render has committed, so the run is laid out — and so
    // the first measurement is not a synchronous setState inside the effect, which
    // cascades a second render before the browser has painted the first.
    const frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    // The run's own box and its last member both move it; observing the page column
    // catches a reflow anywhere above that shifts the whole run.
    if (rootRef.current) observer.observe(rootRef.current);
    // The sheet's flex column: a reflow in any member changes where the run ends.
    const column = rootRef.current?.parentElement?.parentElement;
    if (column) observer.observe(column);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [isRunHead, runLength, id]);

  return (
    <div
      ref={rootRef}
      data-flow-id={id}
      onDragOver={(event) => {
        if (!isTarget) return;
        event.preventDefault();
        const bounds = event.currentTarget.getBoundingClientRect();
        setEdge(
          event.clientY < bounds.top + bounds.height / 2 ? "before" : "after",
        );
      }}
      onDragLeave={() => setEdge(undefined)}
      onDrop={(event) => {
        if (!isTarget || !edge) return;
        event.preventDefault();
        onDrop(edge);
        setEdge(undefined);
      }}
      className={`group/drag relative rounded ${isDragging ? "opacity-40" : ""} ${
        multiSelected ? "bg-[#efe9ff] ring-1 ring-[#a78bfa]" : ""
      } ${className}`}
    >
      {edge && (
        // The insertion line, with a cap at each end. A bare 2px rule was easy to
        // mistake for the document's own divider element; the caps read unambiguously
        // as "this is where it lands".
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-x-0 z-20 flex items-center ${
            edge === "before" ? "-top-0.5" : "-bottom-0.5"
          }`}
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#7c5cff]" />
          <span className="h-0.5 flex-1 bg-[#7c5cff]" />
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#7c5cff]" />
        </span>
      )}

      {/*
       * The insert gap: where the next item lands, and a target for aiming at it.
       *
       * **It reserves no space.** The strip is absolutely positioned across the item's
       * trailing edge, so it neither moves the text nor changes what the paginator
       * measures — the page must break in exactly the places Word will break it, and a
       * hover affordance that pushed content down would make the preview lie about the
       * document. It draws *outside* the flow for the same reason the drag grip does.
       *
       * **The caret is the drop indicator's shape**, deliberately: dot–line–dot in the
       * same violet. A drag drop and an insert put an item in the identical position, so
       * showing them differently would invent a distinction the document does not have.
       * The anchored state is solid; hovering an unanchored gap previews it at half
       * strength, which is what makes the whole strip discoverable by sweeping down the
       * page rather than by being told.
       *
       * It is `data-print-hide` chrome, and hidden entirely in print preview — the mode
       * claims to show the sheet exactly as it prints (§print preview is the print
       * rules), so an insertion affordance there would be a lie about the paper.
       */}
      {onInsertHere && (
        /*
         * Hovering **previews** the position; it does not take it.
         *
         * An earlier version moved the anchor on `mouseenter`, which meant sweeping the
         * pointer down the page silently rewrote where the rail would insert — the
         * destination then depended on where the mouse came to rest, which is not a
         * decision anyone made. The anchor moves on a click or on the `+`; the gap under
         * the pointer just shows what taking it would mean.
         */
        <span
          data-print-hide
          className="group/gap absolute inset-x-0 -bottom-1.5 z-10 flex h-3 items-center"
        >
          {/*
           * Three weights, because these are three different claims. The anchored gap is
           * a *standing* state — it sits on the page until something moves it, so at full
           * strength it reads as a rule the document owns, and on the last item it looks
           * like a divider. Half strength says "here" without competing with the text.
           * Hovering is fainter still: it is only a preview.
           */}
          <span
            aria-hidden
            className={`pointer-events-none flex flex-1 items-center transition-opacity ${
              isInsertAnchor
                ? "opacity-55 group-hover/gap:opacity-100"
                : "opacity-0 group-hover/gap:opacity-30"
            }`}
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#7c5cff]" />
            <span className="h-0.5 flex-1 bg-[#7c5cff]" />
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#7c5cff]" />
          </span>
          {/*
           * The button sits **on** the caret line, centred, not in the margin.
           *
           * The margin is already a column: the drag grip occupies `-left-7` for its
           * whole row, and a gap sits *between* two rows — so a `+` there overlapped the
           * grip above it and the grip below it at once, three controls fighting for one
           * 28px strip. Centring it moves it into space nothing else claims, and it
           * gains a meaning it did not have out there: the line is where the item lands
           * and the button is on the line.
           *
           * It carries the paper's own background so the rule appears to pass behind it
           * rather than through it — the literal hex is the token rule, since this is
           * drawn on the sheet and must not follow the app's theme.
           */}
          <button
            type="button"
            data-print-hide
            aria-label="Insert here"
            title="Insert here"
            onClick={(event) => {
              event.stopPropagation();
              onAnchorHere?.();
              onInsertHere();
            }}
            className={`absolute left-1/2 flex h-4 w-4 -translate-x-1/2 cursor-pointer items-center justify-center rounded-full border border-[#c4b5fd] bg-white text-[#7c5cff] shadow-sm transition-opacity hover:border-[#7c5cff] hover:bg-[#f6f3ff] ${
              isInsertAnchor
                ? "opacity-55 group-hover/gap:opacity-100"
                : "opacity-0 group-hover/gap:opacity-100"
            }`}
          >
            <PlusIcon size={10} />
          </button>
        </span>
      )}
      {/*
       * Sits in the page margin so it never covers content.
       *
       * It reads as a *control* rather than as ink: a filled pill with a border and a
       * grip flanked by two chevrons. The previous version was six 14px dots at
       * `#b9b4ae` on bare paper, which at the preview's fit-to-width scale was fainter
       * than the document's own text and looked like a printing artifact — several
       * teachers' first question about reordering was where the handle *was*.
       *
       * Three deliberate choices:
       *  - **A quiet resting state instead of none.** It is visible at all times, so
       *    the affordance can be discovered without first guessing that hovering
       *    reveals something; hovering the item darkens it and hovering the grip itself
       *    turns it violet. Fully hiding it is what made reordering undiscoverable,
       *    while painting it at full strength always would run a row of hard controls
       *    down the margin of what is meant to look like paper. The muting is done
       *    with colour rather than `opacity`, because fading the pill also faded its
       *    border — the very part that makes it read as a control.
       *  - **Chevrons around the grip.** Six dots say "handle"; an up/down pair says
       *    which axis it moves on, which is the thing being asked of it here.
       *  - **A real hit target.** The pill is ~20x30 rather than a 14px glyph, so it
       *    can be grabbed without pixel-hunting. It stays inside `-left-7` (28px)
       *    because the narrow margin preset leaves only ~48px of paper to the left,
       *    and a wider control would hang off the sheet.
       */}
      {/*
       * A run's non-head members draw no grip at all: the head's pill already spans
       * them, and a second control inside the same span would offer a choice that does
       * not exist — every one of them moves the identical run.
       */}
      {runRole !== "tail" && (
      <span
        draggable
        // Marks the one place a pointer-down belongs to drag-to-reorder rather than to
        // a marquee sweep. The sweep guard tests for this attribute, so the two
        // gestures divide by *where* the press lands instead of the sweep conceding
        // every item body to a drag that can only ever start on this grip.
        data-drag-grip
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          // The native drag image would be a full-page-width slab of text scaled by
          // the preview's zoom; `DragGhost` draws a compact chip instead.
          hideNativeDragImage(event);
          onDragStart();
        }}
        onDragEnd={() => {
          onDragEnd();
          setEdge(undefined);
        }}
        role="button"
        tabIndex={-1}
        data-print-hide
        aria-label="Drag to reorder"
        title="Drag to reorder"
        /*
         * Literal hex throughout: this sits on the paper, which never themes, so a
         * semantic token would paint a dark chip on a white page in dark mode.
         *
         * Height: a merged pill spans its whole run, so it is sized in px from the
         * measurement above rather than hugging one item's first line. Every other grip
         * is **capped at its own row's height**, because on a 12pt line an item can be
         * shorter than the grip's intrinsic content and the overflow lands on top of the
         * neighbouring grips. `top-0.5` is dropped from the budget so the cap accounts
         * for the offset the pill is already sitting at.
         */
        style={
          isRunHead && runHeight
            ? { height: `${runHeight}px` }
            : itemHeight
              ? { maxHeight: `${Math.max(itemHeight - 2, 12)}px` }
              : undefined
        }
        className={`absolute -left-[26px] top-0.5 flex w-[18px] cursor-grab flex-col items-center justify-center gap-0 overflow-hidden rounded border py-0.5 leading-none transition-colors duration-150 active:cursor-grabbing ${
          isDragging
            ? "border-[#7c5cff] bg-[#7c5cff] text-white shadow-sm"
            : isRunHead
              // A selected run's handle is already "on", so it takes the accent at rest
              // rather than the quiet paper grey — it is describing a live selection,
              // not offering an affordance that has yet to be engaged.
              ? "border-[#a78bfa] bg-[#efeaff] text-[#7c5cff] shadow-[0_1px_1.5px_rgba(0,0,0,0.07)] hover:!border-[#7c5cff] hover:!bg-[#e4dcff]"
              : "border-[#cfc9c2] bg-[#faf9f8] text-[#9a948e] shadow-[0_1px_1.5px_rgba(0,0,0,0.07)] group-hover/drag:border-[#a99cf0] group-hover/drag:bg-white group-hover/drag:text-[#6b6764] hover:!border-[#7c5cff] hover:!bg-[#efeaff] hover:!text-[#7c5cff]"
        }`}
      >
        {/* Resting opacity is carried by the *colour*, not by `opacity`: fading the
            whole pill washed out its border too, which is the part that makes it read
            as a control at all. Colour-only muting keeps the shape crisp while it
            recedes. */}
        {/*
         * On a merged pill the chevrons pin to the two ends of the span while the count
         * holds the middle, so the handle reads as bracketing the run it covers. Packed
         * together in the centre they described only their own 34px, leaving a tall
         * pill looking like a short one floating in a tall box.
         *
         * They are **dropped entirely on a short row**. The chevrons are decorative —
         * they say "this can move up or down", which the grip glyph already implies —
         * and they are the ~16px that does not fit beside a single 12pt line. Clipping
         * them instead would leave half an arrowhead against the pill's edge.
         */}
        {showChevrons && <ChevronUpIcon size={8} />}
        {isRunHead ? (
          <span className="flex flex-1 flex-col items-center justify-center gap-1">
            <GripIcon size={12} />
            <span className="text-[9px] font-semibold tabular-nums">{runLength}</span>
            <GripIcon size={12} />
          </span>
        ) : (
          <GripIcon size={12} />
        )}
        {showChevrons && <ChevronDownIcon size={8} />}
      </span>
      )}
      {children}
    </div>
  );
}

/**
 * One item in the printed flow, with the node that renders it.
 *
 * The packing rules — what opens a page, which trailing page survives — live in
 * `pagination.ts` as pure functions over `PackItem`; this adds only the React node,
 * which is the part that cannot be tested without a DOM.
 */
interface FlowBlock extends PackItem {
  node: React.ReactNode;
}

/**
 * Splits the flow across real sheets of paper.
 *
 * The preview used to be a single container with `minHeight: A4` that simply grew:
 * a worksheet twice as long as a page rendered as one sheet of double height. That
 * silently disagreed with the .docx — Word paginates, so the teacher could not see
 * where their questions would actually land, which is most of the point of a print
 * preview.
 *
 * Pagination has to be *measured* rather than computed, because the height of a
 * question depends on font metrics, bilingual stacking and wrapping that only the
 * browser knows. So this renders the flow once in a hidden probe at the true content
 * width, records each block's height, and then packs blocks into page-height buckets.
 *
 * Blocks are kept whole. Splitting a question across a page boundary would need Word's
 * own line-breaking to agree with ours to be worth anything, and a question that runs
 * over the boundary is better shown intact on the next page than cut at a place Word
 * will not cut. A block taller than a whole page gets its own page and is allowed to
 * overflow, which is the honest rendering of "this cannot fit".
 */
function usePagination(
  blocks: FlowBlock[],
  contentHeightPx: number,
  deps: unknown[],
): {
  pages: FlowBlock[][];
  /** For each page, the id of the manual break that opened it, if one did. */
  openedBy: (string | undefined)[];
  /** Each block's measured height, for callers that need to reason about a page's fill. */
  heights: Map<string, number>;
  probeRef: React.RefObject<HTMLDivElement | null>;
} {
  const probeRef = useRef<HTMLDivElement>(null);
  const [heights, setHeights] = useState<Map<string, number>>(new Map());

  // Measure after paint, and re-measure whenever the content or the page geometry
  // changes. A ResizeObserver on the probe catches reflows the dependency list cannot
  // see — a web font finishing loading, or a diagram image arriving late.
  useEffect(() => {
    const probe = probeRef.current;
    if (!probe) return;

    /*
     * Each block's height is the distance to the *next* block, not its own box plus its
     * margins.
     *
     * Adding `marginTop + marginBottom` to `offsetHeight` looks equivalent and is not:
     * adjacent margins collapse, so summing both sides counts each gap twice for the
     * pair that shares it while the last block contributes a trailing margin the page
     * never shows. On a real worksheet the error ran the other way often enough to let
     * a page accept one row more than it had room for — the last of 21 answer lines was
     * drawn 21px below the text column and 13px into the footer.
     *
     * Measuring top-to-top asks the browser what it actually did with the gaps, which
     * is the same question the rendered sheet answers. The final block has no successor
     * and so is measured to the probe's own end.
     */
    const measure = () => {
      const next = new Map<string, number>();
      const children = Array.from(probe.children) as HTMLElement[];
      const probeEnd = probe.getBoundingClientRect().bottom;
      for (const [index, child] of children.entries()) {
        const key = child.dataset.blockKey;
        if (!key) continue;
        const top = child.getBoundingClientRect().top;
        const nextTop =
          children[index + 1]?.getBoundingClientRect().top ??
          Math.max(probeEnd, child.getBoundingClientRect().bottom);
        next.set(key, Math.max(0, nextTop - top));
      }
      setHeights((prev) => {
        if (prev.size === next.size && [...next].every(([k, v]) => prev.get(k) === v)) {
          return prev; // Bail out rather than re-render on an identical measurement.
        }
        return next;
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(probe);
    for (const child of Array.from(probe.children)) observer.observe(child);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const { pages, openedBy } = useMemo(
    () => packPages(blocks, heights, contentHeightPx),
    [blocks, heights, contentHeightPx],
  );

  return { pages, openedBy, heights, probeRef };
}

/**
 * Did this click land on empty page, rather than on something selectable?
 *
 * Asked of the click's *target*, walking up from it, because the sheet is a stack of
 * nested layout divs: the whitespace below the last question is a child of the paper,
 * not the paper itself, so an identity test against the paper node reported "not
 * background" for the most obvious place a teacher clicks to deselect.
 *
 * The selectable things are marked in the DOM already — questions carry `data-question-id`,
 * flow items `data-flow-id`, header/footer and masthead fields `data-field-id`, and every
 * piece of interactive chrome is a real `button`. Anything that matches none of them is
 * page background.
 *
 * `data-field-id` is load-bearing and was the bug: the list named `data-band-field`, an
 * attribute nothing has ever rendered, so **every click inside an active header counted
 * as blank paper**. `clearPageSelection` then ran, and returning to the body is part of
 * clearing — so clicking a header row to edit it immediately deactivated the header. The
 * region could be entered but never worked in.
 *
 * A selector naming an attribute that does not exist fails silently and always in the
 * same direction, so a test asserts the two agree.
 */
function isBlankAreaClick(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !target.closest(BLANK_CLICK_EXEMPT);
}

/**
 * What a click may land on without counting as "blank paper".
 *
 * Exported so a test can mount the real band rows and assert every field they draw is
 * matched by it — the mismatch above was invisible from either side alone.
 */
export const BLANK_CLICK_EXEMPT =
  "[data-question-id],[data-flow-id],[data-doc-field],[data-field-id],[data-band-rows],button,a,input,textarea,select,[contenteditable='true']";

/**
 * The two printed blocks that are document *fields* rather than flow items: the title
 * and the instructions.
 *
 * They occupy a line on the page and can be selected, formatted and deleted like
 * anything else, but they are top-level `Worksheet` fields — they have no flow id, so
 * `removeMany` cannot address them and the marquee could not see them. Both symptoms
 * followed: sweeping the whole page skipped them, and because they matched none of the
 * selectors in `isBlankAreaClick`, clicking one counted as clicking bare paper and
 * *cleared* the selection instead of adding to it.
 *
 * Marking them with `data-doc-field` fixes the second directly and gives the sweep
 * something to key on for the first. The value is the `EditTarget` kind rather than an
 * id, because there is exactly one of each per document — which is also why deleting
 * them empties the field instead of removing a row (§`describeDelete`).
 */
const DOC_FIELD_TARGETS: Record<string, EditTarget> = {
  worksheetTitle: { kind: "worksheetTitle" },
  worksheetInstructions: { kind: "worksheetInstructions" },
};

function DocumentField({
  target,
  multiSelected,
  children,
}: {
  target: EditTarget;
  /** Part of a marquee/⌘A selection — styled exactly as `DraggableItem` styles one. */
  multiSelected?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      data-doc-field={target.kind}
      className={`rounded ${multiSelected ? "bg-[#efe9ff] ring-1 ring-[#a78bfa]" : ""}`}
    >
      {children}
    </div>
  );
}

interface Props {
  worksheet: Worksheet;
  mode: OutputMode;
  selectedQuestionId?: string;
  /**
   * Select a question, or clear the selection when called with nothing — clicking blank
   * paper has to be able to say "no question is selected", and leaving that impossible
   * kept a question armed for Delete after the user had visibly clicked away from it.
   */
  onSelectQuestion?: (questionId?: string) => void;
  /** Commit an in-place edit made on the page. Omit to render read-only. */
  onEdit?: EditHandler;
  /** Delete the element named by a target (Delete/Backspace on the page). */
  onDelete?: (target: EditTarget) => void;
  /** Delete a whole question selected on the page. Omit to disable that key. */
  onDeleteQuestion?: (questionId: string) => void;
  /** Delete a layout element selected on the page. Omit to disable that key. */
  onDeleteLayout?: (elementId: string) => void;
  /** Delete several flow items (questions and/or layout elements) at once. */
  onBulkDelete?: (ids: string[]) => void;
  /** Duplicate several flow items at once — what paste does. */
  onBulkDuplicate?: (ids: string[]) => void;
  /** Merge formatting into the element named by a target. Omit to hide the toolbar. */
  onFormat?: (target: EditTarget, patch: TextFormat) => void;
  /**
   * Resize an image or diagram block dragged on the page. Omit to render pictures
   * without handles, which is what keeps this component usable as a read-only preview.
   *
   * Called once per gesture, when the pointer is released: the in-flight size is local
   * to the handle so a drag cannot fill the undo stack (§ResizableBlock).
   */
  onResizeBlock?: (blockId: string, widthPx: number) => void;
  /**
   * Extend answer lines or a spacer dragged on the page. Omit to render them without a
   * handle, the same way `onResizeBlock` is what makes pictures resizable.
   *
   * The value is a line count for `answerLines` and a height in points for `spacer`;
   * the element's own kind decides which, so the host passes it straight to
   * `updateLayoutElement`. Called once per gesture, on release.
   */
  onResizeRows?: (elementId: string, value: number) => void;
  /**
   * Divide answer lines into two elements, when a drag asks for more rows than the
   * sheet can hold. Omit to cap the drag instead, with no way to exceed a page.
   *
   * `keep` stays on this element and `overflow` becomes new ones immediately after it,
   * each no taller than `perPage` so no piece outgrows its own sheet.
   */
  onSplitRows?: (
    elementId: string,
    keep: number,
    overflow: number,
    perPage: number,
  ) => void;
  /**
   * Open a block's own editor, from a double-click on the page.
   *
   * Only diagrams have one. The preview does not know what that editor is — it reports
   * "this block was double-clicked" and the host decides, which is what keeps the
   * drawing canvas out of the render path (§ read-only preview).
   */
  onOpenBlock?: (blockId: string) => void;
  /** Current formatting of a target, so the toolbar can show its state. */
  formatOf?: (target: EditTarget) => TextFormat | undefined;
  /**
   * The current text of a target, so the toolbar can read what a selected *range*
   * already carries. Without it the bar would report the element's formatting for a
   * selection that overrides it.
   */
  textOf?: (target: EditTarget) => BiText | undefined;
  /**
   * Format just the characters in `[start, end)` of one language side — the per-run
   * path. Omit to keep formatting whole-element only.
   */
  onFormatRuns?: (
    target: EditTarget,
    side: "en" | "zh",
    start: number,
    end: number,
    patch: TextFormat,
  ) => void;
  /**
   * Move `id` to `targetId`'s position in the document flow. Omit to disable page drag.
   * `position` says which side of the target to land on.
   */
  onReorder?: (id: string, targetId: string, position: "before" | "after") => void;
  /**
   * Move a whole marquee selection at once, as one undo entry.
   *
   * Separate from `onReorder` rather than folded into it as an array: the two are
   * different store verbs — one orders a single item, the other a run — and a run
   * preserves *document* order among its members regardless of the order they were
   * selected in. Omit to leave a multi-selection dragging one item at a time.
   */
  onReorderMany?: (ids: string[], targetId: string, position: "before" | "after") => void;
  /**
   * Live masthead editing. Omit to render bands read-only, which is what keeps this
   * component usable for a non-interactive preview.
   */
  bandEditing?: BandEditingHandlers;
  /**
   * The same four verbs for the page header and footer.
   *
   * Separate props rather than one shared set because they address different parts of
   * the document — a field id is only unique within its own band list — but the shape is
   * identical, which is what lets `BandEditor` serve all three surfaces.
   */
  headerEditing?: BandEditingHandlers;
  footerEditing?: BandEditingHandlers;
  /**
   * Add a first question straight from the empty page. Omit to render the empty state
   * as plain prose — a read-only preview has nowhere to put the click.
   */
  onAddQuestion?: (typeId: string) => void;
  /**
   * How the flow ended up divided across sheets, published after each repagination.
   *
   * Pages are derived here by measurement (§usePagination) and exist nowhere else, so
   * anything outside this component that needs to talk about "page 3" — the page rail
   * — has to be told. Reporting the composition rather than just a count is what lets
   * the rail delete or move a page in terms the store understands: flow ids.
   */
  onPagesChange?: (pages: PageComposition[]) => void;
  /**
   * The flow items being dragged on the page, or undefined when none are.
   *
   * Published so the page rail can offer its cards as drop targets — the only way to
   * move an item to a page that is not currently on screen. The drag state itself
   * stays local here: it is transient interaction state that must never reach an undo
   * entry, which is also why it is reported rather than lifted.
   *
   * It is the *run*, not the grabbed id, for the same reason `onDrop` sends a run: a
   * drag that starts on a member of a multi-selection carries the whole selection
   * (§dragCount). Reporting one id let the rail move one item out of five, silently
   * discarding the sweep — the drop target has no way to know the rest were selected.
   */
  onDragItemChange?: (ids: string[] | undefined) => void;
}

/**
 * What an empty worksheet offers.
 *
 * The previous version was three lines of grey text telling the teacher to go and
 * find two named buttons in "the panel on the right" — an instruction, not an
 * affordance, and one that went stale the moment those buttons moved to the add rail.
 * An empty document is the best possible moment to offer the first action, so the
 * buttons are simply *here*, doing what the sentence used to describe.
 */
function EmptyState({ onAddQuestion }: { onAddQuestion: (typeId: string) => void }) {
  return (
    <div className="mt-10 rounded-2xl border-2 border-dashed border-[#ddd8d2] px-6 py-12 text-center">
      <p className="text-[15px] font-semibold text-[#4a4643]">
        Start your worksheet
      </p>
      <p className="mt-1 text-[13px] text-[#8f8a86]">
        Add your first question — or pick one from the rail on the left.
      </p>
      <p className="mt-1 text-[12px] text-[#a5a09b]">開始製作工作紙</p>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        {listQuestionTypes().map((definition, index) => (
          <button
            key={definition.id}
            type="button"
            onClick={() => onAddQuestion(definition.id)}
            className={`inline-flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-medium transition-all duration-150 ease-[var(--ease-out-soft)] active:scale-[0.97] ${
              index === 0
                ? 'bg-[var(--accent)] text-white shadow-sm hover:brightness-110'
                : 'border border-[#ddd8d2] bg-white text-[#4a4643] hover:bg-[#f6f5f4]'
            }`}
          >
            {definition.id === 'mcq' ? <McqIcon size={16} /> : <StructuredIcon size={16} />}
            {plain(definition.displayName.en)}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * What a deliberately added, still-empty page offers.
 *
 * A blank sheet is ambiguous on its own — it looks the same whether the teacher added
 * it or the last question happened to fill the previous page exactly — so it says which
 * it is, and offers the two things anyone does next: drop something here, or add
 * something here.
 *
 * It is a drop target in its own right. Reordering elsewhere in the preview works by
 * aiming at a neighbouring item's edge, and an empty page has no neighbour to aim at,
 * so without this the page could only be filled through the rail. Dropping lands the
 * item *after the break* that opened the page, which is the only position that puts it
 * on this sheet.
 *
 * Everything here is preview chrome and carries `data-print-hide`, so it stays off the
 * exported PDF (§"PDF export uses print CSS"); the .docx never sees it at all, since it
 * consumes the IR rather than this DOM.
 */
function BlankPage({
  breakId,
  dragId,
  onDropItem,
  onAddQuestion,
  selected,
  onSelect,
}: {
  breakId: string;
  dragId?: string;
  onDropItem?: (position: "before" | "after") => void;
  onAddQuestion?: (typeId: string) => void;
  selected: boolean;
  onSelect: () => void;
}) {
  const [over, setOver] = useState(false);
  const receiving = Boolean(dragId) && dragId !== breakId && Boolean(onDropItem);

  return (
    <div
      data-print-hide
      data-layout-id={breakId}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      onDragOver={(event) => {
        if (!receiving) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        if (!receiving) return;
        event.preventDefault();
        setOver(false);
        onDropItem?.("after");
      }}
      aria-current={selected}
      className={`flex h-full min-h-0 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-colors ${
        over
          ? "border-[#7c5cff] bg-[#f3efff]"
          : selected
            ? "border-[#c4b5fd] bg-[#f9f7ff]"
            : "border-[#e2ded8] hover:border-[#cfc9c2]"
      }`}
    >
      <p className="text-[13px] font-semibold text-[#6b6764]">
        {over ? "Drop here to place on this page" : "New page"}
      </p>
      <p className="mt-1 text-[12px] text-[#a5a09b]">
        {over
          ? "放置於此頁"
          : "Drag a question here, or add one below · 新頁"}
      </p>

      {onAddQuestion && !over && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {listQuestionTypes().map((definition) => (
            <button
              key={definition.id}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onAddQuestion(definition.id);
              }}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#ddd8d2] bg-white px-3 py-1.5 text-[12px] font-medium text-[#4a4643] transition-colors hover:bg-[#f6f5f4]"
            >
              {definition.id === "mcq" ? (
                <McqIcon size={14} />
              ) : (
                <StructuredIcon size={14} />
              )}
              {plain(definition.displayName.en)}
            </button>
          ))}
        </div>
      )}

      <p className="mt-4 text-[11px] text-[#b5b0ab]">
        This page is empty — it will still appear in the exported document.
      </p>
    </div>
  );
}

export function Preview({
  worksheet,
  mode,
  selectedQuestionId,
  onSelectQuestion,
  onEdit,
  onDelete,
  onDeleteQuestion,
  onDeleteLayout,
  onBulkDelete,
  onBulkDuplicate,
  onFormat,
  formatOf,
  textOf,
  onFormatRuns,
  onResizeBlock,
  onResizeRows,
  onSplitRows,
  onOpenBlock,
  onReorder,
  onReorderMany,
  bandEditing,
  headerEditing,
  footerEditing,
  onAddQuestion,
  onPagesChange,
  onDragItemChange,
}: Props) {
  /*
   * The one document walk, memoised on its only two inputs.
   *
   * `renderWorksheet` resolves the flow, computes numbering, totals marks and renders
   * every question's nodes — the whole document, every call. This component holds ~25
   * pieces of view state (hover, drag, marquee, zoom, text selection, dock rect), and a
   * bare call re-ran that walk on every one of them: a marquee sweep or a resize drag
   * re-rendered the entire worksheet on each pointer frame. The output depends on
   * nothing else, so it only has to be rebuilt when the document or the mode changes.
   */
  const rendered = useMemo(() => renderWorksheet(worksheet, mode), [worksheet, mode]);
  const { language } = mode;
  const containerRef = useRef<HTMLDivElement>(null);
  const bandsRef = useRef<HTMLDivElement>(null);

  /*
   * Print preview makes the page a picture, so every *gesture* is off too.
   *
   * CSS gets the appearance (`body.print-preview`, shared with `@media print`), but it
   * cannot stop a gesture that listens on `window`: the marquee sweep starts from a
   * mousedown on the scrolling column and then tracks globally, so `pointer-events:
   * none` on the sheets left drag-to-multi-select fully working over an inert page.
   * The handlers therefore check this directly — read from the store rather than
   * threaded as a prop, since this component already subscribes.
   */
  const printPreview = useWorksheetStore((s) => s.printPreview);

  /*
   * Where the add rail will put the next item.
   *
   * Read from the store for the same reason `printPreview` is: the rail lives outside
   * this component, so a prop would have to be threaded through `EditorApp` for no
   * reason other than to arrive back here. The page both *sets* it — selecting an item,
   * or pointing at a gap — and *draws* it, as the insertion caret.
   */
  const insertAnchorId = useWorksheetStore((s) => s.insertAnchorId);
  const setInsertAnchor = useWorksheetStore((s) => s.setInsertAnchor);
  const requestInsertMenu = useWorksheetStore((s) => s.requestInsertMenu);

  /*
   * Which table cell the sidebar's structure panel acts on.
   *
   * In the store rather than local state because the *sidebar* is the consumer, and it is
   * a sibling of this component — the same reason `insertAnchorId` lives there.
   */
  const activeCell = useWorksheetStore((s) => s.activeCell);
  const setActiveCell = useWorksheetStore((s) => s.setActiveCell);

  const [fitScale, setFitScale] = useState(1);
  // User zoom, multiplied onto the auto-fit scale rather than replacing it, so
  // "100%" always means "as wide as this column allows" — the reading a teacher
  // expects — and zooming never clips the page against the sidebar.
  const [zoom, setZoom] = useState(1);
  const scale = fitScale * zoom;

  // Page geometry comes from the same model the exporter reads, converted from
  // twips, so changing paper or margins moves the preview and the .docx together.
  const setup = pageSetupOf(worksheet);
  const dimensions = pageDimensions(setup);
  const pageWidthMm = twipsToMm(dimensions.width);
  const pageHeightMm = twipsToMm(dimensions.height);
  // The printable text column, in the same CSS pixels a block's `widthPx` is measured
  // in. This is the ceiling on a resize: a picture wider than the column is clipped in
  // the preview and rescaled by Word, so the size the teacher dragged to would not be
  // the size that prints. Derived from the page setup, so a margin change moves it.
  const contentWidthPx = Math.round(
    (pageWidthMm - twipsToMm(setup.margins.left) - twipsToMm(setup.margins.right)) *
      MM_TO_PX,
  );
  const header = headerFooterOf(worksheet.header, defaultHeader);
  const footer = headerFooterOf(worksheet.footer, defaultFooter);

  /*
   * Where the bands sit in the margin, and how much text column they cost — normally
   * **none**.
   *
   * A header sits in the top margin and grows downward from `w:header`; only the part
   * that runs past `w:top` displaces body text (§ `headerFooterOffsets`). The preview
   * used to stack the bands as sheet children and subtract their whole measured height,
   * on the assumption that they always ate the text column. So every header row cost a
   * row of content — visibly on screen, and in the export through the same wrong
   * geometry. What is subtracted now is only the genuine overflow: the amount by which
   * the rows exceed the margin they were given.
   *
   * Sized from the **running** rows, matching the exporter: one `w:header` serves the
   * whole section, and letting a five-row page-1 cover dictate the geometry flattened the
   * ordinary one-row header on every other sheet against the paper edge. The running rows
   * print on nearly every page, so they are what the margin is shaped around.
   */
  const runningBands = (value: HeaderFooter) =>
    value.enabled ? bandsHeight(value.bands ?? [], value.rule) : 0;

  const headerEstimate = runningBands(header);
  const footerEstimate = runningBands(footer);
  const edgeOffsets = headerFooterOffsets(setup.margins, headerEstimate, footerEstimate);

  /*
   * The rendered height of the bands, measured rather than estimated.
   *
   * `bandsHeight` has to guess — the exporter has no DOM and Word lays the text out
   * itself — and a guess that is even slightly short is what let a five-row header print
   * *on top of* the first question: the estimate said the rows fitted the margin, so no
   * overflow was computed and nothing moved, while the browser was drawing them 46px
   * taller than that. The preview does have a DOM, so here it measures the real boxes and
   * only falls back to the estimate before the first layout.
   *
   * Word still gets the estimate, which is correct: it is placing rows *it* will lay out,
   * so a browser measurement would be the wrong number to hand it.
   *
   * Measured off a **running** sheet rather than page 1, for the reason the estimate uses
   * the running rows: a document whose page 1 is a five-row exam cover would otherwise
   * have that cover set the geometry for every ordinary page behind it.
   */
  const [measured, setMeasured] = useState<{ header: number; footer: number }>();

  /**
   * Page 1's own rows, measured rather than estimated.
   *
   * `firstPageOverflow` used to scale `bandsHeight()` by the ratio the running sheet
   * found. That estimate assumes a ~264tw line box per row and cannot know a field's
   * `fontSize`, so a cover of 14pt title rows came out far short — page 1 reserved less
   * room than its header occupies and the first line of the body printed on top of the
   * title block. The preview has a DOM and can simply ask, which is the rule
   * § "the preview measures the bands; only the exporter estimates them" already sets:
   * Word still gets the estimate, because Word lays the rows out itself.
   */
  const [measuredFirst, setMeasuredFirst] = useState<{ header: number; footer: number }>();
  const sheetsRef = useRef<HTMLDivElement>(null);

  /**
   * The sheet whose bands are measured: the first one showing the *running* rows.
   *
   * Page 1 only differs when the document says so, so in the ordinary case this is 0 and
   * nothing changes. When page 1 does carry its own cover, sheet 1 is the first that
   * shows what the rest of the document prints — and if there is no sheet 1, there is no
   * running page to shape the margin around, so the estimate stands.
   */
  const measuredPageIndex =
    header.firstPage || footer.firstPage || header.showOnFirstPage === false ? 1 : 0;

  /*
   * Read from the DOM rather than through refs on the band boxes.
   *
   * Which sheet to measure depends on `pages`, and `pages` comes out of the paginator
   * that consumes this measurement — a ref pinned at render time would close the loop.
   * Querying the container by `data-page-index` breaks it: the effect runs after layout,
   * so it simply asks what is on screen now.
   */
  useEffect(() => {
    const root = sheetsRef.current;
    if (!root) return;

    const read = () => {
      const toTwips = (px: number) => (px / 96) * 1440;
      /*
       * No fallback to page 1 when the running sheet is absent — the measurement is
       * **skipped**, not redirected.
       *
       * This used to fall back to `[data-page-index="0"]`, which on a document with a
       * page-1 cover reads the cover's rows *as* the running header. That closed a loop
       * through the paginator: a document hovering near one page measured the tall cover
       * while it had one sheet (big overflow → smaller text column → two sheets), then
       * measured the short running rows once sheet 1 existed (→ one sheet again). Neither
       * state could hold, the sheet count oscillated 1 ↔ 2 forever, and React reported
       * "Maximum update depth exceeded" from `DraggableItem`'s measurement — two
       * components away from this line. The § comment above (`measuredPageIndex`) already
       * states the rule the fallback broke: with no running sheet on screen, the estimate
       * (or the last real measurement) stands.
       */
      const sheet = root.querySelector<HTMLElement>(
        `[data-page-index="${measuredPageIndex}"]`,
      );
      /*
       * Measure the *rows*, not the region box.
       *
       * The box now also holds the region-focus wake overlay, which is editing chrome —
       * and chrome must never reach a measurement the printed page depends on. Reading
       * the box's own `offsetHeight` let the overlay inflate the header by its own
       * height, so the padding the paginator derives from this no longer matched the
       * rows and the first question printed over the header.
       *
       * `data-band-rows` names the one child that is the printed content, rather than
       * assuming a child order the overlay's presence changes.
       */
      const box = (edge: string) => {
        const region = sheet?.querySelector<HTMLElement>(`[data-band-box="${edge}"]`);
        const rows = region?.querySelector<HTMLElement>('[data-band-rows]');
        return rows?.offsetHeight ?? region?.offsetHeight ?? 0;
      };

      if (sheet) {
        const next = { header: toTwips(box('header')), footer: toTwips(box('footer')) };
        // Only commit a real change, or the state write re-renders forever.
        setMeasured((prev) =>
          prev &&
          Math.abs(prev.header - next.header) < 1 &&
          Math.abs(prev.footer - next.footer) < 1
            ? prev
            : next,
        );
      }

      // Page 1 separately, since it may print a taller cover than the running rows and
      // its padding is applied to that sheet alone (`pageStyleFor`).
      const first = root.querySelector<HTMLElement>('[data-page-index="0"]');
      const firstBox = (edge: string) =>
        first
          ?.querySelector<HTMLElement>(`[data-band-box="${edge}"]`)
          ?.querySelector<HTMLElement>('[data-band-rows]')?.offsetHeight ?? 0;
      const nextFirst = {
        header: toTwips(firstBox('header')),
        footer: toTwips(firstBox('footer')),
      };
      setMeasuredFirst((prev) =>
        prev &&
        Math.abs(prev.header - nextFirst.header) < 1 &&
        Math.abs(prev.footer - nextFirst.footer) < 1
          ? prev
          : nextFirst,
      );
    };

    read();
    // Observing the whole sheet container catches both a band's own content changing and
    // a repagination that moves which sheet is the running one.
    const observer = new ResizeObserver(read);
    observer.observe(root);
    root.querySelectorAll('[data-band-box]').forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  });

  const headerRowsTwips = measured?.header ?? headerEstimate;
  const footerRowsTwips = measured?.footer ?? footerEstimate;

  /*
   * What the bands overrun their margin by, per edge.
   *
   * Kept as two numbers rather than a sum, because they do two different things: the
   * header's overflow moves the top of the text column **down**, and the footer's moves
   * the bottom **up**. Only subtracting the total from the pagination budget — which is
   * all this did at first — shrinks the column without moving it, so the header simply
   * printed on top of the first lines of content instead of pushing them clear.
   */
  const overflow = bandsOverflow(setup.margins, headerRowsTwips, footerRowsTwips);
  // The paginator works in CSS pixels at 96dpi; twips are 1/1440".
  const bandsOverflowPx = ((overflow.header + overflow.footer) / 1440) * 96;

  /*
   * Page 1's own overflow, when it prints different rows.
   *
   * The offsets are shaped around the running header (one `w:header` serves the section),
   * so a page-1 cover taller than that header overruns the margin *on page 1 only*. Its
   * text has to start below the cover, while every other sheet keeps the plain margin —
   * applying one document-wide padding would push every page down to accommodate a cover
   * that only page 1 prints, which is the complaint this whole change answers.
   *
   * Estimated rather than measured: the measurement deliberately reads a running sheet,
   * and page 1's rows are usually a superset of the running ones, so the estimate is the
   * consistent basis for both. It only has to be close enough to clear the cover.
   */
  const firstPageOverflow = (() => {
    const h = header.enabled
      ? bandsHeight(firstPageHeaderFooter(header).bands, header.rule)
      : 0;
    const f = footer.enabled
      ? bandsHeight(firstPageHeaderFooter(footer).bands, footer.rule)
      : 0;
    // The measured rows win when they exist: the estimate cannot see a field's font size,
    // so a cover of 14pt title rows was judged far shorter than it draws and page 1
    // reserved too little room — the first body line printed over the title block. The
    // estimate is kept as the pre-layout fallback, scaled the way it always was.
    const ratio = headerEstimate > 0 ? headerRowsTwips / headerEstimate : 1;
    const headerRows = Math.max(measuredFirst?.header ?? h * ratio, headerRowsTwips);
    const footerRows = Math.max(measuredFirst?.footer ?? f, footerRowsTwips);

    /*
     * Measured against the offset page 1 is actually drawn at, not one re-derived from
     * its own height.
     *
     * `bandsOverflow` recomputes `headerFooterOffsets` internally, and a taller cover
     * makes that come out *smaller* — but every sheet is placed at `edgeOffsets`, which
     * is shaped around the running rows (one `w:header` serves the section, § "the
     * offsets are sized from the running rows"). Page 1 therefore starts lower than the
     * re-derived offset assumes, and the difference was left as overlap: the cover ran
     * to 185px while the body began at 156px.
     */
    return {
      header: Math.max(0, edgeOffsets.header + headerRows - setup.margins.top),
      footer: Math.max(0, edgeOffsets.footer + footerRows - setup.margins.bottom),
    };
  })();

  // Set while handling a click inside the preview, so the scroll effect below does
  // not yank the page under someone who just clicked what they were already looking at.
  const selfSelected = useRef(false);

  // The element the user has selected on the page. Identified by its edit target
  // plus language side, so the two halves of a bilingual line select separately.
  const [selectedElement, setSelectedElement] = useState<
    { target: EditTarget; side: "en" | "zh" } | undefined
  >();

  /*
   * The characters selected inside the field being edited.
   *
   * Its own state rather than part of `selectedElement`: that one says *which element*
   * the page is acting on and survives the editor closing, while this says *which
   * characters within it* and exists only while a range is live. Folding them together
   * would make every element selection carry a meaningless range.
   *
   * `formatting` is held for exactly one commit — see `applyFormat` below.
   */
  const [textSelection, setTextSelection] = useState<TextSelection | undefined>();
  const [formatting, setFormatting] = useState(false);

  // The picture selected for resizing. Its own state rather than a variant of
  // `selectedElement`, because a block has no language side and nothing to format —
  // see `EditContext.resize`. The two are mutually exclusive: selecting one clears the
  // other, so Delete and the format toolbar always have an unambiguous subject.
  const [selectedBlockId, setSelectedBlockId] = useState<string | undefined>();

  // The item being dragged on the page. Local rather than in the store, because it is
  // transient interaction state that must never reach an undo entry or a save.
  const [dragId, setDragId] = useState<string | undefined>();

  /*
   * End the drag from the window, not from the item that started it.
   *
   * `DraggableItem`'s own `dragend` is the happy path and only the happy path: it is
   * delivered to the *source node*, so it never arrives if the drop unmounted or
   * re-keyed that node first. Dropping a question on a page card in the rail does
   * exactly that — the reorder moves the item to another sheet, React re-renders, and
   * the element the browser was holding a `dragend` for is gone. `dragId` then stayed
   * set forever, which is what left the question rendered at `opacity-40` on a page it
   * had already landed on, and kept the rail believing something was still in flight.
   *
   * The window sees both terminators for any drag on the page, whoever consumed it, so
   * this is the one place that can promise the state is transient. The per-item handler
   * stays as-is — it is harmless once idempotent, and it is what clears the drag on the
   * common in-page reorder without waiting for the bubble.
   */
  useEffect(() => {
    if (!dragId) return;
    const end = () => setDragId(undefined);
    window.addEventListener("dragend", end);
    window.addEventListener("drop", end);
    return () => {
      window.removeEventListener("dragend", end);
      window.removeEventListener("drop", end);
    };
  }, [dragId]);

  /*
   * Auto-scroll while dragging near the top or bottom edge.
   *
   * Without this a question cannot be moved to another page at all. HTML5 drag fires
   * `dragover` only on the element under the pointer, and the browser does not scroll
   * a container during a drag — so once the item being dragged is on screen, anything
   * on the next sheet is below the fold and can never receive the drop. The reorder
   * itself was always page-agnostic; the *gesture* simply could not reach that far.
   *
   * Speed ramps with how deep into the hot zone the pointer is, so easing toward the
   * edge creeps and pinning against it moves fast — a single fixed speed is either too
   * slow to cross a page or too fast to stop on a target.
   *
   * `dragover` is the pointer source because `mousemove` does not fire during a native
   * drag. It is listened for on the window so the scroll continues while the pointer is
   * over the sidebar or the rail, which is exactly where a long drag strays.
   */
  useEffect(() => {
    if (!dragId) return;
    const scroller = containerRef.current?.closest("main");
    if (!scroller) return;

    const HOT_ZONE_PX = 96;
    const MAX_SPEED_PX = 22;
    let velocity = 0;
    let frame = 0;

    const step = () => {
      if (velocity !== 0) scroller.scrollTop += velocity;
      frame = requestAnimationFrame(step);
    };

    const onDragOver = (event: DragEvent) => {
      const bounds = scroller.getBoundingClientRect();
      const fromTop = event.clientY - bounds.top;
      const fromBottom = bounds.bottom - event.clientY;
      if (fromTop < HOT_ZONE_PX) {
        velocity = -MAX_SPEED_PX * Math.min(1, (HOT_ZONE_PX - fromTop) / HOT_ZONE_PX);
      } else if (fromBottom < HOT_ZONE_PX) {
        velocity = MAX_SPEED_PX * Math.min(1, (HOT_ZONE_PX - fromBottom) / HOT_ZONE_PX);
      } else {
        velocity = 0;
      }
    };

    // Without a preventDefault somewhere on the path, the drag is refused outright
    // over any region that is not itself a drop target, and no dragover arrives.
    const allowDrop = (event: DragEvent) => event.preventDefault();

    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragover", allowDrop);
    frame = requestAnimationFrame(step);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragover", allowDrop);
      cancelAnimationFrame(frame);
    };
  }, [dragId]);

  // A selected layout element. Questions already have store-level selection because
  // the sidebar inspects them; a divider or a page break has nothing to inspect, so
  // its selection is local — it exists only to give Delete something to act on.
  const [selectedLayoutId, setSelectedLayoutId] = useState<string | undefined>();

  /*
   * How much taller this element could get before it runs past the bottom of its page.
   *
   * **Measured off the rendered sheet**, not computed from the paginator's numbers.
   * Both were tried and the arithmetic was wrong on a real document: the packer's own
   * figures said a 21-line block fitted its column by one pixel, while the last ruled
   * line was drawn 21px *below* the column and 13px into the footer. The gap is the
   * on-page wrapper's own chrome — padding and the selection ring that the measurement
   * probe does not reproduce, because the probe renders the block without them.
   *
   * Asking the DOM removes the whole class of error. The distance from this element's
   * bottom edge to the bottom of the content column it sits in *is* the room left, with
   * every margin, band and wrapper already accounted for by the browser that drew them.
   *
   * It is a function rather than a value because `ctx` is built before the blocks are
   * packed and the blocks are built from `ctx` — so no number computed this render is
   * available here. A drag calls it at pointer-down, which is later than render and
   * exactly when the answer is needed.
   */
  const measureSlack = useCallback((elementId: string) => {
    const root = containerRef.current;
    const element = root?.querySelector<HTMLElement>(
      `#print-root [data-layout-id="${CSS.escape(elementId)}"]`,
    );
    // The flexible child of the sheet is the text column; the bands around it are not.
    const column = element?.closest<HTMLElement>(".flex-1");
    if (!element || !column) return 0;
    const room =
      column.getBoundingClientRect().bottom - element.getBoundingClientRect().bottom;
    // Divided by the preview transform, since both rectangles are in screen pixels and
    // the caller works in page pixels.
    return Math.max(0, room / (scale || 1));
  }, [scale]);

  /*
   * Multi-selection, for acting on several items at once.
   *
   * Held as a set of flow ids (questions *and* layout elements together), because the
   * whole point is to sweep a run of the page — "these four questions and the divider
   * between them" — and act on it as one. It is deliberately separate from
   * `selectedQuestionId`: that one drives the sidebar inspector, which can only show
   * a single question, so overloading it would mean a marquee either broke the
   * inspector or silently kept only the last item.
   *
   * The marquee catches an item the sweep **touches**, rather than only one it fully
   * contains. Full containment reads as unfriendly on a worksheet: page items span the
   * whole text column, so enclosing one means dragging from outside the left margin to
   * outside the right, and a sweep that clips the last question by two pixels silently
   * drops it. Touching is what a teacher means by "from here to here".
   *
   * This is the one place the page deliberately parts company with the diagram canvas,
   * which keeps full containment — there a curve spans the whole plot, so touching
   * would make every box catch every curve. On the page the axes are not symmetric:
   * vertically the items are stacked and disjoint, so a vertical overlap is a real
   * statement of intent, while horizontally they all occupy the same column and a
   * horizontal test says almost nothing. Intersection on both axes is therefore
   * effectively a vertical-span test, which is exactly the gesture being made.
   */
  const [multiIds, setMultiIds] = useState<Set<string>>(new Set());
  const [marquee, setMarquee] = useState<
    { x0: number; y0: number; x1: number; y1: number } | undefined
  >();

  /**
   * Set when a sweep actually travelled, and read by the click that follows it.
   *
   * A drag that ends over blank paper still emits a `click` on the paper, whose handler
   * drops every page selection — so releasing the mouse cleared the very items the
   * sweep had just caught. A ref rather than state because the click arrives before any
   * re-render, and this must be readable synchronously inside that handler.
   */
  const sweptRef = useRef(false);

  /**
   * The document fields a sweep caught, held apart from `multiIds`.
   *
   * `multiIds` is a set of *flow* ids, and `removeMany` deletes by filtering the
   * `questions`, `layout` and `flow` lists — so the title and the instructions can never
   * be members of it without inventing ids that address nothing. They are deleted by
   * emptying their field instead, which is a different verb, so they are tracked in a
   * different set and dispatched to `deleteTarget`.
   */
  const [multiFields, setMultiFields] = useState<Set<string>>(new Set());

  // Tell the page rail what is in flight. An effect rather than a call beside each
  // `setDragId`, so every path that ends a drag — drop, escape, dragend — reports it.
  //
  // The payload is the whole run the drag carries, resolved by the same rule the
  // in-page drop uses: a member of the multi-selection brings the selection with it,
  // anything else travels alone. Reporting only the grabbed id is what let a drop on
  // the rail move one item out of a swept five — the rail cannot infer the rest.
  useEffect(() => {
    if (!dragId) {
      onDragItemChange?.(undefined);
      return;
    }
    onDragItemChange?.(multiIds.has(dragId) ? [...multiIds] : [dragId]);
  }, [dragId, multiIds, onDragItemChange]);

  /**
   * Which of the sheet's three regions is being edited — the rule Word uses.
   *
   * A sheet shows the body, the header and the footer at once, but they are separate
   * documents to edit: in Word the inactive ones grey out and are inert until you
   * double-click into them. Copying that is what stops a click meant for the first
   * question from landing in a header row that happens to sit near it, and — more
   * importantly — it makes the header's own chrome (the ✕, the "+ Row", the zone
   * outlines) appear only when the teacher has actually asked to work on the header,
   * rather than on every hover across the top of the page.
   *
   * `body` is the default because that is what a worksheet mostly is; the header and
   * footer are furniture decided once. Returning to it is part of `clearPageSelection`,
   * so a click on blank paper leaves a region the same way Escape does in Word.
   */
  const [focusRegion, setFocusRegion] = useState<"body" | "header" | "footer">("body");

  /**
   * The classes that make a region active or idle. `relative` is unconditional: the wake
   * overlay is absolutely positioned and would otherwise escape to the nearest positioned
   * ancestor — the sheet — and cover the whole page.
   */
  const regionClass = (region: "body" | "header" | "footer") =>
    `paper-region relative${focusRegion === region ? "" : " paper-region-idle"}`;

  /**
   * Move the edit focus to a region.
   *
   * Selections are dropped on the way, because they address the region being left: a
   * question stays selected when the teacher steps into the header, and Delete would then
   * remove that question while every visible affordance pointed at the header.
   */
  const enterRegion = (region: "body" | "header" | "footer") => {
    clearPageSelection();
    setFocusRegion(region);
  };

  /**
   * Runs one sweep, from mousedown to mouseup.
   *
   * The listeners are attached here rather than in an effect keyed on "is sweeping":
   * the gesture's start is a ref (it must not re-render), and an effect cannot see a
   * ref change, so it would never attach them. Owning the whole gesture in one
   * closure also means the box and the additive flag are read from live locals rather
   * than from state that a mid-drag render could have staled.
   *
   * They go on `window`, because a sweep that begins on the paper routinely continues
   * past its edge — ending it there would make the result depend on how steady the
   * user's hand was.
   */
  /**
   * Drop every page-level selection at once, so none can be left silently armed.
   *
   * A plain function, not a `useCallback`: it closes over nothing but `useState`
   * setters, which React guarantees are stable. Declared above `beginSweep` so the
   * sweep can call it without a ref or a dependency that would re-create the gesture
   * handler on every selection change.
   */
  const clearPageSelection = () => {
    setSelectedElement(undefined);
    setSelectedLayoutId(undefined);
    setSelectedBlockId(undefined);
    setMultiIds(new Set());
    setMultiFields(new Set());
    // The question selection lives in the store rather than here, and the whole-item
    // Delete handler acts on it — so leaving it set meant a blank click deselected
    // everything visible while Delete still removed the entire question.
    onSelectQuestion?.(undefined);
    // Returning to the body is part of dropping the selection, the way Escape is in
    // Word: a click on blank paper means "I am done with that region".
    setFocusRegion("body");
  };

  const beginSweep = useCallback(
    (
      originX: number,
      originY: number,
      additive: boolean,
      /**
       * Whether the press landed on blank paper rather than on an item. Only a blank
       * press that never travels clears the selection; one that starts on an item is
       * that item's click to handle, and clearing here would fight it.
       */
      onBlank: boolean,
      /**
       * The selection as it stood when the press landed.
       *
       * A shift-sweep adds to *that*, not to whatever the last mouse-move produced.
       * Reading live state instead would make each frame add to the previous frame's
       * result, so items swept over once could never be released by shrinking the box.
       */
      baseIds: Set<string>,
      /** The document fields selected at press time, for the same reason as `baseIds`. */
      baseFields: Set<string>,
    ) => {
      let box: { x0: number; y0: number; x1: number; y1: number } | undefined;

      /*
       * Which items the box currently touches.
       *
       * Run on every move, not only on release. A marquee whose result appears only
       * once the mouse is up asks the user to guess what they have caught and check
       * afterwards, so a sweep that missed by a few pixels is only discoverable by
       * redoing it. Live highlighting makes the box's meaning visible while it can
       * still be corrected, which is the whole reason to drag a box rather than
       * shift-click a list.
       *
       * The set is rebuilt from the box each time rather than accumulated, so
       * *shrinking* the box releases what it no longer covers. Accumulating would make
       * the gesture one-way: an overshoot could never be taken back without starting
       * over.
       */
      const catchItems = (current: { x0: number; y0: number; x1: number; y1: number }) => {
        const bounds = marqueeBounds(current);

        setMultiIds(() => {
          // `additive` (shift) starts from what was already selected; a plain sweep
          // starts empty. `baseIds` is captured once at press time, so re-running this
          // mid-drag keeps comparing against the original selection rather than
          // against the previous frame's result.
          const caught = new Set(additive ? baseIds : []);
          // Scoped to `#print-root` — the *visible* sheets. The pagination probe
          // renders the very same blocks (with the same ids) off-screen to be
          // measured, so an unscoped query returns every item twice, and the probe's
          // copies sit at coordinates no marquee can ever contain.
          for (const node of containerRef.current?.querySelectorAll<HTMLElement>(
            "#print-root [data-flow-id]",
          ) ?? []) {
            const id = node.dataset.flowId;
            if (!id) continue;
            // Touched, not contained — the rule lives in `marqueeCatches`.
            if (marqueeCatches(bounds, node.getBoundingClientRect())) caught.add(id);
          }
          return caught;
        });

        // The title and instructions, swept by the same box but collected separately
        // because they are deleted by emptying a field rather than by removing a row.
        setMultiFields(() => {
          const caught = new Set(additive ? baseFields : []);
          for (const node of containerRef.current?.querySelectorAll<HTMLElement>(
            "#print-root [data-doc-field]",
          ) ?? []) {
            const kind = node.dataset.docField;
            if (!kind) continue;
            if (marqueeCatches(bounds, node.getBoundingClientRect())) caught.add(kind);
          }
          return caught;
        });
      };

      const onMove = (event: MouseEvent) => {
        // A few pixels of slop, so an ordinary click that drifts by a pixel stays a
        // click and does not clear the selection through a zero-size marquee.
        if (
          !box &&
          Math.abs(event.clientX - originX) < 4 &&
          Math.abs(event.clientY - originY) < 4
        ) {
          return;
        }
        // Dragging across a page of text would otherwise start a native text
        // selection, which fights the marquee for the same gesture and leaves the
        // page streaked blue once it ends.
        event.preventDefault();
        document.body.style.userSelect = "none";
        box = { x0: originX, y0: originY, x1: event.clientX, y1: event.clientY };
        // Claim the click that will follow the release, before it can clear what this
        // sweep is catching.
        sweptRef.current = true;
        setMarquee(box);
        catchItems(box);
      };

      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        document.body.style.userSelect = "";
        setMarquee(undefined);

        if (!box) {
          // A click rather than a sweep. On empty paper that means "deselect"; on an
          // item it belongs to that item, so leave the selection alone.
          //
          // *Every* page selection is dropped, not just the marquee set. Clearing only
          // `multiIds` left a selected question, layout element or picture still armed
          // after the user had visibly clicked away from it — which is the state a
          // stray Delete then acts on.
          if (!additive && onBlank) clearPageSelection();
          return;
        }

        // The last move already caught everything under the final box, so release only
        // ends the gesture. Re-running the hit-test here would re-measure a layout that
        // the highlighting itself may have reflowed.
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [],
  );

  // The page-local clipboard for copy/paste. The system clipboard is not used: a
  // question has no sensible text/plain form to round-trip through, and reading the
  // system clipboard needs a permission prompt mid-edit. Same reasoning as the
  // diagram canvas's own clip.
  const [clip, setClip] = useState<string[]>([]);

  /*
   * Where the format toolbar docks: horizontally across the page, vertically pinned to
   * the top of the scrolling area.
   *
   * The two axes come from different elements on purpose. `left`/`width` track the
   * *sheet*, so the bar spans exactly the document it is acting on and follows a zoom
   * change. `top` tracks the *scroll container*, so the bar sits just inside the
   * viewport's page area and stays put while the document scrolls underneath —
   * deriving `top` from the sheet made the bar ride up over the page's own top edge as
   * soon as the first sheet scrolled away.
   *
   * Re-measured on scroll and resize because the bar is `fixed`: it does not travel
   * with the page, so it has to be told where the page currently is.
   */
  const [dockRect, setDockRect] = useState<
    { left: number; width: number; top: number } | undefined
  >();

  /*
   * The point size the selection renders at, so the toolbar's size control can show the
   * real current value rather than a blank "Size".
   *
   * Measured from the page rather than looked up from a table of style defaults: the
   * rendered value already accounts for the named style, the preview's own CSS and any
   * override, and it is the number the teacher is looking at. `scale` is divided out
   * because the sheet sits inside a `scale()` transform — `getComputedStyle` reports the
   * pre-transform value, but the CSS pixel figure still has to be converted to points.
   */
  const [selectionPt, setSelectionPt] = useState<number | undefined>();

  /*
   * The live text range the toolbar should format, with the formatting those characters
   * already share.
   *
   * Present only when a range is genuinely selected inside the element the page is
   * acting on — a caret publishes no selection, and a range left over from a *different*
   * element is discarded by the side check, so the bar can never apply a size to text
   * the teacher is no longer looking at.
   *
   * When this is undefined the toolbar formats the whole element, which stays the right
   * behaviour for "make this entire heading bigger".
   */
  const runRange = useMemo(() => {
    if (!textSelection || !selectedElement) return undefined;
    if (textSelection.side !== selectedElement.side) return undefined;
    if (textSelection.start >= textSelection.end) return undefined;

    const text = textOf?.(selectedElement.target);
    if (!text) return undefined;
    return {
      side: textSelection.side,
      start: textSelection.start,
      end: textSelection.end,
      common: runFormatToTextFormat(
        commonRunFormat(text[textSelection.side], textSelection.start, textSelection.end),
      ),
    };
  }, [textSelection, selectedElement, textOf]);

  useEffect(() => {
    // No selection means no toolbar; the render below gates on `selectedElement`, so a
    // stale rect is simply never read rather than needing to be cleared here.
    if (!selectedElement) return;
    const container = containerRef.current;
    const sheet = container?.querySelector<HTMLElement>("#print-root .paper");
    if (!container || !sheet) return;

    // The nearest scrolling ancestor is the page column; its top edge is where the bar
    // belongs. Found rather than passed so the preview stays self-contained.
    const scroller = container.closest<HTMLElement>(".overflow-auto") ?? container;

    const measure = () => {
      const paper = sheet.getBoundingClientRect();
      const view = scroller.getBoundingClientRect();
      setDockRect({ left: paper.left, width: paper.width, top: view.top + 8 });

      // The selected text's own paragraph carries the size; the editable span inherits
      // it. 1pt = 1/72in and CSS px are 1/96in, hence 0.75.
      const selected = container.querySelector<HTMLElement>('[data-selected="true"]');
      const box = selected?.closest("p, td, th, span") ?? selected;
      const px = box ? Number.parseFloat(getComputedStyle(box).fontSize) : NaN;
      setSelectionPt(Number.isFinite(px) ? Math.round(px * 0.75) : undefined);
    };
    // After the click's re-render has committed, so the sheet is laid out.
    const frame = requestAnimationFrame(measure);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    const observer = new ResizeObserver(measure);
    observer.observe(sheet);
    observer.observe(scroller);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
      observer.disconnect();
    };
  }, [selectedElement]);

  const isEmpty = rendered.questions.length === 0;


  /*
   * Selection for band text, injected into all three band surfaces.
   *
   * Built here rather than in `EditorApp` because the selection lives in this
   * component's state — the host supplies the *mutations* for each band list, while
   * which field is selected is a preview concern. One object serves the masthead, the
   * header and the footer, since a `bandField` target is keyed by field id alone.
   *
   * Field *and* side, because a computed field has two independently authored halves:
   * selecting "Full marks: " must not also select " marks", or the toolbar would format
   * both and there would be no way to make only the label bold.
   */
  const bandSelection = {
    isSelected: (fieldId: string, side: BandFieldSide) =>
      selectedElement?.target.kind === "bandField" &&
      selectedElement.target.fieldId === fieldId &&
      (selectedElement.target.side ?? "prefix") === side,
    onSelect: (fieldId: string, side: BandFieldSide) => {
      setSelectedElement({
        target: { kind: "bandField", fieldId, side },
        side: language === "zh" ? "zh" : "en",
      });
      setSelectedBlockId(undefined);
    },
    onClear: () => setSelectedElement(undefined),
  };

  const withSelection = (handlers?: BandEditingHandlers) =>
    handlers ? { ...handlers, selection: bandSelection } : undefined;

  const ctx: EditContext | undefined = onEdit
    ? {
        onEdit: (target, next) => {
          onEdit(target, next);
          setSelectedElement(undefined);
        },
        onEditKeepingSelection: onEdit,
        onSelectElement: (target, side) => {
          setSelectedElement({ target, side });
          // Selecting text drops the picture selection, so the handles never linger
          // beside a caption that is now the thing being edited.
          setSelectedBlockId(undefined);
        },
        onClearSelection: () => setSelectedElement(undefined),
        isSelected: (target, side) =>
          selectedElement?.side === side &&
          JSON.stringify(selectedElement.target) === JSON.stringify(target),
        textSelection,
        onTextSelectionChange: setTextSelection,
        keepEditing: formatting,
        activeCell,
        onActivateCell: setActiveCell,
        resize: onResizeBlock
          ? {
              scale,
              maxWidthPx: contentWidthPx,
              selectedBlockId,
              onSelectBlock: (blockId) => {
                setSelectedBlockId(blockId);
                setSelectedElement(undefined);
              },
              onOpenBlock,
              onResizeBlock,
            }
          : undefined,
        // Reuses `selectedLayoutId` rather than introducing a fourth selection: a
        // layout element is already selectable on the page — that is what arms Delete
        // for it — so the handle simply appears on what selection already points at.
        // A second id for the same element would let the outline and the handle
        // disagree about which one is current.
        resizeRows: onResizeRows
          ? {
              scale,
              selectedElementId: selectedLayoutId,
              onSelectElement: (elementId) => {
                setSelectedLayoutId(elementId);
                setSelectedElement(undefined);
                setSelectedBlockId(undefined);
              },
              onResizeRows,
              slackFor: (elementId) => measureSlack(elementId),
            }
          : undefined,
      }
    : undefined;

  // Delete / Backspace removes the selected element. Scoped to the page and skipped
  // whenever focus sits in a field, so it can never eat a character being typed.
  useEffect(() => {
    if (!selectedElement || !onDelete) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      // A modal surface on top owns the keyboard. `window` is the same target for
      // every one of these listeners, so `stopPropagation` in the overlay cannot
      // silence them — deleting one curve in the drawing canvas used to fire this
      // handler too and take the whole diagram block with it.
      if (isModalLayerOpen()) return;
      const active = document.activeElement;
      if (
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLInputElement ||
        (active instanceof HTMLElement && active.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      onDelete(selectedElement.target);
      setSelectedElement(undefined);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedElement, onDelete]);

  /*
   * Keys that act on a selected picture.
   *
   * Escape deselects, matching every other selection on the page. Delete removes the
   * block, which routes through the same `blockText`-style target machinery — a picture
   * selected for resizing is still a block, so there is no reason it should be the one
   * selection Delete ignores.
   *
   * Registered ahead of the whole-item handler below and guarded on `selectedBlockId`,
   * so it is the more specific selection that wins — the same precedence a selected
   * text target already takes over its containing question.
   */
  useEffect(() => {
    if (!selectedBlockId) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedBlockId(undefined);
        return;
      }
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      // A modal surface on top owns the keyboard. `window` is the same target for
      // every one of these listeners, so `stopPropagation` in the overlay cannot
      // silence them — deleting one curve in the drawing canvas used to fire this
      // handler too and take the whole diagram block with it.
      if (isModalLayerOpen()) return;
      const active = document.activeElement;
      if (
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLInputElement ||
        (active instanceof HTMLElement && active.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      // `blockText` is the target kind whose delete unit is "the block" — exactly what
      // removing a picture means (`describeDelete`), so no new kind is needed.
      onDelete?.({ kind: "blockText", blockId: selectedBlockId });
      setSelectedBlockId(undefined);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedBlockId, onDelete]);

  /*
   * Delete / Backspace on a whole selected item.
   *
   * The effect above only covers a selected *text* target — the question a teacher
   * clicked on the page had no keyboard delete at all, so removing one meant hunting
   * for the overflow menu in the sidebar. This handles the two page-level selections:
   * a question, and a layout element (divider, page break, answer lines…).
   *
   * The same two guards apply as everywhere else: it never fires while focus is in a
   * field, so it cannot eat a character being typed, and it defers to the text-target
   * handler when one is selected, because that is the more specific selection and
   * deleting the whole question would be a much larger action than the user asked for.
   */
  useEffect(() => {
    if (selectedElement) return; // The finer-grained handler above owns this key.
    if (!selectedQuestionId && !selectedLayoutId) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      // A modal surface on top owns the keyboard. `window` is the same target for
      // every one of these listeners, so `stopPropagation` in the overlay cannot
      // silence them — deleting one curve in the drawing canvas used to fire this
      // handler too and take the whole diagram block with it.
      if (isModalLayerOpen()) return;
      const active = document.activeElement;
      if (
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLInputElement ||
        (active instanceof HTMLElement && active.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      if (selectedLayoutId) onDeleteLayout?.(selectedLayoutId);
      else if (selectedQuestionId) onDeleteQuestion?.(selectedQuestionId);
      setSelectedLayoutId(undefined);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    selectedElement,
    selectedQuestionId,
    selectedLayoutId,
    onDeleteQuestion,
    onDeleteLayout,
  ]);

  /*
   * Bulk keyboard actions on the multi-selection.
   *
   * Copy and paste go through a page-local clip rather than the system clipboard (see
   * `clip` above). Paste duplicates the copied questions at the end of their section,
   * which is what `onDuplicate` already does for one — so a multi-paste is just that
   * applied across the set, and it inherits the same fresh-id handling.
   */
  useEffect(() => {
    // Deliberately unguarded on "is anything selected". ⌘A is how a selection gets
    // *made*, so gating the listener on a non-empty selection would make it
    // unreachable — the shortcut could never run because it had not already run.
    // Each branch below decides for itself whether it has anything to act on.
    const onKeyDown = (event: KeyboardEvent) => {
      // A modal surface on top owns the keyboard. `window` is the same target for
      // every one of these listeners, so `stopPropagation` in the overlay cannot
      // silence them — deleting one curve in the drawing canvas used to fire this
      // handler too and take the whole diagram block with it.
      if (isModalLayerOpen()) return;

      const meta = event.metaKey || event.ctrlKey;

      /*
       * Print preview owns nothing selectable, so ⌘A/⌘C/⌘X/⌘V and Delete are all off.
       *
       * This branch cannot lean on "is anything selected?" the way the single-selection
       * handlers can: ⌘A is what *creates* the selection, so it would still arm a bulk
       * selection over a page that is supposed to be a picture.
       *
       * ⌘A is additionally *swallowed* rather than merely ignored: returning early hands
       * it to the browser, whose native select-all then highlights the entire app —
       * toolbar, rails and sidebar — which is a stranger result than the shortcut doing
       * nothing at all.
       */
      if (printPreview) {
        if (meta && event.key.toLowerCase() === "a") event.preventDefault();
        return;
      }

      const active = document.activeElement;
      if (
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLInputElement ||
        (active instanceof HTMLElement && active.isContentEditable)
      ) {
        return;
      }

      if (meta && event.key.toLowerCase() === "a") {
        event.preventDefault();
        const all = new Set<string>();
        for (const node of containerRef.current?.querySelectorAll<HTMLElement>(
          "#print-root [data-flow-id]",
        ) ?? []) {
          if (node.dataset.flowId) all.add(node.dataset.flowId);
        }
        setMultiIds(all);
        // "Everything" means the printed page, so the title and instructions are part
        // of it — leaving them out would make ⌘A disagree with a sweep of the same area.
        const fields = new Set<string>();
        for (const node of containerRef.current?.querySelectorAll<HTMLElement>(
          "#print-root [data-doc-field]",
        ) ?? []) {
          if (node.dataset.docField) fields.add(node.dataset.docField);
        }
        setMultiFields(fields);
        return;
      }

      if (meta && (event.key.toLowerCase() === "c" || event.key.toLowerCase() === "x")) {
        if (multiIds.size === 0) return;
        event.preventDefault();
        setClip([...multiIds]);
        if (event.key.toLowerCase() === "x") {
          onBulkDelete?.([...multiIds]);
          setMultiIds(new Set());
        }
        return;
      }

      if (meta && event.key.toLowerCase() === "v") {
        if (clip.length === 0) return;
        event.preventDefault();
        onBulkDuplicate?.(clip);
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (multiIds.size === 0 && multiFields.size === 0) return;
        event.preventDefault();
        if (multiIds.size > 0) onBulkDelete?.([...multiIds]);
        // Two verbs, because the two sets mean different things: a flow item is removed
        // from the document, a field is emptied and stops rendering.
        for (const kind of multiFields) {
          const target = DOC_FIELD_TARGETS[kind];
          if (target) onDelete?.(target);
        }
        setMultiIds(new Set());
        setMultiFields(new Set());
        return;
      }

      if (event.key === "Escape") {
        setMultiIds(new Set());
        setMultiFields(new Set());
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [multiIds, multiFields, clip, onBulkDelete, onBulkDuplicate, onDelete, printPreview]);

  // Selecting a question in the sidebar brings it into view here, so the two panes
  // stay in step instead of scrolling independently.
  useEffect(() => {
    if (!selectedQuestionId) return;
    if (selfSelected.current) {
      selfSelected.current = false;
      return;
    }
    const target = containerRef.current?.querySelector(
      `[data-question-id="${CSS.escape(selectedQuestionId)}"]`,
    );
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [selectedQuestionId]);

  // The page keeps true A4 dimensions and is scaled down to fit the centre column,
  // so proportions stay honest instead of the page being clipped (§5.1).
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const fit = () => {
      const available = element.clientWidth;
      const pageWidth = pageWidthMm * MM_TO_PX;
      setFitScale(
        available > 0 && available < pageWidth ? available / pageWidth : 1,
      );
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
    // Re-fit when the paper size or orientation changes, not just on resize.
  }, [pageWidthMm]);

  // The printed flow, flattened into the blocks the paginator packs onto sheets.
  // Everything that occupies vertical space on the page is one entry here — the
  // masthead, the instructions, each section heading, and each question or layout
  // element — so a page boundary can fall between any two of them.
  const blocks: FlowBlock[] = [];

  // A document with neither a masthead nor a title pushes no block at all. Pushing an
  // empty one would reserve its height on the sheet, so a cleared title would still
  // print as a gap the teacher cannot reach — the whole point of letting it go.
  const mastheadBands =
    worksheet.bands && worksheet.bands.length > 0 ? worksheet.bands : undefined;
  if (mastheadBands || rendered.title) {
    blocks.push({
      key: "masthead",
      structural: true,
      node: mastheadBands ? (
        bandEditing ? (
          <BandEditor
            bands={mastheadBands}
            language={language}
            totalMarks={worksheetMarks(worksheet)}
            onMove={bandEditing.onMove}
            onEditField={bandEditing.onEditField}
            onRemoveField={bandEditing.onRemoveField}
            onAddField={bandEditing.onAddField}
            onAddRow={bandEditing.onAddRow ? () => bandEditing.onAddRow!("running") : undefined}
            onRemoveRow={bandEditing.onRemoveRow}
            label="Title block"
            selection={bandSelection}
          />
        ) : (
          rendered.bands.map((node, index) => (
            <NodeView key={index} node={node} language={language} ctx={ctx} />
          ))
        )
      ) : (
        <DocumentField
          target={{ kind: "worksheetTitle" }}
          multiSelected={multiFields.has("worksheetTitle")}
        >
          <NodeView node={rendered.title!} language={language} ctx={ctx} />
        </DocumentField>
      ),
    });
  }

  if (mode.version === "teacher") {
    blocks.push({
      key: "teacher-banner",
      structural: true,
      node: (
        <p className="mb-2 text-center font-bold text-red-700">
          Teacher Version / 教師版
        </p>
      ),
    });
  }

  if (rendered.instructions) {
    blocks.push({
      key: "instructions",
      structural: true,
      node: (
        <DocumentField
          target={{ kind: "worksheetInstructions" }}
          multiSelected={multiFields.has("worksheetInstructions")}
        >
          <NodeView node={rendered.instructions} language={language} ctx={ctx} />
        </DocumentField>
      ),
    });
  }

  /*
   * Selected items grouped into unbroken runs, so each run shows one merged grip.
   *
   * Computed over the *flow* rather than over the paginated sheets, because the blocks
   * are built before pagination has run. A run split across a page boundary therefore
   * still counts as one, and its pill is measured from the DOM — where the members that
   * moved to the next sheet are no longer siblings, so the walk stops early and the
   * pill spans only the part on this page. That is the right answer either way: a
   * handle cannot stretch across a sheet gap.
   */
  const runHeadOf = new Map<string, number>();
  const runTails = new Set<string>();
  {
    const flowIds = rendered.items.map((item) =>
      item.type === "question" ? item.question.questionId : item.layout.elementId,
    );
    let index = 0;
    while (index < flowIds.length) {
      if (!multiIds.has(flowIds[index])) {
        index += 1;
        continue;
      }
      let end = index;
      while (end + 1 < flowIds.length && multiIds.has(flowIds[end + 1])) end += 1;
      const length = end - index + 1;
      // A run of one keeps the ordinary single-item pill: there is nothing to merge,
      // and a "1" badge would be noise.
      if (length > 1) {
        runHeadOf.set(flowIds[index], length);
        for (let step = index + 1; step <= end; step += 1) runTails.add(flowIds[step]);
      }
      index = end + 1;
    }
  }

  {
    for (const item of rendered.items) {
      const id =
        item.type === "question"
          ? item.question.questionId
          : item.layout.elementId;

      // A manual page break carries no content — it only tells the paginator to start
      // a new sheet here, which is what lets a teacher add a page before the current
      // one has filled up.
      const isManualBreak =
        item.type === "layout" &&
        item.layout.nodes.some((node) => node.kind === "pageBreak");

      const body =
        item.type === "layout" ? (
          // Layout elements take no number and have nothing for the sidebar to
          // inspect, but they still need to be selectable — otherwise a divider or a
          // page break could be added on the page and then only removed from the
          // sidebar. Selecting one is what arms Delete for it.
          <div
            data-layout-id={id}
            onClick={(event) => {
              event.stopPropagation();
              setSelectedLayoutId(id);
              setSelectedElement(undefined);
              setSelectedBlockId(undefined);
              // Selecting a layout element points the rail at it, exactly as selecting
              // a question does. Without this the rail could not see this selection at
              // all — it is local to the preview — and silently appended instead.
              setInsertAnchor(id);
            }}
            aria-current={selectedLayoutId === id}
            className={`relative cursor-pointer rounded px-1 transition-colors ${
              selectedLayoutId === id
                ? "bg-[#f6f3ff] ring-1 ring-[#c4b5fd]"
                : "hover:bg-black/[0.03]"
            }`}
          >
            {item.layout.nodes.map((node, index) => (
              <NodeView key={index} node={node} language={language} ctx={ctx} />
            ))}
          </div>
        ) : (
          <div
            data-question-id={id}
            onClick={() => {
              selfSelected.current = true;
              onSelectQuestion?.(id);
              setSelectedLayoutId(undefined);
            }}
            aria-current={selectedQuestionId === id}
            className={`relative cursor-pointer rounded px-1 transition-colors ${
              selectedQuestionId === id
                ? "bg-[#f6f3ff] ring-1 ring-[#c4b5fd] before:absolute before:-left-1 before:top-0 before:h-full before:w-1 before:rounded-full before:bg-[#7c5cff]"
                : "hover:bg-black/[0.03]"
            }`}
          >
            {item.question.nodes.map((node, index) => (
              <NodeView key={index} node={node} language={language} ctx={ctx} />
            ))}
          </div>
        );

      blocks.push({
        key: id,
        forceBreak: isManualBreak,
        breakId: isManualBreak ? id : undefined,
        node: !onReorder ? (
          body
        ) : (
          <DraggableItem
            id={id}
            dragId={dragId}
            multiSelected={multiIds.has(id)}
            /*
             * Dragging a member of a multi-selection moves the whole selection.
             *
             * That is what the selection is *for*: having swept five questions, the
             * natural next move is to drag them somewhere as a group, and moving only
             * the one under the pointer would silently discard the work of selecting
             * the rest. Dragging an item that is *not* in the selection stays a
             * single-item move — grabbing something the selection does not contain is
             * how a user means "just this one", and it leaves the group intact.
             */
            dragCount={multiIds.has(id) ? multiIds.size : 1}
            runRole={
              runHeadOf.has(id) ? "head" : runTails.has(id) ? "tail" : undefined
            }
            runLength={runHeadOf.get(id)}
            isInsertAnchor={insertAnchorId === id}
            onAnchorHere={() => setInsertAnchor(id)}
            /*
             * The gap is offered only where inserting is possible at all: a read-only
             * preview has no reorder handler, and in print preview the sheet must show
             * exactly what prints (§print preview is the print rules) — so the
             * affordance disappears rather than merely being unclickable.
             */
            onInsertHere={
              printPreview ? undefined : () => requestInsertMenu(id)
            }
            onDragStart={() => setDragId(id)}
            onDragEnd={() => setDragId(undefined)}
            onDrop={(position) => {
              if (dragId) {
                // Ordered by the flow, not by the set: `moveRunInFlow` re-reads
                // document order anyway, but passing the set directly would make the
                // no-op guard below depend on iteration order.
                const run = multiIds.has(dragId) ? [...multiIds] : undefined;
                // Dropping a run onto one of its own members would be a move relative
                // to itself; the store guards this too, but stopping here avoids an
                // undo entry that changes nothing.
                if (run && onReorderMany && !run.includes(id)) {
                  onReorderMany(run, id, position);
                } else if (!run || !run.includes(id)) {
                  onReorder(dragId, id, position);
                }
              }
              setDragId(undefined);
            }}
          >
            {body}
          </DraggableItem>
        ),
      });
    }
  }

  if (isEmpty && onAddQuestion) {
    blocks.push({
      key: "empty-state",
      structural: true,
      node: <EmptyState onAddQuestion={onAddQuestion} />,
    });
  }

  // What the drag ghost should say. Derived from the model rather than from the
  // rendered DOM, so the chip names the thing ("Question 3") instead of echoing
  // whatever text happens to be at the top of it.
  const dragLabel = (() => {
    if (!dragId) return undefined;
    // Dragging a member of the selection carries the whole selection, so the chip has
    // to say how many — a ghost reading "Question 3" while five questions move is the
    // gesture lying about its own scope.
    if (multiIds.has(dragId) && multiIds.size > 1) {
      return {
        label: `${multiIds.size} items`,
        detail: "Moving together",
      };
    }
    const numbering = computeNumbering(worksheet);
    const question = worksheet.questions.find((q) => q.id === dragId);
    if (question) {
      const number = numbering.byQuestionId.get(dragId)?.number;
      const stem = question.blocks.find((b) => b.kind === "paragraph");
      const excerpt =
        stem && stem.kind === "paragraph"
          ? plain(stem.text.en) || plain(stem.text.zh)
          : "";
      // The type's own name comes from the registry, so a new question type labels
      // its ghost correctly without this file learning about it (§9).
      return {
        label: number ? `Question ${number}` : "Question",
        detail: excerpt || plain(requireQuestionType(question).displayName.en),
      };
    }
    const element = worksheet.layout.find((e) => e.id === dragId);
    if (element) {
      return { label: LAYOUT_DRAG_NAME[element.kind], detail: "Layout element" };
    }
    return { label: "Item" };
  })();

  /*
   * The usable text column: the sheet minus its margins, minus whatever the header and
   * footer bands take. Derived from the same twips the exporter writes, so a paper-size
   * or margin change moves the preview and the .docx together.
   *
   * **Floored.** The browser lays the column out at a whole number of pixels, and the
   * packer comparing against the unrounded value let a page accept one sub-pixel more
   * than the column had — which is enough to admit a whole 32px ruled line. On a real
   * document that put the last of 21 answer lines 21px below the column and 13px into
   * the footer, on screen and again in Word. A fraction of a pixel of optimism is not
   * worth a row of writing space printed over the page number.
   */
  const contentHeightPx = Math.floor(
    (pageHeightMm - twipsToMm(setup.margins.top) - twipsToMm(setup.margins.bottom)) *
      MM_TO_PX -
      // Only what the bands genuinely overflow their margin by, which is usually zero —
      // a header living inside the top margin costs the text column nothing.
      bandsOverflowPx,
  );

  const {
    pages,
    openedBy,
    heights: heightsOf,
    probeRef,
  } = usePagination(blocks, contentHeightPx, [
    worksheet,
    mode,
    selectedQuestionId,
    dragId,
    contentHeightPx,
  ]);

  /*
   * Hand back the rows that no longer fit, when something above pushed them off.
   *
   * The drag handle caps at the page edge, so an element can never be *made* too tall.
   * It can still *become* too tall: adding a question above a block of answer lines
   * pushes it down, and rows that used to fit no longer do. Word would flow them onto
   * the next sheet; the preview keeps every item whole, so without this they run off
   * the bottom of the paper — the one overflow pagination cannot resolve by moving
   * something, because the something *is* the oversized element.
   *
   * So the overflow becomes its own element on the next page. Three rules keep a
   * measurement-driven commit from misbehaving, which is the real risk here:
   *
   *  - **Only when it genuinely does not fit**, by more than one row. A block sized to
   *    exactly fill its page must not split on a sub-pixel measurement wobble.
   *  - **Never during a gesture.** A drag is already reshaping the page every frame;
   *    splitting mid-drag would rewrite the flow under the pointer.
   *  - **Once per element per overflow.** `splitting` latches the id until the split has
   *    been measured, so the effect cannot fire twice for one overflow and cut the same
   *    element into a dozen pieces before the first commit has repainted.
   */
  const splitting = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!onSplitRows || dragId) return;
    const root = containerRef.current;
    if (!root) return;

    // Measured off the rendered sheet, exactly as `measureSlack` is, so the cap that
    // stops a drag and the test that triggers a split can never disagree about where
    // the page ends.
    for (const element of worksheet.layout) {
      if (element.kind !== 'answerLines') continue;
      const node = root.querySelector<HTMLElement>(
        `#print-root [data-layout-id="${CSS.escape(element.id)}"]`,
      );
      const column = node?.closest<HTMLElement>('.flex-1');
      if (!node || !column) continue;

      const past =
        (node.getBoundingClientRect().bottom - column.getBoundingClientRect().bottom) /
        (scale || 1);
      // Any real overflow counts, however small: a block hanging 21px off a column is
      // 21px into the footer, which is what the teacher sees. The tolerance is only
      // there so a sub-pixel rounding wobble cannot split a block that exactly fills
      // its page — it is deliberately far below one row rather than equal to it, since
      // a partial row over the edge still prints on top of the footer.
      if (past <= 1) continue;

      const over = Math.ceil(past / ANSWER_LINE_PITCH_PX);
      const keep = Math.max(MIN_ANSWER_LINES, element.lines - over);
      if (keep >= element.lines) continue;

      // The latch keys on the element *and its size*, so one overflow commits once
      // while a still-overflowing remainder — a different size — is a fresh case and
      // splits again. Keying on the id alone stopped after a single cut and left the
      // block hanging over the footer; keying on nothing would re-fire the identical
      // commit before its own repaint and shred the element.
      const attempt = `${element.id}:${element.lines}`;
      if (splitting.current === attempt) return;
      splitting.current = attempt;
      const perPage = Math.max(1, Math.floor(contentHeightPx / ANSWER_LINE_PITCH_PX));
      onSplitRows(element.id, keep, element.lines - keep, perPage);
      return;
    }
    // Nothing overflows any more, so the latch can be released for the next one.
    splitting.current = undefined;
  }, [pages, worksheet, contentHeightPx, onSplitRows, dragId, scale]);

  /*
   * Tell the page rail how the flow landed on sheets.
   *
   * Derived from `pages` with a memo and reported from an effect, so the parent's
   * setState happens after this render rather than during it. The memo is compared by
   * value, not identity: `pages` is rebuilt on every measurement pass, so publishing
   * on identity alone would re-notify the parent on every keystroke and — since the
   * parent stores what it is told — loop.
   */
  const composition = useMemo<PageComposition[]>(
    () => composePages({ pages, openedBy }),
    // `blocks` is rebuilt every render by construction; `pages` is the memoised result
    // that actually changes, and every item that matters is reachable through it.
    [pages, openedBy],
  );

  const compositionKey = keyOfComposition(composition);

  useEffect(() => {
    onPagesChange?.(composition);
    // Keyed on the flattened composition so an identical repagination is not reported
    // twice. `composition` itself is intentionally not a dependency — see above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compositionKey, onPagesChange]);

  /*
   * The header and footer live in the margin, not in the text column.
   *
   * Word grows a header downward from `w:header` and only pushes the body text down once
   * it passes `w:top`. The preview stacked them inside the padded box instead, so every
   * header row ate a row of content — the sheet on screen disagreed with the exported
   * page, and both disagreed with what a teacher expects a margin to be for.
   *
   * Mirroring Word means positioning the bands absolutely in the margin and leaving the
   * padding to define the text column, so the two views cannot drift (§ `headerFooterOffsets`).
   */
  /*
   * Per sheet, because page 1 can print taller rows than every other page.
   *
   * The overflow is added to the margin rather than replacing it: a header that runs past
   * `w:top` pushes the body text down by exactly that much, which is what Word does and
   * what stops the header printing over the first question. In the ordinary case both
   * numbers are zero and every sheet gets the plain authored margin.
   */
  const pageStyleFor = (pageIndex: number): React.CSSProperties => {
    const over = pageIndex === 0 ? firstPageOverflow : overflow;
    return {
      width: `${pageWidthMm}mm`,
      height: `${pageHeightMm}mm`,
      // Margins are authored in twips and mirrored here, so the text column the
      // teacher sees is the one Word will use.
      paddingTop: `${twipsToMm(setup.margins.top + over.header)}mm`,
      paddingRight: `${twipsToMm(setup.margins.right)}mm`,
      paddingBottom: `${twipsToMm(setup.margins.bottom + over.footer)}mm`,
      paddingLeft: `${twipsToMm(setup.margins.left)}mm`,
      fontFamily: `'${worksheet.fonts.latin}', '${worksheet.fonts.eastAsia}', serif`,
    };
  };

  /**
   * Where a band sits in the margin, matching the `w:header`/`w:footer` offset.
   *
   * The same offset on every sheet, including a page 1 whose rows are taller: Word has
   * one `w:header` per section, so a cover that outgrows it hangs further *down* rather
   * than starting further up — which is why page 1 gets the extra padding instead.
   */
  const bandBoxStyle = (edge: "header" | "footer"): React.CSSProperties => ({
    position: "absolute",
    left: `${twipsToMm(setup.margins.left)}mm`,
    right: `${twipsToMm(setup.margins.right)}mm`,
    ...(edge === "header"
      ? { top: `${twipsToMm(edgeOffsets.header)}mm` }
      : { bottom: `${twipsToMm(edgeOffsets.footer)}mm` }),
  });

  return (
    <div
      ref={containerRef}
      className="w-full"
      /*
       * A sweep begins anywhere that is not an item — the paper's margins, the gap
       * between sheets, the desk beside them. It is bound here, on the whole preview
       * area, rather than on `.paper`: the sheet is `overflow-hidden` with the content
       * column stretched across it, so most of the "empty" space a user would
       * naturally start a sweep from belongs to a child element, not to the sheet.
       *
       * A sweep may also begin *on* an item. Requiring empty paper was the single
       * biggest thing making bulk selection feel awkward: page items span the whole
       * text column, so on a full sheet there is often nowhere blank to start from,
       * and the user had to hunt for margin. The gesture that genuinely conflicts is
       * drag-to-reorder, and that one only ever starts on the hover-revealed grip in
       * the margin (`data-drag-grip`) — so the two divide by where the press lands,
       * and only the grip is conceded.
       *
       * This does not cost click-to-edit: `beginSweep` treats anything under 4px of
       * travel as a click and leaves it entirely to the item's own handlers, so a
       * press that never moves still selects, and a second click still edits.
       */
      onMouseDown={(event) => {
        if (event.button !== 0) return;
        // Nothing is selectable while the page is a picture of itself.
        if (printPreview) return;
        const target = event.target as HTMLElement;
        if (target.closest("[data-drag-grip]")) return;
        // A press inside an open editor is text selection within that field, not a
        // sweep across the page.
        if (target.isContentEditable) return;
        // Ignore the floating chrome (zoom, selection badge) layered over the canvas.
        if (target.closest("button, a, input, textarea, select")) return;
        // Shift extends the selection rather than replacing it.
        // One definition of "blank", shared with the paper's own click handler, so the
        // two cannot disagree about whether a click deselects.
        beginSweep(
          event.clientX,
          event.clientY,
          event.shiftKey,
          isBlankAreaClick(target),
          multiIds,
          multiFields,
        );
      }}
    >
      {/* Zoom sits with the canvas, floating at its bottom-right the way every
          document tool places it, rather than in the toolbar among the export
          actions — it changes how the page is *viewed*, never what it contains. */}
      <div className="pointer-events-none fixed bottom-4 right-[416px] z-30">
        <div className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-line bg-surface-raised/95 p-1 shadow-lg backdrop-blur">
          <IconButton
            label="Zoom out"
            onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.1) * 10) / 10))}
            disabled={zoom <= 0.5}
          >
            <MinusIcon size={14} />
          </IconButton>
          <button
            type="button"
            onClick={() => setZoom(1)}
            title="Reset zoom to fit"
            className="min-w-[3.25rem] cursor-pointer rounded-full px-1 text-center text-[11px] font-semibold tabular-nums text-ink-muted transition-colors hover:text-ink"
          >
            {Math.round(scale * 100)}%
          </button>
          <IconButton
            label="Zoom in"
            onClick={() => setZoom((z) => Math.min(2, Math.round((z + 0.1) * 10) / 10))}
            disabled={zoom >= 2}
          >
            <PlusIcon size={14} />
          </IconButton>
        </div>
      </div>

      {/*
        The sheets.

        One `.paper` element per page, each a fixed A4 box that clips rather than
        grows, so a page that is full looks full. The zoom transform is applied to the
        stack as a whole rather than per sheet, which keeps the gaps between pages
        scaling with them.
      */}
      <div
        id="print-root"
        ref={sheetsRef}
        className="mx-auto flex flex-col items-center gap-6"
        style={{
          width: `${pageWidthMm}mm`,
          transform: scale === 1 ? undefined : `scale(${scale})`,
          transformOrigin: "top center",
          // A transform does not change layout size, so the scroll area would keep
          // reserving the unscaled height. Reclaim the difference — negative when
          // scaled down, positive when zoomed in, which is what lets a zoomed page
          // actually scroll to its own bottom.
          marginBottom:
            scale === 1
              ? undefined
              : `${(scale - 1) * pageHeightMm * pages.length}mm`,
        }}
      >
        {pages.map((pageBlocks, pageIndex) => (
          // `data-page-index` is what the page rail scrolls to. The sheet is the
          // scroll target rather than its first block, so a click lands on the top of
          // the paper including its header, which is where "page 3" visually begins.
          <div key={pageIndex} data-page-index={pageIndex} className="relative">
            <div
              ref={pageIndex === 0 ? bandsRef : undefined}
              // `relative` so the header and footer can be placed in the margin rather
              // than stacked in the text column (§ `bandBoxStyle`).
              className="paper paper-shadow relative flex flex-col overflow-hidden rounded-[2px]"
              style={pageStyleFor(pageIndex)}
              lang={language === "zh" ? "zh-HK" : "en"}
              // Clicking the page background drops the selection, so Delete stops
              // being armed once the user has moved on.
              //
              // "Background" is decided by what the click *landed on*, not by whether it
              // hit this exact node. The old `target !== currentTarget` test only fired
              // on a direct hit, and the paper is a flex column of nested divs — so the
              // empty space below the last question belongs to a child, and clicking
              // there deselected nothing. `closest` walks up from the target and asks
              // whether anything selectable was under the pointer.
              onClick={(event) => {
                // A sweep that travelled ends with a click on whatever is under the
                // pointer, usually blank paper. That is the tail of the drag, not a new
                // click, so it must not clear what the sweep just selected. Consumed
                // unconditionally, or a suppressed click would leak into the next one.
                const swept = sweptRef.current;
                sweptRef.current = false;
                if (swept) return;
                if (isBlankAreaClick(event.target)) clearPageSelection();
              }}
            >
              <div
                // Measured on the first sheet only; every sheet's bands are the same
                // height, and observing all of them would just re-report one number.
                data-band-box="header"
                className={regionClass("header")}
                style={bandBoxStyle("header")}
              >
                <HeaderFooterBand
                  value={header}
                  language={language}
                  edge="header"
                  pageNumber={pageIndex + 1}
                  pageCount={pages.length}
                  totalMarks={worksheetMarks(worksheet)}
                  // Editing handlers are withheld while the region is idle, so the band
                  // renders exactly as it prints — no zone outlines, no ✕, no "+ Row".
                  // Hiding that chrome with CSS alone would leave it in the tab order and
                  // reachable by keyboard while the region says it is inactive.
                  editing={
                    focusRegion === "header" ? withSelection(headerEditing) : undefined
                  }
                  editable={Boolean(headerEditing)}
                />
                {focusRegion !== "header" && (
                  <RegionWake
                    label="Edit the header"
                    onWake={() => enterRegion("header")}
                  />
                )}
              </div>

              <div className={`min-h-0 flex-1 paper-region-body ${regionClass("body")}`}>
                {focusRegion !== "body" && (
                  <RegionWake
                    single
                    label="Back to the document body"
                    onWake={() => enterRegion("body")}
                  />
                )}
                {pageBlocks.length === 0 && openedBy[pageIndex] ? (
                  // A page the teacher added that nothing has landed on yet. Rendered
                  // as an affordance rather than as bare paper, because a truly blank
                  // sheet gives no clue that it is there on purpose — which is exactly
                  // the doubt that makes someone add the page a second time.
                  <BlankPage
                    breakId={openedBy[pageIndex]!}
                    dragId={dragId}
                    selected={selectedLayoutId === openedBy[pageIndex]}
                    onSelect={() => {
                      setSelectedLayoutId(openedBy[pageIndex]);
                      setSelectedElement(undefined);
                      setSelectedBlockId(undefined);
                    }}
                    onAddQuestion={onAddQuestion}
                    onDropItem={
                      onReorder
                        ? (position) => {
                            // The break's own id is the anchor. Naming the section that
                            // owned it used to be necessary too, which is why the walk
                            // above kept a break → section map; a flat flow needs only
                            // the id.
                            const breakId = openedBy[pageIndex]!;
                            if (dragId) {
                              // Carries the whole selection when the drag started
                              // inside one — the same rule `DraggableItem`'s drop
                              // follows, or filling a new page with a swept group
                              // would move one item and leave the rest behind.
                              const run = multiIds.has(dragId) ? [...multiIds] : undefined;
                              if (run && onReorderMany && !run.includes(breakId)) {
                                onReorderMany(run, breakId, position);
                              } else if (!run || !run.includes(breakId)) {
                                onReorder(dragId, breakId, position);
                              }
                            }
                            setDragId(undefined);
                          }
                        : undefined
                    }
                  />
                ) : (
                  pageBlocks.map((block) => (
                    <div key={block.key}>{block.node}</div>
                  ))
                )}
              </div>

              <div
                data-band-box="footer"
                className={regionClass("footer")}
                style={bandBoxStyle("footer")}
              >
                <HeaderFooterBand
                  value={footer}
                  language={language}
                  edge="footer"
                  pageNumber={pageIndex + 1}
                  pageCount={pages.length}
                  totalMarks={worksheetMarks(worksheet)}
                  editing={
                    focusRegion === "footer" ? withSelection(footerEditing) : undefined
                  }
                  editable={Boolean(footerEditing)}
                />
                {focusRegion !== "footer" && (
                  <RegionWake
                    label="Edit the footer"
                    onWake={() => enterRegion("footer")}
                  />
                )}
              </div>
            </div>

            {/* Page number, on the desk beside the sheet rather than printed on it —
                this is preview chrome and must never look like page furniture the
                export will contain. */}
            <span
              data-print-hide
              className="paper-page-number pointer-events-none absolute -bottom-5 right-0 text-[10px] font-medium tabular-nums text-ink-subtle"
            >
              {pageIndex + 1} / {pages.length}
            </span>
          </div>
        ))}
      </div>

      {/*
        The measurement probe.

        The same blocks, rendered once at the true content width but kept out of the
        document flow and out of the accessibility tree. Heights can only be measured
        from a real layout — font metrics, bilingual stacking and wrapping are the
        browser's to decide — so this exists to be measured, never to be seen.
      */}
      <div
        aria-hidden
        data-print-hide
        className="pointer-events-none invisible absolute -z-10"
        style={{
          position: "absolute",
          top: 0,
          left: -99999,
          width: `calc(${pageWidthMm}mm - ${twipsToMm(setup.margins.left)}mm - ${twipsToMm(setup.margins.right)}mm)`,
          fontFamily: `'${worksheet.fonts.latin}', '${worksheet.fonts.eastAsia}', serif`,
        }}
      >
        <div ref={probeRef}>
          {blocks.map((block) => (
            <div key={block.key} data-block-key={block.key}>
              {block.node}
            </div>
          ))}
        </div>
      </div>

      {/* The sweep rectangle. Fixed-positioned in viewport coordinates because it is
          drawn from raw pointer coordinates — deriving it inside the preview's
          `scale()` transform would put it under the cursor at any zoom but 100%. */}
      {marquee && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-40 rounded-sm border border-accent bg-accent/10"
          style={{
            left: Math.min(marquee.x0, marquee.x1),
            top: Math.min(marquee.y0, marquee.y1),
            width: Math.abs(marquee.x1 - marquee.x0),
            height: Math.abs(marquee.y1 - marquee.y0),
          }}
        />
      )}

      {/* What is selected and what can be done with it. A multi-selection is otherwise
          invisible once the pointer is up — the rings alone do not say how many, and
          nothing on screen would mention the shortcuts. */}
      {multiIds.size + multiFields.size > 0 && (
        <div className="pointer-events-none fixed bottom-16 left-[76px] right-[400px] z-40 flex justify-center">
          <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-line bg-surface-raised/95 py-2 pl-4 pr-2 text-[12px] shadow-xl backdrop-blur">
            <span className="font-medium text-ink">
              {multiIds.size + multiFields.size} selected
            </span>
            <span className="text-[11px] text-ink-subtle">
              ⌘C copy · ⌘V paste · ⌫ delete · Esc clear
            </span>
            <IconButton
              label="Clear selection"
              onClick={() => {
                setMultiIds(new Set());
                setMultiFields(new Set());
              }}
            >
              <CloseIcon size={14} />
            </IconButton>
          </div>
        </div>
      )}

      {/* The chip that follows the cursor while reordering. */}
      <DragGhost
        label={dragLabel?.label}
        detail={dragLabel?.detail}
      />

      {/* Only formattable targets get a toolbar; a table cell or MCQ option has no
          paragraph of its own to carry direct formatting. */}
      {onFormat &&
        dockRect &&
        selectedElement &&
        isFormattable(selectedElement.target) && (
          <FormatToolbar
            dock={dockRect}
            /*
             * The bar names what a click will change: the selected words when a range is
             * live, the whole element otherwise. Without this the same button silently
             * means two different things and the teacher cannot tell which they will get.
             */
            subject={
              runRange
                ? `${TARGET_NAME[selectedElement.target.kind]} · selected text`
                : TARGET_NAME[selectedElement.target.kind]
            }
            inheritedPt={selectionPt}
            onClose={() => setSelectedElement(undefined)}
            /*
             * Report the *selection's* own formatting when a range is live, so the bar
             * shows what those characters actually carry — reporting the element's
             * format there would claim 11pt for a phrase the teacher just set to 14pt.
             */
            /*
             * With a range live the bar reports **only what those characters carry**,
             * not the element's own overrides merged underneath.
             *
             * Merging them was wrong in a way that silently inverted a click: the Title
             * style is bold, so the merged format said `bold: true` for a selection that
             * carried no bold of its own, and `toggle` therefore sent "clear bold" —
             * un-bolding the selection instead of bolding it, while the size dropdown
             * reported the element's size rather than the selection's.
             */
            format={runRange ? runRange.common : formatOf?.(selectedElement.target)}
            onChange={(patch) => {
              if (runRange && onFormatRuns) {
                /*
                 * Hold the editor open across the commit. The click already blurred the
                 * textarea; without this flag its blur handler would commit and close,
                 * throwing away the range before the next click could format it too.
                 * Released on the following tick, once the store has applied the edit.
                 */
                setFormatting(true);
                onFormatRuns(
                  selectedElement.target,
                  runRange.side,
                  runRange.start,
                  runRange.end,
                  patch,
                );
                window.setTimeout(() => setFormatting(false), 0);
                return;
              }
              onFormat(selectedElement.target, patch);
            }}
            onReset={() => {
              const current = formatOf?.(selectedElement.target);
              if (!current) return;
              // Clear by setting every set key back to undefined, which the model's
              // merge treats as "inherit from the named style again".
              const cleared = Object.fromEntries(
                Object.keys(current).map((key) => [key, undefined]),
              ) as TextFormat;
              onFormat(selectedElement.target, cleared);
            }}
            onDelete={
              onDelete && describeDelete(selectedElement.target)
                ? () => {
                    onDelete(selectedElement.target);
                    setSelectedElement(undefined);
                  }
                : undefined
            }
          />
        )}
    </div>
  );
}
