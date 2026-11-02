'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { LanguageMode, OutputMode, VersionMode, Worksheet } from '@/model/types';
import {
  canChooseFolder,
  canChooseLocation,
  chooseFolderTarget,
  chooseSavePath,
  chooseSaveTarget,
  CSV_FILTERS,
  DOCX_FILTERS,
  isDesktop,
  PDF_FILTERS,
  SET_ZIP_FILTERS,
  XLSX_FILTERS,
} from '@/platform';
import { downloadWorksheetFile, worksheetStore, worksheetTitle, type WorksheetSummary } from '@/storage';
import type { FolderTarget } from '@/platform';
import { buildAppExport, type AppExport, type AppFormat } from '@/export/csv/answerKeyCsv';
import { answerKeyFileName, docxFileName, setKeyFileName, setZipFileName } from '@/export/docx/fileNames';
import { setRoleOf } from '@/model/paperSet';
import type { PrintJob } from './printJob';
import { browserJobDeps, printJobPdf } from './printJob';
import { Button, CheckField, Segmented } from '@/components/ui';
import { Dialog, Field } from '@/components/ui/Dialog';
import { useDialogNotices } from '@/components/ui/NoticeLayer';
import { DownloadIcon, PdfIcon } from '@/components/ui/icons';
import { versionLetters } from '@/model/versions';
import { answerKeyPreset } from '@/model/answerKeyLayout';
import type { DocumentView } from '@/store/worksheetStore';
import { KeyDocumentsField } from './KeyDocumentsField';
import {
  deliverFiles,
  deliverWorksheetJson,
  exportFileCount,
  exportKinds,
  loadKeyDocuments,
  omittableParts,
  paperMode,
  pdfDestination,
  pdfVariant,
  planned,
  skippedNote,
  uniqueNames,
  withPlace,
  type ExportChoice,
  type ExportFile,
  type ExportFormat,
  type ExportRun,
  type ExportSaver,
  type ExportWhat,
  type KeyDocumentPick,
  type PlannedFile,
  type SavedPlace,
} from './exportSession';
import { resolveMessages, type Messages } from '@/i18n/catalogue';
import { uiLanguage, useMessages } from '@/i18n/language';
import { EXPORT_MESSAGES } from './ExportDialog.messages';

/** What the dialog's paper check is checking (`ExportDialogProps.checks`). */
export interface ExportCheckChoice {
  mode: OutputMode;
  paper: boolean;
}

export interface ExportDialogProps {
  worksheet: Worksheet;
  /** The editor's language and version, which the dialog starts from. */
  mode: OutputMode;
  onClose: () => void;
  /** After the last file is written: the status line and, on desktop, its path. */
  onExported: (message: string, path?: string) => void;
  /**
   * A pre-export check of the paper, shown at the top of the body. As a function it is
   * told the edition chosen: `mode` as the paper would print, `paper` false when no
   * question paper is written (key, other apps, .json).
   */
  checks?: ReactNode | ((choice: ExportCheckChoice) => ReactNode);
  /**
   * PDF: print the sheets in this mode. Called after the dialog has closed, so it is
   * gone from the page before the print starts; the caller reports its own failure.
   * Desktop passes the `file` its save sheet chose, to write without a print sheet.
   * `view` is what the page must show to print it: the paper, or the answer key.
   */
  onPrint?: (mode: OutputMode, file?: string, view?: DocumentView) => void;
  /** The format the dialog opens on; `.docx` when absent. */
  initialFormat?: ExportFormat;
  /** What the dialog opens on; the question paper when absent. */
  initialWhat?: ExportWhat;
  /**
   * The saved documents "Also include" offers (this one is left out here). Absent: read
   * from the store's index when the dialog opens.
   */
  documents?: WorksheetSummary[];
  /** Read one saved document, read-only; the store's `load` when absent. */
  loadDocument?: (id: string) => Promise<Worksheet | undefined>;
  /**
   * The open paper's set, when it has two papers with questions (k-0299 step C): offers
   * What → Whole set. Papers in set order, the open one as the editor holds it.
   */
  wholeSet?: WholeSet;
  /**
   * Desktop, Whole set as PDF: print each job straight into `folder`, after the dialog has
   * closed (the page shows each document in turn while it prints).
   */
  onPrintSet?: (jobs: Array<{ job: PrintJob; fileName: string }>, folder: FolderTarget) => void;
}

/** The set Export → Whole set writes. */
export interface WholeSet {
  name: string;
  /** In set order; blank ones (no questions) are not here. */
  papers: Worksheet[];
  /** Left out: no questions yet. */
  blank: Worksheet[];
}

const loadSaved = (id: string) => worksheetStore.load(id);

/**
 * Name the chosen files; each builds when delivered, after the save picker. The `.docx`
 * builders (OOXML + JSZip) are imported then, on click, so no page load pays for them; a
 * chunk that fails to load reports as an export failure like any other.
 */
async function planFiles(
  worksheet: Worksheet,
  choice: ExportChoice,
  loadDocument: (id: string) => Promise<Worksheet | undefined>,
): Promise<PlannedFile[]> {
  if (choice.what === 'apps') {
    const built = buildAppExport(worksheet, choice.app ?? 'zipgrade', choice.language);
    return [{ kind: 'apps', name: built.fileName, build: () => appBlob(built) }];
  }
  const docx = () => import('@/export/docx');
  // The pages are measured on a hidden copy of the preview as each file builds, so the
  // `.docx` breaks its pages where the preview does (§ `joinWithPageBreaks`).
  const pages = () => import('@/components/preview/measurePageStarts');
  const files: PlannedFile[] = [];
  for (const kind of exportKinds(choice.what)) {
    if (kind === 'paper') {
      for (const variant of choice.variants ?? [undefined]) {
        const mode: OutputMode = { ...paperMode(choice), ...(variant ? { variant } : {}) };
        files.push({
          kind,
          name: docxFileName(worksheet, mode),
          build: async () => {
            const [{ exportDocx }, { measurePaperPagination }] = await Promise.all([docx(), pages()]);
            return exportDocx(worksheet, mode, await measured(() => measurePaperPagination(worksheet, mode)));
          },
          ...(variant ? { variant } : {}),
        });
      }
    } else {
      // A combined key: the picked documents, read-only; any that fail are named, not fatal.
      const { worksheets: others, skipped } = await loadKeyDocuments(
        choice.alsoInclude ?? [],
        loadDocument,
        choice.language,
      );
      const note = skippedNote(skipped);
      files.push({
        kind,
        name: answerKeyFileName(worksheet, choice.language, others),
        build: async () => {
          const [{ exportAnswerKeyDocx }, { measureAnswerKeyPagination }] = await Promise.all([docx(), pages()]);
          const { pageStarts, watermarkHeads } = await measured(() =>
            measureAnswerKeyPagination([worksheet, ...others], choice.language),
          );
          return exportAnswerKeyDocx(worksheet, choice.language, others, pageStarts, watermarkHeads);
        },
        ...(note ? { note, leftOut: skipped.length } : {}),
      });
    }
  }
  return files;
}

/**
 * Export → Whole set as Word (k-0299 step C): each paper's question paper, then the whole
 * set's marking scheme (`renderCombinedAnswerKey`, set order). Every paper in the dialog's
 * language and copy, its first version; one file each, named apart.
 */
function planSetFiles(set: WholeSet, choice: ExportChoice): PlannedFile[] {
  const docx = () => import('@/export/docx');
  const pages = () => import('@/components/preview/measurePageStarts');
  const mode = paperMode(choice);
  const names = uniqueNames([
    ...set.papers.map((paper) => docxFileName(paper, mode)),
    setKeyFileName(set.name, set.papers, choice.language),
  ]);
  const files: PlannedFile[] = set.papers.map((paper, index) => ({
    kind: 'paper',
    name: names[index],
    build: async () => {
      const [{ exportDocx }, { measurePaperPagination }] = await Promise.all([docx(), pages()]);
      return exportDocx(paper, mode, await measured(() => measurePaperPagination(paper, mode)));
    },
  }));
  const [first, ...rest] = set.papers;
  files.push({
    kind: 'answerKey',
    name: names[names.length - 1],
    build: async () => {
      const [{ exportAnswerKeyDocx }, { measureAnswerKeyPagination }] = await Promise.all([docx(), pages()]);
      const { pageStarts, watermarkHeads } = await measured(() => measureAnswerKeyPagination(set.papers, choice.language));
      return exportAnswerKeyDocx(first, choice.language, rest, pageStarts, watermarkHeads);
    },
  });
  return files;
}

/** The web's Whole set: the files in one `.zip`, built after its Save As has been asked. */
function zippedSet(set: WholeSet, choice: ExportChoice, files: PlannedFile[]): PlannedFile {
  return {
    kind: 'set',
    name: setZipFileName(set.name, { language: choice.language, version: choice.version }),
    build: async () => {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      for (const file of files) zip.file(file.name, await file.build());
      return zip.generateAsync({ type: 'blob', mimeType: 'application/zip' });
    },
  };
}

/** A measurement that failed stops the export, saying so; no page breaks are guessed. */
async function measured<T>(measure: () => Promise<T>): Promise<T> {
  try {
    return await measure();
  } catch {
    throw new Error(resolveMessages(EXPORT_MESSAGES, uiLanguage()).notMeasured);
  }
}

/** CSV as UTF-8 text; the `.xlsx` writer (JSZip) loads on click, like the `.docx` one. */
async function appBlob(built: AppExport): Promise<Blob> {
  if (built.data.kind === 'csv') return new Blob([built.data.text], { type: 'text/csv;charset=utf-8' });
  const { buildXlsx } = await import('@/export/csv/xlsx');
  return buildXlsx(built.data.rows);
}

const filtersFor = (name: string) =>
  name.endsWith('.csv')
    ? CSV_FILTERS
    : name.endsWith('.xlsx')
      ? XLSX_FILTERS
      : name.endsWith('.zip')
        ? SET_ZIP_FILTERS
        : DOCX_FILTERS;

/** Where export files go: the platform's pickers, read at click time. */
const exportSaver = (): ExportSaver => ({
  folders: canChooseFolder(),
  chooseFile: (file) => chooseSaveTarget(file.name, filtersFor(file.name)),
  chooseFolder: chooseFolderTarget,
});

/**
 * PDF differs by platform: the desktop app writes the file itself; a browser can only
 * print, and the teacher picks Save as PDF in its dialog.
 */
function formatOptions(
  desktop: boolean,
  m: Messages<typeof EXPORT_MESSAGES>,
): Array<{ value: ExportFormat; label: string; title: string; hint: string }> {
  return [
    {
      value: 'docx',
      label: '.docx', // i18n-ignore: file format and service names
      title: m.docxTitle,
      hint: m.docxHint,
    },
    desktop
      ? {
          value: 'pdf',
          label: 'PDF',
          title: m.pdfDesktopTitle,
          hint: m.pdfDesktopHint,
        }
      : {
          value: 'pdf',
          label: 'PDF',
          title: m.pdfWebTitle,
          hint: m.pdfWebHint,
        },
    {
      value: 'json',
      label: '.json', // i18n-ignore: file format and service names
      title: m.jsonTitle,
      hint: m.jsonHint,
    },
  ];
}

/** `<name> (Student) (EN).pdf`: the `.docx` name, so the two files sort together. */
async function pdfFileName(worksheet: Worksheet, mode: OutputMode, view: DocumentView = 'paper'): Promise<string> {
  const name = view === 'answerKey' ? answerKeyFileName(worksheet, mode.language) : docxFileName(worksheet, mode);
  return name.replace(/\.docx$/, '.pdf');
}

const appOptions = (
  m: Messages<typeof EXPORT_MESSAGES>,
): Array<{ value: AppFormat; label: string; title: string; hint: string }> => [
  { value: 'zipgrade', label: 'ZipGrade', title: m.zipgradeTitle, hint: m.zipgradeHint }, // i18n-ignore: file format and service names
  { value: 'keyCsv', label: 'Key CSV', title: m.keyCsvTitle, hint: m.keyCsvHint }, // i18n-ignore: file format and service names
  { value: 'kahoot', label: 'Kahoot', title: m.kahootTitle, hint: m.kahootHint }, // i18n-ignore: file format and service names
  { value: 'blooket', label: 'Blooket', title: m.blooketTitle, hint: m.blooketHint }, // i18n-ignore: file format and service names
];

/** Warnings shown before the cut: the rest is a count. */
const WARNINGS_SHOWN = 4;

/** What the saved files had to leave out, for the status line and the dialog. */
const savedNotes = (files: ExportFile[]) => files.flatMap((file) => (file.note ? [file.note] : []));

/** Hand what was written to the toolbar's status line; nothing written, nothing said. */
function report(
  saved: ExportRun['saved'],
  onExported: ExportDialogProps['onExported'],
  folder?: SavedPlace,
): void {
  if (saved.length === 0) return;
  const m = resolveMessages(EXPORT_MESSAGES, uiLanguage());
  const leftOut = saved.reduce((sum, { file }) => sum + (file.leftOut ?? 0), 0);
  const message = withPlace(
    saved.length > 1
      ? m.exportedFiles(saved.length)
      : saved[0].file.kind === 'set'
        ? m.exportedSet
        : saved[0].file.kind === 'answerKey'
          ? m.exportedKey
          : saved[0].file.kind === 'apps'
            ? m.exportedExt(saved[0].file.name.split('.').pop() ?? '')
            : m.exportedDocx,
    saved,
    folder,
  );
  onExported(leftOut > 0 ? m.leftOut(message, leftOut) : message, saved[saved.length - 1].path);
}

/**
 * What Export → Whole set writes, one line per file, in order. On the web as PDF, each line
 * is its own Print: a browser prints one document per click and asks where each goes.
 */
function SetFileList({
  set,
  names,
  labels,
  printing,
}: {
  set: WholeSet;
  names: string[];
  labels: string[];
  printing?: { printed: ReadonlySet<number>; busy: boolean; onPrint: (index: number) => void };
}) {
  const m = useMessages(EXPORT_MESSAGES);
  const nextToPrint = printing ? names.findIndex((_, index) => !printing.printed.has(index)) : -1;
  return (
    <div className="space-y-1.5 pt-2">
      <ol aria-label={m.setFiles} data-set-files className="divide-y divide-line rounded-lg border border-line bg-surface text-xs">
        {names.map((name, index) => (
          <li key={name} className="flex min-h-9 items-center gap-2 px-2.5 py-1.5">
            <span className="w-4 shrink-0 text-right tabular-nums text-ink-muted">{index + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-ink" title={labels[index]}>
                {labels[index]}
              </span>
              <span className="block truncate text-[11px] text-ink-subtle" title={name}>
                {name}
              </span>
            </span>
            {printing && (
              <Button
                // The next one to print is the filled button; the rest stay quiet.
                variant={index === nextToPrint ? 'primary' : 'default'}
                onClick={() => printing.onPrint(index)}
                disabled={printing.busy}
              >
                <PdfIcon size={14} />
                {printing.printed.has(index) ? m.printAgain : m.printOne}
              </Button>
            )}
          </li>
        ))}
      </ol>
      {set.blank.length > 0 && (
        <p className="text-[11.5px] leading-snug text-ink-subtle">{m.setBlankLeftOut(set.blank.map(worksheetTitle).join(', '))}</p>
      )}
    </div>
  );
}

/**
 * Export: the question paper, a separate answer key, or both, in any language. Editor
 * chrome outside `#print-root`, so print CSS hides it from the PDF.
 */
export function ExportDialog({
  worksheet,
  mode,
  onClose,
  onExported,
  checks,
  onPrint,
  initialFormat = 'docx',
  initialWhat = 'paper',
  documents: givenDocuments,
  loadDocument = loadSaved,
  wholeSet,
  onPrintSet,
}: ExportDialogProps) {
  const m = useMessages(EXPORT_MESSAGES);
  const [format, setFormat] = useState<ExportFormat>(initialFormat);
  const desktop = isDesktop();
  // Firefox and Safari: no picker, so the browser's own download setting decides where.
  const downloadsOnly = !canChooseLocation();
  const formats = formatOptions(desktop, m);
  const apps = appOptions(m);
  const [chosenWhat, setWhat] = useState<ExportWhat>(initialWhat === 'set' && !wholeSet ? 'paper' : initialWhat);
  // PDF prints the sheets on the page: the question paper, or the answer key (the
  // Marking scheme view), or every paper of the set in turn. The other choices are kept
  // for when the format goes back.
  const what: ExportWhat =
    chosenWhat === 'set' && !wholeSet
      ? 'paper'
      : format === 'pdf' && chosenWhat !== 'answerKey' && chosenWhat !== 'set'
        ? 'paper'
        : chosenWhat;
  const setOnly = what === 'set';
  const pdf = format === 'pdf';
  const json = format === 'json';
  // The paper's own options, greyed when no question paper is written (inside a greyed
  // .json body they are already greyed once).
  const keyOnly = !json && (what === 'answerKey' || what === 'apps');
  const [language, setLanguage] = useState<LanguageMode>(mode.language);
  const [version, setVersion] = useState<VersionMode>(mode.version);
  const [includeCover, setIncludeCover] = useState(true);
  const [includeAnswerSpace, setIncludeAnswerSpace] = useState(true);
  const omittable = useMemo(() => omittableParts(worksheet, mode), [worksheet, mode]);
  const [app, setApp] = useState<AppFormat>('zipgrade');
  // Built on every change, so its warnings show before the click; it is only text.
  const appExport = useMemo(
    () => (what === 'apps' && !json ? buildAppExport(worksheet, app, language) : undefined),
    [what, json, worksheet, app, language],
  );
  // Shuffled versions (`Worksheet.versions`): every one by default, one file each.
  const letters = versionLetters(worksheet);
  const [variantChoice, setVariantChoice] = useState<string>('all');
  const variants =
    letters.length === 0 ? undefined : letters.includes(variantChoice) ? [variantChoice] : letters;
  // A print is one version: "All" falls back to the one the editor shows.
  const printVariant = pdfVariant(letters, variantChoice, mode.variant);
  const fileCount = setOnly && wholeSet ? wholeSet.papers.length + 1 : exportFileCount({ what, variants });
  // The edition the check describes; an Include box with nothing to leave out changes nothing.
  const checkChoice: ExportCheckChoice = {
    mode: {
      ...paperMode({
        what: 'paper',
        language,
        version,
        includeCover: includeCover || !omittable.cover,
        includeAnswerSpace: includeAnswerSpace || !omittable.answerSpace,
      }),
      ...(printVariant && printVariant !== letters[0] ? { variant: printVariant } : {}),
    },
    paper: !json && what !== 'answerKey' && what !== 'apps' && !setOnly,
  };
  // "Also include": other saved documents' keys in the same file. The index, read on open.
  const [storedDocuments, setStoredDocuments] = useState<WorksheetSummary[]>();
  useEffect(() => {
    if (givenDocuments) return;
    let live = true;
    worksheetStore
      .list()
      .then((list) => {
        if (live) setStoredDocuments(list);
      })
      .catch(() => {
        if (live) setStoredDocuments([]);
      });
    return () => {
      live = false;
    };
  }, [givenDocuments]);
  const otherDocuments = useMemo(
    () => (givenDocuments ?? storedDocuments ?? []).filter((doc) => doc.id !== worksheet.id),
    [givenDocuments, storedDocuments, worksheet.id],
  );
  // Folded away (k-0299 step C): a set's marking scheme is Whole set's now; this stays for
  // keys of documents in no set. Nothing comes ticked.
  const [alsoInclude, setAlsoInclude] = useState<KeyDocumentPick[]>([]);
  const combinable =
    format === 'docx' && (what === 'answerKey' || what === 'both') && otherDocuments.length > 0;
  const [busy, setBusy] = useState(false);
  // A failed export floats over the dialog's foot until the next try (`useDialogNotices`).
  const notices = useDialogNotices();
  const setError = (message: string | undefined) => {
    if (message === undefined) notices.dismiss('export-error');
    else notices.notify({ id: 'export-error', tone: 'error', body: message });
  };
  // A combined key that had to leave a document out: said here before the dialog goes.
  const [leftOut, setLeftOut] = useState<string>();
  // Web only: files built but waiting for their own click, and what has already gone.
  const [waiting, setWaiting] = useState<{ pending: ExportFile[]; saved: ExportRun['saved'] }>();

  // The parent's callbacks, read at call time: `close` must stay stable per step, or
  // `Dialog` re-focuses its panel whenever the toolbar re-renders.
  const callbacks = useRef({ onClose, onExported });
  useEffect(() => {
    callbacks.current = { onClose, onExported };
  });

  // Skipping the second download still reports the first.
  const close = useCallback(() => {
    if (waiting) report(waiting.saved, callbacks.current.onExported);
    callbacks.current.onClose();
  }, [waiting]);

  const finish = (run: ExportRun, before: ExportRun['saved'], retry?: ExportFile[]) => {
    // A cancelled picker wrote nothing; the dialog stays for another try.
    if (run.cancelled) {
      if (retry) setWaiting({ pending: retry, saved: before });
      return;
    }
    const saved = [...before, ...run.saved];
    if (run.pending.length > 0) {
      setWaiting({ pending: run.pending, saved });
      return;
    }
    if (saved.length === 0) return;
    report(saved, onExported, run.folder);
    const notes = savedNotes(saved.map(({ file }) => file));
    if (notes.length > 0) {
      setLeftOut(notes.join(resolveMessages(EXPORT_MESSAGES, uiLanguage()).noteSeparator));
      return;
    }
    onClose();
  };

  // Planning is quick, so the picker still opens inside the click; the files build after it.
  const run = async (
    plan: () => Promise<PlannedFile[]>,
    before: ExportRun['saved'] = [],
    retry?: ExportFile[],
  ) => {
    setBusy(true);
    setError(undefined);
    try {
      finish(await deliverFiles(await plan(), exportSaver()), before, retry);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : m.failed);
    } finally {
      setBusy(false);
    }
  };

  // Closed first, so the dialog is gone from the page before anything is printed.
  // Desktop asks where first; a cancelled sheet keeps the dialog, as `.json` does.
  const handlePrint = async () => {
    // The key has no student copy, cover or answer space: it prints in this language,
    // and the paper's own view (version, paper version) is left as it was.
    const view: DocumentView = what === 'answerKey' ? 'answerKey' : 'paper';
    const printMode: OutputMode =
      view === 'answerKey'
        ? { language, version: mode.version, ...(mode.variant ? { variant: mode.variant } : {}) }
        : {
            ...paperMode({ what: 'paper', language, version, includeCover, includeAnswerSpace }),
            ...(printVariant && printVariant !== letters[0] ? { variant: printVariant } : {}),
          };
    setBusy(true);
    setError(undefined);
    let destination: { file?: string } | undefined;
    try {
      destination = await pdfDestination({
        desktop,
        choose: async () => chooseSavePath(await pdfFileName(worksheet, printMode, view), PDF_FILTERS),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : m.failed);
      return;
    } finally {
      setBusy(false);
    }
    if (!destination) return;
    callbacks.current.onClose();
    onPrint?.(printMode, destination.file, view);
  };

  // Whole set as PDF (k-0299 step C). Each paper, then the set's marking scheme, printed as
  // the page shows it for the length of one print (`printJob.tsx`).
  const setJobs = (): Array<{ job: PrintJob; fileName: string }> => {
    if (!wholeSet) return [];
    const paperPrint: OutputMode = paperMode({ what: 'paper', language, version, includeCover, includeAnswerSpace });
    const names = uniqueNames([
      ...wholeSet.papers.map((paper) => docxFileName(paper, paperPrint)),
      setKeyFileName(wholeSet.name, wholeSet.papers, language),
    ]).map((name) => name.replace(/\.docx$/, '.pdf'));
    return [
      ...wholeSet.papers.map((paper, index) => ({
        job: { kind: 'paper' as const, worksheet: paper, mode: paperPrint, label: paperLabel(paper) },
        fileName: names[index],
      })),
      {
        job: { kind: 'setKey' as const, worksheets: wholeSet.papers, language, label: m.setKeyLabel },
        fileName: names[names.length - 1],
      },
    ];
  };
  const paperLabel = (paper: Worksheet) => {
    const role = setRoleOf(paper);
    const title = worksheetTitle(paper);
    return role === 'paper1' ? `Paper 1 · ${title}` : role === 'paper2' ? `Paper 2 · ${title}` : title; // i18n-ignore: Paper 1 / Paper 2 stay English
  };
  // The web prints one at a time, each from its own click: which have gone.
  const [setPrinted, setSetPrinted] = useState<ReadonlySet<number>>(new Set());
  const [setPrinting, setSetPrinting] = useState(false);
  const webSetPdf = pdf && setOnly && !desktop;
  const printOne = async (index: number) => {
    const entry = setJobs()[index];
    if (!entry) return;
    setError(undefined);
    setSetPrinting(true);
    try {
      await printJobPdf(entry.job, browserJobDeps());
      setSetPrinted((done) => new Set([...done, index]));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : m.failed);
    } finally {
      setSetPrinting(false);
    }
  };
  // Desktop: one folder, asked for first; the files are printed once the dialog has gone.
  const handleSetPdf = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const folder = await chooseFolderTarget();
      if (folder === 'cancelled') return;
      if (folder === 'unavailable' || !folder.pathFor || !onPrintSet) {
        setError(m.setPdfNoFolder);
        return;
      }
      const jobs = setJobs();
      callbacks.current.onClose();
      onPrintSet(jobs, folder);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : m.failed);
    } finally {
      setBusy(false);
    }
  };

  // The document file: nothing to choose, one save. A cancelled sheet keeps the dialog.
  const handleJson = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const saved = await deliverWorksheetJson({ save: () => downloadWorksheetFile(worksheet) });
      if (!saved) return;
      onExported(withPlace(saved.message, [saved]), saved.path);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : m.failed);
    } finally {
      setBusy(false);
    }
  };

  const handleExport = () =>
    void run(async () => {
      if (setOnly && wholeSet) {
        const files = planSetFiles(wholeSet, { what, language, version, includeCover, includeAnswerSpace });
        // Desktop: a folder; the web: one .zip (the user, u-c17j).
        return desktop ? files : [zippedSet(wholeSet, { what, language, version }, files)];
      }
      return planFiles(
        worksheet,
        {
          what,
          language,
          version,
          includeCover,
          includeAnswerSpace,
          app,
          variants,
          ...(combinable && alsoInclude.length > 0 ? { alsoInclude } : {}),
        },
        loadDocument,
      );
    });

  // A fresh click, and the file is already built: nothing stands between it and the download.
  const handleNext = () => {
    if (!waiting) return;
    const { pending, saved } = waiting;
    setWaiting(undefined);
    void run(async () => pending.map(planned), saved, pending);
  };

  const next = waiting?.pending[0];

  return (
    <Dialog
      noticeScope={notices.scope}
      title={m.title}
      description={m.description}
      width={480}
      onClose={close}
      footer={
        <>
          {!webSetPdf && (
            <Button variant={leftOut ? 'primary' : 'subtle'} onClick={leftOut ? onClose : close}>
              {leftOut ? m.done : waiting ? m.skip : m.cancel}
            </Button>
          )}
          {leftOut ? null : next ? (
            <Button variant="primary" onClick={handleNext} disabled={busy}>
              <DownloadIcon size={15} />
              {next.kind === 'answerKey'
                ? m.downloadKey
                : next.variant
                  ? m.downloadVersion(next.variant)
                  : m.downloadPaper}
            </Button>
          ) : webSetPdf ? (
            <Button variant="primary" onClick={onClose}>
              {m.done}
            </Button>
          ) : pdf && setOnly ? (
            <Button variant="primary" onClick={() => void handleSetPdf()} disabled={!onPrintSet || busy}>
              <PdfIcon size={15} />
              {m.saveSetPdfs(fileCount)}
            </Button>
          ) : pdf ? (
            <Button variant="primary" onClick={() => void handlePrint()} disabled={!onPrint || busy}>
              <PdfIcon size={15} />
              {desktop ? m.savePdf : m.printPdf}
            </Button>
          ) : json ? (
            <Button variant="primary" onClick={() => void handleJson()} disabled={busy}>
              <DownloadIcon size={15} />
              {busy ? m.exporting : m.exportJson}
            </Button>
          ) : (
            <Button variant="primary" onClick={handleExport} disabled={busy || appExport?.empty}>
              <DownloadIcon size={15} />
              {busy
                ? m.exporting
                : appExport
                  ? m.exportExt(appExport.fileName.split('.').pop() ?? '')
                  : setOnly && !desktop
                    ? m.exportZip
                    : fileCount > 1
                    ? m.exportFiles(fileCount)
                    : m.exportDocx}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-5 px-5 py-5">
        {/* The check reads the open paper alone; Whole set writes every paper. */}
        {!leftOut && !setOnly && (typeof checks === 'function' ? checks(checkChoice) : checks)}

        {leftOut ? (
          <p role="status" className="animate-fade-in rounded-lg bg-warn-soft px-2.5 py-2 text-[13px] leading-relaxed text-warn-ink">
            {m.keyExportedBut(leftOut)}
          </p>
        ) : waiting ? (
          <div className="animate-fade-in space-y-3">
            <p role="status" className="text-[13px] leading-relaxed text-ink-subtle">
              {m.waitingNote(waiting.saved.length === 1 && waiting.saved[0].file.kind === 'paper')}
            </p>
            {savedNotes(waiting.pending).length > 0 && (
              <p className="rounded-lg bg-warn-soft px-2.5 py-2 text-xs text-warn-ink">
                {m.inKey(savedNotes(waiting.pending).join(m.noteSeparator))}
              </p>
            )}
          </div>
        ) : (
          <>
            <Field label={m.format} hint={formats.find((option) => option.value === format)?.hint}>
              <Segmented label={m.format} value={format} onChange={setFormat} options={formats} />
            </Field>

            {/* Greyed in place rather than hidden, so switching format does not move the
                dialog; each field's hint says why. */}
            <div
              inert={json}
              className={`space-y-5 transition-opacity duration-200 ease-out-soft ${json ? 'opacity-40' : ''}`}
            >
              <Field
                label={m.what}
                hint={
                  setOnly && wholeSet
                    ? pdf
                      ? desktop
                        ? m.hintSetPdfDesktop(fileCount)
                        : m.hintSetPdfWeb
                      : desktop
                        ? m.hintSetFolder(fileCount)
                        : m.hintSetZip(fileCount)
                    : pdf
                    ? what === 'answerKey'
                      ? m.hintPdfKey
                      : m.hintPdf
                    : what === 'both'
                      ? canChooseFolder()
                        ? m.hintBothFolder(fileCount)
                        : m.hintBothClicks(fileCount)
                      : what === 'apps'
                        ? m.hintApps
                        : answerKeyPreset(worksheet.answerKeyLayout) === 'suggested'
                          ? m.hintKeySuggested
                          : m.hintKey
                }
              >
                <Segmented
                  label={m.whatAria}
                  value={what}
                  onChange={setWhat}
                  options={[
                    { value: 'paper', label: m.paper },
                    { value: 'answerKey', label: m.key },
                    ...(
                      [
                        { value: 'both', label: m.both },
                        { value: 'apps', label: m.apps, title: m.appsTitle },
                      ] as const
                    ).map((option) =>
                      pdf
                        ? { ...option, disabled: true, title: m.notPdf }
                        : option,
                    ),
                    ...(wholeSet ? [{ value: 'set' as const, label: m.wholeSet, title: m.wholeSetTitle(wholeSet.name) }] : []),
                  ]}
                />
                {setOnly && wholeSet && (
                  <SetFileList
                    set={wholeSet}
                    names={setJobs().map((entry) => (pdf ? entry.fileName : entry.fileName.replace(/\.pdf$/, '.docx')))}
                    labels={setJobs().map((entry) => entry.job.label)}
                    printing={webSetPdf ? { printed: setPrinted, busy: setPrinting, onPrint: (index) => void printOne(index) } : undefined}
                  />
                )}
              </Field>

              {combinable && (
                <KeyDocumentsField
                  documents={otherDocuments}
                  picked={alsoInclude}
                  onChange={setAlsoInclude}
                  currentTitle={worksheetTitle(worksheet)}
                  inASet={Boolean(wholeSet)}
                />
              )}

              {appExport && (
                <Field label={m.app} hint={apps.find((option) => option.value === app)?.hint}>
                  <Segmented label={m.app} value={app} onChange={setApp} options={apps} />
                  {(appExport.empty || appExport.warnings.length > 0) && (
                    <ul role="status" className="space-y-1 rounded-lg bg-warn-soft px-2.5 py-2 text-xs text-warn-ink">
                      {appExport.empty ? (
                        <li>{m.noMcq}</li>
                      ) : (
                        <>
                          {appExport.warnings.slice(0, WARNINGS_SHOWN).map((warning) => (
                            <li key={warning}>{warning}</li>
                          ))}
                          {appExport.warnings.length > WARNINGS_SHOWN && (
                            <li>{m.andMore(appExport.warnings.length - WARNINGS_SHOWN)}</li>
                          )}
                        </>
                      )}
                    </ul>
                  )}
                </Field>
              )}

              <Field
                label={m.language}
                hint={
                  pdf
                    ? what === 'answerKey'
                      ? m.languageHintKey(desktop)
                      : m.languageHint(desktop)
                    : undefined
                }
              >
                <Segmented
                  label={m.language}
                  value={language}
                  onChange={setLanguage}
                  options={[
                    { value: 'en', label: 'EN', title: m.langEn },
                    { value: 'zh', label: '中文', title: m.langZh },
                    { value: 'bilingual', label: 'EN+中', title: m.langBoth },
                  ]}
                />
              </Field>

              {/* Kept in place when unused, so switching "What" does not move the dialog. */}
              <div
                inert={keyOnly}
                className={`transition-opacity duration-200 ease-out-soft ${keyOnly ? 'opacity-40' : ''}`}
              >
                <Field
                  label={m.copy}
                  hint={keyOnly ? m.copyKeyOnly : m.copyHint}
                >
                  <Segmented
                    label={m.copy}
                    value={version}
                    onChange={setVersion}
                    options={[
                      { value: 'student', label: m.student, title: m.studentTitle },
                      { value: 'teacher', label: m.teacher, title: m.teacherTitle },
                    ]}
                  />
                </Field>
                {letters.length > 0 && (
                  <div
                    inert={setOnly}
                    className={`mt-5 transition-opacity duration-200 ease-out-soft ${setOnly ? 'opacity-40' : ''}`}
                  >
                    <Field
                      label={m.shuffled}
                      hint={setOnly ? m.shuffledSet : pdf ? m.shuffledPdf : m.shuffledFiles}
                    >
                      <Segmented
                        label={m.shuffled}
                        value={pdf ? (printVariant ?? 'all') : variants && variants.length === 1 ? variants[0] : 'all'}
                        onChange={setVariantChoice}
                        options={[
                          {
                            value: 'all',
                            label: m.all,
                            title: pdf ? m.allPdf : m.allVersions(letters.join(', ')),
                            disabled: pdf,
                          },
                          ...letters.map((letter) => ({ value: letter, label: letter, title: m.onlyVersion(letter) })),
                        ]}
                      />
                    </Field>
                  </div>
                )}
              </div>

              {/* Offered only for what this document has; greyed like the version above. */}
              {(omittable.cover || omittable.answerSpace) && (
                <div
                  inert={keyOnly}
                  className={`transition-opacity duration-200 ease-out-soft ${keyOnly ? 'opacity-40' : ''}`}
                >
                  <Field
                    label={m.include}
                    hint={pdf ? m.includePdf : m.includePaper}
                  >
                    <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                      {omittable.cover && (
                        <CheckField label={m.cover} checked={includeCover} onChange={setIncludeCover} />
                      )}
                      {omittable.answerSpace && (
                        <CheckField
                          label={m.answerSpace}
                          checked={includeAnswerSpace}
                          onChange={setIncludeAnswerSpace}
                        />
                      )}
                    </div>
                  </Field>
                </div>
              )}
            </div>
          </>
        )}

        {downloadsOnly && !pdf && !leftOut && (
          <p className="text-[11px] leading-relaxed text-ink-muted">
            {m.downloadsOnly}
          </p>
        )}

      </div>
    </Dialog>
  );
}
