'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { pictureHome, type Flag, type ImageRef, type Pin, type ReadPaste, type Role } from '@/import';
import { UndecodableImageError, imageBlockFromFile } from '@/export/imageImport';
import { addToBank, bankChoices, nextBankName, type BankChoice } from '@/library/bankDocs';
import { newId } from '@/model/factories';
import type { DocumentType } from '@/model/newWorksheet';
import type { Side } from '@/model/textSlots';
import type { LanguageMode, Question, Worksheet } from '@/model/types';
import { paperLanguage, paperSide } from '@/settings/paperLanguage';
import { worksheetStore, worksheetTitle } from '@/storage';
import { notify } from '@/store/notices';
import { Button, IconButton } from '@/components/ui';
import { Dialog, NoticeInsetSpacer } from '@/components/ui/Dialog';
import { useDialogNotices } from '@/components/ui/NoticeLayer';
import { UndoIcon } from '@/components/ui/icons';
import { undoChord } from '@/components/ui/undoChord';
import { kindText } from '@/components/start/startKinds';
import type { Messages } from '@/i18n/catalogue';
import { useMessages, useUiLanguage } from '@/i18n/language';
import { createImportedDocument, defaultDocumentType, importLanguageMode, importName, misfit, readPaperFile, startLanguage, type FileOutcome, type FileProblem } from './fileImport';
import { IMPORT_MESSAGES } from './messages';
import {
  FLAG_TEXT,
  carriedFiles,
  checkPlaces,
  dragHasFiles,
  flagsByLine,
  imagePin,
  isHeic,
  nextPlace,
  pinsOn,
  review,
  withoutPin,
  withPin,
  type CheckPlace,
  type Language,
} from './pasteSession';
import { materialize, previewBase, previewItems, type PreviewCache } from './previewDoc';
import { ReviewLines, RoleMenu, type LineView } from './ReviewLines';
import { ReviewPreview, type FigureActions, type PreviewCard } from './ReviewPreview';
import { SaveAsStep, type Destination } from './SaveAsStep';

/**
 * Import from Word or PDF (`docs/design/paste-import.md` § 6): the file is read, then
 * reviewed. The left pane is the file's lines with a role chip each; the right is the
 * result as it will print. A fix is a `Pin` and re-solves at once. Save as makes a new
 * paper (one `insertQuestionBatch` into it) or adds to 題庫 (`addToBank`, duplicates
 * skipped). Nothing is written before Save.
 */

type Text = Messages<typeof IMPORT_MESSAGES>;

/** A chosen or dropped file; read once the dialog is up. */
export interface ImportFile {
  name: string;
  read: () => Promise<ArrayBuffer>;
}

export interface ImportDialogProps {
  file: ImportFile;
  onClose: () => void;
  /** Choose another file (the start screen's chooser); the dialog is replaced. */
  onChooseAnother: () => void;
  /** Open a new document in the editor (the start screen's open). */
  onOpenDocument: (worksheet: Worksheet, language: LanguageMode) => void;
  /** Questions were added to a bank: show them there. */
  onAddedToBank: (bankId: string, questionIds: string[]) => void;
}

const NEW_BANK = '';

export function flagText(m: Text, flag: Flag): string {
  const key = FLAG_TEXT[flag.kind];
  return key === 'flagOptionCount' ? m.flagOptionCount(flag.detail ?? 0) : m[key];
}

const isTyping = () => {
  const active = document.activeElement;
  return active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement || (active instanceof HTMLElement && active.isContentEditable);
};

/** The app's downsizer for the readers: a picture this browser cannot draw stays a slot. */
async function prepareImage(blob: Blob): Promise<ImageRef | null> {
  const type = blob.type || 'image/png';
  const block = await imageBlockFromFile(new File([blob], `figure.${type.split('/')[1] ?? 'png'}`, { type }), 420, { decodedOnly: true }).catch(() => null);
  if (!block) return null;
  return {
    src: block.src,
    widthPx: block.widthPx,
    heightPx: block.heightPx,
    ...(block.naturalWidthPx && block.naturalHeightPx ? { naturalWidthPx: block.naturalWidthPx, naturalHeightPx: block.naturalHeightPx } : {}),
  };
}

type Loaded = { read: ReadPaste; title?: string; pages?: number };

export default function ImportDialog({ file, onClose, onChooseAnother, onOpenDocument, onAddedToBank }: ImportDialogProps) {
  const m = useMessages(IMPORT_MESSAGES);
  const lang = useUiLanguage();
  const notices = useDialogNotices();
  const [loaded, setLoaded] = useState<Loaded>();
  const [problem, setProblem] = useState<{ problem: FileProblem; pages?: number }>();
  const read = loaded?.read;
  const [pins, setPins] = useState<Pin[]>([]);
  const [language, setLanguage] = useState<Language>('auto');
  const [selectedLine, setSelectedLine] = useState<number>();
  const [menu, setMenu] = useState<{ line: number; anchor: HTMLElement }>();
  const [banks, setBanks] = useState<BankChoice[]>([]);
  const [bankTarget, setBankTarget] = useState(NEW_BANK);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<'review' | 'saveAs'>('review');
  const [destination, setDestination] = useState<Destination>();
  const [name, setName] = useState('');
  const [base] = useState(() => previewBase());
  const [cache] = useState<PreviewCache>(() => new Map());

  // Read the file once. pdf.js and the readers load here, never with the start screen.
  useEffect(() => {
    let live = true;
    void (async () => {
      const outcome: FileOutcome = await file
        .read()
        .then((bytes) => readPaperFile(file.name, bytes, { prepareImage }))
        .catch((): FileOutcome => ({ kind: 'problem', problem: 'unreadable' }));
      if (!live) return;
      if (outcome.kind === 'problem') {
        setProblem({ problem: outcome.problem, ...(outcome.pages ? { pages: outcome.pages } : {}) });
        return;
      }
      setLanguage(startLanguage(outcome.read, paperSide()));
      setName(importName(outcome.title, file.name));
      setLoaded({ read: outcome.read, ...(outcome.title ? { title: outcome.title } : {}), ...(outcome.pages ? { pages: outcome.pages } : {}) });
      if (outcome.ocr) notices.notify({ id: 'import-kind', tone: 'warning', body: m.scanOcr });
    })();
    return () => {
      live = false;
    };
    // Once per file: the dialog is replaced for another one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  // The banks 題庫 only can write.
  useEffect(() => {
    let live = true;
    void worksheetStore
      .list()
      .then((rows) => {
        if (!live) return;
        const choices = bankChoices(rows.filter((row) => row.kind === 'bank'));
        setBanks(choices);
        setBankTarget(choices[0]?.id ?? NEW_BANK);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const result = useMemo(() => (read ? review(read, pins, language) : undefined), [read, pins, language]);
  const analysis = result?.analysis;
  const batch = result?.batch;
  const shown = result?.preview;
  const items = useMemo(() => (analysis && shown ? previewItems(base, analysis, shown, cache) : []), [analysis, shown, base, cache]);
  const places = useMemo(() => (analysis ? checkPlaces(analysis) : { check: [], noAnswer: [] }), [analysis]);

  const latest = useRef({ analysis, pins });
  useLayoutEffect(() => {
    latest.current = { analysis, pins };
  });

  const addPin = useCallback((pin: Pin) => {
    const current = latest.current.analysis;
    if (current) setPins((list) => withPin(list, pin, current));
  }, []);
  const removePin = useCallback((pin: Pin) => setPins((list) => withoutPin(list, pin)), []);
  const undoLast = useCallback(() => setPins((list) => list.slice(0, -1)), []);

  // ⌘Z takes back the last fix, and never reaches anything behind the dialog.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const action = undoChord(event);
      if (!action || isTyping()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (action === 'undo' && read && step === 'review') undoLast();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [read, step, undoLast]);

  // ---- pictures: pasted, dropped or chosen; each becomes an image pin after its line ----

  const [dropLine, setDropLine] = useState<number>();
  const fileInput = useRef<HTMLInputElement>(null);
  const chooseFor = useRef<number | undefined>(undefined);
  const selectedRef = useRef(selectedLine);
  useLayoutEffect(() => {
    selectedRef.current = selectedLine;
  });

  const addPictures = useCallback(
    (line: number, { images, others }: { images: File[]; others: File[] }) => {
      const current = latest.current.analysis;
      if (images.length === 0) {
        if (others.length) notices.notify({ id: 'paste-picture', tone: 'warning', body: m.notAPicture });
        return;
      }
      // A line after the last question has nowhere to put a picture.
      if (!current || pictureHome(current.outline, current.roles, line) === undefined) {
        notices.notify({ id: 'paste-picture', tone: 'warning', body: m.pictureNoQuestion });
        return;
      }
      for (const file of images) {
        // The same reduction every stored picture takes (§ `prepareImageForStorage`); one this
        // browser cannot draw (HEIC or TIFF in Chrome) is refused rather than stored unseen.
        imageBlockFromFile(file, undefined, { decodedOnly: true })
          .then((block) => addPin(imagePin(line, block, newId())))
          .catch((error: unknown) =>
            notices.notify({
              id: 'paste-picture',
              tone: 'warning',
              body: !(error instanceof UndecodableImageError) ? m.pictureUnreadable : isHeic(file) ? m.pictureHeic : m.pictureUndecodable,
            }),
          );
      }
    },
    [addPin, notices, m],
  );

  const choosePicture = useCallback((line: number) => {
    chooseFor.current = line;
    fileInput.current?.click();
  }, []);

  // ⌘V of a screenshot puts it after the selected line (or slot). Text pastes pass by.
  useEffect(() => {
    if (!read) return;
    const onPaste = (event: ClipboardEvent) => {
      const files = carriedFiles(event.clipboardData);
      if (files.images.length === 0 && files.others.length === 0) return;
      event.preventDefault();
      const line = selectedRef.current;
      if (line === undefined) notices.notify({ id: 'paste-picture', tone: 'info', body: m.pickPlaceFirst });
      else addPictures(line, files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [read, addPictures, notices, m]);

  const figures: FigureActions = useMemo(
    () => ({
      select: (line) => setSelectedLine(line),
      choose: choosePicture,
      dismiss: (line) => addPin({ kind: 'noPicture', line }),
      remove: (id) => setPins((list) => list.filter((p) => !(p.kind === 'image' && p.id === id))),
    }),
    [choosePicture, addPin],
  );

  /** The line a drop lands on: a row, a slot, a placed picture's question, or a card's first line. */
  const dropTarget = (target: EventTarget | null): number | undefined => {
    const el = target instanceof Element ? target : null;
    const hit = el?.closest<HTMLElement>('[data-slot],[data-line],[data-start]');
    if (!hit) return undefined;
    const value = hit.dataset.slot ?? hit.dataset.line ?? hit.dataset.start;
    return value === undefined ? undefined : Number(value);
  };
  const dragHandlers = {
    onDragOver: (event: React.DragEvent) => {
      if (!dragHasFiles(event.dataTransfer)) return;
      event.preventDefault();
      const line = dropTarget(event.target);
      event.dataTransfer.dropEffect = line === undefined ? 'none' : 'copy';
      setDropLine(line);
    },
    onDragLeave: (event: React.DragEvent) => {
      if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) setDropLine(undefined);
    },
    onDrop: (event: React.DragEvent) => {
      if (!dragHasFiles(event.dataTransfer)) return;
      event.preventDefault();
      event.stopPropagation();
      setDropLine(undefined);
      const line = dropTarget(event.target);
      const files = carriedFiles(event.dataTransfer);
      if (line === undefined) return;
      setSelectedLine(line);
      addPictures(line, files);
    },
  };

  // ---- step 2: what each pane shows ----

  const byLine = useMemo(() => (analysis ? flagsByLine(analysis) : new Map<number, Flag[]>()), [analysis]);
  const rows: LineView[] = useMemo(
    () =>
      analysis
        ? analysis.lines.map((line, i) => ({
            line,
            role: analysis.roles[i].role,
            pinned: Boolean(analysis.roles[i].pinned),
            pins: pinsOn(pins, i),
            // "No answer" belongs to the question (right pane), not to a line.
            flags: (byLine.get(i) ?? [])
              .filter((f) => f.kind !== 'noAnswer')
              .map((f) => flagText(m, f))
              .join('\n'),
            ...(analysis.roles[i].question !== undefined ? { question: analysis.roles[i].question } : {}),
            // A picture on a line outside every question opens the next one: say which.
            ...(analysis.roles[i].question === undefined && pinsOn(pins, i).some((p) => p.kind === 'image')
              ? { pictureTo: pictureHome(analysis.outline, analysis.roles, i) }
              : {}),
          }))
        : [],
    [analysis, pins, byLine, m],
  );
  const cards: PreviewCard[] = useMemo(() => {
    if (!analysis || !batch) return [];
    return items.map((item) => {
      const k = item.question;
      const q = k !== undefined ? analysis.outline.questions[k] : undefined;
      const flags = k === undefined ? [] : analysis.flags.filter((f) => f.question === k);
      return {
        item,
        start: k !== undefined ? batch.starts[k] : (analysis.outline.stimuli[0]?.start ?? 0),
        ...(q?.answer ? { answer: q.answer.index } : {}),
        side: q?.side ?? (item.language === 'zh' ? 'zh' : 'en'),
        flags: [...new Set(flags.map((f) => flagText(m, f)))].join('\n'),
        isMc: q?.kind === 'mc',
      };
    });
  }, [analysis, batch, items, m]);

  // A line outside every question selects the question a picture pasted there would open.
  const selectedQuestion = selectedLine !== undefined && analysis ? pictureHome(analysis.outline, analysis.roles, selectedLine) : undefined;

  // ---- linked scrolling: the pane under the pointer leads ----

  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const leader = useRef<'left' | 'right' | null>(null);
  const spans = useMemo(() => {
    const out = new Map<number, [number, number]>();
    analysis?.roles.forEach((r, i) => {
      if (r.question === undefined) return;
      const s = out.get(r.question);
      out.set(r.question, s ? [Math.min(s[0], i), Math.max(s[1], i)] : [i, i]);
    });
    return out;
  }, [analysis]);

  useEffect(() => {
    const left = leftRef.current;
    const right = rightRef.current;
    if (!left || !right || !analysis) return;
    let frame = 0;
    const lineEl = (i: number) => left.querySelector<HTMLElement>(`[data-line="${i}"]`);
    const syncFromLeft = () => {
      const rowsEls = left.children;
      let lo = 0;
      let hi = rowsEls.length - 1;
      const top = left.scrollTop;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        const el = rowsEls[mid] as HTMLElement;
        if (el.offsetTop + el.offsetHeight <= top) lo = mid + 1;
        else hi = mid;
      }
      let line = Number((rowsEls[lo] as HTMLElement | undefined)?.dataset.line ?? 0);
      while (line < analysis.roles.length && analysis.roles[line].question === undefined) line += 1;
      const q = analysis.roles[line]?.question;
      const span = q !== undefined ? spans.get(q) : undefined;
      const card = q !== undefined ? right.querySelector<HTMLElement>(`[data-q="${q}"]`) : null;
      if (!span || !card) return;
      const a = lineEl(span[0]);
      const b = lineEl(span[1]);
      if (!a || !b) return;
      const height = b.offsetTop + b.offsetHeight - a.offsetTop;
      const frac = height > 0 ? Math.min(1, Math.max(0, (top - a.offsetTop) / height)) : 0;
      right.scrollTop = card.offsetTop - 16 + frac * card.offsetHeight;
    };
    const syncFromRight = () => {
      const top = right.scrollTop;
      const card = [...right.querySelectorAll<HTMLElement>('[data-q]')].find((c) => c.offsetTop + c.offsetHeight > top);
      if (!card) return;
      const frac = Math.min(1, Math.max(0, (top - card.offsetTop + 16) / card.offsetHeight));
      const q = card.dataset.q === 'lead' ? undefined : Number(card.dataset.q);
      const span = q !== undefined ? spans.get(q) : undefined;
      const a = span ? lineEl(span[0]) : lineEl(Number(card.dataset.start));
      const b = span ? lineEl(span[1]) : a;
      if (!a || !b) return;
      left.scrollTop = a.offsetTop - 8 + frac * (b.offsetTop + b.offsetHeight - a.offsetTop);
    };
    const onLeft = () => {
      if (leader.current !== 'left') return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(syncFromLeft);
    };
    const onRight = () => {
      if (leader.current !== 'right') return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(syncFromRight);
    };
    const leadLeft = () => (leader.current = 'left');
    const leadRight = () => (leader.current = 'right');
    left.addEventListener('scroll', onLeft, { passive: true });
    right.addEventListener('scroll', onRight, { passive: true });
    for (const [el, lead] of [
      [left, leadLeft],
      [right, leadRight],
    ] as const) {
      el.addEventListener('pointerenter', lead);
      el.addEventListener('wheel', lead, { passive: true });
      el.addEventListener('focusin', lead);
    }
    return () => {
      cancelAnimationFrame(frame);
      left.removeEventListener('scroll', onLeft);
      right.removeEventListener('scroll', onRight);
      for (const [el, lead] of [
        [left, leadLeft],
        [right, leadRight],
      ] as const) {
        el.removeEventListener('pointerenter', lead);
        el.removeEventListener('wheel', lead);
        el.removeEventListener('focusin', lead);
      }
    };
  }, [analysis, spans]);

  /** Bring a line and its question into view in whichever pane is not leading. */
  const reveal = useCallback((line: number, both = false) => {
    const current = latest.current.analysis;
    const q = current ? pictureHome(current.outline, current.roles, line) : undefined;
    const smooth = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    if (both || leader.current !== 'left') {
      leftRef.current?.querySelector(`[data-line="${line}"]`)?.scrollIntoView({ block: 'center', behavior: smooth });
    }
    if (both || leader.current !== 'right') {
      const card = rightRef.current?.querySelector(q !== undefined ? `[data-q="${q}"]` : '[data-q="lead"]');
      card?.scrollIntoView({ block: 'nearest', behavior: smooth });
    }
  }, []);

  const selectLine = useCallback(
    (line: number) => {
      setSelectedLine(line);
      reveal(line);
    },
    [reveal],
  );
  const selectCard = useCallback(
    (_question: number | undefined, start: number) => {
      setSelectedLine(start);
      reveal(start);
    },
    [reveal],
  );
  const goTo = (place: CheckPlace | undefined) => {
    if (!place) return;
    leader.current = null;
    setSelectedLine(place.line);
    reveal(place.line, true);
  };

  const onChip = useCallback((line: number, anchor: HTMLElement) => setMenu({ line, anchor }), []);
  const closeMenu = useCallback(
    (refocus: boolean) => {
      if (refocus) menu?.anchor.focus();
      setMenu(undefined);
    },
    [menu],
  );
  const onAnswer = useCallback(
    (question: number, index: number) => {
      const start = latest.current.analysis?.outline.questions[question]?.start;
      if (start !== undefined) addPin({ kind: 'answer', line: start, index });
    },
    [addPin],
  );
  const onLanguage = useCallback(
    (question: number, side: Side) => {
      const q = latest.current.analysis?.outline.questions[question];
      if (q && q.side !== side) addPin({ kind: 'language', line: q.start, side });
    },
    [addPin],
  );
  const setAllLanguage = (next: Language) => {
    setLanguage(next);
    // "For all" means all: a question's own switch gives way.
    setPins((list) => list.filter((p) => p.kind !== 'language'));
  };

  // ---- Save as ----

  const builds = batch?.builds ?? [];
  const noAnswer = places.noAnswer.length;
  const suggested = analysis ? defaultDocumentType(analysis) : 'classroom';
  const chosen: Destination = destination ?? suggested;
  const languageMode: LanguageMode = analysis ? importLanguageMode(analysis, paperLanguage()) : 'en';

  const saveDocument = (documentType: DocumentType) => {
    if (!batch || builds.length === 0 || busy) return;
    const filingName = name.trim() || importName(loaded?.title, file.name);
    const report = createImportedDocument(batch, { documentType, name: filingName }, (worksheet) => onOpenDocument(worksheet, languageMode), (w) =>
      worksheetStore.save(w),
    );
    if (!report.ok) {
      notices.notify({ id: 'import-result', tone: 'error', body: m.saveFailed });
      return;
    }
    notify({
      tone: 'success',
      body: m.savedAs(kindText(documentType, lang).title, filingName, report.questionIds.length) + (noAnswer > 0 ? m.noAnswerAfter(noAnswer) : ''),
      autoHide: true,
    });
    onClose();
  };

  const saveToBank = () => {
    if (!batch || builds.length === 0 || busy) return;
    const questions = batch.builds.map(materialize).filter((q): q is Question => q !== undefined);
    const to = bankTarget === NEW_BANK ? { name: nextBankName(banks.map((b) => b.name)) } : bankTarget;
    setBusy(true);
    addToBank(questions, to, { openDocId: '' })
      .then(({ bank, copied, already }) => {
        const bankName = worksheetTitle(bank);
        const skipped = new Set(already.map((q) => q.id));
        const body =
          copied === 0
            ? m.bankHadAll(bankName)
            : m.addedToBank(copied, bankName) + (already.length > 0 ? m.skippedDuplicates(already.length) : '') + (batch.lead ? m.stimulusNotInBank : '');
        notify({ tone: copied === 0 ? 'info' : 'success', body });
        onClose();
        if (copied > 0) onAddedToBank(bank.id, questions.filter((q) => !skipped.has(q.id)).map((q) => q.id));
      })
      .catch(() => {
        setBusy(false);
        notices.notify({ id: 'import-result', tone: 'error', body: m.bankFailed });
      });
  };

  const save = () => (chosen === 'bank' ? saveToBank() : saveDocument(chosen));

  // ---- render ----

  const reason = builds.length === 0 ? m.nothingToImport : batch && batch.skipped.length > 0 ? m.leftOut(batch.skipped.length) : undefined;
  const fit = analysis && chosen !== 'bank' ? misfit(chosen, analysis) : undefined;
  const mc = analysis?.outline.questions.filter((q) => q.kind === 'mc').length ?? 0;

  const footer = !analysis ? (
    <>
      {problem && (
        <Button variant="subtle" className="mr-auto" onClick={onChooseAnother}>
          {m.chooseAnother}
        </Button>
      )}
      <Button variant={problem ? 'primary' : 'subtle'} onClick={onClose}>
        {problem ? m.close : m.cancel}
      </Button>
    </>
  ) : step === 'review' ? (
    <>
      <Button variant="subtle" onClick={onChooseAnother}>
        {m.chooseAnother}
      </Button>
      <span title={reason} className={`min-w-0 flex-1 truncate text-xs ${builds.length === 0 ? 'text-warn-ink' : 'text-ink-subtle'}`}>
        {reason}
      </span>
      <Button variant="subtle" onClick={onClose}>
        {m.cancel}
      </Button>
      <Button variant="primary" disabled={builds.length === 0} onClick={() => setStep('saveAs')}>
        {m.saveAs}
      </Button>
    </>
  ) : (
    <>
      <Button variant="subtle" onClick={() => setStep('review')}>
        ← {m.backToReview}
      </Button>
      <span className="flex-1" />
      <Button variant="subtle" onClick={onClose}>
        {m.cancel}
      </Button>
      <Button variant="primary" disabled={builds.length === 0 || busy || (chosen !== 'bank' && !name.trim())} onClick={save}>
        {busy ? m.busy : chosen === 'bank' ? m.addToBank : m.saveAndOpen}
      </Button>
    </>
  );

  const menuRow = menu && analysis ? analysis.roles[menu.line] : undefined;
  const description = loaded?.pages ? `${file.name} · ${m.pages(loaded.pages)}` : file.name;

  return (
    <Dialog title={m.title} description={description} size="large" scrollBody={false} onClose={onClose} footer={footer} noticeScope={notices.scope}>
      {!analysis ? (
        problem ? (
          <ProblemStep text={m} problem={problem.problem} pages={problem.pages ?? 0} />
        ) : (
          <ReadingStep text={m} name={file.name} />
        )
      ) : step === 'saveAs' ? (
        <SaveAsStep
          text={m}
          destination={chosen}
          suggested={suggested}
          onDestination={setDestination}
          name={name}
          onName={setName}
          banks={banks}
          bankTarget={bankTarget}
          newBankName={nextBankName(banks.map((b) => b.name))}
          onBankTarget={setBankTarget}
          questions={builds.length}
          mc={mc}
          language={languageMode}
          misfit={fit}
          onSubmit={save}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col" {...dragHandlers}>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(event) => {
              const line = chooseFor.current;
              const files = carriedFiles(event.currentTarget);
              event.currentTarget.value = '';
              if (line !== undefined) {
                setSelectedLine(line);
                addPictures(line, files);
              }
            }}
          />
          <ReviewBar
            text={m}
            questions={builds.length}
            check={places.check}
            noAnswer={places.noAnswer}
            selectedLine={selectedLine}
            language={language}
            pins={pins.length}
            onNext={goTo}
            onLanguage={setAllLanguage}
            onUndo={undoLast}
          />
          <div className="flex min-h-0 flex-1">
            <div className="flex min-h-0 w-[42%] min-w-0 flex-col border-r border-line">
              <p className="shrink-0 truncate border-b border-line px-3 py-1.5 text-[11px] font-medium text-ink-subtle" title={m.pictureHint}>
                {m.pastedLines}
                <span className="font-normal"> · {m.pictureHint}</span>
              </p>
              <ReviewLines
                rows={rows}
                selectedQuestion={selectedQuestion}
                selectedLine={selectedLine}
                scrollRef={leftRef}
                text={m}
                onSelectLine={selectLine}
                onChip={onChip}
                onRemovePin={removePin}
                dropLine={dropLine}
                end={<NoticeInsetSpacer />}
              />
            </div>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <p className="shrink-0 border-b border-line px-3 py-1.5 text-[11px] font-medium text-ink-subtle">
                {m.asPrinted}
                <span className="font-normal"> · {m.setAnswerHint}</span>
              </p>
              <ReviewPreview
                cards={cards}
                base={base}
                selected={selectedQuestion}
                scrollRef={rightRef}
                onSelect={selectCard}
                onAnswer={onAnswer}
                onLanguage={onLanguage}
                figures={figures}
                selectedLine={selectedLine}
                dropLine={dropLine}
                end={<NoticeInsetSpacer />}
              />
            </div>
          </div>
          {menu && menuRow && (
            <RoleMenu
              anchor={menu.anchor}
              line={menu.line}
              role={menuRow.role}
              pins={pinsOn(pins, menu.line)}
              canJoin={menu.line > 0}
              text={m}
              onRole={(role: Role) => {
                addPin({ kind: 'role', line: menu.line, role });
                closeMenu(true);
              }}
              onNewQuestion={() => {
                addPin({ kind: 'newQuestion', line: menu.line });
                closeMenu(true);
              }}
              onJoin={() => {
                addPin({ kind: 'join', line: menu.line });
                closeMenu(true);
              }}
              onPicture={() => {
                choosePicture(menu.line);
                closeMenu(true);
              }}
              onRemovePin={(pin) => {
                removePin(pin);
                closeMenu(true);
              }}
              onClose={closeMenu}
            />
          )}
        </div>
      )}
    </Dialog>
  );
}

/** The file is being read: big PDFs take seconds, and pdf.js loads on first use. */
function ReadingStep({ text: m, name }: { text: Text; name: string }) {
  return (
    <div role="status" className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <span aria-hidden className="h-6 w-6 rounded-full border-2 border-line border-t-accent motion-safe:animate-spin" />
      <p className="max-w-[60ch] break-all text-[14px] font-medium text-ink">{m.reading(name)}</p>
      <p className="text-[12px] text-ink-muted">{m.readingHint}</p>
    </div>
  );
}

const PROBLEM_TEXT: Record<Exclude<FileProblem, 'scan'>, 'problemLegacyDoc' | 'problemEncrypted' | 'problemNotPaper' | 'problemUnreadable'> = {
  legacyDoc: 'problemLegacyDoc',
  encrypted: 'problemEncrypted',
  notPaper: 'problemNotPaper',
  unreadable: 'problemUnreadable',
};

/** Why the file cannot be imported, in a teacher's words; the footer has the ways back. */
function ProblemStep({ text: m, problem, pages }: { text: Text; problem: FileProblem; pages: number }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div role="alert" className="max-w-[520px] rounded-xl border border-line bg-surface-sunken px-6 py-5">
        <p className="text-[15px] font-semibold text-ink">{m.problemTitle}</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">{problem === 'scan' ? m.problemScan(pages) : m[PROBLEM_TEXT[problem]]}</p>
      </div>
    </div>
  );
}

function ReviewBar({
  text: m,
  questions,
  check,
  noAnswer,
  selectedLine,
  language,
  pins,
  onNext,
  onLanguage,
  onUndo,
}: {
  text: Text;
  questions: number;
  check: CheckPlace[];
  noAnswer: CheckPlace[];
  selectedLine?: number;
  language: Language;
  pins: number;
  onNext: (place: CheckPlace | undefined) => void;
  onLanguage: (language: Language) => void;
  onUndo: () => void;
}) {
  const choices: Array<{ id: Language; label: string }> = [
    { id: 'auto', label: m.languageAuto },
    { id: 'en', label: m.english },
    { id: 'zh', label: m.chinese },
  ];
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-line bg-surface-sunken px-4 py-2">
      <p className="mr-1 text-[13px] text-ink" role="status">
        <span className="font-semibold">{m.questionCount(questions)}</span>
        <span className="text-ink-muted"> · </span>
        <span className={check.length > 0 ? 'font-medium text-warn-ink' : 'text-ink-muted'}>
          {check.length > 0 ? m.toCheck(check.length) : m.allClear}
        </span>
      </p>
      {check.length > 0 && (
        <Button size="sm" variant="default" onClick={() => onNext(nextPlace(check, selectedLine))}>
          {m.nextToCheck}
        </Button>
      )}
      {noAnswer.length > 0 && (
        // The count is the way there: each press goes to the next MC still without an answer.
        <Button size="sm" variant="subtle" title={m.nextNoAnswer} onClick={() => onNext(nextPlace(noAnswer, selectedLine))}>
          {m.noAnswerCount(noAnswer.length)} →
        </Button>
      )}
      <span className="flex-1" />
      <span role="group" aria-label={m.languageAll} className="flex items-center gap-1.5 text-xs text-ink-muted">
        {m.languageAll}
        <span className="flex overflow-hidden rounded-lg border border-line bg-surface">
          {choices.map((choice) => (
            <button
              key={choice.id}
              type="button"
              aria-pressed={language === choice.id}
              onClick={() => onLanguage(choice.id)}
              className={`cursor-pointer px-2 py-1 text-xs transition-colors duration-150 ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
                language === choice.id ? 'bg-accent-soft font-semibold text-accent-ink' : 'text-ink-muted hover:bg-surface-hover hover:text-ink'
              }`}
            >
              {choice.label}
            </button>
          ))}
        </span>
      </span>
      <IconButton label={`${m.undoFix} (${m.undoFixHint})`} disabled={pins === 0} onClick={onUndo}>
        <UndoIcon size={14} />
      </IconButton>
    </div>
  );
}
