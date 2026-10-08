import { DocxReadError, isPdfReadError, readDocx, readPdf, type Analysis, type ImageRef, type ImportBatch, type ReadPaste } from '@/import';
import { createWorksheetFrom, type DocumentType } from '@/model/newWorksheet';
import type { Side } from '@/model/textSlots';
import type { LanguageMode, Worksheet } from '@/model/types';
import { useWorksheetStore, type QuestionBatchReport } from '@/store/worksheetStore';
import { pasteVerdict, review, type Language } from './pasteSession';

/**
 * Import from Word or PDF: a file read into the review, and the review saved as a new
 * document. Pure apart from `createImportedDocument`, which goes through the store.
 * Loaded with the dialog, never with the start screen (it pulls in the readers).
 */

export type FileProblem = 'legacyDoc' | 'encrypted' | 'notPaper' | 'unreadable' | 'scan';

export type FileOutcome =
  | { kind: 'ok'; read: ReadPaste; title?: string; pages?: number; ocr: boolean }
  | { kind: 'problem'; problem: FileProblem; pages?: number };

const head = (bytes: ArrayBuffer, n: number) => new Uint8Array(bytes, 0, Math.min(n, bytes.byteLength));
const starts = (bytes: Uint8Array, sig: number[]) => sig.every((b, k) => bytes[k] === b);

/** What the bytes are, by their signature first and the name second. */
export function sniffPaper(bytes: ArrayBuffer, name: string): 'docx' | 'pdf' | 'ole' | undefined {
  const top = head(bytes, 1024);
  if (starts(top, [0x50, 0x4b])) return 'docx';
  if (starts(top, [0xd0, 0xcf, 0x11, 0xe0])) return 'ole';
  for (let k = 0; k + 4 < top.length; k++) if (top[k] === 0x25 && top[k + 1] === 0x50 && top[k + 2] === 0x44 && top[k + 3] === 0x46 && top[k + 4] === 0x2d) return 'pdf';
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.docx')) return 'docx';
  return undefined;
}

/** Read a chosen or dropped file into a review, or say plainly why not. */
export async function readPaperFile(
  name: string,
  bytes: ArrayBuffer,
  options: { prepareImage?: (blob: Blob) => Promise<ImageRef | null> } = {},
): Promise<FileOutcome> {
  const kind = sniffPaper(bytes, name);
  const legacy = /\.doc$/i.test(name);
  if (!kind) return { kind: 'problem', problem: legacy ? 'legacyDoc' : 'notPaper' };
  if (kind === 'pdf') {
    const result = await readPdf(bytes, options).catch(() => ({ kind: 'unreadable' as const }));
    if (isPdfReadError(result)) return { kind: 'problem', problem: result.kind === 'notPdf' ? 'notPaper' : result.kind };
    return verdict(result, result.title, result.pages);
  }
  try {
    const result = await readDocx(bytes, options);
    return verdict(result, result.title);
  } catch (error) {
    const problem = error instanceof DocxReadError ? error.kind : 'unreadable';
    if (problem === 'notDocx') return { kind: 'problem', problem: kind === 'ole' || legacy ? 'legacyDoc' : 'notPaper' };
    return { kind: 'problem', problem };
  }
}

function verdict(read: ReadPaste, title: string | undefined, pages?: number): FileOutcome {
  const seen = pasteVerdict(review(read, [], 'auto'));
  if (seen === 'scan' || seen === 'empty') return { kind: 'problem', problem: 'scan', ...(pages ? { pages } : {}) };
  return { kind: 'ok', read, ...(title ? { title } : {}), ...(pages ? { pages } : {}), ocr: seen === 'ocr' };
}

/** The new document's name: the file's title, else the file name without its extension. */
export function importName(title: string | undefined, fileName: string): string {
  const clean = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 120);
  return clean(title ?? '') || clean(fileName.replace(/\.(docx?|pdf)$/i, '')) || 'Imported questions';
}

/**
 * The review's language to start with: the Paper language setting's side, or detection
 * when it is EN+中. A paper written wholly in the other language is detected instead, so
 * a Chinese paper never lands in the English slots.
 */
export function startLanguage(read: ReadPaste, side: Side | undefined): Language {
  if (!side) return 'auto';
  const sides = review(read, [], 'auto').analysis.outline.questions.map((q) => q.side);
  return sides.length > 0 && sides.every((s) => s !== side) ? 'auto' : side;
}

/** The new paper's language mode: 中文 questions give a 中文 paper, both give EN+中, else the setting. */
export function importLanguageMode(analysis: Analysis, setting: LanguageMode): LanguageMode {
  const sides = new Set(analysis.outline.questions.map((q) => q.side));
  if (sides.has('zh') && sides.has('en')) return 'bilingual';
  if (sides.has('zh')) return 'zh';
  // English questions on a 中文-only paper would show nothing.
  return setting === 'zh' && sides.has('en') ? 'en' : setting;
}

const SECTION = /^\s*(section|part)\s+([A-D]|[1-4]|I{1,3}|IV)\b|^\s*[甲乙丙丁]部/i;

/**
 * The type Save as starts on: Paper 1 mock for 20 or more questions, all MC; Paper 2 mock
 * for 4 or more, all written, under section headings; else Classroom worksheet.
 */
export function defaultDocumentType(analysis: Analysis): DocumentType {
  const questions = analysis.outline.questions;
  const mc = questions.filter((q) => q.kind === 'mc').length;
  const written = questions.length - mc;
  if (questions.length >= 20 && written === 0) return 'paper1';
  const sections = analysis.outline.headings.some((i) => SECTION.test(analysis.lines[i]?.text ?? ''));
  if (questions.length >= 4 && mc === 0 && sections) return 'lqMock';
  return 'classroom';
}

/** What does not suit the chosen type: written questions on Paper 1, MC on an LQ paper. */
export function misfit(type: DocumentType, analysis: Analysis): { kind: 'written' | 'mc'; count: number } | undefined {
  const mc = analysis.outline.questions.filter((q) => q.kind === 'mc').length;
  const written = analysis.outline.questions.length - mc;
  if (type === 'paper1' && written > 0) return { kind: 'written', count: written };
  if ((type === 'lqWorksheet' || type === 'lqMock') && mc > 0) return { kind: 'mc', count: mc };
  return undefined;
}

/**
 * A new document of `documentType` (the New worksheet form's own factory: cover, sections
 * and furniture as it makes them, no sample question), opened by `open`, then the batch
 * in one commit through the store, so each question lands where the editor puts it.
 * Written at once by value as well: autosave waits 1.2 s.
 */
export function createImportedDocument(
  batch: ImportBatch,
  options: { documentType: DocumentType; name: string },
  open: (worksheet: Worksheet) => void,
  save?: (worksheet: Worksheet) => Promise<unknown>,
): QuestionBatchReport {
  const worksheet = createWorksheetFrom({
    documentType: options.documentType,
    name: options.name,
    seedSample: false,
    // A classroom worksheet keeps the file's order: no sections to route questions into.
    sections: false,
  });
  open(worksheet);
  const store = useWorksheetStore.getState();
  const report = store.insertQuestionBatch(batch.builds, { worksheetId: worksheet.id, ...(batch.lead ? { lead: batch.lead } : {}) });
  if (report.ok) {
    store.select(report.questionIds[0]);
    void save?.(report.committed).catch(() => undefined);
  }
  return report;
}
