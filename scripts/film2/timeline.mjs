// Film v2's timeline (FILM.md §7): pure data, browser-safe (the stage imports it too).
// Time is film seconds. Music time = film time + MUSIC.offset. Every scene boundary is a bar
// line of the verified beat grid (tools/beatgrid.mjs → beatgrid.<slug>.json); move a cut by
// changing its bar number, never by typing seconds. Units: pulse (the 135 BPM eighth,
// 0.4445 s) for accents and cuts, beat (quarter, 0.889 s), bar (3.556 s).
import { MUSIC } from './music.mjs';

export { MUSIC };
/** The verified beat grid of MUSIC (the copy tools/beatgrid.mjs makes). */
export const GRID = (await import(`./beatgrid.${MUSIC.slug}.json`, { with: { type: 'json' } })).default;

export const FPS = 60;
export const W = 1920;
export const H = 1080;
export const BPM = GRID.bpm; // quarter notes; the music reads as 135 BPM eighths
export const BEAT = GRID.beat; // quarter note
export const PULSE = BEAT / 2; // the eighth: the unit for accents and cuts
export const BAR = GRID.beatsPerBar * BEAT;

const r6 = (t) => Math.round(t * 1e6) / 1e6;
const T0 = GRID.firstDownbeat - MUSIC.offset;
/** Film time of pulse n (pulse 0 = the first downbeat; n may be negative). */
export const pulse = (n) => r6(T0 + n * PULSE);
/** Film time of beat n (quarter note; beat 0 = the first downbeat). */
export const beat = (n) => r6(T0 + n * BEAT);
/** Film time of bar line n (bar 0 = the first downbeat; 1.5 is a half-bar line). */
export const bar = (n) => r6(T0 + n * BAR);
/** The grid line nearest film time t (unit 'pulse' | 'beat' | 'bar'). */
export function snap(t, unit = 'pulse') {
  const d = { pulse: PULSE, beat: BEAT, bar: BAR }[unit];
  return r6(T0 + Math.round((t - T0) / d) * d);
}
/** The music's sections (intro, build, body, lift, pullback, tail), film time. */
export const SECTIONS = GRID.sections.map((x) => ({ ...x, t: r6(x.t - MUSIC.offset) }));
/** The last audible moment of the music, film time. */
export const AUDIBLE_END = r6(GRID.audibleEnd - MUSIC.offset);

/** The film ends on this bar line, about a second after the music dies away. */
export const END_BAR = 30;
export const DURATION = bar(END_BAR);

// The acts of FILM.md §3. `bars` = [first, last) bar line (halves allowed); the first act
// starts at 0 s. Bar 3 = build (12.46 s), 8 = body, 20 = lift (72.92 s), 26 = pull-back.
// `in` = the transition into the act, centred on its first bar line:
//   cut | push {dir: 'left'|'up', pulses} | iris {pulses, at: [x, y] design px}
const ACTS = [
  { id: 'open', bars: [0, 1.5], in: { type: 'cut' } },
  { id: 'mark', bars: [1.5, 3], in: { type: 'cut' } },
  { id: 'write', bars: [3, 8], in: { type: 'iris', pulses: 4, at: [960, 470] } },
  { id: 'draw', bars: [8, 14], in: { type: 'push', dir: 'left', pulses: 4 } },
  { id: 'papers', bars: [14, 20], in: { type: 'push', dir: 'left', pulses: 4 } },
  { id: 'bank', bars: [20, 24], in: { type: 'iris', pulses: 4, at: [960, 540] } },
  { id: 'everywhere', bars: [24, 26], in: { type: 'cut' } },
  { id: 'end', bars: [26, END_BAR], in: { type: 'push', dir: 'up', pulses: 4 } },
];

export const SCENES = ACTS.map((a, i) => ({
  ...a,
  from: i === 0 ? 0 : bar(a.bars[0]),
  to: i === ACTS.length - 1 ? DURATION : bar(a.bars[1]),
}));

/** Half the transition into scene `s`, in seconds (0 for a cut). */
export const halfIn = (s) => (s?.in && s.in.type !== 'cut' ? ((s.in.pulses ?? 2) * PULSE) / 2 : 0);

/** [start, end) of scene `id`, transitions included. */
export function sceneWindow(id) {
  const i = SCENES.findIndex((s) => s.id === id);
  if (i < 0) throw new Error(`no scene ${id}`);
  const s = SCENES[i];
  return {
    start: r6(Math.max(0, s.from - halfIn(s))),
    end: r6(Math.min(DURATION, s.to + halfIn(SCENES[i + 1]))),
    from: s.from,
    to: s.to,
  };
}

/** Ids of the scenes on screen at t (two inside a transition). */
export function sceneAt(t) {
  return SCENES.filter((s) => {
    const w = sceneWindow(s.id);
    return t >= w.start && t < w.end;
  }).map((s) => s.id);
}

// Accents and sounds, by stable id <scene>.<name>. kind: 'accent' (a visual hit on the
// music) | 'sfx' (sound: `sfx` names an entry of audio/sfx/catalog.json). Sorted by t.
export const CUES = [
  { id: 'mark.tile', t: bar(1.5), kind: 'accent', note: 'the mark starts drawing on the half-bar' },
  { id: 'mark.dot', t: pulse(12 + 5), kind: 'sfx', sfx: 'pop', note: 'the equilibrium dot pops in (splash 740 ms × 3)' },
  { id: 'write.build', t: bar(3), kind: 'accent', note: 'the build: the dot drops onto the desk' },
  { id: 'draw.body', t: bar(8), kind: 'accent', note: 'body: the hero act' },
  { id: 'papers.turn', t: bar(14), kind: 'accent' },
  { id: 'bank.lift', t: bar(20), kind: 'accent', note: 'the full lift: the 題庫 opens' },
  { id: 'everywhere.cuts', t: bar(24), kind: 'accent' },
  { id: 'end.pullback', t: bar(26), kind: 'accent', note: 'the pull-back: everything collapses into lines' },
].sort((a, b) => a.t - b.t);

export const cueAt = (id) => {
  const c = CUES.find((x) => x.id === id);
  if (!c) throw new Error(`no cue ${id}`);
  return c.t;
};

// Every on-screen string (FILM.md §3), en + zh. A line never ends in , . ， 。 ; ；
// (doctor enforces it). "\n" forces a line break.
export const COPY = {
  open: {
    q1: { en: 'A supply curve in Word', zh: '在 Word 畫一條供應曲線' },
    q2: { en: 'should not take all evening', zh: '不應花上一整晚' },
  },
  mark: {
    word: { en: 'Econ Studio', zh: '經濟備課室' },
    tagline: { en: 'Worksheets and papers for HKDSE Economics teachers', zh: '為 HKDSE 經濟科老師而設' },
  },
  write: {
    type: { en: 'Type right on the page', zh: '直接在頁面上輸入' },
    lang: { en: 'English, 中文, or both', zh: '英文、中文，或兩者並列' },
    ui: { en: 'An interface in 中文 too', zh: '介面也有中文版' },
  },
  draw: {
    draw: { en: 'Draw it in seconds', zh: '幾秒畫好一幅圖' },
    shade: { en: 'Shade any area in one click', zh: '一按塗上任何面積' },
    answer: { en: 'The answer, on the same axes', zh: '答案直接畫在同一幅圖上' },
  },
  papers: {
    marks: { en: 'Marks add themselves up', zh: '分數自動加總' },
    scheme: { en: 'A marking scheme, HKEAA-style', zh: '評卷參考，HKEAA 格式' },
    mock: { en: 'Mock papers, cover to key', zh: '模擬試卷，由封面到答案' },
  },
  bank: {
    bank: { en: 'Every question you have written, by topic', zh: '你寫過的每一題，按課題排好' },
    drag: { en: 'Drag one in, the page makes room', zh: '拖進頁面，自動排好' },
    terms: { en: 'Chinese checked against the EDB glossary', zh: '中文用詞，按教育局詞彙表檢查' },
  },
  everywhere: {
    word: { en: 'A real Word document', zh: '真正的 Word 文件' },
    platforms: { en: 'On the web, Mac and Windows', zh: '網頁版、Mac、Windows 都用得' },
  },
  end: {
    less: { en: 'Less formatting', zh: '少排版' },
    more: { en: 'More teaching', zh: '多教學' },
    free: { en: 'Free · No account needed', zh: '免費使用 · 無需註冊' },
    name: { en: 'Econ Studio', zh: '經濟備課室' },
  },
};
