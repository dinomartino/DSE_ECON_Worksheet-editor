'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { pictureHome, type Flag, type PageChrome, type Pin, type Role } from '@/import';
import { UndecodableImageError, imageBlockFromFile } from '@/export/imageImport';
import { newId } from '@/model/factories';
import type { Side } from '@/model/textSlots';
import type { LanguageMode, Worksheet } from '@/model/types';
import type { NoticeInput } from '@/store/notices';
import { Button, IconButton } from '@/components/ui';
import { NoticeInsetSpacer } from '@/components/ui/Dialog';
import { UndoIcon } from '@/components/ui/icons';
import type { Messages } from '@/i18n/catalogue';
import { nextRow, rowsByQuestion, sheetPinKey, type AnswerRow, type AnswerSummary, type PaperReview, type PaperState } from './importBatch';
import type { IMPORT_MESSAGES } from './messages';
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
  withoutPin,
  withPin,
  type CheckPlace,
  type Language,
} from './pasteSession';
import { previewItems, type PreviewCache } from './previewDoc';
import { ReviewLines, RoleMenu, type LineView } from './ReviewLines';
import { ReviewPreview, type FigureActions, type PreviewCard } from './ReviewPreview';
import { ChromeReview } from './ChromeReview';
import { importedMarks } from './fileImport';

/**
 * One paper's review: the file's lines with a role chip each (left), the questions as they
 * will print (right). A fix is a `Pin` and re-solves at once. With an answers file, its
 * pins come first (`paperReview`), a bar sums up what they set, and each scheme shows as
 * a badge on its question's first line that leaves it out.
 */

type Text = Messages<typeof IMPORT_MESSAGES>;

export function flagText(m: Text, flag: Flag): string {
  const key = FLAG_TEXT[flag.kind];
  return key === 'flagOptionCount' ? m.flagOptionCount(flag.detail ?? 0) : m[key];
}

/** A row about the answers, in the teacher's words. */
export function answerRowText(m: Text, row: AnswerRow): string {
  const q = m.questionRef(`${row.where.question}${row.where.part ?? ''}`, row.where.section ?? '');
  switch (row.kind) {
    case 'missing':
    case 'missingPart':
      return m.rowMissing(q);
    case 'conflict':
      return m.rowConflict(q, row.paperLetter ?? '?', row.sheetLetter ?? '?');
    case 'outOfRange':
      return m.rowOutOfRange(q, row.sheetLetter ?? '?', row.options ?? 0);
    case 'noLetter':
      return m.rowNoLetter(q);
    case 'notWritten':
      return m.rowNotWritten(q);
    case 'needsPart':
      return m.rowNeedsPart(q);
    case 'noSuchQuestion':
      return m.rowNoSuchQuestion(q);
    case 'noSuchPart':
      return m.rowNoSuchPart(q);
    case 'duplicate':
      return m.rowDuplicate(q);
    case 'several':
      return m.rowSeveral(q, (row.letters ?? []).join(m.or), row.letters?.[0] ?? '?');
    case 'marks':
      return m.rowMarks(q, row.marks?.sheet ?? 0, row.marks?.paper ?? 0);
  }
}

const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii'];

/** A scheme pin's badge: Scheme when it carries marks, else Answer; with its part. */
function schemeBadge(m: Text, pin: Extract<Pin, { kind: 'scheme' }>, mc: boolean): string {
  const marked = pin.each !== undefined || pin.max !== undefined || pin.points.some((p) => p.marks !== undefined);
  const where = `${pin.part !== undefined ? `(${String.fromCharCode(97 + pin.part)})` : ''}${pin.subPart !== undefined ? `(${ROMAN[pin.subPart] ?? pin.subPart + 1})` : ''}`;
  return `${marked && !mc ? m.schemeBadge : m.answerTextBadge}${where ? ` ${where}` : ''}`;
}

export function ReviewStep({
  text: m,
  result,
  state,
  update,
  answers,
  base,
  cache,
  notify,
  chrome,
}: {
  text: Text;
  result: PaperReview;
  state: PaperState;
  update: (fn: (state: PaperState) => PaperState) => void;
  /** The answers file this paper is matched with, and what it set. */
  answers?: { name: string; summary: AnswerSummary };
  base: Worksheet;
  cache: PreviewCache;
  notify: (notice: NoticeInput & { id: string }) => void;
  /** The file's header, footer and title block, drawn above the questions. */
  chrome?: { value: PageChrome; language: LanguageMode; keepPreset: boolean; onKeepPreset: (keep: boolean) => void };
}) {
  const { analysis, batch, preview: shown } = result;
  const totalMarks = useMemo(() => importedMarks(batch), [batch]);
  const pins = state.pins;
  const [selectedLine, setSelectedLine] = useState<number>();
  const [menu, setMenu] = useState<{ line: number; anchor: HTMLElement }>();
  const items = useMemo(() => previewItems(base, analysis, shown, cache), [analysis, shown, base, cache]);
  const places = useMemo(() => checkPlaces(analysis), [analysis]);

  const latest = useRef({ analysis, sheetPins: result.sheetPins });
  useLayoutEffect(() => {
    latest.current = { analysis, sheetPins: result.sheetPins };
  });

  const addPin = useCallback(
    (pin: Pin) => {
      const current = latest.current.analysis;
      update((s) => ({ ...s, pins: withPin(s.pins, pin, current), undo: [...s.undo, 'pin'] }));
    },
    [update],
  );
  const removePin = useCallback(
    (pin: Pin) => {
      // A scheme badge is the answers file's: leaving it out is a fix ⌘Z takes back.
      if (latest.current.sheetPins.includes(pin)) {
        update((s) => ({ ...s, dropped: [...s.dropped, sheetPinKey(pin)], undo: [...s.undo, 'drop'] }));
        return;
      }
      update((s) => ({ ...s, pins: withoutPin(s.pins, pin) }));
    },
    [update],
  );
  const undoLast = useCallback(() => update(undoFix), [update]);

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
        if (others.length) notify({ id: 'paste-picture', tone: 'warning', body: m.notAPicture });
        return;
      }
      // A line after the last question has nowhere to put a picture.
      if (pictureHome(current.outline, current.roles, line) === undefined) {
        notify({ id: 'paste-picture', tone: 'warning', body: m.pictureNoQuestion });
        return;
      }
      for (const file of images) {
        // The same reduction every stored picture takes (§ `prepareImageForStorage`); one this
        // browser cannot draw (HEIC or TIFF in Chrome) is refused rather than stored unseen.
        imageBlockFromFile(file, undefined, { decodedOnly: true })
          .then((block) => addPin(imagePin(line, block, newId())))
          .catch((error: unknown) =>
            notify({
              id: 'paste-picture',
              tone: 'warning',
              body: !(error instanceof UndecodableImageError) ? m.pictureUnreadable : isHeic(file) ? m.pictureHeic : m.pictureUndecodable,
            }),
          );
      }
    },
    [addPin, notify, m],
  );

  const choosePicture = useCallback((line: number) => {
    chooseFor.current = line;
    fileInput.current?.click();
  }, []);

  // ⌘V of a screenshot puts it after the selected line (or slot). Text pastes pass by.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = carriedFiles(event.clipboardData);
      if (files.images.length === 0 && files.others.length === 0) return;
      event.preventDefault();
      const line = selectedRef.current;
      if (line === undefined) notify({ id: 'paste-picture', tone: 'info', body: m.pickPlaceFirst });
      else addPictures(line, files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addPictures, notify, m]);

  const figures: FigureActions = useMemo(
    () => ({
      select: (line) => setSelectedLine(line),
      choose: choosePicture,
      dismiss: (line) => addPin({ kind: 'noPicture', line }),
      remove: (id) => update((s) => ({ ...s, pins: s.pins.filter((p) => !(p.kind === 'image' && p.id === id)) })),
    }),
    [choosePicture, addPin, update],
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

  // ---- what each pane shows ----

  const byLine = useMemo(() => flagsByLine(analysis), [analysis]);
  const answerRows = useMemo(() => rowsByQuestion(answers?.summary.rows ?? []), [answers]);
  const rows: LineView[] = useMemo(() => {
    const shownPins = [...pins, ...result.sheetPins];
    return analysis.lines.map((line, i) => {
      const here = pinsOn(shownPins, i);
      const q = analysis.roles[i].question;
      const mc = q !== undefined && analysis.outline.questions[q]?.kind === 'mc';
      return {
        line,
        role: analysis.roles[i].role,
        pinned: Boolean(analysis.roles[i].pinned),
        pins: here,
        ...(here.some((p) => p.kind === 'scheme') ? { pinLabels: here.map((p) => (p.kind === 'scheme' ? schemeBadge(m, p, mc) : '')) } : {}),
        // "No answer" belongs to the question (right pane), not to a line.
        flags: (byLine.get(i) ?? [])
          .filter((f) => f.kind !== 'noAnswer')
          .map((f) => flagText(m, f))
          .join('\n'),
        ...(q !== undefined ? { question: q } : {}),
        // A picture on a line outside every question opens the next one: say which.
        ...(q === undefined && here.some((p) => p.kind === 'image') ? { pictureTo: pictureHome(analysis.outline, analysis.roles, i) } : {}),
      };
    });
  }, [analysis, pins, result.sheetPins, byLine, m]);
  const cards: PreviewCard[] = useMemo(
    () =>
      items.map((item) => {
        const k = item.question;
        const q = k !== undefined ? analysis.outline.questions[k] : undefined;
        const flags = k === undefined ? [] : analysis.flags.filter((f) => f.question === k);
        const notes = k === undefined ? [] : (answerRows.get(k) ?? []).map((r) => answerRowText(m, r));
        return {
          item,
          start: k !== undefined ? batch.starts[k] : (analysis.outline.stimuli[0]?.start ?? 0),
          ...(q?.answer ? { answer: q.answer.index } : {}),
          side: q?.side ?? (item.language === 'zh' ? 'zh' : 'en'),
          flags: [...new Set([...flags.map((f) => flagText(m, f)), ...notes])].join('\n'),
          isMc: q?.kind === 'mc',
        };
      }),
    [analysis, batch, items, answerRows, m],
  );

  // A line outside every question selects the question a picture pasted there would open.
  const selectedQuestion = selectedLine !== undefined ? pictureHome(analysis.outline, analysis.roles, selectedLine) : undefined;

  // ---- linked scrolling: the pane under the pointer leads ----

  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const leader = useRef<'left' | 'right' | null>(null);
  const spans = useMemo(() => {
    const out = new Map<number, [number, number]>();
    analysis.roles.forEach((r, i) => {
      if (r.question === undefined) return;
      const s = out.get(r.question);
      out.set(r.question, s ? [Math.min(s[0], i), Math.max(s[1], i)] : [i, i]);
    });
    return out;
  }, [analysis]);

  useEffect(() => {
    const left = leftRef.current;
    const right = rightRef.current;
    if (!left || !right) return;
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
    const q = pictureHome(current.outline, current.roles, line);
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
  const goToLine = (line: number | undefined) => {
    if (line === undefined) return;
    leader.current = null;
    setSelectedLine(line);
    reveal(line, true);
  };
  const goTo = (place: CheckPlace | undefined) => goToLine(place?.line);

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
      const start = latest.current.analysis.outline.questions[question]?.start;
      if (start !== undefined) addPin({ kind: 'answer', line: start, index });
    },
    [addPin],
  );
  const onLanguage = useCallback(
    (question: number, side: Side) => {
      const q = latest.current.analysis.outline.questions[question];
      if (q && q.side !== side) addPin({ kind: 'language', line: q.start, side });
    },
    [addPin],
  );
  // "For all" means all: a question's own switch gives way.
  const setAllLanguage = (next: Language) => update((s) => ({ ...s, language: next, pins: s.pins.filter((p) => p.kind !== 'language') }));

  const menuRow = menu ? analysis.roles[menu.line] : undefined;

  return (
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
        questions={batch.builds.length}
        check={places.check}
        noAnswer={places.noAnswer}
        selectedLine={selectedLine}
        language={state.language}
        fixes={Math.max(state.undo.length, pins.length)}
        onNext={goTo}
        onLanguage={setAllLanguage}
        onUndo={undoLast}
      />
      {answers && <AnswersBar text={m} name={answers.name} summary={answers.summary} onGo={goToLine} />}
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
            {...(chrome
              ? {
                  top: (layout) => (
                    <ChromeReview
                      text={m}
                      chrome={chrome.value}
                      language={chrome.language}
                      totalMarks={totalMarks}
                      keepPreset={chrome.keepPreset}
                      onKeepPreset={chrome.onKeepPreset}
                      layout={layout}
                    />
                  ),
                }
              : {})}
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
  );
}

/** ⌘Z: the last fix, or the last answers-file pin left out. */
export function undoFix(state: PaperState): PaperState {
  const last = state.undo[state.undo.length - 1];
  const undo = state.undo.slice(0, -1);
  if (last === 'drop') return { ...state, dropped: state.dropped.slice(0, -1), undo };
  return { ...state, pins: state.pins.slice(0, -1), undo };
}

function ReviewBar({
  text: m,
  questions,
  check,
  noAnswer,
  selectedLine,
  language,
  fixes,
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
  fixes: number;
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
      <IconButton label={`${m.undoFix} (${m.undoFixHint})`} disabled={fixes === 0} onClick={onUndo}>
        <UndoIcon size={14} />
      </IconButton>
    </div>
  );
}

/**
 * What the answers file set: "19 of 19 MC answers set from <file> · 8 marking schemes ·
 * 2 to check". Next to check steps through the rows and says each one.
 */
function AnswersBar({ text: m, name, summary, onGo }: { text: Text; name: string; summary: AnswerSummary; onGo: (line: number | undefined) => void }) {
  const [at, setAt] = useState<number>();
  const rows = summary.rows;
  const current = at !== undefined ? rows[at] : undefined;
  const parts = [
    summary.mc > 0 ? m.mcFromFile(summary.mcSet, summary.mc, name) : m.answersFromFile(name),
    ...(summary.schemes > 0 ? [m.schemeCount(summary.schemes)] : []),
  ];
  return (
    <div data-answers-bar className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-line bg-surface px-4 py-1.5">
      <p className="min-w-0 text-[12.5px] text-ink" role="status">
        <span className="font-medium">{parts.join(' · ')}</span>
        <span className="text-ink-muted"> · </span>
        <span className={rows.length > 0 ? 'font-medium text-warn-ink' : 'text-ink-muted'}>{rows.length > 0 ? m.toCheck(rows.length) : m.answersAllMatched}</span>
      </p>
      {rows.length > 0 && (
        <Button
          size="sm"
          variant="subtle"
          onClick={() => {
            const next = nextRow(rows, at);
            setAt(next);
            onGo(next !== undefined ? rows[next].line : undefined);
          }}
        >
          {m.nextToCheck} →
        </Button>
      )}
      {current && (
        <p key={at} className="min-w-0 flex-1 animate-fade-in truncate text-[12px] text-warn-ink" title={answerRowText(m, current)}>
          {answerRowText(m, current)}
        </p>
      )}
    </div>
  );
}
