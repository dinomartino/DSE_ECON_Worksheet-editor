import { afterEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { mcPaperPages, schemePages, zhStructuredPages } from '@/import/fixtures/ocrPages';
import { bufferOf, makePdf } from '@/import/fixtures/pdfWriter';
import { resolveMessages } from '@/i18n/catalogue';
import { fakeOcrEngine, ocrEngine, ocrError, readyOcrEngine, setOcrEngine, type OcrResult } from '@/platform/ocr';
import { examineFile } from './importBatch';
import { groupPictures, readPaperFile, readPictureFiles, type FileOutcome } from './fileImport';
import { ProblemStep, ScanStep } from './ImportDialog';
import { IMPORT_MESSAGES } from './messages';
import { problemText } from './problemText';
import { recognisePages, type ScanPage, type ScanProgress, type ScanReader } from './scanImport';

// Invented pages only (`src/import/fixtures/ocrPages.ts`): the repo is public.

const en = resolveMessages(IMPORT_MESSAGES, 'en');
const zh = resolveMessages(IMPORT_MESSAGES, 'zh-HK');

/** Pages as a renderer gives them: one at a time, PNG bytes standing in. */
async function* pagesOf(count: number): AsyncGenerator<ScanPage> {
  for (let n = 1; n <= count; n++) yield { page: n, pages: count, png: new Uint8Array([n]), scale: 200 / 72 };
}

/** A scanned PDF: one picture per page, no text. */
const scannedPdf = (pages: number) => bufferOf(makePdf(Array.from({ length: pages }, () => ({ images: [{ x: 0, y: 0, w: 595, h: 842 }] }))));

const reader = (pages: OcrResult[], extra: Partial<ScanReader> = {}) => {
  const engine = fakeOcrEngine({ pages });
  const progress: ScanProgress[] = [];
  const scan: ScanReader = {
    engine: async () => engine,
    onProgress: (p) => progress.push(p),
    render: () => pagesOf(pages.length),
    decode: async () => ({ png: new Uint8Array([1]), width: 1654 }),
    ...extra,
  };
  return { engine, progress, scan };
};

afterEach(() => setOcrEngine(null));

describe('reading scanned pages', () => {
  it('reads each page in turn, says which, and reviews the text as OCR', async () => {
    const { progress, scan } = reader(mcPaperPages());
    const outcome = await readPaperFile('S5 quiz scan.pdf', scannedPdf(2), { scan });
    expect(progress).toEqual([
      { page: 1, pages: 2 },
      { page: 2, pages: 2 },
    ]);
    expect(outcome).toMatchObject({ kind: 'ok', ocr: true, pages: 2 });
    const ok = outcome as Extract<FileOutcome, { kind: 'ok' }>;
    expect(ok.read.source).toBe('ocr');
    expect(examineFile('f0', 'S5 quiz scan.pdf', outcome).guess.role).toBe('questions');
  });

  it('stops between pages when the teacher stops it', async () => {
    const controller = new AbortController();
    const engine = fakeOcrEngine({ pages: mcPaperPages() });
    const result = await recognisePages(pagesOf(5), engine, {
      signal: controller.signal,
      onProgress: (p) => p.page === 2 && controller.abort(),
    });
    expect(result.kind).toBe('stopped');
    expect(engine.calls).toBeLessThanOrEqual(2);
  });

  it('a stopped file is a problem the dialog words', async () => {
    const controller = new AbortController();
    controller.abort();
    const { scan } = reader(mcPaperPages(), { signal: controller.signal });
    const outcome = await readPaperFile('scan.pdf', scannedPdf(2), { scan });
    expect(outcome).toMatchObject({ kind: 'problem', problem: 'stopped' });
  });

  it('skips a page the engine cannot open; fails when its models fail', async () => {
    const pages = mcPaperPages();
    let n = 0;
    const flaky = { ...fakeOcrEngine({ pages }), read: async () => (n++ === 0 ? Promise.reject(ocrError('decode: not an image')) : pages[1]) };
    expect((await recognisePages(pagesOf(2), flaky)).kind).toBe('ok');
    expect((await recognisePages(pagesOf(2), fakeOcrEngine({ fail: 'decode: bad' }))).kind).toBe('undecodable');
    expect((await recognisePages(pagesOf(2), fakeOcrEngine({ fail: 'model: missing det.onnx' }))).kind).toBe('failed');
  });

  it('without an engine (the web, or none in this app), a scan stays a problem with its page count', async () => {
    const { scan } = reader([], { engine: async () => undefined });
    expect(await readPaperFile('scan.pdf', scannedPdf(3), { scan })).toEqual({ kind: 'problem', problem: 'scan', pages: 3 });
    expect(await readPaperFile('scan.pdf', scannedPdf(3))).toEqual({ kind: 'problem', problem: 'scan', pages: 3 });
    expect(await readPictureFiles([{ name: 'p1.jpg', read: async () => new ArrayBuffer(4) }])).toEqual({ kind: 'problem', problem: 'scan', pictures: 1 });
  });

  it('reads pictures as pages of one paper, and a scanned answers file as answers', async () => {
    const { scan } = reader(zhStructuredPages());
    const outcome = await readPictureFiles(
      [
        { name: 'IMG_1.jpg', read: async () => new ArrayBuffer(4) },
        { name: 'IMG_2.jpg', read: async () => new ArrayBuffer(4) },
      ],
      scan,
    );
    expect(outcome).toMatchObject({ kind: 'ok', ocr: true, pages: 2 });
    const answers = await readPaperFile('S5 quiz marking scheme.pdf', scannedPdf(1), { scan: reader(schemePages()).scan });
    expect(examineFile('f1', 'S5 quiz marking scheme.pdf', answers).guess.role).toBe('answers');
  });

  it('a picture this app cannot open is said so', async () => {
    const { scan } = reader(mcPaperPages(), { decode: () => Promise.reject({ kind: 'undecodable' }) });
    expect(await readPictureFiles([{ name: 'IMG_9.heic', read: async () => new ArrayBuffer(4) }], scan)).toMatchObject({ kind: 'problem', problem: 'picture' });
  });
});

describe('groupPictures', () => {
  const f = (name: string) => ({ name, read: async () => new ArrayBuffer(0) });
  it('makes pictures chosen together one paper, in name order, where the first was', () => {
    const grouped = groupPictures([f('Paper.pdf'), f('page 10.png'), f('page 2.png'), f('Answers.docx'), f('page 1.JPG')]);
    expect(grouped.map((g) => [g.name, 'pictures' in g ? g.pictures?.map((p) => p.name) : undefined])).toEqual([
      ['Paper.pdf', undefined],
      ['page 1.JPG', ['page 1.JPG', 'page 2.png', 'page 10.png']],
      ['Answers.docx', undefined],
    ]);
  });
});

describe('the engine', () => {
  it('is none on the web, and none when it says it cannot read', async () => {
    expect(ocrEngine()).toBeUndefined();
    expect(await readyOcrEngine()).toBeUndefined();
    setOcrEngine(fakeOcrEngine({ available: false }));
    expect(await readyOcrEngine()).toBeUndefined();
    setOcrEngine({ status: () => Promise.reject(new Error('no such command')), read: () => Promise.reject(new Error('x')) });
    expect(await readyOcrEngine()).toBeUndefined();
    const ready = fakeOcrEngine();
    setOcrEngine(ready);
    expect(await readyOcrEngine()).toBe(ready);
  });

  it('reads the shell’s error prefixes', () => {
    expect(ocrError('decode: unsupported format')).toMatchObject({ kind: 'decode', message: 'unsupported format' });
    expect(ocrError('model: det.onnx missing')).toMatchObject({ kind: 'model' });
    expect(ocrError(new Error('boom'))).toMatchObject({ kind: 'internal', message: 'boom' });
  });
});

describe('what the dialog shows', () => {
  it('the reading step: which page of how many', () => {
    const html = renderToStaticMarkup(<ScanStep text={en} name="S5 quiz scan.pdf" scanning={{ file: 0, page: 3, pages: 12 }} />);
    expect(html).toContain('Reading the scanned pages');
    expect(html).toContain('Reading page 3 of 12');
    expect(html).toContain('aria-valuenow="2"');
    expect(renderToStaticMarkup(<ScanStep text={zh} name="scan.pdf" scanning={{ file: 0, page: 3, pages: 12 }} />)).toContain('正在讀取第 3 頁（共 12 頁）');
  });

  it('a scan on the web says the desktop app reads it; in the app without text recognition, update it', () => {
    const problem = { kind: 'problem' as const, problem: 'scan' as const, pages: 23 };
    expect(problemText(en, problem, false)).toContain('The Econ Studio desktop app for Mac and Windows reads scans.');
    expect(problemText(zh, problem, false)).toContain('Mac 及 Windows 版 Econ Studio 桌面應用程式可讀取掃描檔');
    expect(problemText(en, { ...problem, pages: undefined, pictures: 3 }, false)).toContain('These 3 pictures');
    expect(problemText(en, problem, true)).toBe(en.problemNoOcr);
    expect(renderToStaticMarkup(<ProblemStep text={en} problem={problem} />)).toContain('23 pages');
  });

  it('every new string reads without an em dash', () => {
    const keys = ['problemScan', 'problemPictures', 'problemNoOcr', 'problemStopped', 'problemOcrFailed', 'problemPicture', 'ocrRead', 'scanTitle', 'scanHint', 'scanAnswers', 'scanPaper'] as const;
    for (const m of [en, zh]) {
      for (const key of keys) {
        const value = m[key] as unknown;
        const text = typeof value === 'function' ? (value as (n: number) => string)(2) : String(value);
        expect(text, key).not.toMatch(/—/);
      }
    }
  });
});
