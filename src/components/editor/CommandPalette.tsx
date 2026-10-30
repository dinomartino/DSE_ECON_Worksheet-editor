'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { create } from 'zustand';
import { SearchIcon } from '@/components/ui/icons';
import { isModalLayerOpen, useModalLayer } from '@/components/ui/modalLayer';
import { sideOf } from '@/i18n/catalogue';
import { useMessages, useUiLanguage } from '@/i18n/language';
import { flowItemLabel } from '@/model/flow';
import { computeNumbering } from '@/model/numbering';
import { useWorksheetStore } from '@/store/worksheetStore';
import { COMMAND_PALETTE_MESSAGES } from './CommandPalette.messages';
import { buildCommands, type Command } from './commands';
import { searchCommands } from './commandSearch';
import { isImeKeydown } from '@/components/ui/ime';

/**
 * ⌘K / Ctrl+K, and the 🔍 in the top bar for a touch screen (k-0201): one box that finds every
 * insert, Setup setting, export and view by its name in either language or by Word's word
 * for it ("page break" → New page, "font" → Setup › Fonts). Enter or a click runs it.
 */

export const useCommandPalette = create<{ open: boolean }>(() => ({ open: false }));

export function openCommandPalette(): void {
  useCommandPalette.setState({ open: true });
}

/** ⌘K / Ctrl+K, without Shift or Alt. */
export function isCommandPaletteKey(event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>): boolean {
  return (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'k';
}

export function CommandPalette() {
  const open = useCommandPalette((s) => s.open);

  // The key works everywhere in the editor, a text open on the page included (capture phase:
  // an open field stops its keys), but not over another dialog; pressed again it closes.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || !isCommandPaletteKey(event)) return;
      const showing = useCommandPalette.getState().open;
      if (!showing && isModalLayerOpen()) return;
      event.preventDefault();
      event.stopPropagation();
      useCommandPalette.setState({ open: !showing });
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  return open ? <PaletteBox onClose={() => useCommandPalette.setState({ open: false })} /> : null;
}

function PaletteBox({ onClose }: { onClose: () => void }) {
  useModalLayer();
  const m = useMessages(COMMAND_PALETTE_MESSAGES);
  const side = sideOf(useUiLanguage());
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  // Read once, on opening: the palette is a moment, not a view that follows edits.
  const [commands] = useState<Command[]>(() => {
    const { worksheet, readOnly, insertAnchorId } = useWorksheetStore.getState();
    const numbering = computeNumbering(worksheet);
    return buildCommands({
      worksheet,
      readOnly,
      afterId: insertAnchorId,
      labelFor: (id) => flowItemLabel(worksheet, id, (questionId) => numbering.byQuestionId.get(questionId)?.number),
    });
  });
  const results = useMemo(() => searchCommands(commands, query), [commands, query]);
  const current = Math.min(active, Math.max(0, results.length - 1));

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    document.getElementById(`${listId}-${current}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [current, listId]);

  // Closed first, so a dialog it opens is not under it; in the same event, so Picture…'s file
  // chooser still counts as the teacher's click.
  const run = (command: Command | undefined) => {
    if (!command) return;
    onClose();
    command.run();
  };

  return (
    <div
      data-print-hide
      data-command-palette
      className="fixed inset-0 z-[80] flex items-start justify-center bg-black/20 px-3 pt-[12vh] animate-fade-in"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={m.open}
        className="flex max-h-[70vh] w-full max-w-[560px] animate-pop-in flex-col overflow-hidden rounded-2xl border border-line bg-surface-raised shadow-2xl"
      >
        <label className="flex items-center gap-2.5 border-b border-line px-4">
          <SearchIcon size={16} />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={results.length ? `${listId}-${current}` : undefined}
            aria-label={m.open}
            placeholder={m.placeholder}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (isImeKeydown(event.nativeEvent)) return;
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActive((current + 1) % Math.max(1, results.length));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActive((current - 1 + results.length) % Math.max(1, results.length));
              } else if (event.key === 'Enter') {
                event.preventDefault();
                run(results[current]);
              } else if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                onClose();
              }
            }}
            className="h-12 min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-subtle"
          />
        </label>
        <ul id={listId} role="listbox" aria-label={m.results} className="scroll-slim min-h-0 flex-1 overflow-y-auto p-1.5">
          {results.length === 0 && <li className="px-3 py-6 text-center text-[13px] text-ink-muted">{m.noResults}</li>}
          {results.map((command, index) => (
            <li
              key={command.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === current}
              data-command={command.id}
              onMouseMove={() => index !== current && setActive(index)}
              onClick={() => run(command)}
              className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 ${index === current ? 'bg-accent-soft' : ''}`}
            >
              <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">{command.label[side]}</span>
              <span className="shrink-0 truncate text-[11.5px] text-ink-subtle">{command.where[side]}</span>
              {command.shortcut && (
                <kbd className="shrink-0 rounded border border-line px-1.5 font-sans text-[11px] text-ink-muted">{command.shortcut}</kbd>
              )}
            </li>
          ))}
        </ul>
        <p className="hidden border-t border-line px-4 py-2 text-[11px] text-ink-subtle sm:block">{m.keys}</p>
      </div>
    </div>
  );
}
