'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useMessages } from '@/i18n/language';
import { notify } from '@/store/notices';
import type { Chat } from '../chat/chatTypes';
import { useDismiss } from '../dismiss';
import { reviewAvailable } from './available';
import type { ExportChat } from './exportFiles';
import { chatsFor, exportForReview, type ReviewScope } from './exportReview';
import { useReviewNotes } from './notes';
import { REVIEW_MESSAGES } from './review.messages';
import { TURN_TAGS, type TurnTag } from './types';

/**
 * The studio's review tools on screen (k-0598, develop builds on the desktop only): a Note box
 * with quick tags under every reply, one on the whole chat, and Export for review. Each wears a
 * small "Dev" mark: none of it is ever in a release build.
 */

/** Shown here (read after mounting: the static build has no window). */
export function useReviewAvailable(): boolean {
  return useSyncExternalStore(noSubscribe, () => reviewAvailable(), () => false);
}
const noSubscribe = () => () => undefined;

function DevMark() {
  const r = useMessages(REVIEW_MESSAGES);
  return (
    <span title={r.devTitle} className="shrink-0 rounded border border-dashed border-line-strong px-1 text-[10px] font-medium uppercase tracking-wide text-ink-subtle">
      {r.dev}
    </span>
  );
}

const TAG_TONE: Record<TurnTag, string> = {
  good: 'border-ok text-ok bg-[color-mix(in_srgb,var(--color-ok)_10%,transparent)]',
  wrong: 'border-danger text-danger-ink bg-[color-mix(in_srgb,var(--color-danger)_10%,transparent)]',
  unclear: 'border-line-strong text-ink bg-surface-sunken',
};

function Grow({ value, onChange, placeholder, autoFocus, label }: { value: string; onChange: (v: string) => void; placeholder: string; autoFocus?: boolean; label: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={2}
      value={value}
      autoFocus={autoFocus}
      aria-label={label}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="block w-full resize-none rounded-lg border border-line bg-surface px-2.5 py-1.5 font-sans text-[12.5px] leading-relaxed text-ink placeholder:text-ink-subtle focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
    />
  );
}

/** Under one reply: the quick tags and the Note box (open once it has words). */
export function TurnNoteBox({ chatId, turnId }: { chatId: string; turnId: string }) {
  const r = useMessages(REVIEW_MESSAGES);
  const note = useReviewNotes((s) => s.byChat[chatId]?.turns[turnId]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    void useReviewNotes.getState().load(chatId);
  }, [chatId]);
  const set = useReviewNotes.getState().setTurn;
  const shown = open || !!note?.text;
  const tagWord: Record<TurnTag, string> = { good: r.tagGood, wrong: r.tagWrong, unclear: r.tagUnclear };
  return (
    <div className="-mt-1 rounded-lg border border-dashed border-line px-2 py-1.5" data-review-note={turnId} data-print-hide>
      <div className="flex flex-wrap items-center gap-1.5">
        <DevMark />
        <button
          type="button"
          title={r.noteTitle}
          aria-expanded={shown}
          onClick={() => setOpen((v) => !v || !!note?.text)}
          className="cursor-pointer rounded-md px-1.5 py-0.5 text-[12px] font-medium text-ink-muted hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          data-review-note-toggle
        >
          ✎ {r.note}
          {note?.text && !open ? <span className="ml-1 font-normal text-ink-subtle">· {r.noted}</span> : null}
        </button>
        <span className="flex-1" />
        <span role="group" aria-label={r.tagsLabel} className="flex gap-1">
          {TURN_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              aria-pressed={note?.tag === tag}
              onClick={() => set(chatId, turnId, { tag: note?.tag === tag ? null : tag })}
              className={`cursor-pointer rounded-full border px-2 py-[1px] text-[11.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${note?.tag === tag ? TAG_TONE[tag] : 'border-line text-ink-muted hover:border-line-strong hover:text-ink'}`}
              data-review-tag={tag}
            >
              {tagWord[tag]}
            </button>
          ))}
        </span>
      </div>
      {shown && (
        <div className="mt-1.5">
          <Grow value={note?.text ?? ''} onChange={(text) => set(chatId, turnId, { text })} placeholder={r.notePlaceholder} autoFocus={open && !note?.text} label={r.note} />
        </div>
      )}
    </div>
  );
}

/** At the top of a chat: the note on the whole conversation. */
export function ChatNoteBox({ chatId }: { chatId: string }) {
  const r = useMessages(REVIEW_MESSAGES);
  const text = useReviewNotes((s) => s.byChat[chatId]?.chat ?? '');
  const [open, setOpen] = useState(false);
  useEffect(() => {
    void useReviewNotes.getState().load(chatId);
  }, [chatId]);
  const shown = open || !!text;
  return (
    <div className="rounded-lg border border-dashed border-line px-2 py-1.5" data-review-chat-note data-print-hide>
      <div className="flex items-center gap-1.5">
        <DevMark />
        <button
          type="button"
          aria-expanded={shown}
          onClick={() => setOpen((v) => !v || !!text)}
          className="cursor-pointer rounded-md px-1.5 py-0.5 text-[12px] font-medium text-ink-muted hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          ✎ {r.chatNote}
        </button>
      </div>
      {shown && (
        <div className="mt-1.5">
          <Grow value={text} onChange={(v) => useReviewNotes.getState().setChat(chatId, v)} placeholder={r.chatNotePlaceholder} autoFocus={open && !text} label={r.chatNote} />
        </div>
      )}
    </div>
  );
}

/** Export for review ▾: this chat, or every chat of both lists, into one .zip. */
export function ExportReviewButton({ chat, chats, list, disabled }: { chat: Chat; chats: readonly Chat[]; list: ExportChat['list']; disabled?: boolean }) {
  const r = useMessages(REVIEW_MESSAGES);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useDismiss(open, () => setOpen(false), [box], button);
  // Read only while the menu is open: the other list comes from this computer's storage.
  const all = open ? chatsFor('all', chat, chats, list) : [];
  const go = async (scope: ReviewScope) => {
    setOpen(false);
    const picked = chatsFor(scope, chat, chats, list);
    if (picked.every((c) => c.chat.turns.length === 0)) {
      notify({ id: 'studio-review', tone: 'info', body: r.exportEmpty });
      return;
    }
    setBusy(true);
    try {
      const done = await exportForReview(picked);
      if (done) notify({ id: 'studio-review', tone: 'success', body: r.exported(done.built.chats, done.built.recorded, done.built.replies) });
    } catch {
      notify({ id: 'studio-review', tone: 'error', body: r.exportFailed });
    } finally {
      setBusy(false);
    }
  };
  const item = 'block w-full cursor-pointer rounded-lg px-2.5 py-1.5 text-left text-[12.5px] text-ink hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50';
  return (
    <div ref={box} className="relative" data-print-hide>
      <button
        ref={button}
        type="button"
        title={r.exportTitle}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled || busy}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-line-strong px-2 py-0.5 text-[12.5px] text-ink-muted hover:bg-surface-sunken hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        data-review-export
      >
        <DevMark />
        {busy ? r.exporting : r.exportButton} ▾
      </button>
      {open && (
        <div role="menu" aria-label={r.exportButton} className="absolute right-0 top-[calc(100%+4px)] z-30 w-[280px] whitespace-normal rounded-xl border border-line bg-surface p-1.5 shadow-lg" data-review-export-menu>
          <button type="button" role="menuitem" className={item} disabled={chat.turns.length === 0} onClick={() => void go('this')} data-review-export-this>
            {r.exportThis}
          </button>
          <button type="button" role="menuitem" className={item} disabled={all.length === 0} onClick={() => void go('all')} data-review-export-all>
            {r.exportAll(all.length)}
          </button>
          <p className="px-2.5 pb-1 pt-1.5 text-[11px] leading-snug text-ink-subtle">{r.exportHint}</p>
        </div>
      )}
    </div>
  );
}
