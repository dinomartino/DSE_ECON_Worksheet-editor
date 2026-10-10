/**
 * Raw reader lines → `SourceLine`s: the label, trailing marks and table cells split off,
 * and rows that carry several items ("A.⇥…⇥B.⇥…", "A. B. C. D. text") split into
 * one line per item, so detectors never see where a line came from.
 */
import { normalizeRuns, sliceRichText } from '@/model/text';
import type { InlineRun } from '@/model/types';
import { bareOptionLetter, labelLevel, parseLabel, trailingMarks, type ParsedLabel } from './labels';
import { fold, labelZone } from './normalize';
import type { RawLine, RawRun } from './readPlain';
import type { Family, SourceLine } from './types';

const plainOf = (runs: readonly InlineRun[]) => runs.map((r) => r.text).join('');

/** Drop the reader-only `highlight` attribute. */
const clean = (runs: readonly RawRun[]): InlineRun[] =>
  runs.map((run) => {
    const { highlight: _h, ...rest } = run;
    void _h;
    return rest;
  });

function trimRuns(runs: InlineRun[]): InlineRun[] {
  const text = plainOf(runs);
  const start = text.length - text.trimStart().length;
  const end = text.trimEnd().length;
  return normalizeRuns(sliceRichText(runs, start, end));
}

interface Piece {
  runs: RawRun[];
  depth: number;
  listLabel?: string;
  clump?: { family: Family; values: number[] };
}

// ---- several items on one line ----

type Token = { value: number; start: number; end: number };

/** Option letters standing alone in the line: "A." "(A)" "A)" or a letter between TABs. */
function optionTokens(text: string): Token[] {
  const folded = fold(text);
  const tokens: Token[] = [];
  const re = /(?<=^|[\t ])(?:\(([A-H])\)|([A-H])[.)．](?=[\t ]|$)|([A-H])(?=\t))/g;
  for (let m = re.exec(folded); m; m = re.exec(folded)) {
    const letter = m[1] ?? m[2] ?? m[3];
    tokens.push({ value: letter.charCodeAt(0) - 64, start: m.index, end: m.index + m[0].length });
  }
  return tokens;
}

function statementTokens(text: string): Token[] {
  const folded = fold(text);
  const tokens: Token[] = [];
  const re = /(?<=^|[\t ])\((\d)\)(?=[\t ]|$)/g;
  for (let m = re.exec(folded); m; m = re.exec(folded)) tokens.push({ value: +m[1], start: m.index, end: m.index + m[0].length });
  return tokens;
}

/** The longest group of ≥2 tokens with only whitespace between them. */
function clumpOf(text: string, tokens: Token[]): Token[] {
  let best: Token[] = [];
  let group: Token[] = [];
  for (const token of tokens) {
    const prev = group[group.length - 1];
    if (prev && text.slice(prev.end, token.start).trim() === '') group.push(token);
    else group = [token];
    if (group.length > best.length) best = [...group];
  }
  return best.length >= 2 ? best : [];
}

/**
 * Split a line that holds several items. A row ("A.⇥x⇥B.⇥y", Word's option table) splits
 * at each letter; a clump of detached letters ("A. B. C. D. text", a PDF copy) becomes
 * one line carrying the letters, with any text before it on a line of its own.
 */
function splitItems(piece: Piece): Piece[] {
  const text = plainOf(piece.runs);
  const lead = text.length - text.trimStart().length;
  const options = optionTokens(text);
  const sub = (from: number, to: number) => sliceRichText(piece.runs, from, to) as RawRun[];

  const clump = clumpOf(text, options);
  if (clump.length) {
    const first = clump[0];
    const last = clump[clump.length - 1];
    const before = text.slice(lead, first.start).trim();
    const out: Piece[] = [];
    if (before) out.push({ runs: sub(lead, first.start), depth: piece.depth, listLabel: piece.listLabel });
    out.push({
      runs: sub(last.end, text.length),
      depth: piece.depth,
      ...(before || !piece.listLabel ? {} : { listLabel: piece.listLabel }),
      clump: { family: 'A.', values: clump.map((t) => t.value) },
    });
    return out;
  }

  if (options.length >= 2) {
    const ascending = options.every((t, k) => k === 0 || t.value === options[k - 1].value + 1);
    const separated = options.every((t, k) => k === 0 || /(\t| {2,})$/.test(text.slice(0, t.start)));
    const atStart = options[0].start === lead;
    if (ascending && atStart && (separated || (options.length >= 3 && options[0].value === 1))) {
      return options.map((t, k) => ({ runs: sub(t.start, options[k + 1]?.start ?? text.length), depth: piece.depth }));
    }
  }

  const statements = statementTokens(text);
  const sclump = clumpOf(text, statements);
  if (sclump.length && sclump[0].start === lead) {
    const last = sclump[sclump.length - 1];
    return [{ runs: sub(last.end, text.length), depth: piece.depth, clump: { family: '(n)', values: sclump.map((t) => t.value) } }];
  }
  return [piece];
}

// ---- one line ----

const LOWER: ReadonlySet<string> = new Set(['part', 'subpart']);

function emphasisOf(runs: readonly RawRun[], text: string): SourceLine['emphasis'] {
  const inked = runs.filter((r) => r.text.trim() !== '');
  if (!inked.length) return undefined;
  if (/^\*\s*\S|\S\s*\*$/.test(text) && !/^\*\*|\*\*$/.test(text)) return 'star';
  if (inked.every((r) => r.highlight)) return 'highlight';
  if (inked.every((r) => r.bold)) return 'bold';
  const color = inked[0].color;
  if (color && inked.every((r) => r.color === color)) return 'color';
  return undefined;
}

function toLines(piece: Piece, base: Omit<SourceLine, 'i' | 'runs' | 'text' | 'raw' | 'depth'>, out: SourceLine[]): void {
  const full = piece.runs;
  const text = plainOf(full);
  const clumpText = piece.clump?.values.map((v) => (piece.clump!.family === '(n)' ? `(${v})` : `${String.fromCharCode(64 + v)}.`)).join(' ');
  const raw = piece.listLabel ? `${piece.listLabel}\t${text}` : clumpText ? `${clumpText} ${text}` : text;
  const tabs = /^\t*/.exec(text)![0].length;
  const spaces = tabs ? 0 : /^ */.exec(text)![0].length;
  const depth = piece.depth >= 0 ? piece.depth : tabs || Math.floor(spaces / 4);
  const start = text.length - text.trimStart().length;
  const line: SourceLine = { ...base, i: 0, runs: [], text: '', raw, depth };
  if (piece.clump) line.clump = piece.clump;

  if (text.trim() === '' && !piece.listLabel && !piece.clump) {
    if (text.includes('\t')) line.tabOnly = true;
    else line.blank = true;
    out.push(line);
    return;
  }

  // The label: from list numbering, or typed at the start.
  let bodyStart = start;
  let label: ParsedLabel | null = null;
  // "*C. text": a teacher's star on the answer, before the label.
  const star = !piece.listLabel && !piece.clump ? /^\*\s*/.exec(text.slice(start)) : null;
  const labelAt = star && parseLabel(labelZone(text.slice(start + star[0].length))) ? start + star[0].length : start;
  if (piece.listLabel) {
    label = parseLabel(labelZone(`${piece.listLabel} `));
    line.labelSource = 'list';
    line.label = piece.listLabel;
    line.labelRuns = [{ text: `${piece.listLabel} ` }];
  } else if (!piece.clump) {
    label = parseLabel(labelZone(text.slice(labelAt)));
    if (label) {
      line.label = text.slice(labelAt, labelAt + label.text.length);
      line.labelRuns = clean(sliceRichText(full, labelAt, labelAt + label.length) as RawRun[]).map((r) => ({ ...r, text: r.text.replace(/\s+/g, ' ') }));
      line.labelSource = 'text';
      bodyStart = labelAt + label.length;
    }
  }
  if (label) line.labelInfo = { family: label.family, value: label.value, ...(label.alt ? { alt: label.alt } : {}) };

  // "1.⇥(a)⇥text" / "(a)⇥(i)⇥text": a lower level on the same line gets its own line.
  if (label && (labelLevel(label.family) === 'question' || labelLevel(label.family) === 'part')) {
    const rest = text.slice(bodyStart);
    const inner = parseLabel(labelZone(rest));
    const innerLevel = inner && labelLevel(inner.family);
    if (inner && innerLevel && LOWER.has(innerLevel) && innerLevel !== labelLevel(label.family) && rest.slice(inner.length).trim() !== '') {
      out.push({ ...line, runs: [], text: '', raw: text.slice(0, bodyStart) });
      toLines({ runs: sliceRichText(full, bodyStart, text.length) as RawRun[], depth: depth + 1 }, base, out);
      return;
    }
  }

  // Trailing marks, possibly twice ("(4 marks)⇥(3 marks)": the first is the stray).
  let bodyEnd = text.length;
  const found = trailingMarks(text.slice(bodyStart, bodyEnd));
  if (found) {
    line.trailingMarks = found.marks;
    line.marksStyle = found.style;
    bodyEnd = bodyStart + found.at;
    const again = trailingMarks(text.slice(bodyStart, bodyEnd));
    if (again && text.slice(bodyStart, bodyStart + again.at).trim() !== '') {
      line.extraMarks = again.marks;
      bodyEnd = bodyStart + again.at;
    } else if (again) {
      line.extraMarks = line.trailingMarks;
      line.trailingMarks = again.marks;
      bodyEnd = bodyStart + again.at;
    }
  }

  const bodyRaw = sliceRichText(full, bodyStart, bodyEnd) as RawRun[];
  let body = trimRuns(clean(bodyRaw));
  const bodyText = plainOf(body);
  line.emphasis = labelAt !== start ? 'star' : emphasisOf(bodyRaw, bodyText.trim());
  if (!line.emphasis) delete line.emphasis;
  if (line.emphasis === 'star') {
    body = trimRuns(normalizeRuns(body.map((r) => ({ ...r, text: r.text.replace(/^\s*\*\s*|\s*\*\s*$/g, '') }))));
  }

  // Table cells: TABs inside the body, or wide space gaps from a layout copy.
  const cellText = plainOf(body);
  const tabCells = cellText.split('\t');
  const gapCells = cellText.split(/ {3,}/);
  const cutAt = tabCells.filter((c) => c.trim()).length >= 2 ? '\t' : gapCells.filter((c) => c.trim()).length >= 2 ? / {3,}/g : null;
  if (cutAt) {
    const cells: InlineRun[][] = [];
    let from = 0;
    const re = cutAt === '\t' ? /\t/g : (cutAt as RegExp);
    for (let m = re.exec(cellText); m; m = re.exec(cellText)) {
      cells.push(trimRuns(sliceRichText(body, from, m.index)));
      from = m.index + m[0].length;
    }
    cells.push(trimRuns(sliceRichText(body, from, cellText.length)));
    while (cells.length && !plainOf(cells[cells.length - 1]).trim()) cells.pop();
    if (cells.filter((c) => plainOf(c).trim()).length >= 2) line.cells = cells;
  } else if (cellText.includes('\t')) {
    body = trimRuns(normalizeRuns(body.map((r) => ({ ...r, text: r.text.replace(/\t+/g, ' ') }))));
  }

  line.runs = body;
  line.text = plainOf(body).trim();
  out.push(line);
}

/** Every raw line to one or more source lines, numbered in order. */
export function toSourceLines(raw: readonly RawLine[]): SourceLine[] {
  const out: SourceLine[] = [];
  for (const line of raw) {
    const base = {
      ...(line.pageBreak ? { pageBreak: true } : {}),
      ...(line.page !== undefined ? { page: line.page, x: line.x, y: line.y } : {}),
    };
    if (line.image) {
      out.push({ ...base, i: 0, runs: [], text: '', raw: '', depth: 0, image: line.image });
      continue;
    }
    const depth = line.listDepth ?? line.marginDepth ?? -1;
    // An unreadable list label (a symbol, "1.1") stays in the text.
    const listLabel = line.listLabel && parseLabel(labelZone(`${line.listLabel} `)) ? line.listLabel : undefined;
    const runs: RawRun[] = line.listLabel && !listLabel ? [{ text: `${line.listLabel} ` }, ...line.runs] : line.runs;
    const pieces = listLabel && !/\t/.test(plainOf(runs)) ? [{ runs, depth, listLabel }] : splitItems({ runs, depth, listLabel });
    for (const piece of pieces) {
      const before = out.length;
      toLines(piece, base, out);
      // A table row the reader saw as cells keeps them (empty ones too) unless it split into items.
      if (line.cells && pieces.length === 1 && out.length === before + 1 && !out[before].labelInfo) {
        const cells = line.cells.map((c) => trimRuns(clean(c)));
        if (cells.filter((c) => plainOf(c).trim()).length >= 2) out[before].cells = cells;
      }
    }
  }
  return labelBareOptions(out).map((line, i) => ({ ...line, i }));
}

// ---- an option label that lost its dot ----

const optionLabel = (line: SourceLine | undefined) => (line?.labelInfo && labelLevel(line.labelInfo.family) === 'option' ? line.labelInfo : undefined);

/**
 * "A. …", "B (1) and (4) only", "C. …", "D. …": the bare letter is an option when the
 * lines around it run A, B, C, D with it in its place, and at least three siblings carry
 * a label (blank lines between them allowed). A capital letter in prose has no such run.
 */
function labelBareOptions(lines: SourceLine[]): SourceLine[] {
  const filled = (k: number) => !lines[k].blank;
  return lines.map((line, k) => {
    if (line.labelInfo || line.clump || line.cells || line.blank || line.tabOnly || line.image) return line;
    const whole = plainOf(line.runs);
    const bare = bareOptionLetter(whole);
    if (!bare) return line;
    const siblings: Array<{ family: Family; value: number }> = [];
    for (const step of [-1, 1]) {
      let want = bare.value + step;
      for (let j = k + step; j >= 0 && j < lines.length; j += step) {
        if (!filled(j)) continue;
        const info = optionLabel(lines[j]);
        if (!info || info.value !== want) break;
        siblings.push(info);
        want += step;
      }
    }
    const family = siblings[0]?.family;
    const first = Math.min(bare.value, ...siblings.map((s) => s.value));
    if (siblings.length < 3 || first !== 1 || siblings.some((s) => s.family !== family)) return line;
    const body = trimRuns(sliceRichText(line.runs, bare.length, whole.length));
    const letter = whole[0];
    return {
      ...line,
      label: letter,
      labelRuns: [{ text: `${letter} ` }],
      labelInfo: { family: family!, value: bare.value },
      labelSource: 'text' as const,
      runs: body,
      text: plainOf(body).trim(),
    };
  });
}
