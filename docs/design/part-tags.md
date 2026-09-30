# Per-part topics and 題型: design

Status: WP-0 (model, registry hooks, library and sync core) built 2026-09-30 on
`feature/part-tags-core`; WP-A (the editor) on `feature/part-tags-editor`; WP-B (review page)
on `feature/part-tags-review`; WP-C,
WP-D next. Written against `develop` @ ba349fa,
so line numbers below are that commit's; § "As built" says where the code differs from
the proposal, and the code wins.
Binding user decisions: topics and 題型 live per part on a structured question with parts; the
parent's are derived; sub-parts share their part's by default and may have their own; free
tags stay on the whole question; the bank lists and inserts whole questions but says and
shows which part tests the topic; MCQ and a structured question with no parts are unchanged.

## 0. The shape of the answer in one paragraph

Part and sub-part objects gain two optional fields, `tags` (topic codes and 題型 only) and
`rootId` (the part's identity across copies, stamped by `copyQuestion`). A registry hook
`tagSlots(question)` enumerates the taggable places ("slots") with a stable key, a
structural path and a label "(a)(ii)"; MCQ does not implement it, a structured question with
no parts returns none. One pure model module (`src/model/tagSlots.ts`) turns a question into
a **tag state** (question list + each slot's own list), derives effective and question-level
sets, and writes a state back. `BankRow.tags` keeps its meaning ("the question's tags") but
becomes **derived**: free tags plus the union of every effective leaf set. So coverage, search,
filters, Fill, "Not used with", the cart and topic cards need no change. `BankRow.slots`
carries the per-part sets for the rail's "also in", the "(b)" marker and the preview highlight.
One `tagsAt` per question still decides newest-wins; the winning copy's whole state wins, mapped
onto each copy slot by slot (by part `rootId`, falling back to position only between copies of
the same shape). Writes stay one save per document; opening never writes.

---

## As built (WP-0) — the contracts the UI packages use

No schema bump, no `KNOWN_KEYS` change, `src/test/corpus/v1-published.json` untouched.
`INDEX_FORMAT` is **7** (the bank ✦ AI branch took 6 for `missing`/`missingTeacher`).

**Model** (`src/model/tagSlots.ts`, registry-free by name, in the `registry.test.ts` grep list):

| Export | Signature | Use |
|---|---|---|
| `TagState` | `{ tags: string[]; slots: SlotState[] }` | A question's lists: its own, each slot's own |
| `SlotState` | `{ key; path; label; parent?; leaf; own?: string[] }` | `own` absent = inherits |
| `SlotRef` | `{ key; path; shape: string }` | How an edit finds "(b)" in another copy |
| `questionTagSlots(q)` | `→ TagSlotInfo[]` | Slots with `blockIds`, `leadInIds`, `answerIds` (selection, highlight) |
| `tagStateOf(q)` | `→ TagState` | Stored state, strings only |
| `derivedTags(q \| state)` | `→ string[]` | Leaves' topics in print order, then free tags; no slots: the list as stored |
| `effectiveSlotTags(state)` | `→ Map<key, string[]>` | What each slot tests |
| `normalizeTagState`, `collapseTagState`, `sameTagState` | | § B move-down; § A2 storage rules; set equality |
| `stateFor(copy, shared)` | `→ TagState` | The shared state as one copy shows it |
| `withTagState(q, state)` | `→ Q` | Writes lists through `withSlotTags`; same object when unchanged |
| `matchSlots`, `findSlot`, `slotRef`, `sameShape`, `shapeOf` | | § D1 identity |
| `slotAtTarget(slots, editTargetKey)` | `→ slot \| undefined` | The Topic row's mode from the page selection (finest wins) |
| `slotHighlightIds(slots, keys)` | `→ Set<string>` | Ids to mark in the preview (a part with its sub-parts, never its lead-in) |
| `isTopicalTag(tag)` | | Topic code (grammar) or `::` tag: what a part may hold |

**Registry** (`src/registry/types.ts`): `tagSlots?(q): TagSlotInfo[]`,
`withSlotTags?(q, owns: ReadonlyMap<string, readonly unknown[] | undefined>): Q`
(lists may keep entries this build cannot read). `structuredType` implements both;
`mcqType` neither. **Lineage** (`src/model/lineage.ts`): `partRootOf(part)`,
`copyQuestion` stamps part roots, `withoutLineage(q)` (Treat as a new question, in
`src/components/editor/BankActions.tsx`).

**Writes** (`src/library/tagWrites.ts`): `StateEdit` is a branded function made by
`stateEdit(fn)`; `isStateEdit`, `asStateEdit`. Lifters: `everywhere(edit)`,
`wholeQuestion(edit)`, `atSlot(ref, edit)`, `inheritAtSlot(ref)` ("Same as (a)"),
`freeTags(edit)`, `thenState(...edits)`. **A plain `TagEdit` given to a write means
`wholeQuestion`**, so every existing caller (bank Edit topics, tag as you go, bulk Set
topic, 題型 rename/merge/delete) tags every part without a change. `changeEdit(before,
after)` carries only a list's change (the one-list Topic row on a question with parts).
`retagQuestion(q, edit, now, shared?)` is one question's write; `withQuestionTags` and
`writeTags` take `TagEdit | StateEdit` and `shared: TagState`; `TagWrite.shared` is a
`TagState` (from `stateOfRow`).

**Reads** (`src/library/sharedTags.ts`): `sharedState(copies)` (newest copy's whole state;
ties and no stamps: union list by list, normalized), `stateOfRow(row)`, `rowTagFields(state)`,
state-aware `withSharedTags` and `withRowTags`. `BankRow.tags` is derived; `BankRow.slots`
(`BankSlot`: `SlotState` + effective `tags`) and `ownTags` are new.
`src/library/slotMatch.ts:slotsMatching(row, { topic } | { pattern })` gives the leaf
slots for "(b) tests this" (empty when every leaf or none matches, or no slots).
`src/library/patterns.ts`: `rowPatterns(row, topic)`, `everyTag(row)`; `patternWrites`
matches every list.

**Editor** (`src/components/editor/topicSync.ts`): `setQuestionTags(questionId, edit,
deps?, shown?: TagState)`; `setQuestionTopics` stays as a one-list wrapper
(`matchEdit` without parts, `changeEdit` with them). `src/components/editor/sharedTopics.ts`:
`useShownTagState(q)`, `shownTagState(q, shared)`; `useShownTags` returns the derived list.

**Preview highlight** (`src/export/clipboard.ts`): `questionClipboardNodes(worksheet,
questionId, mode, images?, printedNumber?) → { html; target? }[]` (joined, exactly
`questionClipboardHtml`'s body, proven by test and byte-compared with the build before),
`nodeTarget(node)`, `highlightedNodes(targets, highlight)`.

**Deviations from the proposal below**
- `StateEdit` is branded so list edits keep working everywhere; `renamePatternEdit` /
  `removePatternEdit` stay list edits, since after normalizing `wholeQuestion` of a
  rename or removal reaches every list, shadowed ones included (a test pins it equal to
  `everywhere`).
- `TagSlotInfo.leadInIds` is separate from `blockIds`: the interlude selects its part but
  is not highlighted. `withSlotTags` takes `unknown[]` lists, not `string[]`.
- `stateFor`: a copy without slots takes the winner's derived list; a winner without
  slots makes the copy's slots inherit its list (the winner's whole state wins).
- The one-list Topic row on a question with parts sends `changeEdit`, not `matchEdit`,
  which would have copied one part's topics onto every other part.
- The clipboard additions landed in WP-0, not WP-B (WP-B then changed `questionPreview.ts`).
- The bank ✦ AI branch's Undo all (`src/library/sameCopies.ts`) now also ignores and keeps
  each part's `tags` and `rootId`, as it did the question's metadata.
- A slot key repeated inside one question (never made by this build) falls back to the
  part's own id, so every slot stays addressable.

## As built (WP-A) — the editor

- **Topic row** (`src/components/editor/Inspector.tsx`): a question with slots gets
  `PartTopics.tsx`, anything else today's `TopicRow`. The mode is
  `partTopicView.ts:topicMode(slots, selectedTargetKey, focus)`: `slotAtTarget` on the
  page's click, overridden by a part picked in the row (or "Whole question") until the
  page's selection moves. Every write is one `StateEdit` through `setQuestionTags(id,
  edit, deps, shownState)`.
  - **Whole question**: one line per part (`partTopicLines`), a sub-part only when it has
    its own ("(ii) … · its own"), "No topic yet" on a part testing nothing, 題型 shown as
    "· 題型 name". Older whole-question topics read "Set on the whole question, so every
    part has them". "Add to every part" = `wholeQuestion(addTopics)`; the picker takes
    topics only. Free tags on a "Tags" line (`freeTags`), "+ Tag" types one; a topic
    typed there is refused.
  - **Part**: `TopicRow` titled "Topics for (b)", list edits as `atSlot(ref,
    matchEdit(shown, next))`, the 題型 picker per topic writes that part; typed free text
    is refused (`noFreeTag`). Says when the list came from the whole question, and which
    sub-parts have their own.
  - **Sub-part**: a `Segmented` "Same as (a)" / "Its own". "Its own" opens the list
    seeded with the part's set and writes nothing until a change; "Same as (a)" on an
    own list is `inheritAtSlot`. Removing the last own topic returns to "Same as (a)"
    (A2: an empty own list is absent).
- `TopicRow.tsx` gained `TopicPicker` (shared by both rows) and optional `title`, `hint`,
  `empty`, `noFreeTag`, `intro`, `startOpen`; its default render is unchanged.
- **Outline** (`Outline.tsx`, `partTopicView.ts:outlineTagLine`): when the parts test
  different things the line reads "(a) Law of demand (b) Efficiency" in the same 72px, and
  the tooltip lists every part ("(c) No topic yet" included) and the tags. The MCQ icon
  literal in the add menu is left as it was.
- **題庫 tab** (`BankTab.tsx`, `BankRow.tsx` `partsFor`): with a Topic filter, a row whose
  question has only some parts testing it leads its meta with "(b) Efficiency". The tab
  has no 題型 filter, so only topics are matched there.
- The pure view helpers are `src/components/editor/partTopicView.ts` (not
  `partTopics.ts`: on a case-insensitive disk it would shadow `PartTopics.tsx`).

## As built (WP-B) — the review page

- **Rail entries** (`src/components/bank/page/bankScreen.ts`): `RailSection.entries` /
  `RailPart.entries` replace `groups`. A `RailEntry` is `{ key: 'section|part|rootId', group,
  query?, alsoIn }`; `query` is what its heading names (`{ topic }`, General's coarse code,
  a 題型 part's `{ pattern }`; absent under "No topic"). A question is listed under every
  sub-topic (coarse topic on All questions and search) and every 題型 of a sub-topic it
  carries. MCQs with two sub-topics are listed twice as well, the same rule. `alsoIn` names the
  other headings: another 題型 of the same section by name, another section by its label.
- **Focus is an entry**: `QuestionBankScreen` keeps `focusEntry` beside `focusKey`;
  `entryIndex(order, rootId, entryKey)` keeps the remembered entry while it lists the
  question, else the question's first. ↑ ↓, "Question n of N" and section counts go by
  entries; the rail header ("30 questions") and its "in your list" count distinct
  questions. Rows carry `data-rail-entry` (and keep `data-rail-root`).
- **Words**: `partsTesting(row, query)` wraps `slotsMatching`, a part standing for its
  sub-parts when all match ("(a)", not "(a)(i) and (a)(ii)"). Rail row line
  `testsThisText` + `alsoInText` ("Part (a)(ii) tests this · Also in Law of demand"); the
  stage line above the paper `testsWhatText` ("Part (b) tests Market intervention", or the
  題型 name under a 題型 heading); the Topics fact goes part by part (`topicsByPart`) when
  the parts differ.
- **Highlight**: `questionPreviewHtml(..., highlight: slotKeys)` joins
  `questionClipboardNodes` and wraps each highlighted run in `<div data-part-mark>` (a
  green wash and margin rule drawn with shadows, so nothing moves). No highlight takes the
  old `questionClipboardHtml` path, byte for byte (test). ✦ review marks are inline spans
  inside it and keep their own colour. `PaperPreview` takes `highlight`; Tag as you go can
  pass it for the part strip.
- Cart labels (`bankCart.ts:cartTopicLabel`) read the derived list in print order, so a
  partful question reads by its first part's topic ("C · Law of demand +2"); no change.

---

## A. Stored shape

### A1. Fields (all optional, additive, no schema bump)

`src/model/types.ts`:

```ts
export interface QuestionPart {            // types.ts:455
  ...
  /**
   * Topic codes and 題型 this part tests (`model/tagSlots.ts`). Never printed, never content
   * (`contentKey` ignores it). Absent = none of its own: the part takes the question's older
   * whole-question topics, if any (§ B). Free tags never live here; they stay on the question.
   */
  tags?: string[];
  /**
   * This part's id in the question's first ancestor (`copyQuestion` stamps it). Absent = the
   * part is its own root (`id`). How copies agree on "part (b)" whatever was reordered. Never
   * printed; `contentKey` ignores it.
   */
  rootId?: string;
}
export interface QuestionSubPart {         // types.ts:408
  ...
  /** Its own topic codes and 題型; absent = the same as its part's. Replaces, never adds. */
  tags?: string[];
  /** As `QuestionPart.rootId`. */
  rootId?: string;
}
```

`Question.tags` (types.ts:352) on a question **with slots** holds free tags (and system `@`
tags) only, once written by this build. `Question.tagsAt` (types.ts:358) is the **one stamp
for all of the question's tag lists** (question + every part + every sub-part).

### A2. Sub-part own set: replace, not add (recommendation)

A sub-part's own list **replaces** its part's. The user's mock, "(a) C" over "(ii) D ·
Elasticity ← its own", reads as "(ii) is about D", not "(ii) is about C and D". Reasons:

- With *add*, a teacher can never say "(ii) does not test C" without taking C off (a) and
  re-adding it to (i) by hand: the common case (one sub-part drifts to another topic) costs
  the most.
- With *replace*, "C and also D" is one extra tick: "Give (ii) its own topics" opens seeded
  with (a)'s set, and the teacher adds D.
- Coverage stays honest: a topic counts for a question only if some leaf actually tests it.

Rules (pure, in `src/model/tagSlots.ts`):

- effective(part without sub-parts) = part.own ?? legacyTopicals(question) (§ B)
- effective(part with sub-parts, as the default) = part.own ?? legacyTopicals(question)
- effective(sub-part) = sub.own (when non-empty) ?? effective(its part)
- **Derived question set** = unique([ ...union of effective(leaf) in print order,
  ...question-level free/system tags ]). A leaf is a part without sub-parts, or a sub-part.
  A part's own list that no leaf inherits (every sub-part has its own) is kept in storage but
  does not count (shadowed; see E4 for maintenance edits that still reach it).
- An empty own list is stored as absent (the § "A field cleared to nothing stores nothing"
  convention). A sub-part own list equal as a set to its part's effective list is stored as
  absent on write (it says nothing new). So "no topic for (ii) only" cannot be expressed;
  accepted (rare; ask the user if they disagree, § Open questions).
- One 題型 per sub-topic **per slot** (was: per question). `withPattern` (model/patterns.ts:143)
  already works on one list.

### A3. Why one `tagsAt` per question

- The resolver stays one rule: the copy stamped last gives the whole tag state. A per-slot
  stamp would let copy X win (a) and copy Y win (b), a merge no teacher made, and doubles the
  stamp surface in rows and writes.
- A Topic-row edit is one change to one question; every write already adopts the shared
  state first (`TagWrite.shared`), so edits to (a) then (b) compose rather than race.
- Cost: two devices with skewed clocks editing different parts can lose one part's change.
  The same trade already accepted in § One tag set ("Clock skew is accepted").

### A4. Load path: nothing strips part keys

- `migrate` looks at top-level keys only (migrations.ts:105-109, KNOWN_KEYS at :44-73); parts
  pass through. **No KNOWN_KEYS change.**
- Every part rewrite spreads: `patchPart` (StructuredEditorPanel.tsx:222-223), `patch`
  (textSlots.ts:123-131) used by `mapTexts`/`mapAnswers` (structured.ts:377-440),
  `mapAllBlocks` sites in edits.ts:491/811/1514/1616. `dedupeIds` renews ids only.
- **v0.5.0 keeps them**: its `withFreshIds` spreads parts and sub-parts
  (`git show v0.5.0:src/store/worksheetStore.ts` :513-527) and its `patchPart` spreads. A
  v0.5.0 Duplicate keeps `rootId`/`tags` verbatim, which is what `freshIds` does here too.
- **contentKey must learn part-level metadata.** Today it deletes top-level `IGNORED` only
  (contentKey.ts:5, :12-17), so a part `tags` or `rootId` would split identical copies into
  false versions, and every copy made after this ships would differ from its original (its
  parts carry `rootId`). Change: after blanking ids, for every `space: 'part'` owner from
  `questionIdOwners` delete `IGNORED_PART = ['tags', 'rootId']`. Golden `contentKey` values do
  not move (absent keys), so no copy regroups.
- `contentKeyFields.test.ts` (:22-42): add `PART_FIELDS: Record<keyof QuestionPart, …>` and
  `SUB_PART_FIELDS: Record<keyof QuestionSubPart, …>` (typecheck forces every key), assert
  `IGNORED_PART` equals their metadata keys, and the runtime check walks every part and
  sub-part of the corpus, the acceptance fixture and `create()` output.

---

## B. Existing develop data (question-level topics on a question with parts)

Develop builds wrote topic codes and 題型 on `Question.tags` of structured questions with parts
(the golden fixture itself does: rowsGolden.test.ts `q-lq`, tags `['C.equilibrium']` with one
part).

**Read rule (no write on open):** on a question with slots, the question-level *topical* tags
(`isTopicCode(tag) || tag.includes('::')`; system `@` tags are not topical) are the default
for every part without its own list. It is one line of the inheritance chain above, not a
special case, and it also covers a live case: a teacher tags an essay question (no parts,
question-level per decision 5), then adds parts; every part now shows the essay's topics.

**Moved down on the first write, never on open.** Every write to a question with slots
normalizes before applying the edit (`withTagState`): each top-level part with no own list
gets the question's topical tags as its own, then the question list keeps only free and system
tags. One save per document, stamped with the write's `now`. Unreached copies keep the old
shape with an older stamp and lose (§ D). The Topic row and Outline show the inherited set
exactly as if it were each part's own; no notice is needed.

**Reverse case:** deleting every part of a question drops the parts' lists with them; what
remains is the question list (free tags). Accepted: deleting parts deletes their content. If
the user minds, the store's "delete last part" can fold the derived set into `Question.tags`
(small, optional, one place: StructuredEditorPanel's `Delete part`).

**Other builds:**
- v0.5.0 has no bank and no tag UI; it keeps both new fields (A4). A document it saves keeps
  them.
- A future build reads the same fields; since part lists are strings read through
  `stringTags`, a later build's non-string entries are kept and never read (same rule as
  question-level).
- **No schema bump**: additive nested optional fields; nothing released holds them; a bump
  would make every released build open new documents read-only (§ Schema evolution, the
  `classTag` precedent). `src/test/corpus/v1-published.json` is untouched; its questions have
  no part `tags`/`rootId`, and a test asserts that.

---

## C. Registry: no type branching

`src/registry/types.ts` (after `qualityView?`, :83):

```ts
/** One place in a question that carries its own topics and 題型, in print order. */
export interface TagSlotInfo {
  /** Stable across copies: `rootId ?? id` of the part or sub-part (`partRootOf`). */
  key: string;
  /** Position, for copies of the same shape only: "0", "0.1". */
  path: string;
  /** How it reads: "(a)", "(a)(ii)". */
  label: string;
  /** The enclosing slot's key (a sub-part's part); absent at the top. */
  parent?: string;
  /** A part without sub-parts, or a sub-part: counts toward the derived set. */
  leaf: boolean;
  /** Stored own list as found (may hold non-strings); absent = inherits. */
  own?: unknown[];
  /** Blocks it owns (its `blocks`, `blocksBefore`, answer diagram): selection and highlight. */
  blockIds: string[];
  /** Ids an answer target names (`partAnswer`/`subPartAnswer`). */
  answerIds: string[];
}

/**
 * Where this type's questions carry topics per place (§ question-library, Per-part topics).
 * Absent, or [] for a question: the question's own `tags` hold its topics (MCQ, a structured
 * question with no parts).
 */
tagSlots?: (question: Q) => TagSlotInfo[];
/**
 * The question with each listed slot's own list set (`undefined` removes it). Slots not
 * named are untouched; the same object when nothing changes. Only `tags` is written.
 */
withSlotTags?: (question: Q, owns: ReadonlyMap<string, string[] | undefined>) => Q;
```

- `structuredType` (structured.ts:551) implements both with `partLabel`/`subPartLabel`
  (numbering.ts:201-202) and `partRootOf` from `model/lineage.ts`. `mcqType` implements
  neither.
- Shared code reaches slots only through `src/model/tagSlots.ts` (new):
  `questionTagSlots(q)`, `tagStateOf(q) → TagState`, `effectiveSlotTags(state)`,
  `derivedTags(q | state)`, `withTagState(q, state)` (normalize per B, collapse per A2, write
  via the hook, question list via spread), `slotAtTarget(slots, editTargetKey)` (block and
  answer ids; finest wins, a sub-part before its part), `isTopicalTag`, `sameShape`,
  `matchSlots` (§ D). Add `src/model/tagSlots.ts` to the grep list in
  `registry.test.ts:141-162`; `src/library` is already guarded (`noTypeBranching.test.ts`).
- **Part roots are stamped structurally, not by a hook:** `copyQuestion` (lineage.ts:99-113)
  walks `questionIdOwners` (lineage.ts:53-71) of the source and of the `freshIds` result in
  parallel (same order, same clone) and sets `copy.rootId = partRootOf(source)` for every
  `space: 'part'` owner. This keeps lineage.ts free of the registry (as today) and gives any
  future type with `parts` the same behaviour. A test pins that every `tagSlots` key of a
  copy equals the source's key.
- `freshIds` (in-document Duplicate) keeps `rootId` verbatim, as it keeps `lineage`: a
  duplicate of a copy shares its parts' keys; a duplicate of an original becomes a new root
  (new question root, so part keys are scoped away). "Treat as a new question" drops
  `lineage`; also drop part `rootId`s there for tidiness (harmless either way: keys are
  matched within one root only).
- `updateBankCopy` (bankDocs.ts:179-199): `freshIds(question)` keeps the paper copy's part
  `rootId`s, which name the bank's parts, so keys stay stable. No change; add a test.

---

## D. Across copies (identity and newest-wins)

### D1. Slot identity: part `rootId`, then position between same-shape copies

Chosen: **a part-level lineage id (`rootId`) preserved on copy, with a positional fallback
only between copies of identical shape**. `matchSlots(a, b)`:

1. Pair slots with the same key (`rootId ?? id`).
2. If `sameShape(a, b)` (same part count, same sub-part count per part), pair the leftovers by
   `path`. Otherwise leftovers stay unpaired.

| Approach | Reorder in one copy | Extra/removed part | Develop copies made before this ships | Cost |
|---|---|---|---|---|
| Path only | tags follow the position: silently wrong | all later parts shift: wrong | works | none |
| Part `rootId` only | right | right | never share (their parts have no `rootId`) | 2 optional fields, copy stamp |
| **`rootId` + same-shape path fallback** | right | right; the new part is its own | share while identical in shape | + one pure function |

The fallback also pairs a part the teacher deleted and retyped in the same place, which is
what they mean. It never pairs across a structural edit of an unrooted copy (it could not do
so safely).

### D2. Resolution (`src/library/sharedTags.ts`, generalised)

Per root, over every copy's tag state (published rows for other documents, live questions for
the open one):

- **Winner**: the copy with the newest `tagsAt` (unchanged ranking: unstamped oldest,
  unreadable = none). Tied newest: their union, list by list over matched slots. No stamps:
  the union of all, list by list (as today's "no stamp: union").
- **Each copy's shown state** = the winner's question list; for each of the copy's slots, the
  winner's own list of the matched slot (absent there = absent here), else the copy's own
  (the winner has no such part: an edited version's extra part keeps its own).
- The copy's derived `tags` and `searchText` follow from its shown state
  (`withSharedTags`, sharedTags.ts:88-102, keeps its "swap the tag words" logic, fed the
  derived lists).

### D3. Writes (`src/library/tagWrites.ts`)

- `TagEdit` (list → list, :31) stays for list edits. New `StateEdit = (state: TagState) =>
  TagState`, and lifters:
  - `everywhere(edit)`: the question list and every own list, shadowed ones included:
    `removeTopics`, `renamePatternEdit`, `removePatternEdit` (library/patterns.ts).
  - `wholeQuestion(edit)`: no slots: the question list (today's behaviour). With slots: free
    tags stay on the question; every top-level part's own list := topicals of
    edit(effective(part)); every sub-part *own* list := edit(own); inheriting sub-parts keep
    inheriting. Used by `addTopics`, `replaceTopics`, `bulkTopicEdit`, `setPatternsEdit`,
    tag-as-you-go. This is "tag the whole question at once = every part, then refine".
  - `atSlot(ref, edit)`, `ref = { key, path, shape }`: the one matched slot (§ D1 against
    `shape`), its effective list in, own list out. A copy with no match is left unchanged
    (and, like today, is still stamped only if its state changed or the shared state did).
  - `freeTags(edit)`: the question list's free tags only (the parent Topic row's tag entry).
- `withQuestionTags` (:110-141) reads `tagStateOf`, adopts `shared` (now a `TagState`, the
  row's resolved state for that copy), normalizes (§ B), applies, writes `withTagState`,
  stamps as today (`decided` = the shared state changed). `writeTags` (:195-234) keeps one
  load and one save per document and the newer-build refusal. `TagWrite.shared` becomes
  `{ tags; slots? }` from the published row.
- Existing exported edit names keep their meaning as **whole-question** `StateEdit`s, so
  every current caller compiles and behaves as "applies to every part".
- `withRowTags` (sharedTags.ts:125-133): a copy taken from the bank gets the row's resolved
  question list and slot lists (by the picked copy's own keys) and the shared stamp; then
  `copyQuestion` stamps part roots, so the new copy's keys equal the source's.
- Editor sync (`topicSync.ts:46-88`): `setQuestionTopics` becomes
  `setQuestionTags(questionId, edit: StateEdit, deps, shown: TagState)`: the open copy
  through `updateQuestion` (one ⌘Z, one `tagsAt`), then `otherCopyWrites` with the same
  `StateEdit` against each copy's resolved state. Passing the edit (not a before/after
  diff via `matchEdit`) is what lets "(b)" land on the right part of a reordered copy.
  `matchEdit` stays for the list inside `atSlot`.
- "Opening never changes tags" holds: display resolves (`sharedTopics.ts:26-56`,
  generalised to states); only an edit writes.

---

## E. Index and bank

### E1. `BankRow` (library/types.ts:11-49)

```ts
/** The question's topics: derived. Free tags plus every part's effective topics (print order). */
tags: string[];                                   // meaning kept, computation changes
tagsAt?: string;
/** Per-part topics, print order; absent for a question tagged as a whole (MCQ, no parts). */
slots?: BankSlot[];
/** With `slots`: the question's own list (free tags, and older whole-question topics). */
ownTags?: string[];

export interface BankSlot {
  key: string; path: string; label: string; parent?: string; leaf: boolean;
  /** Its own list (strings); absent = inherits. */
  own?: string[];
  /** Effective list (what it tests). */
  tags: string[];
}
```

- `rowOf` (indexer.ts:47-85): `tags = derivedTags(state)`; `slots`, `ownTags` when the type
  has slots; `searchText` tag words from the derived list (unchanged mechanism). Block ids are
  not stored: the preview reads them from the loaded document (it loads it anyway,
  `useOwningDocument`).
- `isBankRow` (bankBackend.ts:51-75): validate `slots` (array of objects with string
  key/path/label, boolean leaf, string-array tags/own) and `ownTags`; a bad one costs its
  document only (existing rule).
- `INDEX_FORMAT` 5 → **6** (built as 7, after the ✦ AI branch took 6) (bankBackend.ts:34). Regenerate `rowsGolden.json`; extend the
  golden DOC with: a partful question with part tags and a sub-part own list and part
  `rootId`s, and keep `q-lq` as the legacy shape (question-level topic on a partful question)
  so its derived row is pinned.

### E2. Readers that need nothing (derived `tags` keeps them right)

`searchRows` (search.ts:13-35), `pickFill` incl. `inexact` (fill.ts:22-54), coverage /
`hasTopic` / `coarseCodes` / `traySummary` (bankPage.ts:26-83, :340-356; counts are distinct
`rootId`s, so a question counts once per topic), `filterRows`, `listPatterns` counts,
`usedWith`/"Not used with", `tabFilters.visibleGroups`, `BankRow.tsx` tag line, cart
(`bankCart.ts`, SelectionTray: no tag display; mix via `traySummary`), `groupRows`/versions
(contentKey, A4).

### E3. Readers that change

- **Rail, "also in"** (`bankScreen.ts:142-203`): today "a question sits once, under its first
  matching tag". New: under a coarse topic, a group is listed under **every** fine code in its
  derived tags; under all/search, under every coarse topic; inside a sub-topic, under every
  題型 it carries for that sub-topic (parts may differ). Sections hold entries
  `{ group, slots: string[] /* labels matching this heading */, alsoIn: string[] }`.
  `railOrder` walks entries as drawn; section counts count entries; the header "Question n
  of N" counts entries (what ↑ ↓ steps through). Topic cards and coverage stay distinct.
  React keys and `data-rail-root` (ReviewPage.tsx:178-180) become `section|part|root`; focus
  becomes an entry, so the same question focused under two headings highlights different parts.
- **"(b) tests this"**: pure `slotsMatching(row, { topic } | { pattern })` in
  `src/library/sharedTags.ts` (or a new `slotMatch.ts`): labels of leaf slots whose effective
  list matches (`matchesTopic` for codes, `samePattern` for 題型). Empty when every leaf
  matches or the row has no slots (then nothing is said). Shown: rail row meta ("(b) · LQ ·
  8 marks · Paper · Q4"), the stage line above the preview ("(b) tests Market intervention"),
  the editor 題庫 tab row when its Topic filter is set, the stage facts (Topics by part).
- **Preview highlight**: `questionPreviewHtml` (questionPreview.ts:50-71) takes `highlight?:
  ReadonlySet<string>` (block ids, from the loaded question's `tagSlots` of the matching
  slots and their inheriting sub-parts). `clipboard.ts` gains an additive export returning
  per-node HTML (`questionClipboardNodes`), leaving `questionClipboardHtml` (:432-454) byte
  for byte. The preview wraps runs of nodes: a node whose IR `target` names a highlighted
  block starts or continues a run; a node without a target belongs to the node before it; a
  node naming another slot's block ends it. The interlude (`blocksBefore`) is not marked
  (context, not the part). Style in `PREVIEW_CSS`: a light highlighter tint and a thin left
  rule, literal hex like the rest of the sheet CSS. Not a hover effect.
- `rowHasPattern` / `rowPattern` (library/patterns.ts:36-50): `rowPatterns(row, topic)`
  returns every name (parts may differ); `patternWrites` (:139-146) and `copyWrites` for
  removal match against **every** list (`everyTag(row)` = derived ∪ ownTags ∪ each own), so
  a rename or delete also reaches a shadowed part list.
- `pickerPatterns` initial (QuestionBankScreen.tsx:444-456) and the Edit dialog read slot
  state (F3).
- `worksheetFromPicks`' `sharedTopic` (fromSelection.ts:66-71) reads `derivedTags(question)`.

---

## F. Editing UI

Rules kept: the sidebar is an inspector (the page's selection drives it, no second editor);
hover changes colour only; plain words; no em dashes in teacher text.

### F1. Edit panel Topic row (Inspector.tsx:239-241, :364-381; TopicRow.tsx)

The Topic row stays in the Inspector after the type's panel (shared, no branch). It reads
`questionTagSlots(selected)`; with none, it is today's row. With slots, a new
`PartTopics.tsx` wraps `TopicRow` in three modes. Which mode: `slotAtTarget(slots,
selectedTargetKey)` (the page's click; StructuredEditorPanel.tsx:41-67 already maps keys the
same way), overridable by clicking a part label in the row (local state, reset on selection
change).

- **Question** (stem or header selected):
  ```
  Topics 課題 · by part · never printed        Add to every part
  (a)  C · Price elasticity of demand
       (ii) D · Perfect and imperfect competition · its own
  (b)  C · Market intervention · 題型 Price ceiling
  (c)  No topic yet
  Tags  mock 2025 ×   + Tag
  ```
  Part labels are buttons (focus that part's mode). "Add to every part" = `wholeQuestion
  (addTopics)`. The free-tag entry moves here (`freeTags` edit); topics typed there are
  refused with the existing grammar messages plus "Pick a part to add a topic".
- **Part** selected: "Topics for (b)" with today's list, 題型 pickers and Add topic, writing
  `atSlot(b)`. A quiet "Whole question" link returns.
- **Sub-part** selected, inheriting: "Topics for (a)(ii)", "Same as (a): C · Price elasticity
  of demand", button "Give (ii) its own topics" (opens the picker seeded with (a)'s set;
  nothing is written until a change). With its own: the list plus "Same as (a)" (clears own).
- The note line ("Also updated in 2 other worksheets.") and `copiesMessage` are unchanged.

### F2. Outline tag line (Outline.tsx:299, :400-406)

Shows the derived set (unchanged look). Tooltip becomes per part: "(a) Price elasticity of
demand\n(b) Market intervention · Price ceiling". Replace the `definition.id === 'mcq'` icon
literal at :797 while there (not required; Outline is not in a guard list).

### F3. Bank tagging (QuestionBankScreen.tsx, TopicPickerDialog.tsx, TagAsYouGo.tsx)

- **Edit topics** (dialog at :816-833): for a row with slots, the dialog gains a narrow part
  column: "Whole question", "(a)", "(a)(i)", "(a)(ii)", "(b)", each with a count of topics.
  "Whole question" ticks apply to every part (`wholeQuestion(replaceTopics)`), then picking
  "(b)" refines it. Sub-parts show "Same as (a)" until given their own. One confirm = one
  `StateEdit` composed from the per-slot choices, one write per document. The preview beside
  it is not needed; the part column lists each part's first words.
- **Tag as you go** (:398-431): keys 1 to 6 tag the whole question as today (every part). A
  strip "Whole question · (a) · (b) · (c)" above the keys, and ← → to move along it, let the
  teacher refine one part before Save; the preview highlights the chosen part. Undo takes
  back exactly what the save wrote (store the `StateEdit`'s inverse as today's `codes`, per
  slot). "Untagged" means no leaf has a topic.
- **Bulk Set topic** (:835-876): stays whole-question (Add, Replace apply to every part;
  Remove takes the topic off every list). Description adds: "On a question with parts, every
  part changes. Refine one part in Edit topics."
- **題型 per part**: the same `PatternPicker` under each ticked sub-topic, per slot; the list
  is the question's type (LQ) as today.
- **PatternsPage** rename, merge, delete: no UI change; the edits are `everywhere`, and
  `patternWrites` matches every list (E3), so part tags are reached. Counts stay distinct
  questions.
- **Editor 題庫 tab rows** (BankRow.tsx:72, :132-134): with a Topic filter set, prefix the
  tag line with the matching parts: "(b) Market intervention". Insert and drag stay whole.

---

## G. Work in flight: ✦ AI translation + Check terms on the review page

- **contentKey is the join**: identical copies share a result by `contentKey`. WP-0 must make
  `contentKey` ignore part `tags` and `rootId` (A4) **in the same change that starts stamping
  part `rootId`s**, or every copy made afterwards stops matching its original and the AI
  work stops being shared. The golden `contentKey` values must not move (test).
- **Writing results into copies**: if the AI agent writes translated text into every copy's
  document, it must spread parts (it will, via `mapTexts`/`patch`) and should go through the
  screen's single write queue (`writes.current`, QuestionBankScreen.tsx:330-339) so a tag
  write and a translation write never load the same document at once.
- **Layout contact**: both features add to the Stage (ReviewPage.tsx:281-435) near
  `PaperPreview`. WP-B here adds one prop (`highlight`) to `PaperPreview`/`questionPreview`
  and one line above the preview. Merge the AI branch first, then rebase WP-B; keep the
  highlight prop independent of any AI diff view.
- `questionTexts` roles are unaffected (tags are not `BiText`; keep them out of
  `textSlots.ts`, as the design doc already says for question tags).

---

## H. Tests and compatibility guards

Model and storage:
- `backwardCompat.test.ts`: part and sub-part `tags` and `rootId` survive load, save, load;
  the corpus holds none of them (`not.toMatch` at part level, as :181/:194 do for questions);
  the corpus file is untouched.
- `contentKeyFields.test.ts`: `PART_FIELDS`, `SUB_PART_FIELDS`, `IGNORED_PART` (A4).
- `contentKey.test.ts`: a copy (with part roots) of an original, and a copy with part tags,
  equal the original; golden values unchanged.
- `lineage.test.ts`: `copyQuestion` stamps part and sub-part `rootId` = source key; copy of a
  copy keeps it; `freshIds` keeps verbatim; MCQ gains nothing; Treat as new drops them.
- `tagSlots.test.ts` (new): replace semantics; derived = union of effective leaves plus free
  tags, print order; legacy question-level topicals inherited; normalization moves them down
  on write and not on read; sub-part own equal to part collapses; empty own stored absent;
  non-string entries kept; no slots for MCQ and for a structured question without parts;
  `slotAtTarget` finest wins.
- `registry.test.ts`: `src/model/tagSlots.ts` in the shared grep list; every type's
  `tagSlots` keys equal `space: 'part'` owners' `rootId ?? id`.

Library:
- `sharedTags.test.ts`: winner's whole state; key match; path fallback only for same shape;
  a reordered copy maps by key; an extra part in an edited version keeps its own; ties give
  per-slot union; no stamps give union.
- `tagWrites.test.ts`: `atSlot` lands on the right part of a reordered copy and skips a copy
  without that part; `wholeQuestion(addTopics)` writes every part, not the question list;
  free tags stay on the question; `everywhere(rename)` reaches a shadowed part list; one save
  per document; newer-build refusal unchanged; a legacy question is normalized in the same
  save.
- `rowsGolden.test.ts`: INDEX_FORMAT 7 as built, extended DOC (E1). `bankBackend.test.ts`: a malformed
  `slots` drops only its document.
- `topicsAgree.test.ts`: add a two-part question tagged C.ped on (a) and C.intervention on
  (b): coverage counts it once under C, rail lists it under both sub-topics with "also in",
  filters and tray agree.
- `bankScreen.test.ts`: also-in entries, multiple 題型 under one sub-topic, counts.
- `slotsMatching` labels; nothing said when every part matches.

Never printed:
- Extend `src/components/editor/topicTags.test.ts`: a question with part and sub-part tags
  and roots renders IR, `.docx` and clipboard byte-identically to the same question without
  them.
- The preview highlight never appears in `questionClipboardHtml` output (byte test) and
  `questionClipboardNodes` joined equals it.
- Opening a document whose partful question has question-level topics leaves it unchanged
  (no `withQuestionTags` call; the open-save writes it as loaded).

**M5 frozen bank fixtures (STATUS.md:87) must add**: a structured question with part `tags`,
a sub-part own list, part and sub-part `rootId`s, question-level free tags only; a copy pair
sharing part roots across two documents; one legacy-shaped question (question-level topics on
a question with parts) since develop data holds that shape; `INDEX_FORMAT` 7 rows.

---

## I. Work breakdown

**WP-0 · Model, registry hooks, library core (L). Built 2026-09-30 (§ As built).** Merged first; every other package builds
on its contracts only.
- Files: `src/model/types.ts` (fields + docs), `src/model/lineage.ts` (`partRootOf`,
  `copyQuestion` part roots), `src/model/tagSlots.ts` (new), `src/registry/types.ts`,
  `src/registry/structured.ts` (hooks), `src/library/contentKey.ts` (+ fields test),
  `src/library/types.ts`, `src/library/indexer.ts`, `src/library/bankBackend.ts`
  (`isBankRow`, INDEX_FORMAT 7), `src/library/rowsGolden.*`, `src/library/sharedTags.ts`
  (state resolution, `withRowTags`, `slotsMatching`), `src/library/tagWrites.ts`
  (`StateEdit`, lifters), `src/library/patterns.ts` (`rowPatterns`, every-list matching),
  `src/library/bankDocs.ts` (Treat as new drops part roots),
  `src/components/editor/topicSync.ts` + `sharedTopics.ts` (state versions; keep the old
  names as thin wrappers until WP-A lands), `fromSelection.ts:71`
  (`derivedTags`), tests in H (model, library, never-printed).
- Docs: `docs/design/question-library.md` new § "Per-part topics" (A2 rules, B, D1, one
  stamp), § Model additions; `SYSTEM_ARCHITECTURE.md` § Persistence bullets (one tag set per
  question now per state; contentKey part metadata); `docs/CODEMAP.md` entries;
  `CHANGELOG.md` only with the UI.
- Verify: `npm test`, `npm run typecheck`, `npm run lint` (no new problems); the corpus
  untouched (`git diff --stat src/test/corpus` empty); rowsGolden regenerated after the bump.

Then in parallel, each cut from WP-0:

**WP-A · Editor (M).** `Inspector.tsx`, `TopicRow.tsx`, new `PartTopics.tsx`, `Outline.tsx`
(tooltip), `src/components/bank/BankRow.tsx` + `BankTab.tsx` ("(b)" on tab rows).
Verify: Chromium + WebKit screenshots (`scripts/shot.mjs`) of the three modes at 1024;
`.docx` still exports and is leak-free (`npm run samples`); ⌘Z after a part edit restores
the open copy; a legacy document opens clean (not dirty).

**WP-B · Review page (M).** `bankScreen.ts` (`railSections` entries, also in),
`ReviewPage.tsx` (rail rows, stage line, facts by part), `PaperPreview.tsx`,
`questionPreview.ts`, `src/export/clipboard.ts` (additive `questionClipboardNodes`), the
review-level focus state in `QuestionBankScreen.tsx`. Rebase after the ✦ AI branch.
Verify: screenshots with a question in two sub-topics; ↑ ↓ through both entries; highlight
moves with the heading; clipboard bytes unchanged (test); `cover-verify`/`lq-verify` not
needed (no page change).

**WP-C · Bank tagging (M).** `TopicPickerDialog.tsx` (part column), `TagAsYouGo.tsx` (part
strip), the dialog and tag-as-you-go blocks of `QuestionBankScreen.tsx` (:398-481,
:816-891), bulk text. Merge after WP-B (both touch `QuestionBankScreen.tsx`, different
regions). Verify: tag a three-part question whole, refine (b), undo; bulk Add on a mix of MCQ
and LQ; rename a 題型 used only on a part; Chromium + WebKit.

**WP-D · Release notes and docs sweep (S).** `CHANGELOG.md` (teacher words: "Long questions
take topics per part. The bank shows which part tests a topic."), `docs/GLOSSARY.md` (slot,
its own), `docs/STATUS.md` (M5 list), `codemap.test` green. Can ride with the last UI merge.

## Open questions for the user (few, in teacher words)

1. When a sub-part like (ii) has its own topics, should it stop counting under (a)'s
   topics? Recommended: yes, (ii) then tests only what you gave it; tick (a)'s topic too if
   it tests both.
2. "Set topic" on several questions at once: for a long question, should it apply to every
   part? Recommended: yes, then fix single parts in Edit topics.
3. Tag as you go: should a long question leave the untagged list as soon as any part has a
   topic? Recommended: yes; parts with none show "No topic yet" in the editor.

## User answers to the open questions (2026-09-30)

1. A sub-part's own topics **replace** its part's: (ii) with its own list stops counting under (a)'s topics.
2. Bulk "Set topic" applies to the **whole question: every part** gets it.
3. A long question leaves Untagged as soon as **any part** has a topic; the Edit panel shows which parts still have none.
