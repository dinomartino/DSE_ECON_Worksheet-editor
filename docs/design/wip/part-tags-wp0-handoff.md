# Part tags WP-0: handoff (paused 2026-09-30)

Branch `feature/part-tags-core`, cut from 48a2c05. Worktree:
`/Users/tino/Documents/Econ worksheet gen/.claude/worktrees/agent-a8644390cbad440bf`
(`node_modules` is a symlink to the main checkout's). Not pushed.

## Commits (48a2c05..HEAD)

- 84d0bdc Model: part/sub-part `tags` + `rootId` (types.ts); `lineage.ts` `partRootOf`,
  `copyQuestion` stamps part roots structurally, `withoutLineage`; registry hooks
  `tagSlots?` / `withSlotTags?` + `TagSlotInfo` (registry/types.ts), structured implements
  both; new `src/model/tagSlots.ts`; `contentKey` drops `IGNORED_PART = ['tags','rootId']`
  on every `part` owner.
- ebbab83 Library: `BankRow.slots?` / `ownTags?` + `BankSlot` (types.ts); `rowsOf` uses
  derived tags; `isBankRow` validates slots/ownTags; INDEX_FORMAT 5 → 6, golden
  regenerated with a partful `q-parts` (q-lq kept as the legacy shape); `sharedTags.ts`
  gains `sharedState`, `stateOfRow`, `rowTagFields`, state-aware `withSharedTags` /
  `withRowTags`; `tagWrites.ts` gains `StateEdit` (branded) + `everywhere`,
  `wholeQuestion`, `atSlot`, `inheritAtSlot`, `freeTags`, `thenState`, `asStateEdit`,
  `retagQuestion`; `TagWrite.shared` is now a `TagState`; `patterns.ts` gains
  `rowPatterns`, `everyTag`, and `patternWrites` matches every list; new
  `src/library/slotMatch.ts:slotsMatching`; editor `topicSync.ts:setQuestionTags` (edit
  travels) with `setQuestionTopics` kept as a wrapper; `sharedTopics.ts` state versions
  (`shownTagState`, `useShownTagState`; `openSharedTags` now returns `SharedState`s);
  `fromSelection.ts` `sharedTopic` reads `derivedTags`; `BankActions.tsx` Treat as new
  uses `withoutLineage`.
- 3ba03aa Tests: `src/model/tagSlots.test.ts` (new), lineage part roots, registry grep
  list + slot keys = part owners, `contentKeyFields` PART_FIELDS/SUB_PART_FIELDS,
  `contentKey` (copy with part roots/tags equal; corpus keys pinned 1qq8s3ssits /
  1ce5rxabj44, golden 1q717cu0w3v / 2fbxcvxebx unchanged), backwardCompat (round trip,
  corpus has none, v0.5.0-shape duplicate keeps them), sharedTags state resolution
  matrix, tagWrites matrix (reorder, extra part, same-shape fallback, sub-part replace,
  shadowed rename, legacy normalized in same save, no write on no-op).
- 17f2b97 WIP clipboard: `questionClipboardNodes`, `nodeTarget`, `highlightedNodes`;
  `questionClipboardHtml` now joins the nodes (suite green, explicit byte proof missing).

## Status at pause

`npm test` 257 files / 3144 tests green; `npm run typecheck` clean; `npm run lint` was
43 (baseline) before the test commit, not re-run since. `git diff --stat src/test/corpus`
empty. No schema bump, no KNOWN_KEYS change.

## Left to do (section H / I)

1. Clipboard proof test: `questionClipboardNodes(...).map(n => n.html).join('')` wrapped
   equals `questionClipboardHtml` for the acceptance worksheet (both modes), and no
   highlight/tag marker ever appears; `highlightedNodes` rule test.
2. `src/components/editor/topicTags.test.ts`: a question with part + sub-part tags and
   roots renders IR, `.docx` and clipboard byte-identically to the same question without.
3. `bankBackend.test.ts`: a malformed `slots` drops only its document.
4. `slotMatch.ts` test (`slotsMatching`: labels, empty when every leaf matches / no slots,
   題型 by type).
5. `patterns.test.ts`: `rowPatterns`, `everyTag`, `patternWrites` reaches a shadowed list.
6. `topicsAgree.test.ts`: two-part question C.ped (a) / C.intervention (b): coverage once
   under C, filters both, untagged 0, tray mix; a question with only (b) tagged is not
   untagged. (Rail "also in" is WP-B.)
7. `topicSync.test.ts`: `setQuestionTags` with `atSlot` reaches a reordered copy in
   another document; old wrapper on a partful question tags every part.
8. `sharedTopics.test.ts`: a legacy partful document (question-level topics) opens clean
   (no dirty, same object) and shows the derived list.
9. `bankDocs.test.ts`: `updateBankCopy` keeps the paper copy's part rootIds.
10. Docs: copy the scratchpad design to `docs/design/part-tags.md` (update per the
    deviations below; keep the user answers; cite only existing `path`/`path:symbol`,
    new files as plain text "(new)"), link from `docs/design/question-library.md`,
    update `SYSTEM_ARCHITECTURE.md` (question bank persistence bullets + registry hooks
    list + grep count 18 → 19) and `docs/CODEMAP.md` (tagSlots, slotMatch, new exports).
    `src/test/codemap.test.ts` must stay green.
11. Final: `npm test`, typecheck, lint (43), `npm run build`, `npm run samples`;
    lq-verify / cover-verify only if preview/export moved (clipboard refactor only).

## On resume: develop moved

develop is at 0b23943: the bank AI branch merged and already bumped INDEX_FORMAT to 6
(rows gained `missing` / `missingTeacher`) and regenerated rowsGolden.json. After
merging/rebasing develop, this branch's bump must become **7**, `isBankRow` must keep both
sets of new fields, and the golden must be regenerated
(`UPDATE_ROWS_GOLDEN=1 npm test -- src/library/rowsGolden`), then check the existing rows'
`contentKey` values did not move. Expect conflicts in `bankBackend.ts`, `indexer.ts`,
`types.ts`, `rowsGolden.*`, maybe `sharedTags.ts` (`withSharedTags` rebuilds rows: make
sure it carries `missing*` through, it spreads `rest` so it should).

## Deviations from the design (so far)

- `StateEdit` is a branded function (`stateEdit(fn)`, `isStateEdit`); plain `TagEdit`s
  are still accepted by `writeTags` / `withQuestionTags` / `setQuestionTags` and mean
  `wholeQuestion` (so `addTopics` etc. stay list edits and every UI caller compiles
  unchanged). `renamePatternEdit` / `removePatternEdit` stay `TagEdit`s: after
  normalization `wholeQuestion` of a rename or removal reaches every list, shadowed ones
  included (test pins it equal to `everywhere`).
- `TagSlotInfo` adds `leadInIds` (interlude block ids, separate from `blockIds`) so
  selection finds the part from its interlude but a highlight leaves it out.
- `withSlotTags` takes `ReadonlyMap<string, readonly unknown[] | undefined>` (lists keep
  entries this build cannot read), not `string[]`.
- `SlotRef = { key, path, shape: string }` (`shapeOf(slots)` = joined paths); extra
  `inheritAtSlot(ref)` for "Same as (a)".
- `stateFor(copy, shared)`: a copy without slots takes `derivedTags(shared)`; a winner
  without slots makes the copy's slots inherit (winner's whole state wins).
- "Treat as a new question" lives in `BankActions.tsx`, not `bankDocs.ts`; it now calls
  `lineage.ts:withoutLineage`.
- Clipboard additive API landed in WP-0 (the coordinator's brief), as
  `questionClipboardNodes` → `{ html, target? }[]`, plus `nodeTarget` and
  `highlightedNodes(targets, highlight)`; `model/tagSlots.ts:slotHighlightIds` gives the
  ids.

## Exact next step

Write the clipboard byte-identity test (item 1) in `src/export/clipboard.test.ts` or a new
`src/export/clipboardNodes.test.ts`, then work down items 2–9, then docs (10), then the
final checks (11). Merge develop (INDEX_FORMAT → 7) only when the coordinator says to.
