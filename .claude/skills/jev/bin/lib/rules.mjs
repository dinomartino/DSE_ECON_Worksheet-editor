// The guard's rule engine: deterministic rules first, then one Jev request for the rest.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ask, noul } from './jev.mjs';
import { matchesAny, truncate } from './util.mjs';

/** Lines of `after` not present in `before` (multiset difference), joined. */
export function addedLines(before, after) {
  const pool = new Map();
  for (const line of before.split('\n')) pool.set(line, (pool.get(line) ?? 0) + 1);
  const out = [];
  for (const line of after.split('\n')) {
    const n = pool.get(line) ?? 0;
    if (n > 0) pool.set(line, n - 1);
    else out.push(line);
  }
  return out.join('\n');
}

/**
 * What a tool call would change: { before, after, removed, added, exists }.
 * `before`/`after` are whole-file texts when the file can be read, else the edit fragments.
 */
export function changeOf(toolName, input, absPath) {
  const exists = !!absPath && existsSync(absPath);
  let disk = null;
  if (exists) {
    try {
      disk = readFileSync(absPath, 'utf8');
    } catch {
      disk = null;
    }
  }
  const edits =
    toolName === 'Write'
      ? null
      : Array.isArray(input.edits)
        ? input.edits
        : [{ old_string: input.old_string ?? '', new_string: input.new_string ?? '', replace_all: input.replace_all }];
  if (!edits) {
    const content = typeof input.content === 'string' ? input.content : '';
    const before = disk ?? '';
    return { exists, before, after: content, removed: addedLines(content, before), added: addedLines(before, content), fragments: null };
  }
  const olds = edits.map((e) => String(e.old_string ?? '')).join('\n');
  const news = edits.map((e) => String(e.new_string ?? '')).join('\n');
  let after = null;
  if (disk !== null) {
    after = disk;
    for (const e of edits) {
      const o = String(e.old_string ?? '');
      const n = String(e.new_string ?? '');
      if (!o || !after.includes(o)) {
        after = null;
        break;
      }
      after = e.replace_all ? after.split(o).join(n) : after.replace(o, () => n);
    }
  }
  return { exists, before: disk, after, removed: addedLines(news, olds), added: addedLines(olds, news), fragments: { old: olds, new: news } };
}

function countMatches(text, rule) {
  const re = new RegExp(rule.pattern, `g${(rule.flags ?? '').replace('g', '')}`);
  const unless = rule.unless ? new RegExp(rule.unless, (rule.flags ?? '').replace('g', '')) : null;
  let n = 0;
  for (const m of text.matchAll(re)) {
    const lineStart = text.lastIndexOf('\n', m.index) + 1;
    const lineEnd = text.indexOf('\n', m.index);
    const line = text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
    if (!unless || !unless.test(line)) n++;
  }
  return n;
}

// ---------- built-in checks ----------

/** Replace comments and string contents with spaces, keeping newlines and length. */
function blankComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));
}

/** Top-level property names of `interface <name> { ... }`, or null if not found. */
export function interfaceProps(src, name) {
  if (typeof src !== 'string') return null;
  const text = blankComments(src);
  const m = new RegExp(`interface\\s+${name}\\b[^{]*\\{`).exec(text);
  if (!m) return null;
  const props = new Set();
  let depth = 1;
  let lineStart = true;
  let i = m.index + m[0].length;
  for (; i < text.length && depth > 0; i++) {
    const c = text[i];
    if (depth === 1 && lineStart) {
      const p = /^\s*(?:readonly\s+)?([\w$]+)\??\s*:/.exec(text.slice(i, text.indexOf('\n', i) === -1 ? undefined : text.indexOf('\n', i)));
      if (p) props.add(p[1]);
    }
    lineStart = c === '\n';
    if (c === '{' || c === '(' || c === '[' || c === '<') depth += c === '<' ? 0 : 1;
    else if (c === '}' || c === ')' || c === ']') depth -= 1;
  }
  return props;
}

const CHECKS = {
  knownKeys(rule, ctx) {
    const before = interfaceProps(ctx.change.before, rule.interface);
    const after = interfaceProps(ctx.change.after, rule.interface);
    if (!after) return null;
    const added = [...after].filter((p) => !before || !before.has(p));
    if (!added.length) return null;
    let keys = '';
    try {
      keys = readFileSync(join(ctx.checkoutRoot, rule.keysFile), 'utf8');
    } catch {
      return null;
    }
    const set = keys.match(new RegExp(`${rule.keysSet}\\s*=\\s*new Set\\(\\[([\\s\\S]*?)\\]`));
    const known = new Set(set ? [...set[1].matchAll(/['"]([^'"]+)['"]/g)].map((k) => k[1]) : []);
    const missing = added.filter((p) => !known.has(p));
    return missing.length ? rule.text.replace('{names}', missing.map((p) => `\`${p}\``).join(', ')) : null;
  },
};

// ---------- evaluation ----------

export function applicable(rules, rel) {
  return rules.filter((r) => matchesAny(rel, r.globs) && !matchesAny(rel, r.exclude ?? []));
}

/**
 * Evaluate every rule for one change. Returns { blocks: [{id,text}], reminds: [{id,text}], jev }.
 * Deterministic blocks short-circuit: no Jev request is made when one fires.
 */
export async function evaluate(data, ctx) {
  const { rel, change } = ctx;
  const rules = applicable(data.rules, rel);
  const blocks = [];
  const reminds = [];
  const jevRules = [];
  for (const rule of rules) {
    let fired = null;
    if (rule.kind === 'path') fired = !rule.onlyExisting || change.exists ? rule.text : null;
    else if (rule.kind === 'regex') fired = countMatches(change.added, rule) > 0 ? rule.text : null;
    else if (rule.kind === 'check') fired = CHECKS[rule.check]?.(rule, ctx) ?? null;
    else if (rule.kind === 'jev') {
      if (rule.when && !new RegExp(rule.when, 'm').test(change.added)) continue;
      if (rule.skipIf && new RegExp(rule.skipIf, 'm').test(change.added)) continue;
      jevRules.push(rule);
      continue;
    }
    if (fired) (rule.action === 'block' ? blocks : reminds).push({ id: rule.id, text: fired });
  }
  if (blocks.length || !jevRules.length) return { blocks, reminds, jev: null };

  const max = data.maxChangeChars ?? 6000;
  const state = {
    file: rel,
    change: change.fragments
      ? { removed: truncate(change.removed, max / 3), added: truncate(change.added, max) }
      : { added: truncate(change.added, max), removed: truncate(change.removed, max / 3) },
  };
  const questions = Object.fromEntries(jevRules.map((r) => [r.id, { type: 'noul', ...r.question }]));
  const res = await ask(state, questions, { timeoutMs: data.timeoutMs ?? 4000 });
  if (!res) return { blocks, reminds, jev: null };
  const scores = {};
  for (const rule of jevRules) {
    const p = noul(res.answers[rule.id]);
    scores[rule.id] = p;
    if (p !== null && p >= (rule.threshold ?? data.jevThreshold ?? 0.8)) (rule.action === 'block' ? blocks : reminds).push({ id: rule.id, text: rule.text });
  }
  return { blocks, reminds, jev: { scores, inputTokens: res.usage.input_tokens, ms: res.ms } };
}
