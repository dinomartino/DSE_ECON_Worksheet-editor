import { polishJob } from '@/ai/credits';
import { uiLanguage } from '@/i18n/language';
import { copyMessages } from '@/components/translate/text';
import { editTargetKey } from '@/model/edits';
import { plain } from '@/model/text';
import { sameRuns, type Side } from '@/model/textSlots';
import { isDesktop } from '@/platform';
import { applyPolishEdits, polishQuestions, runPolish, type PolishChange, type PolishOutcome, type PolishQuestion } from '@/polish';
import { useAppDialogs } from '@/store/appDialogs';
import { useWorksheetStore } from '@/store/worksheetStore';
import { createRunDeps } from '@/translate/deps';
import { assistMessages } from '../text';
import { registerVerb } from '../registry';
import type { AiVerb, FindingsRefresh, ReviewItem, VerbContext, VerbOutcome } from '../types';
import { commitUndo, depsError, slotsOf } from './translateShared';

/**
 * Improve wording (k-0549, user u-ddyz): the MC questions in scope go to the AI with the
 * HKDSE house style (`src/dseStyle`) to improve their wording, grammar and structure. Offered
 * like Check terms: nothing is written by the run; each changed text is a card beside it on
 * the page with the words taken out and put in and the AI's reason, Accept (one commit), and
 * Accept all (one commit, one Undo) on the bar; Discard closes it. A change that moves a
 * number, the order of the options or statements, or the key is shown but never offered.
 */

const questionsOf = (ctx: VerbContext): PolishQuestion[] => polishQuestions(ctx.worksheet, ctx.scope, slotsOf(ctx.worksheet));

const fieldText = (questions: readonly PolishQuestion[]): string =>
  questions.flatMap((q) => q.fields.flatMap((f) => q.sides.map((side) => plain(f.text[side])))).join('\n');

/** Changes still offered: not blocked, and their text is still as the AI read it. */
function openChanges(changes: readonly PolishChange[]): PolishChange[] {
  const ws = useWorksheetStore.getState().worksheet;
  const current = new Map(slotsOf(ws).map((slot) => [slot.path, slot.text]));
  return changes.filter((c) => {
    if (c.blocked) return false;
    const now = current.get(c.path);
    return !!now && sameRuns(now.en, c.before.en) && sameRuns(now.zh, c.before.zh);
  });
}

/** One commit for these changes; how many were written. */
function accept(changes: readonly PolishChange[], worksheetId: string): number {
  const store = useWorksheetStore.getState();
  if (store.readOnly || store.worksheet.id !== worksheetId || changes.length === 0) return 0;
  let applied = 0;
  store.commit((draft) => {
    const result = applyPolishEdits(draft, changes);
    applied = result.applied;
    return result.worksheet;
  });
  return applied;
}

const reasonOf = (change: PolishChange): string => {
  const zh = uiLanguage() !== 'en';
  return (zh ? change.why.zh || change.why.en : change.why.en || change.why.zh).trim();
};

function blockedNote(change: PolishChange): string {
  const m = assistMessages();
  switch (change.blocked?.reason) {
    case 'numbers':
      return m.polishBlockedNumbers(change.blocked.detail);
    case 'order':
      return m.polishBlockedOrder;
    case 'key':
      return m.polishBlockedKey(change.blocked.detail);
    default:
      return '';
  }
}

function reviewItem(change: PolishChange, worksheetId: string): ReviewItem {
  const m = assistMessages();
  const reason = reasonOf(change);
  const blocked = blockedNote(change);
  return {
    id: change.id,
    tone: change.blocked ? 'failed' : 'finding',
    kicker: change.blocked ? m.polishBlockedKicker : m.polishKicker,
    ...(change.target ? { targetKey: editTargetKey(change.target) } : {}),
    questionId: change.questionId,
    where: change.where,
    diff: change.sides.map((side: Side) => ({ side, before: plain(change.before[side]), after: plain(change.after[side]) })),
    notes: [reason, blocked].filter(Boolean),
    ...(change.blocked
      ? {}
      : {
          action: {
            label: m.polishAccept,
            run: () => {
              if (accept([change], worksheetId) > 0) return true;
              useAppDialogs.getState().notify(m.polishChangedSince);
              return false;
            },
          },
        }),
  };
}

const styleCount = (outcome: PolishOutcome, side: 'styleBefore' | 'styleAfter') => outcome.results.reduce((n, r) => n + r[side].length, 0);

/** "6 suggested changes in 3 questions · HKDSE style notes 5 → 1", with what did not finish. */
export function polishSummary(outcome: PolishOutcome): string {
  const m = assistMessages();
  const changes = outcome.results.flatMap((r) => r.changes);
  const questions = outcome.results.filter((r) => r.changes.length).length;
  const before = styleCount(outcome, 'styleBefore');
  const after = styleCount(outcome, 'styleAfter');
  const head = [m.polishHead(changes.length, questions), ...(before !== after ? [m.polishStyle(before, after)] : [])].join(' · ');
  const tail = [
    outcome.fatal ? m.qualityStoppedWith(outcome.fatal.message) : outcome.stopped ? m.qualityStoppedEarly : '',
    outcome.failed ? m.qualityCouldNot(outcome.failed) : '',
  ].filter(Boolean).join(m.tailJoin);
  return tail ? m.qualityWithTail(head, tail) : head;
}

function barOf(outcome: PolishOutcome, changes: readonly PolishChange[], worksheetId: string, first: boolean): FindingsRefresh {
  const m = assistMessages();
  const open = openChanges(changes);
  const offered = changes.filter((c) => !c.blocked).length;
  const summary = first ? polishSummary(outcome) : open.length ? m.polishLeft(open.length) : m.polishAllDone;
  return {
    summary,
    dismissLabel: open.length === offered ? m.polishDiscard : open.length ? m.polishDiscardRest : undefined,
    ...(open.length
      ? {
          applyAll: {
            label: m.polishAcceptAll(open.length),
            run: () => {
              const n = accept(openChanges(changes), worksheetId);
              if (n === 0) return useAppDialogs.getState().notify(m.polishChangedSince);
              const undo = commitUndo();
              useAppDialogs.getState().notify(m.polishAccepted(n), { label: copyMessages().undoAction, ...undo });
            },
          },
        }
      : {}),
  };
}

/** The review for a finished run (exported for tests). */
export function polishFindings(ctx: VerbContext, outcome: PolishOutcome): VerbOutcome {
  if (outcome.fatal && outcome.reviewed === 0) return { kind: 'error', error: outcome.fatal };
  const changes = outcome.results.flatMap((r) => r.changes);
  if (changes.length === 0) return { kind: 'nothing', summary: assistMessages().polishNothing(outcome.reviewed) };
  const worksheetId = ctx.worksheet.id;
  const bar = barOf(outcome, changes, worksheetId, true);
  return {
    kind: 'findings',
    summary: bar.summary,
    items: changes.map((c) => reviewItem(c, worksheetId)),
    ...(bar.applyAll ? { applyAll: bar.applyAll } : {}),
    ...(bar.dismissLabel ? { dismissLabel: bar.dismissLabel } : {}),
    refresh: () => barOf(outcome, changes, worksheetId, false),
  };
}

export const polishVerb: AiVerb = {
  id: 'check.wording',
  group: 'check',
  order: 1,
  needsKey: true,
  label: () => assistMessages().polishLabel,

  available(ctx) {
    const count = questionsOf(ctx).length;
    return count > 0 ? { count, unit: assistMessages().unitQuestions(count) } : null;
  },

  sendsLine(ctx, providerLabel) {
    return assistMessages().sendsPolish(questionsOf(ctx).length, providerLabel);
  },

  estimate(ctx) {
    const questions = questionsOf(ctx);
    return questions.length ? polishJob(questions.length, fieldText(questions)) : null;
  },

  async run(ctx, io): Promise<VerbOutcome> {
    const questions = questionsOf(ctx);
    const resolved = await createRunDeps({ glossary: false });
    if (!resolved.ok) return { kind: 'error', error: depsError(resolved, isDesktop()) };
    const { client, preset } = resolved.deps;
    const label = assistMessages().polishing(questions.length);
    const outcome = await runPolish(questions, { client, preset }, io.signal, (done, total) => io.progress(done, total, label));
    return polishFindings(ctx, outcome);
  },
};

registerVerb(polishVerb);
