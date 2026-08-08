'use client';

import { useState } from 'react';
import { copyForWord, worksheetClipboardHtml, worksheetPlainText } from '@/export/clipboard';
import { renderDiagramImages } from '@/export/diagramImage';
import { worksheetMarks } from '@/model/marks';
import { pageSetupOf } from '@/model/page';
import type { LanguageMode, VersionMode } from '@/model/types';
import { requireQuestionType } from '@/registry';
import { useWorksheetStore } from '@/store/worksheetStore';
import { downloadWorksheetFile, triggerDownload, worksheetStore } from '@/storage';
import { Button, IconButton, Pill, Segmented } from '@/components/ui';
import { DownloadIcon, PdfIcon, RedoIcon, SettingsIcon, UndoIcon } from '@/components/ui/icons';
import { Menu } from '@/components/ui/Menu';
import { Dialog } from '@/components/ui/Dialog';
import { DocumentName } from './DocumentName';

/**
 * Output controls, export actions and persistence (§5.4, §6, §7).
 *
 * Grouped by what the control is *for* — what the document says (language/version),
 * then what to do with it (export). Previously nine buttons of identical weight sat
 * in two rows, so "Export .docx" was as easy to miss as "Open .json"; export is the
 * point of the app and is now the only filled button on screen.
 */
export function Toolbar({
  onOpenSettings,
  onOpenFiles,
}: {
  onOpenSettings: () => void;
  /** Show the start screen: the saved-worksheet list, and the new-document form. */
  onOpenFiles: () => void;
}) {
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const mode = useWorksheetStore((s) => s.mode);
  const setMode = useWorksheetStore((s) => s.setMode);
  const undo = useWorksheetStore((s) => s.undo);
  const redo = useWorksheetStore((s) => s.redo);
  const past = useWorksheetStore((s) => s.past);
  const future = useWorksheetStore((s) => s.future);
  const dirty = useWorksheetStore((s) => s.dirty);
  const lastSavedAt = useWorksheetStore((s) => s.lastSavedAt);
  const save = useWorksheetStore((s) => s.save);
  const select = useWorksheetStore((s) => s.select);
  const printPreview = useWorksheetStore((s) => s.printPreview);
  const setPrintPreview = useWorksheetStore((s) => s.setPrintPreview);

  const [busy, setBusy] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const [confirmingClear, setConfirmingClear] = useState(false);

  // Only meaningful in bilingual mode, where a missing side affects the output (§5.2).
  const untranslated =
    mode.language !== 'bilingual'
      ? 0
      : worksheet.questions.reduce((sum, question) => {
          const definition = requireQuestionType(question);
          return sum + (definition.countMissingTranslations?.(question) ?? 0);
        }, 0);

  const flash = (message: string) => {
    setNotice(message);
    setTimeout(() => setNotice((current) => (current === message ? undefined : current)), 2400);
  };

  /**
   * Export as .docx, with the writer fetched on demand.
   *
   * `@/export/docx` is the heaviest thing this app can reach: the OOXML builders plus
   * JSZip, which alone is ~100 KB of the main chunk. None of it runs until this button
   * is pressed, and a teacher opening the editor to type a question never presses it —
   * so a static import made every page load pay for the deflate implementation before
   * the first paint. Importing it here moves the whole subtree into its own chunk that
   * is fetched during the click, behind the `busy` spinner this handler already shows.
   *
   * The import sits inside the `try` deliberately: a chunk that fails to load (offline,
   * a stale deployment) is an export failure like any other and belongs in the same
   * error message rather than as an unhandled rejection.
   */
  const handleExport = async () => {
    setBusy('export');
    setError(undefined);
    try {
      const { docxFileName, exportDocx } = await import('@/export/docx');
      const blob = await exportDocx(worksheet, mode);
      triggerDownload(blob, docxFileName(worksheet, mode));
      flash('Exported .docx');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Export failed.');
    } finally {
      setBusy(undefined);
    }
  };

  const handleCopy = async () => {
    setBusy('copy');
    setError(undefined);
    try {
      // Diagrams are rasterized first so each one pastes into Word as a single image.
      const diagramImages = await renderDiagramImages(worksheet, mode);
      await copyForWord(
        worksheetClipboardHtml(worksheet, mode, diagramImages),
        worksheetPlainText(worksheet, mode),
      );
      flash('Copied — paste into Word');
    } catch {
      setError('Copy failed — the browser blocked clipboard access.');
    } finally {
      setBusy(undefined);
    }
  };

  /**
   * Export as PDF.
   *
   * There is no server to render on, so this drives the browser's own print engine —
   * whose "Save as PDF" destination every desktop platform provides — over the real
   * paginated sheets in the preview. The PDF is therefore produced from exactly what
   * is on screen and cannot drift from it, which a separate PDF renderer would.
   *
   * The `@page` box is written from the worksheet's own page setup first: without it
   * the browser prints at whatever the user last chose, and an A4 worksheet would
   * silently come out scaled onto Letter.
   */
  const handlePdf = () => {
    const setup = pageSetupOf(worksheet);
    const root = document.documentElement;
    // CSS `size` takes the paper name directly; our PaperSize values are already the
    // CSS keywords (A4/A3/Letter/Legal).
    root.style.setProperty('--print-size', setup.paper);
    root.style.setProperty('--print-orientation', setup.orientation);
    // Deselect first, so an in-progress selection ring is not captured in the output.
    select(undefined);
    // After the deselect has painted.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => window.print());
    });
  };

  /**
   * Forget every saved document and start over.
   *
   * A worksheet lives in `localStorage`, not in the build — which is what makes one
   * survive a dev-server restart. That is the intended behaviour and also the only way
   * to get genuinely clean state when a stored document is the thing being debugged.
   *
   * Irreversible, and there is no server-side copy, so it is confirmed rather than
   * offered as a plain menu item, and the dialog points at "Download .json" as the way
   * to keep a copy first.
   *
   * It ends on the **start screen**, not on a fresh blank document: having just emptied
   * the list, dropping the teacher into an untitled worksheet would put them straight
   * back into a document they did not ask to start, with no sign the clear had done
   * anything. The empty list is the honest result.
   */
  const handleClearAll = async () => {
    setConfirmingClear(false);
    setError(undefined);
    try {
      await worksheetStore.clear();
      onOpenFiles();
    } catch {
      setError('Could not clear saved documents.');
    }
  };

  return (
    <div className="zone-dark border-b border-line bg-surface px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* Identity gets a mark, not just a word. A tool with a face on it reads as a
            product; a bare bold string reads as a page heading.

            The mark carries the app; the word beside it names the *document*. Printing
            the app's own name there spent the most prominent slot on the one fact a
            teacher already knows, while the document's name — which the `.docx`
            downloads as, and which is all that distinguishes one mock paper from the
            next — appeared nowhere in the editor. */}
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            title="Worksheet — HKDSE Economics"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent text-[13px] font-bold text-on-accent"
          >
            W
          </span>
          <DocumentName />
        </span>

        <span className="h-6 w-px bg-line" />

        <Segmented
          label="Language"
          value={mode.language}
          onChange={(language) => setMode({ language: language as LanguageMode })}
          options={[
            { value: 'en', label: 'EN', title: 'English only' },
            { value: 'zh', label: '中文', title: '中文 only' },
            { value: 'bilingual', label: 'EN+中', title: 'Bilingual' },
          ]}
        />

        <Segmented
          label="Version"
          value={mode.version}
          onChange={(version) => setMode({ version: version as VersionMode })}
          options={[
            { value: 'student', label: 'Student', title: 'Student version — answers hidden' },
            { value: 'teacher', label: 'Teacher', title: 'Teacher version / 教師版 — answers shown' },
          ]}
        />

        {/*
          Edit or look. A switch rather than a button because the two states are equal
          and permanent: a button has to label the *other* state ("Preview" while
          editing, "Editing" while previewing), which reads as an instruction and leaves
          the current mode unnamed. A segmented control names both and shows which one
          you are in — the same reason Language and Version use it, and why this sits
          with them among the view controls rather than beside the export actions.
        */}
        <Segmented
          label="Page mode"
          value={printPreview ? 'preview' : 'edit'}
          onChange={(next) => setPrintPreview(next === 'preview')}
          options={[
            { value: 'edit', label: 'Edit', title: 'Edit the worksheet on the page' },
            {
              value: 'preview',
              label: 'Preview',
              title: 'See the sheets exactly as they will print (Esc to leave)',
            },
          ]}
        />

        <span className="h-6 w-px bg-line" />

        <span className="flex items-center gap-0.5">
          <IconButton label="Undo (⌘Z)" size="md" onClick={undo} disabled={past.length === 0}>
            <UndoIcon />
          </IconButton>
          <IconButton label="Redo (⇧⌘Z)" size="md" onClick={redo} disabled={future.length === 0}>
            <RedoIcon />
          </IconButton>
        </span>

        {/* Page setup, title, header and footer. On the bar rather than in the sidebar
            because they are decisions about the document as a whole, made once — the
            sidebar is for the content being worked on now. */}
        <Button variant="subtle" onClick={onOpenSettings} title="Title, paper, margins, header and footer">
          <SettingsIcon size={15} />
          <span className="hidden md:inline">Setup</span>
        </Button>

        {/* Status sits with the document, not with the actions. */}
        <span className="ml-auto flex items-center gap-2 text-[11px] text-ink-muted">
          {notice && <span className="font-medium text-ok">{notice}</span>}
          {untranslated > 0 && <Pill tone="warn">{untranslated} untranslated</Pill>}
          <Pill tone="accent">{worksheetMarks(worksheet)} marks</Pill>
          <span className="hidden sm:inline">
            {dirty
              ? 'Unsaved…'
              : lastSavedAt
                ? `Saved ${new Date(lastSavedAt).toLocaleTimeString()}`
                : 'Saved'}
          </span>
        </span>

        {/* The two outputs a teacher actually hands in: .docx to keep editing in Word,
            PDF to print or send. Both are on the bar; .docx stays the filled button
            because it is the one that preserves editability. */}
        <Button onClick={handlePdf} title="Print or save as PDF (⌘P)">
          <PdfIcon size={15} />
          PDF
        </Button>

        <Button variant="primary" onClick={handleExport} disabled={busy === 'export'}>
          <DownloadIcon size={15} />
          {busy === 'export' ? 'Exporting…' : 'Export .docx'}
        </Button>

        <Menu
          label="File and export options"
          items={[
            { label: busy === 'copy' ? 'Copying…' : 'Copy for Word', onSelect: () => void handleCopy() },
            /*
             * One door to every document, rather than "New" and "Open" as separate
             * items that each did half the job. The start screen lists what is saved and
             * offers the new-document form, so both intentions arrive at the same place —
             * and "New" no longer silently archives the document on screen by being the
             * only way to leave it (the old menu had no way *back* to what it replaced).
             */
            { label: 'Worksheets…', onSelect: onOpenFiles, separated: true },
            { label: 'Save now', onSelect: () => void save() },
            { label: 'Download .json', onSelect: () => downloadWorksheetFile(worksheet) },
            {
              label: 'Clear saved documents…',
              onSelect: () => setConfirmingClear(true),
              danger: true,
              separated: true,
            },
          ]}
        />

      </div>

      {error && (
        <p
          role="alert"
          className="mt-2 rounded-lg bg-danger-soft px-2.5 py-1.5 text-xs text-danger-ink"
        >
          {error}
        </p>
      )}

      {/* Confirmed rather than immediate: this is the one action in the app that
          destroys work with no undo and no copy anywhere else. The dialog says how many
          documents are at stake and offers the download first, because "save a copy"
          is the thing a teacher wants the moment they read the warning. */}
      {confirmingClear && (
        <Dialog
          title="Clear saved documents?"
          description="Every worksheet saved in this browser will be deleted. This cannot be undone — nothing is stored on a server."
          width={460}
          onClose={() => setConfirmingClear(false)}
          footer={
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="subtle"
                onClick={() => {
                  downloadWorksheetFile(worksheet);
                  flash('Downloaded a copy');
                }}
              >
                Download this one first
              </Button>
              <Button variant="subtle" onClick={() => setConfirmingClear(false)}>
                Cancel
              </Button>
              {/* Filled, not the `danger` variant. That one is deliberately quiet — it
                  recedes until hovered, which is right for a row's ✕ but wrong here:
                  this is the confirming action of a destructive dialog and has to read
                  as destructive *at rest*, or it looks like the same weight as Cancel. */}
              <button
                type="button"
                onClick={() => void handleClearAll()}
                className="inline-flex h-[34px] items-center justify-center rounded-lg border border-transparent bg-danger px-3 text-[13px] font-medium text-white shadow-sm transition-colors hover:brightness-95 active:scale-[0.97]"
              >
                Clear everything
              </button>
            </div>
          }
        >
          <p className="text-[13px] leading-relaxed text-ink-subtle">
            Every worksheet on the start screen lives in this browser, not in the code,
            which is why your work comes back after a restart. Clearing empties that list
            and returns you to it.
          </p>
        </Dialog>
      )}
    </div>
  );
}
