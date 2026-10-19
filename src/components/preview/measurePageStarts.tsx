"use client";

import { createRoot } from "react-dom/client";
import type { LanguageMode, OutputMode, Worksheet } from "@/model/types";
import { answerKeyPartTitle, answerKeyParts, answerKeyRunningHead } from "@/render/answerKey";
import { AnswerKeyPreview } from "./AnswerKeyPreview";
import type { KeyPageStart, PageStart } from "./pagination";
import { Preview } from "./Preview";

/**
 * Where the preview's sheets begin, measured for one export (§ `joinWithPageBreaks`).
 *
 * Pagination exists only as measurement — font metrics, wrapping and bilingual stacking
 * are the browser's — so the `.docx` cannot compute its page breaks: it asks the same
 * paginator the teacher looks at. A hidden, inert copy of the page in the file's own mode
 * (as `PageCountProbe` counts sheets) is mounted off-screen, left to settle, read, and
 * unmounted. The mode is the file's, not the editor's: a Chinese-only teacher copy of
 * version B is measured as exactly that.
 */

/** Quiet this long after the last change before a measurement counts as settled. */
const QUIET_MS = 400;
/** Never hold an export longer than this; the last settled measurement is used. */
const LIMIT_MS = 15_000;

/** A sheet's breaks for this paper in this mode. */
export function measurePaperPageStarts(worksheet: Worksheet, mode: OutputMode): Promise<PageStart[]> {
  return measure<PageStart[]>((report) => (
    <Preview worksheet={worksheet} mode={mode} measureOnly onPageStarts={report} />
  ));
}

/**
 * Each document's key breaks, as `exportAnswerKeyDocx` lays them out: one document alone
 * under its own title, or several in turn, each under its part title, every sheet
 * carrying the Marks head when any part has the column.
 */
export async function measureAnswerKeyPageStarts(
  worksheets: Worksheet[],
  language: LanguageMode,
): Promise<KeyPageStart[][]> {
  const combined = worksheets.length > 1;
  const head = combined ? answerKeyRunningHead(answerKeyParts(worksheets, language).flat(), language) : undefined;
  const out: KeyPageStart[][] = [];
  for (const worksheet of worksheets) {
    const title = combined ? answerKeyPartTitle(worksheet) : undefined;
    out.push(
      await measure<KeyPageStart[]>((report) => (
        <AnswerKeyPreview
          worksheet={worksheet}
          language={language}
          title={title}
          runningHead={head}
          measureOnly
          onPageStarts={report}
        />
      )),
    );
  }
  return out;
}

function measure<T>(element: (report: (value: T) => void) => React.ReactElement): Promise<T> {
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.setAttribute("data-print-hide", "");
  host.inert = true;
  // Off-screen and invisible, but laid out at full size, as `PageCountProbe` is.
  Object.assign(host.style, {
    position: "fixed",
    left: "-100000px",
    top: "0",
    width: "1200px",
    height: "0",
    overflow: "hidden",
    visibility: "hidden",
    pointerEvents: "none",
  });
  document.body.appendChild(host);
  const root = createRoot(host);

  return new Promise<T>((resolve, reject) => {
    let latest: { value: T } | undefined;
    let quiet: ReturnType<typeof setTimeout> | undefined;
    const finish = (settle: () => void) => {
      clearTimeout(quiet);
      clearTimeout(limit);
      root.unmount();
      host.remove();
      settle();
    };
    // Settled: quiet for a while, the fonts in, every picture decoded.
    const check = () => {
      const pending = Array.from(host.querySelectorAll("img")).some((img) => !img.complete);
      if (pending || document.fonts?.status === "loading") {
        quiet = setTimeout(check, QUIET_MS);
        return;
      }
      finish(() => resolve(latest!.value));
    };
    const report = (value: T) => {
      latest = { value };
      clearTimeout(quiet);
      quiet = setTimeout(check, QUIET_MS);
    };
    const limit = setTimeout(() => {
      finish(() =>
        latest
          ? resolve(latest.value)
          : reject(new Error("measurePageStarts: no settled measurement")),
      );
    }, LIMIT_MS);
    root.render(element(report));
  });
}
