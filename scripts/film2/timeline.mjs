// Film v2's timeline (FILM.md §7): pure data, browser-safe (the stage imports it too).
// Time is film seconds. Music time = film time + MUSIC.offset. Every scene boundary is a bar
// line of the verified beat grid (tools/beatgrid.mjs → beatgrid.<slug>.json); move a cut by
// changing its bar number, never by typing seconds.
import { MUSIC } from './music.mjs';

export { MUSIC };
/** The beat grid of MUSIC (constant tempo; see tools/beatgrid.mjs). */
export const GRID = (await import(`./beatgrid.${MUSIC.slug}.json`, { with: { type: 'json' } })).default;

export const FPS = 60;
export const W = 1920;
export const H = 1080;
export const BPM = GRID.bpm;
export const BEAT = GRID.beat;
export const BAR = GRID.beatsPerBar * BEAT; // not GRID.bar: bar lines must fall exactly on beats

const r6 = (t) => Math.round(t * 1e6) / 1e6;
/** Film time of beat n (beat 0 = the track's first beat; negative n allowed). */
export const beat = (n) => r6(GRID.firstBeat - MUSIC.offset + n * BEAT);
/** Film time of bar line n (bar 0 = the first downbeat). */
export const bar = (n) => r6(GRID.firstDownbeat - MUSIC.offset + n * BAR);
/** The beat nearest film time t. */
export const snap = (t) => beat(Math.round((t - beat(0)) / BEAT));
/** The bar line nearest film time t. */
export const snapBar = (t) => bar(Math.round((t - bar(0)) / BAR));

/** The film ends on this bar line (the music's tail decays into it). */
export const END_BAR = 62;
export const DURATION = bar(END_BAR);

// The acts of FILM.md §3. `bars` = [first, last) bar line; the first act starts at 0 s.
// `in` = the transition into the act, centred on its first bar line:
//   cut | push {dir: 'left'|'up', beats} | iris {beats, at: [x, y] design px}
const ACTS = [
  { id: 'open', bars: [0, 4], in: { type: 'cut' } },
  { id: 'mark', bars: [4, 7], in: { type: 'cut' } },
  { id: 'write', bars: [7, 17], in: { type: 'iris', beats: 2, at: [960, 470] } },
  { id: 'draw', bars: [17, 29], in: { type: 'push', dir: 'left', beats: 2 } },
  { id: 'papers', bars: [29, 41], in: { type: 'push', dir: 'left', beats: 2 } },
  { id: 'bank', bars: [41, 52], in: { type: 'iris', beats: 2, at: [960, 540] } },
  { id: 'everywhere', bars: [52, 56], in: { type: 'cut' } },
  { id: 'end', bars: [56, END_BAR], in: { type: 'push', dir: 'up', beats: 2 } },
];

export const SCENES = ACTS.map((a, i) => ({
  ...a,
  from: i === 0 ? 0 : bar(a.bars[0]),
  to: i === ACTS.length - 1 ? DURATION : bar(a.bars[1]),
}));

/** Half the transition into scene `s`, in seconds (0 for a cut). */
export const halfIn = (s) => (s?.in && s.in.type !== 'cut' ? ((s.in.beats ?? 1) * BEAT) / 2 : 0);

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
// music) | 'sfx' (sound: `sfx` names a file stem in audio-stock/sfx/). Sorted by t.
export const CUES = [
  { id: 'mark.tile', t: bar(4), kind: 'accent', note: 'the mark lands on the first downbeat after the open' },
  { id: 'mark.dot', t: r6(bar(4) + 5 * BEAT), kind: 'sfx', sfx: 'pop', note: 'the equilibrium dot pops in' },
  { id: 'write.build', t: bar(7), kind: 'accent', note: 'the build: the dot drops onto the desk' },
  { id: 'draw.body', t: bar(17), kind: 'accent', note: 'body: the hero act' },
  { id: 'papers.turn', t: bar(29), kind: 'accent' },
  { id: 'bank.lift', t: bar(41), kind: 'accent', note: 'the full lift: the 題庫 opens' },
  { id: 'everywhere.cuts', t: bar(52), kind: 'accent' },
  { id: 'end.pullback', t: bar(56), kind: 'accent', note: 'the pull-back: everything collapses into lines' },
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
