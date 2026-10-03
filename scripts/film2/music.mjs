// The film's music: the one line to change to swap the track. `slug` names
// demo-media/film-v2/audio-stock/music/<slug>.mp3 (+ .analysis.json); `offset` is the track
// second the film starts at. After a change: node scripts/film2/tools/beatgrid.mjs, then
// retime SCENES (timeline.mjs) to the new bars and run npm run film2:doctor.
export const MUSIC = { slug: 'mixkit-31', title: 'Dreaming Big (Ahjay Stelino, Mixkit)', offset: 0 };
