// Event kind → sound (FILM.md §6). Pure data. Files are catalog names (audio/sfx/catalog.json),
// rotated by the index of the event within its kind, so a re-render picks the same file.
//   gain_db   dB applied to the file: every file is trimmed to -3 dBFS peak and the music master
//             sits at -16 LUFS. UI sounds sit at -11..-15 so their peaks clear the music's
//             local RMS by 3-6 dB (sync review: at -20 they were masked)
//   trim_db   per-file correction ({ name: dB }) for files that read louder or quieter than peers
//   offset    the file's catalog onset_s lands on the event t (always); `end: true` (here or
//             on the event) instead puts the end of the sound (the event's dur, default
//             defDur or maxDur) on t, for risers and whooshes that arrive on a hit
//   maxDur    cut the file at this length (s) from its start; fade = [in, out] seconds
//   panX      events carrying x (frame px of a 2880 wide clip) pan by position, ±panX
//   repeat    [s,…] extra copies at these delays (a double click)
//   burst     consecutive events (< 0.4 s apart) become one sound as long as the run
//   tick      one short voice per event of a run (typing): { maxRate /s, semis ±, jitter_db ±,
//             enter_db }; the run's last key is always kept
//   ui        thinned to at least 60 ms spacing against the other ui voices
//   duck      the music dips under it (mix.mjs); 'light' = the short duck under travels
const C = {
  select: 'click__select-click__mixkit-1109',
  device: 'click__interface-device-click__mixkit-2577',
  box: 'click__modern-click-box-check__mixkit-1120',
  switch: 'switch__quick-switch-click__mixkit-2582',
};

export const SFX_MAP = {
  click: { files: [C.device, C.box, C.device, C.select], gain_db: -12, fade: [0, 0.01], ui: true, panX: 0.2 },
  dblclick: { files: [C.device, C.box], gain_db: -12, repeat: [0.12], fade: [0, 0.01], ui: true, panX: 0.2 },
  // One short tick per keystroke (thinned to ≤ 14/s, the run's last key always kept), rotated
  // over three transients, ±2 semitones and ±1.5 dB per tick; Enter is a +3 dB thock.
  key: { files: [C.switch, C.box, C.device], gain_db: -18, fade: [0, 0.015], maxDur: 0.04, tick: { maxRate: 14, semis: 2, jitter_db: 1.5, enter_db: 3 } },
  drag: { files: ['switch__quick-switch-click__mixkit-2582'], gain_db: -15, fade: [0, 0.02], ui: true, panX: 0.2 },
  drop: { files: ['thud__tv-remote-control-or-plastic-toy-drop__mixkit-3088', 'thud__wood-hard-hit__mixkit-2182'], gain_db: -17, fade: [0, 0.08], maxDur: 0.6, panX: 0.2 },
  snap: { files: ['switch__light-switch-sound__mixkit-2579', 'switch__quick-switch-click__mixkit-2582'], gain_db: -11, fade: [0, 0.02], ui: true },
  pop: { files: ['pop__dry-pop-up-notification-alert__mixkit-2356', 'pop__soap-bubble-sound__mixkit-2925', 'pop__long-pop__mixkit-2358'], gain_db: -15, fade: [0, 0.05], duck: 'light' },
  'whoosh-s': { files: ['whoosh__fast-transitions-swoosh__mixkit-3115'], gain_db: -13, fade: [0, 0.05] },
  whoosh: { files: ['whoosh__air-woosh__mixkit-1489', 'whoosh__transition-windy-swoosh__mixkit-1474'], gain_db: -15, fade: [0.02, 0.2], maxDur: 1.8, duck: 'light' },
  'whoosh-l': { files: ['whoosh__cinematic-tunnel-reverb-woosh__mixkit-1486', 'whoosh__transition-windy-swoosh__mixkit-1474'], gain_db: -14, fade: [0.02, 0.6], maxDur: 3.2, duck: 'light' },
  pencil: { files: ['pencil__writing-pencil__mixkit-3194', 'pencil__short-pencil-writing__mixkit-2376', 'pencil__writing-scribble-on-paper__mixkit-2369'], gain_db: -17, fade: [0.03, 0.12], maxDur: 1.8, trim_db: { 'pencil__short-pencil-writing__mixkit-2376': -4 } },
  // The two paper files peak late and sit ~-36 dBFS in their first 150 ms: +8 trims them up.
  paper: { files: ['paper__paper-quick-movement__mixkit-2380', 'paper__paper-slide__mixkit-1530', 'paper__page-turn-single__mixkit-1104'], gain_db: -13, fade: [0, 0.1],
    trim_db: { 'paper__paper-quick-movement__mixkit-2380': 8, 'paper__paper-slide__mixkit-1530': 8, 'paper__page-turn-single__mixkit-1104': -4 }, duck: 'paper' },
  page: { files: ['paper__page-turn-single__mixkit-1104'], gain_db: -13, fade: [0, 0.1] },
  chime: { files: ['chime__crystal-chime__mixkit-3108', 'chime__uplifting-bells-notification__mixkit-938', 'chime__success-software-tone__mixkit-2865', 'chime__positive-notification__mixkit-951'], gain_db: -14, fade: [0, 0.8], maxDur: 2.6, duck: 'light' },
  // The lift's hit (bank, 72.92 s): 498 is a clean low hit (peak 30 ms after its onset, gone in
  // ~1 s). 2900 and 788 are swells with no transient at their catalog onsets: they never land.
  impact: { files: ['impact__deep-heartbeat-impact__mixkit-498'], gain_db: -7, fade: [0.005, 0.6], maxDur: 2.2, duck: true },
  riser: { files: ['riser__cinematic-synth-riser__mixkit-645'], gain_db: -15, fade: [0.5, 0.03], end: true, defDur: 4 },
  shimmer: { files: ['sparkle__magic-sparkle-touch__mixkit-3083', 'sparkle__magic-wand-sparkle__mixkit-3062'], gain_db: -14, fade: [0, 0.5] },
  toggle: { files: ['switch__quick-switch-click__mixkit-2582', 'switch__light-switch-sound__mixkit-2579'], gain_db: -11, fade: [0, 0.02], ui: true },
  shutter: { files: ['shutter__camera-digital-shutter__mixkit-1432', 'shutter__camera-lens-shutter__mixkit-1433'], gain_db: -12, fade: [0, 0.05] },
};

/** Event kinds (clip events, scene events, cue `sfx` names) → a SFX_MAP key; null = silent. */
export const ALIASES = {
  type: 'key', typing: 'key', 'drag-start': 'drag', 'drag-end': 'drop', tick: 'click', hit: 'impact', swell: 'shimmer',
  'draw-on': 'pencil', draw: 'pencil', stroke: 'pencil', turn: 'page', sparkle: 'shimmer', 'whoosh-m': 'whoosh',
  'whoosh-small': 'whoosh-s', 'whoosh-large': 'whoosh-l', end: 'chime',
  accent: null, breath: null, clip: null, paragraph: null, 'missing-clip': null,
};

/** Resolve an event to its SFX_MAP key, or null when it makes no sound. `sfx` wins over `kind`. */
export function kindOf(e) {
  let k = e.sfx ?? e.kind;
  if (k === 'sfx') return null;
  if (k === 'whoosh' && e.size) k = { s: 'whoosh-s', m: 'whoosh', l: 'whoosh-l' }[e.size] ?? k;
  if (k in ALIASES) k = ALIASES[k];
  return k && k in SFX_MAP ? k : null;
}
