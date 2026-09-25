import { pageSetupOf } from '@/model/page';
import type { OutputMode, Worksheet } from '@/model/types';
import { printPage } from '@/platform';

/**
 * PDF export: the engine's print of the real sheets in `#print-root` (§ PDF export uses
 * print CSS). There is no second renderer, so the page is first put into the state the
 * PDF should show, then printed.
 *
 * Language, version and paper version become the editor's view and stay — the preview
 * shows what was printed, as the toolbar's own switches would. The "Include" flags are
 * for this print only and are lifted after it (the preview never keeps them).
 */
export interface PrintDeps {
  setMode: (patch: Partial<OutputMode>) => void;
  /** Clear the selection, so no ring is captured. */
  deselect: () => void;
  /** Where `--print-size` / `--print-orientation` are written (`@page` reads them). */
  root: { style: { setProperty: (name: string, value: string) => void } };
  /** Resolves once the sheets have repaginated for the new mode. */
  settled: () => Promise<void>;
  /** Subscribe to a window event; returns the unsubscribe. */
  listen: (type: string, handler: () => void) => () => void;
}

/** The mode a PDF prints with: every key set, so a flag from the last print cannot linger. */
export function pdfPrintMode(mode: OutputMode): OutputMode {
  return {
    language: mode.language,
    version: mode.version,
    variant: mode.variant,
    omitCover: mode.omitCover || undefined,
    omitAnswerSpace: mode.omitAnswerSpace || undefined,
  };
}

export async function printWorksheetPdf(
  worksheet: Worksheet,
  mode: OutputMode,
  deps: PrintDeps,
): Promise<void> {
  // Without the worksheet's own `@page` box the browser prints at whatever was last
  // chosen, and an A4 paper comes out scaled onto Letter. Our PaperSize values are the
  // CSS keywords already.
  const setup = pageSetupOf(worksheet);
  deps.root.style.setProperty('--print-size', setup.paper);
  deps.root.style.setProperty('--print-orientation', setup.orientation);
  deps.deselect();
  const printMode = pdfPrintMode(mode);
  deps.setMode(printMode);
  await deps.settled();

  const transient = Boolean(printMode.omitCover || printMode.omitAnswerSpace);
  const offs: Array<() => void> = [];
  const restore = () => {
    offs.splice(0).forEach((off) => off());
    if (transient) deps.setMode({ omitCover: undefined, omitAnswerSpace: undefined });
  };
  if (!transient) {
    await printPage();
    return;
  }
  // `afterprint` ends it: browsers send it as the dialog closes, and so does the macOS
  // shell's sheet (seen in `npm run desktop:dev`), though its print call resolves as
  // the sheet opens. Fallback for an engine that never sends it: the sheet is modal,
  // so the first input after the call is the print finished.
  offs.push(deps.listen('afterprint', restore));
  try {
    await printPage();
  } catch (cause) {
    restore();
    throw cause;
  }
  if (offs.length > 0) {
    offs.push(deps.listen('pointerdown', restore), deps.listen('keydown', restore));
  }
}

/**
 * Resolve once `#print-root` has stopped changing: the same sheet count and text for a
 * few frames running. A language switch re-measures and re-packs over several frames;
 * printing mid-way would capture a transient packing. Capped, so it cannot hang.
 */
export function sheetsSettled(doc: Document = document, maxFrames = 90): Promise<void> {
  return new Promise((resolve) => {
    let last = '';
    let stable = 0;
    let frames = 0;
    const tick = () => {
      const root = doc.getElementById('print-root');
      const signature = root
        ? `${root.querySelectorAll('[data-page-index]').length}:${root.textContent?.length ?? 0}:${root.scrollHeight}`
        : '';
      stable = signature === last ? stable + 1 : 0;
      last = signature;
      frames += 1;
      if (stable >= 3 || frames >= maxFrames) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/** The browser-side dependencies, for the dialog. */
export function browserPrintDeps(
  setMode: PrintDeps['setMode'],
  deselect: PrintDeps['deselect'],
): PrintDeps {
  return {
    setMode,
    deselect,
    root: document.documentElement,
    settled: () => sheetsSettled(),
    listen: (type, handler) => {
      window.addEventListener(type, handler, { capture: true });
      return () => window.removeEventListener(type, handler, { capture: true });
    },
  };
}
