# Orchestrating agents on the film

How the 94 s film was built by parallel agents, and the rules that stopped them dying or
colliding. Scale it down for small jobs: a text change needs one agent; a new scene needs
builder → critic → fixer; a new film needs the whole pipeline.

## The pipeline

1. **Bible** (coordinator, one pass): storyboard × bars, copy, music map, motion rules,
   file contracts, product truths. Every agent reads it first; where code must disagree,
   the agent says so in its report. (`scripts/film/FILM.md` is the template.)
2. **Scaffold commit** on `feature/film` (or `feature/film-<name>`): timeline, paths,
   deps, placeholder scenes — so every branch shares the contracts from the first minute.
3. **Three independent parts in parallel**, each on its own branch cut from the scaffold:
   capture (real app → assets), stage (engine + lib + renderer + two bookend scenes), score
   (music + sfx from the timeline). They meet only through the timeline, the asset registry
   and `events.json`.
4. **Scene groups in parallel**, one agent per group of neighbouring scenes (write ·
   diagrams · marks+papers · word+everywhere+montage), each owning only its scene files.
   Before building, neighbours agree a **handoff frame** at each boundary (framing, pose,
   brightness, world) and write it down; then the seam can be a cut.
5. **Builder → critic → fixer per group.** The critic is a fresh agent (Apple creative
   director + motion engineer) with the stills grid and a short final render, returning
   structured findings. First passes scored 5.5–7.6/10; the critique round is where the
   quality comes from. Budget two rounds.
6. **Whole-film lens panel** on a full render: separate reviewers for story, motion/seams,
   typography, product truth, audio-visual sync. They catch the cross-scene problems no
   scene critic sees (inconsistent margins, stale sfx, dissolves over matched frames).
7. **Fix groups** from the panel's findings, split by file ownership (integrator,
   bookends, each scene group), merged one by one.
8. **Integrator** owns the shared files (`timeline.mjs`, `engine.js`, `lib/`, `score/`,
   `assets.mjs`); scene agents request changes in their reports instead of editing them.
   The integrator merges, re-scores, renders the whole film, and runs doctor.

## Findings format (critics and panel)

```json
{ "lens": "motion", "score": "6", "summary": "…",
  "findings": [{ "time": "47.10–48.35", "scene": "timeline", "severity": "blocker|major|minor",
                 "problem": "what the viewer sees, measured", "fix": "file + concrete change",
                 "evidence": "frame grab / MAD / luma / measurement" }] }
```

Ask for measurements, not adjectives (MAD per frame, luma, px widths, onset times). Require
the fix to name a file and a value. A finding without evidence is a hypothesis: verify it
before assigning it.

## Stall watchdog and pacing (the rules that kept agents alive)

A workflow agent with no tool output for **180 s** is killed and restarted; its log shows
"[Request interrupted by user]", which is **not** the user. Four builders rendering 1080p60
on one GPU died six times each. So every agent prompt carries:

- A tool call at least every ~60 s. Think briefly, act, look, repeat.
- Edits of at most ~80 changed lines per call; a big refactor is many small edits,
  committed file by file.
- Every foreground command finishes in < 100 s: `bin/timeout 100 …` on renders and tests;
  ≤ 2 bars per `--final` render with `--workers=4` (`--workers=3` when agents share the GPU);
  `--preview`/`film:stills` to iterate; never a whole-film render or `npm run build` in the
  foreground — the coordinator runs those in the background.
- Commit after every meaningful step, so a restart loses nothing; on (re)start, read
  `git log <base>..<branch>` first and continue from there.

## Context budget

- Images are the context killer: builders that Read dozens of full-res frames ran out.
  Look at downscaled grids (`bin/sgrid.sh`, `bin/grid.sh`, cells ≤ 480 px); open one
  full-res frame only for a detail, cropped if possible.
- Measure instead of looking where you can (`bin/regdiff.py`, `bin/seam.py`,
  `tools/motion-check.mjs`, doctor).
- Agents read the bible section they need and this skill, not every scene file.
- Final reports are short and structured: commits, what changed, what was verified (with
  numbers), requests for shared files, open problems.

## Worktrees, branches, merges

- Every agent in its own git worktree on `feature/film-<part>` cut from the film branch;
  symlink the main checkout's `node_modules`; `npm --prefix scripts/film ci`.
- `FILM_OUT=<agent scratch>` for every render: outputs never collide. The **asset store is
  shared** (main checkout's `demo-media/film/assets/`): only one agent re-captures a given
  job, and says so; nobody deletes assets.
- `extra-marks.mjs` serves the **main checkout's** `out/`, `capture.mjs` its own
  checkout's — a capture in a worktree after a UI change needs both built.
- Relaunching an agent on an existing branch: commit its WIP in the old worktree, then
  `git worktree remove --force <path>`, so the new agent can check the branch out.
- Merge scene groups one at a time into the film branch (`git merge --no-ff`), re-run
  doctor after each, then one integrator pass. Never commit to `main`/`develop`; never push.
- A scene agent that needs a shared-file change (a cue, a lib helper, an engine feature)
  asks in its report; the integrator applies it once, for everyone.

## Mistakes not to repeat

- **Stale score in a review render**: `events.json` was rewritten by a render but the sfx
  was not rebuilt, so every UI sound was off by up to 0.5 s and the sync reviewer lost a
  round to it. `render.mjs` now rebuilds or refuses a stale score; still, run
  `npm run film:score` after cue/placement changes before any review render.
- **Unknown flags started a full final render** (`render.mjs --help`, a bare `stills`).
  Fixed (exit 2), but keep commands copy-pasted from `--help`.
- **Critics given only prose** produce taste; critics given grids, a short render and
  measurement tools produce fixes.
- **Scene agents editing the timeline in parallel** create merge conflicts in the one file
  everyone reads. One owner.
- **A scene that hard-codes another scene's numbers** breaks silently when the neighbour
  moves; share them through one exported constant (`scenes/marks/kit.js:HANDOFF`) or a cue.
- **Copy in scene code** made every text edit a code edit. All copy is in `COPY`; the fit
  engine and doctor catch overflow.

## Prompts that worked

- **Builder**: "You own `stage/scenes/<id>.js` and `stage/scenes/<id>/` only. Read
  FILM.md §3 row <id>, §4, §5, and the econ-film skill. Handoffs: <exact frames agreed
  with neighbours>. Iterate with `film:stills` and ≤ 2-bar `--final` renders into
  `FILM_OUT=<scratch>`. Commit each round. Report: commits, stills grid path, requests for
  shared files, known problems."
- **Critic**: "You are an Apple creative director and a motion engineer. Review
  <scene> from <grid>, <short render>, and its source. Return JSON findings
  (time/scene/severity/problem/fix/evidence), measured, most severe first, and a score out
  of 10. Check craft.md's rules one by one."
- **Fixer**: "Apply these findings in your files; for each, say fixed / skipped (why) /
  needs a shared-file change. Show before/after stills of each fixed moment."
- **Lens panel member**: "Review the whole film through the <story|motion|type|truth|sync>
  lens only. Cross-scene consistency is your job; per-scene polish is not."
- Every prompt ends with the hard rules above (tool call every 60 s, ≤ 80-line edits,
  < 100 s commands, commit often, grids ≤ 480 px, `FILM_OUT` scratch) and "never push,
  never commit to main/develop".
