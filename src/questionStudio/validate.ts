import type { BiDraft, McqDraft } from '@/generate/types';
import {
  OPTION_LETTER,
  STATEMENT_NUMBER,
  STEM_NUMBER,
  clean,
  draftOf,
  emptySides,
  glossaryPass,
  normalizedOption,
  parseSourceReply,
  toRuns,
  visible,
} from '@/generate/validate';
import type { Glossary } from '@/glossary/types';
import { plain } from '@/model/text';
import type { Side } from '@/model/textSlots';
import { scanLimited } from './guard';
import { lintDraft } from './lint';
import { checkNearCopy, EMPTY_CORPUS, type CorpusDoc, type CorpusIndex } from './nearCopy';
import { checkNumbers } from './numbers';
import { CHANGE_ASPECTS, type ChangeAspect, type CheckRow, type DraftChange, type DraftStatus, type Finding, type Shape, type StudioDraft } from './types';

/**
 * Checking what the model wrote: the reply → clean drafts → one `CheckRow` per check. All
 * local and free; the one AI check (the blind solve) is added by `run.ts`. A `fail` row (a
 * near-copy, a broken format) is a warning the teacher must see; `look` means read it. No
 * draft is ever hidden or refused for a check (k-0531, u-p8bn): the teacher decides.
 */

export interface RawDraft { draft: McqDraft; angle: string; changes: DraftChange[] }

const asText = (x: unknown): string => (typeof x === 'string' ? x.trim().slice(0, 200) : '');

const asBi = (x: unknown): { en: string; zh: string } => {
  const v = typeof x === 'object' && x !== null ? (x as Record<string, unknown>) : {};
  return { en: asText(v.en), zh: asText(v.zh) };
};

/** The reply's "what changed" list: known aspects only, one note each (the first), no empty notes. A string note counts as English. */
export function parseChanges(x: unknown): DraftChange[] {
  if (!Array.isArray(x)) return [];
  const out: DraftChange[] = [];
  for (const entry of x) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { aspect, note } = entry as { aspect?: unknown; note?: unknown };
    if (typeof aspect !== 'string') continue;
    const key = aspect.trim().toLowerCase() as ChangeAspect;
    if (!CHANGE_ASPECTS.includes(key) || out.some((c) => c.aspect === key)) continue;
    const bi = typeof note === 'string' ? { en: asText(note), zh: '' } : asBi(note);
    if (!bi.en && !bi.zh) continue;
    out.push({ aspect: key, note: bi });
  }
  return out.sort((a, b) => CHANGE_ASPECTS.indexOf(a.aspect) - CHANGE_ASPECTS.indexOf(b.aspect));
}

/**
 * A key written as a letter ("B") or a digit in a string ("1") reads as its index; a
 * provider that does not enforce the schema may send either. Anything else is left as sent
 * and fails the shape check.
 */
function answerIndexOf(x: unknown): unknown {
  if (typeof x !== 'string') return x;
  const t = x.trim().toUpperCase();
  if (/^[A-D]$/.test(t)) return 'ABCD'.indexOf(t);
  if (/^[0-3]$/.test(t)) return Number(t);
  return x;
}

/** The reply's drafts, or null when it is not the requested JSON. Entries that are not objects are dropped. */
export function parseWriteReply(text: string): RawDraft[] | null {
  const raw = parseSourceReply(text);
  if (!raw) return null;
  const out: RawDraft[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue;
    const fields = entry as Record<string, unknown>;
    const draft = draftOf({ ...fields, answer: answerIndexOf(fields.answer), kind: 'mcq' });
    if (draft?.kind === 'mcq') out.push({ draft, angle: asText((entry as { angle?: unknown }).angle), changes: parseChanges((entry as { changes?: unknown }).changes) });
  }
  return out;
}

/** Labels the paper derives stripped, Hong Kong forms and punctuation, a side the paper does not print dropped. */
export function cleanMcq(raw: McqDraft, sides: readonly Side[]): McqDraft {
  return {
    kind: 'mcq',
    stem: clean(raw.stem, sides, STEM_NUMBER),
    statements: raw.statements.map((s) => clean(s, sides, STATEMENT_NUMBER)),
    options: raw.options.map((o) => clean(o, sides, OPTION_LETTER)),
    answerIndex: raw.answerIndex,
    explanation: clean(raw.explanation, sides),
  };
}

// ---- shape (the hard checks) ----

/** Why a draft cannot be a question: never offered for insert. */
export function shapeFindings(draft: McqDraft, sides: readonly Side[]): Finding[] {
  const out: Finding[] = [];
  for (const side of emptySides(draft.stem, sides)) out.push({ id: 'shape.stemEmpty', params: { side } });
  if (draft.options.length !== 4) out.push({ id: 'shape.optionCount', params: { count: draft.options.length } });
  if (!(draft.answerIndex >= 0 && draft.answerIndex <= 3)) out.push({ id: 'shape.keyRange' });
  for (const side of sides) {
    const texts = draft.options.map((o) => normalizedOption(o[side]));
    if (texts.some((t) => !t)) out.push({ id: 'shape.optionEmpty', params: { side } });
    else if (new Set(texts).size !== texts.length) out.push({ id: 'shape.optionsSame', params: { side } });
  }
  const n = draft.statements.length;
  if (n === 1 || n > 4) out.push({ id: 'shape.statementCount', params: { count: n } });
  if (draft.statements.some((s) => emptySides(s, sides).length)) out.push({ id: 'shape.statementEmpty' });
  if (n >= 2 && n <= 4) {
    for (const side of sides) {
      const combines = draft.options.every((o) => {
        const refs = [...visible(o[side]).matchAll(/[(（]([1-9])[)）]/g)].map((m) => Number(m[1]));
        return refs.length > 0 && refs.every((r) => r <= n);
      });
      if (!combines) {
        out.push({ id: 'shape.notCombination', params: { side } });
        break;
      }
    }
  }
  return out;
}

// ---- the local checks ----

/** From this share of its reference a strict draft is told it is close on purpose. */
const REFERENCE_NOTE = 30;

export interface CheckContext {
  sides: readonly Side[];
  keyPoint: string;
  /** The shape the teacher asked for. */
  asked: Shape;
  glossary: Glossary | null;
  corpus: CorpusIndex;
  /** The examples and the other drafts: indexed on the spot. */
  extra: readonly CorpusDoc[];
  /**
   * The references the teacher picked for strict mode: left out of the near-copy limit (u-uugw:
   * unlimited), wherever the corpus holds them. A draft close to one is told so, not failed.
   */
  exempt?: readonly CorpusDoc[];
}

const row = (id: CheckRow['id'], findings: Finding[], state?: CheckRow['state']): CheckRow => ({
  id,
  state: state ?? (findings.length ? 'look' : 'pass'),
  findings,
});

/** A draft's words in reading order, as the corpus holds a question's. */
export function draftWords(draft: McqDraft, side: Side): string {
  return [draft.stem[side], ...draft.statements.map((s) => s[side]), ...draft.options.map((o) => o[side])]
    .map((text) => plain(toRuns(text)))
    .filter(Boolean)
    .join(' ');
}

/**
 * Every local check on one cleaned draft. Mutates the draft's 中文 where the glossary fixes
 * a deny form in place (as E3 does). The `key` row is `skipped` until the blind solve runs.
 */
export function localChecks(draft: McqDraft, ctx: CheckContext): CheckRow[] {
  const shape = shapeFindings(draft, ctx.sides);
  const terms = glossaryPass([draft.stem, ...draft.statements, ...draft.options, draft.explanation], {
    sides: ctx.sides,
    source: '',
    sourceSide: 'en',
    glossary: ctx.glossary,
  }).map((text): Finding => ({ id: 'terms.note', params: { text } }));
  const fields: BiDraft[] = [draft.stem, ...draft.statements, ...draft.options, draft.explanation];
  const mismatch = ctx.sides.length === 2 ? checkNumbers(fields) : null;
  const numbers: Finding[] = mismatch
    ? [{ id: 'numbers.differ', params: { en: mismatch.enOnly.join(', '), zh: mismatch.zhOnly.join(', ') } }]
    : [];
  const words = { en: draftWords(draft, 'en'), zh: draftWords(draft, 'zh') };
  const syllabus = scanLimited(words, ctx.sides, ctx.keyPoint);
  const lint = shape.length ? [] : lintDraft(draft, ctx.sides);
  const combination = draft.statements.length >= 2;
  if (!shape.length && ((ctx.asked === 'combination' && !combination) || (ctx.asked === 'plain' && combination))) {
    lint.push({ id: 'lint.shapeAsked', params: { asked: ctx.asked, got: combination ? 'combination' : 'plain' } });
  }
  const copy = checkNearCopy(words, ctx.corpus, ctx.extra, ctx.exempt);
  const reference = ctx.exempt?.length ? checkNearCopy(words, EMPTY_CORPUS, ctx.exempt) : undefined;
  const copyRow: CheckRow = {
    id: 'copy',
    state: copy.tooClose ? 'fail' : 'pass',
    findings: copy.tooClose
      ? [{ id: 'copy.close', params: { percent: copy.percent, with: copy.closest?.kind ?? 'bank', verbatim: copy.verbatim ? 1 : 0 } }]
      : reference && reference.percent >= REFERENCE_NOTE
        ? [{ id: 'copy.reference', params: { percent: reference.percent } }]
        : [],
    value: copy.percent,
  };
  return [
    row('shape', shape, shape.length ? 'fail' : 'pass'),
    row('key', [], 'skipped'),
    row('numbers', numbers),
    row('terms', terms),
    row('syllabus', syllabus),
    row('lint', lint),
    copyRow,
  ];
}

/** look: a check failed (a warning), something to read, or the key never checked. ok: all pass. Never `failed` (k-0531). */
export function statusOf(checks: readonly CheckRow[]): DraftStatus {
  if (checks.some((c) => c.state === 'fail' || c.state === 'look' || (c.id === 'key' && c.state === 'skipped'))) return 'look';
  return 'ok';
}

/** Whether a check failed on this draft: it carries a red warning (near-copy, format). */
export const hasWarning = (draft: Pick<StudioDraft, 'checks' | 'status'>): boolean => draft.status === 'failed' || draft.checks.some((c) => c.state === 'fail');

/** A draft as it is shown: one saved before k-0531 as `failed` (left out then) reads as `look`. */
export function shownDraft<T extends StudioDraft>(draft: T): T {
  return draft.status === 'failed' ? { ...draft, status: 'look' } : draft;
}

export const failing = (draft: StudioDraft): Finding[] => draft.checks.filter((c) => c.state === 'fail').flatMap((c) => c.findings);
