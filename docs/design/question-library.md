# Question library — design (C1–C4, and a future exchange)

Status: proposal, 2026-09-26. Answers `docs/IDEAS.md` §C. Nothing here is built.

## The one decision everything else follows from

**A question is already the unit of storage; do not invent a second format.** A
`Question` is self-contained JSON: stem blocks, options, parts, answers, marking scheme,
diagrams as geometry, images as `data:` URLs. Every guard the repo has — `migrate`,
`KNOWN_KEYS`, the frozen corpus, backup zips, Trash, the desktop file store — protects a
`Worksheet`. So:

1. **A bank is a `Worksheet`** with `kind: 'bank'` (an optional top-level field, in
   `KNOWN_KEYS`). Questions a teacher keeps outside any paper live in bank documents.
   Storage, backup, migration, folders, Trash, desktop files, the newer-build guard: all
   free. An older build opens a bank as an ordinary worksheet and loses nothing.
2. **The library is an index, never a source of truth.** It is derived from every saved
   document (papers and banks alike), per-row validated, and rebuildable by scanning —
   the same contract as the dashboard index (`econ-worksheet-index`). If it corrupts or
   the schema changes, delete and rebuild; no teacher's work is in it.
3. **Identity travels with copies.** Every question gains an optional `lineage`. A copy
   gets a fresh `id` (and fresh block ids — today's `duplicateQuestion` does not, which is
   a known bug) but keeps `lineage.rootId`. History (C4), de-duplication on import, and
   "already in this paper" checks all key on `rootId`.

```
documents (papers + banks)  ── scan ──►  library index (derived, rebuildable)
        ▲                                        │
        │ insert copy (fresh ids, keep lineage)  ▼
    editor  ◄──────────────────────────  Library screen (search · preview · used-in · insert)
```

## Model additions (all optional, question-level, no schema bump)

```ts
interface QuestionBase {
  // …existing
  tags?: string[];          // C1: topic codes from the taxonomy, plus free tags
  lineage?: {
    rootId: string;         // the first ancestor's id; equal to `id` for an original
    fromDocId?: string;     // the document it was copied out of, if any
    copiedAt?: string;
    publisher?: string;     // exchange: who shared the pack; absent = mine
  };
}
interface Worksheet {
  kind?: 'bank';            // absent = a paper; MUST be added to KNOWN_KEYS
  classTag?: string;        // "5A 2025-26" — the "not used with this class since…" key
}
```

`migrate` filters only top-level keys, so question-level fields pass through unchanged.
Prove it: a corpus round-trip test that a v1 document with an injected `tags`/`lineage`
reloads with them intact, and that `serializeWorksheet` leaves them in.

**Taxonomy** (`src/model/topics.ts`, pure data): EDB curriculum topics A–J and the two
electives as codes with bilingual names; a second, finer list (the 71 MCQ / 50 LQ topics)
maps *onto* those codes, so a filter by "D. Firms and production" also matches the fine
tags. Codes are stored, names are looked up — renaming a topic never touches documents.
Free-text tags are allowed beside codes.

## Module topology

New area `src/library/` (pure code first, UI last), following the storage split:

| Module | Role | Pure? |
|---|---|---|
| `src/model/topics.ts` | taxonomy codes, names, coarse↔fine mapping | yes |
| `src/model/lineage.ts` | `copyQuestion(q, fromDocId)`: fresh ids, kept `rootId`; `withFreshIds` for blocks/options/parts/diagrams | yes |
| `src/library/row.ts` | `LibraryRow` = pointer `{docId, questionId, rootId}` + facets `{type, marks, tags, excerpt, hasDiagram, docUpdatedAt}` | yes |
| `src/library/indexer.ts` | `rowsOf(worksheet)`: derive rows from one document via registry hooks; never stores images | yes |
| `src/library/search.ts` | filter + rank rows: text, type, marks range, tags, class/last-used | yes |
| `src/library/history.ts` | `usedIn(rootId, rows, summaries)`: documents, question numbers, dates, class (C4) | yes |
| `src/library/types.ts` | `LibraryIndexStore` interface: `rows()`, `replaceDoc(docId, rows)`, `dropDoc`, `stamp(docId)` | — |
| `src/library/idbIndex.ts` | web: IndexedDB (outside the ~5 MB `localStorage` budget) | — |
| `src/library/fileIndex.ts` | desktop: `worksheets/library/index.json` | — |
| `src/library/sync.ts` | keeps the index current: on `save()`, re-index that doc; on start, re-index docs whose `updatedAt` ≠ stamp (same freshness key the thumbnail cache uses) | — |
| `src/components/library/*` | Library screen and the Insert dialog | — |

Rules that keep it modular:

- **Facets come from the registry, not from type ids.** Add one hook,
  `libraryFacets?(question): { excerpt: BiText; marks: number; searchText: string }`; the
  indexer and the Library card call it. `registry.test.ts`'s no-type-branching grep
  extends to `src/library/`.
- **The index stores pointers and text, never pictures.** Thumbnails are rendered on
  demand from the document through the existing IR → `PageThumbnail` path (a
  one-question worksheet), so a diagram-heavy bank costs nothing in the index.
- **Reading another document is read-only.** `exportSession.ts:loadKeyDocuments` already
  loads other documents without touching them; the Insert dialog and the indexer reuse
  that path. The store's `save()` is never called on a document the user did not open.
- **The store interface stays put.** `WorksheetStore` gains nothing; the library index is
  a sibling store chosen the same way (`isDesktop()` → file, else IndexedDB), so a remote
  implementation later slots in without editor changes.

## The four items, in order

**C1 Topic tags (S).** `tags` on `QuestionBase`; a tag field in each question's Edit panel
(a picker over `topics.ts` plus free text); tags are teacher-only and never print. Also
`classTag` in Document Settings. Ships first because C2–C4 index it.

**C3 Insert from another document (M).** Start screen or editor: "Insert from…" → pick a
saved document (read-only load) → a list of its questions with excerpts → tick → insert
copies after the current question, through `copyQuestion`. Also fixes the shared-block-id
bug in `duplicateQuestion` by routing it through `withFreshIds`. This is C2's insert path,
shipped before the index exists.

**C2 Library (L).** The index modules above; a **Library** tab on the start screen beside
Trash (search box; facets: type, topic, marks, "not used with class X since"); each row
opens a preview card (IR render), "Used in" (C4), "Insert into <open document>", "Copy to
bank". Banks appear in the dashboard with a distinct card and are excluded from paper
counts. Scale: 1 000 documents × 40 questions = 40 000 rows of a few hundred bytes — well
under IndexedDB comfort; the search is an in-memory filter over rows, no full-text engine
needed until it measurably hurts.

**C4 History (M).** Entirely derived: for a `rootId`, every document containing a question
with that `rootId`, its printed number (`computeNumbering`), the document's `classTag`,
`updatedAt`. "Facility 0.34" needs results the app does not have; when item analysis (G1)
arrives, results are a separate record keyed `{rootId, docId}` in the same index store,
never inside the worksheet.

## Copy exchange, later

The exchange unit is a **pack** = a bank worksheet (or several) in the existing backup zip
with its `manifest.json` gaining `{ publisher, license, exportedAt }`. Import reuses
`readBackup` → `restoreBackup` with two additions: questions whose `rootId` is already in
the library are flagged "already have it" (de-dup, never silent overwrite), and
`lineage.publisher` is stamped so provenance survives every later copy. A pack is just a
file, so it works by email or a shared drive today; a server exchange later is a
`LibraryIndexStore`-shaped remote catalogue of packs plus download. Ship no HKEAA content;
the manifest's `license` and the publisher stamp are what make third-party packs
reviewable.

## Restore and review

- **Restore = reopen.** A library entry is a pointer into a document; the document is the
  backup. Deleting the index loses only search speed, and `sync.ts` rebuilds it from the
  stamps on next start.
- **Review** happens in the Library card: the question rendered through the same IR as the
  paper (teacher mode, so answers and schemes show), its tags editable in place (the edit
  writes to the owning document via the ordinary store `commit` on that document, then
  re-indexes it), and its history list. Nothing in the index is edited directly.
- **Trash and banks.** Trashing a document drops its rows; restoring re-indexes. A bank
  document in Trash is out of the library until restored — the same rule as papers.

## Compatibility checklist before building

- `kind`, `classTag` → `KNOWN_KEYS`; `tags`, `lineage` are nested and pass through.
- Corpus test: a v1 document with injected nested fields reloads intact.
- A bank opened by ≤0.3.0 is an ordinary worksheet; nothing is dropped on save there
  except that build's own unknown *top-level* keys — `kind` would be lost, so the library
  must tolerate a bank that lost its `kind` (it still indexes as a document).
- The index lives in a key/dir older builds never read: IndexedDB database
  `econ-worksheet-library`, or `worksheets/library/`.
