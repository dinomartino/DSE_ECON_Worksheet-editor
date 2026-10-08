/**
 * pdf.js, loaded only by `readPdf` through `import('./pdfjs')`, so it ships as its own chunk.
 * The legacy build: the modern one calls `Map.prototype.getOrInsertComputed` and
 * `Math.sumPrecise` unpolyfilled, which Safari, the macOS webview and Node 22 lack.
 * In a browser the worker is bundled from `pdf.worker.ts` and served beside the page
 * (same origin, no CDN). If it cannot start, pdf.js runs on the main thread instead.
 * In Node (tests) pdf.js runs its worker in-process.
 */
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

let worker: Worker | null = null;
let failed: Error | null = null;
let mainThread = false;

/** The worker's load failure, if any: a failed worker would leave `getDocument` waiting forever. */
export function workerFailure(): Error | null {
  return failed;
}

export function pdfjsLib(): typeof pdfjs {
  if (!worker && !mainThread && typeof window !== 'undefined' && typeof Worker !== 'undefined') {
    try {
      worker = new Worker(new URL('./pdf.worker.ts', import.meta.url), { type: 'module' });
      worker.addEventListener('error', (event) => {
        failed = new Error(event.message || 'pdf.js worker failed to load');
      });
      pdfjs.GlobalWorkerOptions.workerPort = worker;
    } catch (error) {
      failed = error instanceof Error ? error : new Error(String(error));
    }
  }
  return pdfjs;
}

/** Give up on the worker: pdf.js finds `globalThis.pdfjsWorker` and parses on this thread. */
export async function useMainThread(): Promise<void> {
  worker?.terminate();
  worker = null;
  failed = null;
  mainThread = true;
  pdfjs.GlobalWorkerOptions.workerPort = null;
  await import('./pdf.worker');
}
