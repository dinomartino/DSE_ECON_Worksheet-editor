'use client';

import { useEffect, useRef, useState } from 'react';
import { studioJob } from '@/ai/credits';
import { AiStatusChip } from '@/components/ai/AiStatusChip';
import { CreditEstimate } from '@/components/ai/CreditEstimate';
import { SlidersIcon } from '@/components/ui/icons';
import { isImeKeydown } from '@/components/ui/ime';
import { useMessages } from '@/i18n/language';
import type { LanguageMode } from '@/model/types';
import type { Level } from '@/questionStudio/types';
import { QUESTION_STUDIO_MESSAGES } from '../messages';
import { STUDIO_CHAT_MESSAGES } from './chat.messages';
import { useDismiss } from '../dismiss';
import { CHAT_COUNTS, type Chat, type ChatCount, type ChatSettings } from './chatTypes';

const seg = (on: boolean) =>
  `cursor-pointer rounded-md px-2.5 py-1 text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${on ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'}`;

/**
 * The chat's input: the references and the draft it is about as chips, the message, and a
 * small ⚙ with how many, the level and the language (none of it required). Enter sends;
 * Shift+Enter is a new line; Send turns into Stop while the AI works. Nothing is ever typed
 * into the box for the teacher (k-0528): with a reference and an empty box, Send means "N more
 * like this" and the placeholder says so; ✎ Describe shows its example as the placeholder.
 * The ⚙ popover closes on a press outside, Esc or focus leaving it; a choice keeps it open.
 */
export function Composer({
  chat,
  running,
  draft,
  text,
  onText,
  onClearDraft,
  onSend,
  onStop,
  onAddReference,
  onRemoveReference,
  onSettings,
  suggestions,
  hint,
}: {
  chat: Chat;
  running: boolean;
  /** The draft the next message is about ("Ask about this"). */
  draft?: { id: string; no: number };
  text: string;
  onText: (text: string) => void;
  onClearDraft: () => void;
  onSend: (text: string) => void;
  onStop: () => void;
  onAddReference: () => void;
  onRemoveReference: (id: string) => void;
  onSettings: (patch: Partial<ChatSettings>) => void;
  suggestions: string[];
  /** An example shown as the placeholder (✎ Describe); a new `at` puts the caret in the box. */
  hint?: { text: string; at: number };
}) {
  const m = useMessages(STUDIO_CHAT_MESSAGES);
  const q = useMessages(QUESTION_STUDIO_MESSAGES);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const settingsPop = useRef<HTMLDivElement>(null);
  useDismiss(settingsOpen, () => setSettingsOpen(false), [settingsPop, settingsButton], settingsButton);
  const mine = chat.refs.filter((r) => r.who === 'you');
  const { count, level, language } = chat.settings;
  const levelWord = level === 'harder' ? q.levelHarder : level === 'easier' ? q.levelEasier : m.levelSameLong;
  const langWord = language === 'en' ? q.langEn : language === 'zh' ? q.langZh : q.langBoth;
  const canSend = !running && (text.trim().length > 0 || (mine.length > 0 && !draft));

  useEffect(() => {
    if (draft) box.current?.focus();
  }, [draft]);
  // A reference just added, or ✎ Describe: the caret waits in the (empty) box.
  const refCount = useRef(mine.length);
  useEffect(() => {
    if (mine.length > refCount.current) box.current?.focus();
    refCount.current = mine.length;
  }, [mine.length]);
  useEffect(() => {
    if (hint) box.current?.focus();
  }, [hint]);
  const placeholder = draft ? m.placeholderDraft(draft.no) : mine.length > 0 ? m.placeholderRef(count) : hint ? hint.text : m.placeholder;

  const send = () => {
    if (!canSend) return;
    onSend(text);
  };

  return (
    <div className="relative shrink-0 border-t border-line bg-surface px-3 pb-3 pt-2.5" data-chat-composer>
      {suggestions.length > 0 && !running && (
        <div className="mb-2 flex flex-wrap gap-1.5" data-chat-suggestions>
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSend(s)}
              className="cursor-pointer rounded-full border border-line bg-surface px-2.5 py-0.5 text-[12px] text-ink-muted hover:border-line-strong hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {s}
            </button>
          ))}
        </div>
      )}
      {(mine.length > 0 || draft) && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {mine.map((r) => (
            <span key={r.source.id} className="inline-flex max-w-full items-center gap-1 rounded-md border border-accent/40 bg-accent-soft/60 px-1.5 py-0.5 text-[11.5px] text-ink" data-ref-chip={r.source.id}>
              ▣ {r.source.label}
              {r.source.hasFigure && <span className="text-ink-muted"> · {m.withDiagram}</span>}
              <button type="button" aria-label={m.removeReference(r.source.label)} onClick={() => onRemoveReference(r.source.id)} className="cursor-pointer px-0.5 text-ink-subtle hover:text-ink">
                ✕
              </button>
            </span>
          ))}
          {draft && (
            <span className="inline-flex items-center gap-1 rounded-md border border-line-strong bg-surface-sunken px-1.5 py-0.5 text-[11.5px] text-ink" data-draft-chip={draft.no}>
              ✦ {m.draftChip(draft.no)}
              <button type="button" aria-label={m.removeDraftChip} onClick={onClearDraft} className="cursor-pointer px-0.5 text-ink-subtle hover:text-ink">
                ✕
              </button>
            </span>
          )}
        </div>
      )}
      <div className="rounded-xl border border-line-strong bg-surface px-2.5 pb-1.5 pt-2 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25">
        <textarea
          ref={box}
          value={text}
          onChange={(event) => onText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !isImeKeydown(event.nativeEvent)) {
              event.preventDefault();
              send();
            }
          }}
          rows={2}
          maxLength={600}
          aria-label={m.message}
          placeholder={placeholder}
          className="block max-h-32 min-h-[40px] w-full resize-none bg-transparent text-[13px] leading-relaxed text-ink outline-none placeholder:text-ink-subtle"
          data-chat-input
        />
        <div className="mt-1 flex items-center gap-1">
          <button
            type="button"
            title={m.addReferenceTitle}
            onClick={onAddReference}
            disabled={running}
            className="inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-[12px] text-ink-muted hover:bg-surface-hover hover:text-ink disabled:opacity-50"
            data-add-reference
          >
            ＋ {m.addReference}
          </button>
          <button
            ref={settingsButton}
            type="button"
            title={m.settings}
            aria-expanded={settingsOpen}
            aria-haspopup="dialog"
            onClick={() => setSettingsOpen((v) => !v)}
            className="inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-[12px] text-ink-muted hover:bg-surface-hover hover:text-ink"
            data-chat-settings
          >
            <SlidersIcon size={14} /> {m.settingsSummary(count, levelWord, langWord)}
          </button>
          <span className="flex-1" />
          {running ? (
            <button type="button" onClick={onStop} aria-label={m.stop} title={m.stop} className="h-8 w-8 cursor-pointer rounded-lg bg-danger text-[13px] text-white hover:opacity-90" data-chat-stop>
              ■
            </button>
          ) : (
            <button
              type="button"
              onClick={send}
              disabled={!canSend}
              aria-label={m.send}
              title={m.send}
              className="h-8 w-8 cursor-pointer rounded-lg bg-cta text-[15px] text-on-cta hover:bg-cta-hover disabled:cursor-not-allowed disabled:opacity-40"
              data-chat-send
            >
              ↑
            </button>
          )}
        </div>
      </div>
      {/* What the AI is and what it has left, beside what this request costs (k-0524). */}
      {!running && (
        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1" data-chat-ai-status>
          <AiStatusChip />
          <CreditEstimate job={studioJob({ questions: count, sides: language === 'bilingual' ? 2 : 1 })} showLeft={false} className="!inline" />
        </div>
      )}
      {settingsOpen && (
        <div
          ref={settingsPop}
          role="dialog"
          aria-label={m.settings}
          className="absolute bottom-[calc(100%-6px)] left-3 z-20 grid w-[340px] grid-cols-[72px_1fr] items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-surface p-3 text-[12px] shadow-lg"
          data-chat-settings-pop
        >
          <span className="text-ink-muted">{q.count}</span>
          <div className="flex w-max gap-0.5 rounded-lg bg-surface-sunken p-0.5">
            {CHAT_COUNTS.map((n) => (
              <button key={n} type="button" className={seg(count === n)} aria-pressed={count === n} onClick={() => onSettings({ count: n as ChatCount })}>
                {n}
              </button>
            ))}
          </div>
          <span className="text-ink-muted">{q.level}</span>
          <div className="flex w-max gap-0.5 rounded-lg bg-surface-sunken p-0.5">
            {(['easier', 'same', 'harder'] as Level[]).map((l) => (
              <button key={l} type="button" className={seg(level === l)} aria-pressed={level === l} onClick={() => onSettings({ level: l })}>
                {l === 'easier' ? q.levelEasier : l === 'harder' ? q.levelHarder : q.levelSame}
              </button>
            ))}
          </div>
          <span className="text-ink-muted">{q.language}</span>
          <div className="flex w-max gap-0.5 rounded-lg bg-surface-sunken p-0.5">
            {(['en', 'zh', 'bilingual'] as LanguageMode[]).map((l) => (
              <button key={l} type="button" className={seg(language === l)} aria-pressed={language === l} onClick={() => onSettings({ language: l })}>
                {l === 'en' ? q.langEn : l === 'zh' ? q.langZh : q.langBoth}
              </button>
            ))}
          </div>
          <span />
          <span className="text-[11.5px] leading-snug text-ink-subtle">{m.settingsNote}</span>
        </div>
      )}
    </div>
  );
}
