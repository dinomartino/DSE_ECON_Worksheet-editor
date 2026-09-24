'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { LanguageMode, OutputMode, VersionMode, Worksheet } from '@/model/types';
import { DOCX_FILTERS, isDesktop, saveFile } from '@/platform';
import { Button, Segmented } from '@/components/ui';
import { Dialog, Field } from '@/components/ui/Dialog';
import { DownloadIcon } from '@/components/ui/icons';
import { versionLetters } from '@/model/versions';
import {
  deliverFiles,
  exportFileCount,
  exportKinds,
  type ExportChoice,
  type ExportFile,
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
}

/**
 * Build the chosen files. `@/export/docx` (OOXML builders + JSZip) is imported here, on
 * click, so no page load pays for it; a chunk that fails to load reports as an export
 * failure like any other.
 */
async function buildFiles(worksheet: Worksheet, choice: ExportChoice): Promise<ExportFile[]> {
  const docx = await import('@/export/docx');
  const files: ExportFile[] = [];
  for (const kind of exportKinds(choice.what)) {
    if (kind === 'paper') {
      for (const variant of choice.variants ?? [undefined]) {
        const mode: OutputMode = { language: choice.language, version: choice.version, variant };
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

const saveDocx = (file: ExportFile) => saveFile(file.blob, file.name, DOCX_FILTERS);

/** Hand what was written to the toolbar's status line; nothing written, nothing said. */
function report(saved: ExportRun['saved'], onExported: ExportDialogProps['onExported']): void {
  if (saved.length === 0) return;
  const message =
    saved.length > 1
      ? `Exported ${saved.length} files`
      : saved[0].file.kind === 'answerKey'
        ? 'Exported answer key'
        : 'Exported .docx';
  onExported(message, saved[saved.length - 1].path);
}

/**
 * Export: the question paper, a separate answer key, or both, in any language. Editor
 * chrome outside `#print-root`, so print CSS hides it from the PDF.
 */
export function ExportDialog({ worksheet, mode, onClose, onExported, checks }: ExportDialogProps) {
  const [what, setWhat] = useState<ExportWhat>('paper');
  const [language, setLanguage] = useState<LanguageMode>(mode.language);
  const [version, setVersion] = useState<VersionMode>(mode.version);
  // Paper versions (`Worksheet.versions`): every one by default, one file each.
  const letters = versionLetters(worksheet);
  const [variantChoice, setVariantChoice] = useState<string>('all');
  const variants =
    letters.length === 0 ? undefined : letters.includes(variantChoice) ? [variantChoice] : letters;
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
      finish(await deliverFiles(files, { desktop: isDesktop(), save: saveDocx }), before);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Export failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleExport = () =>
    void run(async () => ({
      files: await buildFiles(worksheet, { what, language, version, variants }),
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
      description="Word documents, in the language you choose."
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
          ) : (
            <Button variant="primary" onClick={handleExport} disabled={busy}>
              <DownloadIcon size={15} />
              {busy ? 'Exporting…' : fileCount > 1 ? `Export ${fileCount} files` : 'Export .docx'}
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
            <Field
              label="What"
              hint={
                what === 'both' && !isDesktop()
                  ? `${fileCount} files. Each downloads on its own click.`
                  : 'The answer key is a separate document: answer grid and marking scheme.'
              }
            >
              <Segmented
                label="What to export"
                value={what}
                onChange={setWhat}
                options={[
                  { value: 'paper', label: 'Question paper' },
                  { value: 'answerKey', label: 'Answer key' },
                  { value: 'both', label: 'Both' },
                ]}
              />
            </Field>

            <Field label="Language">
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
              inert={what === 'answerKey'}
              className={what === 'answerKey' ? 'opacity-40' : undefined}
            >
              <Field
                label="Paper version"
                hint={
                  what === 'answerKey'
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
                    hint="One file per version. The answer key covers them all."
                  >
                    <Segmented
                      label="Paper versions"
                      value={variants && variants.length === 1 ? variants[0] : 'all'}
                      onChange={setVariantChoice}
                      options={[
                        { value: 'all', label: 'All', title: `Versions ${letters.join(', ')}` },
                        ...letters.map((letter) => ({ value: letter, label: letter, title: `Version ${letter} only` })),
                      ]}
                    />
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
