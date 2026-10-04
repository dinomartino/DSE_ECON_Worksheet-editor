// The SFX kit's parameters (FILM.md §6): pure data, read by gen.mjs. Pitches come from the
// music's key and chords (harmony.json: D major; chords D, G, A, F#m, Bm, Em). Times in s,
// levels in dB, frequencies in Hz. Every sound goes through the same ROOM, so they read as one
// instrument in one space; `wet` is the reverb's share of the sound's energy (≤ 0.25).

/** The one shared room: a short warm space (RT60 0.6 s low, 0.3 s above 2.5 kHz). */
export const ROOM = { rt: 0.6, rtHigh: 0.3, split: 2500, preDelay: 0.012, length: 1.0, early: [[7, 0.5], [13, 0.35], [21, 0.25]], seed: 7 };

/** Every sound is peak-normalised to this before the mix (sfxmap.mjs sets the levels). */
export const PEAK_DBFS = -3;

export const KIT = {
  // A tiny soft click: a few ms of band-passed noise (2.5 ms rise) + a faint high sine in key. Real clicks only.
  tick: {
    wet: 0.08,
    variants: [{ id: 'a', body: 'A6', seed: 1 }, { id: 'b', body: 'F#6', seed: 2 }, { id: 'c', body: 'D7', seed: 3 }],
    noise: { ms: 8, band: [1400, 4200], q: 0.8, attack: 0.0025, decay: 0.0015 }, body: { level: -12, decay: 0.025 }, thump: { hz: 220, level: -9, decay: 0.012 },
    fade: [0.002, 0.015],
  },
  // A rounded drop: sine + a little triangle, sliding down 2 semitones into the note in 30 ms,
  // soft 5 ms attack, ~0.5 s ring. One file per scale degree (register D5..C#6).
  plip: {
    wet: 0.18,
    notes: ['D5', 'E5', 'F#5', 'G5', 'A5', 'B5', 'C#6'],
    attack: 0.005, glide: { semis: 2, dur: 0.03 }, decay: 0.16, length: 0.6, triangle: 0.1, octave: -16, lowpass: 4000,
    fade: [0.005, 0.03],
  },
  // A gentle swish: band-passed noise whose centre sweeps up, rising slowly and falling faster;
  // the event lands on its peak + anchor. Sizes s (short cut) and m (a camera travel).
  air: {
    wet: 0.12,
    variants: [
      { id: 's', length: 0.28, peakAt: 0.6, sweep: [500, 1500], seed: 11 },
      { id: 'm', length: 0.45, peakAt: 0.55, sweep: [350, 1200], seed: 12 },
    ],
    q: 0.9, body: { lowpass: 900, level: -8 }, lowpass: 5000, pan: [-0.25, 0.25], anchor: -0.03,
    fade: [0.02, 0.06],
  },
  // A soft rising shimmer: the chord under the event as a quick arpeggio (root, third, fifth,
  // then the octave, 60 ms apart), each note gliding up from 25 cents flat, with an airy breath.
  // Replaces every pencil / draw-on / re-ink sound. One file per chord.
  glint: {
    wet: 0.22,
    chords: { D: ['D5', 'F#5', 'A5', 'D6'], G: ['G4', 'B4', 'D5', 'G5'], A: ['A4', 'C#5', 'E5', 'A5'], 'F#m': ['F#5', 'A5', 'C#6', 'F#6'], Bm: ['B4', 'D5', 'F#5', 'B5'], Em: ['E5', 'G5', 'B5', 'E6'] },
    step: 0.06, levels: [0, -2, -4, -8], attack: 0.012, decay: 0.32, length: 1.3, flat: 25, glideDur: 0.08, partial2: -18,
    breath: { band: [2500, 5500], level: -30, dur: 0.35 }, lowpass: 6500,
    fade: [0.004, 0.08],
  },
  // The lift (72.92): a reverse swell (the chord, swelling over 1.6 s, cut 20 ms before the hit)
  // → a soft sub thump (sine 110 → 73.4 Hz = D2, + its octave) → an in-key pad after (D add9).
  bloom: {
    wet: 0.22,
    swell: { length: 1.6, notes: ['D3', 'A3', 'D4', 'F#4'], curve: 3, level: -6, noise: -22, lowpass: 2500, gap: 0.02 },
    thump: { from: 110, to: 'D2', glide: 0.07, attack: 0.003, decay: 0.32, octave: -8, felt: { lowpass: 300, level: -16, dur: 0.03 } },
    pad: { notes: ['D4', 'F#4', 'A4', 'E5', 'A5'], levels: [0, -3, -3, -6, -10], attack: 0.25, decay: 1.4, length: 3.2, detune: 4, level: -7, lowpass: 4500, trem: { hz: 5, depth: 0.08 } },
    fade: [0.05, 0.4],
  },
  // A warm FM bell (carrier:modulator 1:1, index falling 2.2 → 0.4) + a quiet inharmonic
  // shimmer partial; the end card's dot (A, over the V chord) and the music's last stab (D).
  bell: {
    wet: 0.2,
    variants: [{ id: 'A', notes: [['A4', 0], ['E5', -9]] }, { id: 'D', notes: [['D5', 0], ['A5', -8], ['D4', -10]] }],
    attack: 0.004, index: [2.2, 0.4], indexDecay: 0.5, decay: [0.25, 1.6], fastShare: 0.35, shimmer: { ratio: 3.01, level: -24, decay: 0.3 }, length: 3.4, lowpass: 6000,
    fade: [0.004, 0.3],
  },
  // An axis chapter: a soft felt-piano dyad (root + fifth + octave), low, slow to speak.
  chapter: {
    wet: 0.18,
    chords: { D: ['D3', 'A3', 'D4'], G: ['G2', 'D3', 'G3'], A: ['A2', 'E3', 'A3'], 'F#m': ['F#3', 'C#4', 'F#4'], Bm: ['B2', 'F#3', 'B3'], Em: ['E3', 'B3', 'E4'] },
    levels: [0, -4, -7], partials: 8, rolloff: 1.6, decay: 1.8, inharm: 0.0004, attack: 0.008, hammer: { lowpass: 1200, level: -26, dur: 0.008 }, length: 2.6, lowpass: 3500,
    fade: [0.008, 0.25],
  },
};

/** The reel (audio/kit/reel.mp3): every kit file in this order, 0.6 s apart. */
export const REEL_GAP = 0.6;
