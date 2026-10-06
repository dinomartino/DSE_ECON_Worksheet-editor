# Sync engine

Status: **core built 2026-10-05; scheduler wired 2026-10-06** (`src/sync/`). The desktop app runs it
only once a library folder is chosen, and nothing chooses one yet, so teachers see no change.
Decision (coordinator, 2026-10-05): **one engine, every storage source plugs into it** (cloud
folder, later Drive API, OneDrive API, an own account server).

## The model: local primary, the source a mirror

The store the app already has (`LocalStorageWorksheetStore` on the web, `FileWorksheetStore` on
desktop) stays the teacher's library, unchanged. The engine reconciles it with a `SyncSource`.
This supersedes `library-folder.md`'s "the folder replaces `worksheets/`": the folder is a
source like any other. A missing source pauses sync; nothing diverges, because reconciliation
keeps both versions of anything that changed on both sides.

Per document, three things are compared: the local copy, the remote copy, and the **base**
(both as of the last sync). The change feed only says *when* to run; a missed event, a crash or
a week offline is recovered by the next run. There is no queue to lose.

## The source interface (`src/sync/types.ts`)

Entries are `{ key, revision, size }`. `key` is a logical name: `<id>.worksheet.json`,
`trash/<id>.worksheet.json` (v1 syncs documents and Trash only; `graphs/…`, `folders.json`,
`patterns.json` are reserved). `revision` is opaque (content hash, ETag, server version).

| Call | Result |
|---|---|
| `list()` | entries, or `unavailable` |
| `read(key)` | `{ text, revision }`, `missing`, `unreadable` (held, never deleted), `unavailable` |
| `write(key, text, { expectRevision })` | new revision, or `conflict` (`null` = must not exist) |
| `remove(key, { expectRevision })` | `ok`, `missing`, `conflict`; a source uses its own trash where it has one |
| `changes(cursor)` | changed keys + next cursor, or `reset` (rescan) |
| `onHint(listener)` | optional: `changes` may have news (a watcher burst) |

`unavailable` may carry the source's `reason`; the run report passes it on.

No paths, mtimes, rename or mkdir: those stay inside a folder source. `memorySource.ts` is the
test source (offline, mid-run failure, delayed visibility, outside edits, provider conflict copies).

## The folder source (`src/sync/folderSource.ts`, `src-tauri/src/library.rs`)

A cloud-synced folder the teacher picks (`<chosen>/Econ Studio/`, marker `econ-studio-library.json`
`{ "format": 1 }`), reached only through the shell's `library_*` commands (`library-folder.md` § 4).

- **Keys are relative paths**, every `*.json` but the marker, dot-names and temp files. A provider's
  conflict copy keeps its own name, so the planner sees it as a stray.
- **Revision = SHA-256 of the bytes.** Write and remove compare it first; a mismatch writes nothing.
  Writes are temp + fsync + rename (Windows: ~1 s of retries, then in place); identical bytes are not
  written. Remove is a plain delete: the provider's recycle bin is the backstop.
- **Unusable root** (none chosen, missing, no marker, a newer `format`) is `unavailable`, never an
  empty listing. A newer build's library is never written by this one.
- **A file that will not read** (cloud placeholder that will not download, no permission) is listed,
  never dropped, and reads as `unreadable`: the planner holds it; a write over it conflicts.
  A placeholder not yet downloaded is listed unhashed; reading it downloads it.
- **`changes()`** comes from the watcher (~1 s bursts of paths). It answers `reset` whenever an event
  may be lost: first call, watcher restart, a rescan, an overflowing log, no watcher. The listing is
  the truth; a `list()` that finds the root gone drops the watcher, and the next call restarts it.
- The device id (random, once per computer) lives beside the root in `$APPDATA/library-location.json`.

## The planner (`src/sync/plan.ts`, pure)

Local changed = content hash (of what `stringifyWorksheet` writes) ≠ base. Remote changed =
revision ≠ base. **Two computers' clocks are never compared.** "Moved" = trashed or restored
with the same content.

| local \ remote | same | edited | moved | gone |
|---|---|---|---|---|
| **same** | nothing | download | move local | live: to Trash · trash: nothing |
| **edited** | upload | keep both (same content: link) | upload (edit wins) | upload |
| **moved** | move remote | download (edit wins) | link | trash: nothing · live: upload |
| **gone** | live: download back · trash: purge remote | download | download | forget |

- **No base** (first sync, a computer joining, `library-folder.md` § 1.3): one side only → copy
  across; same content (bytes, or after the `stringifyWorksheet` round trip) → link, a trashed
  side restored (live wins); different → keep both.
- **Keep both:** the remote keeps the id; this computer's version is saved under an id derived
  from (id, its hash), named by the injected `CopyNamer` ("… (from Home Mac, 5 Oct 14:32)", the
  time being that version's own last edit). The interface layer localises the name later.
- **Never a hard delete by sync.** A delete reaches the other side as Trash; Trash expiry stays
  per device. A purge here removes the remote Trash file (into the source's own trash).
- **A live document missing locally** with the remote unchanged is downloaded back: nothing in the
  app removes a live document without Trash, so its absence is a loss (eviction, a dangling row).
- **Newer build** (`isNewerThanBuild`): downloads are allowed (it opens read-only, as today); an
  upload over a newer build's file is never planned (a local edit becomes a copy); a newer document
  held here is written only where nothing is, and never given an older schema (held instead).
- **Unreadable** files, local or remote, are held and reported, never read as deleted or written over.
- **Strays** (planned first): a remote file not at its own id's key (provider conflict copies;
  the id inside decides, not the name), and a Trash file beside a live one (a delete that crossed
  an edit). Holding the live content, or this computer's own unsynced version: dropped. Otherwise:
  its own document under an id derived from (inner id, hash), so both computers make one copy.
  A newer build's stray is held, never re-id'd.

## The executor (`src/sync/run.ts`)

- Every remote write is compare-and-swap; every local write re-reads the document first. Either
  finding a change re-plans that document (3 attempts), so a save made mid-run is never overwritten.
- **The base moves only after both sides agree**, so a run stopped after any single step resumes
  safely. Copies have derived ids, so a resumed run finds its copy instead of making another.
- **A move changes content in place first, then moves identical bytes**, old key removed last. No
  moment shows two different versions (which the other computer would keep as a conflict) and the
  remote never holds no copy.
- One bad document never stops the run; `unavailable` stops it (status `unavailable`).
- A source suddenly empty while the base had live documents drops the base and refills the
  mirror from this computer (`remoteWasEmpty`), never reads as "trash everything". Cost: a purge
  of every document on the other computer before this one synced comes back.
- Report: counts, `conflicts` (id, copy id, name: the future "Needs attention" list), `held`, `errors`.

## The open editor (`RunOptions.isBusy`, `src/sync/openEditor.ts`)

- **Unsaved edits** (`dirty`, set until the write that clears it lands): every action on that
  document is held (`busy`), uploads too. Its save makes it edited here; if the other computer
  changed it too, the next run keeps both, and the editor stays on its id (now the other version).
- **Asked again after each local write.** An edit typed while sync wrote leaves the base as it was,
  so that edit's save meets the written version as a conflict: both kept.
- **Clean:** sync may download over it. The editor takes the download in when `adopt` announces it
  (before an edit can start from the old version), then a notice: "Updated from your other
  computer.", or, when its own version became the copy, where it went. A clean open document
  trashed elsewhere is trashed here while shown; an edit then brings it back (an edit wins).
- Autosave and Save now leave the document dirty when it changed during the write.

## The scheduler (`src/sync/scheduler.ts`, `src/sync/librarySync.ts`)

- **When:** start; focus or visibility regained; 3 s after the last local save; a source hint whose
  keys are not this computer's own last writes; `reset`; every 60 s while visible. Every run is full.
- **One run at a time**; triggers during a run coalesce into one follow-up. `changes()` is taken
  just before each run, so what changes during it is reported after it.
- **Ignored:** `origin: 'sync'` changes and the engine's own Trash moves; a hint naming only keys
  this computer wrote (or removed) in the last 30 s that still read back with that hash (up to 20).
- **`unavailable`** (or a run that throws: reason `error`) backs off 5 s, 30 s, 2 min; any trigger
  still runs at once. The base is `flush`ed after every run; `stop()` closes the source.
- **Status** (`status()`, `subscribe`): `idle` / `running` / `unavailable` + reason, the last report
  (`conflicts`, `held`, `errors`, `remoteWasEmpty`), `lastSyncedAt`, `retryAt`. No UI reads it yet;
  the desktop console has `__econSync.status()` and `.syncNow()` while it runs.
- **Wiring:** desktop only, started by `EditorHost` (via `import()`) when `library_location` is `ok`
  at launch; a folder chosen or back later starts at the next launch (the UI stage restarts it).
  Base id `folder:<deviceId>:<root>`. Copy names from `localNamer` (interface language at the
  time; computer "Mac" / "Windows PC" until setup asks). **Clear saved documents** forgets the
  base, then clears, with no run between (a base that will not clear stops it first); the next
  run is a first sync, so the folder refills the library.
- **Web, later:** `exclusive: webLock()` so one tab runs at a time; forget the hash of every
  `econ-worksheet:` key another tab's `storage` event names.

Known gaps: a save not from the editor (the outgoing document's save when switching papers, a
題庫 write) can land between the engine's re-read and its `adopt` on desktop (one IPC round trip);
a per-id write lock in the store would close it. A provider copy made by two computers in
different interface languages gets two names, so a second copy.

## The local hash cache (`src/sync/hashCache.ts`)

- `HashCache` (injected, optional): id → `{ place, updatedAt, hash, schemaVersion, newer }`, plain
  JSON. An unchanged library loads no document; a conflict loads its one (`needsLocal`, re-planned).
- **A hit needs the row's `updatedAt` to match and no local write to the id since.** `updatedAt` is
  the document's own field, so same-millisecond saves, a write whose index row failed and hand edits
  keep it: every write must `forget` (`forgetOnWrite`, failed writes included; tickets drop a hash
  read before a write that landed). Unreadable documents are never cached.
- A false hit cannot lose a version (local writes re-read first); it would only delay an upload.
- In memory only. Persisting it needs a stamp other processes' writes cannot keep.

## Store additions

- `StoreChange.origin?: 'sync'` (memory only): `adopt` announces with it, so a download reindexes
  題庫 but does not trigger an upload. Trash and restore by sync are announced plainly; the run
  they trigger finds nothing to do.
- `adopt(worksheet)` on both stores: `save`, except it may replace a newer build's document. The
  one refusal (`adoptRefused`, throws `NewerDocumentError`): the stored document is newer than this
  build **and** the incoming schema is lower than the stored one. Stored text that will not parse
  is never replaced. On the web the rule also guards a trashed copy (it shares the key).
- `loadTrashed(id)` on both stores: a trashed document's content (desktop `load` reads only live files).
- The web store takes an optional storage, for two-computer tests. No schema change, nothing in
  `KNOWN_KEYS`, sync state never inside documents.

## Invariants (tested)

`src/sync/property.test.ts`: random edits, trashes, restores, syncs, deliveries and offline
spells on two computers (delayed visibility in half the seeds). Every version that existed at a
sync point survives (itself or a later edit of it) live, as a copy or in Trash; both computers end
identical; no version is held twice. 5,000 seeds at up to 120 steps passed while building. With
the hash cache on (every edit stamped alike in even seeds), no cached hash is ever stale; 5,000
seeds at 40 steps and 1,500 at 120 passed.

## Next

1. ~~Real base persistence~~ **done** (`persistentBase.ts:createBaseStore(sourceId)`): web IndexedDB
   `econ-worksheet-sync` (store `base`, keyed `[sourceId, id]`), session memory where it cannot open;
   desktop `$APPDATA/sync/base-<sha256(sourceId)>.json`, temp + rename. A bad row, a torn or foreign file
   reads as absent (empty base is safe, a guessed one is not); `clear()` throws rather than leave one.
   Desktop writes coalesce (at most one per second, `flush()` to settle): the file may lag the engine's
   last puts, never run ahead, and a lagging row is an earlier real agreement, as after a crash.
2. ~~A local hash cache~~ (built: § The local hash cache).
3. ~~The folder source~~ **done** (above). `run.test.ts` and `property.test.ts` run through it over a fake
   of the Rust rules (`folderTestKit.ts`). Unverified: a real Tauri runtime, Windows, real providers.
4. ~~Scheduler~~ **done** (§ The scheduler, § The open editor). Web parts noted there, not built.
   Unverified: a real Tauri shell, Windows, real providers.
5. Interface: Storage location (choose, restart the scheduler), "Needs attention" (`conflicts`,
   `held`), the empty-remote notice; the localised `CopyNamer` is built (`localNamer.ts`).
6. Folders, 題型, graphs as later keys.

## Decisions (2026-10-05)

- **Delete forever / Trash expiry removes the cloud copy** (as built): it lands in the provider's own
  recycle bin; the other computer keeps its local Trash copy until its own expiry. (User.)
- **An empty remote is refilled from this computer, with a notice**: "The cloud copy was empty, so
  it was refilled from this computer." The run report's `remoteWasEmpty` drives it (UI stage). (User.)
- `clear()` forgets the base (scheduler stage). A provider-renamed **lone** file holding the only
  copy is adopted as the original, not trashed plus copied (planner change, next stage). A copy's
  name carries that version's own last-edit time. (Coordinator.)

## First real run (by hand, `npm run desktop:dev`, a scratch folder: choosing one uploads the library)

1. Devtools: `__econSync` is `undefined` (nothing started).
2. `await window.__TAURI_INTERNALS__.invoke('library_choose', { title: null })`, pick an empty folder;
   `invoke('library_location')` → status `ok`.
3. Reload (Cmd+R): `__econSync.status()` is `idle`, `lastReport.counts.uploaded` = your paper count,
   and the folder holds `<id>.worksheet.json` files.
4. Edit a paper, wait ~5 s: `uploaded` 1. Edit a folder file by hand: `downloaded` within seconds, and an
   open, clean editor reloads with a notice. `__econSync.syncNow()` forces a run.
5. Undo: `invoke('library_forget')`, reload.

