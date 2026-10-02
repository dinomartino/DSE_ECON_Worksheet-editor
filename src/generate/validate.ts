import type { Glossary, TermCheck } from '@/glossary/types';
import { plain } from '@/model/text';
import type { Side } from '@/model/textSlots';
import type { RichText } from '@/model/types';
import { normalizeEn, normalizeZh, traditionalize } from '@/translate/normalize';
import { digitGroups } from '@/translate/wire';
import type { BiDraft, ItemDraft, McqDraft, PartDraft, Recipe, StructuredDraft } from './types';

/**
 * Deterministic checks on what the model returned. A hard failure (wrong option count,
 * a key out of range, duplicate options, an empty stem, marks that are not positive
 * integers, a combination item whose options don't combine its statements) means the
 * item is never inserted. Soft findings (a number not in the source, a marks total off
 * the asked range, a glossary deviation) are notes; the item is inserted and highlighted.
 */

export interface CheckContext {
  sides: readonly Side[];
  source: string;
  sourceSide: Side;
  recipe: Recipe;
  glossary: Glossary | null;
}

export interface CheckedItem {
  draft: ItemDraft;
  fails: string[];
  looks: string[];
}

const SIDE_LABEL: Record<Side, string> = { en: 'English', zh: '中文' };

// ---- the reply ----

const str = (x: unknown): string => (typeof x === 'string' ? x : '');
const bi = (x: unknown): BiDraft => {
  const r = (x ?? {}) as { en?: unknown; zh?: unknown };
  return { en: str(r.en), zh: str(r.zh) };
};
const list = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
/** Keeps a non-integer visible to the checks (as NaN) instead of rounding it into range. */
const int = (x: unknown): number => (typeof x === 'number' && Number.isInteger(x) ? x : Number.NaN);

/** The reply's questions, or null when it is not the requested JSON. */
export function parseSourceReply(text: string): unknown[] | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as { questions?: unknown };
    return Array.isArray(parsed?.questions) ? parsed.questions : null;
  } catch {
    return null;
  }
}

/** One reply entry as a draft; null for an unknown kind. */
export function draftOf(raw: unknown): ItemDraft | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const kind = str(r.kind).toLowerCase();
  if (kind === 'mcq') {
    return {
      kind: 'mcq',
      stem: bi(r.stem),
      statements: list(r.statements).map(bi),
      options: list(r.options).map(bi),
      answerIndex: int(r.answer),
      explanation: bi(r.explanation),
    };
  }
  if (kind === 'structured') {
    return {
      kind: 'structured',
      stem: bi(r.stem),
      parts: list(r.parts).map((p): PartDraft => {
        const part = (p ?? {}) as Record<string, unknown>;
        return {
          stem: bi(part.stem),
          marks: int(part.marks),
          answer: bi(part.answer),
          points: list(part.points).map((pt) => {
            const point = (pt ?? {}) as Record<string, unknown>;
            return { text: bi(point.text), marks: int(point.marks) };
          }),
        };
      }),
    };
  }
  return null;
}

// ---- text ----

/** `**bold**` is the only markup the model may use; anything else stays literal. */
export function toRuns(text: string): RichText {
  const runs: RichText = [];
  let cursor = 0;
  for (const match of text.matchAll(/\*\*([^*\n]+)\*\*/g)) {
    const at = match.index ?? 0;
    if (at > cursor) runs.push({ text: text.slice(cursor, at) });
    runs.push({ text: match[1], bold: true });
    cursor = at + match[0].length;
  }
  if (cursor < text.length) runs.push({ text: text.slice(cursor) });
  return runs.filter((run) => run.text.length > 0);
}

const fromRuns = (runs: RichText): string => runs.map((run) => (run.bold ? `**${run.text}**` : run.text)).join('');

/** Hong Kong forms and punctuation for 中文, the usual tidy for English. */
function tidySide(text: string, side: Side): string {
  const runs = toRuns(text.trim());
  if (!runs.length) return '';
  if (side === 'en') return fromRuns(normalizeEn(runs).runs).trim();
  return fromRuns(normalizeZh(traditionalize(runs).runs).runs).trim();
}

type Strip = RegExp;
/** The paper derives these; a model that writes them would print them twice. */
const STEM_NUMBER: Strip = /^\s*(?:Q(?:uestion)?\s*)?\d{1,2}\s*[.)．、]\s*/i;
const PART_LETTER: Strip = /^\s*(?:[(（][a-h][)）]|[a-h][).．])\s*/i;
const OPTION_LETTER: Strip = /^\s*(?:[(（][A-D][)）]|[A-D][.．)])\s*/;
const STATEMENT_NUMBER: Strip = /^\s*[(（][1-9][)）]\s*/;

/** Tidied, with the printed label stripped; a side the paper doesn't print is dropped. */
function clean(text: BiDraft, sides: readonly Side[], strip?: Strip): BiDraft {
  const side = (s: Side) => {
    if (!sides.includes(s)) return '';
    const tidy = tidySide(text[s], s);
    return strip ? tidy.replace(strip, '').trim() : tidy;
  };
  return { en: side('en'), zh: side('zh') };
}

const visible = (text: string) => plain(toRuns(text)).trim();
const emptySides = (text: BiDraft, sides: readonly Side[]) => sides.filter((s) => !visible(text[s]));

// ---- checks ----

/** Digit groups in `text` the source never states ("(1)" statement labels aside). */
function strayNumbers(text: string, sourceNumbers: ReadonlySet<string>): string[] {
  return digitGroups(text.replace(/[(（][1-9][)）]/g, ' ')).filter((n) => !sourceNumbers.has(n) && !sourceNumbers.has(n.replace(/%$/, '')));
}

function numberNotes(texts: BiDraft[], ctx: CheckContext): string[] {
  const known = new Set(digitGroups(ctx.source));
  const stray = new Set<string>();
  for (const text of texts) {
    for (const side of ctx.sides) {
      // A translated side may restate a number its other side already carries.
      const allowed = side === ctx.sourceSide ? known : new Set([...known, ...digitGroups(text[ctx.sourceSide] ?? '')]);
      strayNumbers(visible(text[side]), allowed).forEach((n) => stray.add(n));
    }
  }
  return stray.size ? [`Number not in the source: ${[...stray].join(', ')}`] : [];
}

/** "EDB: 物價水平 (not 價格水平)" for warn-level term findings. */
function termNote(check: TermCheck): string {
  // The teacher's own choice or term is never labelled EDB.
  const source = check.chosen || check.custom ? 'Yours' : 'EDB';
  return check.found && check.found.text !== check.expected
    ? `${source}: ${check.expected} (not ${check.found.text})`
    : `${source}: ${check.expected}`;
}

/**
 * The glossary on every 中文 text: deny forms fixed in place, warn-level findings as
 * notes. Against the text's own English when both are written; else against an English
 * source, where only a finding with a fix or a conflict is about this text.
 */
function glossaryPass(texts: BiDraft[], ctx: CheckContext): string[] {
  const { glossary } = ctx;
  if (!glossary || !ctx.sides.includes('zh')) return [];
  const notes = new Set<string>();
  for (const text of texts) {
    const own = ctx.sides.includes('en') && visible(text.en) !== '';
    const reference = own ? visible(text.en) : ctx.sourceSide === 'en' ? ctx.source : '';
    if (!reference || !visible(text.zh)) continue;
    const fixed = glossary.autoFix(reference, toRuns(text.zh));
    text.zh = fromRuns(fixed.runs);
    for (const check of glossary.checkEnToZh(reference, plain(fixed.runs))) {
      if (check.severity !== 'warn') continue;
      if (!own && !check.fix && !check.conflict) continue;
      notes.add(termNote(check));
    }
  }
  return [...notes];
}

const normalizedOption = (text: string) => visible(text).toLowerCase().replace(/\s+/g, ' ').replace(/[。.]$/, '');

function checkMcq(raw: McqDraft, ctx: CheckContext): CheckedItem {
  const { sides } = ctx;
  const draft: McqDraft = {
    kind: 'mcq',
    stem: clean(raw.stem, sides, STEM_NUMBER),
    statements: raw.statements.map((s) => clean(s, sides, STATEMENT_NUMBER)),
    options: raw.options.map((o) => clean(o, sides, OPTION_LETTER)),
    answerIndex: raw.answerIndex,
    explanation: clean(raw.explanation, sides),
  };
  const fails: string[] = [];
  for (const side of emptySides(draft.stem, sides)) fails.push(`The stem is empty (${SIDE_LABEL[side]})`);
  if (draft.options.length !== 4) fails.push(`It has ${draft.options.length} options, not 4`);
  if (!(draft.answerIndex >= 0 && draft.answerIndex <= 3)) fails.push('Its answer is not one of A–D');
  for (const side of sides) {
    const texts = draft.options.map((o) => normalizedOption(o[side]));
    if (texts.some((t) => !t)) fails.push(`An option is empty (${SIDE_LABEL[side]})`);
    else if (new Set(texts).size !== texts.length) fails.push(`Two options are the same (${SIDE_LABEL[side]})`);
  }
  const n = draft.statements.length;
  if (n === 1 || n > 4) fails.push(`It has ${n} statement${n === 1 ? '' : 's'}; a combination item needs 2–4`);
  if (draft.statements.some((s) => emptySides(s, sides).length)) fails.push('A statement is empty');
  if (n >= 2 && n <= 4) {
    for (const side of sides) {
      const combines = draft.options.every((o) => {
        const refs = [...visible(o[side]).matchAll(/[(（]([1-9])[)）]/g)].map((m) => Number(m[1]));
        return refs.length > 0 && refs.every((r) => r <= n);
      });
      if (!combines) {
        fails.push(`Its options don't combine the statements (${SIDE_LABEL[side]})`);
        break;
      }
    }
  }
  const looks = [...numberNotes([draft.stem, ...draft.statements], ctx), ...glossaryPass([draft.stem, ...draft.statements, ...draft.options, draft.explanation], ctx)];
  return { draft, fails, looks };
}

const LETTERS = 'abcdefgh';

function checkStructured(raw: StructuredDraft, ctx: CheckContext): CheckedItem {
  const { sides, recipe } = ctx;
  const draft: StructuredDraft = {
    kind: 'structured',
    stem: clean(raw.stem, sides, STEM_NUMBER),
    parts: raw.parts.map((part) => {
      const points = part.points.map((p) => ({ text: clean(p.text, sides), marks: p.marks }));
      // Points that don't total the part's marks would print a scheme that disagrees with the paper.
      const total = points.reduce((sum, p) => sum + p.marks, 0);
      const usable = points.length > 0 && total === part.marks && points.every((p) => p.marks > 0 && !emptySides(p.text, sides).length);
      return { stem: clean(part.stem, sides, PART_LETTER), marks: part.marks, answer: clean(part.answer, sides), points: usable ? points : [] };
    }),
  };
  const fails: string[] = [];
  const looks: string[] = [];
  for (const side of emptySides(draft.stem, sides)) fails.push(`The stem is empty (${SIDE_LABEL[side]})`);
  if (!draft.parts.length) fails.push('It has no parts');
  draft.parts.forEach((part, i) => {
    const name = `(${LETTERS[i] ?? i + 1})`;
    if (emptySides(part.stem, sides).length) fails.push(`Part ${name} is empty`);
    if (!(part.marks > 0)) fails.push(`Part ${name} marks are not a whole number above 0`);
    if (emptySides(part.answer, sides).length) looks.push(`Part ${name} has no model answer`);
  });
  const total = draft.parts.reduce((sum, part) => sum + (part.marks > 0 ? part.marks : 0), 0);
  if (!fails.length && (total < recipe.marks.min || total > recipe.marks.max)) {
    looks.push(`Totals ${total} marks (asked for ${recipe.marks.min}–${recipe.marks.max})`);
  }
  const texts = [draft.stem, ...draft.parts.flatMap((p) => [p.stem, p.answer, ...p.points.map((pt) => pt.text)])];
  looks.push(...numberNotes([draft.stem, ...draft.parts.map((p) => p.stem)], ctx), ...glossaryPass(texts, ctx));
  return { draft, fails, looks };
}

export function checkDraft(draft: ItemDraft, ctx: CheckContext): CheckedItem {
  return draft.kind === 'mcq' ? checkMcq(draft, ctx) : checkStructured(draft, ctx);
}

/** A combination-statement item: two to four statements. */
export const isCombination = (draft: ItemDraft | undefined): boolean =>
  draft?.kind === 'mcq' && draft.statements.length >= 2;
