import type { Pin, SourceLine } from '@/import';
import { marksOnly, parseLabel } from '@/import/labels';
import { cjkShare, labelZone } from '@/import/normalize';
import { createImageBlock } from '@/model/factories';
import { questionMarks } from '@/model/marks';
import { plain } from '@/model/text';
import type { Side } from '@/model/textSlots';
import type { BiText, ContentBlock, McqQuestion, ParagraphBlock, Question, StructuredQuestion, TableBlock } from '@/model/types';
import {
  answerSpaceOf,
  blockKey,
  blockText,
  listOf,
  listsOf,
  loose,
  norm,
  ownerMarks,
  placeLabel,
  srcKey,
  type LineTarget,
  type ListPath,
  type OwnerPath,
} from './address';
import { blockKeys, type BlockAt, type CheckOp } from './ops';
import type { CheckInput, FindingKind, ImportFinding } from './types';

/**
 * The import check's rules (k-0494): no AI, no network, instant. Each compares the file
 * (its lines as read, `analysis`) with the checked questions, or reads the questions for
 * what an import leaves behind. A finding names its place and, where a rule can be sure of
 * the remedy, carries a fix (`./ops.ts`) — `safe` only where no judgement is needed.
 */

// ---- what an import leaves behind ----

/** Layout text that is never a question's: page furniture, a credit Word adds under an online picture. */
export const JUNK: readonly RegExp[] = [
  /此相片\s*[(（]?\s*作者\s*[:：][^)）]*[)）]?\s*已透過\s*CC\s*BY(?:-[A-Z]{2,3})*\s*授權/,
  /This Photo by Unknown Author is licensed under CC BY(?:-[A-Z]{2,3})*/i,
  /^[-–—]\s*\d{1,3}\s*[-–—]$/,
  /^(?:page|p\.)\s*\d{1,3}(?:\s*(?:of|\/)\s*\d{1,3})?$/i,
  /^第\s*\d{1,3}\s*頁(?:\s*[,，]?\s*共\s*\d{1,3}\s*頁)?$/,
  /^(?:please\s+)?turn\s+over\.?$/i,
  /^go\s+on\s+to\s+the\s+next\s+page\.?$/i,
  /^(?:請翻頁|背頁續|續下頁|請繼續作答)[。.]?$/,
  /^(?:\*+\s*)?end\s+of\s+(?:section\s+[A-Z]|paper|test|examination)(?:\s*\*+)?$/i,
  /^(?:全卷完|試卷完|本部完|甲部完|乙部完)[。.]?$/,
  /answers?\s+written\s+in\s+the\s+margins?\s+will\s+not\s+be\s+marked\.?/i,
  /寫於邊界以外的答案[，,]?\s*將不予評閱[。.]?/,
  /^©.{0,60}$/,
  /^all\s+rights\s+reserved(?:\s+\d{4})?\.?$/i,
];

/** Text compared without spaces, case or punctuation: a label's colon dropped into a table cell still matches. */
const bare = (text: string): string => loose(text).replace(/[\p{P}\p{S}]/gu, '');
const stripJunk = (text: string): string => JUNK.reduce((t, re) => t.replace(new RegExp(re.source, re.flags.replace('g', '') + 'g'), ' '), text);

const junkIn = (text: string): RegExpExecArray | null => {
  const t = text.trim();
  for (const re of JUNK) {
    const m = re.exec(t);
    if (m) return m;
  }
  return null;
};

/** "[4m]", "(4 marks)", "[4]", "（4分）" — at the end of the words, or "[4m]" anywhere. */
const MARKS_TEXT = /\s*(?:\[\s*(\d{1,2})\s*m\s*\]|[([（［]\s*(\d{1,2})\s*marks?\s*[)\]）］]|[(（]\s*(?:共\s*)?(\d{1,2})\s*分\s*[)）])\s*$/i;
const MARKS_INLINE = /\[\s*(\d{1,2})\s*m\s*\]/i;

/** Symbol-font characters Word maps into the Private Use Area, to what they print. */
export const SYMBOL_PUA: Readonly<Record<string, string>> = {
  '\uf02b': '+', '\uf02d': '\u2212', '\uf03d': '=', '\uf03c': '<', '\uf03e': '>',
  '\uf044': '\u0394', '\uf061': '\u03b1', '\uf062': '\u03b2', '\uf064': '\u03b4', '\uf065': '\u03b5', '\uf06c': '\u03bb',
  '\uf06d': '\u03bc', '\uf070': '\u03c0', '\uf073': '\u03c3',
  '\uf0a3': '\u2264', '\uf0a5': '\u221e', '\uf0ab': '\u2194', '\uf0ac': '\u2190', '\uf0ad': '\u2191', '\uf0ae': '\u2192', '\uf0af': '\u2193',
  '\uf0b0': '\u00b0', '\uf0b1': '\u00b1', '\uf0b3': '\u2265', '\uf0b4': '\u00d7', '\uf0b7': '\u2022', '\uf0b8': '\u00f7', '\uf0b9': '\u2260',
  '\uf0bb': '\u2248', '\uf0d6': '\u221a', '\uf0d7': '\u00b7', '\uf0de': '\u21d2', '\uf0db': '\u21d4', '\uf0e5': '\u2211',
};
const PUA = /[\uf020-\uf0ff]/g;

const ENDS = /[.?!。？！:：;；)）"”’…]$/;

// ---- the questions' text, where a fix can reach it ----

interface ParaSite {
  list: ListPath;
  block: ParagraphBlock;
  /** The source panel it sits in, if any. */
  inSource?: boolean;
}

function paragraphs(question: Question): ParaSite[] {
  const out: ParaSite[] = [];
  for (const list of listsOf(question)) {
    const walk = (blocks: readonly ContentBlock[], inSource: boolean) => {
      for (const block of blocks) {
        if (block.kind === 'paragraph') out.push({ list, block, ...(inSource ? { inSource } : {}) });
        if (block.kind === 'source') walk(block.blocks, true);
      }
    };
    walk(listOf(question, list) ?? [], false);
  }
  return out;
}

interface TableSite {
  list: ListPath;
  block: TableBlock;
}

function tables(question: Question): TableSite[] {
  const out: TableSite[] = [];
  for (const list of listsOf(question)) {
    const walk = (blocks: readonly ContentBlock[]) => {
      for (const block of blocks) {
        if (block.kind === 'table') out.push({ list, block });
        if (block.kind === 'source') walk(block.blocks);
      }
    };
    walk(listOf(question, list) ?? []);
  }
  return out;
}

interface Picture {
  list: ListPath;
  src: string;
  widthPx: number;
  heightPx: number;
  key: string;
}

function pictures(question: Question): Picture[] {
  const out: Picture[] = [];
  for (const list of listsOf(question)) {
    const walk = (blocks: readonly ContentBlock[]) => {
      for (const block of blocks) {
        if (block.kind === 'image') out.push({ list, src: block.src, widthPx: block.widthPx, heightPx: block.heightPx, key: blockKey(block) });
        if (block.kind === 'source') walk(block.blocks);
        if (block.kind === 'table') for (const row of block.rows) for (const c of row.cells) if (c.image) out.push({ list, src: c.image.src, widthPx: c.image.widthPx, heightPx: c.image.heightPx, key: '' });
      }
    };
    walk(listOf(question, list) ?? []);
  }
  return out;
}

function lines(question: Question): Array<{ target: LineTarget; text: BiText }> {
  if (question.type !== 'mcq') return [];
  const q = question as McqQuestion;
  return [
    ...(q.statements ?? []).map((text, index) => ({ target: { line: 'statement', index } as LineTarget, text })),
    ...q.options.map((o, option) => ({ target: { line: 'option', option } as LineTarget, text: o.text })),
  ];
}

/** Every word a question prints, as one comparable string. */
export function questionText(question: Question): string {
  const parts = [
    ...listsOf(question).flatMap((l) => (listOf(question, l) ?? []).map(blockText)),
    ...lines(question).map((l) => `${plain(l.text.en)} ${plain(l.text.zh)}`),
  ];
  return norm(parts.join(' '));
}

const ownerOfList = (list: ListPath): OwnerPath | undefined =>
  list.list === 'stem' ? { owner: 'question' } : list.list === 'part' ? { owner: 'part', part: list.part } : list.list === 'sub' ? { owner: 'sub', part: list.part, sub: list.sub } : undefined;

const sides: Side[] = ['en', 'zh'];
const short = (text: string, n = 60) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);

// ---- the file, question by question ----

/** Each outline question's lines: from its first line to the next question's. */
export function spans(input: CheckInput): Array<[number, number]> {
  const qs = input.analysis.outline.questions;
  return qs.map((q, k) => [q.start, k + 1 < qs.length ? qs[k + 1].start : input.analysis.lines.length]);
}

/** A line's words as the paper would hold them: its body, or its cells. */
const lineWords = (line: SourceLine): string[] => (line.cells?.length ? line.cells.map((c) => c.map((r) => r.text).join('')) : [line.text]);

/** A section heading or a rubric line a question does not keep: not lost. */
const SECTION = /^(?:\[\s*\d{1,3}\s*m\s*\]\s*)?(?:section|part)\s+[A-Z0-9]\b|^[甲乙丙]\s*部|^(?:instructions|說明|注意事項)$/i;

// ---- the rules ----

export function deterministicFindings(input: CheckInput): ImportFinding[] {
  const out: ImportFinding[] = [];
  const add = (f: Omit<ImportFinding, 'id' | 'from'> & { key: string }) => {
    const { key, ...rest } = f;
    out.push({ ...rest, id: `${f.kind}:${f.q}:${key}`, from: 'check' });
  };
  const { paper, refs, analysis } = input;
  const at = (q: number, list: ListPath, block: ContentBlock): BlockAt => ({ q: refs[q], list, key: blockKey(block) });

  paper.forEach((question, q) => {
    textRules(question, q, input, add, at);
    structureRules(question, q, input, add, at);
  });
  sourceRules(input, add);
  void analysis;
  return out;
}

type Add = (f: Omit<ImportFinding, 'id' | 'from'> & { key: string }) => void;
type At = (q: number, list: ListPath, block: ContentBlock) => BlockAt;

/** Junk, marks in the words, symbol-font characters, empty paragraphs, split sentences, the wrong side. */
function textRules(question: Question, q: number, input: CheckInput, add: Add, at: At) {
  const ref = input.refs[q];
  const paras = paragraphs(question);
  for (const site of paras) {
    for (const side of sides) {
      const words = plain(site.block.text[side]);
      if (!words.trim()) continue;
      const junk = junkIn(words);
      if (junk) {
        const whole = junk[0].trim() === words.trim();
        add({
          kind: 'junk',
          key: `${blockKey(site.block)}:${side}`,
          q,
          place: placeLabel(site.list),
          params: { text: short(junk[0].trim()) },
          before: short(words, 120),
          after: whole ? '' : short(norm(words.replace(junk[0], ' ')), 120),
          fix: { op: whole ? { op: 'removeBlock', at: at(q, site.list, site.block) } : { op: 'editText', at: at(q, site.list, site.block), side, from: junk[0], to: '' } },
          safe: true,
        });
        continue;
      }
      const marks = MARKS_TEXT.exec(words) ?? MARKS_INLINE.exec(words);
      if (marks) {
        const value = Number(marks[1] ?? marks[2] ?? marks[3]);
        const owner = site.inSource ? undefined : ownerOfList(site.list);
        const has = owner ? ownerMarks(question, owner) : null;
        const edit: CheckOp = { op: 'editText', at: at(q, site.list, site.block), side, from: marks[0], to: '' };
        const setMarks: CheckOp | undefined = owner && has === undefined ? { op: 'setMarks', q: ref, owner, marks: value, expect: null } : undefined;
        add({
          kind: 'marksInText',
          key: `${blockKey(site.block)}:${side}`,
          q,
          place: placeLabel(site.list),
          params: { marks: value, text: marks[0].trim(), set: setMarks ? 1 : 0 },
          before: short(words, 120),
          after: short(norm(words.replace(marks[0], ' ')), 120),
          // The marks go on the part only when it has none; a value the paper already has stays.
          fix: { op: setMarks ? { op: 'batch', ops: [edit, setMarks] } : edit },
          safe: has === undefined || has === value,
        });
      }
      const pua = words.match(PUA);
      if (pua) {
        const known = pua.every((ch) => SYMBOL_PUA[ch]);
        const fixed = words.replace(PUA, (ch) => SYMBOL_PUA[ch] ?? ch);
        add({
          kind: 'garbled',
          key: `${blockKey(site.block)}:${side}`,
          q,
          place: placeLabel(site.list),
          params: { count: pua.length },
          before: short(words, 120),
          ...(known ? { after: short(fixed, 120), fix: { op: { op: 'editText', at: at(q, site.list, site.block), side, from: words, to: fixed } as CheckOp }, safe: true } : { safe: false }),
        });
      } else if (words.includes('\ufffd')) {
        add({ kind: 'garbled', key: `${blockKey(site.block)}:${side}:fffd`, q, place: placeLabel(site.list), params: { count: words.split('\ufffd').length - 1 }, before: short(words, 120), safe: false });
      }
    }
  }
  // Option lines and statements: junk, symbol characters.
  for (const line of lines(question)) {
    for (const side of sides) {
      const words = plain(line.text[side]);
      const pua = words.match(PUA);
      if (pua && pua.every((ch) => SYMBOL_PUA[ch])) {
        const fixed = words.replace(PUA, (ch) => SYMBOL_PUA[ch]);
        add({
          kind: 'garbled',
          key: `${JSON.stringify(line.target)}:${side}`,
          q,
          place: placeLabel(line.target),
          params: { count: pua.length },
          before: words,
          after: fixed,
          fix: { op: { op: 'editLine', q: ref, target: line.target, side, from: words, to: fixed } },
          safe: true,
        });
      }
    }
  }
  // Table cells: junk only (a credit under a photograph in a cell).
  for (const site of tables(question)) {
    site.block.rows.forEach((row, r) =>
      row.cells.forEach((cell, c) => {
        for (const side of sides) {
          const words = plain(cell.text[side]);
          const hit = words.trim() ? (junkIn(words) ?? JUNK[0].exec(words) ?? JUNK[1].exec(words)) : null;
          if (!hit) continue;
          add({
            kind: 'junk',
            key: `${blockKey(site.block)}:${r}:${c}:${side}`,
            q,
            place: placeLabel(site.list),
            params: { text: short(hit[0].trim()) },
            before: short(words, 120),
            after: short(norm(words.replace(hit[0], ' ')), 120),
            fix: { op: { op: 'editCell', at: at(q, site.list, site.block), row: r, cell: c, side, from: hit[0], to: '' } },
            safe: true,
          });
        }
      }),
    );
  }
  // Empty paragraphs at either end of a list, or two in a row.
  for (const list of listsOf(question)) {
    const blocks = listOf(question, list) ?? [];
    if (blocks.length < 2) continue;
    const isEmpty = (b: ContentBlock | undefined) => b?.kind === 'paragraph' && !plain(b.text.en).trim() && !plain(b.text.zh).trim();
    blocks.forEach((block, i) => {
      if (!isEmpty(block)) return;
      if (!(i === 0 || i === blocks.length - 1 || isEmpty(blocks[i - 1]))) return;
      add({ kind: 'emptyBlock', key: `${JSON.stringify(list)}:${i}`, q, place: placeLabel(list), params: {}, fix: { op: { op: 'removeBlock', at: at(q, list, block) } }, safe: true });
    });
    // One sentence cut in two: no closing mark, the next starts in lower case.
    blocks.forEach((block, i) => {
      const next = blocks[i + 1];
      if (block.kind !== 'paragraph' || next?.kind !== 'paragraph') return;
      for (const side of sides) {
        const a = plain(block.text[side]).trim();
        const b = plain(next.text[side]).trim();
        if (a.length < 12 || !b || ENDS.test(a) || !/^[a-z]/.test(b) || /[\t]/.test(a)) continue;
        add({
          kind: 'split',
          key: `${blockKey(block)}:${side}`,
          q,
          place: placeLabel(list),
          params: {},
          before: `${short(a, 60)} ¶ ${short(b, 60)}`,
          after: short(`${a} ${b}`, 120),
          fix: { op: { op: 'joinParagraphs', at: at(q, list, block), next: blockKey(next) } },
          safe: false,
        });
      }
    });
  }
  // A question whose words are on the wrong side: Chinese on the English side, or the reverse.
  const en = norm(paras.map((p) => plain(p.block.text.en)).join(' ') + ' ' + lines(question).map((l) => plain(l.text.en)).join(' '));
  const zh = norm(paras.map((p) => plain(p.block.text.zh)).join(' ') + ' ' + lines(question).map((l) => plain(l.text.zh)).join(' '));
  const wrong: [Side, Side] | undefined =
    en.length >= 12 && !zh && cjkShare(en) >= 0.6 ? ['en', 'zh'] : zh.length >= 12 && !en && cjkShare(zh) <= 0.1 && /[A-Za-z]{3,}/.test(zh) ? ['zh', 'en'] : undefined;
  if (wrong) {
    add({
      kind: 'language',
      key: wrong.join('>'),
      q,
      place: '',
      params: { from: wrong[0], to: wrong[1] },
      before: short(wrong[0] === 'en' ? en : zh),
      fix: { op: { op: 'moveSide', q: ref, from: wrong[0], to: wrong[1] } },
      safe: true,
    });
  }
}

/** Options, pictures, marks, tables: the question against its outline question and the file. */
function structureRules(question: Question, q: number, input: CheckInput, add: Add, at: At) {
  const ref = input.refs[q];
  const k = input.map[q];
  const fresh = k !== undefined ? input.fresh[k] : undefined;
  const span = k !== undefined ? spans(input)[k] : undefined;
  const srcLines = span ? input.analysis.lines.slice(span[0], span[1]) : [];

  if (question.type === 'mcq') {
    const mc = question as McqQuestion;
    mc.options.forEach((option, n) => {
      for (const side of sides) {
        const words = plain(option.text[side]);
        const texts = splitOptionText(words, n);
        if (!texts) continue;
        const after = mc.options.length - 1 + texts.length;
        add({
          kind: 'optionsMerged',
          key: `${n}:${side}`,
          q,
          place: placeLabel({ line: 'option', option: n }),
          params: { count: texts.length },
          before: words,
          after: texts.map((t, i) => `${String.fromCharCode(65 + n + i)}. ${t}`).join('\n'),
          fix: { op: { op: 'splitOption', q: ref, option: n, side, expect: words, texts } },
          safe: after - mc.options.filter((o) => !plain(o.text.en).trim() && !plain(o.text.zh).trim() && !o.blocks?.length).length === 4,
        });
      }
    });
    const filled = mc.options.filter((o) => plain(o.text.en).trim() || plain(o.text.zh).trim() || o.blocks?.length).length;
    if (filled !== 4 && !out_hasMerged(mc)) add({ kind: 'optionCount', key: String(filled), q, place: '', params: { count: filled }, safe: false });
  }

  if (question.type === 'structured' && (question as StructuredQuestion).parts.length === 0) {
    const words = questionText(question);
    const lost = srcLines.some((l) => l.image && !l.image.src);
    if (lost && /which of the following|下列哪/i.test(words)) {
      add({
        kind: 'mcAsWritten',
        key: '',
        q,
        place: '',
        params: {},
        fix: { op: { op: 'makeMc', q: ref, expect: blockKeys(question.blocks) } },
        safe: false,
      });
    }
  }

  // Marks: the paper's total against the file's.
  if (span) {
    let fileMarks = 0;
    for (const line of srcLines) {
      const role = input.analysis.roles[line.i]?.role;
      if (role === 'heading' || role === 'noise' || role === 'answerKey') continue;
      if (line.trailingMarks) fileMarks += line.trailingMarks;
      else if (role === 'marks') fileMarks += marksOnly(line.text || line.raw)?.marks ?? 0;
    }
    const total = questionMarks(question);
    if (fileMarks > 0 && total !== fileMarks) {
      const missing = fresh ? marksGaps(question, fresh) : [];
      if (missing.length) {
        for (const gap of missing)
          add({
            kind: 'marksMissing',
            key: JSON.stringify(gap.owner),
            q,
            place: placeLabel(gap.owner),
            params: { marks: gap.marks },
            after: String(gap.marks),
            fix: { op: { op: 'setMarks', q: ref, owner: gap.owner, marks: gap.marks, expect: null } },
            safe: true,
          });
      } else add({ kind: 'marksTotal', key: '', q, place: '', params: { file: fileMarks, paper: total }, safe: false });
    }
  }

  // Answer lines the file has and the paper does not (a paper imported before k-0494 lost ruled lines drawn as shapes).
  if (input.mode === 'paper' && fresh) {
    for (const gap of spaceGaps(question, fresh))
      add({
        kind: 'spaceMissing',
        key: JSON.stringify(gap.owner),
        q,
        place: placeLabel(gap.owner),
        params: { lines: gap.lines },
        after: String(gap.lines),
        fix: { op: { op: 'setAnswerSpace', q: ref, owner: gap.owner, lines: gap.lines, expect: null } },
        safe: true,
      });
  }

  // Pictures wider than the text column.
  for (const pic of pictures(question)) {
    if (!pic.key || pic.widthPx <= input.maxWidthPx + 2) continue;
    const scale = input.maxWidthPx / pic.widthPx;
    add({
      kind: 'pictureSize',
      key: `wide:${pic.key}`,
      q,
      place: placeLabel(pic.list),
      params: { width: pic.widthPx, max: input.maxWidthPx },
      image: pic.src,
      before: `${pic.widthPx} × ${pic.heightPx}`,
      after: `${input.maxWidthPx} × ${Math.round(pic.heightPx * scale)}`,
      fix: { op: { op: 'resizeImage', at: { q: ref, list: pic.list, key: pic.key }, widthPx: input.maxWidthPx, heightPx: Math.round(pic.heightPx * scale) } },
      safe: true,
    });
  }

  // Tables against the importer's own build of them (an open paper only: the review's are the build).
  if (input.mode === 'paper' && fresh) {
    const mine = tables(question);
    const theirs = tables(fresh);
    mine.forEach((site, n) => {
      const other = theirs[n];
      if (!other || theirs.length !== mine.length) return;
      const shape = (t: TableBlock) => `${t.rows.length}x${Math.max(...t.rows.map((r) => r.cells.length))}`;
      const words = (t: TableBlock) => bare(stripJunk(blockText(t)));
      if (shape(site.block) === shape(other.block) && words(site.block) === words(other.block)) return;
      add({
        kind: 'tableChanged',
        key: blockKey(site.block),
        q,
        place: placeLabel(site.list),
        params: { paper: shape(site.block), file: shape(other.block) },
        before: short(blockText(site.block), 120),
        after: short(blockText(other.block), 120),
        fix: { op: { op: 'replaceBlock', at: at(q, site.list, site.block), block: other.block } },
        safe: false,
      });
    });
  }
  void at;
}

const out_hasMerged = (mc: McqQuestion) => mc.options.some((o, n) => splitOptionText(plain(o.text.en), n) || splitOptionText(plain(o.text.zh), n));

/**
 * The options one option's line holds: "cats  B. dogs  C. mice" read as option A →
 * ["cats", "dogs", "mice"]. Letters must follow on from the option's own; null for one.
 */
export function splitOptionText(text: string, option: number): string[] | null {
  if (!text.trim()) return null;
  const out: string[] = [];
  let rest = text;
  let next = option + 1;
  for (;;) {
    const letter = String.fromCharCode(65 + next);
    // "B." needs a gap before it (two spaces or a tab: "Plan B. is" is a sentence); "(B)" a space.
    const re = new RegExp(`(?:(?:[ \\u3000]{2,}|\\t)\\s*${letter}[.．]|\\s+\\(${letter}\\))\\s+(?=\\S)`);
    const m = re.exec(rest);
    if (!m || next > 4) break;
    out.push(rest.slice(0, m.index).trim());
    rest = rest.slice(m.index + m[0].length);
    next++;
  }
  if (!out.length) return null;
  out.push(rest.trim());
  return out.every(Boolean) ? out : null;
}

/** Owners the importer's build marks and the paper leaves unmarked (same shape only). */
function marksGaps(question: Question, fresh: Question): Array<{ owner: OwnerPath; marks: number }> {
  const out: Array<{ owner: OwnerPath; marks: number }> = [];
  if (question.type !== fresh.type) return out;
  const consider = (owner: OwnerPath) => {
    const mine = ownerMarks(question, owner);
    const theirs = ownerMarks(fresh, owner);
    if (mine === undefined && typeof theirs === 'number') out.push({ owner, marks: theirs });
  };
  if (question.type === 'structured') {
    const a = question as StructuredQuestion;
    const b = fresh as StructuredQuestion;
    if (a.parts.length !== b.parts.length) return out;
    if (!a.parts.length) consider({ owner: 'question' });
    a.parts.forEach((p, part) => {
      if ((p.subParts?.length ?? 0) !== (b.parts[part].subParts?.length ?? 0)) return;
      consider({ owner: 'part', part });
      (p.subParts ?? []).forEach((_s, sub) => consider({ owner: 'sub', part, sub }));
    });
  } else consider({ owner: 'question' });
  return out;
}

/** Owners the importer's build gives answer lines and the paper leaves without (same shape only). */
function spaceGaps(question: Question, fresh: Question): Array<{ owner: OwnerPath; lines: number }> {
  const out: Array<{ owner: OwnerPath; lines: number }> = [];
  if (question.type !== 'structured' || fresh.type !== 'structured') return out;
  const a = question as StructuredQuestion;
  const b = fresh as StructuredQuestion;
  if (a.parts.length !== b.parts.length) return out;
  const consider = (owner: OwnerPath) => {
    const mine = answerSpaceOf(question, owner);
    const theirs = answerSpaceOf(fresh, owner);
    if (mine === undefined && typeof theirs === 'number' && theirs > 0) out.push({ owner, lines: theirs });
  };
  if (!a.parts.length) consider({ owner: 'question' });
  a.parts.forEach((p, part) => {
    if ((p.subParts?.length ?? 0) !== (b.parts[part].subParts?.length ?? 0)) return;
    consider({ owner: 'part', part });
    (p.subParts ?? []).forEach((_s, sub) => consider({ owner: 'sub', part, sub }));
  });
  return out;
}

/** The file's lines against the paper: words and pictures it lost or put elsewhere, merged numbers, tables read as text. */
function sourceRules(input: CheckInput, add: Add) {
  const { analysis, paper, refs, map } = input;
  const allSpans = spans(input);
  const texts = paper.map(questionText);
  const pool = bare(`${texts.join(' ')} ${input.elsewhere ?? ''}`);
  const qOf = new Map<number, number>();
  map.forEach((k, q) => k !== undefined && qOf.set(k, q));
  const pics = paper.map(pictures);
  const where = new Map<string, number>();
  pics.forEach((list, q) => list.forEach((p) => where.set(srcKey(p.src), q)));
  const families = new Set(analysis.profile.question);
  const partFamilies = new Set(analysis.profile.part);
  const noise = new Set(analysis.profile.noise);

  allSpans.forEach(([from, to], k) => {
    const q = qOf.get(k);
    if (q === undefined) return;
    const question = paper[q];
    const outlineQ = analysis.outline.questions[k];
    let lostDrawings = 0;
    let realPictures = 0;
    for (let i = from; i < to; i++) {
      const line = analysis.lines[i];
      const role = analysis.roles[i]?.role;
      // Pictures.
      if (line.image) {
        if (!line.image.src) {
          if (!input.settled?.has(i)) lostDrawings++;
          continue;
        }
        realPictures++;
        const home = where.get(srcKey(line.image.src));
        if (home === q) continue;
        const target = placeFor(question, analysis.lines, i, from);
        const image = imageOf(line);
        if (home === undefined) {
          add({
            kind: 'lostPicture',
            key: String(i),
            q,
            place: placeLabel(target.list),
            params: {},
            image: line.image.src,
            line: i,
            fix: { op: { op: 'insertBlocks', q: refs[q], list: target.list, ...(target.after ? { after: target.after } : {}), blocks: [image] } },
            safe: false,
          });
        } else {
          const pic = pics[home].find((p) => srcKey(p.src) === srcKey(line.image!.src));
          add({
            kind: 'pictureMoved',
            key: String(i),
            q,
            place: placeLabel(target.list),
            params: { from: home, to: q },
            image: line.image.src,
            line: i,
            ...(pic?.key
              ? { fix: { op: { op: 'moveBlock', from: { q: refs[home], list: pic.list, key: pic.key }, to: { q: refs[q], list: target.list, ...(target.after ? { after: target.after } : {}) } } as CheckOp } }
              : {}),
            safe: false,
          });
        }
        continue;
      }
      if (role === 'answerKey' || role === 'ignore' || line.blank) continue;
      // A line the teacher already settled in the review (a role, a join) is theirs.
      if (input.settled?.has(i)) continue;
      // Words.
      const words = lineWords(line).map((w) => w.trim()).filter(Boolean);
      for (const w of words) {
        const key = bare(w);
        if (key.length < 6 || pool.includes(key) || junkIn(w) || noise.has(w) || (role === 'heading' && (SECTION.test(w) || w.length < 40))) continue;
        // A line whose label was taken off: its body may be on the paper without it.
        if (line.label && pool.includes(bare(line.text))) continue;
        // Junk the paper rightly lost (a credit inside the line).
        if (pool.includes(bare(stripJunk(w)))) continue;
        add({
          kind: 'lostText',
          key: String(i),
          q,
          place: '',
          params: { text: short(w, 80) },
          after: short(w, 120),
          line: i,
          ...(input.mode === 'review' && (role === 'heading' || role === 'noise') ? { fix: { pins: [{ kind: 'role', line: i, role: 'stem' } as Pin] } } : textBack(question, refs[q], analysis.lines, i, from, w)),
          safe: false,
        });
        break;
      }
      // The next question's number kept as text.
      const info = line.labelInfo ?? parseLabel(labelZone(line.raw)) ?? undefined;
      if (info && role !== 'question' && families.has(info.family) && outlineQ.number !== undefined && info.value === outlineQ.number + 1 && analysis.outline.questions[k + 1]?.number !== info.value) {
        add({
          kind: 'questionMerged',
          key: String(i),
          q,
          place: '',
          params: { number: info.value },
          before: short(line.raw.trim(), 80),
          line: i,
          ...(input.mode === 'review' ? { fix: { pins: [{ kind: 'newQuestion', line: i } as Pin] } } : {}),
          safe: false,
        });
      } else if (info && (role === 'stem' || role === 'answerSpace') && partFamilies.has(info.family) && outlineQ.parts.length > 0 && i > outlineQ.parts[0].start) {
        add({
          kind: 'partMerged',
          key: String(i),
          q,
          place: '',
          params: { label: line.label ?? '' },
          before: short(line.raw.trim(), 80),
          line: i,
          ...(input.mode === 'review' ? { fix: { pins: [{ kind: 'role', line: i, role: 'part' } as Pin] } } : {}),
          safe: false,
        });
      }
    }
    // A table of the file read as lines of text.
    const rows = analysis.lines.slice(from, to).filter((l) => l.tableRow?.table.dense && analysis.roles[l.i]?.role !== 'table' && analysis.roles[l.i]?.role !== 'heading');
    const grouped = new Map<object, SourceLine[]>();
    for (const l of rows) grouped.set(l.tableRow!.table, [...(grouped.get(l.tableRow!.table) ?? []), l]);
    for (const group of grouped.values()) {
      if (group.length < 2 || group.some((l) => (l.cells?.length ?? 0) < 2)) continue;
      add({
        kind: 'tableAsText',
        key: String(group[0].i),
        q,
        place: '',
        params: { rows: group.length },
        before: short(group.map((l) => l.text).join(' / '), 120),
        line: group[0].i,
        ...(input.mode === 'review' ? { fix: { pins: group.map((l) => ({ kind: 'role', line: l.i, role: 'table' }) as Pin) } } : {}),
        safe: false,
      });
    }
    // Drawings the importer could not read: one finding per question (the paper holds as many pictures as were added since).
    const added = Math.max(0, pics[q].length - realPictures);
    const left = Math.max(0, lostDrawings - added);
    if (left > 0) {
      const kinds = new Set(analysis.lines.slice(from, to).flatMap((l) => (l.image && !l.image.src ? [l.image.alt ?? 'drawing'] : [])));
      add({
        kind: 'lostDrawing',
        key: '',
        q,
        place: '',
        params: { count: left, what: kinds.has('chart') ? 'chart' : kinds.has('smartart') ? 'smartart' : 'drawing' },
        line: analysis.lines.slice(from, to).find((l) => l.image && !l.image.src)?.i,
        safe: false,
      });
    }
  });
}

function imageOf(line: SourceLine): ContentBlock {
  const img = line.image!;
  const w = img.widthPx ?? 320;
  const h = img.heightPx ?? Math.round(w * 0.75);
  const block = createImageBlock(img.src, w, h);
  if (img.naturalWidthPx && img.naturalHeightPx) {
    block.naturalWidthPx = img.naturalWidthPx;
    block.naturalHeightPx = img.naturalHeightPx;
  }
  return block;
}

/** Where a line of the file belongs in the question: after the block holding the words before it. */
function placeFor(question: Question, all: readonly SourceLine[], i: number, from: number): { list: ListPath; after?: string } {
  for (let j = i - 1; j >= from; j--) {
    const prev = all[j];
    const key = loose(prev.text);
    if (key.length < 4) continue;
    for (const list of listsOf(question)) {
      const blocks = listOf(question, list) ?? [];
      const hit = blocks.find((b) => b.kind !== 'image' && loose(blockText(b)).includes(key));
      if (hit) return { list, after: blockKey(hit) };
    }
    break;
  }
  return { list: { list: 'stem' } };
}

/** The fix that puts a lost line back as a paragraph, where the words before it are. */
function textBack(question: Question, ref: number | string, all: readonly SourceLine[], i: number, from: number, words: string): { fix?: { op: CheckOp }; before?: string } {
  // Part of the line is on the paper: that paragraph gets the whole line.
  const whole = bare(words);
  for (const site of paragraphs(question)) {
    for (const side of sides) {
      const has = plain(site.block.text[side]);
      const key = bare(has);
      if (key.length >= 8 && key.length >= whole.length * 0.4 && whole.includes(key)) {
        return { before: has, fix: { op: { op: 'editText', at: { q: ref, list: site.list, key: blockKey(site.block) }, side, from: has, to: words } } };
      }
    }
  }
  const target = placeFor(question, all, i, from);
  if (!target.after && i > from + 1) return {};
  const side: Side = cjkShare(words) >= 0.5 ? 'zh' : 'en';
  const runs = all[i].runs.length ? all[i].runs : [{ text: words }];
  const block: ContentBlock = { kind: 'paragraph', id: 'x', text: { en: side === 'en' ? runs : [], zh: side === 'zh' ? runs : [] } };
  return { fix: { op: { op: 'insertBlocks', q: ref, list: target.list, ...(target.after ? { after: target.after } : {}), blocks: [block] } } };
}

/** The kinds that are problems with the paper itself, not only notes. */
export const KINDS: readonly FindingKind[] = [
  'lostDrawing', 'mcAsWritten', 'questionMerged', 'partMerged', 'lostText', 'lostPicture', 'pictureMoved', 'tableAsText', 'tableChanged',
  'optionsMerged', 'optionCount', 'marksMissing', 'marksTotal', 'spaceMissing', 'marksInText', 'language', 'garbled', 'junk', 'pictureSize', 'split', 'emptyBlock', 'ai',
];
