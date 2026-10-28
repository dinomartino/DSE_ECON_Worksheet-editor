"use client";

import { useRef } from "react";
import type { PageSetup, Watermark } from "@/model/types";
import { pageDimensions, twipsToMm } from "@/model/page";
import { watermarkBox, watermarkOpacity, withWatermarkPlacement } from "@/model/watermark";
import { WatermarkIcon } from "@/components/ui/icons";
import { useMessages } from "@/i18n/language";
import { WATERMARK_PAGE_MESSAGES } from "./WatermarkLayer.messages";

/**
 * The watermark on one sheet (k-0242): the picture, faint and centred on the page, behind
 * everything printed there.
 *
 * Behind, not over: the sheet that draws it is `isolate`, so `-z-10` puts the layer above
 * the paper's white and under every line of the page, positioned ones (the header bands)
 * included. Deliberately **not** `data-print-hide` — it is print output, like the page
 * furniture — and `aria-hidden`, `pointer-events-none`, because it is no editing surface.
 * The geometry is `watermarkBox`'s, the one the `.docx` places its picture by.
 */
export function WatermarkLayer({ mark, setup }: { mark: Watermark; setup: PageSetup }) {
  const box = watermarkBox(mark, setup);
  const mm = (twips: number) => `${twipsToMm(twips)}mm`;
  return (
    <div aria-hidden data-watermark className="pointer-events-none absolute inset-0 -z-10">
      {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL, printed as is */}
      <img
        alt=""
        src={mark.src}
        draggable={false}
        style={{
          position: "absolute",
          left: mm(box.left),
          top: mm(box.top),
          width: mm(box.width),
          height: mm(box.height),
          opacity: watermarkOpacity(mark),
          maxWidth: "none",
        }}
      />
    </div>
  );
}

/**
 * The per-page controls, in the gap above the sheet's top-right corner (editing chrome,
 * `data-print-hide`, drawn only while the paper has a watermark):
 *
 * - the switch: whether this page carries the paper's watermark. `disabled` (with `title`
 *   saying why) on a sheet holding only the tail of a question cut across sheets: it has
 *   nothing of its own to store a choice on and follows the page before (§ `sheetWatermarks`);
 * - Move or resize, on a page that shows it, which puts every watermarked page into the
 *   adjusting state (`WatermarkAdjuster`); there it reads Done.
 */
export function SheetWatermarkToggle({
  on,
  cover = false,
  disabled = false,
  onToggle,
  adjusting = false,
  onAdjust,
}: {
  on: boolean;
  cover?: boolean;
  disabled?: boolean;
  onToggle: () => void;
  adjusting?: boolean;
  /** Start (true) or finish (false) moving and resizing; absent, no button. */
  onAdjust?: (adjusting: boolean) => void;
}) {
  const m = useMessages(WATERMARK_PAGE_MESSAGES);
  const label = disabled ? m.follows : cover ? (on ? m.coverOff : m.coverOn) : on ? m.turnOff : m.turnOn;
  const chip =
    "flex h-[18px] cursor-pointer items-center gap-1 whitespace-nowrap rounded-full border px-2 text-[10.5px] leading-none font-medium transition-colors duration-150 ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-default disabled:opacity-60";
  return (
    <span data-print-hide className="absolute bottom-full right-0 z-10 mb-[3px] flex items-center gap-1">
      {onAdjust && on && (
        <button
          type="button"
          data-watermark-adjust={adjusting ? "done" : "start"}
          title={adjusting ? undefined : m.adjustTitle}
          onClick={(event) => {
            event.stopPropagation();
            onAdjust(!adjusting);
          }}
          className={`${chip} ${
            adjusting ? "border-accent bg-accent text-white" : "border-line bg-surface-raised text-ink-muted hover:text-ink"
          }`}
        >
          {adjusting ? m.done : m.adjust}
        </button>
      )}
      <button
        type="button"
        data-watermark-toggle={on ? "on" : "off"}
        aria-pressed={on}
        aria-label={label}
        title={label}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
        className={`${chip} ${
          on ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface-raised text-ink-muted hover:text-ink"
        }`}
      >
        <WatermarkIcon size={11} />
        <span>{on ? m.on : m.off}</span>
      </button>
    </span>
  );
}

type Corner = "nw" | "ne" | "sw" | "se";
const CORNERS: Corner[] = ["nw", "ne", "sw", "se"];
/** The smallest box a corner drag makes, in twips (about 1.8 cm). */
const MIN_WIDTH_TWIPS = 1000;

/**
 * Move and resize the watermark on the page (k-0242 follow-up, user u-vo9f): a dashed frame
 * over the picture's box, dragged to move it, with a handle at each corner that resizes it
 * from the opposite corner, keeping its shape.
 *
 * Pointer events, so a mouse, a trackpad and a finger on an iPad all drive the same code;
 * the frame and handles take `touch-action: none` (a finger drags them instead of scrolling
 * the page), the rest of the sheet does not, so the page still scrolls. A press anywhere
 * else on the sheet ends it, as Esc and Done do; pressing there neither selects nor edits.
 *
 * Every move draws live through `onDraft` (all watermarked sheets follow), and the release
 * commits once (`onCommit`, one undo step). The frame's own geometry is `watermarkBox`'s, so
 * what the teacher lets go of is what prints, in the PDF and in Word. Deliberately
 * `data-print-hide`: none of this prints.
 */
export function WatermarkAdjuster({
  mark,
  setup,
  onDraft,
  onCommit,
  onDone,
}: {
  mark: Watermark;
  setup: PageSetup;
  onDraft: (mark: Watermark) => void;
  onCommit: (mark: Watermark) => void;
  onDone: () => void;
}) {
  const m = useMessages(WATERMARK_PAGE_MESSAGES);
  const overlayRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    pointer: number;
    x: number;
    y: number;
    box: ReturnType<typeof watermarkBox>;
    corner?: Corner;
    twipsPerPx: number;
    last?: Watermark;
  }>(undefined);
  const box = watermarkBox(mark, setup);
  const mm = (twips: number) => `${twipsToMm(twips)}mm`;

  const begin = (event: React.PointerEvent, corner?: Corner) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const overlay = overlayRef.current;
    if (!overlay) return;
    // Measured, not assumed: the sheet stack is scaled by the zoom.
    const twipsPerPx = pageDimensions(setup).width / overlay.getBoundingClientRect().width;
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, box, corner, twipsPerPx };
  };

  const move = (event: React.PointerEvent) => {
    const state = drag.current;
    if (!state || state.pointer !== event.pointerId) return;
    event.preventDefault();
    const dx = (event.clientX - state.x) * state.twipsPerPx;
    const dy = (event.clientY - state.y) * state.twipsPerPx;
    const start = state.box;
    let next: { left: number; top: number; width: number };
    if (!state.corner) {
      next = { left: start.left + dx, top: start.top + dy, width: start.width };
    } else {
      const west = state.corner.endsWith("w");
      const north = state.corner.startsWith("n");
      // The opposite corner stays put; the dragged one follows the pointer, the shape kept.
      const anchorX = west ? start.left + start.width : start.left;
      const anchorY = north ? start.top + start.height : start.top;
      const pointerX = (west ? start.left : start.left + start.width) + dx;
      const pointerY = (north ? start.top : start.top + start.height) + dy;
      const ratio = start.width / start.height;
      const width = Math.max(MIN_WIDTH_TWIPS, Math.abs(pointerX - anchorX), Math.abs(pointerY - anchorY) * ratio);
      const height = width / ratio;
      next = { left: west ? anchorX - width : anchorX, top: north ? anchorY - height : anchorY, width };
    }
    state.last = withWatermarkPlacement(mark, setup, next);
    onDraft(state.last);
  };

  const end = (event: React.PointerEvent) => {
    const state = drag.current;
    if (!state || state.pointer !== event.pointerId) return;
    drag.current = undefined;
    if (state.last) onCommit(state.last);
  };

  const nudge = (event: React.KeyboardEvent) => {
    const page = pageDimensions(setup);
    const step = (event.shiftKey ? 0.05 : 0.01) * page.width;
    const at = { left: box.left, top: box.top, width: box.width };
    if (event.key === "ArrowLeft") at.left -= step;
    else if (event.key === "ArrowRight") at.left += step;
    else if (event.key === "ArrowUp") at.top -= step;
    else if (event.key === "ArrowDown") at.top += step;
    else if (event.key === "+" || event.key === "=" || event.key === "-" || event.key === "−") {
      const grow = event.key === "-" || event.key === "−" ? -step : step;
      const height = box.height * ((box.width + grow) / box.width);
      at.left = box.left - grow / 2;
      at.top = box.top - (height - box.height) / 2;
      at.width = Math.max(MIN_WIDTH_TWIPS, box.width + grow);
    } else if (event.key === "Escape" || event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      onDone();
      return;
    } else return;
    event.preventDefault();
    event.stopPropagation();
    onCommit(withWatermarkPlacement(mark, setup, at));
  };

  return (
    <div
      ref={overlayRef}
      data-print-hide
      data-watermark-adjuster
      className="absolute inset-0 z-30"
      // A press here is not a sweep, a selection or a click on the page.
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) onDone();
      }}
    >
      <div
        role="group"
        tabIndex={0}
        aria-label={m.frame}
        title={m.frame}
        data-watermark-frame
        onPointerDown={(event) => begin(event)}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onKeyDown={nudge}
        className="absolute cursor-move rounded-[2px] outline-2 outline-dashed outline-accent focus-visible:outline-solid"
        style={{ left: mm(box.left), top: mm(box.top), width: mm(box.width), height: mm(box.height), touchAction: "none" }}
      >
        {CORNERS.map((corner) => (
          <span
            key={corner}
            title={m.corner}
            data-watermark-corner={corner}
            onPointerDown={(event) => begin(event, corner)}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            // A 32px target (a fingertip) around a 12px handle.
            className={`absolute flex h-8 w-8 items-center justify-center ${
              corner === "nw" || corner === "se" ? "cursor-nwse-resize" : "cursor-nesw-resize"
            }`}
            style={{
              [corner.startsWith("n") ? "top" : "bottom"]: "-16px",
              [corner.endsWith("w") ? "left" : "right"]: "-16px",
              touchAction: "none",
            }}
          >
            <span className="h-3 w-3 rounded-[2px] border-2 border-accent bg-white shadow-sm" />
          </span>
        ))}
      </div>
    </div>
  );
}
