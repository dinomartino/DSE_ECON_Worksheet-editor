'use client';

import { useCallback, useEffect, useState } from 'react';
import { copyForWord, worksheetClipboardHtml, worksheetPlainText } from '@/export/clipboard';
import { renderDiagramImages } from '@/export/diagramImage';
import type { LanguageMode, OutputMode, VersionMode } from '@/model/types';
import { useWorksheetStore } from '@/store/worksheetStore';
import { downloadWorksheetFile } from '@/storage';
import { isDesktop, revealFile, revealLabel } from '@/platform';
import { Button, IconButton, Segmented } from '@/components/ui';
import { ChevronRightIcon, DownloadIcon, PageSetupIcon, RedoIcon, SettingsIcon, UndoIcon } from '@/components/ui/icons';
import { Menu } from '@/components/ui/Menu';
import { Dialog } from '@/components/ui/Dialog';
import { AppMark } from '@/components/ui/AppMark';
import { DocumentName } from './DocumentName';
import { ExportDialog } from './ExportDialog';
import { browserPrintDeps, printWorksheetPdf } from './printPdf';
import { useUpdateStore } from '@/desktop/updateStore';
import { PaperHealthPanel } from './PaperHealthPanel';
import { PaperSummaryBar } from './PaperSummaryBar';
import { hasCoverSheet } from './sheets';
import { FeedbackDialog } from '@/components/feedback/FeedbackDialog';
import { WhatsNewDialog } from '@/components/whatsNew/WhatsNewDialog';
import { describeDocument } from '@/feedback/feedback';
import { useAppDialogs, type NoticeAction } from '@/store/appDialogs';
import { useSettingsSections } from '@/settings/sections';
import { fillVerbFor, toolbarSettingsEntries } from '@/components/translate/translateMenu';
import { openAi } from '@/assist/menuStore';
import { collectTexts } from '@/model/textWalk';
import { AiButton } from '@/components/ai/AiButton';

/** A transient status line, optionally with one follow-up action. */
type Notice = { message: string; action?: NoticeAction };

/** An action (desktop "Show in Finder", Undo) stays long enough to be reached. */
function showNotice(
  set: (update: (current: Notice | undefined) => Notice | undefined) => void,
  message: string,
  action?: Notice['action'],
) {
  const next: Notice = { message, action };
  set(() => next);
  setTimeout(() => set((current) => (current === next ? undefined : current)), action ? 8000 : 2400);
}

/**
 * `[mark] Worksheets › name`: the mark and word are one button home to the start screen.
 * Below 1440px the word and chevron fold away, so the crumb adds no width at laptop
 * sizes; the mark keeps the name. The ⋯ menu's "Worksheets…" stays as the second route.
 */
export function HomeCrumb({ onOpenFiles }: { onOpenFiles: () => void }) {
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1">
      <button
        type="button"
        aria-label="All worksheets"
        title="All worksheets"
        onClick={onOpenFiles}
        className="flex shrink-0 cursor-pointer items-center gap-2 rounded-md p-1 text-[13px] font-medium text-ink-muted transition-[background-color,color,scale] duration-150 ease-out-soft hover:bg-surface-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent active:scale-[0.97] min-[1440px]:pr-2"
      >
        {/* The app's own face, shared with the browser tab (`src/app/icon.svg`). */}
        <span className="flex text-ink">
          <AppMark size={22} />
        </span>
        <span className="hidden min-[1440px]:inline">Worksheets</span>
      </button>
      <ChevronRightIcon size={13} className="hidden shrink-0 text-ink-subtle min-[1440px]:block" />
      <DocumentName />
    </nav>
  );
}

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
  onClearAll,
  bodySheets,
}: {
  onOpenSettings: () => void;
  /** Sheets the preview paginated the body into, cover excluded; 0 = not yet measured. */
  bodySheets?: number;
  /** Show the start screen: the saved-worksheet list, and the new-document form. */
  onOpenFiles: () => void;
  /** Delete every saved document, this one included, and show the (empty) start screen. */
  onClearAll: () => Promise<void>;
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
  const readOnly = useWorksheetStore((s) => s.readOnly);

  const [busy, setBusy] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<Notice | undefined>();
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [exporting, setExporting] = useState(false);
  // Stable, so the dialog does not re-focus its panel on every store update.
  const closeExport = useCallback(() => setExporting(false), []);
  const [feedback, setFeedback] = useState(false);
  const closeFeedback = useCallback(() => setFeedback(false), []);
  const [whatsNew, setWhatsNew] = useState(false);
  const closeWhatsNew = useCallback(() => setWhatsNew(false), []);

  const saveStatus = readOnly ? 'Read-only' : dirty ? 'Unsaved…' : 'Saved';

  const flash = (message: string, action?: Notice['action']) => showNotice(setNotice, message, action);

  const appVersion = useUpdateStore((s) => s.current);

  // Settings opens through the one app-dialog store (never stacked); it and BiTextField
  // report back through it, so every status line shares this flash.
  useEffect(
    () =>
      useAppDialogs.subscribe((state, prev) => {
        if (state.notice && state.notice !== prev.notice) showNotice(setNotice, state.notice.message, state.notice.action);
      }),
    [],
  );
  // An action tied to one commit (Undo) goes as soon as history moves past it.
  useEffect(
    () =>
      useWorksheetStore.subscribe((state, prev) => {
        if (state.worksheet === prev.worksheet) return;
        setNotice((current) => (current?.action?.live && !current.action.live() ? undefined : current));
      }),
    [],
  );
  const runNotice = (action: NoticeAction) => {
    setNotice(undefined);
    action.run();
  };
  /** Export is a component-owned dialog: it closes before the AI menu opens. */
  const aiFromExport = (finding: 'untranslated' | 'terminology') => {
    setExporting(false);
    const preselect = finding === 'terminology' ? 'check.terms' : fillVerbFor(collectTexts(worksheet), mode.language);
    openAi({ scope: { kind: 'paper' }, preselect });
  };
  const desktop = isDesktop();
  const hasSettings = useSettingsSections({ desktop }).length > 0;
  const settingsItems = toolbarSettingsEntries({
    hasSettings,
    settingsHint: desktop ? (/Mac/.test(navigator.platform) ? '⌘,' : 'Ctrl+,') : undefined,
  }).map((entry) => ({
    ...entry,
    icon: <SettingsIcon size={15} />,
    onSelect: () => useAppDialogs.getState().openSettings(),
  }));

  /** A ready update surfaces in the banner; every other outcome is said here. */
  const handleCheckUpdates = async () => {
    const status = await useUpdateStore.getState().check();
    const found = useUpdateStore.getState().available;
    if (status === 'current') flash(`You have the latest version${appVersion ? ` (${appVersion})` : ''}`);
    else if (status === 'failed') flash('Could not check for updates — are you online?');
    else if (status === 'downloading') flash(`Downloading version ${found} — you will be told when it is ready`);
  };

  /** Desktop only: a saved file's path becomes a one-click reveal. */
  const revealAction = (path: string | undefined): Notice['action'] =>
    path === undefined
      ? undefined
      : { label: revealLabel(), run: () => void revealFile(path).catch(() => undefined) };

  const handleDownloadJson = async (message?: string) => {
    try {
      const path = await downloadWorksheetFile(worksheet);
      // A cancelled desktop sheet wrote nothing, so there is nothing to report.
      if (path === undefined && isDesktop()) return;
      if (message) flash(message, revealAction(path));
      else if (path !== undefined) flash('Saved a copy', revealAction(path));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Download failed.');
    }
  };

  /** The Export dialog wrote its files; it reports here so the status line and reveal match. */
  const handleExported = (message: string, path?: string) => {
    setError(undefined);
    flash(message, revealAction(path));
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
   * PDF, from the Export dialog once it has closed.
   *
   * There is no server to render on, so this drives the engine's own print — whose
   * "Save as PDF" destination every desktop platform provides — over the real paginated
   * sheets. The PDF is produced from exactly what is on screen and cannot drift from
   * it, which a separate PDF renderer would. `printWorksheetPdf` sets the `@page` box
   * and the print mode first.
   *
   * Desktop hands over the `file` its save sheet chose: the page is printed straight
   * to it and reported like a `.docx`, with the reveal. Should that fail, the print
   * sheet opens instead and the status line says why.
   */
  const handlePrint = (printMode: OutputMode, file?: string) => {
    setError(undefined);
    const deps = browserPrintDeps(setMode, () => select(undefined));
    printWorksheetPdf(worksheet, printMode, deps, file)
      .then((outcome) => {
        if ('saved' in outcome) flash('Exported .pdf', revealAction(outcome.saved));
        else if (outcome.fallback !== undefined) {
          // Kept (not flashed): the sheet is modal and would outlast a transient line.
          setError(
            `Could not save the PDF directly (${outcome.fallback}), so the print dialog opened — choose Save as PDF there.`,
          );
        }
      })
      .catch((cause: unknown) =>
        setError(`Could not open the print dialog: ${cause instanceof Error ? cause.message : String(cause)}`),
      );
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
   * anything. The empty list is the honest result. Not through `onOpenFiles`: that
   * leave saves unsaved edits, which would put the open document straight back.
   */
  const handleClearAll = async () => {
    setConfirmingClear(false);
    setError(undefined);
    try {
      await onClearAll();
    } catch {
      setError('Could not clear saved documents.');
    }
  };

  return (
    <div className="zone-dark relative border-b border-line bg-surface px-4 py-2.5">
      {/* One row from `lg` up: nothing wraps, so the document name is the one thing that
          gives — it truncates (full name in its tooltip). Below `lg` the row may wrap. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 whitespace-nowrap lg:flex-nowrap xl:gap-x-3">
        {/* The mark carries the app and the way home; the name beside it is the
            *document's* — what the `.docx` downloads as. */}
        <HomeCrumb onOpenFiles={onOpenFiles} />

        <span className="h-6 w-px shrink-0 bg-line" />

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

        <span className="h-5 w-px shrink-0 bg-line" />

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
        <span className="h-5 w-px shrink-0 bg-line" />

        <Segmented
          label="Page mode"
          value={printPreview ? 'preview' : 'edit'}
          onChange={(next) => setPrintPreview(next === 'preview')}
          options={[
            {
              value: 'edit',
              label: 'Edit',
              title: readOnly
                ? 'Read-only: saved by a newer version of Econ Worksheet'
                : 'Edit the worksheet on the page',
              disabled: readOnly,
            },
            {
              value: 'preview',
              label: 'Preview',
              title: 'See the sheets exactly as they will print (Esc to leave)',
            },
          ]}
        />

        <span className="h-6 w-px shrink-0 bg-line" />

        <span className="flex shrink-0 items-center gap-0.5">
          <IconButton label="Undo (⌘Z)" size="md" onClick={undo} disabled={past.length === 0}>
            <UndoIcon />
          </IconButton>
          <IconButton label="Redo (⇧⌘Z)" size="md" onClick={redo} disabled={future.length === 0}>
            <RedoIcon />
          </IconButton>
        </span>

        {/* Page setup, title, header and footer. On the bar rather than in the sidebar
            because they are decisions about the document as a whole, made once — the
            sidebar is for the content being worked on now. Icon-only below `xl`. */}
        <Button
          variant="subtle"
          onClick={onOpenSettings}
          disabled={readOnly}
          aria-label="Setup"
          title="Setup: title, paper, margins, header and footer"
        >
          <PageSetupIcon size={15} />
          <span className="hidden xl:inline">Setup</span>
        </Button>

        {/* Status sits with the document, not with the actions. */}
        <span className="ml-auto flex shrink-0 items-center gap-2 text-[11px] text-ink-muted">
          {/* Status, not selection: the summary is facts about the document, so it
              stays in the grey family — the accent is reserved for interaction. */}
          <PaperSummaryBar
            worksheet={worksheet}
            language={mode.language}
            pages={bodySheets ? bodySheets + (hasCoverSheet(worksheet, mode) ? 1 : 0) : undefined}
            onOpen={readOnly ? undefined : onOpenSettings}
          />
          {/* The time lives in the tooltip: a clock string beside the pill wrapped the row.
              Below `xl` the word becomes a dot, the word moving to the tooltip. */}
          <span
            className="flex items-center"
            title={
              !readOnly && !dirty && lastSavedAt
                ? `Saved at ${new Date(lastSavedAt).toLocaleTimeString()}`
                : saveStatus
            }
          >
            <span aria-hidden className="flex h-5 w-3 items-center justify-center xl:hidden">
              <span className={`size-1.5 rounded-full ${dirty || readOnly ? 'bg-ink-subtle' : 'bg-ok'}`} />
            </span>
            <span className="sr-only xl:not-sr-only">{saveStatus}</span>
          </span>
        </span>

        {/* Every AI tool behind one door (⌘J); the untranslated count rides on it. */}
        <AiButton />

        {/* One Export action, the bar's only filled button: .docx to keep editing, PDF to
            print or send, .json to keep the worksheet itself. The format is chosen
            inside, beside what it applies to, rather than as look-alike buttons here. */}
        <Button variant="primary" onClick={() => setExporting(true)} title="Word, PDF or the worksheet file">
          <DownloadIcon size={15} />
          Export…
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
            ...(readOnly ? [] : [{ label: 'Save now', onSelect: () => void save() }]),
            ...(isDesktop()
              ? [
                  {
                    label: 'Check for updates',
                    hint: appVersion ? `v${appVersion}` : undefined,
                    onSelect: () => void handleCheckUpdates(),
                  },
                ]
              : []),
            ...settingsItems,
            { label: 'What’s new…', onSelect: () => setWhatsNew(true) },
            { label: 'Send feedback…', onSelect: () => setFeedback(true) },
            {
              label: 'Clear saved documents…',
              onSelect: () => setConfirmingClear(true),
              danger: true,
              separated: true,
            },
          ]}
        />

      </div>

      {/* Floats under the bar, over the canvas's top margin: inline, it wrapped the row and
          moved the page; at the right edge it covered the sidebar's tabs. */}
      {notice && (
        <div
          key={notice.message}
          role="status"
          data-print-hide
          className="absolute left-1/2 top-full z-30 mt-1.5 flex -translate-x-1/2 animate-fade-in items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1 text-[11px] shadow-sm"
        >
          <span className="font-medium text-ok">{notice.message}</span>
          {notice.action && (
            <Button variant="ghostAccent" size="sm" onClick={() => notice.action && runNotice(notice.action)}>
              {notice.action.label}
            </Button>
          )}
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mt-2 animate-slide-down-in rounded-lg bg-danger-soft px-2.5 py-1.5 text-xs text-danger-ink"
        >
          {error}
        </p>
      )}

      {exporting && (
        <ExportDialog
          worksheet={worksheet}
          mode={mode}
          onClose={closeExport}
          onExported={handleExported}
          onPrint={handlePrint}
          checks={
            <PaperHealthPanel
              worksheet={worksheet}
              language={mode.language}
              version={mode.version}
              onOpenAi={readOnly ? undefined : aiFromExport}
            />
          }
        />
      )}

      {whatsNew && <WhatsNewDialog onClose={closeWhatsNew} />}
      {feedback && (
        <FeedbackDialog
          onClose={closeFeedback}
          language={mode.language}
          document={describeDocument(worksheet)}
        />
      )}

      {/* Confirmed rather than immediate: this is the one action in the app that
          destroys work with no undo and no copy anywhere else. The dialog says how many
          documents are at stake and offers the download first, because "save a copy"
          is the thing a teacher wants the moment they read the warning. */}
      {confirmingClear && (
        <Dialog
          title="Clear saved documents?"
          description={`Every worksheet saved ${isDesktop() ? 'on this computer' : 'in this browser'} will be deleted. This cannot be undone — nothing is stored on a server.`}
          width={460}
          onClose={() => setConfirmingClear(false)}
          footer={
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="subtle"
                onClick={() => void handleDownloadJson('Downloaded a copy')}
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
                className="inline-flex h-[34px] cursor-pointer items-center justify-center rounded-lg border border-transparent bg-danger px-3 text-[13px] font-medium text-white shadow-sm transition-[background-color,border-color,color,opacity,transform,scale,filter] duration-150 ease-out-soft hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:scale-[0.97]"
              >
                Clear everything
              </button>
            </div>
          }
        >
          <p className="text-[13px] leading-relaxed text-ink-subtle">
            Every worksheet on the start screen lives {isDesktop() ? 'on this computer' : 'in this browser'}, not in the code,
            which is why your work comes back after a restart. Clearing empties that list
            and returns you to it.
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-subtle">
            Your settings and AI keys are kept — remove a key in Settings → AI &amp; translation.
          </p>
        </Dialog>
      )}
    </div>
  );
}
