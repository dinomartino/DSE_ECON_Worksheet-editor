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

/** The film ends on this half-bar line (106.71 s), as the music's tail dies away: past it the
 *  mix is under −45 dB and the picture would hold in silence. */
export const END_BAR = 29.5;
export const DURATION = bar(END_BAR);
/** The mix fades out from the music's tail section (104.93 s) to exactly DURATION (audio/mix.mjs). */
export const FADE_FROM = SECTIONS.find((x) => x.label === 'tail').t;

// The acts of FILM.md §3. `bars` = [first, last) bar line (halves allowed); the first act
// starts at 0 s. Bar 3 = build (12.46 s), 8 = body, 20 = lift (72.92 s), 26 = pull-back.
// `in` = the transition into the act, centred on its first bar line:
//   cut | match (a cut whose two frames share a shape) | push {dir: 'left'|'up', pulses}
//   | iris {pulses, at: [x, y] design px} | axis {pulses: 4, dotTo?: [x, y]} (the axis chapter:
//   engine.js draws the frame's axes over B-2..B+4 pulses, AXIS_CHAPTER; its label is
//   COPY.chapters[id])
// `cuts` = the act's intended hard changes inside it (film s, on pulses: footage cuts, a
// page swapped at once); `ui` = clicks in the real footage whose response is an instant
// change (a dialog opens, a toggle flips: the clip's event time); `holds` = [from, to] film s
// where a still picture is meant. tools/motion-check.mjs exempts all three; a flag elsewhere
// is a bug. `alive` = [[from, to, still?], …] film s where a slow drift is meant (a push, a
// breathing card): motion-check counts a frame as still there only under `still` (default
// 0.02 MAD), so a truly frozen frame still flags.
/**
 * The axis chapter's marks, in pulses from the act's bar line B (FILM.md §5): the vertical wipe,
 * the horizontal draw, the label in / out (fully visible labelIn[1]..labelOut[0] = 3 pulses,
 * 1.33 s), both strokes retracting, the dot shrinking; nothing of it is left after `end`.
 */
export const AXIS_CHAPTER = Object.freeze({ wipe: [-2, 0], draw: [0, 1.5], labelIn: [0.25, 0.5], labelOut: [3.5, 4], back: [2.5, 4], dotOut: [3.5, 4], end: 4 });
const PC = (n0, ns) => ns.map((n) => pulse(n0 + n)); // pulses counted from an act's first pulse
const ACTS = [
  { id: 'open', bars: [0, 1.5], in: { type: 'cut' } },
  { id: 'mark', bars: [1.5, 3], in: { type: 'match' }, // the straightened line becomes the axis
    alive: [[bar(1.5), bar(3)]] }, // the push on the dot (constant speed), the dot swelling into the iris
  { id: 'write', bars: [3, 8], in: { type: 'iris', pulses: 4, at: [960, 338] }, // at: the mark's dot (scenes/mark.js MARK_DOT)
    // → type CLOSE (its double-click on the cut); → MEDIUM; → language CLOSE (EN on the cut);
    // → the printed Q1s; → Settings CLOSE; → WIDE on 完成 (scenes/write/geom.js BEAT)
    cuts: PC(24, [5, 11, 17, 23, 29, 33]),
    // type-mcq's double-click into the 中文 line; 中文, EN+中; 繁體中文
    // …plus type-mcq's option pastes, visible now that the MEDIUM push rests
    ui: [17.505, 18.719, 18.855, 19.032, 19.167, 19.344, 19.48, 19.657, 19.792, pulse(43), pulse(45), pulse(55)],
    holds: [[pulse(53), pulse(55)]], // Settings › Language in English is read before the flip
    alive: [[pulse(47), pulse(53)]] }, // the printed Q1s breathe inside their cards
  { id: 'draw', bars: [8, 14], in: { type: 'axis', pulses: 4 },
    // CLOSE → narrow (the Point click); → the CS CLOSE (the Consumer surplus click); → the
    // Templates wall; → Draw answer (its click); → the Student | Teacher split (the Teacher click);
    // → the red answer CLOSE (scenes/draw.js P10, P24, P28, P32, P40, P44)
    cuts: [pulse(74), pulse(88), pulse(92), pulse(96), pulse(104), pulse(108)],
    // the D and S labels, E0 placed; Shade ▾ opens; S0 selected, Shift up, Shift a copy draws S1
    // (the clips' events as draw.js places them)
    ui: [32.233, 34.252, 35.141, 40.115, 45.044, 45.546, 46.694],
    alive: [[36.6, 38.1], [38.9, 40.9], [49.8, 50.7]] }, // the re-ink detail drifting; the shade MEDIUM read (cursor to Shade ▾); the red answer CLOSE
  // Cuts (scenes/papers.js beat table): question 1 CLOSE after the lift (P11), HKEAA style (P16),
  // the printed key and its layouts (P20, P24, P26, P28), mock papers (P30), Versions (P38), the
  // version page CLOSE (P40). ui: the Teacher click in place (P12); Version B, C swapped in place
  // (P42, P44). Holds: the printed pages read. Alive (drifts, not holds): the total breathes 3 %;
  // the version pages under a push that gathers 4.5 %.
  { id: 'papers', bars: [14, 20], in: { type: 'axis', pulses: 4 },
    cuts: PC(112, [11, 16, 20, 24, 26, 28, 30, 38, 40]),
    ui: PC(112, [12, 42, 44]),
    holds: [[pulse(132), pulse(150)]],
    alive: [[pulse(113), pulse(115.5)], [pulse(120), pulse(123)], [pulse(152), pulse(158)]] }, // + the marks CLOSE's 3 % drift under the chapter label
  { id: 'bank', bars: [20, 24], in: { type: 'iris', pulses: 4, at: [960, 540] },
    // → the topic page (P9); → the editor, WIDE (P12); → the drag CLOSE (P13); → the drop (P16);
    // → the Check terms row (P22); → the underlined page (P24); → Replace (P30) (the term lift at
    // P27 is a move: the line lifts off its page, which rides along and fades)
    cuts: PC(160, [9, 12, 13, 16, 22, 24, 30]),
    ui: [pulse(174)], // bank-drag: the page makes room (frame 111, 1.85 s, played to land on P14)
    // the finished chart's push; the topic page's push; the Check terms row's push; the term at frame scale
    alive: [[pulse(166), pulse(169)], [pulse(169), pulse(172)], [pulse(182), pulse(184)], [pulse(188), pulse(190)]] },
  { id: 'everywhere', bars: [24, 26], in: { type: 'cut' },
    // → the .docx page (C2); → the diagram paper CLOSE; → the browser; → the three windows
    // (the Export… click is on the act's cut)
    cuts: [pulse(194), pulse(199), pulse(201), pulse(203)],
    alive: [[pulse(192), pulse(194)], [pulse(199), pulse(203)]] }, // the dialog CLOSE; the page CLOSE, the browser
  { id: 'end', bars: [26, END_BAR], in: { type: 'axis', pulses: 4 },
    alive: [[bar(26), bar(END_BAR)]] }, // the statement's push, the fold, the lockup's drift to the last frame
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
// music) | 'sfx' (sound: `sfx` names a kind in audio/sfxmap.mjs MAP, played by the synthesised
// kit; an accent may carry one too). Optional: `gain_db` (a trim on top of the kind's level,
// for exceptions only); `grid: false`
// marks a cue deliberately off the pulse grid (the doctor skips it); `replaces: { scene, label }`
// silences that scene's events whose label starts with `label` (the cue is their sound, retimed;
// engine.js events()). Sorted by t.
export const CUES = [
  { id: 'mark.tile', t: bar(1.5), kind: 'accent', note: 'the mark starts drawing on the half-bar' },
  { id: 'mark.dot', t: pulse(12 + 5), kind: 'sfx', sfx: 'pop', note: 'the equilibrium dot pops in: a plip (splash 740 ms × 3)' },
  { id: 'write.build', t: bar(3), kind: 'accent', note: 'the build: the dot drops onto the desk' },
  // The axis chapters carry the kit's chapter tone (the chord under the bar line). Cut cues
  // name `whoosh-s` (the kit's air); sfxmap.mjs RULES drop the ones on a strong music accent.
  { id: 'draw.body', t: bar(8), kind: 'accent', sfx: 'chapter', note: 'body: the hero act; the chapter axis lands' },
  { id: 'draw.answer', t: pulse(108), kind: 'accent', sfx: 'whoosh-s', note: 'cut to the held red answer CLOSE' },
  { id: 'papers.turn', t: bar(14), kind: 'accent', sfx: 'chapter', note: 'the papers chapter axis lands' },
  { id: 'papers.scheme', t: bar(16), kind: 'accent', sfx: 'whoosh-s', note: 'cut to the Marking scheme view, its headline' },
  { id: 'papers.mock', t: pulse(142), kind: 'accent', note: 'mock papers: the headline, the Paper 1 cover dealt' },
  // The lift: bank.js's impact event is the kit's bloom (its reverse swell leads into the bar).
  { id: 'bank.lift', t: bar(20), kind: 'accent', note: 'the full lift: the 題庫 opens (bank.js plays the impact → bloom)' },
  { id: 'everywhere.cuts', t: bar(24), kind: 'accent', sfx: 'whoosh-s', note: 'the hardest cut in the film, under the lift at its loudest' },
  // Hard cuts (sync review 2): air unless a click or a bigger sound owns the beat.
  { id: 'write.cut11', t: pulse(24 + 11), kind: 'sfx', sfx: 'whoosh-s', note: 'CLOSE → the wide editor (the double-click follows at 17.505)' },
  // The triangle's lift reads as motion from 41.93 s (MAD), not at its scene event (41.63): its
  // air starts with the move (sync review 5).
  { id: 'draw.lift', t: 41.9, kind: 'sfx', sfx: 'whoosh-s', grid: false, replaces: { scene: 'draw', label: 'the triangle lifts' }, note: 'the triangle lifts off the footage' },
  { id: 'draw.cut32', t: pulse(64 + 32), kind: 'sfx', sfx: 'whoosh-s', note: 'the Templates wall → "The answer, on the same axes"' },
  { id: 'bank.cut13', t: pulse(160 + 13), kind: 'sfx', sfx: 'whoosh-s', note: 'cut to the drag CLOSE in the editor' },
  { id: 'bank.cut16', t: pulse(160 + 16), kind: 'sfx', sfx: 'whoosh-s', note: 'cut to the drop' },
  { id: 'end.pullback', t: bar(26), kind: 'accent', sfx: 'chapter', note: 'the pull-back: everything collapses into lines; the chapter tone on the IV chord' },
  { id: 'end.stab', t: 104.4, kind: 'sfx', sfx: 'bell', grid: false, note: "the music's last stab (onset 104.39-104.40 s): the bell on the tonic, over the tail" },
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
