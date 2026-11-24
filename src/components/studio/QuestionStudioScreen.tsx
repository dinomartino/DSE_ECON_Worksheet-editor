'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AiStatusChip } from '@/components/ai/AiStatusChip';
import { PastPaperIcon, PencilIcon } from '@/components/ui/icons';
import { useMessages } from '@/i18n/language';
import type { LanguageMode, Worksheet } from '@/model/types';
import type { WorksheetSummary } from '@/storage';
import { notify } from '@/store/notices';
import { STUDIO_CHAT_MESSAGES } from './chat/chat.messages';
import { summaryOf, type Chat } from './chat/chatTypes';
import { ChatTurns } from './chat/ChatTurns';
import { Composer } from './chat/Composer';
import { useChat } from './chat/live';
import { PaperCanvas } from './chat/PaperCanvas';
import { useDismiss } from './dismiss';
import { QUESTION_STUDIO_MESSAGES } from './messages';
import { ReferencePicker } from './ReferencePicker';
import { Tray } from './Tray';

/**
 * The Question studio 擬題工作室 (k-0516, the k-0513 redesign): a chat on the left and the
 * paper writing itself on the right. The teacher picks any past-paper question (or just says
 * what they need); the AI reads it, picks the key point itself (u-lm1c: no topic picker, a
 * Change link afterwards), writes drafts that stream onto the paper, and the teacher accepts
 * or rejects each before Add. Chats are kept on this computer (Chats ▾). The Trial kit lives
 * in Settings → AI. Shown in a develop build, hidden in a release build (`trial.ts`).
 */
export function QuestionStudioScreen({
  summaries,
  settings,
  onHome,
  onOpenWorksheet,
  onOpenDocument,
  onError,
}: {
  summaries: readonly WorksheetSummary[];
  settings?: ReactNode;
  onHome: () => void;
  onGoTo?: (view: 'pastpapers' | 'bank') => void;
  onOpenWorksheet: (worksheet: Worksheet, language: LanguageMode) => void;
  onOpenDocument: (docId: string, then?: () => void) => void;
  onError: (message: string) => void;
}) {
  const m = useMessages(STUDIO_CHAT_MESSAGES);
  const q = useMessages(QUESTION_STUDIO_MESSAGES);
  const chats = useChat((s) => s.chats);
  const activeId = useChat((s) => s.activeId);
  const run = useChat((s) => s.run);
  const items = useChat((s) => s.items);
  const chat = chats.find((c) => c.id === activeId) ?? chats[0];
  const store = useChat.getState();
  const [text, setText] = useState('');
  const [hint, setHint] = useState<{ text: string; at: number }>();
  const [aboutDraft, setAboutDraft] = useState<string>();
  const [picker, setPicker] = useState(false);
  const [focus, setFocus] = useState<{ id: string; at: number }>();
  const log = useRef<HTMLDivElement>(null);
  const running = run !== undefined;
  const runningHere = run?.chatId === chat.id ? run : undefined;
  const draftChip = chat.drafts.find((d) => d.id === aboutDraft);

  // The log follows the conversation as it grows.
  const turnsKey = `${chat.id}:${chat.turns.length}:${chat.turns.at(-1)?.role === 'ai' ? JSON.stringify((chat.turns.at(-1) as { steps: unknown[] }).steps.length) : ''}`;
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'smooth' });
  }, [turnsKey]);

  const send = (words: string) => {
    const said = words.trim() || (chat.drafts.length === 0 ? '' : words);
    void store.send(said, draftChip?.id);
    setText('');
    setHint(undefined);
    setAboutDraft(undefined);
  };

  const accepted = useMemo(() => chat.drafts.filter((d) => d.state === 'accepted'), [chat.drafts]);
  const openDraft = chat.drafts.find((d) => d.state === 'open');
  const suggestions = !running && openDraft ? [m.sugHarder(openDraft.no), m.userAnother(openDraft.no)] : [];

  return (
    <div className="zone-light flex h-full min-h-0 flex-col bg-surface text-ink" data-studio-screen data-print-hide>
      <header className="flex h-12 shrink-0 items-center gap-3 whitespace-nowrap border-b border-line bg-surface px-4">
        <button
          type="button"
          onClick={onHome}
          className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-ink-muted transition-colors duration-150 ease-out-soft hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          ← {q.home}
        </button>
        <h1 className="truncate text-[14px] font-semibold text-ink">{q.title}</h1>
        <span title={q.trialTitle} className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-muted">
          {q.trial}
        </span>
        <ChatsMenu chats={chats} activeId={chat.id} onOpen={(id) => store.openChat(id)} onDelete={(id) => store.deleteChat(id)} />
        <button
          type="button"
          onClick={() => {
            store.newChat();
            setText('');
            setHint(undefined);
            setAboutDraft(undefined);
          }}
          disabled={running}
          className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[13px] text-ink-muted hover:bg-surface-sunken hover:text-ink disabled:opacity-50"
          data-new-chat
        >
          ＋ {m.newChat}
        </button>
        <span className="flex-1" />
        <AiStatusChip where="header" />
        {settings}
      </header>

      <div className="flex min-h-0 flex-1">
        <section className="flex w-[380px] shrink-0 flex-col border-r border-line bg-surface" aria-label={m.chats} data-chat-column>
          <div ref={log} className="scroll-slim flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4" role="log" aria-live="polite">
            {chat.turns.length === 0 ? (
              <Welcome
                onPick={() => setPicker(true)}
                onDescribe={() => setHint({ text: m.describeHint, at: Date.now() })}
              />
            ) : (
              <ChatTurns
                chat={chat}
                runningTurn={runningHere?.turnId}
                language={chat.settings.language}
                onJump={(id) => setFocus({ id, at: Date.now() })}
                onRetry={(turnId) => void store.retry(turnId)}
                onDismiss={(turnId) => store.dismissError(turnId)}
                onChangePick={(code) => store.changePick(code)}
                onAnswer={(turnId, answer) => void store.answerRewrite(turnId, answer)}
              />
            )}
          </div>
          <Composer
            chat={chat}
            running={running}
            draft={draftChip ? { id: draftChip.id, no: draftChip.no } : undefined}
            text={text}
            onText={setText}
            onClearDraft={() => setAboutDraft(undefined)}
            onSend={send}
            onStop={() => store.stop()}
            onAddReference={() => setPicker(true)}
            onRemoveReference={(id) => store.removeReference(id)}
            onSettings={(patch) => store.setSettings(patch)}
            suggestions={suggestions}
            hint={hint}
          />
        </section>

        <PaperCanvas
          chat={chat}
          run={runningHere}
          items={items}
          language={chat.settings.language}
          focus={focus}
          onAccept={(d) => store.setDraftState(d.id, d.state === 'accepted' ? 'open' : 'accepted')}
          onReject={(d) => store.setDraftState(d.id, d.state === 'rejected' ? 'open' : 'rejected')}
          onChange={(d, how) => void store.change(d.id, how)}
          onAsk={(d) => setAboutDraft(d.id)}
          onRestore={(d, index) => store.restoreVersion(d.id, index)}
          onShowReference={() => setPicker(true)}
          footer={
            <Tray
              items={accepted.map((d) => d.entry)}
              busyRun={running}
              onDelivered={(from) => store.delivered(accepted.filter((d) => from.includes(d.entry)).map((d) => d.id))}
              onClear={() => accepted.forEach((d) => store.setDraftState(d.id, 'open'))}
              summaries={summaries}
              onOpenWorksheet={onOpenWorksheet}
              onOpenDocument={onOpenDocument}
              onError={onError}
            />
          }
        />
      </div>

      <ReferencePicker
        open={picker}
        language={chat.settings.language}
        onClose={() => setPicker(false)}
        onPick={(source, keyPoint, item) => {
          // Nothing is typed into the box (k-0528): an empty box + a reference sends "N like this".
          if (!store.addReference(source, keyPoint, item)) notify({ id: 'studio-full', tone: 'info', body: m.full });
        }}
      />
    </div>
  );
}

function Welcome({ onPick, onDescribe }: { onPick: () => void; onDescribe: () => void }) {
  const m = useMessages(STUDIO_CHAT_MESSAGES);
  const start =
    'flex w-full cursor-pointer items-start gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 text-left hover:border-accent hover:ring-2 hover:ring-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50';
  return (
    <div className="text-[13px] leading-relaxed" data-chat-welcome>
      <div className="mb-1 text-[11.5px] font-semibold text-accent-ink">✦ {m.studio}</div>
      <h2 className="text-[17px] font-semibold text-ink">{m.welcomeTitle}</h2>
      <p className="mt-1 text-ink-muted">{m.welcomeBody}</p>
      <div className="mt-3 flex flex-col gap-2">
        <button type="button" className={start} onClick={onPick} data-start-pick>
          <span aria-hidden className="mt-0.5 flex w-5 justify-center text-ink-muted">
            <PastPaperIcon size={18} />
          </span>
          <span>
            <span className="block font-medium text-ink">{m.startPick}</span>
            <span className="block text-[12px] text-ink-muted">{m.startPickHint}</span>
          </span>
        </button>
        <button type="button" className={start} onClick={onDescribe} data-start-describe>
          <span aria-hidden className="mt-0.5 flex w-5 justify-center text-ink-muted">
            <PencilIcon size={18} />
          </span>
          <span>
            <span className="block font-medium text-ink">{m.startDescribe}</span>
            <span className="block text-[12px] text-ink-muted">{m.startDescribeHint}</span>
          </span>
        </button>
      </div>
    </div>
  );
}

/** Chats ▾: the chats kept on this computer, newest first; open one or delete it. */
function ChatsMenu({ chats, activeId, onOpen, onDelete }: { chats: readonly Chat[]; activeId: string; onOpen: (id: string) => void; onDelete: (id: string) => void }) {
  const m = useMessages(STUDIO_CHAT_MESSAGES);
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState<string>();
  const ref = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const saved = chats.filter((c) => c.turns.length > 0).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  useDismiss(open, () => setOpen(false), [ref], button);
  return (
    <div ref={ref} className="relative">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[13px] text-ink-muted hover:bg-surface-sunken hover:text-ink"
        data-chats-menu
      >
        {m.chats} ▾
      </button>
      {open && (
        <div
          role="menu"
          aria-label={m.chatsLabel}
          className="absolute left-0 top-[calc(100%+4px)] z-30 w-[320px] whitespace-normal rounded-xl border border-line bg-surface p-1.5 shadow-lg"
          data-chats-list
        >
          {saved.length === 0 ? (
            <p className="px-2.5 py-2 text-[12.5px] text-ink-muted">{m.chatsEmpty}</p>
          ) : (
            saved.map((c) => {
              const s = summaryOf(c);
              return (
                <div key={c.id} className={`group flex items-start gap-1 rounded-lg px-2.5 py-1.5 ${c.id === activeId ? 'bg-accent-soft' : 'hover:bg-surface-hover'}`}>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onOpen(c.id);
                      setOpen(false);
                    }}
                    className="min-w-0 flex-1 cursor-pointer text-left"
                  >
                    <span className="block truncate text-[12.5px] font-medium text-ink">{s.title || (s.like ? m.likeTitle(s.like) : m.untitled)}</span>
                    <span className="block text-[11.5px] text-ink-muted">
                      {new Date(s.updatedAt).toLocaleDateString()} · {m.chatMeta(s.drafts, s.added)}
                    </span>
                  </button>
                  {asking === c.id ? (
                    <button
                      type="button"
                      onClick={() => {
                        onDelete(c.id);
                        setAsking(undefined);
                      }}
                      title={m.deleteChatAsk}
                      className="shrink-0 cursor-pointer rounded-md bg-danger px-1.5 py-0.5 text-[11px] text-white"
                    >
                      {m.deleteChat}
                    </button>
                  ) : (
                    <button type="button" aria-label={m.deleteChat} title={m.deleteChat} onClick={() => setAsking(c.id)} className="shrink-0 cursor-pointer rounded-md px-1 text-ink-subtle opacity-0 hover:text-ink group-hover:opacity-100 focus-visible:opacity-100">
                      ✕
                    </button>
                  )}
                </div>
              );
            })
          )}
          <p className="px-2.5 pb-1 pt-1.5 text-[11px] text-ink-subtle">{m.chatsNote}</p>
        </div>
      )}
    </div>
  );
}
