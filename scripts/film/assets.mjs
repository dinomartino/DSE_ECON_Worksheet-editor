// Every asset the stage loads, by id: its file in the asset store (clips: the folder, beside
// its .json), the capture command that makes it (run as `npm run film:capture -- …` or from
// scripts/film/capture/), and the scenes allowed to load it. Browser-safe, no imports.
// Scenes load only by id (ctx.load.texture/clip/url); the engine refuses anything else.

const cap = (only) => `capture.mjs --only=${only}`;
const marks = (only) => `extra-marks.mjs --only=${only}`;

export const ASSETS = {
  // Clips: 60 fps JPEG frames + <path>.json (events, duration).
  'type-mcq': { kind: 'clip', path: 'clips/type-mcq', capture: cap('type-mcq'), scenes: ['write', 'montage'] },
  'language-toggle': { kind: 'clip', path: 'clips/language-toggle', capture: cap('language-toggle'), scenes: ['write', 'montage'] },
  'draw-diagram': { kind: 'clip', path: 'clips/draw-diagram', capture: cap('draw-diagram'), scenes: ['diagrams', 'montage'] },
  'teacher-toggle': { kind: 'clip', path: 'clips/teacher-toggle', capture: cap('teacher-toggle'), scenes: ['montage'] },
  'marks-total': { kind: 'clip', path: 'extra/marks/clips/marks-total', capture: marks('clip'), scenes: ['marks'] },

  // Stills: the full 1440×900 viewport at 2×.
  'start-screen': { kind: 'still', path: 'stills/start-screen.png', capture: cap('stills'), scenes: ['everywhere', 'montage'] },
  'diagram-canvas': { kind: 'still', path: 'stills/diagram-canvas.png', capture: cap('stills'), scenes: ['everywhere'] },
  'editor-teacher': { kind: 'still', path: 'stills/editor-teacher.png', capture: cap('stills'), scenes: ['everywhere'] },
  'export-other-apps': { kind: 'still', path: 'stills/export-other-apps.png', capture: cap('stills'), scenes: ['everywhere'] },

  // Sheets: one printed page, 2379×3366.
  'sheet-bi': { kind: 'sheet', path: 'sheets/bi.png', capture: cap('sheets'), scenes: ['write'] },
  'sheet-en': { kind: 'sheet', path: 'sheets/en.png', capture: cap('sheets'), scenes: ['write'] },
  'sheet-zh': { kind: 'sheet', path: 'sheets/zh.png', capture: cap('sheets'), scenes: ['write'] },
  'version-a': { kind: 'sheet', path: 'sheets/version-a.png', capture: cap('sheets'), scenes: ['papers'] },
  'version-b': { kind: 'sheet', path: 'sheets/version-b.png', capture: cap('sheets'), scenes: ['papers'] },
  'version-c': { kind: 'sheet', path: 'sheets/version-c.png', capture: cap('sheets'), scenes: ['papers'] },
  'lq-1': { kind: 'sheet', path: 'sheets/lq-1.png', capture: cap('sheets'), scenes: ['papers'] },
  'p1-cover': { kind: 'sheet', path: 'sheets/p1-cover.png', capture: cap('sheets'), scenes: ['papers'] },
  'p2-cover': { kind: 'sheet', path: 'sheets/p2-cover.png', capture: cap('sheets'), scenes: ['papers', 'montage'] },
  // The two-part diagram worksheet marks edits live: as it prints before and after, its teacher copy.
  'question-start': { kind: 'sheet', path: 'extra/marks/sheets/diagram-question-start.png', capture: marks('sheet'), scenes: ['diagrams', 'marks'] },
  'question-done': { kind: 'sheet', path: 'extra/marks/sheets/diagram-question-done.png', capture: marks('sheet'), scenes: ['marks', 'papers', 'word'] },
  'teacher-done': { kind: 'sheet', path: 'extra/marks/sheets/diagram-teacher-done.png', capture: marks('sheet'), scenes: ['marks', 'papers'] },
  // Its .docx export, page 1 as LibreOffice renders it (1819×2573).
  'docx-page': { kind: 'export', path: 'extra/marks/export/docx-diagram-page-1.png', capture: marks('docx'), scenes: ['word', 'montage'] },

  // The finished tax diagram, 2400×2010, transparent: whole, and as registered layers.
  'diagram-full': { kind: 'layer', path: 'diagram/full.png', capture: cap('diagram'), scenes: ['montage'] },
  'layer-axes': { kind: 'layer', path: 'diagram/axes.png', capture: cap('diagram'), scenes: ['diagrams'] },
  'layer-areas': { kind: 'layer', path: 'diagram/areas.png', capture: cap('diagram'), scenes: ['diagrams'] },
  'layer-guides': { kind: 'layer', path: 'diagram/guides.png', capture: cap('diagram'), scenes: ['diagrams'] },
  'layer-curves': { kind: 'layer', path: 'diagram/curves.png', capture: cap('diagram'), scenes: ['diagrams'] },
  'layer-shift': { kind: 'layer', path: 'diagram/shift.png', capture: cap('diagram'), scenes: ['diagrams'] },
  'layer-points': { kind: 'layer', path: 'diagram/points.png', capture: cap('diagram'), scenes: ['diagrams'] },
};

/** The registry entry for `id`; throws for an unregistered id. */
export function asset(id) {
  const a = ASSETS[id];
  if (!a) throw new Error(`asset "${id}" is not in scripts/film/assets.mjs`);
  return a;
}

/** The files an asset occupies in the store (a clip: its .json; its frames are checked by count). */
export const assetFiles = (id) => (asset(id).kind === 'clip' ? [`${asset(id).path}.json`] : [asset(id).path]);
