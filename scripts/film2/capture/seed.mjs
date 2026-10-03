// Film v2's seed: v1's storage state (the demo quiz, the mock papers, the diagram
// question) plus the v2 documents from seed-docs.test.ts (the marking-scheme paper and the
// tagged 題庫 library), written into the same localStorage the app reads. Cached beside
// v1's seed state; --reseed rebuilds both.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { CAPTURE_BUILD, EPOCH } from '../../film/capture/session.mjs';

export const SEED2_STATE = path.join(CAPTURE_BUILD, 'seed2-state.json');
const INDEX = 'econ-worksheet-index';

/** Emit the v2 documents: [{ name, key, json, summary }]. */
function emitDocs(root) {
  const file = path.join(CAPTURE_BUILD, 'film2-seed-docs.json');
  const run = spawnSync('npx', ['vitest', 'run', 'scripts/film2/capture/seed-docs.test.ts'], {
    cwd: root, encoding: 'utf8', env: { ...process.env, FILM2_SEED: file, FILM2_EPOCH: String(EPOCH) },
  });
  if (run.status !== 0) throw new Error(`seed2: seed-docs.test.ts failed\n${run.stdout}\n${run.stderr}`);
  return JSON.parse(fs.readFileSync(file, 'utf8')).docs;
}

/** A copy of `state` with `docs` stored and indexed (and, with `only`, nothing else). */
export function withDocs(state, docs, { only = false } = {}) {
  const next = structuredClone(state);
  const origin = next.origins[0];
  const keep = (kv) => !only || !(kv.name === INDEX || kv.name.startsWith('econ-worksheet:'));
  origin.localStorage = origin.localStorage.filter(keep);
  let index = JSON.parse(origin.localStorage.find((kv) => kv.name === INDEX)?.value ?? '[]');
  for (const doc of docs) {
    origin.localStorage = origin.localStorage.filter((kv) => kv.name !== doc.key);
    origin.localStorage.push({ name: doc.key, value: doc.json });
    index = [...index.filter((row) => row.id !== doc.summary.id), doc.summary];
  }
  origin.localStorage = origin.localStorage.filter((kv) => kv.name !== INDEX);
  if (docs.length || !only) origin.localStorage.push({ name: INDEX, value: JSON.stringify(index) });
  return next;
}

// v1's documents carry no topics; the bank would open on "N questions have no topic".
const TOPIC_BY_TEXT = [
  [/positive statement/i, 'A.positive-normative'],
  [/free good/i, 'B.goods'],
  [/demand curve/i, 'C.market-demand'],
  [/tax/i, 'C.intervention'],
];
const textOf = (q) => (q.blocks ?? []).map((b) => (b.text?.en ?? []).map((r) => r.text).join('')).join(' ');

/** Tag every untagged question in `state`'s stored documents by its stem. */
export function tagUntagged(state) {
  for (const kv of state.origins[0].localStorage) {
    if (!kv.name.startsWith('econ-worksheet:')) continue;
    const doc = JSON.parse(kv.value);
    let changed = false;
    for (const q of doc.questions ?? []) {
      if (q.tags?.length) continue;
      q.tags = [TOPIC_BY_TEXT.find(([re]) => re.test(textOf(q)))?.[1] ?? 'C.equilibrium'];
      changed = true;
    }
    if (changed) kv.value = JSON.stringify(doc, null, 2);
  }
  return state;
}

/** The capture CLI's hook (`--clips=scripts/film2/capture/clips.mjs`): v1's state + v2 docs. */
export async function seedState({ root, force = false, log, base }) {
  if (!force && fs.existsSync(SEED2_STATE)) return JSON.parse(fs.readFileSync(SEED2_STATE, 'utf8'));
  log('seed2: emitting the v2 documents…');
  const docs = emitDocs(root);
  const state = tagUntagged(withDocs(base, docs));
  fs.writeFileSync(SEED2_STATE, JSON.stringify(state));
  fs.writeFileSync(path.join(CAPTURE_BUILD, 'seed2-docs.json'), JSON.stringify(docs));
  log(`seed2: ${docs.length} documents added`);
  return state;
}

/** The v2 documents last emitted (for clips that want a state with only some of them). */
export function seededDocs() {
  return JSON.parse(fs.readFileSync(path.join(CAPTURE_BUILD, 'seed2-docs.json'), 'utf8'));
}
