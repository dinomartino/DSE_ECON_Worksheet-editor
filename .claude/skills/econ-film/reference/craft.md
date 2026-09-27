# Craft: the look and motion the critics enforce

The full spec is `FILM.md` §4. These are the rules reviews kept coming back to — each one
cost at least one fix round. Check your scene against them before asking for a review.

## Truth: show, don't claim

- Every headline must visibly happen under it. "Marks that add themselves up" needs a
  total that adds (two parts, the total counting up), not one field changing. "Live
  numbering. Real styles. Fully editable." each land with their proof on the page
  (numbers light, style names show, a caret blinks). A caption claiming three versions
  shows three.
- The picture under a claim is the thing claimed: "A real Word document" over the .docx
  render, not over the app's printed sheet.
- Never show a finished state before the live action produces it (a printed still that
  already has the answer lines the clip is about to add).
- Details that read as fake to the audience: Mac ⌘ glyphs inside a "Windows" window,
  an empty browser address bar, placeholder text ("SCHOOL NAME") legible in a hero shot, a
  brand element (the logo's dot) left floating on real UI. Crop, fill or re-capture.
- Hold the most persuasive product frame (the Shade menu offering "Tax revenue", "DWL")
  long enough to read; don't let the payoff flash by at 3–5× playback.
- No third-party logos; naming a format in text is fine. Only claims from FILM.md §2.

## Reading and type

- Reading time ≥ 1.0 s + 0.3 s/word counted from **full reveal** to exit start
  (`lib.type.readTime`). The zh line needs the same. A cut must not take a line early.
- One headline on screen at a time; headlines ≤ ~7 words; type in negative space, never
  over busy UI.
- Consistency across scenes, because cuts compare them: the same left margin for
  left-set blocks, the same baseline for bottom-centred EN+zh blocks, one size/leading
  for stacked lists, one sub-line style.
- Breaks keep phrases whole ("Drawn / in seconds.", not "Drawn in / seconds."); no
  orphaned prepositions.
- Chinese: Traditional, Hong Kong usage and consistent terms (the exam is 香港中學文憑考試,
  short 文憑試); ends with 。 when the EN has a period; full-width 。， leave holes at
  headline size — use `halt` / `kernStop`.
- UI text must be legible at 1080p: push in or crop so the page is ~2/3 of the frame,
  window ≥ 55% of frame width when it is read.

## Motion

- **Nothing is ever still**: holds are slow drifts (1–3% dolly, 2–4° orbit). A frame
  frozen for > ~1 s under loud music reads as a stall even if technically moving.
- **One continuous move beats a chain**: five rest-to-rest camera moves with 0.1 s gaps
  read as stutter. Blend into one path, or overlap the moves.
- Fast moves start from rest (`cubicBezier`), land on beats; entrances `expoOut`/
  `quintOut`, exits `quintIn`; springs damped 0.65–0.85, one overshoot at most.
- **Across a cut, motion continues**: the outgoing push's direction and speed carry into
  the incoming shot; don't reverse the motion vector on the cut.
- Don't move the camera during the product beat itself (the curve being drawn); move
  before or after it.
- Energy follows the music: after a big hit, the picture moves (not a spring from rest
  that collapses the energy); a drop reveals on the drop, not two frames before it.
- Retimed clips: > ~2× strobes popovers and inspector panels; the frame cross-fade at
  fractional positions ghosts the cursor. Cut out the dull part instead of speeding it.
- Motion blur by sub-frames (`ctx.post.samples` for fast moves); depth of field on hero
  3D; never both on text.

## Transitions and state changes

- **Never crossfade between two different UI states** (a double exposure the real app
  never shows): the app switches instantly. Show real frames, or hide the change behind
  a camera move, an occlusion or a cut on a beat. The same for fading a patch of an
  earlier frame over UI (a half-transparent toolbar).
- **Never dissolve between frames that already match** — it only defocuses the downbeat.
  Register the frames and cut.
- A wipe or blend between very different materials (white paper ↔ black glass) passes
  through mid-grey mush; keep such blends short or hide them in motion.
- Lighting transitions (night ↔ day, lights down) pass through clean intermediates, not a
  flat grey room or a muddy tungsten; check a still at the midpoint.
- No luminance pop at a cut: match brightness across it, or make the jump deliberate and
  on the beat.
- Strokes that draw on start as a point, not a full-width capsule popping in on one frame.

## Light and colour

- Paper and screens are unlit / `toneMapped: false`: white stays white, and they never
  bloom (bloom takes only > 1.0 — the blue dot, glows).
- Night: black with a warm radial lift, never flat grey; the accent `#1E7FD4` is the only
  saturated colour. Lights-down stays low-chroma (brand warm charcoal `#3A342E`); paper
  the brightest object.
- Near-black gradients band (and turn green in yuv420) unless dithered — the engine's
  grain does it; the final encode settings keep it (FILM.md §8).
- One specular highlight at a time; a second bright point racing across the frame
  competes with the subject.
- Restraint: no lens flares, chromatic aberration, bouncy easing or spinning for its own
  sake; one effect per moment.

## Sound and picture

- Cuts on downbeats (bar or half-bar); key motions land on beats; cue `peak` on the
  picture's fastest frame (a whoosh that peaks before its motion sounds early).
- A big hit needs air before it: the run-up (≥ 8 dB quieter over the last 8th) and a
  picture that builds into it. The last montage shot before the hit should be the most
  emotional image, not a dim one.
- Big moves get a sound; UI sounds are thinned (one click per double-click, ≤ 8 keys/s,
  nothing under a cue) or they turn into a rattle at 20 transients a second.
- A regenerated sfx pass can double a sound that a cue and a clip event both produce
  (the landing): check `audio/sfx-events.json` around every hit.
- Section energy must change: a 48 s loudness plateau is monotony; open the band up for
  the awe moment (the orbit) and thin it before a drop.

## Story

- Dead air is the enemy: every 2 s carries new information or a clear emotional beat.
- The brand gets its moment, but product appears within ~10 s.
- The end card tells a teacher what to do next (free, no account) and doesn't repeat a
  line from 8 s earlier.
