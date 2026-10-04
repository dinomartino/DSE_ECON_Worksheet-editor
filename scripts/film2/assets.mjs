// Film v2's asset registry (browser-safe): id → file in a store, and the scenes allowed to
// load it. Scenes load assets by id only (ctx.load), never by path.
//   kind   'clip' (JPEG frame sequence: <path>.json + <path>/00000.jpg …) | 'image'
//   store  'v2' (demo-media/film-v2/assets, served at /assets/, the default) or
//          'v1' (scripts/film's store, demo-media/film/assets, served at /assets-v1/)
//   capture  how to (re)make it
// e.g. 'type-mcq': { kind: 'clip', store: 'v1', path: 'clips/type-mcq', capture: 'npm run film:capture -- --only=type-mcq', scenes: ['write'] }
export const ASSETS = {
  // write
  'welcome-desk': { kind: 'clip', path: 'clips/welcome-desk', capture: 'FILM_STORE=… npm run film:capture -- --clips=scripts/film2/capture/clips.mjs --only=welcome-desk --no-build', scenes: ['write'] },
  'launch-splash': { kind: 'clip', path: 'clips/launch-splash', capture: 'FILM_STORE=… npm run film:capture -- --clips=scripts/film2/capture/clips.mjs --only=launch-splash --no-build', scenes: ['write'] },
  'type-mcq': { kind: 'clip', path: 'clips/type-mcq', capture: 'FILM_STORE=… npm run film:capture -- --clips=scripts/film2/capture/clips.mjs --only=type-mcq --no-build', scenes: ['write'] },
  'language-toggle': { kind: 'clip', path: 'clips/language-toggle', capture: 'FILM_STORE=… npm run film:capture -- --clips=scripts/film2/capture/clips.mjs --only=language-toggle --no-build', scenes: ['write'] },
  'zh-interface': { kind: 'clip', path: 'clips/zh-interface', capture: 'FILM_STORE=… npm run film:capture -- --clips=scripts/film2/capture/clips.mjs --only=zh-interface --no-build', scenes: ['write'] },
  // draw
  'draw-diagram': { kind: 'clip', path: 'clips/draw-diagram', capture: 'FILM_STORE=… npm run film:capture -- --clips=scripts/film2/capture/clips.mjs --only=draw-diagram --no-build', scenes: ['draw'] },
  'shade-area': { kind: 'clip', path: 'clips/shade-area', capture: 'FILM_STORE=… npm run film:capture -- --clips=scripts/film2/capture/clips.mjs --only=shade-area --no-build', scenes: ['draw', 'everywhere'] },
  'template-picker': { kind: 'clip', path: 'clips/template-picker', capture: 'FILM_STORE=… npm run film:capture -- --clips=scripts/film2/capture/clips.mjs --only=template-picker --no-build', scenes: ['draw'] },
  'answer-draw': { kind: 'clip', path: 'clips/answer-draw', capture: 'FILM_STORE=… npm run film:capture -- --clips=scripts/film2/capture/clips.mjs --only=answer-draw --no-build', scenes: ['draw'] },
  'answer-layer': { kind: 'clip', path: 'clips/answer-layer', capture: 'FILM_STORE=… npm run film:capture -- --clips=scripts/film2/capture/clips.mjs --only=answer-layer --no-build', scenes: ['draw'] },
  // papers
  'answer-lines': { kind: 'clip', path: 'clips/answer-lines', capture: 'FILM_STORE=… npm run film:capture -- --clips=scripts/film2/capture/clips.mjs --only=answer-lines --no-build', scenes: ['papers'] },
  'teacher-toggle': { kind: 'clip', path: 'clips/teacher-toggle', capture: 'FILM_STORE=… npm run film:capture -- --clips=scripts/film2/capture/clips.mjs --only=teacher-toggle --no-build', scenes: ['papers'] },
  'marking-scheme': { kind: 'clip', path: 'clips/marking-scheme', capture: 'FILM_STORE=… npm run film:capture -- --clips=scripts/film2/capture/clips.mjs --only=marking-scheme --no-build', scenes: ['papers'] },
  'key-layouts': { kind: 'clip', path: 'clips/key-layouts', capture: 'FILM_STORE=… npm run film:capture -- --clips=scripts/film2/capture/clips.mjs --only=key-layouts --no-build', scenes: ['papers'] },
  'versions': { kind: 'clip', path: 'clips/versions', capture: 'FILM_STORE=… npm run film:capture -- --clips=scripts/film2/capture/clips.mjs --only=versions --no-build', scenes: ['papers'] },
  'scroll-paper': { kind: 'clip', path: 'clips/scroll-paper', capture: 'FILM_STORE=… npm run film:capture -- --clips=scripts/film2/capture/clips.mjs --only=scroll-paper --no-build', scenes: ['papers'] },
  // bank
  'bank-screen': { kind: 'clip', path: 'clips/bank-screen', capture: 'FILM_STORE=… npm run film:capture -- --clips=scripts/film2/capture/clips.mjs --only=bank-screen --no-build', scenes: ['bank', 'everywhere'] },
  'bank-drag': { kind: 'clip', path: 'clips/bank-drag', capture: 'FILM_STORE=… npm run film:capture -- --clips=scripts/film2/capture/clips.mjs --only=bank-drag --no-build', scenes: ['bank'] },
  'check-terms': { kind: 'clip', path: 'clips/check-terms', capture: 'FILM_STORE=… npm run film:capture -- --clips=scripts/film2/capture/clips.mjs --only=check-terms --no-build', scenes: ['bank'] },
  // everywhere
  'export': { kind: 'clip', path: 'clips/export', capture: 'FILM_STORE=… npm run film:capture -- --clips=scripts/film2/capture/clips.mjs --only=export --no-build', scenes: ['everywhere'] },
  // write (images)
  'stills-start-screen': { kind: 'image', path: 'stills/start-screen.png', capture: 'see scripts/film2/capture/MANIFEST.md (stills)', scenes: ['write'] },
  'stills-editor-clean': { kind: 'image', path: 'stills/editor-clean.png', capture: 'see scripts/film2/capture/MANIFEST.md (stills)', scenes: ['write'] },
  'stills-editor-bilingual': { kind: 'image', path: 'stills/editor-bilingual.png', capture: 'see scripts/film2/capture/MANIFEST.md (stills)', scenes: ['write'] },
  'sheets-en': { kind: 'image', path: 'sheets/en.png', capture: 'see scripts/film2/capture/MANIFEST.md (sheets)', scenes: ['write'] },
  'sheets-zh': { kind: 'image', path: 'sheets/zh.png', capture: 'see scripts/film2/capture/MANIFEST.md (sheets)', scenes: ['write'] },
  'sheets-bi': { kind: 'image', path: 'sheets/bi.png', capture: 'see scripts/film2/capture/MANIFEST.md (sheets)', scenes: ['write'] },
  // draw (images)
  'stills-diagram-canvas': { kind: 'image', path: 'stills/diagram-canvas.png', capture: 'see scripts/film2/capture/MANIFEST.md (stills)', scenes: ['draw'] },
  'sheets-diagram-question': { kind: 'image', path: 'sheets/diagram-question.png', capture: 'see scripts/film2/capture/MANIFEST.md (sheets)', scenes: ['draw'] },
  'diagram-axes': { kind: 'image', path: 'diagram/axes.png', capture: 'see scripts/film2/capture/MANIFEST.md (diagram)', scenes: ['draw'] },
  'diagram-curves': { kind: 'image', path: 'diagram/curves.png', capture: 'see scripts/film2/capture/MANIFEST.md (diagram)', scenes: ['draw'] },
  'diagram-guides': { kind: 'image', path: 'diagram/guides.png', capture: 'see scripts/film2/capture/MANIFEST.md (diagram)', scenes: ['draw'] },
  'diagram-points': { kind: 'image', path: 'diagram/points.png', capture: 'see scripts/film2/capture/MANIFEST.md (diagram)', scenes: ['draw'] },
  'diagram-shift': { kind: 'image', path: 'diagram/shift.png', capture: 'see scripts/film2/capture/MANIFEST.md (diagram)', scenes: ['draw'] },
  'diagram-areas': { kind: 'image', path: 'diagram/areas.png', capture: 'see scripts/film2/capture/MANIFEST.md (diagram)', scenes: ['draw'] },
  'diagram-full': { kind: 'image', path: 'diagram/full.png', capture: 'see scripts/film2/capture/MANIFEST.md (diagram)', scenes: ['draw'] },
  // papers (images)
  'stills-editor-teacher': { kind: 'image', path: 'stills/editor-teacher.png', capture: 'see scripts/film2/capture/MANIFEST.md (stills)', scenes: ['papers'] },
  'stills-editor-structured': { kind: 'image', path: 'stills/editor-structured.png', capture: 'see scripts/film2/capture/MANIFEST.md (stills)', scenes: ['papers'] },
  'sheets-quiz-1': { kind: 'image', path: 'sheets/quiz-1.png', capture: 'see scripts/film2/capture/MANIFEST.md (sheets)', scenes: ['papers'] },
  'sheets-quiz-2': { kind: 'image', path: 'sheets/quiz-2.png', capture: 'see scripts/film2/capture/MANIFEST.md (sheets)', scenes: ['papers'] },
  'sheets-quiz-teacher-1': { kind: 'image', path: 'sheets/quiz-teacher-1.png', capture: 'see scripts/film2/capture/MANIFEST.md (sheets)', scenes: ['papers'] },
  'sheets-key-classic': { kind: 'image', path: 'sheets/key-classic.png', capture: 'see scripts/film2/capture/MANIFEST.md (sheets)', scenes: ['papers'] },
  'sheets-key-hkeaa': { kind: 'image', path: 'sheets/key-hkeaa.png', capture: 'see scripts/film2/capture/MANIFEST.md (sheets)', scenes: ['papers'] },
  'sheets-key-suggested': { kind: 'image', path: 'sheets/key-suggested.png', capture: 'see scripts/film2/capture/MANIFEST.md (sheets)', scenes: ['papers'] },
  'sheets-key-detailed': { kind: 'image', path: 'sheets/key-detailed.png', capture: 'see scripts/film2/capture/MANIFEST.md (sheets)', scenes: ['papers'] },
  'sheets-p1-cover': { kind: 'image', path: 'sheets/p1-cover.png', capture: 'see scripts/film2/capture/MANIFEST.md (sheets)', scenes: ['papers'] },
  'sheets-p2-cover': { kind: 'image', path: 'sheets/p2-cover.png', capture: 'see scripts/film2/capture/MANIFEST.md (sheets)', scenes: ['papers'] },
  'sheets-p2-page': { kind: 'image', path: 'sheets/p2-page.png', capture: 'see scripts/film2/capture/MANIFEST.md (sheets)', scenes: ['papers'] },
  'sheets-lq-1': { kind: 'image', path: 'sheets/lq-1.png', capture: 'see scripts/film2/capture/MANIFEST.md (sheets)', scenes: ['papers'] },
  'sheets-lq-2': { kind: 'image', path: 'sheets/lq-2.png', capture: 'see scripts/film2/capture/MANIFEST.md (sheets)', scenes: ['papers'] },
  'sheets-version-a': { kind: 'image', path: 'sheets/version-a.png', capture: 'see scripts/film2/capture/MANIFEST.md (sheets)', scenes: ['papers'] },
  'sheets-version-b': { kind: 'image', path: 'sheets/version-b.png', capture: 'see scripts/film2/capture/MANIFEST.md (sheets)', scenes: ['papers'] },
  'sheets-version-c': { kind: 'image', path: 'sheets/version-c.png', capture: 'see scripts/film2/capture/MANIFEST.md (sheets)', scenes: ['papers'] },
  // everywhere (images)
  'stills-export-dialog': { kind: 'image', path: 'stills/export-dialog.png', capture: 'see scripts/film2/capture/MANIFEST.md (stills)', scenes: ['everywhere'] },
  'stills-export-other-apps': { kind: 'image', path: 'stills/export-other-apps.png', capture: 'see scripts/film2/capture/MANIFEST.md (stills)', scenes: ['everywhere'] },
  'export-docx-page-1': { kind: 'image', path: 'export/docx-page-1.png', capture: 'see scripts/film2/capture/MANIFEST.md (export)', scenes: ['everywhere'] },
  'export-docx-bi-page-1': { kind: 'image', path: 'export/docx-bi-page-1.png', capture: 'see scripts/film2/capture/MANIFEST.md (export)', scenes: ['everywhere'] },
  'export-docx-bi-page-2': { kind: 'image', path: 'export/docx-bi-page-2.png', capture: 'see scripts/film2/capture/MANIFEST.md (export)', scenes: ['everywhere'] },
  'export-docx-diagram-page-1': { kind: 'image', path: 'export/docx-diagram-page-1.png', capture: 'see scripts/film2/capture/MANIFEST.md (export)', scenes: ['everywhere'] },
};

export function asset(id) {
  const a = ASSETS[id];
  if (!a) throw new Error(`asset "${id}" is not in scripts/film2/assets.mjs`);
  return { store: 'v2', ...a };
}

/** The URL the stage serves an asset's path at. */
export const assetUrl = (a) => `${a.store === 'v1' ? '/assets-v1/' : '/assets/'}${a.path}`;
