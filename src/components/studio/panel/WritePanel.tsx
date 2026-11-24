'use client';

import { useEffect, useRef, useState } from 'react';
import { ChatIcon, PastPaperIcon, PencilIcon, RefreshIcon } from '@/components/ui/icons';
import { DraftEditor } from '../chat/DraftEditor';
import { VersionMenu } from '../chat/VersionMenu';
import { useMessages } from '@/i18n/language';
import { anchorLabel } from '@/library/tabFilters';
import { computeNumbering } from '@/model/numbering';
import { documentName, plain } from '@/model/text';
import { toRuns } from '@/generate/validate';
import { topicNamesFor } from '@/model/topics';
import type { LanguageMode, Worksheet } from '@/model/types';
import { CHECK_IDS, type Finding } from '@/questionStudio/types';
import { hasWarning } from '@/questionStudio/validate';
import { notify } from '@/store/notices';
import { unanchoredQuestionSectionLabel, useWorksheetStore } from '@/store/worksheetStore';
import { BasedOn } from '../BasedOn';
import { CheckLine } from '../CheckLine';
import { STUDIO_CHAT_MESSAGES } from '../chat/chat.messages';
import type { ChatDraft } from '../chat/chatTypes';
import { ChatTurns } from '../chat/ChatTurns';
import { Composer } from '../chat/Composer';
import { findingText } from '../findings';
import { STUDIO_FINDING_MESSAGES } from '../findings.messages';
import { QUESTION_STUDIO_MESSAGES } from '../messages';
import { CHECK_LABEL, Chip, StateGlyph, toneOf } from '../parts';
import { ReferencePicker } from '../ReferencePicker';
import { syllabusName } from '../studioView';
import { paperCoverage } from './coverage';
import { acceptable, GHOST_PREFIX } from './ghosts';
import { usePaperGhosts } from './PageDrafts';
import { acceptDrafts, usePaperChat } from './paperChat';
import { WRITE_PANEL_MESSAGES } from './panel.messages';
import { useWritePanel } from './writePanelState';

/**
 * The editor's ✦ Write tab (k-0516 package B, mockup B): the Question studio's chat for the open
 * paper. The AI picks the key point (u-lm1c, no topic picker); its drafts appear on the page as
 * dashed "would be Q16" questions at the insert anchor (the cursor: click a question to write
 * after it), each with Accept / Reject. Accept puts it into the paper there, one ⌘Z to take it
 * back out. An empty chat opens on the paper's topics, offering the first one with no question.
 */
export function WritePanel() {
  const m = useMessages(WRITE_PANEL_MESSAGES);
  const c = useMessages(STUDIO_CHAT_MESSAGES);
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const paperLanguage = useWorksheetStore((s) => s.mode.language);
  const readOnly = useWorksheetStore((s) => s.readOnly);
  const chats = usePaperChat((s) => s.chats);
  const activeId = usePaperChat((s) => s.activeId);
  const run = usePaperChat((s) => s.run);
  const ask = useWritePanel((s) => s.ask);
  const [text, setText] = useState('');
  const [hint, setHint] = useState<{ text: string; at: number }>();
  const [picker, setPicker] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  const store = usePaperChat.getState();

  // The panel is open: the page draws the drafts; this paper's chat is the one shown.
  useEffect(() => {
    useWritePanel.getState().setOpen(true);
    return () => useWritePanel.getState().setOpen(false);
  }, []);
  useEffect(() => {
    usePaperChat.getState().openPaper(worksheet.id);
  }, [worksheet.id]);

  const chat = chats.find((each) => each.id === activeId);
  const mine = chat?.paper === worksheet.id ? chat : undefined;
  const running = run !== undefined;
  const runningHere = run && mine && run.chatId === mine.id ? run : undefined;
  const draftChip = mine?.drafts.find((d) => d.id === ask && d.state !== 'added');

  const turnsKey = mine ? `${mine.id}:${mine.turns.length}:${mine.drafts.length}` : '';
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'smooth' });
  }, [turnsKey]);

  if (!mine) return null;

  const send = (words: string, opts?: { asNew?: boolean }) => {
    void usePaperChat.getState().send(words.trim(), draftChip?.id, opts);
    setText('');
    setHint(undefined);
    useWritePanel.getState().setAsk(undefined);
  };
  const openDraft = mine.drafts.find(acceptable);
  const suggestions = !running && openDraft ? [c.sugHarder(openDraft.no), c.userAnother(openDraft.no)] : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-write-panel>
      <WhereBar worksheet={worksheet} onNewChat={mine.turns.length > 0 && !running ? () => store.newChat() : undefined} />
      <div ref={log} className="scroll-slim flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3" role="log" aria-live="polite">
        {mine.turns.length === 0 ? (
          <Opener
            worksheet={worksheet}
            language={paperLanguage}
            count={mine.settings.count}
            onWrite={(words) => send(words)}
            onPick={() => setPicker(true)}
            onDescribe={() => setHint({ text: m.describeHint, at: Date.now() })}
          />
        ) : (
          <>
            <ChatTurns
              chat={mine}
              runningTurn={runningHere?.turnId}
              language={mine.settings.language}
              onJump={jumpTo}
              onRetry={(turnId) => void store.retry(turnId)}
              onDismiss={(turnId) => store.dismissError(turnId)}
              onChangePick={(code) => store.changePick(code)}
              onAnswer={(turnId, answer) => void store.answerRewrite(turnId, answer)}
              onWhich={(turnId, choice) => void store.answerWhich(turnId, choice)}
            />
            <DraftList drafts={mine.drafts} worksheet={worksheet} readOnly={readOnly} busy={running} />
          </>
        )}
      </div>
      <Composer
        chat={mine}
        running={running}
        draft={draftChip ? { id: draftChip.id, no: draftChip.no } : undefined}
        text={text}
        onText={setText}
        onClearDraft={() => useWritePanel.getState().setAsk(undefined)}
        onSend={send}
        onStop={() => store.stop()}
        onAddReference={() => setPicker(true)}
        onRemoveReference={(id) => store.removeReference(id)}
        onSettings={(patch) => store.setSettings(patch)}
        suggestions={suggestions}
        hint={hint}
      />
      <ReferencePicker
        open={picker}
        language={mine.settings.language}
        onClose={() => setPicker(false)}
        onPick={(source, keyPoint, item) => {
          // Nothing is typed into the box (k-0528): an empty box + a reference sends "N like this".
          if (!store.addReference(source, keyPoint, item)) notify({ id: 'studio-full', tone: 'info', body: c.full });
        }}
      />
    </div>
  );
}

/** The draft on the page (or the question it became), brought into view and flashed. */
function jumpTo(draftId: string) {
  if (typeof document === 'undefined') return;
  const placed = useWritePanel.getState().placed[draftId];
  const el =
    document.querySelector<HTMLElement>(`#print-root [data-ai-ghost="${draftId}"]`) ??
    (placed ? document.querySelector<HTMLElement>(`#print-root [data-flow-id="${placed.question}"]`) : null);
  if (!el) return;
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el.animate?.([{ boxShadow: '0 0 0 6px rgba(124,92,214,0.35)' }, { boxShadow: '0 0 0 0 rgba(124,92,214,0)' }], { duration: 1100, easing: 'ease-out' });
}

/** "Writing for Mock 2026 · Paper 1 · after Q14": where Accept puts a draft. */
function WhereBar({ worksheet, onNewChat }: { worksheet: Worksheet; onNewChat?: () => void }) {
  const m = useMessages(WRITE_PANEL_MESSAGES);
  const c = useMessages(STUDIO_CHAT_MESSAGES);
  const anchorId = useWorksheetStore((s) => s.insertAnchorId);
  const anchor = anchorLabel(worksheet, anchorId);
  const section = anchor ? undefined : unanchoredQuestionSectionLabel(worksheet, 'mcq');
  const where = anchor ? m.whereAfter(anchor) : section ? m.whereIn(section) : m.whereEnd;
  const name = documentName(worksheet) ?? c.untitled;
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-line bg-surface-sunken/60 px-4 py-2 text-[12px]" title={m.whereHint} data-write-where>
      <span className="min-w-0 flex-1 truncate text-ink-muted">
        {m.writingFor} <span className="font-semibold text-ink">{name}</span> · <span className="font-medium text-ink">{where}</span>
      </span>
      {onNewChat && (
        <button type="button" onClick={onNewChat} className="shrink-0 cursor-pointer rounded-md px-1.5 py-0.5 text-[12px] text-ink-muted hover:bg-surface-hover hover:text-ink" data-write-new-chat>
          ＋ {m.newChat}
        </button>
      )}
    </div>
  );
}

/** The empty chat: the paper's topics from its tags, the first gap as a one-click request, or a reference. */
function Opener({
  worksheet,
  language,
  count,
  onWrite,
  onPick,
  onDescribe,
}: {
  worksheet: Worksheet;
  language: LanguageMode;
  count: number;
  onWrite: (words: string) => void;
  onPick: () => void;
  onDescribe: () => void;
}) {
  const m = useMessages(WRITE_PANEL_MESSAGES);
  const c = useMessages(STUDIO_CHAT_MESSAGES);
  const coverage = paperCoverage(worksheet);
  const names = topicNamesFor(language, 'wide');
  const gapName = coverage.gap ? `${coverage.gap.code} · ${syllabusName(coverage.gap, names)}` : undefined;
  const button =
    'cursor-pointer rounded-lg border border-line bg-surface px-3 py-1.5 text-[12.5px] text-ink hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50';
  return (
    <div className="text-[13px] leading-relaxed" data-write-opener>
      <div className="mb-1 text-[11.5px] font-semibold text-accent-ink">✦ {c.studio}</div>
      <h2 className="text-[15px] font-semibold text-ink">{m.openerTitle}</h2>
      <p className="mt-1 text-[12.5px] text-ink-muted">{m.openerBody}</p>
      {coverage.tagged > 0 && (
        <div className="mt-3 rounded-xl border border-line bg-surface p-3" data-write-coverage>
          <div className="mb-1.5 text-[11.5px] font-medium text-ink-muted">{m.coverage}</div>
          <div className="grid grid-cols-10 gap-1">
            {coverage.topics.map(({ topic, count: n }) => {
              const gap = coverage.gap?.code === topic.code;
              return (
                <span
                  key={topic.code}
                  title={`${syllabusName(topic, names)} · ${m.topicCount(topic.code, n)}`}
                  data-topic={topic.code}
                  data-count={n}
                  className={`rounded-md py-0.5 text-center text-[11px] font-medium ${
                    gap ? 'border border-dashed border-warn-ink/60 bg-warn-soft text-warn-ink' : n > 0 ? 'bg-ok-soft text-ok' : 'bg-surface-sunken text-ink-subtle'
                  }`}
                >
                  {topic.code}
                </span>
              );
            })}
          </div>
          {gapName && (
            <>
              <p className="mt-2.5 text-[12.5px] text-ink" data-write-gap={coverage.gap?.code}>
                {m.gap(gapName)}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => onWrite(m.gapAsk(count, gapName))} className="cursor-pointer rounded-lg bg-cta px-3 py-1.5 text-[12.5px] font-medium text-on-cta hover:bg-cta-hover" data-write-gap-go>
                  ✦ {m.gapWrite(count)}
                </button>
                <button type="button" onClick={onPick} className={button}>
                  {m.pickReference}
                </button>
              </div>
            </>
          )}
        </div>
      )}
      {!gapName && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={onPick} className={`${button} inline-flex items-center gap-1.5`} data-write-pick>
            <PastPaperIcon size={14} /> {m.pickReference}
          </button>
          <button type="button" onClick={onDescribe} className={`${button} inline-flex items-center gap-1.5`} data-write-describe>
            <PencilIcon size={14} /> {m.describe}
          </button>
        </div>
      )}
    </div>
  );
}

/** Any draft already in the paper (its number is the paper's). */
const hasAdded = (drafts: readonly ChatDraft[]) => drafts.some((d) => d.state === 'added');

const stemOf = (d: ChatDraft): string => {
  const side = d.entry.request.sides[0] ?? 'en';
  const stem = d.entry.draft.draft.stem;
  return plain(toRuns(stem[side] || stem.en || stem.zh)).trim();
};

/** The chat's drafts as rows: where each is (would be Q16 / in the paper), its state, → to it; the checks and changes on demand. */
function DraftList({ drafts, worksheet, readOnly, busy }: { drafts: readonly ChatDraft[]; worksheet: Worksheet; readOnly: boolean; busy: boolean }) {
  const m = useMessages(WRITE_PANEL_MESSAGES);
  const q = useMessages(QUESTION_STUDIO_MESSAGES);
  const { numbers } = usePaperGhosts(worksheet);
  const placed = useWritePanel((s) => s.placed);
  const [open, setOpen] = useState<string>();
  if (drafts.length === 0) return null;
  const clean = drafts.filter((d) => acceptable(d) && d.entry.draft.status === 'ok');
  const sorted = [...drafts].sort((a, b) => a.no - b.no);
  const inPaper = hasAdded(drafts) ? computeNumbering(worksheet) : undefined;
  const numberOf = (d: ChatDraft): string | undefined => {
    if (d.state === 'added') {
      const at = placed[d.id];
      const n = at ? inPaper?.byQuestionId.get(at.question)?.number : undefined;
      return n === undefined ? undefined : String(n);
    }
    return numbers.get(`${GHOST_PREFIX}${d.id}`) || undefined;
  };
  return (
    <section className="mt-1" aria-label={m.drafts} data-write-drafts>
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {sorted.map((d) => {
          const n = numberOf(d);
          const status = d.entry.draft.status;
          return (
            <li key={d.id} data-write-draft={d.no} data-state={d.state} data-status={status}>
              <div className="flex items-center gap-2 px-3 py-2 text-[12.5px]">
                <span className="min-w-9 shrink-0 whitespace-nowrap font-semibold text-accent-ink tabular-nums">{n ? m.qn(n) : `#${d.no}`}</span>
                <button
                  type="button"
                  onClick={() => setOpen(open === d.id ? undefined : d.id)}
                  aria-expanded={open === d.id}
                  title={m.more}
                  className={`min-w-0 flex-1 cursor-pointer truncate text-left hover:text-ink ${d.state === 'rejected' || d.state === 'added' ? 'text-ink-subtle' : 'text-ink'}`}
                >
                  {stemOf(d)}
                </button>
                {d.state === 'added' ? (
                  <Chip tone="ok">{m.inPaper}</Chip>
                ) : d.state === 'rejected' ? (
                  <Chip tone="idle">{m.rejected}</Chip>
                ) : hasWarning(d.entry.draft) ? (
                  <Chip tone="fail">{m.warned}</Chip>
                ) : (
                  <Chip tone={status === 'look' ? 'look' : 'ok'}>{status === 'look' ? q.statusLook : q.statusOk}</Chip>
                )}
                {(acceptable(d) || d.state === 'added') && (
                  <button type="button" title={m.show} onClick={() => jumpTo(d.id)} className="shrink-0 cursor-pointer rounded-md border border-line px-1.5 py-0.5 text-[11.5px] text-ink-muted hover:border-accent hover:text-accent-ink" data-write-jump={d.no}>
                    →
                  </button>
                )}
              </div>
              {open === d.id && <DraftDetails draft={d} busy={busy} />}
            </li>
          );
        })}
      </ul>
      {clean.length > 0 && !readOnly && (
        <button
          type="button"
          onClick={() => acceptDrafts(clean.map((d) => d.id))}
          className="mt-2 cursor-pointer rounded-lg bg-ok px-3 py-1.5 text-[12.5px] font-medium text-white hover:opacity-90"
          data-write-accept-all
        >
          ✓ {m.acceptAll(clean.length)}
        </button>
      )}
    </section>
  );
}

/** One draft's checks (what was checked, in words), its versions, and Another / Harder / Easier / Ask. */
function DraftDetails({ draft, busy }: { draft: ChatDraft; busy: boolean }) {
  const m = useMessages(WRITE_PANEL_MESSAGES);
  const c = useMessages(STUDIO_CHAT_MESSAGES);
  const q = useMessages(QUESTION_STUDIO_MESSAGES);
  const f = useMessages(STUDIO_FINDING_MESSAGES);
  const studio = draft.entry.draft;
  const words = (finding: Finding) => findingText(finding, f);
  const store = usePaperChat.getState();
  const live = acceptable(draft);
  const [editing, setEditing] = useState(false);
  const undoFrom = studio.made?.by === 'you' && draft.older.some((v) => v.version === studio.made?.from) ? studio.made.from : undefined;
  const small =
    'cursor-pointer rounded-lg border border-line bg-surface px-2 py-0.5 text-[11.5px] text-ink hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50';
  if (editing) {
    return (
      <div className="border-t border-line bg-surface text-[12px]" data-write-details>
        <DraftEditor
          draft={studio}
          sides={draft.entry.request.sides}
          no={draft.no}
          onCancel={() => setEditing(false)}
          onSave={async (change) => {
            await store.editDraft(draft.id, change);
            setEditing(false);
          }}
        />
      </div>
    );
  }
  return (
    <div className="border-t border-line bg-surface-sunken/50 px-3 pb-2.5 pt-2 text-[12px]" data-write-details>
      <div className="flex flex-wrap gap-1">
        <BasedOn request={draft.entry.request} />
        {CHECK_IDS.map((id) => {
          const row = studio.checks.find((each) => each.id === id);
          return row ? (
            <Chip key={id} tone={toneOf(row.state)}>
              <StateGlyph state={row.state} />
              {q[CHECK_LABEL[id]]}
            </Chip>
          ) : null;
        })}
      </div>
      <ul className="mt-1.5 flex flex-col divide-y divide-line rounded-lg border border-line bg-surface px-2.5">
        {CHECK_IDS.map((id) => {
          const row = studio.checks.find((each) => each.id === id);
          return row && row.state !== 'pass' ? <CheckLine key={id} row={row} solve={id === 'key' ? studio.solve : undefined} words={words} /> : null;
        })}
      </ul>
      {(draft.older.length > 0 || studio.edited) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-ink-muted">
          <VersionMenu draft={draft} disabled={busy} onShow={(id) => store.showVersion(draft.id, id)} />
          {studio.edited && (
            <span data-edited-chip>
              <Chip tone="idle">{c.editedChip}</Chip>
            </span>
          )}
        </div>
      )}
      {(live || draft.state === 'rejected') && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {draft.state === 'rejected' ? (
            <button type="button" className={small} onClick={() => store.setDraftState(draft.id, 'open')}>
              {c.bringBack}
            </button>
          ) : (
            <>
              <button type="button" className={`${small} inline-flex items-center gap-1`} disabled={busy} title={q.anotherTitle} onClick={() => void store.change(draft.id, 'another')}>
                <RefreshIcon size={12} /> {q.another}
              </button>
              <button type="button" className={small} disabled={busy} onClick={() => void store.change(draft.id, 'harder')}>
                {q.harder}
              </button>
              <button type="button" className={small} disabled={busy} onClick={() => void store.change(draft.id, 'easier')}>
                {q.easier}
              </button>
              <span className="flex-1" />
              {undoFrom !== undefined && (
                <button type="button" className={small} disabled={busy} title={c.undoEditTitle(undoFrom)} onClick={() => store.undoEdit(draft.id)} data-undo-edit>
                  {c.undoEdit}
                </button>
              )}
              <button type="button" className={`${small} inline-flex items-center gap-1`} disabled={busy} title={c.editTitle} onClick={() => setEditing(true)} data-edit>
                <PencilIcon size={12} /> {c.edit}
              </button>
              <button type="button" className={`${small} inline-flex items-center gap-1`} title={m.askTitle} onClick={() => useWritePanel.getState().setAsk(draft.id)} data-ask>
                <ChatIcon size={12} /> {c.askAbout}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
