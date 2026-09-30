// The documents every capture starts from, built once off camera and cached as a
// Playwright storage state: the demo's quiz typed through the real UI (flow.mjs), the
// library papers (seed-docs.test.ts), and the diagram question with blank axes added
// through the Diagram add button (the demo's diagram seed). Timestamps are pinned relative to EPOCH.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { DIAGRAMS, QUIZ_NAME } from '../../demo/content.mjs';
import { buildQuiz, makeDriver } from '../../demo/flow.mjs';
import { CAPTURE_BUILD, CONTEXT_OPTIONS, EPOCH, MAIN_ROOT } from './session.mjs';

export const SEED_STATE = path.join(CAPTURE_BUILD, 'seed-state.json');
const HOUR = 3600e3;
/** How long before the film's "now" each document was last edited. */
const AGE = {
  [QUIZ_NAME]: 0.15 * HOUR,
  [DIAGRAMS.title]: 0.45 * HOUR,
  'S6 Mock Exam Paper 1': 26 * HOUR,
  'S6 Mock Exam Paper 2': 50 * HOUR,
  'S5 Market Failure LQ': 98 * HOUR,
};

function vitest(file, env, root) {
  const run = spawnSync('npx', ['vitest', 'run', file], { cwd: root, encoding: 'utf8', env: { ...process.env, ...env } });
  if (run.status !== 0) throw new Error(`seed: ${file} failed\n${run.stdout}\n${run.stderr}`);
}

/** Put a stored document and its index row into the page's localStorage. */
const inject = (page, key, json, summary) =>
  page.evaluate(([k, doc, row]) => {
    const index = JSON.parse(localStorage.getItem('econ-worksheet-index') || '[]').filter((r) => r.id !== row.id);
    localStorage.setItem(k, doc);
    localStorage.setItem('econ-worksheet-index', JSON.stringify([...index, row]));
  }, [key, json, summary]);

/** Pin every document's timestamps (and its index row's) to EPOCH minus its AGE. */
function pinTimes(state) {
  for (const origin of state.origins) {
    const items = new Map(origin.localStorage.map((kv) => [kv.name, kv]));
    const index = JSON.parse(items.get('econ-worksheet-index')?.value ?? '[]');
    for (const row of index) {
      const age = AGE[row.title] ?? 3 * HOUR;
      const iso = new Date(EPOCH - age).toISOString();
      row.updatedAt = iso;
      const doc = items.get(`econ-worksheet:${row.id}`);
      if (!doc) continue;
      const parsed = JSON.parse(doc.value);
      parsed.updatedAt = iso;
      if ('createdAt' in parsed) parsed.createdAt = new Date(EPOCH - age - 2 * HOUR).toISOString();
      doc.value = JSON.stringify(parsed, null, 2);
    }
    const idx = items.get('econ-worksheet-index');
    if (idx) idx.value = JSON.stringify(index);
  }
  return state;
}

/** Build (or reuse) the seed state. Returns the storage state object. */
export async function seedState({ browser, url, root, force = false, log }) {
  if (!force && fs.existsSync(SEED_STATE)) return JSON.parse(fs.readFileSync(SEED_STATE, 'utf8'));
  fs.mkdirSync(CAPTURE_BUILD, { recursive: true });
  const diagramSeed = path.join(CAPTURE_BUILD, 'diagram-seed.json');
  const docsSeed = path.join(CAPTURE_BUILD, 'library-seed.json');
  log('seed: emitting documents…');
  vitest('scripts/demo/diagrams-seed.test.ts', { DEMO_SEED: diagramSeed }, root);
  vitest('scripts/film/capture/seed-docs.test.ts', { FILM_SEED: docsSeed }, root);
  const diagram = JSON.parse(fs.readFileSync(diagramSeed, 'utf8'));
  const library = JSON.parse(fs.readFileSync(docsSeed, 'utf8')).docs;

  const ctx = await browser.newContext({ ...CONTEXT_OPTIONS });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log(`  seed page error: ${e.message}`));
  const d = makeDriver(page, { url });
  log('seed: typing the quiz through the UI…');
  await buildQuiz(d);
  await d.wait(1800); // autosave

  log('seed: library papers and the diagram question…');
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  await page.evaluate((v) => localStorage.setItem('econ-worksheet-last-seen-version', v), version);
  for (const doc of library) await inject(page, doc.key, doc.json, doc.summary);
  const w = diagram.worksheet;
  await inject(page, `econ-worksheet:${w.id}`, JSON.stringify(w), {
    id: w.id, title: DIAGRAMS.title, updatedAt: w.updatedAt, questionCount: w.questions.length, hasCover: false,
  });

  // Diagram ▾ → Blank axes, as the demo's storyboard does it.
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: new RegExp(DIAGRAMS.title.split(':')[0]) }).first().click();
  await page.waitForSelector('#print-root .paper');
  await d.wait(800);
  const hint = page.getByRole('button', { name: 'Dismiss hint' });
  if (await hint.count()) await hint.click();
  await page.locator('#print-root').getByText('The government imposes').click();
  await d.wait(500);
  await page.getByRole('button', { name: /^Add diagram/ }).first().click();
  await d.wait(700);
  await page
    .locator('[data-template-group] button')
    .filter({ has: page.locator('span.truncate', { hasText: /^Blank axes$/ }) })
    .click();
  await d.wait(2200); // autosave
  await page.goto(url, { waitUntil: 'networkidle' });
  await d.wait(500);

  const state = pinTimes(await ctx.storageState());
  await ctx.close();
  fs.writeFileSync(SEED_STATE, JSON.stringify(state));
  log(`seed: ${path.relative(MAIN_ROOT, SEED_STATE)}`);
  return state;
}
