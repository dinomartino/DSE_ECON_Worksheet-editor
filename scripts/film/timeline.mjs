// The film's timeline: pure data shared by the stage (browser), the renderer and the score.
// Browser-safe: no imports. Bars and beats are the unit; seconds only where noted.
// Spec: FILM.md §3 (structure, cues) and §7.1 (harmony).

export const BPM = 120;
export const BEAT = 60 / BPM; // 0.5 s
export const BAR = 4 * BEAT; // 2 s
export const FPS = 60;
export const W = 1920;
export const H = 1080;

/** Seconds at the start of bar `n` (fractional bars allowed). */
export const bar = (n) => n * BAR;

export const DURATION = bar(47); // 94 s

// `in` is how a scene enters. `cut` has no length; `fadeFromBlack`/`fadeToBlack` run inside
// the scene from its edge; every other type (dissolve, blurDissolve, ...) lasts `beats` and
// is centred on the boundary, so both scenes render during it.
export const SCENES = [
  { id: 'opening', from: 0, to: 8, world: 'night', in: { type: 'fadeFromBlack', beats: 1 } },
  { id: 'write', from: 8, to: 16, world: 'day', in: { type: 'cut' } },
  { id: 'diagrams', from: 16, to: 24, world: 'night', in: { type: 'cut' } },
  // marks and papers open on the frame the previous scene ends on (registered), so a cut.
  { id: 'marks', from: 24, to: 28, world: 'day', in: { type: 'cut' } },
  { id: 'papers', from: 28, to: 32, world: 'day', in: { type: 'cut' } },
  { id: 'word', from: 32, to: 36, world: 'night', in: { type: 'cut' } },
  { id: 'everywhere', from: 36, to: 40, world: 'day', in: { type: 'cut' } },
  { id: 'montage', from: 40, to: 42, world: 'mixed', in: { type: 'cut' } },
  {
    id: 'end',
    from: 42,
    to: 47,
    world: 'night',
    in: { type: 'cut' },
    out: { type: 'fadeToBlack', beats: 4 },
  },
];

/** Music energy map (0..1) in bars. */
export const SECTIONS = [
  { id: 'intro-a', from: 0, to: 4, energy: 0.15 },
  { id: 'intro-b', from: 4, to: 8, energy: 0.35 },
  { id: 'groove-a', from: 8, to: 16, energy: 0.75 },
  { id: 'hero', from: 16, to: 24, energy: 0.85 },
  { id: 'groove-b', from: 24, to: 32, energy: 0.8 },
  { id: 'breakdown', from: 32, to: 34, energy: 0.3 },
  { id: 'final', from: 34, to: 42, energy: 1.0 },
  { id: 'outro', from: 42, to: 47, energy: 0.4 },
];

// Montage cut times (s): beats 1-6, then half-beat spacing; the last shot holds under
// the 83.0 riser into the 84.0 hit.
export const MONTAGE_CUTS = [80.0, 80.5, 81.0, 81.5, 82.0, 82.5, 82.75, 83.0];

// Shared picture/score cues in film seconds, sorted by t. `id` (<scene>.<name>) is how
// scenes read them (cueAt): retime a cue here, re-run the score, and the picture follows.
// Kinds: hit, whoosh, riser (peaks at `to`), swell, tick, breath (music drops out; strength
// < 1 opens the band up for two bars), drop (band returns), end. A whoosh's optional `peak`
// is where its sound is loudest (default t + 0.06): put it on the picture's fastest frame.
export const CUES = [
  { id: 'opening.swell', t: 1.0, kind: 'swell', strength: 0.5, note: 'pad bloom from black' },
  { id: 'opening.supply', t: 1.5, kind: 'tick', strength: 0.45, note: 'Supply.' },
  { id: 'opening.demand', t: 3.5, kind: 'tick', strength: 0.45, note: 'Demand.' },
  { id: 'opening.land', t: 5.5, kind: 'hit', strength: 0.4, note: 'Equilibrium. (soft: dot lands)' },
  { id: 'opening.tile', t: 8.0, kind: 'whoosh', strength: 0.55, note: 'tile extrudes' },
  { id: 'opening.title', t: 10.0, kind: 'tick', strength: 0.5, note: 'title' },
  { id: 'opening.riser', t: 12.0, kind: 'riser', strength: 0.8, to: 15.5, note: 'pre-drop rise' },
  { id: 'opening.breath', t: 15.5, kind: 'breath', strength: 1.0, note: 'beat 4 of bar 7: silence' },
  { id: 'write.drop', t: 16.0, kind: 'drop', strength: 1.0, note: 'bar 8: write' },
  { id: 'write.hit', t: 16.0, kind: 'hit', strength: 0.9, note: 'bar 8: write' },
  { id: 'write.push', t: 24.0, kind: 'whoosh', strength: 0.55, note: 'push into the page' },
  { id: 'diagrams.hit', t: 32.0, kind: 'hit', strength: 0.85, note: 'Diagrams.' },
  { id: 'diagrams.whoosh', t: 32.0, kind: 'whoosh', strength: 0.6, note: 'Diagrams.' },
  { id: 'diagrams.explode', t: 42.0, kind: 'whoosh', strength: 0.6, note: 'layers explode' },
  { id: 'diagrams.orbit', t: 42.0, kind: 'breath', strength: 0.5, note: 'the orbit: the band opens up' },
  { id: 'diagrams.fly', t: 46.0, kind: 'whoosh', strength: 0.65, peak: 46.3, note: 'diagram flies to the page' },
  { id: 'diagrams.touch', t: 47.0, kind: 'hit', strength: 0.45, note: 'soft: diagram touches the page' },
  { id: 'marks.teacher', t: 52.0, kind: 'tick', strength: 0.5, note: 'teacher toggle' },
  { id: 'papers.pull', t: 56.0, kind: 'whoosh', strength: 0.6, peak: 56.45, note: 'pull back / fan' },
  { id: 'papers.gather', t: 62.0, kind: 'whoosh', strength: 0.6, peak: 62.55, note: 'sheets gather' },
  { id: 'word.breath', t: 64.0, kind: 'breath', strength: 0.7, note: 'breakdown: drums out' },
  { id: 'word.swell', t: 64.0, kind: 'swell', strength: 0.6, note: 'breakdown pad' },
  { id: 'word.riser', t: 66.0, kind: 'riser', strength: 0.75, to: 68.0, note: 'into the bar 34 drop' },
  { id: 'word.drop', t: 68.0, kind: 'drop', strength: 1.0, note: 'bar 34: the .docx' },
  { id: 'word.hit', t: 68.0, kind: 'hit', strength: 0.9, note: 'bar 34: the .docx' },
  { id: 'word.fact1', t: 69.0, kind: 'tick', strength: 0.45, note: 'Live numbering.' },
  { id: 'word.fact2', t: 69.5, kind: 'tick', strength: 0.45, note: 'Real styles.' },
  { id: 'word.fact3', t: 70.0, kind: 'tick', strength: 0.45, note: 'Fully editable.' },
  { id: 'everywhere.hit', t: 72.0, kind: 'hit', strength: 0.85, note: 'final chorus' },
  { id: 'everywhere.chip1', t: 72.5, kind: 'tick', strength: 0.4, note: 'chip: PDF' },
  { id: 'everywhere.chip2', t: 73.0, kind: 'tick', strength: 0.4, note: 'chip: Answer key' },
  { id: 'everywhere.chip3', t: 73.5, kind: 'tick', strength: 0.4, note: 'chip: Kahoot' },
  { id: 'everywhere.chip4', t: 74.0, kind: 'tick', strength: 0.4, note: 'chip: Blooket' },
  { id: 'everywhere.chip5', t: 74.5, kind: 'tick', strength: 0.4, note: 'chip: ZipGrade' },
  { id: 'everywhere.browser', t: 76.0, kind: 'whoosh', strength: 0.5, note: 'window: browser' },
  { id: 'everywhere.mac', t: 77.0, kind: 'whoosh', strength: 0.5, note: 'window: Mac' },
  { id: 'everywhere.windows', t: 78.0, kind: 'whoosh', strength: 0.5, note: 'window: Windows' },
  ...MONTAGE_CUTS.map((t, i) => ({
    id: `montage.cut${i + 1}`,
    t,
    kind: 'tick',
    strength: Math.round((0.35 + (0.2 * i) / (MONTAGE_CUTS.length - 1)) * 100) / 100,
    note: `montage cut ${i + 1}`,
  })),
  { id: 'montage.riser', t: 83.0, kind: 'riser', strength: 0.9, to: 83.9, note: 'into the end hit (stops short: the hit lands in air)' },
  { id: 'end.hit', t: 84.0, kind: 'hit', strength: 1.0, note: 'big: bar 42, end' },
  { id: 'end.tagline', t: 86.0, kind: 'tick', strength: 0.5, note: 'tagline' },
  { id: 'end.swell', t: 88.0, kind: 'swell', strength: 0.5, note: 'tonic bloom' },
  { id: 'end.silence', t: 94.0, kind: 'end', strength: 0, note: 'silence' },
].sort((a, b) => a.t - b.t);

/** The cue with id `id`; throws for an unknown id. */
export function cue(id) {
  const c = CUES.find((x) => x.id === id);
  if (!c) throw new Error(`unknown cue: ${id}`);
  return c;
}

/** Film seconds of cue `id`. */
export const cueAt = (id) => cue(id).t;

// One chord per bar (ASCII sharps). Grooves alternate progressions A and B from bar 8.
const INTRO = ['Dmaj9', 'Bm11', 'Gmaj9', 'A6sus4'];
const GROOVE_A = ['Gmaj7', 'A6', 'F#m11', 'Bm9']; // F#m11, not F#m7: A6 and F#m7 share all four notes
const GROOVE_B = ['Dmaj9', 'A/C#', 'Bm9', 'Gmaj9'];
const BREAKDOWN = ['Gmaj9', 'A6sus4'];
const HARMONY = [
  ...INTRO, ...INTRO, // bars 0-7
  ...GROOVE_A, ...GROOVE_B, ...GROOVE_A, ...GROOVE_B, ...GROOVE_A, ...GROOVE_B, // 8-31
  ...BREAKDOWN, // 32-33
  ...GROOVE_A, ...GROOVE_B, // 34-41: final chorus, ends Gmaj9 -> D
  ...Array(5).fill('Dmaj9(add6)'), // 42-46: outro
];
export const CHORDS = HARMONY.map((chord, i) => ({ bar: i, chord }));

/**
 * All on-screen text, English + Traditional Chinese (HK). Scenes place it and never split
 * or rewrite it: "\n" is a forced line break, an array is separate blocks. lib/type.js
 * wraps and shrinks a string that outgrows its block (FILM.md §4 Typography).
 */
export const COPY = {
  window: 'Econ Worksheet', // app window title bars
  opening: {
    supply: 'Supply.',
    demand: 'Demand.',
    equilibrium: 'Equilibrium.',
    title: 'Econ Worksheet',
    sub: 'Worksheets for HKDSE Economics.',
    subZh: '為文憑試經濟科而設。',
  },
  write: {
    headline: 'Type right\non the page.',
    headlineZh: '直接在頁面上輸入。',
    sub: 'The preview is the editor.\nWhat you see is what prints.',
    langs: ['English.', '中文。', 'Both.'],
  },
  diagrams: {
    word: 'Diagrams.',
    curves: ['D', 'S'],
    headline: 'Drawn\nin seconds.',
    headlineZh: '圖表，數秒完成。',
    subs: ['Draw the curves.', 'Shift for a tax.', 'Shade the areas.'],
    layers: 'Every line stays editable.',
    layersZh: '每一條線都可以再編輯。',
    layerNames: ['Axes', 'Shading', 'Guides', 'Curves', 'Tax shift', 'Points'],
  },
  marks: {
    headline: 'Marks that add themselves up.',
    headlineZh: '分數自動合計。',
    teacher: 'The teacher’s copy. One click.',
    teacherZh: '教師版，一按即得。',
  },
  papers: {
    headline: 'From a quick quiz to a full mock paper.',
    headlineZh: '由課堂小測到模擬試卷。',
  },
  word: {
    headline: 'A real Word document.',
    headlineZh: '真正的 Word 文件。',
    facts: ['Live numbering.', 'Real styles.', 'Fully editable.'],
    // As the app names it: fileTitle() turns ':' into '-', docxFileName() adds (Student) (EN).
    window: 'S5 Market Intervention- Diagrams (Student) (EN).docx',
    styles: { title: 'Worksheet Title', stem: 'Question Stem', part: 'Sub-question' }, // as in word/styles.xml
  },
  everywhere: {
    chips: ['PDF', 'Answer key', 'Kahoot', 'Blooket', 'ZipGrade'],
    lines: ['In your browser.', 'On Mac.', 'On Windows.'],
    linesZh: '瀏覽器、Mac、Windows，隨處可用。',
    export: 'Export your way.',
    exportZh: '隨心匯出。',
  },
  end: {
    title: 'Econ Worksheet',
    tagline: 'Less formatting. More teaching.',
    taglineZh: '少排版，多教學。',
    small: 'Free. No account needed.',
    smallZh: '免費使用，無需註冊。',
  },
};

// Seconds a centred transition reaches past a boundary (0 for cuts and edge fades).
const EDGE = new Set(['cut', 'fadeFromBlack', 'fadeToBlack']);
const halfOverlap = (tr) => (tr && !EDGE.has(tr.type) ? ((tr.beats ?? 0) * BEAT) / 2 : 0);

/** Seconds the scene renders, including transition overlap: [start, end). */
export function sceneWindow(id) {
  const i = SCENES.findIndex((s) => s.id === id);
  if (i < 0) throw new Error(`unknown scene: ${id}`);
  const s = SCENES[i];
  return {
    start: Math.max(0, bar(s.from) - halfOverlap(s.in)),
    end: Math.min(DURATION, bar(s.to) + halfOverlap(SCENES[i + 1]?.in)),
  };
}

const sceneInfo = (id) => {
  const s = SCENES.find((x) => x.id === id);
  if (!s) throw new Error(`unknown scene: ${id}`);
  return s;
};

/** Seconds at the scene's start bar (its t = 0). */
export const sceneStart = (id) => bar(sceneInfo(id).from);

/** Seconds at the scene's end bar. */
export const sceneEnd = (id) => bar(sceneInfo(id).to);

/** Ids of the scenes rendering at film time t, in timeline order (two during a dissolve). */
export const sceneAt = (t) =>
  SCENES.filter((s) => {
    const w = sceneWindow(s.id);
    return t >= w.start && t < w.end;
  }).map((s) => s.id);
