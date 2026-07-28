"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  bandsAreEmpty,
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
import { plain, runLines } from "@/model/text";
import type {
  Band,
  BiText,
  HeaderFooter,
  LanguageMode,
  OutputMode,
  TextFormat,
  Worksheet,
} from "@/model/types";
import { isModalLayerOpen } from "@/components/ui/modalLayer";
import { useWorksheetStore } from "@/store/worksheetStore";
import { diagramSvg } from "@/render/diagram";
import type { EditTarget, RenderNode, TextNode } from "@/render/ir";
import { bandFieldText, renderWorksheet } from "@/render/worksheet";
import { listQuestionTypes, requireQuestionType } from "@/registry";
import { computeNumbering } from "@/model/numbering";

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
import { BandEditor } from "./BandEditor";

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
  onEditField: (fieldId: string, text: BiText) => void;
  onRemoveField: (fieldId: string) => void;
  onAddField: (bandId: string, zone: ZoneName) => void;
  /** Selection, so a band field can carry the format toolbar like any other text. */
  selection?: {
    isSelected: (fieldId: string) => boolean;
    onSelect: (fieldId: string) => void;
    onClear: () => void;
  };
}
import { FormatToolbar } from "./FormatToolbar";
import { InlineEditable } from "./InlineEditable";
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
    return <span key={`${key}-${index}`}>{content}</span>;
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

const STYLE_CLASS: Record<string, string> = {
  "Worksheet Title": "text-center text-xl font-bold mb-2",
  Instructions: "italic mb-3",
  "Section Heading": "text-lg font-bold mt-4 mb-2",
  "Question Stem": "mt-3",
  Statement: "ml-8",
  "MCQ Option": "ml-8",
  "Sub-question": "ml-6 mt-1",
  "Sub-sub-question": "ml-12 mt-1",
  Marks: "text-right",
  "Table Caption": "text-center text-xs italic",
  "Image Caption": "text-center text-xs italic",
  Answer: "font-bold text-red-700 dark:text-red-400 mt-1",
  "Marking Scheme": "text-[#4a30c2] ml-4 text-sm",
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

/** Hanging indent per list level, approximating the docx's `w:ind` values (§7.2). */
const HANGING_INDENT_PT: Record<number, number> = { 0: 18, 1: 18, 2: 27 };

type EditHandler = (target: EditTarget, next: BiText) => void;

/** Everything the editable spans need, bundled so it threads through one prop. */
export interface EditContext {
  onEdit: EditHandler;
  onSelectElement: (target: EditTarget, side: "en" | "zh") => void;
  onClearSelection: () => void;
  isSelected: (target: EditTarget, side: "en" | "zh") => boolean;
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
  const hanging = node.listRef
    ? (HANGING_INDENT_PT[node.listRef.level] ?? 18)
    : 0;

  return (
    <p
      className={`${STYLE_CLASS[node.style] ?? ""} relative`}
      style={{
        ...(node.indent ? { marginLeft: `${node.indent / 20}pt` } : undefined),
        // Word puts the marker in a hanging gutter; mirror that so the second
        // language and any wrapped line align under the text, not under the number.
        ...(hanging
          ? { paddingLeft: `${hanging}pt`, textIndent: `-${hanging}pt` }
          : undefined),
        // Applied last so a deliberate override beats the style default.
        ...formatStyle(node.format),
      }}
    >
      {node.marks !== undefined && (
        <span className="float-right ml-2">
          {marksLabel(node.marks, language)}
        </span>
      )}
      {node.listRef && (
        // The marker is derived, never stored, so it always matches the export.
        // `text-indent` on the paragraph pulls this into the gutter; the trailing
        // space keeps it clear of the text at every marker width.
        <span className="font-medium">{node.listRef.marker}&nbsp;</span>
      )}
      {richNodes(node.text, language, node.edit, ctx)}
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
  const svg = diagramSvg(node.diagram, {
    widthPx: node.widthPx,
    heightPx: node.heightPx,
    language,
    fonts,
  });

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
    return (
      <div className="my-2">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <tbody>
              {node.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) =>
                    cell.covered ? null : (
                      <td
                        key={cellIndex}
                        colSpan={cell.colSpan > 1 ? cell.colSpan : undefined}
                        rowSpan={cell.rowSpan > 1 ? cell.rowSpan : undefined}
                        className={`border border-slate-500 px-1.5 py-1 align-middle ${
                          cell.header
                            ? "bg-slate-100 font-semibold dark:bg-slate-700"
                            : ""
                        }`}
                        style={{ textAlign: cell.align }}
                      >
                        {richNodes(cell.text, language, cell.edit, ctx)}
                      </td>
                    ),
                  )}
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
  if (bandsAreEmpty(resolved.bands)) return null;

  const bands = resolved.bands;
  const body = editing ? (
    <BandEditor
      bands={bands}
      language={language}
      totalMarks={totalMarks}
      onMove={editing.onMove}
      onEditField={editing.onEditField}
      onRemoveField={editing.onRemoveField}
      onAddField={editing.onAddField}
      selection={editing.selection}
    />
  ) : (
    bands.map((band) => (
      <ReadOnlyBandRow key={band.id} band={band} language={language} totalMarks={totalMarks} />
    ))
  );

  return (
    <div
      className={`flex items-baseline gap-2 text-xs text-slate-600 ${
        edge === "header"
          ? resolved.rule
            ? "mb-2 border-b border-slate-300 pb-1"
            : "mb-2"
          : resolved.rule
            ? "mt-2 border-t border-slate-300 pt-1"
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
}: {
  band: Band;
  language: LanguageMode;
  totalMarks: number;
}) {
  const zones = zonesOf(band);
  const cell = (name: ZoneName, align: string) => (
    <div className={`flex-1 ${align}`}>
      {zones[name].map((field) => (
        <span key={field.id} className="mx-0.5">
          {richNodes(bandFieldText(field, totalMarks), language)}
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
function DraggableItem({
  id,
  dragId,
  onDragStart,
  onDragEnd,
  onDrop,
  multiSelected,
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
  children: React.ReactNode;
  className?: string;
}) {
  const [edge, setEdge] = useState<"before" | "after" | undefined>();
  const isDragging = dragId === id;
  const isTarget = Boolean(dragId) && !isDragging;

  return (
    <div
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
        // Literal hex throughout: this sits on the paper, which never themes, so a
        // semantic token would paint a dark chip on a white page in dark mode.
        className={`absolute -left-[26px] top-0.5 flex w-[18px] cursor-grab flex-col items-center justify-center gap-0 rounded border py-0.5 leading-none transition-colors duration-150 active:cursor-grabbing ${
          isDragging
            ? "border-[#7c5cff] bg-[#7c5cff] text-white shadow-sm"
            : "border-[#cfc9c2] bg-[#faf9f8] text-[#9a948e] shadow-[0_1px_1.5px_rgba(0,0,0,0.07)] group-hover/drag:border-[#a99cf0] group-hover/drag:bg-white group-hover/drag:text-[#6b6764] hover:!border-[#7c5cff] hover:!bg-[#efeaff] hover:!text-[#7c5cff]"
        }`}
      >
        {/* Resting opacity is carried by the *colour*, not by `opacity`: fading the
            whole pill washed out its border too, which is the part that makes it read
            as a control at all. Colour-only muting keeps the shape crisp while it
            recedes. */}
        <ChevronUpIcon size={8} />
        <GripIcon size={12} />
        <ChevronDownIcon size={8} />
      </span>
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
 * flow items `data-flow-id`, and every piece of interactive chrome is a real `button`.
 * Anything that matches none of them is page background.
 */
function isBlankAreaClick(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !target.closest(
    "[data-question-id],[data-flow-id],[data-band-field],button,a,input,textarea,select,[contenteditable='true']",
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
   * Move `id` to `targetId`'s position in the document flow. Omit to disable page drag.
   * `position` says which side of the target to land on.
   */
  onReorder?: (id: string, targetId: string, position: "before" | "after") => void;
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
   * The flow item being dragged on the page, or undefined when none is.
   *
   * Published so the page rail can offer its cards as drop targets — the only way to
   * move an item to a page that is not currently on screen. The drag state itself
   * stays local here: it is transient interaction state that must never reach an undo
   * entry, which is also why it is reported rather than lifted.
   */
  onDragItemChange?: (id: string | undefined) => void;
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
  onResizeBlock,
  onResizeRows,
  onSplitRows,
  onOpenBlock,
  onReorder,
  bandEditing,
  headerEditing,
  footerEditing,
  onAddQuestion,
  onPagesChange,
  onDragItemChange,
}: Props) {
  const rendered = renderWorksheet(worksheet, mode);
  const { language } = mode;
  const containerRef = useRef<HTMLDivElement>(null);
  // The header and footer bands eat into the text column, so the paginator has to
  // know how tall they are. Measured off the first rendered sheet rather than
  // assumed, because their height depends on whether they are in use at all and on
  // how many lines their slots hold.
  const bandsRef = useRef<HTMLDivElement>(null);
  const [bandsHeight, setBandsHeight] = useState(0);

  useEffect(() => {
    const node = bandsRef.current;
    if (!node) {
      setBandsHeight(0);
      return;
    }
    const measure = () => {
      // The sheet's own children, minus the flexible content column, are exactly the
      // vertical space the content does not get.
      const total = Array.from(node.children).reduce(
        (sum, child) =>
          child.classList.contains("flex-1")
            ? sum
            : sum + (child as HTMLElement).offsetHeight,
        0,
      );
      setBandsHeight(total);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
    // The observer catches band content changes on its own; this only needs to re-run
    // when the sheet itself is replaced, which a paper or margin change does.
  }, [worksheet.header, worksheet.footer, worksheet.pageSetup]);

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
  // Set while handling a click inside the preview, so the scroll effect below does
  // not yank the page under someone who just clicked what they were already looking at.
  const selfSelected = useRef(false);

  // The element the user has selected on the page. Identified by its edit target
  // plus language side, so the two halves of a bilingual line select separately.
  const [selectedElement, setSelectedElement] = useState<
    { target: EditTarget; side: "en" | "zh" } | undefined
  >();

  // The picture selected for resizing. Its own state rather than a variant of
  // `selectedElement`, because a block has no language side and nothing to format —
  // see `EditContext.resize`. The two are mutually exclusive: selecting one clears the
  // other, so Delete and the format toolbar always have an unambiguous subject.
  const [selectedBlockId, setSelectedBlockId] = useState<string | undefined>();

  // The item being dragged on the page. Local rather than in the store, because it is
  // transient interaction state that must never reach an undo entry or a save.
  const [dragId, setDragId] = useState<string | undefined>();

  // Tell the page rail what is in flight. An effect rather than a call beside each
  // `setDragId`, so every path that ends a drag — drop, escape, dragend — reports it.
  useEffect(() => {
    onDragItemChange?.(dragId);
  }, [dragId, onDragItemChange]);

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
    // The question selection lives in the store rather than here, and the whole-item
    // Delete handler acts on it — so leaving it set meant a blank click deselected
    // everything visible while Delete still removed the entire question.
    onSelectQuestion?.(undefined);
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
   */
  const bandSelection = {
    isSelected: (fieldId: string) =>
      selectedElement?.target.kind === "bandField" &&
      selectedElement.target.fieldId === fieldId,
    onSelect: (fieldId: string) => {
      setSelectedElement({
        target: { kind: "bandField", fieldId },
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
      const active = document.activeElement;
      if (
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLInputElement ||
        (active instanceof HTMLElement && active.isContentEditable)
      ) {
        return;
      }

      const meta = event.metaKey || event.ctrlKey;

      if (meta && event.key.toLowerCase() === "a") {
        event.preventDefault();
        const all = new Set<string>();
        for (const node of containerRef.current?.querySelectorAll<HTMLElement>(
          "#print-root [data-flow-id]",
        ) ?? []) {
          if (node.dataset.flowId) all.add(node.dataset.flowId);
        }
        setMultiIds(all);
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
        if (multiIds.size === 0) return;
        event.preventDefault();
        onBulkDelete?.([...multiIds]);
        setMultiIds(new Set());
        return;
      }

      if (event.key === "Escape") {
        setMultiIds(new Set());
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [multiIds, clip, onBulkDelete, onBulkDuplicate]);

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
            selection={bandSelection}
          />
        ) : (
          rendered.bands.map((node, index) => (
            <NodeView key={index} node={node} language={language} ctx={ctx} />
          ))
        )
      ) : (
        <NodeView node={rendered.title!} language={language} ctx={ctx} />
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
        <NodeView node={rendered.instructions} language={language} ctx={ctx} />
      ),
    });
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
            onDragStart={() => setDragId(id)}
            onDragEnd={() => setDragId(undefined)}
            onDrop={(position) => {
              if (dragId) onReorder(dragId, id, position);
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
      bandsHeight,
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

  const pageStyle: React.CSSProperties = {
    width: `${pageWidthMm}mm`,
    height: `${pageHeightMm}mm`,
    // Margins are authored in twips and mirrored here, so the text column the
    // teacher sees is the one Word will use.
    paddingTop: `${twipsToMm(setup.margins.top)}mm`,
    paddingRight: `${twipsToMm(setup.margins.right)}mm`,
    paddingBottom: `${twipsToMm(setup.margins.bottom)}mm`,
    paddingLeft: `${twipsToMm(setup.margins.left)}mm`,
    fontFamily: `'${worksheet.fonts.latin}', '${worksheet.fonts.eastAsia}', serif`,
  };

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
              className="paper paper-shadow flex flex-col overflow-hidden rounded-[2px]"
              style={pageStyle}
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
              <HeaderFooterBand
                value={header}
                language={language}
                edge="header"
                pageNumber={pageIndex + 1}
                pageCount={pages.length}
                totalMarks={worksheetMarks(worksheet)}
                editing={withSelection(headerEditing)}
              />

              <div className="min-h-0 flex-1">
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
                            if (dragId) onReorder(dragId, breakId, position);
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

              <HeaderFooterBand
                value={footer}
                language={language}
                edge="footer"
                pageNumber={pageIndex + 1}
                pageCount={pages.length}
                totalMarks={worksheetMarks(worksheet)}
                editing={withSelection(footerEditing)}
              />
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
      {multiIds.size > 0 && (
        <div className="pointer-events-none fixed bottom-16 left-[76px] right-[400px] z-40 flex justify-center">
          <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-line bg-surface-raised/95 py-2 pl-4 pr-2 text-[12px] shadow-xl backdrop-blur">
            <span className="font-medium text-ink">
              {multiIds.size} selected
            </span>
            <span className="text-[11px] text-ink-subtle">
              ⌘C copy · ⌘V paste · ⌫ delete · Esc clear
            </span>
            <IconButton
              label="Clear selection"
              onClick={() => setMultiIds(new Set())}
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
            subject={TARGET_NAME[selectedElement.target.kind]}
            inheritedPt={selectionPt}
            onClose={() => setSelectedElement(undefined)}
            format={formatOf?.(selectedElement.target)}
            onChange={(patch) => onFormat(selectedElement.target, patch)}
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
