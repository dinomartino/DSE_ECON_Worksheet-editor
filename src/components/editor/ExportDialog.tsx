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
  XLSX_FILTERS,
} from '@/platform';
import { downloadWorksheetFile, worksheetStore, worksheetTitle, type WorksheetSummary } from '@/storage';
import { buildAppExport, type AppExport, type AppFormat } from '@/export/csv/answerKeyCsv';
import { answerKeyFileName, docxFileName } from '@/export/docx/fileNames';
import { Button, CheckField, Segmented } from '@/components/ui';
import { Dialog, Field } from '@/components/ui/Dialog';
import { DownloadIcon, PdfIcon } from '@/components/ui/icons';
import { versionLetters } from '@/model/versions';
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

export interface ExportDialogProps {
  worksheet: Worksheet;
  /** The editor's language and version, which the dialog starts from. */
  mode: OutputMode;
  onClose: () => void;
  /** After the last file is written: the status line and, on desktop, its path. */
  onExported: (message: string, path?: string) => void;
  /** A pre-export check of the paper, shown at the top of the body. */
  checks?: ReactNode;
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
  const files: PlannedFile[] = [];
  for (const kind of exportKinds(choice.what)) {
    if (kind === 'paper') {
      for (const variant of choice.variants ?? [undefined]) {
        const mode: OutputMode = { ...paperMode(choice), ...(variant ? { variant } : {}) };
        files.push({
          kind,
          name: docxFileName(worksheet, mode),
          build: async () => (await docx()).exportDocx(worksheet, mode),
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
        build: async () => (await docx()).exportAnswerKeyDocx(worksheet, choice.language, others),
        ...(note ? { note, leftOut: skipped.length } : {}),
      });
    }
  }
  return files;
}

/** CSV as UTF-8 text; the `.xlsx` writer (JSZip) loads on click, like the `.docx` one. */
async function appBlob(built: AppExport): Promise<Blob> {
  if (built.data.kind === 'csv') return new Blob([built.data.text], { type: 'text/csv;charset=utf-8' });
  const { buildXlsx } = await import('@/export/csv/xlsx');
  return buildXlsx(built.data.rows);
}

const filtersFor = (name: string) =>
  name.endsWith('.csv') ? CSV_FILTERS : name.endsWith('.xlsx') ? XLSX_FILTERS : DOCX_FILTERS;

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
}: ExportDialogProps) {
  const m = useMessages(EXPORT_MESSAGES);
  const [format, setFormat] = useState<ExportFormat>(initialFormat);
  const desktop = isDesktop();
  // Firefox and Safari: no picker, so the browser's own download setting decides where.
  const downloadsOnly = !canChooseLocation();
  const formats = formatOptions(desktop, m);
  const apps = appOptions(m);
  const [chosenWhat, setWhat] = useState<ExportWhat>(initialWhat);
  // PDF prints the sheets on the page: the question paper, or the answer key (the
  // Marking scheme view). The other choices are kept for when the format goes back.
  const what: ExportWhat = format === 'pdf' && chosenWhat !== 'answerKey' ? 'paper' : chosenWhat;
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
  const fileCount = exportFileCount({ what, variants });
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
  const [alsoInclude, setAlsoInclude] = useState<KeyDocumentPick[]>([]);
  const combinable =
    format === 'docx' && (what === 'answerKey' || what === 'both') && otherDocuments.length > 0;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
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
    void run(() =>
      planFiles(
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
      ),
    );

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
      title={m.title}
      description={m.description}
      width={480}
      onClose={close}
      footer={
        <>
          <Button variant={leftOut ? 'primary' : 'subtle'} onClick={leftOut ? onClose : close}>
            {leftOut ? m.done : waiting ? m.skip : m.cancel}
          </Button>
          {leftOut ? null : next ? (
            <Button variant="primary" onClick={handleNext} disabled={busy}>
              <DownloadIcon size={15} />
              {next.kind === 'answerKey'
                ? m.downloadKey
                : next.variant
                  ? m.downloadVersion(next.variant)
                  : m.downloadPaper}
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
                  : fileCount > 1
                    ? m.exportFiles(fileCount)
                    : m.exportDocx}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-5 px-5 py-5">
        {!leftOut && checks}

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
                  pdf
                    ? what === 'answerKey'
                      ? m.hintPdfKey
                      : m.hintPdf
                    : what === 'both'
                      ? canChooseFolder()
                        ? m.hintBothFolder(fileCount)
                        : m.hintBothClicks(fileCount)
                      : what === 'apps'
                        ? m.hintApps
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
                  ]}
                />
              </Field>

              {combinable && (
                <KeyDocumentsField
                  documents={otherDocuments}
                  picked={alsoInclude}
                  onChange={setAlsoInclude}
                  currentTitle={worksheetTitle(worksheet)}
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
                  <div className="mt-5">
                    <Field
                      label={m.shuffled}
                      hint={pdf ? m.shuffledPdf : m.shuffledFiles}
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

        {error && (
          <p role="alert" className="rounded-lg bg-danger-soft px-2.5 py-1.5 text-xs text-danger-ink">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
