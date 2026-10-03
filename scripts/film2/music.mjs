// The film's music: the one entry to change to swap the track. Paths are relative to
// demo-media/film-v2/ in the main checkout: `audio` is the loudness-normalised master that is
// muxed (48 kHz, −16 LUFS), `grid` its verified beat grid. `offset` is the track second the
// film starts at. After a change: node scripts/film2/tools/beatgrid.mjs, then retime SCENES
// (timeline.mjs) to the new bars and run npm run film2:doctor.
export const MUSIC = {
  slug: 'mixkit-31',
  title: 'Dreaming Big (Ahjay Stelino, Mixkit)',
  audio: 'audio/music/mixkit-31.norm.wav',
  grid: 'audio/grid/mixkit-31.grid.json',
  offset: 0,
};
