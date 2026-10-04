// Event kind → kit sound, and which events get to sound at all (FILM.md §6). Pure data.
// The kit is synthesised (audio/kit/): soft, warm, tonal, in the music's key. The music leads:
// a sound marks only what carries meaning (a click you see, the dot, a line drawing on, a
// chapter, the lift, the ending), at most one per musical beat.
//
// MAP[kind] = { sound, prio, size? }   kind = the event's `sfx` ?? `kind`; null = silent
//   prio    who wins when two sounds fall inside one beat (RULES.minGap): the higher
//   size    air only: 's' (a cut) or 'm' (a camera travel); an event's own `size` wins
//
// SOUNDS[sound]
//   rel_lu  target loudness against the music: the sound's loudest momentary loudness sits this
//           many LU from the music's momentary loudness at the event (loudness-aware: it follows
//           the music up through the lift and down in the quiet intro, clamped by LEVEL)
//   pick    which file of the sound plays: 'chord' (the chord under the event, harmony.json),
//           'degree' (a chord tone, rotated per event), 'cycle' (variants in turn), or a variant
//   duck    the music dips under it (mix.mjs DUCK); only the lift and the bell
//   panX    events carrying x (frame px of a 2880 wide clip) pan by position, ±panX

const tick = { sound: 'tick', prio: 4 };
export const MAP = {
  click: tick, dblclick: tick, toggle: tick, drag: tick, 'drag-start': tick, tick,
  pop: { sound: 'plip', prio: 6 }, drop: { sound: 'plip', prio: 6 }, shimmer: { sound: 'plip', prio: 5 }, swell: { sound: 'plip', prio: 5 },
  'drag-end': { sound: 'plip', prio: 3 }, // a release: only when no click owns the beat
  pencil: { sound: 'glint', prio: 5 }, 'draw-on': { sound: 'glint', prio: 5 }, draw: { sound: 'glint', prio: 5 }, stroke: { sound: 'glint', prio: 5 },
  whoosh: { sound: 'air', prio: 2, size: 'm' }, 'whoosh-m': { sound: 'air', prio: 2, size: 'm' }, 'whoosh-l': { sound: 'air', prio: 2, size: 'm' },
  'whoosh-s': { sound: 'air', prio: 2, size: 's' }, 'whoosh-small': { sound: 'air', prio: 2, size: 's' }, air: { sound: 'air', prio: 2, size: 's' },
  impact: { sound: 'bloom', prio: 10 }, hit: { sound: 'bloom', prio: 10 }, bloom: { sound: 'bloom', prio: 10 },
  chime: { sound: 'bell', prio: 9 }, end: { sound: 'bell', prio: 9 }, bell: { sound: 'bell', prio: 9 },
  chapter: { sound: 'chapter', prio: 8 },
  // Silent: the music carries typing, paper and page moves; the bloom carries its own build.
  key: null, type: null, typing: null, paper: null, page: null, turn: null, shutter: null, snap: null,
  riser: null, sparkle: null, accent: null, breath: null, clip: null, paragraph: null, 'missing-clip': null,
};

export const SOUNDS = {
  tick: { rel_lu: -19, pick: 'cycle', panX: 0.2 },
  plip: { rel_lu: -6, pick: 'degree' },
  air: { rel_lu: -15 },
  glint: { rel_lu: -9, pick: 'chord' },
  chapter: { rel_lu: -8, pick: 'chord' },
  bloom: { rel_lu: -1, pick: 'lift', duck: 'bloom' },
  bell: { rel_lu: -2, pick: 'chord', duck: 'bell' },
};

/** What each sound marks (the reel's legend, REEL.md). */
export const USED_FOR = {
  tick: 'a real click, toggle or drag you see in the footage',
  plip: 'the blue dot, a chip or total popping in, a small arrival (pitched to a chord tone)',
  air: 'a camera travel or a cut that lands off the music accents (s: cut, m: travel)',
  glint: 'a line drawing on, a trace or re-ink (replaces every pencil sound)',
  chapter: 'an axis chapter (Draw, Papers, the pull-back)',
  bloom: 'the lift at 72.92 s: reverse swell, sub thump, pad',
  bell: 'the end card dot (101.37 s, A) and the music’s last stab (104.40 s, D)',
};

/**
 * Loudness-aware level: music momentary loudness is read over 400 ms centred at the event (a
 * floor keeps a sound under near-silence from vanishing); the resulting gain is clamped.
 */
export const LEVEL = { musicFloor: -30, minGain: -40, maxGain: 0 };

export const RULES = {
  minGap: 0.8, // s: at most one sound per musical beat (0.889 s), the higher prio wins
  // A big sound owns a window: no lower-priority sound inside [t + a, t + b].
  owns: { bloom: [-2.0, 1.8], bell: [-0.8, 1.6], chapter: [-0.8, 0.8] },
  // A cut that lands on a strong music accent needs no air (harmony.json accent percentile).
  accent: { sounds: ['air'], pct: 80, tol: 0.04 },
  // Typing: key events are silent; a click inside a run (keys within runGap on both sides) joins it.
  runGap: 0.4,
  doubleGap: 0.15, // s: a click this soon after a click is the second half of a double-click
  // Events that say nothing the music does not: matched on scene + label prefix, or a label part.
  drop: [
    { scene: 'open', label: 'the drag: a crooked line', why: 'the Word struggle: a pleasant glint would praise it' },
    { labelHas: 'off frame', why: 'the viewer does not see the click' },
  ],
};

/** Resolve an event to { sound, prio, size } or null when it makes no sound. `sfx` wins over `kind`. */
export function kindOf(e) {
  const k = e.sfx ?? e.kind;
  if (!k || k === 'sfx' || !(k in MAP) || !MAP[k]) return null;
  const m = MAP[k];
  return { ...m, size: m.sound === 'air' ? (e.size === 'l' ? 'm' : e.size ?? m.size) : undefined };
}
