---
name: jev
description: Cheap lookups and checks for the Econ Studio repo, decided by Jev (TypeSafe's decision model). Use it to locate the doc section or source file that answers a question (instead of reading STATUS, CODEMAP, RECIPES, GLOSSARY or SYSTEM_ARCHITECTURE whole), to plan which verification checks a diff needs before running tests, screenshots, samples or the cover/LQ harnesses, to read `npm run lint` against the known baseline, and to edit or debug the project hooks and their rules (rules.json, verify.json, find.json).
---

# jev: pointers, guards and check plans

Everything here is plain Node 22 with no dependencies, and fails open: no key, a network
error or a timeout means no output from a hook and a keyword or all-checks fallback from a CLI.
Key: env `TYPESAFE_API_KEY`, else `~/.claude/jev.env` (`TYPESAFE_API_KEY=...`). Never print it.

## Commands (repo root)

```sh
node .claude/skills/jev/bin/find.mjs "why does a new field vanish on reload"   # top 5 doc sections
node .claude/skills/jev/bin/find.mjs "<question>" --code --grep schemeMax,maxOf # + source files
node .claude/skills/jev/bin/verify-plan.mjs [<base>]     # base (default develop)...HEAD + working tree
node .claude/skills/jev/bin/verify-plan.mjs --commit <sha>
node .claude/skills/jev/bin/lint-delta.mjs [--update]    # lint vs lint-baseline.json
node .claude/skills/jev/bin/doctor.mjs                   # key, API, data, index, hooks
```

- `find` prints `path:start-end  heading  (score)`: `Read` that range, not the file. `--json`,
  `--top N`. `--code` lists source files first; its grep terms come from the question, so pass
  real identifiers with `--grep` when you know them.
- `verify-plan` prints required and skippable checks with a reason each. Tests and typecheck
  are always required; a check is skippable only when no path trigger fires and Jev says no
  below `lowThreshold`. Without an answer from Jev, every check in scope is required.

## Hooks (`.claude/settings.json`)

| Event | Script | Does |
|---|---|---|
| UserPromptSubmit | `pointers-hook.mjs` | Up to 4 doc pointers (~70 tokens) when a section scores ≥ `hook.minNoul`; silent for short or `/` prompts |
| PreToolUse Edit/Write | `guard-hook.mjs` | `rules.json`: deterministic rules first (no API call), then one Jev request for the `jev` rules that apply |
| PreToolUse Bash | `lint-filter-hook.mjs` | A bare `npm run lint` becomes `npm run lint 2>&1 \| node lint-delta.mjs --stdin`: one line when nothing is new |

Hooks run from `$CLAUDE_PROJECT_DIR` (the main checkout) for worktree agents too; file paths
are normalised by stripping `.claude/worktrees/<name>/`.

## Editing the data

- `find.json`: doc sources and chunk sizes, the ranking question, shortlist, hook threshold.
  After a change: `node bin/find.mjs --eval` (cases in `test/find-eval.json`).
- `rules.json`: `{id, kind: path|regex|check|jev, action: block|remind, globs, exclude, text}`.
  `regex` matches only added lines (`pattern`, `flags`, `unless` per line). `jev` rules take
  `question` (Noul), optional `when`/`skipIf` regexes on the added lines (no match, no request)
  and `threshold`. `check` names a built-in (`knownKeys`). After a change:
  `node bin/guard-hook.mjs --trials`; every rule needs a positive and a negative case in
  `test/guard-trials.json`, plus a held-out case its criteria do not name.
- `verify.json`: `questions` (Noul about one file's diff) and `checks` with `triggers`
  (required), `scope` (ask Jev), `ignore`, `satisfiedBy`, `always`.
- `lint-baseline.json`: regenerate with `lint-delta.mjs --update` after fixing or accepting
  lint problems on develop.
- Tests: `node --test '.claude/skills/jev/test/*.test.mjs'` (a local mock API; no key or
  network). Node 22 does not accept a bare directory there.

## Pitfalls learned

- Jev reads literally. `derived-not-stored` first blocked `firstQuestionNumber` (a teacher's
  choice) at 0.91; naming "values the teacher chooses" in `criteria.false` fixed it (0.05).
- A false block costs more than it saves: a new `jev` rule starts as `remind` and becomes
  `block` only after trials show a wide margin. Thresholds do not carry between questions.
- Ask Jev nothing code can compute: the KNOWN_KEYS reminder diffs the `Worksheet` interface
  against `KNOWN_KEYS` in code.
- `npm run lint` exits 1 on the baseline's 3 errors, and a failed Bash call reaches only
  PostToolUseFailure, which cannot replace output. Hence the rewrite before the run. The
  rewritten pipe may need one permission approval (it adds a `node` subcommand).
- Keyword ranking alone put the right section first for 8 of 17 eval questions; the Jev rerank
  gets 13 (15 in the top 3) at ~0.3 s and ~6.6k input tokens per query.
