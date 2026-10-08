'use client';

import { memo, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { Pin, Role, SourceLine } from '@/import';
import type { Messages } from '@/i18n/catalogue';
import { ImageIcon, WarningIcon } from '@/components/ui/icons';
import { PASTE_IMPORT_MESSAGES } from './messages';
import { CHIP, PINNABLE, roleForKey, type ChipTone } from './pasteSession';

/**
 * The left pane: the paste as pasted, one row per line, with the role the solver gave
 * it as a chip in the gutter. A chip opens the role menu; a row selects its question.
 * Fixes show on the chip (a ring) and as badges that take the fix back.
 */

type Text = Messages<typeof PASTE_IMPORT_MESSAGES>;

const TONE: Record<ChipTone, string> = {
  question: 'bg-accent-soft text-accent-ink',
  part: 'bg-ok-soft text-ok',
  option: 'bg-warn-soft text-warn-ink',
  quiet: 'bg-surface-sunken text-ink-muted',
  out: 'border border-dashed border-line-strong text-ink-subtle',
  text: 'text-ink-subtle',
};

export interface LineView {
  line: SourceLine;
  role: Role;
  pinned: boolean;
  /** The fixes on this line, for its badges. */
  pins: Pin[];
  flags: string;
  /** Its question index, for the selection. */
  question?: number;
}

export function ReviewLines({
  rows,
  selectedQuestion,
  selectedLine,
  scrollRef,
  text: m,
  onSelectLine,
  onChip,
  onRemovePin,
  dropLine,
  end,
}: {
  rows: LineView[];
  selectedQuestion?: number;
  selectedLine?: number;
  /** The line an image file is being dragged over. */
  dropLine?: number;
  scrollRef: RefObject<HTMLDivElement | null>;
  text: Text;
  onSelectLine: (line: number) => void;
  onChip: (line: number, anchor: HTMLElement) => void;
  onRemovePin: (pin: Pin) => void;
  /** Last in the scroller: the dialog's notice spacer. */
  end?: React.ReactNode;
}) {
  return (
    <div
      ref={scrollRef}
      data-lines-scroll
      role="list"
      aria-label={m.pastedLines}
      className="scroll-slim min-h-0 flex-1 overflow-y-auto py-2"
    >
      {rows.map((row) => (
        <LineRow
          key={row.line.i}
          row={row}
          inSelected={row.question !== undefined && row.question === selectedQuestion}
          selected={row.line.i === selectedLine}
          dropping={row.line.i === dropLine}
          text={m}
          onSelectLine={onSelectLine}
          onChip={onChip}
          onRemovePin={onRemovePin}
        />
      ))}
      {end}
    </div>
  );
}

const LineRow = memo(function LineRow({
  row,
  inSelected,
  selected,
  dropping,
  text: m,
  onSelectLine,
  onChip,
  onRemovePin,
}: {
  row: LineView;
  inSelected: boolean;
  selected: boolean;
  dropping: boolean;
  text: Text;
  onSelectLine: (line: number) => void;
  onChip: (line: number, anchor: HTMLElement) => void;
  onRemovePin: (pin: Pin) => void;
}) {
  const { line, role, pinned, pins, flags } = row;
  if (line.blank || role === 'ignore') return <div role="listitem" data-line={line.i} className="h-2" aria-hidden />;
  const chip = CHIP[role];
  const name = m[chip.name] + (pinned ? m.pinnedSuffix : '');
  const out = chip.tone === 'out';
  const badges = pins.filter((p) => p.kind === 'newQuestion' || p.kind === 'join' || p.kind === 'image' || p.kind === 'noPicture');
  return (
    <div
      role="listitem"
      data-line={line.i}
      aria-current={selected || undefined}
      className={`relative flex items-start gap-2 py-[3px] pl-3 pr-3 transition-colors duration-150 ease-out-soft ${
        role === 'question' ? 'mt-1.5' : ''
      } ${selected ? 'bg-accent-soft/70' : inSelected ? 'bg-surface-sunken' : 'hover:bg-surface-hover'} ${
        dropping ? 'outline-dashed outline-2 -outline-offset-2 outline-accent' : ''
      }`}
    >
      {selected && <span aria-hidden className="absolute inset-y-0.5 left-0 w-0.5 rounded-full bg-accent" />}
      <button
        type="button"
        data-chip={line.i}
        title={name}
        aria-label={m.roleMenu(name)}
        aria-haspopup="menu"
        onClick={(event) => onChip(line.i, event.currentTarget)}
        className={`mt-px flex h-[18px] w-7 shrink-0 cursor-pointer items-center justify-center rounded-[5px] text-[10.5px] font-semibold tabular-nums transition-[filter] duration-150 ease-out-soft hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${TONE[chip.tone]} ${
          pinned ? 'ring-1 ring-inset ring-current' : ''
        }`}
      >
        {chip.code}
      </button>
      <button
        type="button"
        onClick={() => onSelectLine(line.i)}
        className={`min-w-0 flex-1 cursor-pointer whitespace-pre-wrap break-words text-left text-[12.5px] leading-[1.45] [tab-size:3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
          out ? 'text-ink-subtle' : role === 'question' ? 'font-medium text-ink' : 'text-ink'
        }`}
      >
        {line.raw || (line.image ? <ImageIcon size={13} className="inline text-ink-subtle" /> : null)}
      </button>
      {badges.map((pin) => {
        const label = BADGE[pin.kind as keyof typeof BADGE](m);
        return (
          <button
            key={pin.kind === 'image' ? pin.id : pin.kind}
            type="button"
            onClick={() => onRemovePin(pin)}
            title={m.removeBadge(label)}
            aria-label={m.removeBadge(label)}
            className="mt-px shrink-0 cursor-pointer rounded-full bg-accent-soft px-1.5 py-px text-[10.5px] text-accent-ink transition-colors duration-150 ease-out-soft hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {label} ×
          </button>
        );
      })}
      {flags && (
        <span title={flags} className="mt-0.5 shrink-0 text-warn-ink">
          <WarningIcon size={13} />
          <span className="sr-only">{flags}</span>
        </span>
      )}
    </div>
  );
});

const BADGE = {
  newQuestion: (m: Text) => m.newQuestionBadge,
  join: (m: Text) => m.joinedBadge,
  image: (m: Text) => m.pictureBadge,
  noPicture: (m: Text) => m.noPictureBadge,
};

/**
 * The role menu at a chip: the eight roles with their keys, a new question here, a join
 * with the line above, and, on a fixed line, undoing that fix. Letter keys pick; arrows
 * move; Esc closes and goes back to the chip.
 */
export function RoleMenu({
  anchor,
  line,
  role,
  pins,
  canJoin,
  text: m,
  onRole,
  onNewQuestion,
  onJoin,
  onPicture,
  onRemovePin,
  onClose,
}: {
  anchor: HTMLElement;
  line: number;
  role: Role;
  pins: Pin[];
  canJoin: boolean;
  text: Text;
  onRole: (role: Role) => void;
  onNewQuestion: () => void;
  onJoin: () => void;
  /** Add a picture after this line (opens a file chooser). */
  onPicture: () => void;
  onRemovePin: (pin: Pin) => void;
  onClose: (refocus: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const rolePin = pins.find((p) => p.kind === 'role');
  const starts = pins.some((p) => p.kind === 'newQuestion');
  const joins = pins.some((p) => p.kind === 'join');

  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const at = anchor.getBoundingClientRect();
    const height = menu.offsetHeight;
    let top = at.bottom + 4;
    if (top + height > window.innerHeight - 8) top = Math.max(8, at.top - 4 - height);
    menu.style.top = `${top}px`;
    menu.style.left = `${Math.min(at.left, window.innerWidth - menu.offsetWidth - 8)}px`;
    menu.style.visibility = 'visible';
    (menu.querySelector<HTMLElement>('[aria-checked="true"]') ?? menu.querySelector<HTMLElement>('[role^="menuitem"]'))?.focus();
  }, [anchor]);

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node) && !anchor.contains(event.target as Node)) onClose(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [anchor, onClose]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose(true);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const items = [...(ref.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])') ?? [])];
      const at = items.indexOf(document.activeElement as HTMLElement);
      items[(at + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
      return;
    }
    const picked = event.key.length === 1 ? roleForKey(event.key) : undefined;
    if (picked) {
      event.preventDefault();
      event.stopPropagation();
      onRole(picked);
    }
  };

  const item =
    'flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-ink transition-colors duration-100 ease-out-soft hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none disabled:cursor-default disabled:opacity-40';
  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={m.roleMenu(m[CHIP[role].name])}
      data-role-menu={line}
      onKeyDown={onKeyDown}
      className="zone-light fixed z-[60] w-64 animate-pop-in rounded-xl border border-line bg-surface-raised p-1 shadow-xl"
      style={{ top: 0, left: 0, visibility: 'hidden', transformOrigin: 'left top' }}
    >
      {PINNABLE.map((entry) => (
        <button
          key={entry.role}
          type="button"
          role="menuitemradio"
          aria-checked={entry.role === role}
          onClick={() => onRole(entry.role)}
          className={item}
        >
          <span
            aria-hidden
            className={`flex h-[18px] w-6 shrink-0 items-center justify-center rounded-[5px] text-[10.5px] font-semibold ${TONE[CHIP[entry.role].tone]}`}
          >
            {entry.key}
          </span>
          <span className={`min-w-0 flex-1 truncate ${entry.role === role ? 'font-semibold' : ''}`}>{m[entry.name]}</span>
          <kbd className="shrink-0 font-sans text-[11px] text-ink-subtle">{entry.key}</kbd>
        </button>
      ))}
      <div className="my-1 h-px bg-line" />
      <button type="button" role="menuitemcheckbox" aria-checked={starts} onClick={onNewQuestion} className={item}>
        <span className="min-w-0 flex-1">{m.newQuestionHere}</span>
        {starts && <span aria-hidden className="text-accent-ink">✓</span>}
      </button>
      <button type="button" role="menuitemcheckbox" aria-checked={joins} disabled={!canJoin} onClick={onJoin} className={item}>
        <span className="min-w-0 flex-1">{m.joinAbove}</span>
        {joins && <span aria-hidden className="text-accent-ink">✓</span>}
      </button>
      <button type="button" role="menuitem" onClick={onPicture} className={item}>
        <ImageIcon size={14} className="shrink-0 text-ink-muted" />
        <span className="min-w-0 flex-1">{m.addPicture}</span>
      </button>
      {rolePin && (
        <>
          <div className="my-1 h-px bg-line" />
          <button type="button" role="menuitem" onClick={() => onRemovePin(rolePin)} className={item}>
            {m.removeFix}
          </button>
        </>
      )}
    </div>,
    document.body,
  );
}
