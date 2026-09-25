'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { LanguageMode, OutputMode, VersionMode, Worksheet } from '@/model/types';
import { CSV_FILTERS, DOCX_FILTERS, isDesktop, saveFile, XLSX_FILTERS } from '@/platform';
import { downloadWorksheetFile } from '@/storage';
import { buildAppExport, type AppExport, type AppFormat } from '@/export/csv/answerKeyCsv';
import { Button, CheckField, Segmented } from '@/components/ui';
import { Dialog, Field } from '@/components/ui/Dialog';
import { DownloadIcon, PdfIcon } from '@/components/ui/icons';
import { versionLetters } from '@/model/versions';
import {
  deliverFiles,
  deliverWorksheetJson,
  exportFileCount,
  exportKinds,
  omittableParts,
  paperMode,
  pdfVariant,
  type ExportChoice,
  type ExportFile,
  type ExportFormat,
  type ExportRun,
  type ExportWhat,
} from './exportSession';

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
   */
  onPrint?: (mode: OutputMode) => void;
  /** The format the dialog opens on; `.docx` when absent. */
  initialFormat?: ExportFormat;
}

/**
 * Build the chosen files. `@/export/docx` (OOXML builders + JSZip) is imported here, on
 * click, so no page load pays for it; a chunk that fails to load reports as an export
 * failure like any other.
 */
async function buildFiles(worksheet: Worksheet, choice: ExportChoice): Promise<ExportFile[]> {
  if (choice.what === 'apps') {
    const built = buildAppExport(worksheet, choice.app ?? 'zipgrade', choice.language);
    return [{ kind: 'apps', name: built.fileName, blob: await appBlob(built) }];
  }
  const docx = await import('@/export/docx');
  const files: ExportFile[] = [];
  for (const kind of exportKinds(choice.what)) {
    if (kind === 'paper') {
      for (const variant of choice.variants ?? [undefined]) {
        const mode: OutputMode = { ...paperMode(choice), ...(variant ? { variant } : {}) };
        files.push({
          kind,
          name: docx.docxFileName(worksheet, mode),
          blob: await docx.exportDocx(worksheet, mode),
          ...(variant ? { variant } : {}),
        });
      }
    } else {
      files.push({
        kind,
        name: docx.answerKeyFileName(worksheet, choice.language),
        blob: await docx.exportAnswerKeyDocx(worksheet, choice.language),
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

const saveExport = (file: ExportFile) =>
  saveFile(
    file.blob,
    file.name,
    file.name.endsWith('.csv') ? CSV_FILTERS : file.name.endsWith('.xlsx') ? XLSX_FILTERS : DOCX_FILTERS,
  );

const FORMAT_OPTIONS: Array<{ value: ExportFormat; label: string; title: string; hint: string }> = [
  {
    value: 'docx',
    label: '.docx',
    title: 'Word document',
    hint: 'Word, to keep editing. Other apps writes a CSV or spreadsheet instead.',
  },
  {
    value: 'pdf',
    label: 'PDF',
    title: 'Print, or Save as PDF',
    hint: 'Prints the sheets as they look here; pick Save as PDF in the print dialog.',
  },
  {
    value: 'json',
    label: '.json',
    title: 'The worksheet file, to open again in this app',
    hint: 'The worksheet itself, to open again here. The options below do not apply.',
  },
];

const APP_OPTIONS: Array<{ value: AppFormat; label: string; title: string; hint: string }> = [
  { value: 'zipgrade', label: 'ZipGrade', title: 'ZipGrade answer-key CSV', hint: 'MCQ key for ZipGrade: Import Key CSV.' },
  { value: 'keyCsv', label: 'Key CSV', title: 'Question, Answer CSV', hint: 'MCQ number and letter, for Excel or any scanner.' },
  { value: 'kahoot', label: 'Kahoot', title: 'Kahoot spreadsheet (.xlsx)', hint: 'MCQs as a Kahoot quiz: Import spreadsheet.' },
  { value: 'blooket', label: 'Blooket', title: 'Blooket CSV import', hint: 'MCQs as a Blooket set: CSV Import.' },
];

/** Warnings shown before the cut: the rest is a count. */
const WARNINGS_SHOWN = 4;

/** Hand what was written to the toolbar's status line; nothing written, nothing said. */
function report(saved: ExportRun['saved'], onExported: ExportDialogProps['onExported']): void {
  if (saved.length === 0) return;
  const message =
    saved.length > 1
      ? `Exported ${saved.length} files`
      : saved[0].file.kind === 'answerKey'
        ? 'Exported answer key'
        : saved[0].file.kind === 'apps'
          ? `Exported .${saved[0].file.name.split('.').pop()}`
          : 'Exported .docx';
  onExported(message, saved[saved.length - 1].path);
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
}: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>(initialFormat);
  const [chosenWhat, setWhat] = useState<ExportWhat>('paper');
  // PDF prints what is on the page, and only the question paper is; the choice is kept
  // for when the format goes back to .docx.
  const what: ExportWhat = format === 'pdf' ? 'paper' : chosenWhat;
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
  // Paper versions (`Worksheet.versions`): every one by default, one file each.
  const letters = versionLetters(worksheet);
  const [variantChoice, setVariantChoice] = useState<string>('all');
  const variants =
    letters.length === 0 ? undefined : letters.includes(variantChoice) ? [variantChoice] : letters;
  // A print is one version: "All" falls back to the one the editor shows.
  const printVariant = pdfVariant(letters, variantChoice, mode.variant);
  const fileCount = exportFileCount({ what, variants });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
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

  const finish = (run: ExportRun, before: ExportRun['saved']) => {
    const saved = [...before, ...run.saved];
    if (run.pending.length > 0) {
      setWaiting({ pending: run.pending, saved });
      return;
    }
    // A cancelled first sheet wrote nothing; the dialog stays for another try.
    if (saved.length === 0) return;
    report(saved, onExported);
    onClose();
  };

  const run = async (produce: () => Promise<{ files: ExportFile[]; before: ExportRun['saved'] }>) => {
    setBusy(true);
    setError(undefined);
    try {
      const { files, before } = await produce();
      finish(await deliverFiles(files, { desktop: isDesktop(), save: saveExport }), before);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Export failed.');
    } finally {
      setBusy(false);
    }
  };

  // Closed first, so the dialog is gone from the page before anything is printed.
  const handlePrint = () => {
    const printMode: OutputMode = {
      ...paperMode({ what: 'paper', language, version, includeCover, includeAnswerSpace }),
      ...(printVariant && printVariant !== letters[0] ? { variant: printVariant } : {}),
    };
    callbacks.current.onClose();
    onPrint?.(printMode);
  };

  // The document file: nothing to choose, one save. A cancelled sheet keeps the dialog.
  const handleJson = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const saved = await deliverWorksheetJson({
        desktop: isDesktop(),
        save: () => downloadWorksheetFile(worksheet),
      });
      if (!saved) return;
      onExported(saved.message, saved.path);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Export failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleExport = () =>
    void run(async () => ({
      files: await buildFiles(worksheet, {
        what,
        language,
        version,
        includeCover,
        includeAnswerSpace,
        app,
        variants,
      }),
      before: [],
    }));

  // A fresh click, and the file is already built: nothing stands between it and the download.
  const handleNext = () => {
    if (!waiting) return;
    const { pending, saved } = waiting;
    setWaiting(undefined);
    void run(async () => ({ files: pending, before: saved }));
  };

  const next = waiting?.pending[0];

  return (
    <Dialog
      title="Export"
      description="A Word document, a PDF, or the worksheet file itself."
      width={480}
      onClose={close}
      footer={
        <>
          <Button variant="subtle" onClick={close}>
            {waiting ? 'Skip' : 'Cancel'}
          </Button>
          {next ? (
            <Button variant="primary" onClick={handleNext} disabled={busy}>
              <DownloadIcon size={15} />
              {next.kind === 'answerKey'
                ? 'Download answer key'
                : next.variant
                  ? `Download version ${next.variant}`
                  : 'Download question paper'}
            </Button>
          ) : pdf ? (
            <Button variant="primary" onClick={handlePrint} disabled={!onPrint}>
              <PdfIcon size={15} />
              Print to PDF…
            </Button>
          ) : json ? (
            <Button variant="primary" onClick={() => void handleJson()} disabled={busy}>
              <DownloadIcon size={15} />
              {busy ? 'Exporting…' : 'Export .json'}
            </Button>
          ) : (
            <Button variant="primary" onClick={handleExport} disabled={busy || appExport?.empty}>
              <DownloadIcon size={15} />
              {busy
                ? 'Exporting…'
                : appExport
                  ? `Export .${appExport.fileName.split('.').pop()}`
                  : fileCount > 1
                    ? `Export ${fileCount} files`
                    : 'Export .docx'}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-5 px-5 py-5">
        {checks}

        {waiting ? (
          <p role="status" className="text-[13px] leading-relaxed text-ink-subtle">
            {waiting.saved.length === 1 && waiting.saved[0].file.kind === 'paper'
              ? 'The question paper has downloaded.'
              : 'The first file has downloaded.'}{' '}
            Browsers allow one download per click, so the next file waits for yours.
          </p>
        ) : (
          <>
            <Field label="Format" hint={FORMAT_OPTIONS.find((option) => option.value === format)?.hint}>
              <Segmented label="Format" value={format} onChange={setFormat} options={FORMAT_OPTIONS} />
            </Field>

            {/* Greyed in place rather than hidden, so switching format does not move the
                dialog; each field's hint says why. */}
            <div inert={json} className={json ? 'space-y-5 opacity-40' : 'space-y-5'}>
              <Field
                label="What"
                hint={
                  pdf
                    ? 'PDF prints the question paper only; the others export under .docx.'
                    : what === 'both' && !isDesktop()
                      ? `${fileCount} files. Each downloads on its own click.`
                      : what === 'apps'
                        ? 'The MCQs, for a bubble-sheet scanner or a quiz game.'
                        : 'The answer key is a separate document: answer grid and marking scheme.'
                }
              >
                <Segmented
                  label="What to export"
                  value={what}
                  onChange={setWhat}
                  options={[
                    { value: 'paper', label: 'Question paper' },
                    ...(
                      [
                        { value: 'answerKey', label: 'Answer key' },
                        { value: 'both', label: 'Both' },
                        { value: 'apps', label: 'Other apps', title: 'Answer-key CSV, Kahoot or Blooket' },
                      ] as const
                    ).map((option) =>
                      pdf
                        ? { ...option, disabled: true, title: 'Not as PDF: export it as .docx' }
                        : option,
                    ),
                  ]}
                />
              </Field>

              {appExport && (
                <Field label="App" hint={APP_OPTIONS.find((option) => option.value === app)?.hint}>
                  <Segmented label="App" value={app} onChange={setApp} options={APP_OPTIONS} />
                  {(appExport.empty || appExport.warnings.length > 0) && (
                    <ul role="status" className="space-y-1 rounded-lg bg-warn-soft px-2.5 py-2 text-xs text-warn-ink">
                      {appExport.empty ? (
                        <li>No multiple-choice questions to export.</li>
                      ) : (
                        <>
                          {appExport.warnings.slice(0, WARNINGS_SHOWN).map((warning) => (
                            <li key={warning}>{warning}</li>
                          ))}
                          {appExport.warnings.length > WARNINGS_SHOWN && (
                            <li>And {appExport.warnings.length - WARNINGS_SHOWN} more.</li>
                          )}
                        </>
                      )}
                    </ul>
                  )}
                </Field>
              )}

              <Field
                label="Language"
                hint={pdf ? 'The page switches to this language and version, then prints.' : undefined}
              >
                <Segmented
                  label="Language"
                  value={language}
                  onChange={setLanguage}
                  options={[
                    { value: 'en', label: 'EN', title: 'English only' },
                    { value: 'zh', label: '中文', title: '中文 only' },
                    { value: 'bilingual', label: 'EN+中', title: 'Bilingual' },
                  ]}
                />
              </Field>

              {/* Kept in place when unused, so switching "What" does not move the dialog. */}
              <div
                inert={keyOnly}
                className={keyOnly ? 'opacity-40' : undefined}
              >
                <Field
                  label="Paper version"
                  hint={
                    keyOnly
                      ? 'Applies to the question paper only.'
                      : 'Teacher shows the answers inline.'
                  }
                >
                  <Segmented
                    label="Paper version"
                    value={version}
                    onChange={setVersion}
                    options={[
                      { value: 'student', label: 'Student', title: 'Student version — answers hidden' },
                      { value: 'teacher', label: 'Teacher', title: 'Teacher version / 教師版 — answers shown' },
                    ]}
                  />
                </Field>
                {letters.length > 0 && (
                  <div className="mt-5">
                    <Field
                      label="Paper versions"
                      hint={
                        pdf
                          ? 'PDF prints one version at a time.'
                          : 'One file per version. The answer key covers them all.'
                      }
                    >
                      <Segmented
                        label="Paper versions"
                        value={pdf ? (printVariant ?? 'all') : variants && variants.length === 1 ? variants[0] : 'all'}
                        onChange={setVariantChoice}
                        options={[
                          {
                            value: 'all',
                            label: 'All',
                            title: pdf ? 'PDF prints one version at a time' : `Versions ${letters.join(', ')}`,
                            disabled: pdf,
                          },
                          ...letters.map((letter) => ({ value: letter, label: letter, title: `Version ${letter} only` })),
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
                  className={keyOnly ? 'opacity-40' : undefined}
                >
                  <Field
                    label="Include"
                    hint={
                      pdf
                        ? 'Untick to leave it out of this print; the page gets it back after.'
                        : 'Untick to leave it out of the question paper.'
                    }
                  >
                    <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                      {omittable.cover && (
                        <CheckField label="Cover page" checked={includeCover} onChange={setIncludeCover} />
                      )}
                      {omittable.answerSpace && (
                        <CheckField
                          label="Answer space"
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

        {error && (
          <p role="alert" className="rounded-lg bg-danger-soft px-2.5 py-1.5 text-xs text-danger-ink">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
