import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { analyseLines, readPaste, type Analysis } from '@/import';
import { makeDocx, para } from '@/import/fixtures/docx';
import { bufferOf, makePdf, type PdfText } from '@/import/fixtures/pdfWriter';
import { addToBank } from '@/library/bankDocs';
import { createWorksheet } from '@/model/factories';
import { createWorksheetFrom, type DocumentType } from '@/model/newWorksheet';
import type { LanguageMode, Question, Worksheet } from '@/model/types';
import type { WorksheetStore } from '@/storage';
import { useWorksheetStore } from '@/store/worksheetStore';
import { StartNewSection, StartScreen } from '@/components/start/StartScreen';
import { UiLanguageOverride } from '@/i18n/language';
import { createImportedDocument, defaultDocumentType, importLanguageMode, importName, misfit, readPaperFile, sniffPaper, startLanguage } from './fileImport';
import { materialize } from './previewDoc';
import { review } from './pasteSession';

const fixture = (name: string) => readFileSync(path.resolve(__dirname, '../../import/fixtures', name), 'utf8');
const analysed = (plain: string): Analysis => analyseLines(readPaste({ plain }));

const mc = (n: number) => [`${n}.\tWhich of the following is a free good number ${n}?`, 'A.\tair', 'B.\tbread', 'C.\ttea', 'D.\trice'].join('\n');
const written = (n: number) => [`${n}.\tHong Kong runs a free market, case ${n}.`, `a)\tExplain what a free market is.\t(2 marks)`, `b)\tGive one benefit for consumers.\t(3 marks)`].join('\n');
const range = (n: number, make: (k: number) => string) => Array.from({ length: n }, (_, k) => make(k + 1)).join('\n');

/** An invented two-question Word paper. */
const docxPaper = () =>
  makeDocx({
    title: 'S.5 Elasticity quiz',
    body: [
      para('1.\tWhich of the following is a free good?'),
      ...['A.\tair', 'B.\tbread', 'C.\ttea', 'D.\trice'].map((t) => para(t)),
      para('2.\tExplain why the demand for salt is price inelastic.\t(3 marks)'),
    ].join(''),
  });

/** An invented one-page PDF with two MC. */
function pdfPaper(): ArrayBuffer {
  const texts: PdfText[] = [];
  const q = (n: number, top: number, stem: string, options: string[]) => {
    texts.push({ text: `${n}.`, x: 42, y: top }, { text: stem, x: 66, y: top });
    options.forEach((o, k) => texts.push({ text: `${String.fromCharCode(65 + k)}.`, x: 66, y: top - 18 - k * 14 }, { text: o, x: 90, y: top - 18 - k * 14 }));
  };
  q(1, 760, 'Which of the following is a free good?', ['air', 'bread', 'tea', 'rice']);
  q(2, 640, 'Which of the following raises the supply of rice?', ['a lower wage', 'a higher tax', 'a flood', 'a drought']);
  return bufferOf(makePdf([{ texts }], { title: 'Microsoft Word - Mock P1.docx' }));
}

describe('reading a chosen file', () => {
  it('knows a file by its bytes first, its name second', async () => {
    expect(sniffPaper(await docxPaper(), 'renamed.pdf')).toBe('docx');
    expect(sniffPaper(pdfPaper(), 'paper.docx')).toBe('pdf');
    expect(sniffPaper(bufferOf(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0])), 'old.doc')).toBe('ole');
    expect(sniffPaper(bufferOf(new TextEncoder().encode('hello')), 'notes.txt')).toBeUndefined();
  });

  it('reads an invented .docx into a review, with its title for the name', async () => {
    const outcome = await readPaperFile('quiz.docx', await docxPaper());
    if (outcome.kind !== 'ok') throw new Error(outcome.problem);
    expect(outcome.read.source).toBe('docx');
    expect(outcome.title).toBe('S.5 Elasticity quiz');
    expect(importName(outcome.title, 'quiz.docx')).toBe('S.5 Elasticity quiz');
    expect(review(outcome.read, [], 'auto').batch.builds).toHaveLength(2);
  });

  it('reads an invented .pdf into a review, with its page count', async () => {
    const outcome = await readPaperFile('mock.pdf', pdfPaper());
    if (outcome.kind !== 'ok') throw new Error(outcome.problem);
    expect(outcome.read.source).toBe('pdf');
    expect(outcome.pages).toBe(1);
    expect(outcome.title).toBe('Mock P1');
    expect(review(outcome.read, [], 'auto').analysis.outline.questions.map((q) => q.options.length)).toEqual([4, 4]);
  });

  it('says a scanned PDF has no text, with its pages', async () => {
    const page = { images: [{ x: 20, y: 20, w: 555, h: 800 }] };
    const outcome = await readPaperFile('scan.pdf', bufferOf(makePdf([page, page, page])));
    expect(outcome).toEqual({ kind: 'problem', problem: 'scan', pages: 3 });
  });

  it('names each file it cannot read: .doc, a password, not a paper, damaged', async () => {
    const ole = (extra: number[] = []) => bufferOf(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, ...extra, ...new Array(512).fill(0)]));
    expect(await readPaperFile('old.doc', ole())).toEqual({ kind: 'problem', problem: 'legacyDoc' });
    const encryptionInfo = [...'EncryptionInfo'].flatMap((ch) => [ch.charCodeAt(0), 0]);
    expect(await readPaperFile('locked.docx', ole(encryptionInfo))).toEqual({ kind: 'problem', problem: 'encrypted' });
    expect(await readPaperFile('locked.pdf', bufferOf(makePdf([{ texts: [{ text: 'secret', x: 50, y: 700 }] }], { encrypted: true })))).toEqual({
      kind: 'problem',
      problem: 'encrypted',
    });
    expect(await readPaperFile('notes.txt', bufferOf(new TextEncoder().encode('1. Why?')))).toEqual({ kind: 'problem', problem: 'notPaper' });
    expect(await readPaperFile('broken.docx', bufferOf(new Uint8Array([0x50, 0x4b, 3, 4, 9, 9, 9, 9])))).toEqual({ kind: 'problem', problem: 'unreadable' });
  });
});

describe('the type Save as suggests', () => {
  it('Paper 1 mock for 20 or more MC; Paper 2 mock for 4 or more written under sections; else Classroom worksheet', () => {
    expect(defaultDocumentType(analysed(range(20, mc)))).toBe('paper1');
    expect(defaultDocumentType(analysed(range(19, mc)))).toBe('classroom');
    expect(defaultDocumentType(analysed(`Section A\n${range(4, written)}`))).toBe('lqMock');
    expect(defaultDocumentType(analysed(range(4, written)))).toBe('classroom');
    expect(defaultDocumentType(analysed(`Section A\n${range(3, written)}`))).toBe('classroom');
    expect(defaultDocumentType(analysed(`Section A\n${range(20, mc)}\nSection B\n${written(21)}`))).toBe('classroom');
  });

  it('says when the chosen type does not suit the questions, and still lets it save', () => {
    const mixed = analysed(`${range(2, mc)}\n${written(3)}`);
    expect(misfit('paper1', mixed)).toEqual({ kind: 'written', count: 1 });
    expect(misfit('lqWorksheet', mixed)).toEqual({ kind: 'mc', count: 2 });
    expect(misfit('lqMock', mixed)).toEqual({ kind: 'mc', count: 2 });
    expect(misfit('classroom', mixed)).toBeUndefined();
    expect(misfit('paper1', analysed(range(3, mc)))).toBeUndefined();
  });
});

describe('language', () => {
  const zh = readPaste({ plain: fixture('09-zh-word-plain.txt') });
  const en = readPaste({ plain: range(3, mc) });

  it('starts the review on the Paper language, unless the paper is wholly in the other language', () => {
    expect(startLanguage(en, 'en')).toBe('en');
    expect(startLanguage(en, undefined)).toBe('auto');
    expect(startLanguage(zh, 'en')).toBe('auto');
    expect(startLanguage(zh, 'zh')).toBe('zh');
  });

  it('makes a 中文 paper of 中文 questions, EN+中 of both, else follows the setting', () => {
    const solve = (read: typeof zh, language: 'auto' | 'en' | 'zh' = 'auto') => review(read, [], language).analysis;
    expect(importLanguageMode(solve(zh), 'en')).toBe('zh');
    expect(importLanguageMode(solve(en), 'bilingual')).toBe('bilingual');
    expect(importLanguageMode(solve(en), 'en')).toBe('en');
    expect(importLanguageMode(solve(en), 'zh')).toBe('en');
    // One question switched to EN in the review.
    const first = solve(zh).outline.questions[0];
    const both = review(zh, [{ kind: 'language', line: first.start, side: 'en' }], 'auto').analysis;
    expect(importLanguageMode(both, 'en')).toBe('bilingual');
  });
});

describe('Save as a new paper', () => {
  beforeEach(() => useWorksheetStore.getState().replaceWorksheet(createWorksheet()));

  const TYPES: DocumentType[] = ['classroom', 'lqWorksheet', 'paper1', 'lqMock'];
  for (const documentType of TYPES) {
    it(`makes a ${documentType} through the New worksheet factory, opens it, and adds every question in one commit`, async () => {
      const outcome = await readPaperFile('quiz.docx', await docxPaper());
      if (outcome.kind !== 'ok') throw new Error(outcome.problem);
      const { batch, analysis } = review(outcome.read, [], 'auto');
      const opened: Array<{ worksheet: Worksheet; language: LanguageMode }> = [];
      const saved: Worksheet[] = [];
      const language = importLanguageMode(analysis, 'en');
      const report = createImportedDocument(
        batch,
        { documentType, name: 'S.5 Elasticity quiz' },
        (worksheet) => {
          opened.push({ worksheet, language });
          useWorksheetStore.getState().replaceWorksheet(worksheet);
        },
        async (w) => void saved.push(w),
      );
      if (!report.ok) throw new Error(report.refused);
      const shape = createWorksheetFrom({ documentType, seedSample: false, sections: false });
      const made = useWorksheetStore.getState().worksheet;
      expect(opened).toHaveLength(1);
      expect(opened[0].worksheet.questions).toEqual([]);
      expect(made.id).toBe(opened[0].worksheet.id);
      expect(made.name).toBe('S.5 Elasticity quiz');
      expect(Boolean(made.cover)).toBe(Boolean(shape.cover));
      expect(Boolean(made.footer?.enabled)).toBe(Boolean(shape.footer?.enabled));
      expect(made.baseFontSize).toBe(shape.baseFontSize);
      expect(Boolean(made.pageFurniture)).toBe(Boolean(shape.pageFurniture));
      expect(made.pageSetup?.margins).toEqual(shape.pageSetup?.margins);
      expect(made.questions.map((q) => q.type).sort()).toEqual(['mcq', 'structured']);
      expect(language).toBe('en');
      expect(saved).toEqual([made]);
      // One commit: one undo leaves the empty paper.
      useWorksheetStore.getState().undo();
      expect(useWorksheetStore.getState().worksheet.questions).toEqual([]);
    });
  }
});

describe('題庫 only', () => {
  it('adds a file’s questions and skips any the bank already holds', async () => {
    const map = new Map<string, Worksheet>();
    const store = { load: async (id: string) => map.get(id), save: async (w: Worksheet) => void map.set(w.id, structuredClone(w)) } as unknown as WorksheetStore;
    const outcome = await readPaperFile('quiz.docx', await docxPaper());
    if (outcome.kind !== 'ok') throw new Error(outcome.problem);
    const questions = () => review(outcome.read, [], 'auto').batch.builds.map(materialize).filter((q): q is Question => Boolean(q));
    const first = await addToBank(questions(), { name: 'Imported' }, { store, openDocId: '' });
    expect(first.copied).toBe(2);
    const again = await addToBank(questions(), first.bank.id, { store, openDocId: '' });
    expect(again.copied).toBe(0);
    expect(again.already).toHaveLength(2);
    expect(map.get(first.bank.id)!.questions).toHaveLength(2);
  });
});

describe('the home screen', () => {
  it('offers Import from Word or PDF under New worksheet, empty desk or not, in either language', () => {
    for (const empty of [true, false]) {
      const panel = renderToStaticMarkup(<StartNewSection empty={empty} onCreate={() => {}} onImport={() => {}} onOpenFile={() => {}} />);
      expect(panel.indexOf('Import from Word or PDF…')).toBeGreaterThan(panel.indexOf('New worksheet'));
    }
    const zh = renderToStaticMarkup(
      <UiLanguageOverride.Provider value="zh-HK">
        <StartNewSection empty={false} onCreate={() => {}} onImport={() => {}} onOpenFile={() => {}} />
      </UiLanguageOverride.Provider>,
    );
    expect(zh).toContain('從 Word 或 PDF 匯入…');
  });

  it('has a chooser for Word and PDF files beside the button', () => {
    const screen = renderToStaticMarkup(<StartScreen onOpen={() => {}} />);
    expect(screen).toMatch(/<input type="file" accept="\.docx,\.pdf,[^"]*application\/pdf[^"]*wordprocessingml\.document/);
  });
});
