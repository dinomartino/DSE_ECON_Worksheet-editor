// Film v2's asset registry (browser-safe): id → file in a store, and the scenes allowed to
// load it. Scenes load assets by id only (ctx.load), never by path.
//   kind   'clip' (JPEG frame sequence: <path>.json + <path>/00000.jpg …) | 'image'
//   store  'v2' (demo-media/film-v2/assets, served at /assets/, the default) or
//          'v1' (scripts/film's store, demo-media/film/assets, served at /assets-v1/)
//   capture  how to (re)make it
// e.g. 'type-mcq': { kind: 'clip', store: 'v1', path: 'clips/type-mcq', capture: 'npm run film:capture -- --only=type-mcq', scenes: ['write'] }
export const ASSETS = {};

export function asset(id) {
  const a = ASSETS[id];
  if (!a) throw new Error(`asset "${id}" is not in scripts/film2/assets.mjs`);
  return { store: 'v2', ...a };
}

/** The URL the stage serves an asset's path at. */
export const assetUrl = (a) => `${a.store === 'v1' ? '/assets-v1/' : '/assets/'}${a.path}`;
