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
//   cut | match (a cut whose two frames share a shape) | push {dir: 'left'|'up', pulses}
//   | iris {pulses, at: [x, y] design px} | axis {pulses: 4, dotTo?: [x, y]} (the axis chapter:
//   engine.js draws the frame's axes over B-2..B+6 pulses; its label is COPY.chapters[id])
// `cuts` = the act's intended hard changes inside it (film s, on pulses: footage cuts, a
// page swapped at once); `ui` = clicks in the real footage whose response is an instant
// change (a dialog opens, a toggle flips: the clip's event time); `holds` = [from, to] film s
// where a still picture is meant. tools/motion-check.mjs exempts all three; a flag elsewhere
// is a bug.
const PC = (n0, ns) => ns.map((n) => pulse(n0 + n)); // pulses counted from an act's first pulse
const ACTS = [
  { id: 'open', bars: [0, 1.5], in: { type: 'cut' } },
  { id: 'mark', bars: [1.5, 3], in: { type: 'match' }, // the straightened line becomes the axis
    holds: [[pulse(14.5), pulse(23.5)]] }, // alive: tagline, dot, ripple, 6 % push, track-out (thin strokes read as still)
  { id: 'write', bars: [3, 8], in: { type: 'iris', pulses: 4, at: [960, 338] }, // at: the mark's dot (scenes/mark.js MARK_DOT)
    // → type CLOSE (its double-click on the cut); → MEDIUM; → language CLOSE (EN on the cut);
    // → the printed Q1s; → Settings CLOSE; → WIDE on 完成 (scenes/write/geom.js BEAT)
    cuts: PC(24, [5, 11, 17, 23, 29, 33]),
    // type-mcq's double-click into the 中文 line; 中文, EN+中; 繁體中文
    ui: [17.505, pulse(43), pulse(45), pulse(55)],
    holds: [[pulse(53), pulse(55)]] }, // Settings › Language in English is read before the flip
  { id: 'draw', bars: [8, 14], in: { type: 'axis', pulses: 4 },
    // CLOSE → narrow; → the CS lift on cream; → the Templates wall; → Draw answer; → the
    // Student | Teacher split; → the red answer CLOSE (scenes/draw.js P10, P27, P30, P33, P40, P45)
    cuts: [pulse(74), pulse(91), pulse(94), pulse(97), pulse(104), pulse(109)],
    // the D and S labels, E0 placed; Shade ▾ opens, Consumer surplus lands; Draw answer, D
    // selected, Shift a copy draws D1 (the clips' events as draw.js places them)
    ui: [33.251, 34.548, 34.983, 39.67, pulse(87), 45.215, 46.215, 47.415],
    // read and drifting: the re-ink detail, "Shade…" over its canvas, the CS CLOSE, the CS lift, the wall, "The
    // answer…" over its canvas, D1 drawn, the held red answer
    holds: [[36.646, 38.025], [38.514, 39.314], [41.98, 42.248], [43.226, 43.582], [44.293, 44.915], [45.182, 45.76], [47.4, 48.027], [50.25, 50.694]] },
  // Cuts (scenes/papers.js beat table): the lift (P5), Student WIDE (P10), Teacher CLOSE (P11),
  // HKEAA style (P16), the printed key and its layouts (P20, P24, P26, P28), mock papers (P30),
  // versions (P38, P40–P42), the fan (P43). Holds: the lift's total; the printed pages read.
  { id: 'papers', bars: [14, 20], in: { type: 'axis', pulses: 4 },
    cuts: PC(112, [5, 10, 11, 16, 20, 24, 26, 28, 30, 38, 40, 41, 42, 43]),
    holds: [[pulse(120), pulse(122)], [pulse(132), pulse(150)]] },
  { id: 'bank', bars: [20, 24], in: { type: 'iris', pulses: 4, at: [960, 540] },
    // → the topic page (P8); → the editor, WIDE (P12); → the drag CLOSE (P13); → the drop (P16);
    // → the Check terms row (P22); → the underlined page (P24); → the term lift (P27); → Replace (P30)
    cuts: PC(160, [8, 12, 13, 16, 22, 24, 27, 30]),
    ui: [79.208] }, // bank-drag: the page makes room (frame 111, 1.85 s; the press at 0.9 s is P172)
  { id: 'everywhere', bars: [24, 26], in: { type: 'cut' },
    cuts: [pulse(195), pulse(200)] }, // → the real .docx page; → the three windows (the Export… click is on the act's cut)
  { id: 'end', bars: [26, END_BAR], in: { type: 'axis', pulses: 4 },
    holds: [[pulse(208), pulse(219.5)], [pulse(224), AUDIBLE_END], [AUDIBLE_END, bar(END_BAR)]] }, // statement read; lockup drift; final still
];

export const SCENES = ACTS.map((a, i) => ({
  ...a,
  from: i === 0 ? 0 : bar(a.bars[0]),
  to: i === ACTS.length - 1 ? DURATION : bar(a.bars[1]),
}));

/** A transition with no duration: a cut or a match cut. */
export const isCut = (s) => !s?.in || s.in.type === 'cut' || s.in.type === 'match';
/** Half the transition into scene `s`, in seconds (0 for a cut). */
export const halfIn = (s) => (isCut(s) ? 0 : ((s.in.pulses ?? 2) * PULSE) / 2);

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
// music) | 'sfx' (sound: `sfx` names a SFX_MAP kind in audio/sfxmap.mjs; an accent may carry one
// too). Optional: `end: true` (the sound ENDS on t), `dur`, `file`, `gain_db`; `grid: false`
// marks a cue deliberately off the pulse grid (the doctor skips it). Sorted by t.
export const CUES = [
  { id: 'mark.tile', t: bar(1.5), kind: 'accent', note: 'the mark starts drawing on the half-bar' },
  { id: 'mark.dot', t: pulse(12 + 5), kind: 'sfx', sfx: 'pop', note: 'the equilibrium dot pops in (splash 740 ms × 3)' },
  { id: 'write.build', t: bar(3), kind: 'accent', note: 'the build: the dot drops onto the desk' },
  // Section changes carry a sound (sync review #4): the axis chapters land on whoosh-s.
  { id: 'draw.body', t: bar(8), kind: 'accent', sfx: 'whoosh-s', note: 'body: the hero act; the chapter axis lands' },
  { id: 'draw.answer', t: pulse(109), kind: 'accent', sfx: 'whoosh-s', note: 'cut to the held red answer CLOSE' },
  { id: 'papers.turn', t: bar(14), kind: 'accent', sfx: 'whoosh-s', note: 'the papers chapter axis lands' },
  { id: 'papers.scheme', t: bar(16), kind: 'accent', sfx: 'whoosh-s', note: 'cut to the Marking scheme view, its headline' },
  { id: 'papers.mock', t: pulse(142), kind: 'accent', note: 'mock papers: the headline, the Paper 1 cover dealt' },
  // The lift (sync review #3): a riser ends 50 ms before the hit so it never smears the impact
  // (2.7 s, from ~70.2 s); a whoosh into the iris ends 0.35 s after it, when the ring is open.
  { id: 'bank.riser', t: r6(bar(20) - 0.05), kind: 'sfx', sfx: 'riser', dur: 2.7, grid: false, note: 'the build into the lift' },
  { id: 'bank.lift', t: bar(20), kind: 'accent', note: 'the full lift: the 題庫 opens (bank.js plays the impact)' },
  { id: 'bank.whoosh', t: r6(bar(20) + 0.35), kind: 'sfx', sfx: 'whoosh', end: true, file: 'whoosh__air-woosh__mixkit-1489', grid: false, note: 'ends as the iris opens' },
  { id: 'everywhere.cuts', t: bar(24), kind: 'accent', sfx: 'whoosh-s' },
  { id: 'end.whoosh', t: r6(bar(26) - 0.5), kind: 'sfx', sfx: 'whoosh', grid: false, note: 'the pull-back: its onset half a second before the bar' },
  { id: 'end.pullback', t: bar(26), kind: 'accent', note: 'the pull-back: everything collapses into lines' },
  { id: 'end.stab', t: r6(bar(29) - 0.5), kind: 'sfx', sfx: 'shimmer', gain_db: -2, grid: false, note: "the music's last stab (104.4 s)" },
].sort((a, b) => a.t - b.t);

export const cueAt = (id) => {
  const c = CUES.find((x) => x.id === id);
  if (!c) throw new Error(`no cue ${id}`);
  return c.t;
};

// Every on-screen string (FILM.md §3), en + zh. A line never ends in , . ， 。 ; ；
// (doctor enforces it). "\n" forces a line break.
export const COPY = {
  // The axis chapter's label per act it opens (engine.js chapter()); user-approved
  // 2026-10-04. An empty pair draws the axes with no label.
  chapters: {
    draw: { en: 'Draw', zh: '繪圖' },
    papers: { en: 'Papers', zh: '試卷' },
    end: { en: '', zh: '' },
  },
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
    student: { en: 'Student', zh: '學生版' }, // the app's own toolbar labels (Toolbar.messages.ts)
    teacher: { en: 'Teacher', zh: '教師版' },
  },
  papers: {
    marks: { en: 'Marks add themselves up', zh: '分數自動加總' },
    scheme: { en: 'A marking scheme, HKEAA-style', zh: '評卷參考，HKEAA 風格' },
    mock: { en: 'Mock papers, cover to key', zh: '模擬試卷，由封面到答案' },
  },
  bank: {
    bank: { en: 'Every question you have written, by topic', zh: '你寫過的每一題，按課題排好' },
    drag: { en: 'Drag one in, the page makes room', zh: '拖進頁面，自動排好' },
    terms: { en: 'Chinese checked against the EDB glossary', zh: '中文用詞，按教育局詞彙表檢查' },
  },
  everywhere: {
    word: { en: 'A real Word document', zh: '真正的 Word 檔案' },
    platforms: { en: 'On the web, Mac and Windows', zh: '網頁版、Mac、Windows 都用得' },
  },
  end: {
    less: { en: 'Less formatting', zh: '少排版' },
    more: { en: 'More teaching', zh: '多教學' },
    free: { en: 'Free · No account needed', zh: '免費使用・毋須註冊' },
    name: { en: 'Econ Studio', zh: '經濟備課室' },
  },
};
