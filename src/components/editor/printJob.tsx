'use client';

import { create } from 'zustand';
import { Preview } from '@/components/preview/Preview';
import { SetKeyPreview } from '@/components/preview/SetKeyPreview';
import { useMessages } from '@/i18n/language';
import { pageSetupOf } from '@/model/page';
import type { LanguageMode, OutputMode, Worksheet } from '@/model/types';
import { printPage, savePdf } from '@/platform';
import { pdfPageBox, pdfPrintMode, sheetsSettled, type PdfOutcome, type PrintDeps } from './printPdf';
import { PRINT_JOB_MESSAGES } from './printJob.messages';

/**
 * Printing a document that is not the one open (k-0299 step C, Export → Whole set → PDF).
 *
 * A PDF is the engine's print of `#print-root` (§ PDF export uses print CSS), and the page
 * holds one document: the open paper. So for the length of one print the editor's page
 * shows the job instead, read-only (`PrintJobView`, in place of the editor's own sheets),
 * and gives the page back after it. Nothing is edited, saved or added to the undo history;
 * the open paper's own view (language, version) is left as it was.
 */
export type PrintJob =
  | { kind: 'paper'; worksheet: Worksheet; mode: OutputMode; label: string }
  | { kind: 'setKey'; worksheets: Worksheet[]; language: LanguageMode; label: string };

export const usePrintJob = create<{ job?: PrintJob; setJob: (job?: PrintJob) => void }>((set) => ({
  setJob: (job) => set({ job }),
}));

/** The page box the job prints at: its first document's. */
const jobWorksheet = (job: PrintJob): Worksheet => (job.kind === 'paper' ? job.worksheet : job.worksheets[0]);

/** What the page shows while a job prints. */
export function PrintJobView({ job }: { job: PrintJob }) {
  const m = useMessages(PRINT_JOB_MESSAGES);
  return (
    <div data-print-job>
      <p
        data-print-hide
        role="status"
        className="mx-auto mb-4 w-fit rounded-lg bg-surface px-3 py-1.5 text-[12.5px] font-medium text-ink shadow-sm ring-1 ring-line"
      >
        {m.printing(job.label)}
      </p>
      {job.kind === 'paper' ? (
        <Preview worksheet={job.worksheet} mode={pdfPrintMode(job.mode)} />
      ) : (
        <SetKeyPreview worksheets={job.worksheets} language={job.language} zoomControl={false} />
      )}
    </div>
  );
}

/** What `printJobPdf` needs from the page: `PrintDeps` without the editor's own mode. */
export type JobDeps = Pick<PrintDeps, 'root' | 'settled' | 'sheetCount' | 'listen'> & {
  show: (job: PrintJob | undefined) => void;
};

/**
 * Print one job: shown, settled, then written to `file` (desktop, no print sheet) or handed
 * to the print sheet. The page is given back once the file is written, or once the sheet is
 * done (`afterprint`; else the first input after it, as `printWorksheetPdf` does).
 */
export async function printJobPdf(job: PrintJob, deps: JobDeps, file?: string): Promise<PdfOutcome> {
  const worksheet = jobWorksheet(job);
  const setup = pageSetupOf(worksheet);
  deps.root.style.setProperty('--print-size', setup.paper);
  deps.root.style.setProperty('--print-orientation', setup.orientation);
  deps.show(job);
  await deps.settled();
  const offs: Array<() => void> = [];
  const restore = () => {
    offs.splice(0).forEach((off) => off());
    deps.show(undefined);
  };
  let fallback: string | undefined;
  if (file !== undefined) {
    try {
      await savePdf(file, pdfPageBox(worksheet, deps.sheetCount()));
      restore();
      return { saved: file };
    } catch (cause) {
      fallback = cause instanceof Error ? cause.message : String(cause);
    }
  }
  offs.push(deps.listen('afterprint', restore));
  try {
    await printPage();
  } catch (cause) {
    restore();
    throw cause;
  }
  if (offs.length > 0) offs.push(deps.listen('pointerdown', restore), deps.listen('keydown', restore));
  return fallback === undefined ? { printed: true } : { printed: true, fallback };
}

/** The page's side of a job: the job store, `#print-root`, and the window's events. */
export function browserJobDeps(): JobDeps {
  return {
    show: (job) => usePrintJob.getState().setJob(job),
    root: document.documentElement,
    // The job's own sheets first (not the editor's, still on the page for a frame), then
    // its fonts, then quiet: a paper mounted from cold paginates over many frames.
    settled: async () => {
      for (let frame = 0; frame < 300 && !document.querySelector('[data-print-job] #print-root'); frame += 1) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      await document.fonts?.ready;
      await sheetsSettled(document, 300);
    },
    sheetCount: () => document.querySelectorAll('#print-root [data-page-index] > .paper').length,
    listen: (type, handler) => {
      window.addEventListener(type, handler, { capture: true });
      return () => window.removeEventListener(type, handler, { capture: true });
    },
  };
}
