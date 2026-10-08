// The pdf.js worker entry, bundled as a worker by `pdfjs.ts` (and imported on the main
// thread as its fallback). In a worker, pdf.js's own setup listens on the port.
import 'pdfjs-dist/legacy/build/pdf.worker.min.mjs';
