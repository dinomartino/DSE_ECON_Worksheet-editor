"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pageDimensions, pageSetupOf, twipsToMm } from "@/model/page";
import type { LanguageMode, Worksheet } from "@/model/types";
import { answerKeyPartTitle, answerKeyParts, answerKeyRunningHead } from "@/render/answerKey";
import { useMessages } from "@/i18n/language";
import { AnswerKeyPreview, SheetZoom } from "./AnswerKeyPreview";
import { ANSWER_KEY_PREVIEW_MESSAGES } from "./AnswerKeyPreview.messages";
import { MM_TO_PX } from "./Preview";
import { sheetStackMargin } from "./sheetStack";

/**
 * The whole set's marking scheme on screen (k-0299 step C): the Marking scheme view's "Whole
 * set", and what the set's marking scheme PDF prints. The papers' keys in set order, each
 * under its part title, every sheet carrying the shared Marks head and numbered on from the
 * part before, as the combined `.docx` lays them out (`answerKeyParts`,
 * `exportAnswerKeyDocx`). One `#print-root`, one zoom; the parts are read-only (each paper's
 * key is typed on in its own Marking scheme view).
 */
export function SetKeyPreview({
  worksheets,
  language,
  zoomControl = true,
}: {
  /** The papers, in set order: the open one as the editor holds it, the others as stored. */
  worksheets: readonly Worksheet[];
  language: LanguageMode;
  /** The zoom buttons; off while it is only on the page to be printed. */
  zoomControl?: boolean;
}) {
  const km = useMessages(ANSWER_KEY_PREVIEW_MESSAGES);
  const containerRef = useRef<HTMLDivElement>(null);
  const runningHead = useMemo(
    () => (worksheets.length > 1 ? answerKeyRunningHead(answerKeyParts([...worksheets], language).flat(), language) : undefined),
    [worksheets, language],
  );
  const titles = useMemo(() => worksheets.map((worksheet) => answerKeyPartTitle(worksheet)), [worksheets]);

  // Each part's sheet count, so the next part numbers on from it.
  const [sheets, setSheets] = useState<Record<string, number>>({});
  const reporters = useMemo(
    () =>
      new Map(
        worksheets.map((worksheet) => [
          worksheet.id,
          (count: number) => setSheets((all) => (all[worksheet.id] === count ? all : { ...all, [worksheet.id]: count })),
        ]),
      ),
    [worksheets],
  );
  const counts = worksheets.map((worksheet) => sheets[worksheet.id] ?? 1);
  const total = counts.reduce((sum, n) => sum + n, 0);

  // The first paper's sheet sets the stack's width, as the `.docx` opens on its section.
  const setup = pageSetupOf(worksheets[0]);
  const dimensions = pageDimensions(setup);
  const pageWidthMm = twipsToMm(dimensions.width);
  const pageHeightMm = twipsToMm(dimensions.height);
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
  const onZoom = useCallback((update: (zoom: number) => number) => setZoom(update), []);

  // Where each part's numbering starts: after every sheet before it.
  const firstPages = counts.map((_, index) => 1 + counts.slice(0, index).reduce((sum, n) => sum + n, 0));
  return (
    <div ref={containerRef} className="flow-root w-full" data-set-key-view>
      {zoomControl && <SheetZoom zoom={zoom} scale={scale} onZoom={onZoom} />}
      <div
        id="print-root"
        data-answer-key
        data-set-key
        aria-label={km.sheets}
        className="flex flex-col items-center gap-6"
        style={{
          width: `${pageWidthMm}mm`,
          marginLeft: `calc(max(0px, (100% - ${scale * pageWidthMm}mm) / 2) - ${((1 - scale) * pageWidthMm) / 2}mm)`,
          transform: scale === 1 ? undefined : `scale(${scale})`,
          transformOrigin: "top center",
          marginBottom: sheetStackMargin(scale, pageHeightMm, total),
        }}
      >
        {worksheets.map((worksheet, index) => {
          const part = { firstPage: firstPages[index], pageCount: total, onSheets: reporters.get(worksheet.id)! };
          return (
            <AnswerKeyPreview
              key={worksheet.id}
              worksheet={worksheet}
              language={language}
              title={titles[index]}
              runningHead={runningHead}
              part={part}
            />
          );
        })}
      </div>
    </div>
  );
}
