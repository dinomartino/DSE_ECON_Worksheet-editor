# Question bank 題庫 — design (C1–C4, and a future exchange)

Status: building, 2026-09-29. Answers `docs/IDEAS.md` §C. Phase 0 is merged; WP-0 to WP-E below.
Revised from the 2026-09-26 proposal after an audit against the code at `9f2009b`.

## Decisions (the user, 2026-09-29)

- **Teacher-facing name: "Question bank 題庫".** Code keeps `src/library/`; the start
  screen's backup/restore menu (`libraryItems`) is renamed so the word means one thing.
- **Taxonomy: topics + sub-topics** from the EDB 2025 C&A Guide (appendix). A filter on a
  topic matches its sub-topics.
- **Tagging: manual first.** A keyless "✦ Suggest topics" (glossary term → topic) comes
  after C2, once a term → topic table exists.
- **Phase 0 fixes the duplicate bug and repairs saved documents on open.** Built.
- **UI (design page, artifact FyR7Xdd6BpgvFL42tdzz2T):** an editor sidebar tab **題庫 Bank**
  for refilling the open paper, and the **Question bank 題庫** dashboard. Revised the same
  day (design page § "The bank as its own screen"): the dashboard is its own screen,
  opened from the start screen and left by ← Home, with three levels (topic cards, a
  topic's review page, untagged tag-as-you-go). No add-rail drawer.
- **The bank fills itself:** every saved worksheet's questions are indexed automatically.
  A worksheet can opt out with `bankHidden` (Setup).
- **Copies are independent.** Editing a copy never changes its source and vice versa.
  The bank groups rows by `rootId`: identical copies (same `contentKey`) collapse into
  one row ("Used in 3 papers"); edited copies show as "N versions". "Used with 5A" counts
  every version. **Topics are one truth per question** (C6): every topic edit made in the
  bank (Edit topics, tag as you go, Set topic add/remove/replace) writes every copy it may
  (not hidden, trashed or newer-build documents; those are reported), and the bank reads
  the union of all copies' tags (`src/library/sharedTags.ts`). The editor's Topic row does
  the same (`src/components/editor/topicSync.ts`): the open copy through the store (⌘Z
  undoes it, and only it), every other indexed copy of its root through storage, never the
  open document; each other copy gains the edited copy's topics, loses what the edit took
  off and keeps its own extras. A copy taken from the bank (Insert, Fill, Add to, New
  worksheet from these) starts with the union, not the picked copy's tags
  (`src/library/sharedTags.ts:withRowTags`). **Update bank copy** (explicit, never automatic) writes an edited
  question back to the bank document it came from; **Treat as a new question** drops
  `lineage`.
- **Fill is deterministic:** best match first, then least recently used, never already
  in the paper; ↻ swaps one pick.
- **Bank screen look:** light surfaces for lists; the desk tone only behind the paper. EDB
  sub-topics stay and head the review page's list.
- **The C3 "Insert from another document" dialog is dropped.** The 題庫 tab's From filter
  does the job.

### 題型 / Pattern (C24, 2026-09-29)

- **A 題型 belongs to one sub-topic and one question type.** Coarse topics hold none. MCQ
  and LQ lists are separate because the question's registry type decides the list (read
  from `BankRow.typeId`, never a branch). No default list ships.
- **Stored as a tag, `C.ped::<name>`** (`src/model/patterns.ts`). It rides on `tags`, so
  copies carry it, bank reads take the union, every write path (`tagWrites.ts`,
  `topicSync.ts`) reaches every copy, and `contentKey` already ignores it. A `::` tag
  whose prefix is not a sub-topic this build knows is kept and shown as stored, never a
  free tag (§ Tag grammar). One 題型 per sub-topic per question;
  removing or replacing a sub-topic takes its 題型. Names match ignoring case and spacing.
- **An app-level registry** (`src/storage/patterns.ts`) keeps the 題型 a teacher defined,
  including unused ones: `econ-worksheet-patterns` / `worksheets/patterns.json`, per-row
  validated, cleared with the store, in the backup manifest (restore adds only). The list
  shown for a sub-topic × type is the registry joined with names on questions. Forward
  compatible: rows this build cannot use are written back verbatim, sub-topics are judged
  by the code grammar (§ Tag grammar), and a newer `format` makes the registry read-only.
- **Created while tagging** (the Edit panel's Topic row, the bank's topic dialog for
  Edit, Set topic when every pick is one type, and tag as you go's full list) or on the
  **題型 Patterns** level (`PatternsPage.tsx`), which also renames, merges and deletes:
  every copy is rewritten through `writeTags`; hidden, trashed and newer-build documents
  keep the old name (newer-build ones are named in the notice).
- **The picker never makes a near-duplicate by accident** (`src/components/bank/patternOptions.ts`).
  Typing matches ignoring case, spacing and punctuation (`src/model/patterns.ts:matchPatternName`):
  a name that differs only so *is* that 題型 (no New row); a prefix or part highlights the
  existing one, so Enter picks it; ↑/↓ reach the others and "New 題型"; a close name
  (it is a prefix of what was typed, or a letter or two off) is named on the New row. The
  manage page's New 題型 form applies the same rule. Identity in the registry is unchanged.
- **Creating is an explicit act**: the picker registers a new name at once, so it outlives
  a cancelled dialog. Every entry point uses the same picker, so they all behave alike.
- **Bulk Set topic can clear**: Add and Replace offer "No 題型" (a mix of MCQ and LQ can
  only clear, and only where a pick has one); Remove can keep a ticked sub-topic and take
  only its 題型. Setting one still needs every pick to be one type.
- **Notices belong to their level**: a plain result ("Topics saved.") clears when the bank
  moves to another level or topic, or to and from Home; an error, or a notice listing
  files, stays until dismissed.
- **Bank uses: group and filter only.** The review rail splits a sub-topic by 題型, "No
  題型" last; the Filter has a 題型 field scoped to the topic on screen; topic cards count
  the 題型 in use. Fill and coverage are unchanged. Never printed.

### Tag grammar (reserved before release, 2026-09-30)

`Question.tags` is one list of strings, so its forms are reserved now: once teachers can
type into it, a later build cannot claim a form without reinterpreting their tags. The
constants live in `src/model/topics.ts` (`TOPIC_CODE_PATTERN`, `SYSTEM_TAG_SIGIL`) and
`src/model/patterns.ts` (`PATTERN_SEPARATOR`, `isReservedTag`, `freeTagIssue`).

| Form | Grammar | Example |
|---|---|---|
| Topic code | `^(?:[A-Z]\|EL[0-9]+)(?:\.[a-z0-9-]+)?$`: one capital, or `EL` + a number; then optionally `.` + a lower-case slug | `C`, `EL1`, `C.ped` |
| 題型 | a sub-topic code, `::`, a name | `C.ped::Calculate PED` |
| System tag | starts with `@`; none exist yet | (reserved) |
| Free tag | any other string | `mock 2025`, `MCQ`, `S5` |

- **The grammar is narrow on purpose**: "MCQ", "S5" or "DSE2023" stay free tags. A later
  build adding a coarse topic must name it inside it (a letter, or `EL` + a number).
- **Unknown codes are topics, not free tags.** Parent codes are derived by grammar
  (`parentCode`), so a later build's `C.new` rolls up under `C` (`rollupTopic`,
  `matchesTopic`); an unknown `K` shows as its code and counts as no topic. Tag edits keep
  codes they cannot show (Replace keeps them, as it keeps free tags), and the 題型 registry
  keeps rows for sub-topics it does not list.
- **Only typing is refused.** The Topic row's free-text entry refuses a code this build
  does not list, anything holding `::`, or a leading `@`, with a one-line reason. A tag
  already stored in a reserved form (typed before this rule) is left exactly as it is.
- **Non-string tags** (a later build's shape, a hand-edited file) are never read and never
  dropped: `stringTags` for reading, every write keeps them in place.

## The one decision everything else follows from

**A question is already the unit of storage; do not invent a second format.** Every guard
the repo has — `migrate`, `KNOWN_KEYS`, the frozen corpus, backup zips, Trash, the desktop
file store — protects a `Worksheet`. So:

1. **A bank is a `Worksheet`** with `kind: 'bank'` (top-level, in `KNOWN_KEYS`). Storage,
   backup, folders, Trash, desktop files, the newer-build guard: all free. Builds back to
   v0.2.0 keep unknown top-level keys in `__unknown` and write them back, so an older build
   saves a bank without losing `kind`; it just shows it as a paper.
2. **The index is derived, never a source of truth** — rebuildable by scanning, validated
   per row, like `econ-worksheet-index`. No teacher's work is in it.
3. **Identity travels with copies.** A copy gets fresh ids at every level but keeps
   `lineage.rootId`. History, de-duplication on import and "already in this paper" key on it.

```
documents (papers + banks)  ── scan ──►  bank index (derived, rebuildable)
        ▲                                        │
        │ insert copy (fresh ids, keep lineage)  ▼
    editor  ◄──────────────────────────  Question bank view (search · preview · used in · insert)
```

## Model additions (all optional, no schema bump)

```ts
interface QuestionBase {
  tags?: string[];          // topic codes ('C', 'C.ped') plus free tags
  tagsAt?: string;          // ISO time of the last tag write; metadata, contentKey ignores it
  lineage?: {
    rootId: string;         // first ancestor's id; equal to `id` for an original
    fromDocId?: string;
    copiedAt?: string;
    publisher?: string;     // exchange only; absent = mine
  };
}
interface Worksheet {
  kind?: 'bank';            // KNOWN_KEYS
  classes?: string[];       // ["5A", "5B"]: who sat it; absent = a draft; KNOWN_KEYS
  satOn?: string;           // "2025-11-03": when; absent = createdAt; KNOWN_KEYS
}
```

### What a use means (C5)

- **Only papers (no `kind`) and banks are indexed.** A later build's kind (a `notes`
  document) yields no rows, so it is never a paper, a use or a bank here; `summarize`
  passes its `kind` string through untouched.
- **A use is a paper that names classes.** A paper without `classes` is a draft: "Used in"
  still lists it as a place the question lives, but no anti-repeat filter, Fill ranking or
  class strip counts it. Banks are never uses.
- **The use date is `satOn ?? createdAt`** (`src/model/classes.ts:dateOfUse`), never
  `updatedAt`: tagging or fixing a 2024 paper must not make it look used this year, nor make
  it the group's lead copy. Rows carry it as `usedOn`; `docUpdatedAt` stays the index's
  freshness stamp only. Groups lead with the newest use date, ties by docId.
- **Cohort, derived, never stored** (`src/library/cohort.ts`): a class starting with a form
  number ("5A", "S5A", "中五甲") on its use date's school year (Sept to Aug) sits the DSE in
  schoolYearEnd + (6 − form). 4A in 2024-25, 5A in 2025-26 and 6A in 2026-27 are DSE 2027.
  "Not used with" matches by cohort when both sides derive one, else by class name
  (case- and space-insensitive).
- **A copy is unsat**: Duplicate and "New worksheet from these" never carry `classes`/`satOn`.
- **Develop builds stored `classTag`** (one string, never released). `migrate` folds it into
  `classes` (`src/model/classes.ts:foldLegacyClassTag`); a trailing school year becomes a
  `satOn` only when the paper was made in another year. No schema bump: no released
  document holds it, and a bump would make released builds open new documents read-only.

- `migrate` checks only top-level keys; question objects pass through, and every
  per-question rewrite (`mapQuestion`, the text walker's `patch`, `mapAllBlocks`) spreads.
  Prove `tags`/`lineage` the way `backwardCompat.test.ts` proves `rationale`/`provenance`.
- `McqQuestion.provenance` is unrelated: printed teacher prose ("Modelled on DSE 2023
  Q1"). `lineage` is machine identity and never prints.
- `tags` is not a `BiText`; keep it out of `textSlots.ts` roles.
- **Removing a tag is not durable yet**: the union across copies brings it back from a
  copy the write could not reach (hidden, trashed, newer-build, restored). Unchanged for
  now, but every tag write (`withQuestionTags`, `setQuestionTopics`) stamps `tagsAt`, on
  removal too, so a later build can choose newest-wins from the history accumulated since
  the first release.
- Codes are stored, names looked up (`src/model/topics.ts`), so renaming never touches a
  document.

## Ids — what a copy must renew

A question holds ids on: itself; every `ContentBlock` (paragraph, table, image, diagram,
figureRow and its `figure`/`table`, source and its nested `blocks`); `TableRow`,
`TableCell`; `McqOption` and its `blocks`; parts and sub-parts with `blocksBefore`,
`blocks`, `answerDiagram`; the question's own `answerDiagram`; mark-scheme routes, groups,
points, levels and EC descriptors.

**Not renewed:** ids *inside* a diagram (curves, points, labels, areas). They are
cross-referenced by `DiagramAnchorRef` and `{curve}` and scoped to their diagram.

Walk block lists with `questionBlockLists` / `flattenBlocks` (`src/model/edits.ts`), which
already enumerate every list without branching on type. `newId` is `nanoid(10)` from
`src/model/factories.ts`.

A copied MCQ gets a new id, so versions B–D shuffle it differently from its original
(`versions.ts` keys the shuffle by question id). Accepted.

## Phases

### 0 · Deep re-id and repair (S) — ship first, on its own

The bug: the private `withFreshIds` in `worksheetStore.ts` renews only question, part and
sub-part ids. `mapAllBlocks` patches every block with the target id anywhere in the
document, so editing a duplicated question's text also edits the original. Also hits
`duplicateMany`.

- `src/model/lineage.ts`: `freshIds(question)` — the full walk above; replaces the
  private `withFreshIds`. `copyQuestion(q, fromDocId?)` = `freshIds` + `lineage`.
- **Repair on open:** a pure `dedupeIds(worksheet)` run at load. The first owner in flow
  order keeps its ids; later duplicates are renewed. Must return the *same object* when
  nothing is duplicated (corpus round-trip stays byte-identical; ids never print, so
  exports do not change). Not a migration — no schema bump.
- Tests: editing a copy's paragraph, option, cell and answer diagram leaves the original
  untouched; `dedupeIds` is a no-op on the corpus; a document with duplicated ids opens,
  edits independently, and exports identically to before.
- CHANGELOG: "Editing a duplicated question no longer changes the original."

### Build packages (2026-09-29)

WP-0 lands first on `develop`; A–E then run in parallel on branches cut from it. Each
package owns the files listed; anything else it needs from another package it takes
from WP-0's contracts, not from that package's branch.

**WP-0 · Contracts and the pure core.**
- Model: `tags?: string[]` on `QuestionBase`; `kind?: 'bank'`, `classes?: string[]`,
  `satOn?: string`, `bankHidden?: boolean` on `Worksheet` (all in `KNOWN_KEYS`); corpus tests.
- `src/model/topics.ts`: the appendix as data; `TOPICS`, `topicOf(code)`,
  `parentCode(code)`, `matchesTopic(tags, code)` (a coarse code matches its fine ones),
  `topicLabel(code, lang)`.
- `src/model/excerpt.ts`: one `questionExcerpt(question, lang)` (moves `biExcerpt` /
  `excerptOfBlocks` / the Outline's inline stem excerpt behind it).
- `src/library/`: `types.ts` (`BankRow`, `BankGroup`, `BankQuery`, `BankStatus`,
  `StoreChange`), `indexer.ts` (`rowsOf(worksheet, summary)`), `contentKey.ts` (content
  hash ignoring ids and lineage), `search.ts` (`searchRows`), `group.ts` (`groupRows` by
  `rootId`, then `contentKey`), `history.ts` (`usedIn`), `fill.ts` (`pickFill`),
  `noTypeBranching.test.ts`.
- `src/library/useBank.ts`: the one hook both surfaces read — `useBank(): { status,
  rows, groups, refresh }`. WP-0 ships a **naive working provider** (scan `list()` +
  `load()` in memory, rescan on `refresh`); WP-B replaces its internals, never its API.
- `src/components/bank/BankRow.tsx`: the shared row (excerpt, quiet meta text, action
  slot, states normal / in this paper / used with class / missing language).
- Store: `insertQuestionCopies(questions, { fromDocId, afterId })` — `copyQuestion` each,
  one commit, one ⌘Z, returns the new ids.

**WP-A · Topic tags UI** (S): the Topic row in the Inspector (picker over `TOPICS` +
free text), classes, sat-on date and "Hide from bank" in Setup → Worksheet, a quiet tag line in
Outline rows; test that tags never reach IR, `.docx` or clipboard.

**WP-B · Persistent index** (M–L): the change-feed decorator at the store singleton
(`src/storage/index.ts`), IndexedDB `econ-worksheet-library` (web) and
`worksheets/library/index.json` (desktop), freshness stamps, idle chunked indexing,
focus re-check; swaps into `useBank` without changing its API.

**WP-C · Editor 題庫 tab + Fill** (M): third sidebar tab; sticky (selection moves the
insert anchor instead of switching to Edit); anchor line; search, topic, type, marks,
"not used with <class>", From filters; Insert → `insertQuestionCopies`, anchor moves to
the last inserted; review bar (‹ ›, Undo, Done); hover ghost preview at the anchor;
Fill N from topic via `pickFill`; entry points in the add rail's Question menu and the
empty page.

**WP-D · Question bank page** (M, built; since redesigned as its own screen, see Decisions): start-screen tab beside Worksheets; Topics tree in the
Folders slot; coverage strip (MCQ / structured per topic, thin floor, "N untagged →
Tag"); list of `groupRows` with "N versions" expansion; preview through the IR in
teacher mode with Topics editable (written to every copy's document, then re-indexed);
selection tray (marks, minutes, topic mix; Set topic… add/remove/replace, Add to "<last open>", New
worksheet from these); first-run and empty states; rename `libraryItems`.

**WP-E · Lineage actions** (S–M): Outline row menu "Copy to bank" (create or append to a
bank document), "Update bank copy" (only when `lineage.fromDocId` is a bank and the
content differs), "Treat as a new question" (drops `lineage`); banks get a distinct
card on the Worksheets tab and are excluded from paper counts.

Later: ✦ Suggest topics, packs.

**Drag from the tab onto the page (built 2026-09-30).** A row drags (grip, grab cursor,
5px threshold so a click stays a click). Rows have no Insert button (removed 2026-09-30):
the tab's header says to drag, and the keyboard path is Enter or Space on a focused row,
which copies after the anchor exactly as the button did.
While in hand the page shows the result: the copy drawn faded in its slot
(`data-print-hide`), later questions renumbered, sheets re-flowed. A slot is a gap of the
resolved flow, so either side of a section marker is its own slot, and none lies after
"END OF PAPER" (`lastQuestionGap`). Release = `commitBankCopies` at that gap: the same
copy, tags and review as Enter on a row, one commit. Esc, a lost pointer or a release off the page
leave the document untouched and clean. Body only: over a header/footer band the slot holds;
read-only and print preview offer no drag. Near the page's top or bottom edge it scrolls.
Code: `src/components/bank/bankDrag.tsx`, `src/components/bank/dropSlot.ts`.

## Copy exchange, later

A **pack** = bank worksheet(s) in the backup zip, manifest gains `{publisher, license,
exportedAt}`. Import reuses `readBackup` → `restoreBackup`; questions whose `rootId` is
already indexed are flagged "already have it", never overwritten; `lineage.publisher` is
stamped. Ship no HKEAA content.

## Appendix — topic taxonomy

Source: *Economics Curriculum and Assessment Guide (S4–6)*, CDC & HKEAA, 2007 with updates
in 2025 (effective S4 2025/26, DSE 2028+); EDBCM 113/2024. The 2021 optimisation did not
touch Economics; the elective part remains (students may skip it; Paper 2 Section C).
MCQs cover A–J only. Ship titles only — never the guide's explanatory text. Chinese
proof-read once before shipping (rejoined from PDF line wraps).

Coarse codes `A`–`J`, `EL1`, `EL2` (not `E1`/`E2`, which read as topic E). Fine codes are
frozen slugs, never ordinals.

| Code | Topic | 中文 | Sub-topics (code: English 中文) |
|---|---|---|---|
| A | Basic Economic Concepts | 基本經濟概念 | `A.social-science` Economics as a social science 經濟學作為一門社會科學 · `A.scarcity` Scarcity, choice and opportunity cost 稀少性，選擇和機會成本 · `A.basic-problems` Three basic economic problems 三個基本經濟問題 · `A.specialization` Specialization and exchange 專門化及交易 · `A.circular-flow` Circular flow 經濟活動的循環流程 · `A.positive-normative` Positive and normative statements 實證性和規範性的陳述 |
| B | Firms and Production | 廠商與生產 | `B.ownership` Ownership of firms 廠商的所有權 · `B.production-types` Types and stages of production 生產的種類/階段 · `B.goods` Types of goods and services 物品和服務的種類 · `B.division-of-labour` Division of labour 分工 · `B.factors` Factors of production 生產要素 · `B.costs` Production and costs 短期和長期生產及生產成本 · `B.objectives` Objectives of firms 廠商目標 |
| C | Market and Price | 市場與價格 | `C.law-of-demand` Law of demand 需求定律 · `C.individual-demand` Individual demand 個別需求 · `C.market-demand` Market demand 市場需求 · `C.individual-supply` Individual supply 個別供應 · `C.market-supply` Market supply 市場供應 · `C.equilibrium` Demand, supply and price 需求、供應和價格的相互作用 · `C.surplus` Consumer and producer surplus 消費者盈餘及生產者盈餘 · `C.price-functions` Functions of prices 價格的功能 · `C.ped` Price elasticity of demand 需求價格彈性 · `C.pes` Price elasticity of supply 供應價格彈性 · `C.intervention` Market intervention 市場干預 |
| D | Competition and Market Structure | 競爭與市場結構 | `D.structure` Perfect and imperfect competition 完全競爭和不完全競爭 |
| E | Efficiency, Equity and the Role of Government | 效率、公平和政府的角色 | `E.efficiency` Efficiency 效率 · `E.equity` Equity 公平 · `E.policy` Policy concerns 政策的考慮 |
| F | Measurement of Economic Performance | 經濟表現的量度 | `F.national-income` National income 國民收入 · `F.price-level` General price level 一般物價水平 · `F.unemployment` Unemployment and underemployment rates 失業率及就業不足率 · `F.hk-trends` Recent Hong Kong trends 香港近期趨勢 |
| G | National Income Determination and Price Level | 國民收入決定及價格水平 | `G.ad` Aggregate demand 總需求 · `G.as` Aggregate supply 總供應 · `G.equilibrium` Determination of output and price level 產出和價格水平的決定 |
| H | Money and Banking | 貨幣與銀行 | `H.money` Money 貨幣 · `H.banks` Banks 銀行的功能和服務 · `H.money-supply` Money supply 貨幣供應 · `H.money-demand` Money demand 貨幣需求 · `H.interest` Interest-rate determination 貨幣市場中利率的決定 · `H.financial-centre` Hong Kong as a financial centre 香港作為金融中心 |
| I | Macroeconomic Problems and Policies | 宏觀經濟問題和政策 | `I.cycles` Business cycles 經濟周期 · `I.inflation` Inflation and deflation 通貨膨脹和通貨緊縮 · `I.unemployment` Unemployment 失業 · `I.fiscal` Fiscal policy 財政政策 · `I.monetary` Monetary policy 貨幣政策 |
| J | International Trade and Finance | 國際貿易和金融 | `J.trade` Free trade and trade barriers 自由貿易及貿易障礙 · `J.bop` Balance of payments 國際收支平衡表 · `J.exchange-rate` Exchange rate 匯率 |
| EL1 | Monopoly Pricing, Anti-competitive Behaviours and Competition Policy | 壟斷定價、反競爭行為及競爭政策 | `EL1.pricing` Monopoly pricing 壟斷定價 · `EL1.competition-policy` Anti-competitive behaviours and competition policy 反競爭行為及競爭政策 |
| EL2 | Extension of Trade Theory, Economic Growth and Development | 貿易理論之延伸、經濟增長及發展 | `EL2.trade-theory` Extension of trade theory 貿易理論之延伸 · `EL2.growth` Economic growth and development 經濟增長及發展 |
