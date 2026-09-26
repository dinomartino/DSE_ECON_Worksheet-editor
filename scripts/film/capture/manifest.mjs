// manifest.json: every asset in the store with its size and a one-line description.
import fs from 'node:fs';
import path from 'node:path';
import { ASSETS } from './session.mjs';

/** One line per asset (clips describe themselves in their .json). */
export const DESCRIPTIONS = {
  'stills/start-screen.png': 'Start screen with the seeded library (quiz, diagram question, Paper 1, Paper 2, LQ).',
  'stills/editor-bilingual.png': 'Editor, EN+中, first MCQ selected: the page and the MCQ inspector.',
  'stills/editor-clean.png': 'Editor, EN+中, nothing selected (sidebar on Content), page at the top.',
  'stills/editor-teacher.png': 'Editor in Teacher mode: the MCQ answers in red.',
  'stills/editor-structured.png': 'The structured question selected: marks, lines and (4 marks) on the page.',
  'stills/diagram-canvas.png': 'The drawing canvas with the finished tax diagram, nothing selected.',
  'stills/export-dialog.png': 'Export dialog: Question paper / Answer key / Both.',
  'stills/export-other-apps.png': 'Export → Other apps: ZipGrade, Key CSV, Kahoot, Blooket.',
  'sheets/quiz-1.png': 'Quiz page 1, EN+中, student copy, as printed (DPR 3).',
  'sheets/quiz-2.png': 'Quiz page 2, EN+中, student copy.',
  'sheets/quiz-teacher-1.png': 'Quiz page 1, EN+中, teacher copy (answers in red).',
  'sheets/en.png': 'Quiz page 1 in English only.',
  'sheets/zh.png': 'Quiz page 1 in 中文 only.',
  'sheets/bi.png': 'Quiz page 1 in EN+中 (same as quiz-1).',
  'sheets/diagram-question.png': 'The tax question page with the finished diagram.',
  'sheets/p1-cover.png': 'Paper 1 (MCQ) mock: the exam cover.',
  'sheets/p2-cover.png': 'Paper 2 question-answer booklet: the cover.',
  'sheets/p2-page.png': 'Paper 2 booklet: first body page, page frame and answer lines.',
  'sheets/lq-1.png': 'LQ worksheet page 1: dotted answer space.',
  'sheets/lq-2.png': 'LQ worksheet page 2.',
  'sheets/version-a.png': 'Quiz page 1, Version A (authored order).',
  'sheets/version-b.png': 'Quiz page 1, Version B (options shuffled).',
  'sheets/version-c.png': 'Quiz page 1, Version C (options shuffled).',
  'diagram/full.png': 'The finished tax diagram as on the page, transparent, all layers.',
  'diagram/axes.png': 'Layer: axes, arrowheads, axis titles, origin.',
  'diagram/curves.png': 'Layer: D and S with their labels.',
  'diagram/shift.png': 'Layer: S₁, its label, the shift arrow.',
  'diagram/guides.png': 'Layer: dashed drops and the P₀ P₁ Q₀ Q₁ ticks.',
  'diagram/points.png': 'Layer: E₀ and E₁ dots and labels.',
  'diagram/areas.png': 'Layer: shaded tax revenue and DWL, with their labels.',
  'diagram/layers.json': 'Layer order, canvas size and the composite check against full.png.',
  'export/quiz.docx': 'The quiz exported through Export… → .docx (EN+中, question paper).',
  'export/diagram.docx': 'The tax diagram question exported through Export… → .docx.',
  'export/docx-page-1.png': 'quiz.docx page 1, rendered by LibreOffice headless.',
  'export/docx-page-2.png': 'quiz.docx page 2, rendered by LibreOffice headless.',
  'export/docx-diagram-page-1.png': 'diagram.docx page 1, rendered by LibreOffice headless.',
};

function walk(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full, base) : [path.relative(base, full)];
  });
}

export function writeManifest(log = () => {}) {
  const assets = [];
  const clipsDir = path.join(ASSETS, 'clips');
  for (const file of fs.existsSync(clipsDir) ? fs.readdirSync(clipsDir).filter((f) => f.endsWith('.json')).sort() : []) {
    const meta = JSON.parse(fs.readFileSync(path.join(clipsDir, file), 'utf8'));
    const frames = path.join(clipsDir, meta.name);
    const bytes = fs.existsSync(frames) ? fs.readdirSync(frames).reduce((n, f) => n + fs.statSync(path.join(frames, f)).size, 0) : 0;
    assets.push({
      path: `clips/${meta.name}/`, kind: 'clip', bytes, frames: meta.frames, fps: meta.fps,
      width: meta.width, height: meta.height, duration: meta.duration, events: meta.events.length,
      description: meta.about,
    });
  }
  for (const rel of walk(ASSETS).sort()) {
    if (rel.startsWith('clips/') && !rel.endsWith('.json')) continue;
    if (rel === 'manifest.json' || path.basename(rel).startsWith('.')) continue;
    const key = rel.split(path.sep).join('/');
    const entry = { path: key, kind: key.split('/')[0], bytes: fs.statSync(path.join(ASSETS, rel)).size };
    const png = /\.png$/.test(key) ? pngSize(path.join(ASSETS, rel)) : null;
    if (png) Object.assign(entry, png);
    entry.description = DESCRIPTIONS[key] ?? (key.startsWith('clips/') ? 'Clip metadata: fps, frames, size, events.' : '');
    assets.push(entry);
  }
  const file = path.join(ASSETS, 'manifest.json');
  fs.writeFileSync(file, JSON.stringify({ generated: new Date().toISOString(), assets }, null, 1));
  log(`manifest: ${assets.length} entries → ${file}`);
}

function pngSize(file) {
  const b = Buffer.alloc(24);
  const fd = fs.openSync(file, 'r');
  fs.readSync(fd, b, 0, 24, 0);
  fs.closeSync(fd);
  return b.toString('ascii', 12, 16) === 'IHDR' ? { width: b.readUInt32BE(16), height: b.readUInt32BE(20) } : null;
}
