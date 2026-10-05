# Library folder: one teacher, two computers (F9)

Status: **build plan, parked 2026-10-05 (user: "not yet").** Written 2026-10-05 against `develop` at `93ba8a0`.
Source: `docs/research/2026-09-paid-product/K-free-sync.md` § 4 (Phase A, written against
`ccaff59`), re-verified against the code below. Reused from the shelved
`docs/design/drive-sync.md`: conflict naming, the first-connect merge, the never-delete rules.

The ask: teachers run the **desktop app on two computers** and want the same papers on both.
Decision (user, 2026-10-05): the desktop library can live in a folder the teacher picks
inside OneDrive, Google Drive for desktop, iCloud Drive or Dropbox. The cloud client moves
the bytes and the app survives the cloud client. Free, no server, no OAuth, any provider.
The web is unchanged.

## 0. Key decisions

1. **The folder is the `worksheets/` directory, moved.** Same file names, same bytes, so every
   released build opens any file in it. No schema change.
2. **Nothing derived or multi-writer goes in the folder**: no `index.json`, no
   `trash/index.json`, no 題庫 index. Lists come from a scan plus a local cache.
3. **All folder I/O goes through new Rust commands** under a root held in Rust (atomic write,
   fsync, compare-and-swap, a watcher), not through a widened plugin-fs scope (§ 4).
4. **Compare-and-swap before every overwrite.** A file changed by the other computer since
   this one read it is never overwritten; the incoming save becomes a named copy (§ 3.3).
5. **Every conflict is kept and shown**, never resolved by deleting (§ 3.4).
6. **Each computer keeps a local history of its own writes**, so an edit a cloud client
   silently dropped (iCloud) is still recoverable on the computer that made it (§ 3.5).
7. **Moving copies, verifies, then switches.** The local copy is never deleted (§ 5).
8. **A second computer joins by merging its own library in**: same paper is linked, a paper
   changed on both keeps both versions, nothing is dropped (§ 1.3).
9. **`clear()` in folder mode detaches; it never deletes from the folder** (§ 3.7).
10. **A marker file** `econ-studio-library.json` in the folder carries a layout `format`,
    so a later build can change the layout and older builds open it read-only (§ 6).
11. **The sync core never assumes a folder** (§ 3.12), so an account server or a cloud API can
    later plug in as another source without rewriting it.

---

## 1. What the teacher sees

Strings go in an area `messages.ts` (en + HK zh, `docs/design/ui-language.md`; OneDrive,
iCloud, Google Drive, Dropbox, Finder stay English; no em dash). The working name is
**Storage location / 儲存位置** (see Q1: "Library" is already 資源庫, the start screen's
Question bank and Graphs rows, and 資料庫 reads as "database").

### 1.1 Settings → Storage location 儲存位置 (desktop only, `available: env.desktop`)

New section file beside `src/components/settings/sections/index.ts`.

- **On this computer (default):**
  > Your papers, question banks and graphs are kept on this computer. To have the same papers
  > on your other computer, choose a folder inside OneDrive, Google Drive, iCloud Drive or Dropbox.
  > 你的試卷、題庫和圖表儲存在這部電腦。如想在另一部電腦使用相同的試卷，請在 OneDrive、Google Drive、
  > iCloud Drive 或 Dropbox 內選擇一個資料夾。

  **Choose a folder… / 選擇資料夾…**
- **In a folder:** the path; **This computer's name / 這部電腦的名稱** (used in copy names);
  "Last checked 14:32" 「最後檢查：14:32」; **Show folder / 顯示資料夾**;
  **Move back to this computer… / 移回這部電腦…**.

### 1.2 Setup (a dialog, after the native folder picker)

1. **Where.** Picked folder holds the marker → use it. Its `Econ Studio` subfolder holds it →
   use that. Otherwise create `<picked>/Econ Studio/`. Refused: inside the app data directory,
   a drive root, the home folder.
2. **Tips**, one line each, shown for the provider the path suggests (always the last two):
   - OneDrive: "In Finder or File Explorer, right-click the Econ Studio folder and choose
     Always keep on this device." 「在 Finder 或檔案總管右按 Econ Studio 資料夾，選擇「一律保留在此裝置上」。」
   - Google Drive: "In Google Drive settings, choose Mirror files, or make this folder available
     offline." 「在 Google Drive 設定中選擇「鏡像檔案」，或將此資料夾設為可離線使用。」
   - iCloud Drive: "Turn off Optimise Mac Storage, or keep this folder downloaded."
     「請關閉「最佳化 Mac 儲存空間」，或保持此資料夾已下載。」
   - "Install this update on your other computer too, then choose the same folder there."
     「請在另一部電腦也安裝此更新，然後選擇同一個資料夾。」
   - "Don't edit the same paper on both computers at the same time. Nothing is lost, but you get
     two copies." 「請勿在兩部電腦同時編輯同一份試卷。內容不會遺失，但會出現兩個副本。」
   - Name this computer, prefilled "Mac" or "Windows PC".
3. **Preview** (an empty folder): "Moves 34 papers, 2 question banks, 5 graphs, 3 folders and
   Trash into …/OneDrive/Econ Studio. A copy stays on this computer." 「會把 34 份試卷、2 個題庫、
   5 個圖表、3 個資料夾和垃圾桶移到 …/OneDrive/Econ Studio。這部電腦會保留一份副本。」
   **Move / 移動** · **Cancel / 取消**. Then a progress bar, then "Done".

### 1.3 The second computer: its own library meets the folder

> This folder already has 34 papers from another computer. This computer has 12. After joining,
> both computers will have 44. 2 are the same paper on both. 1 was changed on both, so both
> versions are kept; this computer's is named "… (Home Mac)".
> 這個資料夾已有另一部電腦的 34 份試卷，這部電腦有 12 份。加入後，兩部電腦都會有 44 份。其中 2 份在兩邊相同；
> 1 份在兩邊都有修改，兩個版本都會保留，這部電腦的版本名為「…（Home Mac）」。

**Join / 加入** · **Cancel / 取消**. Rules, per document id, comparing raw bytes:

| Here | Folder | Result |
|---|---|---|
| only here | — | copied in under its id |
| same bytes, or same after `stringifyWorksheet` round trip | | linked, nothing written |
| different | different | **both kept**: folder keeps the id, this one is saved under a new id named "… (Home Mac)" |
| trashed here | live there | live wins; the trashed copy stays in this computer's frozen local copy |

Same id with different content is **common, not an edge case**: "Open a file" and drops keep
a file's id, so a paper emailed to oneself and edited at home shares the id of the original.
Folders merge with `src/storage/folders.ts:mergeBackupFolders`; 題型 rows union.

### 1.4 Notices

- **Start screen, conflicts** (dismissible, lists the papers, each opens):
  > 2 papers were changed on both computers. Both versions are kept. The second is named
  > "… (Home Mac, 5 Oct 14:32)".
  > 2 份試卷在兩部電腦上都有修改，兩個版本都已保留。第二個版本名為「…（Home Mac，10月5日 14:32）」。
- **Editor, open paper changed elsewhere, no unsaved edits:** reload silently, toast "Updated
  from your other computer." 「已載入另一部電腦的修改。」
- **Editor, open paper changed elsewhere, unsaved edits:** "This paper was changed on your other
  computer while you were editing. Your edits are now a separate copy: "… (Home Mac, 14:32)"."
  「你編輯期間，這份試卷在另一部電腦被修改。你的修改已另存為副本：「…（Home Mac，14:32）」。」
- **Folder unreachable mid-session:** "Can't reach the storage folder. Your edits are kept on this
  computer and will be saved there when it is back." 「無法連接儲存資料夾。你的修改已保留在這部電腦，
  資料夾恢復後會自動儲存。」
- **Folder missing at launch** (a screen, not a toast): "Can't find the storage folder
  …/OneDrive/Econ Studio. Your cloud drive may be signed out or still starting."
  **Try again / 再試一次** · **Choose the folder again… / 重新選擇資料夾…** ·
  **Use this computer's copy (5 Oct) / 使用這部電腦的副本（10月5日）** (Q5).
- **Replaced by an older version** (§ 3.5): "A paper was replaced by an older version from your
  other computer. Your newer version is in Earlier versions." 「一份試卷被另一部電腦的較舊版本取代。
  你較新的版本在「較早版本」中。」
- **Move back:** "This computer will keep its own copy of every paper in the folder. Your other
  computer keeps using the folder; from then on the two are separate." **Move back / 移回** · **Cancel / 取消**.
- **Earlier versions on this computer… / 這部電腦上的較早版本…** in a document's ⋯ menu: a list
  by time; **Open as a copy / 以副本開啟**.

---

## 2. What lives where

```
<chosen>/Econ Studio/                 synced by the cloud client
  econ-studio-library.json            marker: { "format": 1 }
  <id>.worksheet.json                 papers and question banks, today's bytes
  folders.json  patterns.json         CAS-written; provider variants union-merged on read
  trash/<id>.worksheet.json           Trash rows derived by scan (no trash/index.json)
  graphs/<id>.graph.json
$APPDATA/ (hk.econworksheet.desktop)  this computer only
  library-location.json               Rust-owned: state, root, device id and name, move manifest
  library-cache.json                  per file: name, size, mtime, hash, summary; first-seen-in-Trash
  library-history/<id>/<bucket>.json  this computer's own writes
  library-pending/<id>.worksheet.json saves made while the folder was unreachable
  worksheets/                         the pre-move library, frozen; worksheets/library/ (題庫) still live
```

| Data | Where | Why |
|---|---|---|
| Papers, question banks | Folder | The point of the feature; one file each, no shared index |
| Trash | Folder (`trash/`) | A delete on one computer must reach the other; rows by scan |
| Folders, 題型 registry | Folder | Filing follows the teacher; small maps, mergeable |
| Graphs | Folder (`graphs/`) | Teacher's work; same port as documents (`src/storage/fileStore.ts:graphDirFiles`) |
| 題庫 index (`worksheets/library/docs/`, `pack.json`, `journal.json`) | Local | Derived; rebuilt per computer from the change feed. Already AppData-relative through `src/storage/fileStore.ts:libraryDocFiles`, independent of the store's root, so it stays put with no change |
| List cache (replaces `index.json`) | Local | Derived; a shared one is the Zotero failure (K § 2.6) |
| Revision history | Local | It exists to survive a cloud client dropping a write; a synced copy would be dropped too |
| Pending saves | Local | Written exactly when the folder cannot be |
| Translation terms (`econgen.settings.terms`, `src/settings/termPreferences.ts`) | Local in v1, folder in Stage 6 | Lives in webview `localStorage`, not a file; moving it needs a new file format (Q3) |
| Settings, language, appearance, bank cart, start view | Local | Per computer by design |
| AI keys | Keychain, never | Keys never leave the device |
| `library-location.json` | Local | Says where the library is; cannot live inside it |

---

## 3. The store changes

### 3.0 The seam: a `LibraryDir` port

`src/storage/fileStore.ts` calls plugin-fs directly with `BaseDirectory.AppData` in about
40 places (store, Trash, `patternsFile`, `graphDirFiles`). Extract a port (new
`src/storage/libraryDir.ts`): `list(dir)` → `{ name, isDir, size, mtimeMs }[]`,
`read(path)` → `{ text, hash }` or a typed `unavailable` / `missing`, `write(path, text,
{ expect })`, `remove`, `rename`, `mkdir`. Two implementations:

- `appDataDir`: today's plugin-fs calls, **byte-for-byte today's behaviour** (index.json and
  all). `src/storage/fileStore.test.ts` must pass unchanged.
- `folderDir`: the Rust commands (§ 4), reached by `import('@tauri-apps/api/core')` inside a
  function, in `src/platform/` (new `src/platform/library.ts`).

This port is filesystem-shaped on purpose and belongs to the folder source; the sync core sits on
the entry interface of § 3.12, never on paths.

The store resolves its mode lazily on first call (`library_location`), since
`src/storage/index.ts:worksheetStore` is built synchronously at module load. A mode change
reloads the webview; nothing re-points live.

### 3.1 List by scanning

- Folder mode never reads or writes `index.json`. `list()` = one `library_list` call (names,
  sizes, mtimes in one IPC), cached summaries for unchanged `(name, size, mtime)`, a read only
  for new or changed files, then `usableSummaries` as today.
- **A file that will not read is never dropped**: unavailable (cloud-only, offline) or torn
  (fails to parse) lists from its cached summary, else as a placeholder row "Not downloaded
  yet" 「尚未下載」, retried next scan. Never treated as deleted.
- `save()` updates the cache entry; it must not call `list()` (today's `write` relists after
  every save, a full scan per autosave in a synced folder).
- An unreadable or missing cache is rebuilt by the scan (one cold read of every file).

### 3.2 Atomic writes (Rust: `library_write`)

- Write `.<name>.<random>.tmp` beside the target, `sync_all`, rename over it. plugin-fs 2.5.2
  `writeTextFile` truncates in place and never fsyncs (source-read), so a cloud client can
  upload half a file today.
- Windows: rename over a file OneDrive or antivirus holds open fails with a sharing violation.
  Retry with backoff (about 1 s total), then write in place with fsync rather than lose the save.
- **Skip identical bytes**: when the file already holds them, write nothing. Opening a paper
  saves it once (`src/app/EditorHost.tsx`); without the skip every open uploads and bumps mtime
  on both computers.
- Scans ignore dot-names and `.tmp`; a launch removes this app's own temp files older than a day.

### 3.3 Compare-and-swap before overwrite

- The store remembers, per id, the hash it last read or wrote (in the cache, so it survives a
  restart). `save()` passes it as `expect`; Rust compares with the file's current hash and
  writes only on a match (`'absent'` for a new document).
- **Mismatch: the file on disk is not touched.** The store writes the incoming worksheet as a
  copy under a new id, named `"<title> (<computer>, 5 Oct 14:32)"` /
  `「<title>（<computer>，10月5日 14:32）」` in `name` (the printed title untouched), then throws
  `ChangedOnDiskError { id, copyId }`. Further saves of that id this session go to the same
  copy, never a new one per autosave.
- `src/components/EditorApp.tsx` (autosave) and `src/app/EditorHost.tsx:flushBeforeLeaving`
  catch it: switch the editor to `copyId`, show the § 1.4 notice. Other writers (題庫 tag
  writes, ✦ AI verbs, restore) already reload-and-retry or report a failure; the copy means
  nothing is lost even if a caller ignores the error.
- This is the most likely real loss (K § 1): another computer's edit syncs in under an open
  editor, and a blind autosave overwrites it with no provider conflict copy at all.

### 3.4 Provider conflict copies

- **The id inside the file decides, the name only labels.** Any `*.json` in the folder (or in
  `trash/`, `graphs/`) that is not a known sidecar or temp file and parses is a document; one
  whose name is not `<its id>.worksheet.json`, or whose id another file already holds, is a
  conflict copy. Today's scan keeps only `*.worksheet.json` and silently ignores them.
- Name hints, to say where it came from, all **[unverified until Stage 0]**: OneDrive
  `<name>-<PC>.json`, Dropbox `<name> (<who>'s conflicted copy <date>).json`, Google Drive
  `<name> (1).json` or `[Conflict]`, iCloud `<name> 2.json`.
- **Resolved as "keep both", automatically, with the § 1.4 notice** (Q2): written canonically
  under a **deterministic** new id (10 nanoid-alphabet chars from SHA-256 of the original id and
  the file's hash) and name `"<title> (from <hint or 'another computer'>)"`; the provider's file
  is removed only after the new file reads back identical. Both computers resolving the same
  conflict write the same file, never two copies.
- A conflict copy from a newer build is never re-id'd or rewritten: listed read-only, with
  "Duplicate as editable copy" (`src/storage/document.ts:editableCopy`) as today.
- iCloud usually makes **no** visible copy; it keeps one version and hides the other. That case
  is covered by § 3.5, not here.

### 3.5 Local revision history

- After each successful folder write, snapshot the bytes to
  `library-history/<id>/<10-minute bucket>.json` (a later write in the same bucket replaces it,
  so the last state of every editing burst is kept). Keep 30 days, at most 50 per document,
  300 MB in all, oldest first. Plain plugin-fs writes under `$APPDATA`.
- **Replaced-by-older detection**: when a scan finds a file whose hash differs from this
  computer's last write and whose `updatedAt` is older than that write's, show the § 1.4 notice
  and point to history. A device-clock heuristic, so "may" in the wording; exact ancestry is K's
  per-device journal (A2), not in this plan.
- History never syncs and is never read as documents.

### 3.6 Watching for files from the other computer

- Rust watches the root recursively (`notify` + `notify-debouncer-full`, ~1 s debounce; the
  same crates plugin-fs's `watch` feature uses) and emits one `library-changed` event. JS listens
  with a dynamic `@tauri-apps/api/event` import and unlistens through
  `src/platform/index.ts:unlistenSafely`.
- **The watcher is a hint, the scan is the truth**: iCloud and some File Provider and Google
  Drive streaming setups do not notify. Rescan on launch, window focus, before opening a
  document, and every 60 s while visible.
- A scan diffs against the cache and announces through the feed, marked
  `origin: 'elsewhere'` (new optional field on `src/library/types.ts:StoreChange`, in memory
  only): new or changed → `saved`; gone from the root and now in `trash/` → `trashed`; gone →
  `removed`. The 題庫 index re-indexes from these exactly as from a local save
  (`src/library/bankIndex.ts`); its stamps compare `updatedAt` for equality, so clock skew is harmless.
- **Today nothing on the start screen hears the feed** (`src/components/start/StartScreen.tsx`
  lists on mount and after its own actions). It must relist on `elsewhere` events.
- The open editor: changed elsewhere and clean → replace the worksheet and toast; dirty → wait,
  the next save meets § 3.3. Never written under the editor.

### 3.7 `clear()` never empties a synced folder

- Folder mode: `clear()` ("Clear saved documents", `src/app/EditorHost.tsx:clearSavedDocuments`)
  **detaches**: location back to local, cache and history kept, nothing removed in the folder.
  Its confirm text says so. The feed's `cleared` still wipes the local 題庫 index, which then
  rebuilds from the local library.
- Empty Trash, Delete forever and 30-day expiry do delete in the folder, so on both computers;
  the provider's own recycle bin is the backstop. That matches what the teacher asked for.

### 3.8 Newer-build files across machines

- Unchanged and still right: a document from a newer build opens read-only
  (`src/model/migrations.ts:isNewerThanBuild`), `save()` refuses with
  `src/storage/document.ts:NewerDocumentError`, graphs with `NewerGraphError`, 題型 with
  `NewerPatternsError`. The check runs before CAS.
- CAS makes one case safer than today: an older build whose open copy was replaced by a newer
  build's file gets a conflict copy, not an overwrite.
- A marker `format` above this build's `LIBRARY_FORMAT` opens the whole library read-only with
  "Your other computer has a newer Econ Studio. Update this one to keep editing."

### 3.9 Trash in folder mode

- Rows come from scanning `trash/`; `deletedAt` = **max(file mtime, first seen in Trash by this
  computer)**, the latter kept in the cache.
- **Keep copy-then-delete for the move into `trash/`** (today's `moveFile`): it gives the
  trashed file a fresh mtime. A rename keeps the last-edit mtime, so a paper last edited 40
  days ago would expire on its next listing, on both computers.
- Restore keeps today's rule: if the id is live again, it comes back as a copy.

### 3.10 Folders, 題型, graphs

- `folders.json` and `patterns.json` writes use CAS; a mismatch re-reads and re-applies the
  recipe (`src/storage/folders.ts:updateFolders`, `src/storage/patterns.ts:updatePatternRegistry`
  already work from what is stored).
- Variants (`folders*.json`, `patterns*.json` that parse) are union-merged on read and written
  back canonically, then removed after the write reads back. A folder or 題型 deleted on one
  computer can come back from the other's variant; harmless (an empty folder), noted.
- Graphs move with `src/storage/fileStore.ts:graphDirFiles` onto the same port; CAS and conflict
  copies as for documents; no Trash, so a graph gone in the folder is gone.
- The unreadable-registry set-aside (`patterns.corrupt-<time>.json`) is written locally.

### 3.11 Folder unreachable: pending saves

- A failed folder write (unmounted, signed out, permission revoked) saves the bytes to
  `library-pending/<id>.worksheet.json` and keeps the editor dirty; quitting then loses nothing.
- When the folder is back, pending files go through § 3.3 (CAS against the hash they were based
  on), then are removed. Pending documents list (from their files) while the folder is away.

---

### 3.12 Future storage sources (login, cloud APIs)

Not built now; a constraint on Stage 2 so login or a direct cloud API later reuses the sync core.
Asked by the user 2026-10-05.

- **Two layers.** The *source* knows where bytes live (folder, account server, OneDrive/Drive
  API). The *sync core* above it (scan-diff and cache, compare-and-swap, keep-both conflicts,
  Needs attention, local history, pending saves, the join merge, Trash rules) knows only entries.
- **The core speaks in entries, not paths.** An entry is `{ key, revision, size }`, `key` being
  the logical name (`<id>.worksheet.json`, `trash/<id>…`, `graphs/<id>…`). `revision` is opaque:
  a content hash for a folder, an ETag or server version later. Compare-and-swap is
  `write(key, text, { expectRevision })`; the core never reads `mtimeMs` or a path.
- **Folder-only operations stay inside the folder source**: `rename`, `mkdir`, temp-file atomic
  writes, provider conflict-copy name patterns, the file watcher. The core asks `changes()` for
  "keys changed since my last look"; a folder answers from its watcher + scan, a server from a
  change feed.
- **Same rules everywhere.** Sync metadata stays outside documents; files keep today's bytes; the
  device id and name become an account's devices; login never gates local work
  (`docs/research/2026-09-paid-product/B-auth.md`).
- **Check in review:** the core's tests run against an in-memory source as well as the fake
  folder, and nothing outside the folder source imports the Rust library commands.

## 4. Tauri permissions

Today `src-tauri/capabilities/default.json` grants fs read/write/remove/rename/exists/read-dir
on `$APPDATA/**` only, and its description says `$HOME/**` is deliberately not granted.

**Recommended: app commands in a new `src-tauri/src/library.rs`**, declared in
`src-tauri/build.rs` like `print_to_pdf`, granted as `allow-library-*`:

| Command | Does |
|---|---|
| `library_location` | the state from `library-location.json` |
| `library_choose` | opens the native folder picker **from Rust** (`tauri_plugin_dialog` `pick_folder`), validates, writes the root; JS never supplies an absolute path |
| `library_list` / `library_read` / `library_write` / `library_remove` / `library_rename` | paths relative to the root; reject absolute, `..`, and anything that canonicalises outside the root (symlinks) |
| `library_watch` | starts the watcher for the current root |
| `library_set_state` | `moving` → `folder` → `local`; never a new root |
| `library_reveal` | opens the root in Finder or Explorer (`opener:allow-open-path` does not cover cloud folders) |

- **Root kept across restarts** in `$APPDATA/library-location.json`, written only by Rust
  (temp + rename). The capability adds a **deny** for that path to `fs:allow-write-text-file`,
  `fs:allow-remove` and `fs:allow-rename`, so page script cannot forge a root. Rust re-validates
  on load (exists, is a directory, has the marker or is the one being moved into).
- Hashing uses `sha2` (already in `src-tauri/Cargo.lock`); add `notify`,
  `notify-debouncer-full` to `src-tauri/Cargo.toml`. Update the capability description.
- **Rejected: dialog plugin + `tauri-plugin-persisted-scope`.** The dialog grants the picked
  directory to the fs scope (`allow_directory`, recursive only with `recursive: true`,
  source-read dialog 2.7.3), and persisted-scope would keep it. But: the grant covers whatever
  the teacher picked (a whole OneDrive); persisted-scope also keeps every save-dialog and
  file-drop grant forever; plugin-fs gives no fsync, no CAS and no sharing-violation retry; and
  its state file sits under `$APPDATA`, which page script can write **[unverified exact path]**.
- Security trade-off, stated: page script can read and write inside the chosen root through
  these commands, no more. The root changes only through a native dialog the teacher answers.
- No `@tauri-apps/*` import at top level: the bridge is `src/platform/library.ts` (new), dynamic
  import behind `isDesktop()`; `src/test/tauriImports.test.ts` and
  `scripts/check-web-bundle.mjs` guard it.

---

## 5. Moving the library, and back

`library-location.json` is a small state machine: `local` → `moving { root, manifest }` →
`folder { root, manifest }` → (move back) `local`. Switching is one atomic write of that file.

**Into the folder:**
1. Preflight backup zip into `$APPDATA` (`src/storage/backup.ts`).
2. `moving`: copy **raw bytes** (not parse and restringify, so a newer build's file moves
   untouched) of documents, `trash/`, `graphs/`, `folders.json`, `patterns.json`. The
   manifest records each file's hash. A joining computer applies § 1.3 instead of plain copy.
3. Verify: every manifest file reads back with its hash. Then write the marker, then `folder`.
4. The `$APPDATA/worksheets/` documents are never written again in folder mode, and never
   deleted. The 題庫 index there stays live (unchanged ids and stamps, so nothing re-indexes).

**Interrupted** (quit, crash, folder gone mid-copy): launch finds `moving`, offers
**Continue / 繼續** (copy is idempotent: identical bytes skip) or **Cancel / 取消** (back to
`local`; the copied files stay in the folder and are listed if the teacher joins later).
Until `folder` is written, the store stays on `$APPDATA`.

**Back to this computer:** for each folder file, if the local file still has the hash the
move manifest recorded (untouched since the move), replace it; if it differs (an older build
edited it), keep both; if absent, copy. Then `local`. The folder is left as it is.

**Folder disappears:** at launch, the missing-folder screen (§ 1.4); mid-session, § 3.11.
A signed-out cloud client usually leaves the folder in place but stops syncing; the app cannot
tell, which is why the setup tips exist. macOS may ask for access to iCloud Drive or a
File Provider folder on the first launch after choosing it **[unverified]**; a refusal shows
the missing-folder screen with "System Settings → Privacy & Security → Files and Folders".

---

## 6. Backward compatibility

- **No schema change.** Documents, graphs, `folders.json`, `patterns.json` keep their exact
  formats; nothing goes in `KNOWN_KEYS`; `CURRENT_SCHEMA_VERSION` untouched. Conflict copies use
  the existing `name` field.
- **New persisted formats**, all outside documents: the marker `econ-studio-library.json`
  (in the folder, read by other computers, so it gets a frozen fixture,
  `src/test/corpus/library-marker-v1.json`, emitted at the release tag like the bank fixtures);
  `library-location.json` and `library-cache.json` (local; unreadable → treated as `local` /
  rebuilt; the location file also gets a frozen fixture, since misreading it hides a library).
- **The rule for a teacher who updates one computer only:** a computer uses the folder only
  after it runs a build with this feature **and** the teacher chooses the folder on it. Until
  then it keeps its own separate library, exactly as today, and nothing moves between them.
  When it joins later, § 1.3 merges it in. Older builds never see the folder setting; files
  from the folder still open in them through "Open a file".
- A downgrade on a computer in folder mode (manual reinstall of an older build; the updater
  never downgrades) shows the frozen pre-move library. Stale, never empty.
- **Frozen corpus untouched.** `src/test/corpus/v1-published.json` and the v2, graph and bank
  corpus files are read, never rewritten. `src/model/backwardCompat.test.ts` and
  `src/storage/legacyIndex.test.ts` pass unchanged at every stage.

**Tests:**
- `src/storage/fakeCloudFs.ts` (new test kit): an in-memory folder seen by two "computers"
  through a simulated cloud client: delayed and out-of-order arrival, torn files, cloud-only
  files that fail to read offline, per-provider conflict behaviour (OneDrive rename, Dropbox
  copy, iCloud silent winner), Windows rename sharing violations, controllable mtimes.
- `src/storage/fileStore.test.ts` parametrised over `appDataDir` and `folderDir`: every
  existing rule also holds in folder mode.
- `src/storage/libraryFolder.test.ts` (new): K § 6.2's list, plus: v1 corpus bytes dropped in
  list, open and round-trip byte-identically; a `schemaVersion: 99` file is never written,
  renamed or re-id'd; CAS mismatch leaves the disk file byte-identical and makes exactly one copy
  per session; identical-bytes save writes nothing; Trash expiry ignores an old mtime; the
  deterministic conflict id is the same on both computers; join with same-id-different-bytes
  keeps both; move-back manifest rule; interrupted move resumes and cancels cleanly; pending
  saves survive a "restart" and replay through CAS; `clear()` deletes nothing in the folder.
- `src/storage/twoComputers.test.ts` (new): random interleavings of edits, trashes, restores,
  renames, offline spells and skewed clocks. Invariants: every version either computer wrote is
  reachable (live, Trash, a copy, or that computer's history); no deletion except purge, Empty
  Trash, expiry; copies stay bounded (no ping-pong).
- Rust `cargo test` in `src-tauri/src/library.rs`: path validation, atomic write leaves old or
  new bytes only, CAS mismatch writes nothing, retry loop with an injected failing rename.

---

## 7. Stages

Each stage merges to `develop` with `npm test`, typecheck, the lint baseline, `npm run
samples` and the web bundle check green. Stages 1–4 ship dark (nothing reaches a teacher
until Stage 5 adds the entry point). Sizes: S ≈ 1–2 days, M ≈ 3–5, L ≈ 1–2 weeks.

| # | Stage | Size | Files |
|---|---|---|---|
| 0 | Provider probe (by hand, no code) | S | none |
| 1 | Rust library commands + bridge | M | `src-tauri/src/library.rs` (new), `src-tauri/src/lib.rs`, `src-tauri/build.rs`, `src-tauri/Cargo.toml`, `src-tauri/capabilities/default.json`, `src/platform/library.ts` (new) |
| 2 | `LibraryDir` port and the entry-level sync core (§ 3.12); folder-mode store: scan + cache, CAS, atomic writes, conflict detection, Trash by scan, folders/題型/graphs, `clear()` detach, pending saves | L | `src/storage/libraryDir.ts` (new), `src/storage/fileStore.ts`, `src/storage/index.ts`, `src/storage/graphs.ts`, `src/storage/document.ts` (`ChangedOnDiskError`), tests above |
| 3 | Watcher, rescans, feed `origin`, start screen relist, editor reload / copy switch | M | `src/storage/changes.ts`, `src/library/types.ts`, `src/components/EditorApp.tsx`, `src/app/EditorHost.tsx`, `src/components/start/StartScreen.tsx` |
| 4 | Conflict resolution (deterministic keep-both), conflict notice, local history + Earlier versions, replaced-by-older notice | M | store, `src/components/start/`, editor ⋯ menu, a `messages.ts` |
| 5 | Settings section, setup dialog, move / join / move back, interrupted-move recovery, missing-folder screen, marker + fixtures, CHANGELOG line | L | `src/components/settings/sections/`, `src/storage/backup.ts`, `src/test/corpus/` |
| 6 | Translation terms in the folder (`terms.json`, per-row union) | S | `src/settings/termPreferences.ts`, store, a frozen fixture |

**Verify per stage** (unit tests as § 6, plus `npm run desktop:dev`):
- **0 (user, two computers, ~1 hour per provider, a scratch text file):** create a conflict on
  each provider you care about (edit offline on both, reconnect) and write down the exact
  conflict file names; on Windows OneDrive, rename a file over another while OneDrive is
  uploading it. Results replace the [unverified] name hints in § 3.4.
- **1:** `cargo test`; in `desktop:dev`, call `library_choose` from the devtools console, list,
  read, write; quit and relaunch, the root is still there; a write to `../x` is refused; page
  script cannot write `library-location.json` (plugin-fs denied).
- **2:** parametrised and new tests; in `desktop:dev` with a root set by console, the start
  screen, 題庫, Trash, folders, 題型 and graphs all work on a local folder; `npm run build`
  bundle check passes.
- **3:** copy a document file into the folder by hand → it appears within a few seconds
  without a restart, and 題庫 lists its questions; edit it by hand while it is open and clean →
  the editor reloads; while dirty → a copy and the notice.
- **4–5:** the two-computer checks below.

**Manual two-computer checks** (Mac + Windows PC, before Stage 5 reaches teachers):
1. A moves a real-sized library (30+ papers with images, a 題庫, graphs, 3 folders, items in
   Trash, 題型) into OneDrive; counts match; reopen several papers and export one `.docx`.
2. Kill the app mid-move on A; relaunch → Continue finishes; repeat → Cancel returns to local
   with nothing lost.
3. B (with its own library, including a paper emailed from A and edited on B) joins → the
   preview counts are right; afterwards both papers' versions exist on both computers.
4. New paper on A → appears on B within about a minute, no restart; 題庫 on B finds its questions.
5. A paper open and unedited on B, edited on A → B reloads it with the toast.
6. The same paper edited on both while one is offline, then reconnected → both versions kept,
   named, notice shown on the computer that made the copy.
7. Trash on A → in B's Trash; restore on B → live on A; Empty Trash on B → gone on both.
8. A folder move, a 題型 added on each computer offline, then reconnected → both 題型 on both.
9. A graph saved on A opens on B.
10. Unplug the network / quit OneDrive on B, edit, quit the app, relaunch → the edits are there
    (pending); reconnect → they reach A.
11. Sign out of the cloud client or rename the folder → the missing-folder screen; each button works.
12. OneDrive Files On-Demand with "Free up space" on some files (Windows), and iCloud with
    Optimise Mac Storage (Mac): papers still list; opening one downloads it; offline shows
    "Not downloaded yet", never an empty or shorter list.
13. Repeat 4–6 on iCloud Drive (Mac to Mac if available) and Google Drive for desktop: for
    iCloud, confirm the losing edit is in Earlier versions and the replaced-by-older notice shows.
14. Move back on B → B keeps every paper; A keeps working on the folder; the two are separate.
15. B left on v0.6.0 while A runs the new build → B still opens its own library untouched.
16. macOS: the first launch after choosing an iCloud or CloudStorage folder (any permission
    prompt; refusing it shows the missing-folder screen).

**Effort:** about 4–6 weeks for a solo developer, not K's 1.5–3 (§ 9).

---

## 8. Open questions for the user

**Answered 2026-10-05:** the setting is **Storage location / 儲存位置**; a missing folder shows the
**wait screen**; conflict copies are kept automatically with a "Needs attention" list (survey);
computer name asked at setup; Translation terms per computer until Stage 6. Start: parked.

1. **The name.** "Library location / 資料庫位置" as briefed, or **Storage location / 儲存位置**?
   *Recommended:* Storage location / 儲存位置. "Library" is already 資源庫 (the start screen's
   Question bank and Graphs rows), and 資料庫 reads as "database" to an HK teacher.
2. **Provider conflict copies:** resolve automatically as "keep both" with a notice, or ask per
   paper? *Recommended:* automatic. Asking leaves a version hidden until someone clicks, the
   exact "looks lost" failure; the deterministic id keeps two computers from doubling it.
3. **Translation terms:** per computer in v1, synced in Stage 6? *Recommended:* yes. They live in
   settings storage, not a file; moving them adds a format, and Backup already carries them
   (`terms/translation-terms.csv`) for a one-off copy.
4. **Computer name in copy names:** ask during setup, prefilled "Mac" / "Windows PC"?
   *Recommended:* yes; "this computer" means the opposite on the other machine.
5. **Folder missing at launch:** a screen that waits for the teacher (Try again / Choose again /
   Use this computer's copy), or open the stale local copy automatically? *Recommended:* the
   screen. Silently editing the stale copy creates a second, diverging library.

---

## 9. Risks found while re-verifying (and where K is now wrong)

- **K § 4.1 "a second device joining simply opens it" would strand that device's library.**
  Its own papers become invisible (intact, unreachable). Join must merge (§ 1.3), and same-id
  pairs are common because "Open a file" keeps ids.
- **Trash expiry by mtime can delete fresh Trash on both computers** if any code moves a file
  into `trash/` with a rename (§ 3.9). K proposed `deletedAt = mtime` without this guard.
- **Every save relists today** (`write` → `list()`); in folder mode that is a full scan per
  autosave. And **opening a paper writes it**; without the identical-bytes skip every open
  uploads on both computers.
- **The start screen does not hear the change feed**, so arrivals from the other computer would
  not show until it remounts (§ 3.6). K assumed the feed reaches the dashboard.
- **Autosave lives in `src/components/EditorApp.tsx`**, fire-and-forget (`void save().then(…)`);
  a CAS error there is unhandled today, so Stage 3 must land with Stage 2's error type.
- **plugin-fs never fsyncs and `rename` gets no retry** (source-read 2.5.2); Windows rename over
  a file OneDrive holds can fail. Confirms K's Rust-command route over the scope route.
- **persisted-scope widens over time** (every dialog and drop grant persists) and its state file
  location relative to our `$APPDATA/**` write grant needs checking; another reason to avoid it.
- **iCloud silent losers cannot be detected exactly** without K's per-device journal (A2). The
  replaced-by-older heuristic uses device clocks; skew can hide a loss (history still holds it).
- **Topic tags' newest-wins uses device clocks** (`src/library/sharedTags.ts:sharedTags`); two
  computers make skew matter more. Unchanged, noted.
- **New since K, all handled above:** graphs, translation terms (not a file on desktop), the
  題庫 index's `docs/` + `pack.json` + `journal.json` (local, unaffected), Trash, `kind` repair
  (irrelevant without an index file), `patterns.json` already atomic.
- **Why bigger than K's estimate:** K predates graphs, terms and the current Trash and 題庫
  layout, and leaves out the editor's conflict handling, the start screen's live relist, the
  join merge, pending saves, move-back, interrupted-move recovery, the watcher, a Rust command
  layer, and two-computer verification on four providers.
