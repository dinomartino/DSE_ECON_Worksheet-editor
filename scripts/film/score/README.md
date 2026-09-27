# Score and sound design

The film's original music and sound effects, synthesised in Python (FILM.md §7). No samples:
every sound is built from oscillators and seeded noise, so a render is byte-identical each time.

```sh
node scripts/film/score/score.mjs all      # or: python3.13 scripts/film/score/score.py all
node scripts/film/score/score.mjs music    # timeline -> music.wav + stems
node scripts/film/score/score.mjs sfx      # build/events.json (or the timeline cues) -> sfx.wav
node scripts/film/score/score.mjs mix      # master -> score.wav, then verify
node scripts/film/score/score.mjs report   # verify the existing score.wav again
```

The first run builds `.venv` from `requirements.txt` (pinned; numpy, scipy, numba, pedalboard,
soundfile, pillow; no matplotlib, whose .js files ESLint would lint). It needs Python >= 3.10, node and ffmpeg. `score.mjs` looks for a
Python >= 3.10 (`FILM_PYTHON` overrides). `all` takes about 40 s.

Output goes to `demo-media/film/audio/` in the main checkout (or `$FILM_OUT/audio/`):

| File | What |
|---|---|
| `score.wav` | The master: music and sfx, 48 kHz 24-bit, 94.000 s, −16 LUFS, true peak ≤ −1 dBTP |
| `music.wav`, `stems/{drums,bass,harmony,lead,fx}.wav` | Before mastering. The stems add up exactly to `music.wav` |
| `sfx.wav` | Cue sounds and UI sounds, before mastering |
| `report.txt`, `report.json` | Verification (see below). `mix` exits non-zero if any check fails |
| `spectrogram.png` | The full mix on a log-frequency axis, with sections, cues, loudness and the energy map |
| `score.mp3`, `score-excerpt.mp3` | For listening. The excerpt runs 12–42 s: riser, breath, drop, groove A, the hero melody |
| `sfx-kit.wav` | One of each sound, for auditioning. The film does not use it |
| `music-levels.json`, `sfx-events.json` | Calibrated gains, voicings, and every sfx event that was placed |

## The music

The music is 120 BPM in D major, 4/4. A bar lasts 2 s and a 16th lasts 0.125 s, so every grid time falls on a whole sample. Sections,
chords and cues come from `timeline.mjs`, and the arrangement is in `scorelib/arrangement.py`.

| Bars | s | Section | What plays |
|---|---|---|---|
| 0–4 | 0–8 | intro-a | The pad blooms from black. A felt-piano motif, F♯4–A4–D5, falls on "Supply. Demand. Equilibrium." (1.5, 3.5, 5.5 s). |
| 4–8 | 8–16 | intro-b | A sub pulse in 8ths. The glassy pluck arp starts, with its filter opening. The motif returns as a bell flourish on the title (10 s). Riser from 12 s. **Silence from 15.5 to 16.0 s.** |
| 8–16 | 16–32 | groove A | The drop. Four-on-the-floor kick, clap on 2 and 4, humanised 16th hats, and a shaker from bar 12. The bass holds the root and adds pickups. The pad pumps with the kick. From bar 12 an EP answers with the motif cell (F♯–A–D, beats 3–4 of bars 12 and 14). Fills in bars 11 and 15. |
| 16–24 | 32–48 | hero | One half-time bar under "Diagrams.", then the full groove with a snare layer and rim. The **bell melody** plays. Bars 21–22 (the orbit, from the 42.0 partial breath) open up: half-time kick and rim, no hats, the bass held 6 dB down, the pad an octave wider and brighter. A crash and a tom fill in bar 23 bring the band back. |
| 24–32 | 48–64 | groove B | The bass switches to a tresillo (3-3-2), locked with FM-EP stabs. Rim on the 3-3-2 and skippy hats. Bar 27 stops after beat 2. The peak (bars 28–31) adds a kick push, tambourine, a brighter pad, and the EP playing the melody's second half (written over this progression). The drums thin out in bar 31. |
| 32–34 | 64–68 | breakdown | Drums out. The pad swells and a felt piano plays; its top line traces the motif, then climbs. A snare build and a riser lead to the drop at 68 s. |
| 34–42 | 68–84 | final | Everything plays. Open hats. The pad doubles an octave up, the arp doubles at the octave, and the melody returns an octave higher. Crashes mark each phrase, and bar 41 builds. |
| 42–47 | 84–94 | outro | The impact. A rolled Dmaj9(add6) chord, with pad and bass decaying on the tonic. The motif resolves to D (86, 87, 88 s). Fades to digital silence at 94.0 s. |

**Harmony.** There is one chord per bar, taken from `CHORDS`. The intro and breakdown use `Dmaj9 Bm11 Gmaj9 A6sus4`. The grooves use
`Gmaj7 A6 F♯m11 Bm9` (IV–V–iii–vi) and `Dmaj9 A/C♯ Bm9 Gmaj9`, and the end holds `Dmaj9(add6)`. The pad
voicings come from a Viterbi search over all 47 bars. It picks the path with the least total voice movement,
with no minor 2nds or 9ths and close voicings from D3 to C5; a new chord never keeps the old chord's exact
voicing. Under a held lead note the pad avoids a minor 2nd/9th, leaving out one colour tone (never the third) if
it must: Bm9 and Dmaj9 under D5 drop their C♯. The result is F♯4 held on top
like a pedal while the inner voices step (for example `E3 A3 C♯4 F♯4 → E3 A3 D4 F♯4`). The arp alternates two
figures per 4-bar phrase, its filter sweeping the answering phrase, and swaps any note a semitone from the lead.
The bass line runs G1–D2.

**Melody.** The melody is written out in `HERO`. It is eight bars of call and answer, and each call opens with the logo's shape:
F♯–A–D, then A–C♯–E, A–D–F♯, and D–F♯–A. Every call has the same rhythm: 8th, 8th, dotted quarter, three
8ths, the last one tied. The line climbs to B5 in bar 6 and resolves to D5 over Gmaj9. A pitch
check on the rendered stem matches all 37 notes, with at most 0.8 cents of error.

**Instruments** (`synths.py`, `drums.py`):
- Felt piano: additive synthesis with stretched partials and two detuned strings per partial, a double decay, and felt noise.
- Soft FM EP: 1:1 FM, a 14:1 tine, and chorus.
- Warm pad: three PolyBLEP saws per voice, detuned ±8 cents across L/C/R, a 24 dB low-pass with smooth automation, and slow drift. Hall reverb, sidechained.
- Glassy pluck: a saw and a 3:1 FM glass layer through an enveloped filter. Ping-pong delay at a dotted 8th (3/16).
- Sub bass: a sine with tanh saturation, a saw low-passed at 1 kHz and a saturated octave above (the line on a laptop), sidechained. Mono.
- Bell lead: 2:1 FM with mallet partials at 2.76× and 5.4×, and delayed vibrato.
- Drums: kick (pitch sweep plus click, settling on A1), 4-burst clap in a short room, snare, metallic hats (band-limited
  additive squares plus noise), shaker, tambourine, rim, toms tuned F♯3/D3/A2, crash, and reverse crash.

**Rules.** Oscillators are band-limited: PolyBLEP or additive. Fast-attack notes start at a zero crossing, and every
envelope starts and ends with a raised-cosine ramp. Filter cutoffs change per sample through a TPT
state-variable filter, so there is no zipper noise. Every buffer lasts until its sound has decayed about 50 dB. Reverbs are
convolution with synthetic stereo IRs, and sfx tails are never cut. Stereo width comes from
detune and delay; below 120 Hz everything is mono (the side channel is high-passed at 150 Hz). A full breath cuts the
whole effect chain, so no reverb tail comes back after it.

## Sound design (`scorelib/sfx.py`)

`sfx` reads `build/events.json` once the stage has written it. Before that, it uses the timeline `CUES`.
The file is a list (or `{"events": [...]}`) of `{t, kind, strength?, to?, peak?, pan?, label?, scene?}` in film
seconds. If it contains no cue kinds, the timeline cues are added. Cue sounds of one kind within 50 ms merge (the
strongest wins). The clips' UI events are thinned: a double-click is one click (events within 90 ms merge), a key
sounds only for a printable character and at most every 125 ms, nothing sounds under a cue tick or hit, the
drawing keeps only its drags and the Curve / Shift a copy / Shade / Add clicks, and the montage keeps no keys.

Each sound's level is set in LU against the music's loudness over its dense sections (bars 8–32 and
34–42), measured on the sound's loudest 100 ms. Strength moves a sound's level by 12 dB for each tenfold change
in strength. Ticks and whooshes use the louder of that and the music's own 3 s around them, and are lifted (by
at most 8 / 6 dB) until they stand +2 / −3 dB over the music in their own band at their own instant.

| Kind | Level | Sound |
|---|---|---|
| hit | −3 | A sub boom settling on the bar's bass root (D1 with no bass, and on the big hit), a 110–220 Hz body, a noise burst and crack, and a long tail. Soft below strength 0.6. The big hit adds a D tonic |
| whoosh | −8 | Band-passed noise sweeping 380 Hz → 2.4–3.6 kHz → 700 Hz, panned L→R, peaking at the cue's `peak` (default 60 ms after `t`) |
| riser | −6 | A noise sweep up to 9 kHz and saws rising D3→D5, with tremolo speeding up. It stops exactly at `to` |
| swell | −14 | A soft bloom of the current chord's tones with breathy noise, in a hall |
| tick | −18 | A short glassy FM bell, tuned to the harmony. On a motif note it sits two octaves above it; runs of ticks climb through the chord; in the final chorus from C7, above the arp |
| toggle | −22 | A tiny glassy FM tick on a chord tone |
| click | −24 | A soft trackpad click |
| drag-start / drag-end | −26 | A small upward or downward blip with a click |
| key | −28 | A very soft key tap, slightly different on every key |

## Master and verification

The master chain runs in this order:
1. High-pass at 25 Hz, then mono below 120 Hz.
2. +1.5 dB of presence around 3.5 kHz.
3. 1.8:1 glue compression.
4. The run-up to each big hit (strength ≥ 0.85, not one out of a full breath) ducks 10 dB for its last 8th note.
5. A look-ahead true-peak limiter: 4× oversampled detection, −1.3 dBTP ceiling.
6. A 2.5 s fade to digital silence at 94.0 s.

In the music, harmony and lead duck 5 dB (10 ms in, 180 ms out) under the final chorus's ticks and whooshes and the
hero's whooshes, so the picture's accents are heard.

The gain is iterated until `ffmpeg -af ebur128=peak=true` reads −16.0 ± 0.1 LUFS. `report.txt` checks the following:
- Freshness: `music-levels.json` and `sfx-events.json` record hashes of the timeline and of the `events.json` they
  were built from; a stale music or sfx pass fails (and `render.mjs` rebuilds it before muxing).
- Duration, integrated loudness (±0.5 LU), true peak ≤ −1 dBTP, no clipping, no DC.
- Every big hit is ≥ 8 dB louder (0–80 ms) than its run-up (50–250 ms before).
- Per-section loudness against the energy map: Spearman rank correlation ≥ 0.9.
- The 15.5–16.0 s breath is at or below −60 dBFS. It is currently digital silence.
- Cue onsets, detected with no knowledge of the cues, must land within 5 ms in the sfx stem (hits,
  ticks), the drums stem (hits and drops) and the lead stem (the motif). The master must add zero lag
  against music + sfx. Full-mix onsets are listed for information only: builds mask some rises.
- Mono: L/R correlation, fold-down loss, and side energy below 120 Hz. The tail must end at digital silence.
