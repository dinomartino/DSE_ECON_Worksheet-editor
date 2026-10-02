"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { cssFontFamilies } from "@/model/fonts";
import { targetQuestionId } from "@/model/edits";
import {
  BAND_ROW_TWIPS,
  bandsOverflow,
  createPageNumberField,
  headerFooterOffsets,
  pageDimensions,
  pageSetupOf,
  twipsToMm,
} from "@/model/page";
import type { BiText, HeaderFooter, LanguageMode, Worksheet } from "@/model/types";
import { answerKeyRunningHead, answerKeyTitleOverride, answerKeyView } from "@/render/answerKey";
import type { EditTarget, RenderNode } from "@/render/ir";
import { IconButton } from "@/components/ui";
import { MinusIcon, PlusIcon } from "@/components/ui/icons";
import { useMessages } from "@/i18n/language";
import { placementKey } from "./pagination";
import { sheetStackMargin } from "./sheetStack";
import {
  HeaderFooterBand,
  isBlankAreaClick,
  MM_TO_PX,
  NodeView,
  sameTarget,
  usePagination,
  type EditContext,
  type FlowBlock,
} from "./Preview";
import { PREVIEW_MESSAGES } from "./messages";
import { ANSWER_KEY_PREVIEW_MESSAGES } from "./AnswerKeyPreview.messages";

/**
 * The Marking scheme view: the answer key (`render/answerKey.ts`) on real sheets.
 *
 * The very nodes the `.docx` key is built from, packed by the paper's own measure-then-
 * pack paginator onto the paper's page setup and fonts, under the key's page rules: no
 * header, bands or cover, a centred page number in the footer. Inside `#print-root`, so
 * the PDF path prints it as it prints the paper.
 *
 * The flow is cut where Word may break it: after every node that does not keep with the
 * next (`keepNext`), so a sheet ends where the `.docx` page does. Text carrying an edit
 * target is typed in place through the store's normal edit path (one source of truth with
 * the Teacher version); a click on a question's entry selects that question for the
 * sidebar. No paper chrome: nothing is added, dragged or reordered here.
 */

/** The key's footer: the page number, centred, unruled — what `buildAnswerKeyParts` writes. */
const KEY_FOOTER: HeaderFooter = {
  enabled: true,
  bands: [
    {
      id: "answer-key-footer",
      zones: { left: [], center: [{ ...createPageNumberField(), id: "answer-key-page" }], right: [] },
    },
  ],
  rule: false,
  showOnFirstPage: true,
};

/** Runs of nodes Word keeps together: each ends at a node that does not keep with the next. */
export function keepTogetherRuns(nodes: RenderNode[]): Array<{ from: number; to: number }> {
  const runs: Array<{ from: number; to: number }> = [];
  let from = 0;
  nodes.forEach((node, index) => {
    const keeps = "keepNext" in node && node.keepNext;
    if (!keeps || index === nodes.length - 1) {
      runs.push({ from, to: index });
      from = index + 1;
    }
  });
  return runs;
}

/** The selected question's runs: the page's selection tint, literal hex as on all paper. */
const SELECTED_RUN = "bg-[#0d77c9]/[0.06]";

/** Only text can carry an edit target here; tables and figures render without page chrome. */
const editable = (node: RenderNode) => node.kind === "text" || node.kind === "columns";

const KeyRun = memo(
  function KeyRun({
    nodes,
    owner,
    language,
    ctx,
    selected,
    onSelect,
  }: {
    nodes: RenderNode[];
    owner?: string;
    language: LanguageMode;
    ctx?: EditContext;
    /** Flattened selection state the ctx reads at render time (see `ItemBody`). */
    ctxStamp: string;
    selected: boolean;
    onSelect: (questionId: string) => void;
  }) {
    const body = nodes.map((node, index) => (
      <NodeView key={index} node={node} language={language} ctx={editable(node) ? ctx : undefined} />
    ));
    if (!owner) return <div>{body}</div>;
    return (
      <div
        data-question-id={owner}
        aria-current={selected}
        onClick={() => onSelect(owner)}
        // A question's entry spans several runs, so the selection is the wash alone: a
        // ring per run would cut one entry into boxes. Reserves no space (see `ItemBody`).
        className={`relative cursor-pointer transition-[background-color] duration-150 ease-out-soft ${
          selected ? SELECTED_RUN : ""
        }`}
      >
        {body}
      </div>
    );
  },
  (prev, next) =>
    prev.nodes === next.nodes &&
    prev.owner === next.owner &&
    prev.language === next.language &&
    prev.selected === next.selected &&
    prev.ctxStamp === next.ctxStamp &&
    (prev.ctx === undefined) === (next.ctx === undefined),
);

export function AnswerKeyPreview({
  worksheet,
  language,
  selectedQuestionId,
  onSelectQuestion,
  onEdit,
}: {
  worksheet: Worksheet;
  language: LanguageMode;
  selectedQuestionId?: string;
  /** Select a question for the sidebar, or clear the selection. */
  onSelectQuestion?: (questionId?: string) => void;
  /** Commit an in-place edit. Omit to render read-only (print preview, a newer file). */
  onEdit?: (target: EditTarget, next: BiText) => void;
}) {
  const m = useMessages(PREVIEW_MESSAGES);
  const km = useMessages(ANSWER_KEY_PREVIEW_MESSAGES);
  const containerRef = useRef<HTMLDivElement>(null);

  // The key and its keep-together runs, rebuilt only when the document or language does.
  // The key's own lines (title, subtitle) take their edit targets here, on the page's
  // copy only: the export's nodes stay exactly as `renderAnswerKey` gives them.
  const { nodes, runs, empty, runningHead } = useMemo(() => {
    const view = answerKeyView(worksheet, language);
    const shown = view.nodes.map((node, index) => {
      const field = view.fields.find((entry) => entry.index === index);
      return field && node.kind === "text" ? { ...node, edit: field.edit } : node;
    });
    return {
      nodes: shown,
      empty: view.owners.every((owner) => owner === undefined),
      runningHead: answerKeyRunningHead(view.nodes, language),
      runs: keepTogetherRuns(shown).map(({ from, to }) => ({
        key: `key-${from}`,
        nodes: shown.slice(from, to + 1),
        owner: view.owners.slice(from, to + 1).find((owner) => owner !== undefined),
      })),
    };
  }, [worksheet, language]);

  const [selectedElement, setSelectedElement] = useState<
    { target: EditTarget; side: "en" | "zh" } | undefined
  >();

  const selectOwner = (target: EditTarget) => {
    const owner = targetQuestionId(worksheet, target);
    if (owner) onSelectQuestion?.(owner);
  };

  // A typed title keeps following the document's title on the sides left as derived.
  const write = (target: EditTarget, next: BiText) =>
    onEdit?.(target, target.kind === "answerKeyTitle" ? answerKeyTitleOverride(worksheet, next) : next);
  const ctx: EditContext | undefined = onEdit
    ? {
        onEdit: (target, next) => {
          write(target, next);
          setSelectedElement(undefined);
        },
        onEditKeepingSelection: write,
        onSelectElement: (target, side) => {
          setSelectedElement({ target, side });
          selectOwner(target);
        },
        onClearSelection: () => setSelectedElement(undefined),
        isSelected: (target, side) =>
          selectedElement?.side === side && sameTarget(selectedElement.target, target),
      }
    : undefined;
  const ctxStamp = selectedElement
    ? `${JSON.stringify(selectedElement.target)}|${selectedElement.side}`
    : "";
  const select = (questionId: string) => onSelectQuestion?.(questionId);

  // Page geometry from the model the exporter reads; the footer is one page-number row.
  const setup = pageSetupOf(worksheet);
  const dimensions = pageDimensions(setup);
  const pageWidthMm = twipsToMm(dimensions.width);
  const pageHeightMm = twipsToMm(dimensions.height);
  // A Marks column's running head is a one-row header, as `buildAnswerKeyParts` writes it.
  const headHeight = runningHead ? BAND_ROW_TWIPS : 0;
  const offsets = headerFooterOffsets(setup.margins, headHeight, BAND_ROW_TWIPS);
  const footerOffset = offsets.footer;
  const overflow = bandsOverflow(setup.margins, headHeight, BAND_ROW_TWIPS);
  const contentHeightPx = Math.floor(
    (pageHeightMm -
      twipsToMm(setup.margins.top + overflow.header) -
      twipsToMm(setup.margins.bottom + overflow.footer)) *
      MM_TO_PX,
  );
  const fontFamily = `${cssFontFamilies(worksheet.fonts)}, serif`;
  const fontSize = worksheet.baseFontSize !== undefined ? { fontSize: `${worksheet.baseFontSize}pt` } : {};

  const blocks: FlowBlock[] = runs.map((run) => ({
    key: run.key,
    node: (
      <KeyRun
        nodes={run.nodes}
        owner={run.owner}
        language={language}
        ctx={ctx}
        ctxStamp={ctxStamp}
        selected={run.owner !== undefined && run.owner === selectedQuestionId}
        onSelect={select}
      />
    ),
  }));

  const { pages, fragments, probeRef } = usePagination(blocks, contentHeightPx, [
    nodes,
    language,
    contentHeightPx,
  ]);

  // Fit the true-size sheet to the column, times the reader's zoom (as the paper does).
  const [fitScale, setFitScale] = useState(1);
  const [zoom, setZoom] = useState(1);
  const scale = fitScale * zoom;
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const fit = () => {
      const available = element.clientWidth;
      const pageWidth = pageWidthMm * MM_TO_PX;
      setFitScale(available > 0 && available < pageWidth ? available / pageWidth : 1);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, [pageWidthMm]);

  // A question chosen in the sidebar scrolls its entry into view; a click here does not.
  const selfSelected = useRef(false);
  useEffect(() => {
    if (!selectedQuestionId) return;
    if (selfSelected.current) {
      selfSelected.current = false;
      return;
    }
    containerRef.current
      ?.querySelector(`#print-root [data-question-id="${CSS.escape(selectedQuestionId)}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [selectedQuestionId]);

  const pageStyle: React.CSSProperties = {
    width: `${pageWidthMm}mm`,
    height: `${pageHeightMm}mm`,
    paddingTop: `${twipsToMm(setup.margins.top + overflow.header)}mm`,
    paddingRight: `${twipsToMm(setup.margins.right)}mm`,
    paddingBottom: `${twipsToMm(setup.margins.bottom + overflow.footer)}mm`,
    paddingLeft: `${twipsToMm(setup.margins.left)}mm`,
    fontFamily,
    ...fontSize,
  };

  return (
    <div
      ref={containerRef}
      className="flow-root w-full"
      onClickCapture={(event) => {
        if ((event.target as Element).closest?.("[data-question-id]")) selfSelected.current = true;
      }}
    >
      <div className="pointer-events-none fixed bottom-4 right-[416px] z-30">
        <div className="pointer-events-auto flex items-center gap-0.5 rounded-lg border border-line bg-surface-raised p-1 shadow-md">
          <IconButton
            label={m.zoomOut}
            onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.1) * 10) / 10))}
            disabled={zoom <= 0.5}
          >
            <MinusIcon size={14} />
          </IconButton>
          <button
            type="button"
            onClick={() => setZoom(1)}
            title={m.zoomReset}
            className="min-w-[3.25rem] cursor-pointer rounded-md px-1 text-center text-[11px] font-semibold tabular-nums text-ink-muted transition-[color,scale] duration-150 ease-out-soft hover:text-ink active:scale-[0.97]"
          >
            {Math.round(scale * 100)}%
          </button>
          <IconButton
            label={m.zoomIn}
            onClick={() => setZoom((z) => Math.min(2, Math.round((z + 0.1) * 10) / 10))}
            disabled={zoom >= 2}
          >
            <PlusIcon size={14} />
          </IconButton>
        </div>
      </div>

      <div
        id="print-root"
        data-answer-key
        aria-label={km.sheets}
        className="flex flex-col items-center gap-6"
        style={{
          width: `${pageWidthMm}mm`,
          marginLeft: `calc(max(0px, (100% - ${scale * pageWidthMm}mm) / 2) - ${((1 - scale) * pageWidthMm) / 2}mm)`,
          transform: scale === 1 ? undefined : `scale(${scale})`,
          transformOrigin: "top center",
          marginBottom: sheetStackMargin(scale, pageHeightMm, pages.length),
        }}
      >
        {pages.map((pageBlocks, pageIndex) => (
          <div key={pageIndex} data-page-index={pageIndex} className="relative">
            <div
              className="paper paper-shadow relative flex flex-col overflow-hidden rounded-[2px]"
              style={pageStyle}
              lang={language === "zh" ? "zh-HK" : "en"}
              onClick={(event) => {
                if (!isBlankAreaClick(event.target)) return;
                setSelectedElement(undefined);
                onSelectQuestion?.(undefined);
              }}
            >
              <div className="min-h-0 flex-1">
                {pageBlocks.map((block, blockIndex) => {
                  const piece = fragments.get(placementKey(pageIndex, blockIndex));
                  return (
                    <div
                      key={piece ? `${block.key}#${piece.from}` : block.key}
                      className={blockIndex === 0 ? "leads-sheet" : undefined}
                    >
                      {piece && block.slice ? block.slice(piece) : block.node}
                    </div>
                  );
                })}
                {empty && pageIndex === 0 && (
                  <p
                    data-print-hide
                    className="mt-6 rounded-lg border border-dashed border-[#ddd8d2] px-4 py-3 text-center font-sans text-[12px] text-[#8f8a86]"
                  >
                    {km.empty}
                  </p>
                )}
              </div>
              {runningHead && (
                <div
                  data-band-box="header"
                  className="text-right font-bold"
                  style={{
                    position: "absolute",
                    left: `${twipsToMm(setup.margins.left)}mm`,
                    right: `${twipsToMm(setup.margins.right)}mm`,
                    top: `${twipsToMm(offsets.header)}mm`,
                    whiteSpace: "nowrap",
                  }}
                >
                  {runningHead}
                </div>
              )}
              <div
                data-band-box="footer"
                style={{
                  position: "absolute",
                  left: `${twipsToMm(setup.margins.left)}mm`,
                  right: `${twipsToMm(setup.margins.right)}mm`,
                  bottom: `${twipsToMm(footerOffset)}mm`,
                }}
              >
                <HeaderFooterBand
                  value={KEY_FOOTER}
                  language={language}
                  edge="footer"
                  pageNumber={pageIndex + 1}
                  pageCount={pages.length}
                  totalMarks={0}
                />
              </div>
            </div>
            <span
              data-print-hide
              className="paper-page-number pointer-events-none absolute -bottom-5 right-0 text-[10px] font-medium tabular-nums text-ink-subtle"
            >
              {pageIndex + 1} / {pages.length}
            </span>
          </div>
        ))}
      </div>

      {/* The measurement probe: the same runs at true content width, as the paper's. */}
      <div
        aria-hidden
        data-print-hide
        className="paper pointer-events-none invisible absolute -z-10"
        style={{
          position: "absolute",
          top: 0,
          left: -99999,
          width: `calc(${pageWidthMm}mm - ${twipsToMm(setup.margins.left)}mm - ${twipsToMm(setup.margins.right)}mm)`,
          fontFamily,
          ...fontSize,
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
    </div>
  );
}
