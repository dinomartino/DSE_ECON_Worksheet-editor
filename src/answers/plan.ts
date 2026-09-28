import type { AnswerLeaf } from '@/model/answerLeaves';
import { isSchemeEmpty } from '@/model/markScheme';
import { isBiTextEmpty, plain } from '@/model/text';
import type { Side, TextSlot } from '@/model/textSlots';
import { collectTexts } from '@/model/textWalk';
import type { OutputMode, Question, Worksheet } from '@/model/types';
import { getQuestionType } from '@/registry';
import { slotInScope } from '@/translate/plan';
import type { TranslateScope } from '@/translate/types';
import type { AnswerChunk, AnswerNeeds, AnswerPlan, AnswerTarget, ContextLine, QuestionContext } from './types';

/**
 * What to fill, read from the model (never the IR or DOM): every leaf in scope whose
 * answer is empty, or whose printed marks have no scheme yet; every option without a
 * rationale. Leaves come from the registry hook `mapAnswers`, so no type is named here.
 */

export const CHUNK_TARGETS = 6;
export const CHUNK_CHARS = 6000;

/** Every leaf the hook offers, identity visit. */
export function answerLeaves(question: Question): AnswerLeaf[] {
  const leaves: AnswerLeaf[] = [];
  getQuestionType(question.type)?.mapAnswers?.(question, (leaf) => {
    leaves.push(leaf);
    return undefined;
  });
  return leaves;
}

const keyed = (index: number, length: number) => Number.isInteger(index) && index >= 0 && index < length;

/** What the leaf still lacks, or null when there is nothing to write. */
export function needsOf(leaf: AnswerLeaf): AnswerNeeds | null {
  if (leaf.shape === 'written') {
    if (leaf.blank) return null;
    const answer = isBiTextEmpty(leaf.answer);
    const scheme = isSchemeEmpty(leaf.scheme) && (leaf.marks ?? 0) > 0;
    return answer || scheme ? { shape: 'written', answer, scheme } : null;
  }
  if (!keyed(leaf.answerIndex, leaf.options.length) || leaf.options[leaf.answerIndex].blank) return null;
  if (leaf.options.filter((option) => !option.blank).length < 2) return null;
  const options = leaf.options.filter((option) => !option.blank && isBiTextEmpty(option.rationale)).map((option) => option.id);
  return options.length > 0 ? { shape: 'choice', options } : null;
}

/** The leading `name:id` segments of a question-relative path: the thing that owns the text. */
function ownerOf(relative: string): string {
  const owner: string[] = [];
  for (const segment of relative.split('/')) {
    if (!segment.includes(':')) break;
    owner.push(segment);
  }
  return owner.join('/');
}

type LeafFilter = (leaf: AnswerLeaf) => boolean;

/** The text's owner is the leaf, inside it, or holds it (a part's body holds its sub-parts). */
const covers = (owner: string, leaf: AnswerLeaf) =>
  owner !== '' && (leaf.key === owner || leaf.key.startsWith(`${owner}/`) || owner.startsWith(`${leaf.key}/`));

/** Question id → which of its leaves the scope covers. */
function scopedQuestions(ws: Worksheet, slots: readonly TextSlot[], scope: TranslateScope): Map<string, LeafFilter> {
  const all: LeafFilter = () => true;
  const out = new Map<string, LeafFilter>();
  if (scope.kind === 'paper') ws.questions.forEach((q) => out.set(q.id, all));
  else if (scope.kind === 'questions' || scope.kind === 'flowItems') scope.ids.forEach((id) => out.set(id, all));
  else if (scope.kind === 'block') {
    if (scope.questionId) out.set(scope.questionId, all);
    for (const slot of slots) if (slot.questionId && slotInScope(slot, scope)) out.set(slot.questionId, all);
  } else {
    // A text target narrows to the leaf that owns it; stem or option text means the question.
    const owners = new Map<string, string[]>();
    for (const slot of slots) {
      if (!slot.questionId || !slotInScope(slot, scope)) continue;
      const relative = slot.path.slice(`q:${slot.questionId}/`.length);
      owners.set(slot.questionId, [...(owners.get(slot.questionId) ?? []), ownerOf(relative)]);
    }
    for (const [questionId, list] of owners) {
      out.set(questionId, (leaf) => list.some((owner) => covers(owner, leaf)));
    }
    // An owner no leaf answers to (a stem, an option) scopes the whole question.
    for (const question of ws.questions) {
      const pick = out.get(question.id);
      const list = owners.get(question.id);
      if (!pick || !list) continue;
      const leaves = answerLeaves(question);
      if (list.some((owner) => !leaves.some((leaf) => covers(owner, leaf)))) {
        out.set(question.id, all);
      }
    }
  }
  return out;
}

function contextFor(questionId: string, slots: readonly TextSlot[]): QuestionContext {
  const lines: ContextLine[] = [];
  let where = '';
  for (const slot of slots) {
    if (slot.questionId !== questionId) continue;
    where ||= slot.group.label;
    if (slot.role !== 'print' || slot.unprinted) continue;
    const en = plain(slot.text.en).trim();
    const zh = plain(slot.text.zh).trim();
    if (!en && !zh) continue;
    lines.push({ ...(slot.label ? { label: slot.label } : {}), en, zh });
  }
  return { questionId, where: where || 'Question', lines, chars: lines.reduce((n, l) => n + l.en.length + l.zh.length, 0) };
}

/** The languages the paper prints: the mode's, plus a side the questions in scope carry. */
export function answerSides(mode: Pick<OutputMode, 'language'>, contexts: Iterable<QuestionContext>): Side[] {
  if (mode.language === 'bilingual') return ['en', 'zh'];
  const other: Side = mode.language === 'en' ? 'zh' : 'en';
  const carries = [...contexts].some((c) => c.lines.some((line) => line[other] !== ''));
  return (carries ? ['en', 'zh'] : [mode.language]) as Side[];
}

function chunk(targets: AnswerTarget[], contexts: ReadonlyMap<string, QuestionContext>): AnswerChunk[] {
  const chunks: AnswerChunk[] = [];
  let current: AnswerChunk | null = null;
  let chars = 0;
  let seen = new Set<string>();
  for (const target of targets) {
    const cost = seen.has(target.questionId) ? 0 : contexts.get(target.questionId)!.chars;
    if (!current || current.targetKeys.length >= CHUNK_TARGETS || (chars + cost > CHUNK_CHARS && current.targetKeys.length > 0)) {
      current = { id: `c${chunks.length + 1}`, targetKeys: [] };
      chunks.push(current);
      chars = 0;
      seen = new Set();
    }
    if (!seen.has(target.questionId)) chars += contexts.get(target.questionId)!.chars;
    seen.add(target.questionId);
    current.targetKeys.push(target.key);
  }
  return chunks;
}

export function planAnswers(ws: Worksheet, scope: TranslateScope, mode: Pick<OutputMode, 'language'>): AnswerPlan {
  const slots = collectTexts(ws);
  const scoped = scopedQuestions(ws, slots, scope);
  const targets: AnswerTarget[] = [];
  const contexts = new Map<string, QuestionContext>();
  for (const question of ws.questions) {
    const pick = scoped.get(question.id);
    if (!pick) continue;
    for (const leaf of answerLeaves(question)) {
      const needs = pick(leaf) ? needsOf(leaf) : null;
      if (!needs) continue;
      if (!contexts.has(question.id)) contexts.set(question.id, contextFor(question.id, slots));
      const where = `${contexts.get(question.id)!.where} ${leaf.label}`.trim();
      targets.push({ key: `a${targets.length + 1}`, questionId: question.id, where, leaf, needs });
    }
  }
  return {
    worksheetId: ws.id,
    sides: answerSides(mode, contexts.values()),
    targets: new Map(targets.map((t) => [t.key, t])),
    contexts,
    chunks: chunk(targets, contexts),
  };
}
