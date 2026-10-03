// Writes scripts/film2/capture/MANIFEST.md from the store's clip JSON (durations, sizes,
// event times) and the notes below (best in/out, what to look at), and a 3-frame contact
// strip per clip into <store>/strips/. Run after any re-capture:
//
//   FILM_STORE=<store> node scripts/film2/capture/manifest.mjs
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASSETS } from '../../film/paths.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Per clip: where it comes from, the usable window, the three strip frames, and notes. */
const NOTES = {
  // ---- v2 clips (scripts/film2/capture/clips.mjs) ----
  'welcome-desk': { from: 'v2', in: 0.3, out: 5.5, strip: [0.3, 2.6, 4.4], note: 'Empty start screen; hover tints each kind card in turn; the New worksheet dialog (Paper 2 preselected, name field focused) opens on the click.' },
  'launch-splash': { from: 'v2', in: 0, out: 2.8, strip: [0.25, 0.9, 2.2], note: 'The real ?splash=1 boot animation on the virtual clock: tile 0–0.16, axes 0.08–0.42, curves 0.3–0.78, dot/ripple 0.68–1.3, wordmark 0.7–1.1, hand-off into the start screen ~1.3–2.0. No pointer.' },
  'answer-layer': { from: 'v2', in: 0.8, out: 4.8, strip: [1.0, 1.7, 4.0], note: 'Blank axes (Student) → red D, S0, S1, P/Q guides and the tax span (Teacher) plus the blue marking points below. The scroll holds the diagram still through the re-flow.' },
  'answer-draw': { from: 'v2', in: 0.4, out: 7.6, strip: [0.6, 3.4, 7.0], note: 'Drawing canvas, Teacher copy: Draw answer turns red; Shift a copy draws D1, the shift arrow and P1/Q1 guides in red; Done returns to the page with the answer in red.' },
  'shade-area': { from: 'v2', in: 0.5, out: 5.8, strip: [1.2, 1.9, 5.0], note: 'Shade ▾ → Surplus presets: CS then PS land hatched at once (one D, one S: no picker).' },
  'template-picker': { from: 'v2', in: 0.5, out: 7.6, strip: [1.2, 5.2, 7.2], note: 'Templates grid opens in the inspector, scrolls through the topic groups, "minimum" filters it, the Minimum wage diagram lands under the question stem on the page.' },
  'marking-scheme': { from: 'v2', in: 0.6, out: 4.8, strip: [0.6, 1.3, 4.5], note: 'Student page → the answer key on its own pages (Classic), the Layout tab with the four style cards.' },
  'key-layouts': { from: 'v2', in: 0.5, out: 4.9, strip: [1.3, 2.5, 4.6], note: 'One key, four looks; each switch is exact on its event time (Classic until 1.0). Each layout holds 1.2 s (the last 1.6 s).' },
  'bank-screen': { from: 'v2', in: 0.5, out: 7.6, strip: [0.6, 2.4, 6.0], note: '題庫 opens on the coverage chart and topic cards A–EL2 (counts, coverage bars, "Only N. Worth adding more"); Market and Price opens its question list and preview.' },
  'bank-drag': { from: 'v2', in: 0.6, out: 5.2, strip: [0.8, 2.6, 4.2], note: 'The 題庫 tab filtered to one question (search "MTR"); dragged onto the page it appears in place as Q2 (faded) and the rest renumber before release; after release the toast "1 question added from 題庫 · Undo · Done" stays.' },
  'check-terms': { from: 'v2', in: 0.5, out: 6.6, strip: [1.9, 3.4, 4.9], note: '中文 page: wavy underlines under 消費者剩餘 and 供給 (mainland wording) and two acceptable-but-not-first terms; the finding card; Replace with 消費者盈餘. English UI, AI key not needed.' },
  'zh-interface': { from: 'v2', in: 0.5, out: 6.6, strip: [2.4, 3.3, 6.0], note: 'Settings → Language 語言 → 繁體中文: the dialog and the start screen flip to 中文 (開始新的工作紙…). Settings opens on Language (opened once off camera, so its code is loaded); the Language click is a no-op beat.' },
  // ---- v1 clips re-captured into the v2 store (scripts/film/capture/clips.mjs) ----
  'type-mcq': { from: 'v1', in: 0, out: 8, strip: [0.5, 3.5, 7.5], note: 'Type the MCQ stem and options EN + 中文 on the page; formatting toolbar shows while editing.' },
  'language-toggle': { from: 'v1', in: 0.6, out: 5.6, strip: [0.6, 2.0, 3.5], note: 'EN → 中文 → EN+中 on the demo quiz; the page re-flows each time.' },
  'draw-diagram': { from: 'v1', in: 0, out: 15, strip: [1.0, 7.0, 14.5], note: 'v1 hero: from blank axes, D, S, E0 with guides, tax shifts S, shade tax revenue + DWL, Done.' },
  'teacher-toggle': { from: 'v1', in: 0.6, out: 3.9, strip: [0.6, 1.4, 3.6], note: 'Student → Teacher: red answers, "Teacher Version / 教師版" header.' },
  'answer-lines': { from: 'v1', in: 0.6, out: 4.9, strip: [0.6, 2.4, 4.6], note: 'Inspector Lines 0 → 6: dotted answer lines appear under part (a).' },
  'export': { from: 'v1', in: 0.5, out: 4.9, strip: [1.2, 3.1, 4.6], note: 'Export dialog: Question paper → Answer key → Both (folder export list) → Other apps (ZipGrade, Key CSV, Kahoot, Blooket). Nothing downloads.' },
  'versions': { from: 'v1', in: 0.4, out: 3.9, strip: [0.4, 1.8, 3.6], note: 'Setup → Versions 3 → "Version A" on the page.' },
  'scroll-paper': { from: 'v1', in: 0.5, out: 5.9, strip: [0.5, 3.0, 5.8], note: 'Paper 2 question-answer booklet scrolled from its cover through two pages; no pointer.' },
};

const clipsDir = path.join(ASSETS, 'clips');
const fmt = (t) => t.toFixed(2);
const rows = [];
for (const [name, n] of Object.entries(NOTES)) {
  const file = path.join(clipsDir, `${name}.json`);
  if (!fs.existsSync(file)) {
    rows.push(`### ${name}\n\nNot captured in this store.\n`);
    continue;
  }
  const meta = JSON.parse(fs.readFileSync(file, 'utf8'));
  const strip = spawnSync('node', [path.join(HERE, 'strip.mjs'), name, n.strip.join(',')], {
    encoding: 'utf8', env: { ...process.env, FILM_STORE: ASSETS },
  });
  const stripPath = strip.status === 0 ? strip.stdout.trim() : `(strip failed: ${strip.stderr.trim()})`;
  const events = meta.events.length
    ? meta.events.map((e) => `| ${fmt(e.t)} | ${e.kind} | ${e.label ?? ''} | ${e.x ?? ''}, ${e.y ?? ''} |`).join('\n')
    : '| – | – | no input events | |';
  rows.push(`### ${name} (${n.from})

${meta.about}

- Duration ${meta.duration} s, ${meta.frames} frames @ ${meta.fps} fps, ${meta.width}×${meta.height} (1440×900 CSS @2×)
- Best in/out: **${fmt(n.in)} → ${fmt(n.out)} s**
- Strip (${n.strip.map(fmt).join(' / ')} s): \`${stripPath}\`
- ${n.note}

| t (s) | kind | label | frame px |
|---|---|---|---|
${events}
`);
}

const sheets = fs.existsSync(path.join(ASSETS, 'sheets')) ? fs.readdirSync(path.join(ASSETS, 'sheets')).filter((f) => f.endsWith('.png')).sort() : [];
const md = `# Film v2 capture manifest

Generated by \`scripts/film2/capture/manifest.mjs\` from the store \`${ASSETS}\`
(${new Date().toISOString().slice(0, 10)}). Do not edit by hand: change NOTES there and re-run.

Clips are 60 fps JPEG frames in \`clips/<name>/00000.jpg…\` with \`clips/<name>.json\`
(events in clip seconds; frame px = CSS px × 2). Every timed beat is a \`clickAt\`, so its event
time is exact. The app's "now" is Tue 29 Sep 2026 10:24 HKT (virtual clock).

Recapture one clip (main checkout or a worktree with \`out/\` built):

\`\`\`sh
FILM_STORE="$PWD/demo-media/film-v2/assets" FILM_OUT="$PWD/demo-media/film-v2" \\
  npm run film:capture -- --clips=scripts/film2/capture/clips.mjs --only=<clip> --no-build
FILM_STORE="$PWD/demo-media/film-v2/assets" node scripts/film2/capture/manifest.mjs
\`\`\`

## Clips

${rows.join('\n')}
## Stills and sheets

- \`stills/\`: ${fs.existsSync(path.join(ASSETS, 'stills')) ? fs.readdirSync(path.join(ASSETS, 'stills')).join(', ') : '(none)'} (v1 \`stills\` job, 2× viewport).
- \`sheets/\` (DPR 3, A4 2379×3366, print preview): ${sheets.join(', ')}.
  - **paper-covers** job: \`p1-cover\`, \`p2-cover\`, \`p2-page\` (Paper 2 answer page with dotted lines), \`lq-1\`, \`lq-2\` (LQ dotted answer space).
  - **key-sheets** job: \`key-classic\`, \`key-hkeaa\`, \`key-suggested\`, \`key-detailed\` (page 1 of the answer key per layout).
  - v1 \`sheets\` job: quiz pages (EN, 中文, EN+中, teacher), versions A–C, the tax diagram question.
- \`export/\`: the real .docx files and their LibreOffice page renders (v1 \`docx\` job).
- \`diagram/\`: the tax diagram as registration-aligned layers (v1 \`diagram\` job).
`;
fs.writeFileSync(path.join(HERE, 'MANIFEST.md'), md);
console.log(`manifest: ${path.join(HERE, 'MANIFEST.md')}`);
