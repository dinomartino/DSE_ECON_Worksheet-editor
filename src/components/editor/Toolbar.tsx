'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  answerKeyClipboardHtml,
  answerKeyPlainText,
  copyForWord,
  worksheetClipboardHtml,
  worksheetPlainText,
} from '@/export/clipboard';
import { renderDiagramImages, renderNodeDiagramImages } from '@/export/diagramImage';
import { renderAnswerKey } from '@/render/answerKey';
import type { LanguageMode, OutputMode, VersionMode } from '@/model/types';
import { useWorksheetStore, type DocumentView } from '@/store/worksheetStore';
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
import { ExportPaperCheck } from './ExportPaperCheck';
import { PaperSummaryBar } from './PaperSummaryBar';
import { SaveStatus } from './SaveStatus';
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
import { resolveMessages } from '@/i18n/catalogue';
import { uiLanguage, useMessages } from '@/i18n/language';
import { TOOLBAR_MESSAGES } from './Toolbar.messages';

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
 * `[mark] Econ Studio › name`: one button home to the start screen, the editor's only route
 * there. Below 1440px the word and chevron fold away; the mark keeps the label.
 */
export function HomeCrumb({ onOpenFiles }: { onOpenFiles: () => void }) {
  // Not a hook: tests call this as a plain function. The Toolbar that renders it subscribes.
  const m = resolveMessages(TOOLBAR_MESSAGES, uiLanguage());
  return (
    <nav aria-label={m.breadcrumb} className="flex min-w-0 items-center gap-1">
      <button
        type="button"
        aria-label={m.home}
        title={m.home}
        onClick={onOpenFiles}
        className="flex shrink-0 cursor-pointer items-center gap-2 rounded-md p-1 text-[13px] font-medium text-ink-muted transition-[background-color,color,scale] duration-150 ease-out-soft hover:bg-surface-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent active:scale-[0.97] min-[1440px]:pr-2"
      >
        {/* The app's own face, shared with the browser tab (`src/app/icon.svg`). */}
        <span className="flex text-ink">
          <AppMark size={22} />
        </span>
        {/* i18n-ignore: brand */}
        <span className="hidden min-[1440px]:inline">Econ Studio</span>
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
  onBackToBank,
  onClearAll,
  bodySheets,
}: {
  onOpenSettings: () => void;
  /** Sheets the preview paginated the body into, cover excluded; 0 = not yet measured. */
  bodySheets?: number;
  /** Show the start screen: the saved-worksheet list, and the new-document form. */
  onOpenFiles: () => void;
  /** Present when the document was opened from a bank question: back to that place in the bank. */
  onBackToBank?: () => void;
  /** Delete every saved document, this one included, and show the (empty) start screen. */
  onClearAll: () => Promise<void>;
}) {
  const m = useMessages(TOOLBAR_MESSAGES);
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const mode = useWorksheetStore((s) => s.mode);
  const setMode = useWorksheetStore((s) => s.setMode);
  const documentView = useWorksheetStore((s) => s.documentView);
  const setDocumentView = useWorksheetStore((s) => s.setDocumentView);
  const undo = useWorksheetStore((s) => s.undo);
  const redo = useWorksheetStore((s) => s.redo);
  const past = useWorksheetStore((s) => s.past);
  const future = useWorksheetStore((s) => s.future);
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
    if (status === 'current') flash(m.latest(appVersion ?? ''));
    else if (status === 'failed') flash(m.checkFailed);
    else if (status === 'downloading') flash(m.downloading(String(found)));
  };

  /** Desktop only: a saved file's path becomes a one-click reveal. */
  const revealAction = (path: string | undefined): Notice['action'] =>
    path === undefined
      ? undefined
      : { label: revealLabel(), run: () => void revealFile(path).catch(() => undefined) };

  const handleDownloadJson = async (message?: string) => {
    try {
      const saved = await downloadWorksheetFile(worksheet);
      // A cancelled save sheet or picker wrote nothing, so there is nothing to report.
      if (!saved) return;
      if (message) flash(message, revealAction(saved.path));
      else if (saved.path !== undefined) flash(m.savedCopy, revealAction(saved.path));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : m.downloadFailed);
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
      // What is on the page is what is copied: the paper, or in the Marking scheme view
      // its key. Diagrams are rasterized first so each pastes into Word as one image.
      if (documentView === 'answerKey') {
        const images = await renderNodeDiagramImages(
          renderAnswerKey(worksheet, mode.language),
          worksheet.fonts,
          mode.language,
        );
        await copyForWord(
          answerKeyClipboardHtml(worksheet, mode.language, images),
          answerKeyPlainText(worksheet, mode.language),
        );
        flash(m.copied);
        return;
      }
      const diagramImages = await renderDiagramImages(worksheet, mode);
      await copyForWord(
        worksheetClipboardHtml(worksheet, mode, diagramImages),
        worksheetPlainText(worksheet, mode),
      );
      flash(m.copied);
    } catch {
      setError(m.copyFailed);
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
  const handlePrint = (printMode: OutputMode, file?: string, view: DocumentView = 'paper') => {
    setError(undefined);
    // PDF prints what the page shows, so the page first shows what was asked for: the
    // paper, or its key. It stays, like the language and version a print switches to.
    setDocumentView(view);
    const deps = browserPrintDeps(setMode, () => select(undefined));
    printWorksheetPdf(worksheet, printMode, deps, file)
      .then((outcome) => {
        if ('saved' in outcome) flash(m.exportedPdf, revealAction(outcome.saved));
        else if (outcome.fallback !== undefined) {
          // Kept (not flashed): the sheet is modal and would outlast a transient line.
          setError(m.pdfFallback(outcome.fallback));
        }
      })
      .catch((cause: unknown) =>
        setError(m.printFailed(cause instanceof Error ? cause.message : String(cause))),
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
      setError(m.clearFailed);
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
        {onBackToBank && (
          <button
            type="button"
            data-print-hide
            data-back-to-bank
            title={m.backToBankTitle}
            aria-label={m.backToBank}
            onClick={onBackToBank}
            className="shrink-0 cursor-pointer rounded-md border border-line-strong px-2 py-1 text-[12.5px] text-ink-muted transition-colors duration-150 ease-out-soft hover:bg-surface-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            ← <span className="min-[1680px]:hidden">{m.bankShort}</span><span className="hidden min-[1680px]:inline">{m.backToBank}</span>
          </button>
        )}

        <span className="h-6 w-px shrink-0 bg-line" />

        <Segmented
          label={m.language}
          value={mode.language}
          onChange={(language) => setMode({ language: language as LanguageMode })}
          options={[
            { value: 'en', label: 'EN', title: m.langEn },
            { value: 'zh', label: '中文', title: m.langZh },
            { value: 'bilingual', label: 'EN+中', title: m.langBoth },
          ]}
        />

        <span className="h-5 w-px shrink-0 bg-line" />

        {/* Three views of one document. The Marking scheme is the answer key on its own
            sheets; choosing it keeps `mode.version`, so Student/Teacher comes back as it was. */}
        <Segmented
          label={m.version}
          value={documentView === 'answerKey' ? 'answerKey' : mode.version}
          onChange={(next) => {
            if (next === 'answerKey') {
              setDocumentView('answerKey');
              return;
            }
            setDocumentView('paper');
            setMode({ version: next as VersionMode });
          }}
          options={[
            { value: 'student', label: m.student, title: m.studentTitle },
            { value: 'teacher', label: m.teacher, title: m.teacherTitle },
            { value: 'answerKey', label: m.markingScheme, title: m.markingSchemeTitle },
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
          label={m.pageMode}
          value={printPreview ? 'preview' : 'edit'}
          onChange={(next) => setPrintPreview(next === 'preview')}
          options={[
            {
              value: 'edit',
              label: m.edit,
              title: readOnly ? m.editReadOnly : m.editTitle,
              disabled: readOnly,
            },
            {
              value: 'preview',
              label: m.preview,
              title: m.previewTitle,
            },
          ]}
        />

        <span className="h-6 w-px shrink-0 bg-line" />

        <span className="flex shrink-0 items-center gap-0.5">
          <IconButton label={m.undo} size="md" onClick={undo} disabled={past.length === 0}>
            <UndoIcon />
          </IconButton>
          <IconButton label={m.redo} size="md" onClick={redo} disabled={future.length === 0}>
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
          aria-label={m.setup}
          title={m.setupTitle}
        >
          <PageSetupIcon size={15} />
          <span className="hidden xl:inline">{m.setup}</span>
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
          <SaveStatus />
        </span>

        {/* Every AI tool behind one door (⌘J); the untranslated count rides on it. */}
        <AiButton />

        {/* One Export action, the bar's only filled button: .docx to keep editing, PDF to
            print or send, .json to keep the worksheet itself. The format is chosen
            inside, beside what it applies to, rather than as look-alike buttons here. */}
        <Button variant="primary" onClick={() => setExporting(true)} title={m.exportTitle}>
          <DownloadIcon size={15} />
          {m.exportButton}
        </Button>

        <Menu
          label={m.menu}
          items={[
            { label: busy === 'copy' ? m.copying : m.copyForWord, onSelect: () => void handleCopy() },
            // The group after Copy for Word opens on a rule, whichever item leads it.
            ...[
              ...(readOnly ? [] : [{ label: m.saveNow, onSelect: () => void save() }]),
              ...(isDesktop()
                ? [
                    {
                      label: m.checkUpdates,
                      hint: appVersion ? `v${appVersion}` : undefined,
                      onSelect: () => void handleCheckUpdates(),
                    },
                  ]
                : []),
              ...settingsItems,
              { label: m.whatsNew, onSelect: () => setWhatsNew(true) },
              { label: m.sendFeedback, onSelect: () => setFeedback(true) },
            ].map((item, i) => (i === 0 ? { ...item, separated: true } : item)),
            {
              label: m.clearSaved,
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
          // Export follows the view: from the Marking scheme it opens on the answer key.
          initialWhat={documentView === 'answerKey' ? 'answerKey' : 'paper'}
          onClose={closeExport}
          onExported={handleExported}
          onPrint={handlePrint}
          checks={(choice) => (
            <ExportPaperCheck
              worksheet={worksheet}
              shown={mode}
              bodySheets={bodySheets}
              choice={choice}
              onOpenAi={readOnly ? undefined : aiFromExport}
            />
          )}
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
          title={m.clearTitle}
          description={m.clearDescription(isDesktop())}
          width={460}
          onClose={() => setConfirmingClear(false)}
          footer={
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="subtle"
                onClick={() => void handleDownloadJson(m.downloadedCopy)}
              >
                {m.downloadFirst}
              </Button>
              <Button variant="subtle" onClick={() => setConfirmingClear(false)}>
                {m.cancel}
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
                {m.clearEverything}
              </button>
            </div>
          }
        >
          <p className="text-[13px] leading-relaxed text-ink-subtle">
            {m.clearBody(isDesktop())}
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-subtle">
            {m.clearKept}
          </p>
        </Dialog>
      )}
    </div>
  );
}
