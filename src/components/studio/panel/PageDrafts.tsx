'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { GhostLayer } from '@/components/preview/Preview';
import { useMessages } from '@/i18n/language';
import type { Worksheet } from '@/model/types';
import { useWorksheetStore } from '@/store/worksheetStore';
import { keyCheckWords } from '../chat/KeyCheckChip';
import { STUDIO_CHAT_MESSAGES } from '../chat/chat.messages';
import { QUESTION_STUDIO_MESSAGES } from '../messages';
import type { RunState } from '../chat/chatStore';
import { ghostNumbers, ghostsOf, withGhosts, type Ghost } from './ghosts';
import { acceptDrafts, reopenUndone, usePaperChat } from './paperChat';
import { WRITE_PANEL_MESSAGES } from './panel.messages';
import { useWritePanel } from './writePanelState';

/**
 * The ✦ Write panel's drafts on the editor's page (k-0516 B). `usePaperGhosts` is the one
 * derivation both the page and the panel read: the open paper's chat, its drafts as questions,
 * the page with them placed at the insert anchor, and the number each would print as.
 */

/** The run as the page draws it: at most a few times a second while words stream in (the page is heavy). */
function useCalmRun(run: RunState | undefined, ms = 300): RunState | undefined {
  const [calm, setCalm] = useState(run);
  const latest = useRef(run);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    latest.current = run;
    // Start and end of a run land at once; the words between are batched.
    const now = !run || !calm || run.turnId !== calm.turnId;
    if (timer.current === undefined)
      timer.current = setTimeout(
        () => {
          timer.current = undefined;
          setCalm(latest.current);
        },
        now ? 0 : ms,
      );
  }, [run, calm, ms]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return calm;
}

export interface PaperGhosts {
  ghosts: Ghost[];
  shown: Worksheet;
  numbers: Map<string, string>;
}

/** The drafts on `worksheet`'s page, or none (the tab closed, a print, another paper's chat). */
export function usePaperGhosts(worksheet: Worksheet, off = false): PaperGhosts {
  const open = useWritePanel((s) => s.open);
  const printing = useWritePanel((s) => s.printing);
  const chats = usePaperChat((s) => s.chats);
  const activeId = usePaperChat((s) => s.activeId);
  const run = useCalmRun(usePaperChat((s) => s.run));
  const anchor = useWorksheetStore((s) => s.insertAnchorId);
  const chat = chats.find((c) => c.id === activeId);
  const on = open && !printing && !off && chat?.paper === worksheet.id;
  const ghosts = useMemo(() => (on && chat ? ghostsOf(chat, run) : []), [on, chat, run]);
  const shown = useMemo(() => withGhosts(worksheet, ghosts, anchor), [worksheet, ghosts, anchor]);
  const numbers = useMemo(() => (ghosts.length ? ghostNumbers(shown, ghosts) : new Map<string, string>()), [shown, ghosts]);
  return { ghosts, shown, numbers };
}

/**
 * The page's side: the drafts as a `GhostLayer` for `Preview`, and the watch that brings an
 * accepted draft back when its question is undone (⌘Z) or deleted.
 */
export function usePageDrafts(worksheet: Worksheet, off: boolean): { shown: Worksheet; layer?: GhostLayer } {
  const { ghosts, shown, numbers } = usePaperGhosts(worksheet, off);
  const questions = worksheet.questions;
  const id = worksheet.id;
  useEffect(() => {
    reopenUndone(id, new Set(questions.map((q) => q.id)));
  }, [id, questions]);
  const layer = useMemo<GhostLayer | undefined>(() => {
    if (ghosts.length === 0) return undefined;
    const byId = new Map(ghosts.map((g) => [g.id, g]));
    return {
      ids: new Set(byId.keys()),
      frame: (ghostId: string, body: ReactNode) => {
        const ghost = byId.get(ghostId);
        return ghost ? (
          <GhostFrame key={ghostId} ghost={ghost} number={numbers.get(ghostId) ?? ''}>
            {body}
          </GhostFrame>
        ) : (
          body
        );
      },
    };
  }, [ghosts, numbers]);
  return { shown, layer };
}

const chip = 'inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[10.5px] font-medium leading-tight';
const AI = 'border-[#cfc3f2] bg-[#f4f0fd] text-[#5b3fc4]';

/**
 * One AI draft on the page: faded, in a dashed violet frame, its head floating in the gap
 * above it (it takes no height: the paginator measures the question alone). Never printed.
 */
function GhostFrame({ ghost, number, children }: { ghost: Ghost; number: string; children: ReactNode }) {
  const m = useMessages(WRITE_PANEL_MESSAGES);
  const q = useMessages(QUESTION_STUDIO_MESSAGES);
  const c = useMessages(STUDIO_CHAT_MESSAGES);
  const setAsk = useWritePanel((s) => s.setAsk);
  const ready = ghost.draftId !== undefined && (ghost.status === 'ok' || ghost.status === 'look' || ghost.status === 'warn');
  const statusChip =
    ghost.status === 'ok' ? (
      <span className={`${chip} border-ok-line bg-ok-soft text-ok`}>{q.statusOk}</span>
    ) : ghost.status === 'warn' ? (
      <span className={`${chip} border-danger/40 bg-danger-soft text-danger-ink`}>{m.warned}</span>
    ) : ghost.status === 'look' ? (
      <span className={`${chip} border-warn-ink/30 bg-warn-soft text-warn-ink`}>{q.statusLook}</span>
    ) : (
      <span className={`${chip} ${AI}`}>{ghost.status === 'writing' ? m.writing : ghost.status === 'changing' ? m.changing : m.writing}</span>
    );
  return (
    <div
      data-print-hide
      data-ai-ghost={ghost.draftId ?? ghost.id}
      data-ai-ghost-status={ghost.status}
      className="relative rounded-[3px] bg-[#7c5cd6]/[0.035] outline-dashed outline-[1.5px] outline-offset-[5px] outline-[#8b6fe0]"
    >
      <div aria-hidden className="pointer-events-none select-none opacity-75">
        {children}
      </div>
      <div className="absolute -top-[25px] left-[-6px] right-[-6px] flex items-center gap-1.5 font-sans" data-ai-ghost-head>
        <span className={`${chip} ${AI}`}>
          ✦ {m.aiDraft}
          {number && ` · ${m.wouldBe(number)}`}
        </span>
        {statusChip}
        <span className="flex-1" />
        {ghost.keyCheck && ghost.keyCheck.state !== 'ok' && (
          <span
            className={`${chip} ${ghost.keyCheck.state === 'differs' ? 'border-danger/40 bg-danger-soft text-danger-ink' : 'border-warn-ink/30 bg-warn-soft text-warn-ink'}`}
            title={keyCheckWords(ghost.keyCheck, c).title}
            data-ghost-key-check={ghost.keyCheck.state}
          >
            {keyCheckWords(ghost.keyCheck, c).label}
          </span>
        )}
        {ghost.key && <span className={`${chip} border-line bg-surface text-ink`}>{q.key(ghost.key)}</span>}
        {ready && ghost.draftId && (
          <>
            <button
              type="button"
              title={m.askTitle}
              onClick={() => setAsk(ghost.draftId)}
              className={`${chip} cursor-pointer border-line bg-surface text-ink-muted hover:text-ink`}
              data-ghost-ask
            >
              {m.ask}
            </button>
            <button
              type="button"
              title={m.rejectTitle}
              onClick={() => ghost.draftId && usePaperChat.getState().setDraftState(ghost.draftId, 'rejected')}
              className={`${chip} cursor-pointer border-line bg-surface text-ink hover:border-line-strong `}
              data-ghost-reject
            >
              ✕ {c.reject}
            </button>
            <button
              type="button"
              title={m.acceptTitle}
              onClick={() => ghost.draftId && acceptDrafts([ghost.draftId])}
              className={`${chip} cursor-pointer border-ok bg-ok text-white hover:opacity-90`}
              data-ghost-accept
            >
              ✓ {c.accept}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
