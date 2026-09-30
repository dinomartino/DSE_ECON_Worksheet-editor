// Candidates (doc sections, memories, source files) and their ranking.
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { askBatched, hasKey, noul } from './jev.mjs';
import { git, mainRoot, matchesAny, ROOT, truncate } from './util.mjs';

// ---------- doc sections ----------

const HEADING = /^(#{1,4})\s+(.*?)\s*#*\s*$/;
const BULLET = /^(?:[-*]|\d+\.)\s/;

const clean = (s) => s.replace(/\*\*|__|<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

function leadOf(lines) {
  const bold = lines.join(' ').match(/\*\*(.+?)\*\*/);
  return bold ? truncate(clean(bold[1]), 60) : null;
}

/** Top-level blocks of a section body: list items (with continuations) or paragraphs. */
function blocksOf(lines, offset) {
  const blocks = [];
  let current = null;
  let fence = false;
  let prevBlank = true;
  lines.forEach((line, i) => {
    const fenceLine = /^\s*```/.test(line);
    const starts = !fence && (BULLET.test(line) || (line.trim() !== '' && prevBlank));
    if (!current || starts) {
      current = { start: offset + i, lines: [] };
      blocks.push(current);
    }
    current.lines.push(line);
    if (fenceLine) fence = !fence;
    prevBlank = !fence && line.trim() === '';
  });
  return blocks.filter((b) => b.lines.some((l) => l.trim()));
}

/** Split one markdown file into sections at h1-h3, then into chunks of at most maxLines. */
export function sectionsOf(path, text, { maxLines = 40, splitBullets = false } = {}) {
  const lines = text.split('\n');
  const heads = [];
  let fence = false;
  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) fence = !fence;
    const m = !fence && line.match(HEADING);
    if (m && m[1].length <= 3) heads.push({ line: i, level: m[1].length, title: clean(m[2]) });
  });
  const title = heads.find((h) => h.level === 1)?.title ?? path;
  const spans = [];
  if (!heads.length || heads[0].line > 0) spans.push({ start: 0, end: (heads[0]?.line ?? lines.length) - 1, heading: title });
  let h2 = null;
  heads.forEach((h, k) => {
    if (h.level === 2) h2 = h.title;
    if (h.level === 1) h2 = null;
    const label = h.level === 3 && h2 ? `${h2} › ${h.title}` : h.title;
    spans.push({ start: h.line, end: (heads[k + 1]?.line ?? lines.length) - 1, heading: label });
  });

  const out = [];
  for (const span of spans) {
    const bodyStart = lines[span.start]?.match(HEADING) ? span.start + 1 : span.start;
    const body = lines.slice(bodyStart, span.end + 1);
    if (!body.some((l) => l.trim())) continue;
    const size = span.end - span.start + 1;
    if (size <= maxLines && !splitBullets) {
      out.push(make(path, span.start, lines.slice(span.start, span.end + 1), span.heading));
      continue;
    }
    const blocks = blocksOf(body, bodyStart);
    let pack = null;
    let first = true;
    const flush = () => {
      if (!pack) return;
      const end = pack.start + pack.lines.length - 1;
      const start = first ? span.start : pack.start;
      const lead = leadOf(pack.lines);
      const heading = (first && !splitBullets) || (first && !lead) ? span.heading : lead ? `${span.heading} › ${lead}` : `${span.heading} (cont.)`;
      out.push(make(path, start, lines.slice(start, end + 1), heading));
      first = false;
      pack = null;
    };
    for (const block of blocks) {
      const isBullet = BULLET.test(block.lines[0]);
      if (pack && (pack.lines.length + block.lines.length > maxLines || (splitBullets && isBullet))) flush();
      if (!pack) pack = { start: block.start, lines: [] };
      pack.lines.push(...block.lines);
    }
    flush();
  }
  return out;
}

function make(path, start, lines, heading) {
  let last = lines.length - 1;
  while (last > 0 && !lines[last].trim()) last--;
  const body = lines.filter((l) => !HEADING.test(l)).join('\n');
  return { kind: 'doc', path, startLine: start + 1, endLine: start + 1 + last, heading, body };
}

export function docCandidates(cfg, root = ROOT) {
  const out = [];
  for (const source of cfg.sources) {
    const file = join(root, source.path);
    if (existsSync(file)) out.push(...sectionsOf(source.path, readFileSync(file, 'utf8'), source));
  }
  return out;
}

// ---------- memories ----------

export function memoryDir(root = ROOT) {
  const slug = mainRoot(root).replace(/[^A-Za-z0-9]/g, '-');
  return join(homedir(), '.claude', 'projects', slug, 'memory');
}

export function memoryCandidates(root = ROOT) {
  const dir = memoryDir(root);
  let index;
  try {
    index = readFileSync(join(dir, 'MEMORY.md'), 'utf8');
  } catch {
    return [];
  }
  const out = [];
  for (const line of index.split('\n')) {
    const m = line.match(/^\s*-\s*\[(.+?)\]\((.+?)\)\s*[—–:-]*\s*(.*)$/);
    if (!m) continue;
    const file = join(dir, m[2]);
    let lines = 1;
    try {
      lines = readFileSync(file, 'utf8').split('\n').length;
    } catch {
      continue;
    }
    out.push({ kind: 'memory', path: file, startLine: 1, endLine: lines, heading: `memory: ${m[1]}`, body: m[3] });
  }
  return out;
}

// ---------- source files ----------

export function codeCandidates(question, extraTerms, cfg, root = ROOT) {
  const terms = [...new Set([...extraTerms, ...queryTerms(question)].map((t) => t.trim()).filter((t) => t.length >= 3))].slice(0, 12);
  if (!terms.length) return [];
  const hits = new Map();
  const touch = (path) => {
    if (!hits.has(path)) hits.set(path, { terms: new Set(), lines: [], pathHits: 0 });
    return hits.get(path);
  };
  const specs = cfg.include;
  let out = '';
  try {
    out = git(['grep', '-n', '-i', '-I', '-F', ...terms.flatMap((t) => ['-e', t]), '--', ...specs], root);
  } catch {
    /* no matches exits 1 */
  }
  for (const line of out.split('\n')) {
    const m = line.match(/^([^:]+):(\d+):(.*)$/);
    if (!m || matchesAny(m[1], cfg.exclude)) continue;
    const h = touch(m[1]);
    const text = m[3].toLowerCase();
    for (const t of terms) if (text.includes(t.toLowerCase())) h.terms.add(t.toLowerCase());
    if (h.lines.length < 200) h.lines.push({ n: Number(m[2]), text: m[3].trim() });
  }
  let files = [];
  try {
    files = git(['ls-files', '--', ...specs], root).split('\n').filter(Boolean);
  } catch {
    /* not a repo */
  }
  for (const f of files) {
    if (matchesAny(f, cfg.exclude)) continue;
    const lower = f.toLowerCase();
    const n = terms.filter((t) => lower.includes(t.toLowerCase().replace(/\s+/g, ''))).length;
    if (n) touch(f).pathHits = n;
  }
  const codemap = safeRead(join(root, 'docs/CODEMAP.md')).split('\n');
  const total = Math.max(files.length, hits.size, 1);
  const df = new Map();
  for (const h of hits.values()) for (const t of h.terms) df.set(t, (df.get(t) ?? 0) + 1);
  const idf = (t) => Math.log(total / (df.get(t) ?? 1));
  const ranked = [...hits.entries()]
    .map(([path, h]) => ({ path, h, score: [...h.terms].reduce((s, t) => s + idf(t), 0) + 3 * h.pathHits + 0.3 * Math.log1p(h.lines.length) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, cfg.maxFiles);
  return ranked.map(({ path, h, score }) => {
    const mapLine = codemap.find((l) => l.includes(path));
    const first = h.lines[0]?.n ?? 1;
    const shown = h.lines.slice(0, cfg.matchLines);
    return {
      kind: 'code',
      path,
      startLine: Math.max(1, first - 3),
      endLine: first + 40,
      heading: mapLine ? truncate(clean(mapLine.replace(/^[-*]\s*/, '')), 110) : truncate(h.lines[0]?.text ?? path, 110),
      body: shown.map((l) => `${l.n}: ${truncate(l.text, 140)}`).join('\n'),
      matchLines: h.lines.slice(0, 8).map((l) => l.n),
      prior: score,
    };
  });
}

function safeRead(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

// ---------- keyword ranking ----------

const STOP = new Set(
  'a an and are as at be but by can do does for from has have how i if in into is it its me my no not of on or our should so that the their them then there these this those to up us was we what when where which who why will with you your about after before also any each get got make new use using just like need want there here than too very via only more most'.split(
    ' ',
  ),
);

export function tokens(text) {
  const out = [];
  const spaced = text.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase();
  for (const raw of spaced.split(/[^a-z0-9㐀-鿿]+/)) {
    if (!raw) continue;
    if (/[㐀-鿿]/.test(raw)) {
      for (let i = 0; i < raw.length; i++) out.push(raw[i], ...(i + 1 < raw.length ? [raw.slice(i, i + 2)] : []));
      continue;
    }
    if (STOP.has(raw) || raw.length < 2) continue;
    out.push(stem(raw));
  }
  return out;
}

const stem = (w) => (w.length > 4 && w.endsWith('ies') ? `${w.slice(0, -3)}y` : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);

/** Words from the question worth grepping for (original spelling, not stemmed). */
export function queryTerms(question) {
  return [...new Set(question.split(/[^A-Za-z0-9_.@/\-㐀-鿿]+/).filter((w) => w.length >= 4 && !STOP.has(w.toLowerCase())))];
}

/** BM25 with the heading counted three times. Adds `kw` to each candidate. */
export function keywordRank(question, candidates) {
  const q = [...new Set(tokens(question))];
  const docs = candidates.map((c) => {
    const tf = new Map();
    const all = [...tokens(c.heading), ...tokens(c.heading), ...tokens(c.heading), ...tokens(c.body ?? '')];
    for (const t of all) tf.set(t, (tf.get(t) ?? 0) + 1);
    return { tf, len: all.length };
  });
  const avg = docs.reduce((s, d) => s + d.len, 0) / Math.max(1, docs.length);
  const df = new Map(q.map((t) => [t, docs.filter((d) => d.tf.has(t)).length]));
  const N = docs.length;
  candidates.forEach((c, i) => {
    const d = docs[i];
    let s = 0;
    for (const t of q) {
      const f = d.tf.get(t);
      if (!f) continue;
      const idf = Math.log(1 + (N - df.get(t) + 0.5) / (df.get(t) + 0.5));
      s += (idf * f * 2.2) / (f + 1.2 * (0.25 + (0.75 * d.len) / avg));
    }
    c.kw = s + (c.prior ?? 0);
  });
  return [...candidates].sort((a, b) => b.kw - a.kw);
}

// ---------- Jev ranking ----------

export function excerpt(c, chars) {
  return truncate(clean((c.body ?? '').replace(/`/g, '')), chars);
}

/**
 * Keyword shortlist, then one Noul per candidate (state = the request, the candidate in the
 * question). Falls back to keyword order when there is no key or every request fails.
 */
export async function rank(question, candidates, cfg, { useJev = true } = {}) {
  // Code and prose score on different scales, so each gets its own keyword shortlist.
  const top = (list, n) => keywordRank(question, list).filter((c) => c.kw > 0).slice(0, n);
  const code = candidates.filter((c) => c.kind === 'code');
  const shortlist = [...top(candidates.filter((c) => c.kind !== 'code'), cfg.shortlist), ...top(code, cfg.code?.shortlist ?? 12)];
  const byKw = () => shortlist.map((c) => ({ ...c, score: c.kw })).sort((a, b) => b.score - a.score);
  if (!useJev || !hasKey() || !shortlist.length) return { mode: hasKey() || !useJev ? 'keyword' : 'keyword-nokey', hits: byKw(), usage: null };
  const questions = {};
  shortlist.forEach((c, i) => {
    questions[`c${i}`] = {
      type: 'noul',
      instructions: {
        section: { file: c.path, heading: c.heading, excerpt: excerpt(c, cfg.excerptChars) },
        question: cfg.question.instructions,
      },
      criteria: cfg.question.criteria,
    };
  });
  const result = await askBatched({ request: question }, questions, { size: cfg.batchSize, timeoutMs: cfg.timeoutMs });
  if (!result) return { mode: 'keyword-jev-failed', hits: byKw(), usage: null };
  const hits = shortlist
    .map((c, i) => ({ ...c, score: noul(result.answers[`c${i}`]) }))
    .filter((c) => c.score !== null)
    .sort((a, b) => b.score - a.score || b.kw - a.kw);
  return { mode: 'jev', hits, usage: { inputTokens: result.inputTokens, requests: result.requests, failed: result.failed, ms: result.ms } };
}

export function formatHit(h, withScore = true) {
  const score = withScore && typeof h.score === 'number' ? `  (${h.score.toFixed(2)})` : '';
  return `${h.path}:${h.startLine}-${h.endLine}  ${h.heading}${score}`;
}
