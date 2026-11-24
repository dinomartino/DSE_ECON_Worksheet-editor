import type { DraftBrief, TurnPart, TurnRead } from '@/questionStudio/understand';
import { toTraditional } from '@/translate/simplified';
import type { AiTurn, Chat, ChatDraft } from './chatTypes';

/**
 * What a teacher's message wants once drafts exist (k-0535, u-yu7s), read on the computer.
 * Two jobs:
 *
 * - the fast path: wording that clearly edits a known draft ("Q2 太易", "make draft 3
 *   harder", the composer's chip) goes straight to the edit with no reading request;
 * - the fallback: when the AI gives no read (a provider or mock that answers picks only),
 *   these rules decide, and an edit whose draft they cannot tell becomes a question back
 *   (draft buttons), never a new set of drafts.
 *
 * Everything else goes to the AI's read, folded into the key-point pick request
 * (`questionStudio/understand.ts`), which the message needed anyway.
 */

export type IntentKind = 'new' | 'edit' | 'another' | 'ask' | 'unsure';

export interface TurnIntent {
  kind: IntentKind;
  /** Draft numbers it is about (edit / another / ask), or the candidates (unsure). */
  drafts: number[];
  how: 'harder' | 'easier' | 'change';
  parts: TurnPart[];
  /** `ask`: the AI's answer. */
  reply?: string;
}

export interface LocalRead extends TurnIntent {
  /** Clear enough to act on with no reading request. */
  sure: boolean;
}

const LETTERS = 'ABCD';
const side = (t: { en: string; zh: string }) => (t.en.trim() || t.zh.trim());

/** The drafts the reader is told about: every draft but a failed write's empty shell. */
export function briefsOf(chat: Pick<Chat, 'drafts'>, explain?: number): DraftBrief[] {
  return chat.drafts.map((d) => {
    const q = d.entry.draft.draft;
    const stem = side(q.stem);
    return {
      no: d.no,
      stem,
      statements: q.statements.map(side),
      options: q.options.map(side),
      answer: q.answerIndex >= 0 && q.answerIndex < 4 ? LETTERS[q.answerIndex] : '',
      table: /^\s*\|.*\|/m.test(q.stem.en) || /^\s*\|.*\|/m.test(q.stem.zh),
      diagram: Boolean(d.entry.draft.diagram?.block || d.entry.draft.diagramSet?.figures.some((f) => f.block)),
      state: d.state,
      ...(d.no === explain ? { explanation: side(q.explanation) } : {}),
    };
  });
}

/** Drafts the newest reply wrote or changed, by number ("this one", "上面嗰題"). */
export function recentOf(chat: Pick<Chat, 'drafts' | 'turns'>): number[] {
  const last = [...chat.turns].reverse().find((t): t is AiTurn => t.role === 'ai' && t.draftIds.length > 0);
  if (!last) return [];
  return last.draftIds.map((id) => chat.drafts.find((d) => d.id === id)?.no).filter((n): n is number => n !== undefined);
}

/** Drafts an edit may touch: not added to the paper. */
export const editable = (d: Pick<ChatDraft, 'state'> | Pick<DraftBrief, 'state'>) => d.state !== 'added';

// ── words ────────────────────────────────────────────────────────────────

const ZH_NUM: Record<string, number> = { 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const EN_ORD: Record<string, number> = { first: 1, '1st': 1, second: 2, '2nd': 2, third: 3, '3rd': 3, fourth: 4, '4th': 4, fifth: 5, '5th': 5, sixth: 6, '6th': 6 };

const num = (s: string) => (/^\d+$/.test(s) ? Number(s) : s.length === 2 && s[0] === '十' ? 10 + (ZH_NUM[s[1]] ?? 0) : ZH_NUM[s] ?? NaN);

const HARDER = /\b(harder|more difficult|tougher|more challenging|too easy|too simple)\b|更難|難啲|難一點|難一些|難些|太易|太容易|太簡單|太淺|深啲|深一點|加深|難度高啲/i;
const EASIER = /\b(easier|simpler|less difficult|too hard|too difficult)\b|更易|易啲|容易啲|容易一點|簡單啲|簡單一點|太難|太深|淺啲|淺一點|降低難度/i;
const EDIT = /\b(change|changes|make|fix|edit|rewrite|reword|replace|swap|shorten|lengthen|simplify|remove|delete|drop|add|use|turn|convert|correct|update|adjust|improve|translate|instead|wrong|should be|too long|too short|redo)\b|改|換|轉|調|加|刪|減|增|唔好|不要|用|變成|修正|更正|翻譯|譯|錯|太長|太短|唔啱|不對/i;
const NEW = /\b(new|more|write|give me|generate|create|another)\b|再出|再擬|再寫|再嚟|再來|多[幾一兩三]?題|出\s*[0-9一二兩三四五]*\s*題|新題|另外|另一題/i;
const LIKE = /\b(like|similar to|based on)\b|似|一樣|咁嘅|這樣的|像|仿照|仿/i;
const QUESTION = /[?？]|^\s*(why|what|which|how|is|are|does|do|can|could|would|should|explain)\b|\b(explain|why)\b|點解|為什麼|為何|係咪|是不是|是否|嗎|解釋下|咩意思/i;
const ALL = /\b(all|every|each|both|them|all of them)\b|全部|所有|每一?題|兩題都|三題都|五題都|佢哋|它們/i;
const LAST = /\b(the )?(last|latest|final|bottom)( one| question| draft| mc| q)?\b|最後(一|嗰|那|個|的)?題|最尾|最新(嗰|那|的)?題/i;
const THIS = /\b(this|that) (one|question|draft|mc)\b|\bit\b|\bthe above\b|上面(嗰|那|的|呢)?題|上面那道|上一題|呢題|呢條|這題|這道題|嗰題|那題|此題/i;
const WITH_TABLE = /(the one|the question|the draft|one) with (a |the )?table|有表(格)?(嗰|那|的)題|表格(嗰|那|的)題/i;
const WITH_DIAGRAM = /(the one|the question|the draft|one) with (a |the )?(diagram|graph|chart|figure|curve)|有圖(嗰|那|的)題|有圖表(嗰|那|的)題|圖(嗰|那)題/i;

const PARTS: Array<[TurnPart, RegExp]> = [
  ['options', /\b(options?|choices?|distractors?)\b|選項|干擾|答案選擇/i],
  ['diagram', /\b(diagram|graph|curve|chart|figure|axis|axes)\b|圖|曲線|座標|軸/i],
  ['table', /\btable\b|表格|表/i],
  ['statements', /\bstatements?\b|陳述|敍述|\(\d\)/i],
  ['numbers', /\b(numbers?|figures?|values?|prices?|quantit(y|ies))\b|數字|數值|價格|數量/i],
  ['answer', /\b(answer|key)\b|答案/i],
  ['explanation', /\b(explanation|explain why)\b|解釋|題解/i],
  ['language', /\b(chinese|english|translate)\b|中文|英文|翻譯/i],
  ['stem', /\b(stem|wording|scenario|context)\b|題幹|情境|字眼/i],
];

/** Draft numbers written out ("draft 2", "drafts 2 and 3", "Q2", "第二題", "#3", "2號"). */
function namedNumbers(text: string): number[] {
  const out: number[] = [];
  // Ordinals ("the second one") are kept as negative places, mapped to page order later.
  const add = (n: number) => Number.isInteger(n) && n !== 0 && !out.includes(n) && out.push(n);
  const list = /(?:drafts?|草稿|questions?|\bq|no\.?|#)\s*(\d+(?:\s*(?:,|and|&|、|同|和|及|與|or|\/)\s*\d+)*)/gi;
  for (const m of text.matchAll(list)) for (const d of m[1].match(/\d+/g) ?? []) add(Number(d));
  for (const m of text.matchAll(/第\s*([0-9]+|十?[一二兩三四五六七八九十])\s*(?:題|條|份|個|道|號)/g)) add(num(m[1]));
  for (const m of text.matchAll(/(\d+)\s*(?:號)(?:題)?/g)) add(Number(m[1]));
  for (const m of text.matchAll(/\b(?:the )?(first|second|third|fourth|fifth|sixth|1st|2nd|3rd|4th|5th|6th)(?: one| question| draft| mc|\b)/gi)) add(-EN_ORD[m[1].toLowerCase()]);
  return out;
}

/**
 * The computer's read of one message. `chip` is the draft chosen before typing (the
 * composer's chip); `recent` the drafts the last reply made.
 */
export function readLocally(textIn: string, drafts: readonly DraftBrief[], opts: { chip?: number; recent?: readonly number[] } = {}): LocalRead {
  // Simplified Chinese reads as Traditional (the rules hold Traditional words only).
  const text = toTraditional(textIn.normalize('NFKC')).trim();
  const out = (kind: IntentKind, nos: number[], sure: boolean): LocalRead => ({ kind, drafts: nos, how, parts, sure });
  const parts = PARTS.filter(([, re]) => re.test(text)).map(([p]) => p);
  const harder = HARDER.test(text);
  const easier = EASIER.test(text);
  const how: TurnIntent['how'] = harder && !easier ? 'harder' : easier && !harder ? 'easier' : 'change';
  if (drafts.length === 0) return out('new', [], true);

  const nos = drafts.map((d) => d.no);
  const live = drafts.filter(editable);
  const order = live.map((d) => d.no);
  const level = harder || easier;
  const edits = level || EDIT.test(text) || parts.length > 0;
  const asks = QUESTION.test(text) && !level && !/\b(make|change|rewrite|replace|use|add|remove)\b|改|換|加|刪|用/i.test(text);
  const wantsNew = NEW.test(text);

  // The chip: the draft is known.
  if (opts.chip !== undefined && nos.includes(opts.chip)) {
    if (wantsNew && LIKE.test(text)) return out('another', [opts.chip], true);
    if (wantsNew && /\b(another|one more)\b|再出|再擬|再寫|多一題/i.test(text) && !edits) return out('another', [opts.chip], true);
    return out(asks ? 'ask' : 'edit', [opts.chip], true);
  }

  // Which drafts the words point at.
  let targets: number[] = [];
  let strong = false;
  const named = namedNumbers(text);
  const ordinals = named.filter((n) => n < 0).map((n) => order[-n - 1]).filter((n): n is number => n !== undefined);
  const numbered = named.filter((n) => n > 0);
  if (numbered.length) {
    targets = numbered;
    strong = true;
  } else if (ordinals.length) {
    targets = ordinals;
    strong = true;
  } else if (ALL.test(text) && (edits || asks)) {
    targets = drafts.filter((d) => d.state === 'open' || d.state === 'accepted').map((d) => d.no);
    strong = targets.length > 0;
  } else if (LAST.test(text)) {
    targets = order.slice(-1);
    strong = targets.length > 0;
  } else if (WITH_TABLE.test(text) || WITH_DIAGRAM.test(text)) {
    const hits = live.filter((d) => (WITH_TABLE.test(text) ? d.table : d.diagram)).map((d) => d.no);
    if (hits.length === 1) return out(asks ? 'ask' : 'edit', hits, true);
    return out('unsure', hits.length ? hits : order, false);
  } else if (THIS.test(text) && (edits || asks) && !(wantsNew && !LIKE.test(text))) {
    const recent = (opts.recent ?? []).filter((n) => order.includes(n));
    if (wantsNew && recent.length === 1) return out('another', recent, true);
    if (recent.length === 1) return out(asks ? 'ask' : 'edit', recent, true);
    return out('unsure', recent.length ? recent : order, false);
  }

  if (targets.length) {
    // A number that is not on the page: ask which.
    if (targets.some((n) => !nos.includes(n))) return out('unsure', order, false);
    if (targets.every((n) => !order.includes(n))) return out('unsure', order, false);
    targets = targets.filter((n) => order.includes(n));
    if (wantsNew && LIKE.test(text) && targets.length === 1) return out('another', targets, true);
    if (wantsNew && !edits) return out('new', [], false);
    if (asks) return out('ask', targets, strong);
    return out('edit', targets, strong && (edits || numbered.length > 0));
  }

  // No draft named. A change or a question with one draft on the page means that one.
  if ((edits || asks) && !wantsNew) {
    if (order.length === 1) return out(asks ? 'ask' : 'edit', order, level || asks);
    // Right after a reply that wrote or changed one draft, a follow-up ("改返啲選項") is most
    // likely about it: the AI is asked first; with no AI read, that draft.
    const recent = (opts.recent ?? []).filter((n) => order.includes(n));
    if (recent.length === 1) return out(asks ? 'ask' : 'edit', recent, false);
    return out('unsure', order, false);
  }
  return out('new', [], false);
}

/**
 * The final read: the AI's when it gave one, else the computer's. The computer's sure edits
 * never reach here (they ran first). An AI "new" for words the computer read as an edit of
 * a named draft is kept as the computer's edit: an edit is never turned into new drafts.
 */
export function decide(local: LocalRead, ai: TurnRead | undefined): TurnIntent {
  if (ai) {
    if (ai.intent === 'new' && local.kind === 'edit' && local.drafts.length > 0) return { ...local, kind: 'unsure' };
    return { kind: ai.intent, drafts: ai.drafts, how: ai.how, parts: ai.parts.length ? ai.parts : local.parts, ...(ai.reply ? { reply: ai.reply } : {}) };
  }
  return local;
}
