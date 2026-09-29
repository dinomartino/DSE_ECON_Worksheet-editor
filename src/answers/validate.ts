import type { Glossary } from '@/glossary/types';
import type { AnswerFill } from '@/model/answerLeaves';
import { newId } from '@/model/factories';
import { schemeMax } from '@/model/markScheme';
import type { MarkPoint, MarkScheme } from '@/model/markSchemeTypes';
import { normalizeRuns, plain } from '@/model/text';
import type { Side } from '@/model/textSlots';
import type { BiText, RichText } from '@/model/types';
import { normalizeEn, normalizeZh, traditionalize } from '@/translate/normalize';
import type { AnswerResult, AnswerTarget } from './types';

/**
 * The model's reply, parsed and checked deterministically. Hard failures (unreadable,
 * empty) insert nothing; a scheme that doesn't total the leaf's marks is dropped with a
 * `look` note; a Chinese term off the EDB glossary is inserted with a `look` note.
 */

export interface ReplyItem {
  key: string;
  answerEn: string;
  answerZh: string;
  points: Array<{ en: string; zh: string; marks: number }>;
  rationales: Array<{ option: string; en: string; zh: string }>;
}

const str = (x: unknown) => (typeof x === 'string' ? x : '');
const list = (x: unknown): Array<Record<string, unknown>> =>
  Array.isArray(x) ? x.filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null) : [];

/** The reply's items, or null when it isn't `{items: [...]}` with string keys. Missing fields read as empty. */
export function parseAnswersReply(text: string): ReplyItem[] | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const items = (parsed as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return null;
  const out: ReplyItem[] = [];
  for (const item of items) {
    if (typeof item !== 'object' || item === null || typeof (item as { key?: unknown }).key !== 'string') return null;
    const raw = item as Record<string, unknown>;
    out.push({
      key: raw.key as string,
      answerEn: str(raw.answerEn),
      answerZh: str(raw.answerZh),
      points: list(raw.points).map((p) => ({ en: str(p.en), zh: str(p.zh), marks: typeof p.marks === 'number' ? p.marks : Number.NaN })),
      rationales: list(raw.rationales).map((r) => ({ option: str(r.option), en: str(r.en), zh: str(r.zh) })),
    });
  }
  return out;
}

const SIDE_NAME: Record<Side, string> = { en: 'English', zh: '中文' };

/** One text through the same finishing as translation: HK forms, punctuation, glossary. */
function finish(en: string, zh: string, glossary: Glossary | null, notes: string[]): BiText {
  const enRuns: RichText = en.trim() ? normalizeEn([{ text: en.trim() }]).runs : [];
  let zhRuns: RichText = zh.trim() ? normalizeZh(traditionalize([{ text: zh.trim() }]).runs).runs : [];
  if (glossary && zhRuns.length > 0 && enRuns.length > 0) {
    zhRuns = glossary.autoFix(plain(enRuns), zhRuns).runs;
    for (const term of glossary.checkEnToZh(plain(enRuns), plain(zhRuns))) {
      if (term.severity === 'warn') notes.push(`EDB: ${term.expected} for “${term.source.text}”`);
    }
  }
  return { en: normalizeRuns(enRuns), zh: normalizeRuns(zhRuns) };
}

/** Keep only the sides the paper prints. */
const onSides = (text: BiText, sides: readonly Side[]): BiText => ({
  en: sides.includes('en') ? text.en : [],
  zh: sides.includes('zh') ? text.zh : [],
});
const missing = (text: BiText, sides: readonly Side[]) => sides.filter((side) => text[side].length === 0);

function schemeFrom(points: ReplyItem['points'], sides: readonly Side[], glossary: Glossary | null, notes: string[]): MarkScheme | null {
  const out: MarkPoint[] = [];
  for (const point of points) {
    if (!Number.isInteger(point.marks) || point.marks < 1) return null;
    const text = onSides(finish(point.en, point.zh, glossary, notes), sides);
    if (missing(text, sides).length > 0) return null;
    out.push({ id: newId(), text, marks: point.marks });
  }
  return out.length > 0 ? { routes: [{ id: newId(), groups: [{ id: newId(), points: out }] }] } : null;
}

const failed = (key: string, notes: string[]): AnswerResult => ({ key, status: 'failed', notes });
const settled = (key: string, fill: AnswerFill, notes: string[]): AnswerResult => ({
  key, status: notes.length > 0 ? 'look' : 'ok', fill, notes: [...new Set(notes)],
});

export function evaluateAnswer(target: AnswerTarget, item: ReplyItem | undefined, sides: readonly Side[], glossary: Glossary | null): AnswerResult {
  if (!item) return failed(target.key, ['Missing from the reply. Nothing inserted']);
  const notes: string[] = [];
  const { leaf, needs } = target;
  if (leaf.shape === 'written' && needs.shape === 'written') {
    let answer: BiText | undefined;
    if (needs.answer) {
      const text = onSides(finish(item.answerEn, item.answerZh, glossary, notes), sides);
      const gaps = missing(text, sides);
      if (gaps.length === sides.length) return failed(target.key, ['The reply had no answer. Nothing inserted']);
      gaps.forEach((side) => notes.push(`No ${SIDE_NAME[side]} answer`));
      answer = text;
    }
    let scheme: MarkScheme | undefined;
    if (needs.scheme) {
      const marks = leaf.marks ?? 0;
      const schemeNotes: string[] = [];
      const built = schemeFrom(item.points, sides, glossary, schemeNotes);
      if (built && schemeMax(built) === marks) {
        scheme = built;
        notes.push(...schemeNotes);
      } else {
        notes.push(built ? `Mark scheme didn't add up to ${marks} marks. Not inserted` : 'Mark scheme came back incomplete. Not inserted');
      }
    }
    if (!answer && !scheme) return failed(target.key, notes);
    return settled(target.key, { shape: 'written', ...(answer ? { answer } : {}), ...(scheme ? { scheme } : {}) }, notes);
  }
  if (leaf.shape === 'choice' && needs.shape === 'choice') {
    const rationales: Record<string, BiText> = {};
    for (const option of leaf.options.filter((o) => needs.options.includes(o.id))) {
      const hit = item.rationales.find((r) => r.option.trim().replace(/[.)）]$/, '').toUpperCase() === option.letter);
      const text = hit && onSides(finish(hit.en, hit.zh, glossary, notes), sides);
      if (!text || missing(text, sides).length === sides.length) {
        notes.push(`No explanation for option ${option.letter}`);
        continue;
      }
      missing(text, sides).forEach((side) => notes.push(`Option ${option.letter}: no ${SIDE_NAME[side]}`));
      rationales[option.id] = text;
    }
    if (Object.keys(rationales).length === 0) return failed(target.key, ['The reply had no explanations. Nothing inserted']);
    return settled(target.key, { shape: 'choice', rationales }, notes);
  }
  return failed(target.key, ['Nothing to write']);
}
