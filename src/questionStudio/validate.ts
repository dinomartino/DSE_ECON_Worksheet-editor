import type { BiDraft, McqDraft } from '@/generate/types';
import { FIGURE_ATS, isGridCell, isOptionAt, type FigureAsk, type FigureAt } from '@/diagramGen/figureAt';
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
import { checkDseStyle } from '@/dseStyle/check';
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

export interface RawDraft {
  draft: McqDraft;
  angle: string;
  changes: DraftChange[];
  /**
   * The writer's note to the diagram maker (k-0534): '' = no figure; undefined = the reply
   * has no "figure" key at all (an older reply or mock), when every draft is offered one.
   */
  figure?: string;
  /** Several figures, each with its place (k-0545); `figure` is then unset. */
  figureSet?: FigureAsk[];
}

/**
 * The reply's figures (k-0545: `figures: [{at, note}]`; k-0534's `figure: string` still reads):
 * one in the stem → `figure`; several → `figureSet`; [] → `figure: ''`; neither key → undefined.
 * Unknown places and repeats are dropped; notes are kept short.
 */
export function figuresOf(fields: Record<string, unknown>): Pick<RawDraft, 'figure' | 'figureSet'> {
  if (Array.isArray(fields.figures)) {
    const asks: FigureAsk[] = [];
    for (const entry of fields.figures) {
      if (typeof entry !== 'object' || entry === null) continue;
      const at = String((entry as { at?: unknown }).at ?? '').trim();
      const note = String((entry as { note?: unknown }).note ?? '').trim().slice(0, 600);
      if (!(FIGURE_ATS as readonly string[]).includes(at) || asks.some((a) => a.at === at)) continue;
      asks.push({ at: at as FigureAt, note });
    }
    if (!asks.length) return { figure: '' };
    if (asks.length === 1 && asks[0].at === 'stem') return { figure: asks[0].note };
    // Stem first, then the grid in order, then the options in order: as the paper prints them.
    asks.sort((a, b) => FIGURE_ATS.indexOf(a.at) - FIGURE_ATS.indexOf(b.at));
    return { figureSet: asks };
  }
  if (typeof fields.figure === 'string') return { figure: fields.figure.trim().slice(0, 600) };
  return {};
}

/**
 * A several-figure draft against its own words (k-0545): a grid is 2 to 4 cells numbered (1)
 * up without a gap and holds no statements (its labels are the diagrams); option figures are
 * all four; the stem or options name every grid cell they refer to.
 */
export function figureSetFindings(draft: McqDraft, set: readonly FigureAsk[], sides: readonly Side[]): Finding[] {
  const out: Finding[] = [];
  const cells = set.filter((f) => isGridCell(f.at)).map((f) => Number(f.at.slice(1, 2)));
  const options = set.filter((f) => isOptionAt(f.at));
  if (cells.length === 1 || cells.some((n, i) => n !== i + 1)) out.push({ id: 'shape.figureSet', params: { problem: 'gridCells' } });
  if (cells.length >= 2 && draft.statements.length > 0) out.push({ id: 'shape.figureSet', params: { problem: 'gridStatements' } });
  if (options.length > 0 && options.length !== 4) out.push({ id: 'shape.figureSet', params: { problem: 'optionsAll' } });
  if (cells.length >= 2) {
    for (const side of sides) {
      const words = [draft.stem[side], ...draft.options.map((o) => o[side])].join(' ');
      const named = [...words.matchAll(/[(（]\s*([1-9])\s*[)）]/g)].map((m) => Number(m[1]));
      if (named.some((n) => n > cells.length)) {
        out.push({ id: 'shape.figureSet', params: { problem: 'gridNamed' } });
        break;
      }
    }
  }
  return out;
}

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
    if (draft?.kind !== 'mcq') continue;
    out.push({ draft, angle: asText(fields.angle), changes: parseChanges(fields.changes), ...figuresOf(fields) });
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

// ---- a stem that narrates its figure (k-0534) ----

/**
 * Words that describe a figure instead of referring to it. HKDSE stems say "Refer to the
 * following diagram" and state the policy; the k-0534 draft narrated "dashed lines mark four
 * quantities: Q1 is the quantity supplied on S2 at P1…", and its words then disagreed with
 * the drawing. Matched on the stem and statements, not the options or the explanation.
 */
const NARRATION: Array<{ side: Side; re: RegExp }> = [
  { side: 'en', re: /\bdashed lines?\b|\bdotted lines?\b|\b(?:the )?intersection (?:point )?of\b|\b(?:horizontal|vertical) (?:quantity |price )?axis\b|\bon the (?:x|y)-axis\b|\bfrom left to right\b|\b[PQ]_?\{?\d\}?\s+is\s+the\s+(?:equilibrium\s+)?(?:quantity|price)\b|\bwhere the (?:demand|supply) curve\b|\bthe diagram shows\b|\bmarks? (?:four|three|two) (?:quantities|prices)\b/i },
  { side: 'zh', re: /虛線|交點|相交於|橫軸|縱軸|由左至右|圖中顯示|[PQ]_?\{?\d\}?\s*(?:是|為|代表).{0,12}(?:數量|價格)/ },
];

export function narrationFindings(draft: McqDraft, sides: readonly Side[]): Finding[] {
  const out: Finding[] = [];
  for (const { side, re } of NARRATION) {
    if (!sides.includes(side)) continue;
    const text = [draft.stem[side], ...draft.statements.map((s) => s[side])].join('\n');
    const m = re.exec(text);
    if (m) out.push({ id: 'shape.narrates', params: { side, words: m[0].slice(0, 60) } });
  }
  return out;
}

// ---- shape (the hard checks) ----

/** Why a draft cannot be a question: never offered for insert. */
export function shapeFindings(draft: McqDraft, sides: readonly Side[], optionFigures = false): Finding[] {
  const out: Finding[] = [];
  for (const side of emptySides(draft.stem, sides)) out.push({ id: 'shape.stemEmpty', params: { side } });
  if (draft.options.length !== 4) out.push({ id: 'shape.optionCount', params: { count: draft.options.length } });
  if (!(draft.answerIndex >= 0 && draft.answerIndex <= 3)) out.push({ id: 'shape.keyRange' });
  // An option that is its own diagram (k-0545) may have no words, or the same few.
  for (const side of optionFigures ? [] : sides) {
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
  /** The draft has a diagram drawn for it (k-0534): its stem must not describe it. */
  figure?: boolean;
  /** Several figures asked for (k-0545): their places are checked against the words. */
  figureSet?: readonly FigureAsk[];
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
  const set = ctx.figureSet ?? [];
  const shape = [
    ...shapeFindings(draft, ctx.sides, set.filter((f) => isOptionAt(f.at)).length === 4),
    ...(ctx.figure || set.length ? narrationFindings(draft, ctx.sides) : []),
    ...(set.length ? figureSetFindings(draft, set, ctx.sides) : []),
  ];
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
  // A question told in its diagrams (k-0545: a grid (1)–(4), option diagrams) has few words, and
  // those are the papers' own formula ("Which of the following diagrams …", "(1) and (2) only"):
  // shared words alone say little, so they are a note to compare the diagrams, not a red warning
  // (which also sent every such draft back for a rewrite). A long passage word for word still fails.
  const toldInFigures = set.length >= 2 && copy.tooClose && !copy.verbatim;
  const copyRow: CheckRow = {
    id: 'copy',
    state: toldInFigures ? 'look' : copy.tooClose ? 'fail' : 'pass',
    findings: toldInFigures
      ? [{ id: 'copy.wordsOnly', params: { percent: copy.percent, with: copy.closest?.kind ?? 'bank' } }]
      : copy.tooClose
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
    // The HKDSE house style (k-0548, `src/dseStyle`): notes, never a block; read once the format holds.
    row('style', shape.length ? [] : checkDseStyle(draft, ctx.sides)),
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
