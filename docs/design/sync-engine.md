# Sync engine

Status: **core built 2026-10-05; scheduler wired 2026-10-06; interface 2026-10-07** (`src/sync/`,
Settings → Storage location, desktop only). Unverified in a real Tauri shell or cloud provider.
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
  Writes are temp + fsync + rename (Windows: ~1 s of retries, each re-checking the hash; still held,
  an error for the next run, never in place); identical bytes are not written. Remove is a plain delete: the provider's recycle bin is the backstop.
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
  A newer build's stray is held, never re-id'd. Its name is one bilingual name on every computer:
  "… (from another computer / 來自另一部電腦)"; a copy already at the derived key that differs only
  in `name` (an older build named it) is adopted, not kept twice.

## The executor (`src/sync/run.ts`)

- Every remote write is compare-and-swap; every local write re-reads the document first. Either
  finding a change re-plans that document (3 attempts), so a save made mid-run is never overwritten.
- **The base moves only after both sides agree**, so a run stopped after any single step resumes
  safely. Copies have derived ids, so a resumed run finds its copy instead of making another.
- **A move changes content in place first, then moves identical bytes**, old key removed last. No
  moment shows two different versions (which the other computer would keep as a conflict) and the
  remote never holds no copy.
- **A download is recorded only if the document then reads back as the download.** Anything
  else (a save not from sync landed) re-plans it: both kept. `adopt` carries what the step
  planned against (`expect`); the store re-checks it with none of its own writes between.
- **Absent here is confirmed by id** (`load`, `loadTrashed`) before a download or a remote purge:
  a listing can miss a document still stored. A listing that fails, or lists nothing while the
  base had live documents (the mirror of `remoteWasEmpty`), stops the run: `unavailable`,
  reason `local-unreadable`.
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
- **Opening** (`EditorHost.openDocument`): the editor counts as open before the swap. The start
  screen's read and open, and the open's saves, run with sync held (`whileSyncPaused`, the
  scheduler's `suspend`; a run in flight finishes first). The incoming save is skipped for a
  document stored as it is, or stored and since replaced in the editor (by sync, or an edit).

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
  (`conflicts`, `held`, `errors`, `remoteWasEmpty`), `lastSyncedAt`, `retryAt`. The controller
  publishes it to `syncView.ts`; the desktop console keeps `__econSync.status()` and `.syncNow()`.
- **Controller** (`librarySync.ts`): desktop only, attached by `EditorHost` (via `import()`). Runs the
  scheduler whenever a folder is chosen, reachable or not (a missing folder only pauses sync: no launch
  screen). Choose, stop, Clear, attach and detach share one queue; the scheduler stops before the
  folder changes, since one folder's base run against another reads every absent document as deleted.
  Base id `folder:<deviceId>:<root>`; stopping keeps the base, so the same folder again resumes.
- **Copy names** from `localNamer`: a conflict copy in the interface language at the time, with the
  computer name from Settings (`econgen.settings.sync`, per computer, never synced), else "Mac" /
  "Windows PC"; a provider copy one bilingual name (§ The planner).
- **Clear saved documents** with a folder detaches it (user, 2026-10-07): stop, forget the base,
  `library_forget`, then clear. The folder's files are untouched and nothing refills the library. A
  base that will not clear (or a folder that will not detach) stops it before anything is deleted.
- **Notices** (`syncNotices.ts`, stable ids): conflict copies (every copy this session, Review opens
  Settings), an empty remote refilled, the folder unreachable (once per outage, down at the next good run).
  Needs attention lists this session's copies, then what the last run held (not `busy`) or failed on.
- **Web, later:** `exclusive: webLock()` so one tab runs at a time; forget the hash of every
  `econ-worksheet:` key another tab's `storage` event names.

Known gaps (closed 2026-10-08: a save landing between the engine's re-read and its `adopt`, by
`expect`; a provider copy named two ways). Left: an older build and this one resolving the same
provider copy at the same moment, neither yet seeing the other's copy, still make a second copy.
Opening from the start screen waits out a run in flight.

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
- `adopt(worksheet, expect?)` on both stores: `save`, except it may replace a newer build's document. The
  one refusal (`adoptRefused`, throws `NewerDocumentError`): the stored document is newer than this
  build **and** the incoming schema is lower than the stored one. Stored text that will not parse
  is never replaced. On the web the rule also guards a trashed copy (it shares the key). `expect`
  (`{ place, hash }`, or `null` for nothing) is checked first; a mismatch writes nothing: `'changed'`.
- **The desktop store runs every mutation in one queue** (`FileWorksheetStore.exclusive`): each
  rewrites `index.json` from a read of it across IPC awaits, so two at once dropped a row.
- `list` / `listTrash({ strict: true })` reject when the library cannot be read (desktop); the
  engine reads with it, and the store's own rewrites read strictly, never from a failed `[]`.
- `loadTrashed(id)` on both stores: a trashed document's content (desktop `load` reads only live files).
- The web store takes an optional storage, for two-computer tests. No schema change, nothing in
  `KNOWN_KEYS`, sync state never inside documents.

## Invariants (tested)

`src/sync/property.test.ts`: random edits, trashes, restores, syncs, deliveries and offline
spells on two computers (delayed visibility in half the seeds). Every version that existed at a
sync point survives (itself or a later edit of it) live, as a copy or in Trash; both computers end
identical; no version is held twice. 5,000 seeds at up to 120 steps passed while building. With
the hash cache on (every edit stamped alike in even seeds), no cached hash is ever stale; 5,000
seeds at 40 steps and 1,500 at 120 passed. Outside writers (a save from a pre-run read, landing
just before or after a download's write) join on 2026-10-08; `SYNC_SEEDS=2000` passed.

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
5. ~~Interface~~ **done** (§ The scheduler: controller, notices; Settings → Storage location). Opening a
   conflict copy from Needs attention is not built (no route from Settings to a document yet).
6. Folders, 題型, graphs as later keys.

## Decisions (2026-10-05)

- **Delete forever / Trash expiry removes the cloud copy** (as built): it lands in the provider's own
  recycle bin; the other computer keeps its local Trash copy until its own expiry. (User.)
- **An empty remote is refilled from this computer, with a notice**: "The cloud copy was empty, so
  it was refilled from this computer." The run report's `remoteWasEmpty` drives it (UI stage). (User.)
- `clear()` detaches the folder, base included (user, 2026-10-07; was: forgets the base and refills). A provider-renamed **lone** file holding the only
  copy is adopted as the original, not trashed plus copied (planner change, next stage). A copy's
  name carries that version's own last-edit time. (Coordinator.)

## First real run (by hand, `npm run desktop:dev`, a scratch folder: choosing one uploads the library)

1. Devtools: `__econSync` is `undefined` (nothing started).
2. Settings → Storage location → Choose a folder… → Choose folder…, pick an empty folder.
3. At once: "Synced at …"; `__econSync.status().lastReport.counts.uploaded` = your paper count,
   and the folder holds `<id>.worksheet.json` files.
4. Edit a paper, wait ~5 s: `uploaded` 1. Edit a folder file by hand: `downloaded` within seconds, and an
   open, clean editor reloads with a notice. `__econSync.syncNow()` forces a run.
5. Undo: Stop syncing on this computer…. Also try: rename the folder (warning once, status says why),
   rename it back (warning gone); a conflict (edit one paper on both sides offline) shows in Needs attention.

