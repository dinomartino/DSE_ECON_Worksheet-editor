import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorksheet } from '@/model/factories';
import type { OutputMode } from '@/model/types';
import type { PdfPage } from '@/platform';

const printPage = vi.fn<() => Promise<void>>();
const savePdf = vi.fn<(path: string, page: PdfPage) => Promise<void>>();
vi.mock('@/platform', () => ({
  printPage: () => printPage(),
  savePdf: (path: string, page: PdfPage) => savePdf(path, page),
}));

const { pdfPageBox, pdfPrintMode, printWorksheetPdf } = await import('./printPdf');

/** Fake browser: records calls in order, and lets a test fire window events. */
function harness() {
  const log: string[] = [];
  const handlers = new Map<string, Set<() => void>>();
  const deps = {
    setMode: vi.fn((patch: Partial<OutputMode>) => log.push(`mode ${JSON.stringify(patch)}`)),
    deselect: vi.fn(() => log.push('deselect')),
    root: { style: { setProperty: (name: string, value: string) => log.push(`${name}=${value}`) } },
    settled: vi.fn(async () => void log.push('settled')),
    sheetCount: () => 3,
    listen: (type: string, handler: () => void) => {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type)!.add(handler);
      return () => handlers.get(type)!.delete(handler);
    },
  };
  const fire = (type: string) => [...(handlers.get(type) ?? [])].forEach((handler) => handler());
  const listening = () => [...handlers.values()].reduce((sum, set) => sum + set.size, 0);
  return { log, deps, fire, listening };
}

const EN_STUDENT: OutputMode = { language: 'en', version: 'student' };

describe('printWorksheetPdf', () => {
  beforeEach(() => {
    printPage.mockReset();
    savePdf.mockReset();
  });

  it('sets the @page box and the mode, waits for the sheets, then prints once', async () => {
    const { log, deps } = harness();
    printPage.mockImplementation(async () => void log.push('print'));
    await printWorksheetPdf(createWorksheet(), { language: 'zh', version: 'teacher' }, deps);
    expect(printPage).toHaveBeenCalledTimes(1);
    expect(log).toEqual([
      '--print-size=A4',
      '--print-orientation=portrait',
      'deselect',
      `mode ${JSON.stringify(pdfPrintMode({ language: 'zh', version: 'teacher' }))}`,
      'settled',
      'print',
    ]);
    // Language and version stay: no restore without an omit flag.
    expect(deps.setMode).toHaveBeenCalledTimes(1);
  });

  it('clears a flag left by an earlier print rather than inheriting it', () => {
    const mode = pdfPrintMode(EN_STUDENT);
    expect('omitCover' in mode && mode.omitCover).toBe(undefined);
    expect('omitAnswerSpace' in mode && mode.omitAnswerSpace).toBe(undefined);
  });

  it('lifts the "Include" flags on afterprint (the browser path)', async () => {
    const { deps, fire, listening } = harness();
    printPage.mockImplementation(async () => fire('afterprint')); // a blocking window.print
    await printWorksheetPdf(createWorksheet(), { ...EN_STUDENT, omitCover: true }, deps);
    expect(deps.setMode).toHaveBeenLastCalledWith({ omitCover: undefined, omitAnswerSpace: undefined });
    expect(deps.setMode).toHaveBeenCalledTimes(2);
    expect(listening()).toBe(0);
  });

  it('lifts them on the first input when no afterprint ever comes, after the print call returns', async () => {
    const { deps, fire, listening } = harness();
    printPage.mockResolvedValue(undefined);
    await printWorksheetPdf(createWorksheet(), { ...EN_STUDENT, omitAnswerSpace: true }, deps);
    expect(deps.setMode).toHaveBeenCalledTimes(1); // still printing
    fire('pointerdown');
    expect(deps.setMode).toHaveBeenLastCalledWith({ omitCover: undefined, omitAnswerSpace: undefined });
    fire('keydown');
    expect(deps.setMode).toHaveBeenCalledTimes(2);
    expect(listening()).toBe(0);
  });

  it('a refused print (missing desktop permission) restores and rejects', async () => {
    const { deps, listening } = harness();
    printPage.mockRejectedValue('webview.print not allowed');
    await expect(
      printWorksheetPdf(createWorksheet(), { ...EN_STUDENT, omitCover: true }, deps),
    ).rejects.toBe('webview.print not allowed');
    expect(deps.setMode).toHaveBeenLastCalledWith({ omitCover: undefined, omitAnswerSpace: undefined });
    expect(listening()).toBe(0);
  });
});

describe('printWorksheetPdf to a file (desktop)', () => {
  const FILE = '/Users/t/Documents/Econ Worksheets/Paper (Student) (EN).pdf';

  beforeEach(() => {
    printPage.mockReset();
    savePdf.mockReset();
  });

  it('prepares the page the same way, then saves instead of printing', async () => {
    const { log, deps } = harness();
    savePdf.mockImplementation(async (path) => void log.push(`save ${path}`));
    const outcome = await printWorksheetPdf(createWorksheet(), EN_STUDENT, deps, FILE);
    expect(outcome).toEqual({ saved: FILE });
    expect(printPage).not.toHaveBeenCalled();
    expect(log).toEqual([
      '--print-size=A4',
      '--print-orientation=portrait',
      'deselect',
      `mode ${JSON.stringify(pdfPrintMode(EN_STUDENT))}`,
      'settled',
      `save ${FILE}`,
    ]);
    expect(savePdf.mock.calls[0][1]).toEqual(pdfPageBox(createWorksheet(), 3));
  });

  it('lifts the "Include" flags once the file is written — no afterprint to wait for', async () => {
    const { deps, listening } = harness();
    let finish: () => void = () => undefined;
    savePdf.mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)));
    const pending = printWorksheetPdf(createWorksheet(), { ...EN_STUDENT, omitCover: true }, deps, FILE);
    await vi.waitFor(() => expect(savePdf).toHaveBeenCalled());
    expect(deps.setMode).toHaveBeenCalledTimes(1); // still writing
    finish();
    await pending;
    expect(deps.setMode).toHaveBeenLastCalledWith({ omitCover: undefined, omitAnswerSpace: undefined });
    expect(listening()).toBe(0);
  });

  it('falls back to the print sheet when the engine cannot write the file', async () => {
    const { deps, fire, listening } = harness();
    savePdf.mockRejectedValue(new Error('ICoreWebView2_7 not supported'));
    printPage.mockImplementation(async () => fire('afterprint'));
    const outcome = await printWorksheetPdf(createWorksheet(), { ...EN_STUDENT, omitCover: true }, deps, FILE);
    expect(outcome).toEqual({ printed: true, fallback: 'ICoreWebView2_7 not supported' });
    expect(printPage).toHaveBeenCalledTimes(1);
    expect(deps.setMode).toHaveBeenLastCalledWith({ omitCover: undefined, omitAnswerSpace: undefined });
    expect(listening()).toBe(0);
  });

  it('prints without a file, as on the web', async () => {
    const { deps } = harness();
    printPage.mockResolvedValue(undefined);
    expect(await printWorksheetPdf(createWorksheet(), EN_STUDENT, deps)).toEqual({ printed: true });
    expect(savePdf).not.toHaveBeenCalled();
  });
});

describe('pdfPageBox', () => {
  it('is the paper in portrait points, with the turn separate', () => {
    const a4 = pdfPageBox(createWorksheet(), 5);
    expect(a4.widthPt).toBeCloseTo(595.3, 1);
    expect(a4.heightPt).toBeCloseTo(841.9, 1);
    expect(a4.landscape).toBe(false);
    expect(a4.pages).toBe(5);
    const letter = pdfPageBox(
      {
        ...createWorksheet(),
        pageSetup: { paper: 'Letter', orientation: 'landscape', margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
      },
      2,
    );
    expect(letter).toEqual({ widthPt: 612, heightPt: 792, landscape: true, pages: 2 });
  });
});
