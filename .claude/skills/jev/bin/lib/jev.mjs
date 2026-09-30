// Jev client: direct TypeSafe API, no dependencies. Every failure returns null.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_BASE = 'https://api.typesafe.ai';
const MAX_CONCURRENT = 8;
const RETRY_STATUS = new Set([429, 529]);

/** The key from env, else ~/.claude/jev.env. Never logged. */
export function apiKey() {
  const env = process.env.TYPESAFE_API_KEY?.trim();
  if (env) return env;
  const file = process.env.JEV_ENV_FILE || join(homedir(), '.claude', 'jev.env');
  try {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s+)?TYPESAFE_API_KEY\s*=\s*(.*?)\s*$/);
      if (m) {
        const value = m[1].replace(/^(['"])(.*)\1$/, '$2').trim();
        if (value) return value;
      }
    }
  } catch {
    /* no file */
  }
  return null;
}

export const hasKey = () => apiKey() !== null;

let active = 0;
const waiting = [];
async function slot() {
  if (active < MAX_CONCURRENT) {
    active++;
    return;
  }
  await new Promise((resolve) => waiting.push(resolve));
  active++;
}
function release() {
  active--;
  waiting.shift()?.();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One request. Resolves to { answers, usage, ms } or null (no key, timeout, HTTP error,
 * malformed body). One retry on 429/529 if the deadline allows it.
 */
export async function ask(state, questions, { timeoutMs = 4000, model = 'jev-latest' } = {}) {
  const key = apiKey();
  if (!key || !questions || Object.keys(questions).length === 0) return null;
  const base = (process.env.JEV_BASE_URL || DEFAULT_BASE).replace(/\/+$/, '');
  const started = Date.now();
  const deadline = started + timeoutMs;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  await slot();
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      let res;
      try {
        res = await fetch(`${base}/v1/systemone`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, state, questions }),
          signal: controller.signal,
        });
      } catch {
        return null;
      }
      if (RETRY_STATUS.has(res.status) && attempt === 0) {
        const wait = 250 + Math.floor(Math.random() * 250);
        if (Date.now() + wait >= deadline - 200) return null;
        await res.body?.cancel().catch(() => {});
        await sleep(wait);
        continue;
      }
      if (!res.ok) {
        if (process.env.JEV_DEBUG) process.stderr.write(`jev: HTTP ${res.status} ${(await res.text().catch(() => '')).slice(0, 300)}\n`);
        return null;
      }
      const body = await res.json().catch(() => null);
      if (!body || typeof body.answers !== 'object' || body.answers === null) return null;
      return { answers: body.answers, usage: body.usage ?? {}, ms: Date.now() - started };
    }
    return null;
  } finally {
    clearTimeout(timer);
    release();
  }
}

/** A Noul answer's probability, or null. */
export function noul(answer) {
  return answer && typeof answer.noul === 'number' ? answer.noul : null;
}

/** Split a question map into requests of at most `size`, ask them in parallel, merge. */
export async function askBatched(state, questions, { size = 20, timeoutMs = 4000 } = {}) {
  const ids = Object.keys(questions);
  const chunks = [];
  for (let i = 0; i < ids.length; i += size) chunks.push(Object.fromEntries(ids.slice(i, i + size).map((id) => [id, questions[id]])));
  const results = await Promise.all(chunks.map((chunk) => ask(state, chunk, { timeoutMs })));
  if (results.every((r) => r === null)) return null;
  const answers = {};
  let inputTokens = 0;
  let ms = 0;
  let failed = 0;
  for (const r of results) {
    if (!r) {
      failed++;
      continue;
    }
    Object.assign(answers, r.answers);
    inputTokens += r.usage.input_tokens ?? 0;
    ms = Math.max(ms, r.ms);
  }
  return { answers, inputTokens, ms, requests: chunks.length, failed };
}
