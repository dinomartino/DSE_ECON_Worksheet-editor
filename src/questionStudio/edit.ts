import type { BiDraft, McqDraft } from '@/generate/types';
import { fromRuns, toRuns } from '@/generate/validate';
import type { Glossary } from '@/glossary/types';
import type { BiText, DiagramBlock } from '@/model/types';
import { referenceMode } from './brief';
import { EMPTY_CORPUS, type CorpusDoc, type CorpusIndex } from './nearCopy';
import { corpusDocOfDraft, corpusDocOfSource } from './source';
import type { CheckRow, DraftRich, Finding, StudioDraft, StudioRequest } from './types';
import { localChecks, statusOf, type CheckContext } from './validate';

/**
 * The teacher's own edit of a draft (k-0530, u-xjpd): the words, the key and the figure,
 * changed by hand in the studio. No AI is asked and nothing is spent. Every check that runs
 * on this computer runs again on the edited words. The key check needs the AI, so when the
 * question itself changed its row says so (`key.edited`) instead of showing a result about
 * other words; the term and near-copy checks say the same (`check.edited`) when their
 * glossary or corpus could not be read. The AI's next change of the draft starts from the
 * edited words (`draft`, which every request reads) and checks it in full.
 */

export interface DraftEdit {
  rich: DraftRich;
  answerIndex: number;
  /** The figure as the diagram editor left it; absent = not touched. */
  diagram?: DiagramBlock;
}

/** What the local checks read besides the draft. null = could not be read: that check says "check again". */
export interface LocalCheckContext {
  glossary: Glossary | null;
  corpus: CorpusIndex | null;
}

const runsOf = (text: BiDraft): BiText => ({ en: toRuns(text.en), zh: toRuns(text.zh) });
const wordsOf = (text: BiText): BiDraft => ({ en: fromRuns(text.en ?? []).trim(), zh: fromRuns(text.zh ?? []).trim() });

/** What the edit form starts from: the teacher's last formatting, else the AI's words. */
export function richOf(draft: StudioDraft): DraftRich {
  if (draft.rich) return draft.rich;
  const d = draft.draft;
  return { stem: runsOf(d.stem), statements: d.statements.map(runsOf), options: d.options.map(runsOf), explanation: runsOf(d.explanation) };
}

/** The plain words (bold kept as `**…**`) the checks and the AI read; never re-cleaned: nothing of the teacher's is rewritten. */
export function wordsOfEdit(edit: Pick<DraftEdit, 'rich' | 'answerIndex'>): McqDraft {
  return {
    kind: 'mcq',
    stem: wordsOf(edit.rich.stem),
    statements: edit.rich.statements.map(wordsOf),
    options: edit.rich.options.map(wordsOf),
    answerIndex: edit.answerIndex,
    explanation: wordsOf(edit.rich.explanation),
  };
}

const sameBi = (a: BiDraft, b: BiDraft) => a.en === b.en && a.zh === b.zh;
const sameList = (a: readonly BiDraft[], b: readonly BiDraft[]) => a.length === b.length && a.every((x, i) => sameBi(x, b[i]));

/** Whether two drafts ask the same question (the explanation aside): the key check still holds. */
export const sameQuestion = (a: McqDraft, b: McqDraft): boolean =>
  a.answerIndex === b.answerIndex && sameBi(a.stem, b.stem) && sameList(a.statements, b.statements) && sameList(a.options, b.options);

/** What the local checks compare with, as a run would: the examples (unless copied on purpose) and the chat's other drafts. */
export function editContext(request: StudioRequest, others: readonly StudioDraft[], found: LocalCheckContext): CheckContext {
  const pattern = referenceMode(request) === 'pattern';
  const examples: CorpusDoc[] = request.examples.map(corpusDocOfSource);
  return {
    sides: request.sides,
    keyPoint: request.keyPoint,
    asked: request.shape,
    glossary: found.glossary,
    corpus: found.corpus ?? EMPTY_CORPUS,
    extra: [...(pattern ? [] : examples), ...others.map((d) => corpusDocOfDraft(d.id, d.draft))],
    exempt: pattern ? examples : [],
  };
}

const stale = (id: CheckRow['id'], finding: Finding): CheckRow => ({ id, state: 'skipped', findings: [finding] });
const KEY_STALE: Finding = { id: 'key.edited' };
const CHECK_STALE: Finding = { id: 'check.edited' };

/**
 * The edited version of a draft, with the teacher's words and formatting, the local checks
 * run again, the figure if it was changed. `id`: the new version's id. Pure: no AI, no I/O.
 */
export function applyEdit(previous: StudioDraft, edit: DraftEdit, request: StudioRequest, others: readonly StudioDraft[], found: LocalCheckContext, id: string): StudioDraft {
  const draft = wordsOfEdit(edit);
  const keep = sameQuestion(previous.draft, draft);
  // A copy goes to the checks: the term check fixes 中文 in place on an AI draft, never on the teacher's words.
  const fresh = localChecks(structuredClone(draft), editContext(request, others, found));
  const checks = fresh.map((row): CheckRow => {
    if (row.id === 'key') return keep ? (previous.checks.find((c) => c.id === 'key') ?? stale('key', KEY_STALE)) : stale('key', KEY_STALE);
    if (row.id === 'terms' && !found.glossary) return stale('terms', CHECK_STALE);
    if (row.id === 'copy' && !found.corpus) return stale('copy', CHECK_STALE);
    return row;
  });
  const diagram = edit.diagram && previous.diagram ? { ...previous.diagram, block: edit.diagram, edited: true as const } : previous.diagram;
  const { solve, ...rest } = previous;
  return {
    ...rest,
    id,
    draft,
    rich: edit.rich,
    checks,
    status: statusOf(checks),
    edited: true,
    ...(keep && solve ? { solve } : {}),
    ...(diagram ? { diagram } : {}),
  };
}
