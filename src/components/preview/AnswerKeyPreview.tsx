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
import type { EditTarget, RenderNode, TableNode } from "@/render/ir";
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

/** Runs of items kept together: each ends at one that does not keep with the next. */
function runsOf(keeps: boolean[]): Array<{ from: number; to: number }> {
  const runs: Array<{ from: number; to: number }> = [];
  let from = 0;
  keeps.forEach((keep, index) => {
    if (!keep || index === keeps.length - 1) {
      runs.push({ from, to: index });
      from = index + 1;
    }
  });
  return runs;
}

/** Runs of nodes Word keeps together: each ends at a node that does not keep with the next. */
export function keepTogetherRuns(nodes: RenderNode[]): Array<{ from: number; to: number }> {
  return runsOf(nodes.map((node) => Boolean("keepNext" in node && node.keepNext)));
}

/**
 * What the key is packed by: a node, or one row of a table that may break between rows
 * (`TableNode.rowKeepNext`), which Word lays out row by row. A row keeps with the next
 * where the IR says so; heading rows always keep with the first row under them.
 */
export interface KeyUnit {
  index: number;
  row?: number;
  keepNext: boolean;
}

export function keyUnits(nodes: RenderNode[]): KeyUnit[] {
  return nodes.flatMap((node, index): KeyUnit[] => {
    if (node.kind !== "table" || !node.rowKeepNext) {
      return [{ index, keepNext: Boolean("keepNext" in node && node.keepNext) }];
    }
    const last = node.rows.length - 1;
    return node.rows.map((_, row) => ({
      index,
      row,
      keepNext:
        row < (node.headerRows ?? 0) ||
        Boolean(node.rowKeepNext?.[row]) ||
        (row === last && Boolean(node.keepNext)),
    }));
  });
}

/**
 * One run's nodes as the sheet draws them: whole nodes, and each table cut to the rows
 * the run holds. A run opening in the middle of a table `joins` the piece above (its top
 * rule is that piece's bottom one); `lead` is how it draws when it opens a sheet instead:
 * its top ruled and the table's heading rows back on top (Word's `w:tblHeader`). `head` is
 * those heading rows alone, measured for the paginator (`PackItem.leadKey`).
 */
export function runNodes(
  nodes: RenderNode[],
  units: KeyUnit[],
): { nodes: RenderNode[]; continues: boolean[]; joins?: true; lead?: RenderNode[]; head?: RenderNode } {
  const out: RenderNode[] = [];
  const continues: boolean[] = [];
  /** A table cut to rows `rows` (indices into its own), not repeating its heading itself. */
  const cut = (table: TableNode, rows: number[]): TableNode => ({
    ...table,
    rows: rows.map((row) => table.rows[row]),
    rowHeights: rows.map((row) => table.rowHeights[row]),
    rowKeepNext: rows.map((row) => Boolean(table.rowKeepNext?.[row])),
    headerRows: undefined,
  });
  const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

  for (let at = 0; at < units.length; ) {
    const unit = units[at];
    const node = nodes[unit.index];
    at += 1;
    if (unit.row === undefined || node.kind !== "table") {
      out.push(node);
      continues.push(false);
      continue;
    }
    let to = unit.row;
    while (at < units.length && units[at].index === unit.index) to = units[at++].row!;
    out.push(cut(node, range(unit.row, to)));
    continues.push(to < node.rows.length - 1);
  }

  // A run opening in the middle of a table joins the piece above it (no rule of its own on
  // top, or the two rules would stack); opening a sheet, it puts its heading back on top.
  const [first] = units;
  const table = first ? nodes[first.index] : undefined;
  if (table?.kind !== "table" || first.row === undefined || first.row === 0) {
    return { nodes: out, continues };
  }
  const heading = table.headerRows ?? 0;
  if (heading === 0) return { nodes: out, continues, joins: true, lead: out };
  const shown = out[0] as TableNode;
  const headRows = range(0, heading - 1);
  return {
    nodes: out,
    continues,
    joins: true,
    head: cut(table, headRows),
    lead: [
      {
        ...shown,
        rows: [...headRows.map((row) => table.rows[row]), ...shown.rows],
        rowHeights: [...headRows.map((row) => table.rowHeights[row]), ...shown.rowHeights],
        rowKeepNext: [...headRows.map(() => true), ...(shown.rowKeepNext ?? [])],
      },
      ...out.slice(1),
    ],
  };
}

/** The selected question's runs: the page's selection tint, literal hex as on all paper. */
const SELECTED_RUN = "bg-[#0d77c9]/[0.06]";

/** The same tint on the selected question's MC cells, which share one table with the rest. */
export const selectedCellRule = (questionId: string) =>
  `#print-root[data-answer-key] td[data-question-id=${JSON.stringify(questionId)}]{background-color:rgb(13 119 201 / 0.1)}`;

/**
 * Text can carry an edit target here, and so can the cells of the key's own tables;
 * other tables and figures render without page chrome.
 */
const editable = (node: RenderNode) =>
  node.kind === "text" ||
  node.kind === "columns" ||
  (node.kind === "table" && node.rows.some((row) => row.some((cell) => cell.edit || cell.segments)));

const KeyRun = memo(
  function KeyRun({
    nodes,
    continues,
    joins,
    owner,
    language,
    ctx,
    selected,
    onSelect,
  }: {
    nodes: RenderNode[];
    /** Per node: a table piece whose rows go on in a later run. */
    continues?: boolean[];
    /** The first node is a table piece joining the piece above it. */
    joins?: boolean;
    owner?: string;
    language: LanguageMode;
    ctx?: EditContext;
    /** Flattened selection state the ctx reads at render time (see `ItemBody`). */
    ctxStamp: string;
    selected: boolean;
    onSelect: (questionId: string) => void;
  }) {
    const body = nodes.map((node, index) => (
      <NodeView
        key={index}
        node={node}
        language={language}
        ctx={editable(node) ? ctx : undefined}
        tableContinues={continues?.[index]}
        tableJoinsAbove={index === 0 && joins}
      />
    ));
    if (!owner) {
      // A table of many questions (the MC grid): each cell names its own.
      return (
        <div
          onClick={(event) => {
            const cell = (event.target as Element).closest?.("td[data-question-id]");
            const id = cell?.getAttribute("data-question-id");
            if (id) onSelect(id);
          }}
        >
          {body}
        </div>
      );
    }
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
    prev.continues === next.continues &&
    prev.joins === next.joins &&
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
    // Packed by unit, so a table that may break between rows does (`keyUnits`).
    const units = keyUnits(shown);
    return {
      nodes: shown,
      empty: view.owners.every((owner) => owner === undefined),
      runningHead: answerKeyRunningHead(view.nodes, language),
      runs: runsOf(units.map((unit) => unit.keepNext)).map(({ from, to }) => {
        const held = units.slice(from, to + 1);
        const first = held[0];
        return {
          key: `key-${first.index}${first.row !== undefined ? `r${first.row}` : ""}`,
          // One measured heading per table, however many runs repeat it.
          headKey: `head-${first.index}`,
          ...runNodes(shown, held),
          owner: held.map((unit) => view.owners[unit.index]).find((owner) => owner !== undefined),
        };
      }),
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

  const keyRun = (run: (typeof runs)[number], nodes: RenderNode[], joins?: boolean) => (
    <KeyRun
      nodes={nodes}
      continues={run.continues}
      joins={joins}
      owner={run.owner}
      language={language}
      ctx={ctx}
      ctxStamp={ctxStamp}
      selected={run.owner !== undefined && run.owner === selectedQuestionId}
      onSelect={select}
    />
  );
  const blocks: FlowBlock[] = runs.map((run) => ({
    key: run.key,
    node: keyRun(run, run.nodes, run.joins),
    // Opening a sheet mid-table, the run closes its top and draws the heading again.
    ...(run.lead ? { lead: keyRun(run, run.lead) } : {}),
    ...(run.head ? { leadKey: run.headKey } : {}),
  }));
  /** Each repeated heading alone, measured so the packer can charge it (`leadKey`). */
  const heads = [
    ...new Map(
      runs.flatMap((run) =>
        run.head
          ? [[run.headKey, { key: run.headKey, node: <NodeView node={run.head} language={language} tableContinues /> }] as const]
          : [],
      ),
    ).values(),
  ];

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

      {selectedQuestionId && <style>{selectedCellRule(selectedQuestionId)}</style>}
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
                      {piece && block.slice
                        ? block.slice(piece)
                        : blockIndex === 0 && block.lead
                          ? block.lead
                          : block.node}
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

      {/* The measurement probe: the same runs at true content width, as the paper's.
          Zero-height and clipped, or it scrolls the window (and prints blank pages). */}
      <div
        aria-hidden
        data-print-hide
        data-measure-probe
        className="paper pointer-events-none invisible absolute -z-10 h-0 overflow-hidden"
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
          {[...blocks, ...heads].map((block) => (
            <div key={block.key} data-block-key={block.key}>
              {block.node}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
