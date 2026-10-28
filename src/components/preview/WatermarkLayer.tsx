"use client";

import type { PageSetup, Watermark } from "@/model/types";
import { twipsToMm } from "@/model/page";
import { watermarkBox, watermarkOpacity } from "@/model/watermark";
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
 * The per-page switch, in the gap above the sheet's top-right corner: whether this page
 * carries the paper's watermark. Editing chrome (`data-print-hide`), drawn only while the
 * paper has a watermark. `disabled` (with `title` saying why) on a sheet holding only the
 * tail of a question cut across sheets: it has nothing of its own to store a choice on and
 * follows the page before (§ `sheetWatermarks`).
 */
export function SheetWatermarkToggle({
  on,
  cover = false,
  disabled = false,
  onToggle,
}: {
  on: boolean;
  cover?: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  const m = useMessages(WATERMARK_PAGE_MESSAGES);
  const label = disabled ? m.follows : cover ? (on ? m.coverOff : m.coverOn) : on ? m.turnOff : m.turnOn;
  return (
    <button
      type="button"
      data-print-hide
      data-watermark-toggle={on ? "on" : "off"}
      aria-pressed={on}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      className={`absolute bottom-full right-0 z-10 mb-[3px] flex h-[18px] cursor-pointer items-center gap-1 whitespace-nowrap rounded-full border px-2 text-[10.5px] leading-none font-medium transition-colors duration-150 ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-default disabled:opacity-60 ${
        on
          ? "border-accent bg-accent-soft text-accent"
          : "border-line bg-surface-raised text-ink-muted hover:text-ink"
      }`}
    >
      <WatermarkIcon size={11} />
      <span>{on ? m.on : m.off}</span>
    </button>
  );
}
