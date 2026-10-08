'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Flag, Pin, ReadPaste, Role } from '@/import';
import { imageBlockFromFile } from '@/export/imageImport';
import { addToBank, bankChoices, nextBankName, type BankChoice } from '@/library/bankDocs';
import { newId } from '@/model/factories';
import type { Side } from '@/model/textSlots';
import type { Question } from '@/model/types';
import { worksheetStore, worksheetTitle } from '@/storage';
import { notify } from '@/store/notices';
import { useWorksheetStore } from '@/store/worksheetStore';
import { Button, IconButton } from '@/components/ui';
import { Dialog, NoticeInsetSpacer } from '@/components/ui/Dialog';
import { useDialogNotices } from '@/components/ui/NoticeLayer';
import { UndoIcon } from '@/components/ui/icons';
import { undoChord } from '@/components/ui/undoChord';
import type { Messages } from '@/i18n/catalogue';
import { useMessages } from '@/i18n/language';
import { PASTE_IMPORT_MESSAGES } from './messages';
import {
  FLAG_TEXT,
  checkPlaces,
  dragHasFiles,
  flagsByLine,
  imageFiles,
  imagePin,
  nextPlace,
  pasteInput,
  pasteVerdict,
  pinsOn,
  readPaste,
  review,
  withoutPin,
  withPin,
  type CheckPlace,
  type Language,
} from './pasteSession';
import { materialize, previewBase, previewItems, type PreviewCache } from './previewDoc';
import { ReviewLines, RoleMenu, type LineView } from './ReviewLines';
import { ReviewPreview, type FigureActions, type PreviewCard } from './ReviewPreview';

/**
 * Paste questions (D1, `docs/design/paste-import.md` § 3): a paste box, then the review.
 * The left pane is the paste with a role chip per line; the right is the result as it
 * will print. A fix is a `Pin` and re-solves at once. Nothing is written until Insert
 * (one `insertQuestionBatch`, one ⌘Z) or Add to 題庫 (`addToBank`, duplicates skipped).
 */

type Text = Messages<typeof PASTE_IMPORT_MESSAGES>;

export interface PasteImportProps {
  /** `paper`: opened from the editor (Insert and Add to 題庫); `bank`: from 題庫 (Add only). */
  target: 'paper' | 'bank';
  onClose: () => void;
  /** Runs a bank write in the caller's queue (題庫 writes one document at a time). */
  exclusive?: <T>(work: () => Promise<T>) => Promise<T>;
  /** A bank was written: the caller re-reads its list. */
  onBankChanged?: () => void;
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

export default function PasteImportDialog({ target, onClose, exclusive, onBankChanged }: PasteImportProps) {
  const m = useMessages(PASTE_IMPORT_MESSAGES);
  const notices = useDialogNotices();
  const [read, setRead] = useState<ReadPaste>();
  const [draft, setDraft] = useState('');
  const [pins, setPins] = useState<Pin[]>([]);
  const [language, setLanguage] = useState<Language>('auto');
  const [selectedLine, setSelectedLine] = useState<number>();
  const [menu, setMenu] = useState<{ line: number; anchor: HTMLElement }>();
  const [banks, setBanks] = useState<BankChoice[]>([]);
  const [bankTarget, setBankTarget] = useState(NEW_BANK);
  const [busy, setBusy] = useState(false);
  const [base] = useState(() => previewBase(target === 'paper' ? useWorksheetStore.getState().worksheet : undefined));
  const readOnly = useWorksheetStore((s) => s.readOnly);
  const openDocId = useWorksheetStore((s) => s.worksheet.id);
  const [cache] = useState<PreviewCache>(() => new Map());

  // The banks Add to 題庫 can write: never the open document (the editor saves it).
  useEffect(() => {
    let live = true;
    void worksheetStore
      .list()
      .then((rows) => {
        if (!live) return;
        const choices = bankChoices(rows.filter((row) => row.kind === 'bank' && (target === 'bank' || row.id !== openDocId)));
        setBanks(choices);
        setBankTarget(choices[0]?.id ?? NEW_BANK);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [target, openDocId]);

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

  // ⌘Z takes back the last fix, and never reaches the document behind the dialog.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const action = undoChord(event);
      if (!action || isTyping()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (action === 'undo' && read) undoLast();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [read, undoLast]);

  // ---- pictures: pasted, dropped or chosen; each becomes an image pin after its line ----

  const [dropLine, setDropLine] = useState<number>();
  const fileInput = useRef<HTMLInputElement>(null);
  const chooseFor = useRef<number | undefined>(undefined);
  const selectedRef = useRef(selectedLine);
  useLayoutEffect(() => {
    selectedRef.current = selectedLine;
  });

  const addPictures = useCallback(
    (line: number, files: File[]) => {
      for (const file of files) {
        // The same reduction every stored picture takes (§ `prepareImageForStorage`).
        imageBlockFromFile(file)
          .then((block) => addPin(imagePin(line, block, newId())))
          .catch(() => notices.notify({ id: 'paste-picture', tone: 'error', body: m.pictureUnreadable }));
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
      const files = imageFiles(event.clipboardData);
      if (files.length === 0) return;
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
      const files = imageFiles(event.dataTransfer);
      if (line === undefined || files.length === 0) return;
      setSelectedLine(line);
      addPictures(line, files);
    },
  };

  // ---- step 1 ----

  const proceed = (input: { plain?: string; html?: string }) => {
    const next = readPaste(input);
    const verdict = pasteVerdict(review(next, [], 'auto'));
    const enter = () => {
      setRead(next);
      setPins([]);
      setLanguage('auto');
      setSelectedLine(undefined);
      notices.dismiss('paste-kind');
    };
    if (verdict !== 'ok') {
      notices.notify({
        id: 'paste-kind',
        tone: 'warning',
        body: verdict === 'empty' ? m.emptyPaste : verdict === 'scan' ? m.scanPaste : m.scanOcr,
        ...(verdict === 'ocr' ? { actions: [{ label: m.reviewAnyway, run: enter }] } : {}),
      });
      return;
    }
    enter();
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

  const selectedQuestion = selectedLine !== undefined ? analysis?.roles[selectedLine]?.question : undefined;

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
    const q = latest.current.analysis?.roles[line]?.question;
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

  // ---- actions ----

  const builds = batch?.builds ?? [];
  const noAnswer = places.noAnswer.length;
  const canInsert = target === 'paper' && !readOnly && builds.length > 0 && !busy;

  const insert = () => {
    if (!batch || !canInsert) return;
    const store = useWorksheetStore.getState();
    const report = store.insertQuestionBatch(batch.builds, { worksheetId: store.worksheet.id, ...(batch.lead ? { lead: batch.lead } : {}) });
    if (!report.ok) {
      notices.notify({ id: 'paste-result', tone: 'error', body: m.insertRefused });
      return;
    }
    const committed = report.committed;
    const live = () => useWorksheetStore.getState().worksheet === committed;
    store.select(report.questionIds[0]);
    notify({
      tone: 'success',
      body: m.inserted(report.questionIds.length) + (noAnswer > 0 ? m.noAnswerAfter(noAnswer) : ''),
      actions: [{ label: m.undo, run: () => live() && useWorksheetStore.getState().undo(), live }],
      autoHide: true,
    });
    onClose();
  };

  const addBank = () => {
    if (!batch || builds.length === 0 || busy) return;
    const questions = batch.builds.map(materialize).filter((q): q is Question => q !== undefined);
    const newName = nextBankName(banks.map((b) => b.name));
    const to = bankTarget === NEW_BANK ? { name: newName } : bankTarget;
    const run = exclusive ?? (<T,>(work: () => Promise<T>) => work());
    setBusy(true);
    run(() => addToBank(questions, to, { openDocId: target === 'paper' ? openDocId : '' }))
      .then(({ bank, copied, already }) => {
        onBankChanged?.();
        const name = worksheetTitle(bank);
        const body =
          copied === 0
            ? m.bankHadAll(name)
            : m.addedToBank(copied, name) + (already.length > 0 ? m.skippedDuplicates(already.length) : '') + (batch.lead ? m.stimulusNotInBank : '');
        notify({ tone: copied === 0 ? 'info' : 'success', body });
        onClose();
      })
      .catch(() => {
        setBusy(false);
        notices.notify({ id: 'paste-result', tone: 'error', body: m.bankFailed });
      });
  };

  const pasteAgain = () => {
    setRead(undefined);
    setPins([]);
    setDraft('');
  };

  // ---- render ----

  const reason =
    builds.length === 0 ? m.nothingToImport : target === 'paper' && readOnly ? m.readOnly : batch && batch.skipped.length > 0 ? m.leftOut(batch.skipped.length) : undefined;

  const footer = !read ? (
    <>
      <Button variant="subtle" onClick={onClose}>
        {m.cancel}
      </Button>
      <Button variant="primary" disabled={!draft.trim()} onClick={() => proceed({ plain: draft })}>
        {m.read}
      </Button>
    </>
  ) : (
    <>
      <Button variant="subtle" onClick={pasteAgain}>
        {m.pasteAgain}
      </Button>
      <span title={reason} className={`min-w-0 flex-1 truncate text-xs ${builds.length === 0 ? 'text-warn-ink' : 'text-ink-subtle'}`}>
        {reason}
      </span>
      <Button variant="subtle" onClick={onClose}>
        {m.cancel}
      </Button>
      {banks.length > 0 && (
        <select
          aria-label={m.bankTarget}
          value={bankTarget}
          onChange={(event) => setBankTarget(event.target.value)}
          className="h-[34px] max-w-[200px] cursor-pointer truncate rounded-lg border border-line bg-surface px-2 text-[13px] text-ink outline-none transition-colors duration-150 ease-out-soft hover:border-line-strong focus:border-accent focus:ring-2 focus:ring-accent/25"
        >
          {banks.map((bank) => (
            <option key={bank.id} value={bank.id}>
              {bank.name}
            </option>
          ))}
          <option value={NEW_BANK}>{m.newBank(nextBankName(banks.map((b) => b.name)))}</option>
        </select>
      )}
      <Button variant={target === 'bank' ? 'primary' : 'default'} disabled={builds.length === 0 || busy} onClick={addBank}>
        {busy ? m.busy : m.addToBank}
      </Button>
      {target === 'paper' && (
        <Button variant="primary" disabled={!canInsert} onClick={insert}>
          {m.insert}
        </Button>
      )}
    </>
  );

  const menuRow = menu && analysis ? analysis.roles[menu.line] : undefined;

  return (
    <Dialog title={m.title} size="large" scrollBody={false} onClose={onClose} footer={footer} noticeScope={notices.scope}>
      {!read || !analysis ? (
        <PasteStep text={m} draft={draft} onDraft={setDraft} onPaste={proceed} />
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
              const files = imageFiles(event.currentTarget);
              event.currentTarget.value = '';
              if (line !== undefined && files.length) {
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

function PasteStep({
  text: m,
  draft,
  onDraft,
  onPaste,
}: {
  text: Text;
  draft: string;
  onDraft: (value: string) => void;
  onPaste: (input: { plain?: string; html?: string }) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-5 py-4">
      <p className="max-w-[60ch] text-[13px] leading-relaxed text-ink-muted">{m.pasteDescription}</p>
      <label className="flex min-h-0 flex-1 flex-col gap-1.5">
        <span className="sr-only">{m.pasteLabel}</span>
        <textarea
          autoFocus
          value={draft}
          placeholder={m.pastePlaceholder}
          onChange={(event) => onDraft(event.target.value)}
          onPaste={(event) => {
            // Both flavours go to the engine; the HTML is read as text, never put in the page.
            event.preventDefault();
            onPaste(pasteInput(event.clipboardData));
          }}
          className="scroll-slim min-h-[240px] flex-1 resize-none rounded-xl border border-dashed border-line-strong bg-surface-sunken px-4 py-3 text-[13px] leading-relaxed text-ink outline-none transition-colors duration-150 ease-out-soft placeholder:text-ink-subtle focus:border-solid focus:border-accent focus:bg-surface focus:ring-2 focus:ring-accent/25"
        />
      </label>
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
