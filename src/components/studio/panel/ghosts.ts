import { fillMcq } from '@/generate/build';
import type { McqDraft } from '@/generate/types';
import { computeNumbering } from '@/model/numbering';
import type { Question, Worksheet } from '@/model/types';
import { buildsOf, materialize } from '@/questionStudio/deliver';
import { studioBuilds } from '@/questionStudio/insert';
import { stemBlocks } from '@/questionStudio/stemTable';
import { hasWarning } from '@/questionStudio/validate';
import type { PartialDraft } from '@/questionStudio/partial';
import { flowOf } from '@/model/flow';
import { placeQuestions } from '@/store/worksheetStore';
import type { RunState } from '../chat/chatStore';
import type { Chat, ChatDraft } from '../chat/chatTypes';

/** A draft still on offer: open or accepted, a warned one too (k-0531: the teacher decides). */
export const acceptable = (d: ChatDraft): boolean => d.state === 'open' || d.state === 'accepted';

/**
 * The ✦ Write panel's drafts drawn on the page (k-0516 B): each open draft as a question, faded
 * and framed, where Accept will put it (the insert anchor, `placeQuestions`, the same rule as
 * the insert). While the AI writes, the words arriving show too. Never in the document: the
 * page is given a derived copy (as the 題庫 drag's provisional question), so autosave, undo and
 * export never see them. Pure.
 */
export interface Ghost {
  /** The question's id on the page. */
  id: string;
  /** The chat draft it is (absent while the words still arrive). */
  draftId?: string;
  no?: number;
  question: Question;
  /** `warn`: a check failed (near-copy, format): drawn like the rest with a red chip (k-0531). */
  status: 'writing' | 'changing' | 'drawing' | 'ok' | 'look' | 'warn';
  /** The key's letter, once known. */
  key?: string;
}

export const GHOST_PREFIX = 'ai-draft-';
const LETTERS = 'ABCD';

const blank = { en: '', zh: '' };
const hasWords = (t: { en: string; zh: string }) => t.en.trim().length > 0 || t.zh.trim().length > 0;

/** A draft as far as it has arrived, as the question it will be (missing options blank). */
function partialQuestion(p: PartialDraft): Question | undefined {
  if (!hasWords(p.stem)) return undefined;
  const draft: McqDraft = {
    kind: 'mcq',
    stem: p.stem,
    statements: p.statements,
    options: [0, 1, 2, 3].map((i) => p.options[i] ?? blank),
    answerIndex: p.answer ?? -1,
    explanation: blank,
  };
  const q = materialize({ typeId: 'mcq', fill: fillMcq(draft) });
  return q ? ({ ...q, blocks: stemBlocks(draft.stem), aiMade: true } as Question) : undefined;
}

export function ghostsOf(chat: Chat, run: RunState | undefined): Ghost[] {
  const mine = run?.chatId === chat.id ? run : undefined;
  const out: Ghost[] = [];
  for (const d of [...chat.drafts].filter(acceptable).sort((a, b) => a.no - b.no)) {
    const build = buildsOf([d.entry])[0];
    const q = build && materialize(build);
    if (!q) continue;
    const id = `${GHOST_PREFIX}${d.id}`;
    out.push({
      id,
      draftId: d.id,
      no: d.no,
      question: { ...q, id },
      status: mine?.target === d.id ? 'changing' : hasWarning(d.entry.draft) ? 'warn' : d.entry.draft.status === 'look' ? 'look' : 'ok',
      ...(d.entry.draft.draft.answerIndex >= 0 ? { key: LETTERS[d.entry.draft.draft.answerIndex] } : {}),
    });
  }
  // A new write's drafts as they arrive (a change shows the draft it changes, marked).
  if (mine && !mine.target) {
    for (const live of mine.live.drafts) {
      const id = `${GHOST_PREFIX}live-${mine.turnId}-${live.index}`;
      if (live.draft) {
        const build = studioBuilds([live.draft], mine.request?.keyPoint ?? '')[0];
        const q = build && materialize(build);
        if (q) out.push({ id, question: { ...q, id }, status: live.diagram === 'working' ? 'drawing' : hasWarning(live.draft) ? 'warn' : live.draft.status === 'look' ? 'look' : 'ok', ...(live.draft.draft.answerIndex >= 0 ? { key: LETTERS[live.draft.draft.answerIndex] } : {}) });
      } else if (live.partial) {
        const q = partialQuestion(live.partial);
        if (q) out.push({ id, question: { ...q, id }, status: 'writing' });
      }
    }
  }
  return out;
}

/** Where the drafts go: after the anchor when it still names something on the page, else as an unanchored insert. */
export function withGhosts(worksheet: Worksheet, ghosts: readonly Ghost[], anchorId: string | undefined): Worksheet {
  if (ghosts.length === 0) return worksheet;
  const anchor = anchorId && flowOf(worksheet).some((item) => item.id === anchorId) ? anchorId : undefined;
  // Each draft stands a line further off than a question would, so its head (Accept / Reject)
  // has room in the gap above it; the frame says AI draft, so no AI-made chip on top of it.
  const room = Math.max(GHOST_GAP_LINES, worksheet.examGapLines ?? 0);
  return placeQuestions(worksheet, ghosts.map((g) => ({ ...g.question, gapBefore: room, aiMade: undefined }) as Question), anchor);
}

/** Blank lines above a draft on the page: room for its head. */
export const GHOST_GAP_LINES = 2;

/** The number each draft would print as ("would be Q16"), by ghost id. */
export function ghostNumbers(shown: Worksheet, ghosts: readonly Ghost[]): Map<string, string> {
  const numbering = computeNumbering(shown);
  return new Map(ghosts.map((g) => [g.id, String(numbering.byQuestionId.get(g.id)?.number ?? '')]));
}
