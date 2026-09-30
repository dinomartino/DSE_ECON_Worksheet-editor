# K. Free sync: "bring your own cloud" first, a server only if ever needed

Econ Studio 經濟備課室. Researched 2026-09-30 against `develop` (ccaff59). This follows
`docs/research/2026-09-paid-product/E-cloud-sync.md` (E) and does not repeat its Supabase
design. The question here is narrower: how do a teacher's documents follow them between
the school PC, the home Mac and the web **at near-zero operating cost to the owner**?

Markers: **[unverified]** means from memory or a secondary source, not checked against a
primary source. **[source-read]** means verified by reading upstream source code.

---

## 0. TL;DR

- **Phase A: desktop "Library location…". Recommended now.** The teacher points the library
  at any folder: OneDrive, Google Drive for desktop, iCloud Drive, Dropbox, or a USB stick.
  There is no server, no account and no cost. The sync client moves the bytes; the app's job
  is to **survive** the sync client. That means five changes to `FileWorksheetStore`:
  1. derive the list by scanning the folder, and keep no `index.json` in the synced folder;
  2. write atomically (temp file, then rename);
  3. compare-and-swap before overwriting (app-level CAS);
  4. detect conflict copies and show them, instead of silently ignoring them as today;
  5. keep a local revision history on each device.

  The document format does not change, so the frozen corpus still covers it and nothing
  goes in `KNOWN_KEYS`. Effort: about 1.5–3 weeks for a solo developer.
- **Phase B1: web on Chrome/Edge opens the same local folder through the File System Access
  API. Zero cost, no OAuth.** It reuses Phase A's store behind a small directory adapter. It
  covers the locked-down school PC where the desktop app cannot be installed but OneDrive
  and Edge are present. Safari and Firefox stay local-only, with backup and import.
- **Phase B2: provider APIs for the web on any browser. Optional; only if teachers ask.**
  - Do **OneDrive's App Folder** first. It is folder-scoped, so it sees files the desktop
    app wrote into `OneDrive/Apps/Econ Studio`.
  - Dropbox's App folder is next.
  - **Skip Google Drive's `drive.file`.** It is per-file, so the web cannot see documents the
    desktop wrote through the Drive client.
- **Phase C: self-hosted Cloudflare R2 + D1 + Workers.** The free tier fits the stated load
  (1.5 GB, or about 4.5 GB with history, under a 10 GB free allowance). But the owner becomes
  the operator and PDPO data user, and must build auth, quotas, abuse controls and backups.
  **Not worth it for a free app.** Do it only if the paid product (E) happens, and then use
  E's design.
- **Correction to E §3.** E says OneDrive's `Files.ReadWrite.AppFolder` works only for
  personal accounts. The **current** Microsoft Learn page (updated 2025-08) says "App folder
  works across OneDrive for work or school and OneDrive for home". It is also not in
  Microsoft's default blocked-consent list. School tenants can still block unverified
  publishers (§3.2).

---

## 1. Where the data lives today (read from the repo)

| | Web | Desktop (Tauri 2) |
|---|---|---|
| Store | `LocalStorageWorksheetStore` (`src/storage/index.ts`, `window.localStorage` at l.82). Not IndexedDB. | `FileWorksheetStore` (`src/storage/fileStore.ts`) |
| Location | Browser origin storage | `appDataDir()/worksheets/` = `${dataDir}/hk.econworksheet.desktop/worksheets/`. On macOS that is **`~/Library/Application Support/hk.econworksheet.desktop/worksheets/`**. On Windows it is **`%APPDATA%\hk.econworksheet.desktop\worksheets\`**, where `dataDir` = `{FOLDERID_RoamingAppData}` ([Tauri path API](https://v2.tauri.app/reference/javascript/api/namespacepath/)). |
| Files | one key per document (`econ-worksheet:<id>`) plus the `econ-worksheet-index` array | `<id>.worksheet.json` **one file per document (already)**, plus `index.json`, `folders.json`, `patterns.json`, `trash/<id>.worksheet.json`, `trash/index.json`, and `library/index.json` (the question bank's derived index) |
| `~/Documents` | — | **Only for exports**: `~/Documents/Econ Worksheets` (`src/platform/index.ts:67,103-107`). The capability grants only `mkdir` there. No document is stored under Documents. |
| fs scope | — | `src-tauri/capabilities/default.json` grants read, write, remove, rename, exists and read-dir **on `$APPDATA/**` only**. The description says `$HOME/**` is deliberately not granted. |

Facts that matter for sync:

- **The index is authoritative when present.** `list()` returns `index.json` if it parses,
  and scans the directory only when `index.json` is missing or corrupt (`rebuildIndex`).
  - In a synced folder, a document arriving from another device is **invisible** until
    the index is rebuilt.
  - An `index.json` synced ahead of its documents lists rows that cannot open.
  - Two devices writing `index.json` produce conflict copies of it.
- **Writes are not atomic.** `writeTextFile` opens with `truncate: true, create: true` and
  writes in place (plugin-fs `write_file_inner`) **[source-read]**. A sync client can upload
  a truncated or half-written file.
- **Conflict copies are silently ignored today.** The scan keeps only names ending in
  `.worksheet.json`, and every client's conflict name breaks that suffix (§2.1). The
  teacher's other version exists on disk but never appears in the app. That is the worst
  possible failure mode: nothing is lost on disk, yet it looks lost.
- **`clear()` deletes every `*.worksheet.json` in the directory.** In a synced folder this
  becomes "delete my library on every device".
- **Autosave overwrites blindly.** It runs after a 1.2 s debounce (`src/app/EditorHost.tsx`).
  If another device's edit syncs in while a document is open here, the next autosave
  overwrites it. The sync client sees an ordinary sequential edit and makes **no conflict
  copy**, so the other edit is simply gone. **This is the most likely real-world data loss**,
  and only the app can prevent it (app-level CAS, §4.3).
- `NewerDocumentError` already refuses to overwrite a newer-schema document, and it keeps
  working unchanged in a synced folder.

---

## 2. Consumer sync clients: behaviour the app must survive

### 2.1 Simultaneous edits: what each client does

| Client | What happens on a conflict | Example name for `abc.worksheet.json` | Visible to a scan? |
|---|---|---|---|
| **OneDrive** | For non-Office files it keeps both and appends the **computer name** to one copy: "MyFile.txt" becomes "MyFile-ComputerName.txt" ([MS Q&A](https://learn.microsoft.com/en-us/answers/questions/5389639/onedrive-renamed-and-appended-machines-name-to-all-files-on-production-machine), [abraunegg discussion](https://github.com/abraunegg/onedrive/discussions/2133)). | `abc.worksheet-SCHOOLPC.json` **[unverified exact placement for double extensions]** | Yes, as a separate file |
| **Dropbox** | Keeps the original and adds a "conflicted copy" naming the person or computer and the date ([Dropbox Help](https://help.dropbox.com/organize/conflicted-copy)). | `abc.worksheet (Tino's conflicted copy 2026-09-30).json` | Yes |
| **Google Drive for desktop** | Not documented by Google. Secondary sources report a `[Conflict]` suffix or "Copy of", and say the naming has changed over time ([filerev](https://filerev.com/blog/find-resolve-conflicted-google/)). **[unverified]** | `abc.worksheet[Conflict].json` or `Copy of …` | Probably yes |
| **iCloud Drive** | Document-based Cocoa apps show a picker, and kept versions become "Name 2" ([Apple](https://support.apple.com/en-ca/guide/mac-help/mh40780/mac)). **Outside that picker, iCloud "resolves them automatically by picking up a winning version and keeping the other changes in a losing version"** stored as hidden `NSFileVersion`s. Only *new-file* conflicts produce a visible "bounced" copy ([TN2336](https://developer.apple.com/library/archive/technotes/tn2336/_index.html)). | Usually **none**: the losing edit is hidden in the version store. New-file collisions give `abc.worksheet 2.json`. | **Often no.** A Tauri app never sees the loser. |

Consequences:

1. **The app cannot rely on the sync client to keep both versions.** iCloud, the most
   likely client for a home Mac, silently picks a winner. So every device must keep its
   **own local history** of what it wrote (§4.4). Then the losing edit still exists on the
   device that made it, and "Restore from this computer's history" can recover it.
2. Any `*.json` file in the library folder that is not a known sidecar and parses as a
   `Worksheet` is a document. When two files hold the **same `id`**, or a file's name is
   not `<id>.worksheet.json`, it is a **conflict copy**. Name patterns are only a hint; the
   id inside the file is the real test.

### 2.2 Placeholder and online-only files

- **Windows (OneDrive, and other Cloud Files API clients):**
  - Placeholders "automatically hydrate into full files under normal use conditions". Apps
    need no code changes: "the file will hydrate without additional code changes"
    ([MS Learn: cloud files API](https://learn.microsoft.com/en-us/windows/win32/cfapi/build-a-cloud-file-sync-engine)).
  - **But** background hydration raises "an interactive toast", and "if a user blocks an app
    from hydrating files through an interactive toast", hydration stops until the user
    unblocks it in Settings → **Automatic file downloads**. A placeholder is also "only
    available if the sync service is available", so offline plus online-only means a read
    error.
  - **Design rule: never hydrate the whole library on every launch.** Cache each summary
    locally, keyed by `(file name, size, mtime)`. Reading a directory and its metadata does
    not hydrate. Read a body only on a cache miss or when the document is opened.
- **macOS (OneDrive and Google Drive in `~/Library/CloudStorage`, and iCloud Drive):**
  - These use File Provider "dataless" files. A plain `read()` materializes them by default
    **[unverified; from memory of the `IOPOL_TYPE_VFS_MATERIALIZE_DATALESS_FILES` policy]**.
  - Obsidian tells users on "macOS 14 and earlier" to turn off **Optimize Mac Storage**, and
    tells OneDrive users to mark the vault "Always keep on this device", because offloading
    breaks vault access ([Obsidian: sync your notes](https://obsidian.md/help/sync-notes)).
  - Logseq reports lost entries with iCloud when Optimize Storage is on
    ([logseq#10499](https://github.com/logseq/logseq/issues/10499)).
  - macOS may show a privacy prompt the first time an app reads `~/Documents` or another
    app's File Provider domain **[unverified exact prompt text and version]**.
- **Rules for the app:**
  - A file that exists but cannot be read, because it is dataless and offline, is shown as a
    row from the cached summary, or as "Not downloaded yet — (id)". **It is never dropped
    from the list and never treated as corrupt or deleted.**
  - On first setup, show one tip: *"In OneDrive or Google Drive, right-click this folder →
    Always keep on this device."*

### 2.3 File watching

- Tauri's fs plugin can watch folders. It needs the Cargo feature
  `tauri-plugin-fs = { features = ["watch"] }` and the permissions `fs:allow-watch` and
  `fs:allow-unwatch` ([Tauri fs plugin](https://v2.tauri.app/plugin/file-system/)).
- Watch events on cloud placeholders are unreliable. Logseq's FAQ says "iCloud doesn't
  notify apps on file updated"
  ([Logseq FAQ](https://discuss.logseq.com/t/im-using-logseq-with-icloud-but-experiencing-data-loss-or-file-conflict-errors-whats-going-on/13393)).
  Google Drive's streaming virtual drive on Windows may not deliver change notifications
  **[unverified]**.
- **Use the watcher only as a hint. The ground truth is a cheap metadata rescan** (a
  directory listing plus `stat`) on start, on window focus, before opening a document, and
  every 60 s while the window is visible.

### 2.4 Partial-sync races

Documents, `folders.json`, `patterns.json` and `trash/` arrive independently, in any order.

| Race | What happens today | What the design does |
|---|---|---|
| `index.json` arrives before the documents it lists | The list shows rows that cannot open | **No `index.json` in the synced folder.** The list comes from a scan plus a local cache. |
| A document arrives without an index row | Invisible until the index is rebuilt | The scan finds it |
| A half-downloaded or truncated document | Parse fails, so it is dropped from the list | Keep the row, marked "syncing…". Retry on the next scan, never delete it. Atomic writes on our side make this rare. |
| `folders.json` names documents not here yet | Already tolerated: stale assignments are ignored (`folders.ts` header) | No change. A document shows at root until its folder file arrives. |
| Both devices edit `folders.json` or `patterns.json` | Conflict copy, one side's filing lost | **Union-merge** `folders*.json` and `patterns*.json` variants on read (they are maps, so the merge is lossless, as backup restore already does), then write back the canonical file |
| `trash/index.json` conflicts | Same | In folder mode, derive Trash rows by scanning `trash/`. `deletedAt` = the file's mtime (the move is a fresh write, `moveFile`). |

### 2.5 School-managed OneDrive: Known Folder Move (KFM)

- **What KFM does.** Admins can "silently move Windows known folders to OneDrive", and can
  "prevent users from turning off Known Folder Move"
  ([MS Learn: KFM](https://learn.microsoft.com/en-us/sharepoint/redirect-known-folders)).
  Tauri's `documentDir()` is `{FOLDERID_Documents}`, which follows the redirect. So on a
  KFM-managed school PC, **`~/Documents/Econ Worksheets` (exports) is already in the
  school's OneDrive**.
  - A library location under Documents would therefore sync automatically on those machines.
  - It lives in the **school tenant**: it leaves with the teacher's school account, and
    their home Mac cannot see it without signing in to the school OneDrive.
  - Recommend a folder the teacher chooses deliberately, not an automatic default
    under Documents.
- **Shared or locked classroom PCs.** These may run no OneDrive session, or wipe profiles on
  logoff (Deep Freeze style) **[unverified prevalence in HK schools]**. Roaming AppData can
  roam `%APPDATA%` between domain PCs **[unverified whether HK school domains use roaming
  profiles]**. Where the desktop app cannot be installed, Phase B1 (web plus a local folder)
  is the answer.
- Admins can exclude file types from OneDrive sync **[unverified policy name]**. `.json` is
  unlikely to be blocked.

### 2.6 How other file-based apps fare

| App | Stance | Lessons |
|---|---|---|
| **Obsidian** | Supports iCloud, OneDrive, Google Drive and Dropbox vaults, with caveats: "iCloud Drive on Windows may lead to file duplication or corruption", OneDrive Files On-Demand "prevents Obsidian from accessing vault files", and "avoid syncing the same vault across multiple services" ([help](https://obsidian.md/help/sync-notes)). | Plain files per note, no shared index, an in-app file recovery (snapshots). **Closest model to ours.** Copy the warnings into our setup screen. |
| **Logseq** (file graphs) | Official FAQ lists iCloud duplicates, missed notifications and stuck uploads, and advises "avoid editing files on multiple devices at the same time" and backups; deleted or conflicted files go to `logseq/bak` ([FAQ](https://discuss.logseq.com/t/im-using-logseq-with-icloud-but-experiencing-data-loss-or-file-conflict-errors-whats-going-on/13393)). "File modified on disk" prompts and data loss are in the issue tracker ([#8269](https://github.com/logseq/logseq/issues/8269), [#5802](https://github.com/logseq/logseq/issues/5802)). | Its editor held state that raced the disk. **That is exactly our autosave hazard.** A `bak/` folder is the same idea as our local history. |
| **Zotero** | "Storing your Zotero data directory in a cloud storage folder … is extremely likely to corrupt your database", because cloud tools don't honour SQLite locks and conflicted copies "would quickly proliferate" ([Zotero KB](https://www.zotero.org/support/kb/data_directory_in_cloud_storage_folder)). | **Never put a multi-writer database or index in the synced folder.** Our per-document JSON is the safe shape. The shared `index.json` is the Zotero-shaped risk. |

---

## 3. Web access to the same documents, at zero cost

### 3.1 Option B1: the File System Access API on Chrome/Edge (recommended)

- `showDirectoryPicker()` gives the static web app read and write access to a **local
  folder**, including the OneDrive or Google Drive folder that the school PC already syncs.
  There is no OAuth, no provider app registration and no server.
- **Persistence.** Chrome 122 added "Allow on every visit". Installed PWAs "automatically
  persist permissions once the user grants access". Non-installed sites re-prompt with the
  three-way prompt ([Chrome blog](https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api)).
  Edge is Chromium, so the same should apply **[unverified for Edge]**.
- `createWritable()` writes to a swap file and swaps it in on `close()`, which is effectively
  atomic **[unverified; from memory of Chrome's `.crswap` behaviour]**.
- **Not on Safari or Firefox** **[unverified current status]**. On those, the web stays
  local-only (localStorage) with backup zip export and import (`src/storage/backup.ts`).
- **Why it fits.** The school PC, where installing apps is most often blocked, is exactly
  where Edge and OneDrive already exist. The same `FolderWorksheetStore` (§4) runs over an
  FSA adapter instead of the Tauri fs adapter.

### 3.2 Option B2: provider APIs from a static site

| Provider | Scope | Needs a verification or security review? | Sees files the desktop wrote via the sync client? | Conditional write (CAS) | Notes |
|---|---|---|---|---|---|
| **OneDrive / Microsoft Graph** | `Files.ReadWrite.AppFolder`, which creates `Apps/<app name>` | App folder "works across OneDrive for work or school and OneDrive for home" ([MS Learn](https://learn.microsoft.com/en-us/graph/onedrive-sharepoint-appfolder)). `Files.ReadWrite.AppFolder` is **not** in the default "Microsoft managed" blocked-consent list, which blocks `Files.Read(Write).All` and `Sites.*` among others ([MS Learn](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/manage-app-consent-policies)). **But** with risk-based step-up consent on, users "can't consent to most newly registered multitenant apps that aren't publisher verified" (apps registered after 2020-11-08). Publisher verification is **free** but needs a verified Microsoft AI Cloud Partner Program account, an Entra work-account tenant and a custom publisher domain (not `*.onmicrosoft.com`) ([MS Learn](https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview)). Tenants can also disable user consent entirely. | **Yes.** It is folder-scoped: point the desktop library at `OneDrive/Apps/Econ Studio` and the web sees the same files. | `If-Match` on eTag **[unverified]** | Best interop. MSAL.js with auth code + PKCE works for a single-page app **[unverified detail]**. |
| **Dropbox** | App folder: "a dedicated folder named after your app" | A development app links up to 500 users. After 50 linked users you have two weeks to get **production approval** (no fee stated) ([Dropbox dev guide](https://docs.dropboxapi.com/dropbox-api/docs/developer-resources/developer-guide)). | **Yes** (`Dropbox/Apps/Econ Studio`) | `mode: update(rev)` **[unverified]** | PKCE in the browser **[unverified here]**. Low usage among HK teachers **[unverified]**. |
| **Google Drive** | `drive.file`, which is **non-sensitive** ([Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)). "If your app utilizes only non-sensitive scopes, it is not mandatory for your app to complete the app verification process". Brand verification is only needed to show a name or logo ([Google](https://support.google.com/cloud/answer/13463073)). The unverified-app screen and 100-user cap apply only to sensitive or restricted scopes ([Google](https://support.google.com/cloud/answer/7454865)). **Cost: $0.** | **Poorly.** `drive.file` covers files "that you open with an app or that the user shares with an app while using the Google Picker". Files the desktop app writes through Drive for desktop were not created by the app, so the web cannot see them until the teacher picks each one **[unverified whether picking a folder in Picker grants its children]**. `drive.appdata` is hidden and never syncs to the desktop folder. | Weak **[unverified]** | Google Workspace for Education admins can block unconfigured apps (E §3). **Skip unless Google-only schools demand it.** |
| iCloud Drive | None for third-party web apps (E §3) | — | — | — | Mac users reach the web only through B1 on Chrome, or not at all |

**Verdict.** B2 costs $0 in money but **weeks per provider** in engineering: OAuth, token
refresh, REST adapters, conflict semantics and consent-screen support tickets. Do OneDrive
first (it is the likely school stack and has the best interop), and only on demand.
**Otherwise the web stays local-only plus B1.**

---

## 4. Phase A design: the "Library location" on desktop

### 4.1 User-facing behaviour
- In settings, **"Library location: This computer (default) / Choose folder…"**. Existing
  users see no change until they opt in.
- **Choosing a folder:**
  1. Make a preflight backup zip, reusing `backup.ts`, into AppData.
  2. **Copy** (never move) the documents in, with the backup-restore merge rule: identical
     id and bytes are skipped; the same id with different bytes becomes a copy with a new id.
  3. The AppData library stays untouched as a fallback until the teacher confirms.
  4. If the folder already holds a library (a second device joining), the app simply
     opens it.
- **Switching back** re-points to AppData. It never deletes the folder.
- **"Start completely fresh" (`clear()`) in folder mode detaches the library. It never
  deletes files**, because deleting there would delete them on every device.
- **A conflict banner** on the dashboard: *"2 versions of 'Demand & Supply WS' — from
  SCHOOLPC and this Mac."* Choices are "Keep both" (the copy gets a new id through
  `duplicateWorksheet` and is written canonically, then the conflict file is removed only
  after that write succeeds) or "Open side by side". Nothing is deleted without a click.
  - A **newer-schema** conflict copy is shown read-only and is never re-id'd or rewritten.
    Only "Make editable copy" (`editableCopy`) is offered, as today.

### 4.2 Folder layout (the same file format, so no new frozen corpus)
```
<chosen>/Econ Studio/
  <id>.worksheet.json          ← byte-identical format to AppData today
  folders.json, patterns.json  ← union-merged on read if variants exist
  trash/<id>.worksheet.json    ← rows derived by scan; deletedAt = mtime
  (no index.json, no trash/index.json, no library/index.json)
```
Local and per-device, in AppData (never synced):
- `library.json`: the chosen root and a device id;
- `library-cache.json`: summaries keyed by (name, size, mtime), plus `lastSeenHash` per id;
- `history/<id>/<timestamp>.json`: the last N versions *this* device wrote (for example
  20, or 30 days);
- the bank's `library/index.json` (derived).

Optional later (A2): a per-device journal in the synced folder,
`.econstudio/devices/<deviceId>.json` = `{docId: {hash, parentHash, at}}`.
- Each device writes only its own file, so the journal itself can never conflict.
- It gives true ancestry ("B wrote without having seen A's edit"), so a silent iCloud
  "loser" can be detected and restored from A's local history.
- It is a new persisted format, so it needs **its own frozen fixture**.

### 4.3 The write path
1. **CAS.** Before overwriting `<id>.worksheet.json`, hash the file on disk. If the hash
   differs from `lastSeenHash`, another device's edit has synced in since we read it.
   - **Do not overwrite.** Save the editor's version as a conflict copy under a new id,
     named "… (conflict, this Mac, 14:32)", and tell the editor to switch to it.
   - If the editor was clean, reload silently instead.
2. **Atomic write.** Write `.<id>.worksheet.json.tmp`, flush, then `rename` over the target.
   `std::fs::rename` replaces the target on Windows as well. Scans ignore dot-prefixed and
   `.tmp` names. Whether each sync client ignores or briefly syncs temp files is
   **[unverified]**; keep the temp file's life short.
3. Append a copy to the local history, then update `lastSeenHash` and the cache.
4. Emit through `withChangeFeed`. Add an **`external`** change kind for scan-detected
   changes, so the dashboard and bank index refresh.

It is cleanest to implement 1–2 as **Rust commands** (`library_read`, `library_write_cas`,
`library_list_meta`, `library_remove`) that take paths relative to a root held in Rust and
reject `..`. That gives a narrower grant than widening the JS fs scope, and it gives real
fsync and rename.

The alternative is to let the dialog plugin add the picked directory to the fs scope at
runtime. `open({directory:true})` calls `allow_directory(path, recursive)` **[source-read]**.
Pair that with `tauri-plugin-persisted-scope` so the grant survives a restart
([Tauri docs](https://v2.tauri.app/plugin/persisted-scope/)).

### 4.4 Read and list path
- `list()` in folder mode:
  1. Read the directory and `stat` each file.
  2. Take cached summaries for unchanged `(name, size, mtime)`.
  3. Read and parse only new or changed files.
  4. Unreadable or dataless files become placeholder rows.
  5. Files whose id duplicates another, or whose name is non-canonical, are flagged as
     conflicts.
  6. Sort with the existing `usableSummaries`.
- `load(id)` goes through `parseWorksheet` as today (migration, `dedupeIds`, the
  `isNewerThanBuild` read-only path). It records `lastSeenHash`.

---

## 5. Option C: the cheapest self-hosted server (for comparison)

Load: 1,000 teachers × 50 docs × 30 KB = **1.5 GB**. With whole-document revisions (E's model,
about ×3 retained) that is about **4.5 GB**.

| Resource | Free allowance | Use at 1k teachers | Fits? |
|---|---|---|---|
| R2 storage | 10 GB-month ([R2 pricing](https://developers.cloudflare.com/r2/pricing/)) | ~1.5–4.5 GB | Yes |
| R2 Class A (writes and lists) | 1 M/month | ~300 pushes per user = 300 k (keep listing in D1, not R2) | Yes |
| R2 Class B (reads) | 10 M/month | ~100–300 k | Yes |
| R2 egress | Free | — | Yes |
| D1 (metadata and revisions) | 5 M rows read/day, 100 k rows written/day, 5 GB ([D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)) | ~10 k writes/day | Yes |
| Workers | **100 k requests/day**, 10 ms CPU per request ([limits](https://developers.cloudflare.com/workers/platform/limits/)) | Pull on focus plus debounced pushes ≈ 30–100 per active teacher per day, so **30–100 k/day** | **Marginal.** 5-minute polling would breach it; Workers Paid is $5/mo. |

**Money: $0–5/month.** The real costs are elsewhere:
- **Identity.** Verifying Google or Microsoft ID tokens in the Worker is free, but it is
  code to write and secure. Magic-link email needs a mail provider.
- **Duties.** The owner becomes the PDPO data user or processor: privacy policy, PICS,
  deletion requests and breach handling (E §4).
- **Operations.** Per-user quotas and abuse control. Backups: R2 has no automatic
  point-in-time restore **[unverified]**. Free-tier terms can change.
- **Effort.** About 3–5 weeks, versus 1.5–3 weeks for Phase A, which carries none of these
  duties.

**Verdict:** only as part of a paid product, and then E's Supabase design (atomic row CAS)
is the better base. For a free app, BYO cloud dominates.

---

## 6. Recommended path

| Phase | What | Cost to the owner | Effort | Covers |
|---|---|---|---|---|
| **A** | Desktop library location + scan-derived list + atomic CAS writes + conflict surfacing + local history | $0 | 1.5–3 wks | School PC ↔ home Mac through any sync client, and USB |
| **A2** (optional) | Per-device journal for ancestry-exact conflict detection (iCloud silent losers) | $0 | ~1 wk | Makes iCloud safe rather than just recoverable |
| **B1** | Web on Chrome/Edge: "Open library folder" (FSA adapter over the same store) | $0 | ~1 wk after A | Locked-down school PCs with OneDrive and Edge |
| **B2** (on demand) | OneDrive App Folder adapter for the web on any browser; Dropbox later; Google `drive.file` skipped | $0 (publisher verification is free, but needs a custom domain and a Partner account) | 2–3 wks per provider | Web anywhere with a personal or school OneDrive |
| **C** | Only with the paid product (E) | $0–25+/mo | 3–5+ wks | Everything, and accounts |

### 6.1 Exact code seams (Phase A, then B1)
- **`src/storage/fileStore.ts`**
  - `base()` hard-codes `BaseDirectory.AppData`, and `DIR`/`INDEX`/`docPath`/`trashPath`
    are relative to it. Extract a **`LibraryDir` adapter** (`list`, `stat`, `readText`,
    `writeTextAtomic(path, text, expectedHash?)`, `remove`, `rename`, `mkdir`) with three
    implementations: AppData via plugin-fs (today's behaviour, byte-for-byte), the chosen
    folder via Rust commands, and FSA handles for B1.
  - `readIndex`, `writeIndex`, `rebuildIndex` and `list`: in folder mode, scan plus local
    cache. No `index.json` is written into the folder.
  - `write()`: CAS plus atomic write. Keep the `NewerDocumentError` guard first.
  - The `SUFFIX` checks in `rebuildIndex`, `trashRows`, `clear` and `clearTrashDir` must
    recognise conflict copies.
  - `clear()` in folder mode detaches rather than deletes.
  - `readTrashIndex` and `writeTrashIndex` become a derived Trash in folder mode.
  - `readFolders` and `patternsFile` union-merge variants.
  - `savedWorksheetsFolder` and `savedWorksheetPath` (reveal in Finder) return the library
    root.
  - `libraryIndexFile` / `LIBRARY_INDEX` **stay in AppData** (a derived, per-device index).
- **`src/storage/index.ts:299-300`**: the `worksheetStore` singleton is chosen at module load.
  It needs the library root resolved first, and a re-point on change (reload the app, the
  simplest route). `patternStorage` follows the same root.
- **`src/storage/changes.ts`** and `StoreChange` in `src/library/types.ts`: add an `external`
  kind for scan-detected changes. `withChangeFeed` stays the only choke point.
- **`src/app/EditorHost.tsx`**: autosave and `flushBeforeLeaving` must handle a CAS-conflict
  result by switching the editor to the conflict copy and showing a banner. Handle
  "changed on disk, editor clean" by reloading.
- **`src/storage/backup.ts`**: preflight backup and the merge rule for "copy library into
  folder".
- **`src-tauri/`**:
  - new commands in `src/lib.rs` (with a new module), plus a permission file in
    `src-tauri/permissions/` and entries in `capabilities/default.json`;
  - *or* `tauri-plugin-persisted-scope` (registered after fs), plus `fs:allow-watch` and
    `fs:allow-unwatch`, plus `features = ["watch"]` on `tauri-plugin-fs` in `Cargo.toml`;
  - the capability description must be updated either way, because it claims `$APPDATA`
    only.
- **Untouched:** `src/model/migrations.ts` and `src/model/types.ts`. There is **no schema
  change and nothing in `KNOWN_KEYS`**. Sync state lives only in local AppData sidecars, as
  E prescribes.

### 6.2 Tests that protect backward compatibility
- **Must stay green, unchanged:** `src/model/backwardCompat.test.ts`,
  `src/storage/legacyIndex.test.ts`, `src/storage/fileStore.test.ts`,
  `src/storage/backup.test.ts`, `src/storage/trash.test.ts` and
  `src/storage/folders.test.ts`. Run them with `npm test`; bare `npx vitest run` rewrites
  the corpus.
- **Parametrize `fileStore.test.ts`** over both roots (AppData and folder mode) using its
  in-memory fs fake. Every existing rule then also holds in folder mode.
- **New `src/storage/libraryFolder.test.ts`:**
  - the **v1 corpus bytes** (`src/test/corpus/v1-published.json`, read and never
    regenerated) dropped into a library folder list, open and round-trip byte-identically;
  - conflict names for OneDrive, Dropbox, iCloud and Google are listed as conflicts, never
    dropped, and "Keep both" never deletes before the new copy is written;
  - a newer-schema conflict copy is never written, renamed or re-id'd;
  - truncated or half-synced JSON gives a "syncing" row, and the file is never deleted;
  - a dataless or unreadable file with a cached summary still lists;
  - CAS: disk changed since the last read, so `save` produces a conflict copy and leaves the
    on-disk file byte-identical;
  - `clear()` in folder mode deletes nothing;
  - the "copy into folder" migration leaves the AppData library byte-identical;
  - `folders.json` variants union-merge with no assignment lost;
  - arrival order: a document before `folders.json`, `folders.json` before its documents.
- **A2 only:** the device-journal format gets its own frozen fixture beside the v1 corpus.

---

## Sources
- Tauri: [fs plugin](https://v2.tauri.app/plugin/file-system/) · [persisted-scope](https://v2.tauri.app/plugin/persisted-scope/) · [path API](https://v2.tauri.app/reference/javascript/api/namespacepath/) · plugin source: [dialog `commands.rs`](https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/dialog/src/commands.rs), [fs `commands.rs`](https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/fs/src/commands.rs)
- Conflicts: [Dropbox conflicted copy](https://help.dropbox.com/organize/conflicted-copy) · [OneDrive device-name copies (MS Q&A)](https://learn.microsoft.com/en-us/answers/questions/5389639/onedrive-renamed-and-appended-machines-name-to-all-files-on-production-machine) · [abraunegg/onedrive #2133](https://github.com/abraunegg/onedrive/discussions/2133) · [Google Drive conflicts (secondary)](https://filerev.com/blog/find-resolve-conflicted-google/) · [Apple: iCloud conflicts](https://support.apple.com/en-ca/guide/mac-help/mh40780/mac) · [Apple TN2336](https://developer.apple.com/library/archive/technotes/tn2336/_index.html)
- Placeholders and KFM: [Cloud Files API](https://learn.microsoft.com/en-us/windows/win32/cfapi/build-a-cloud-file-sync-engine) · [Known Folder Move](https://learn.microsoft.com/en-us/sharepoint/redirect-known-folders)
- Peer apps: [Obsidian sync notes](https://obsidian.md/help/sync-notes) · [Logseq iCloud FAQ](https://discuss.logseq.com/t/im-using-logseq-with-icloud-but-experiencing-data-loss-or-file-conflict-errors-whats-going-on/13393) · [logseq #10499](https://github.com/logseq/logseq/issues/10499) · [#8269](https://github.com/logseq/logseq/issues/8269) · [#5802](https://github.com/logseq/logseq/issues/5802) · [Zotero: data dir in cloud folder](https://www.zotero.org/support/kb/data_directory_in_cloud_storage_folder)
- Web: [FSA persistent permissions](https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api) · [Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth) · [Drive auth/Picker](https://developers.google.com/workspace/drive/api/guides/about-auth) · [Google verification exemptions](https://support.google.com/cloud/answer/13463073) · [Google unverified apps](https://support.google.com/cloud/answer/7454865) · [Graph app folder](https://learn.microsoft.com/en-us/graph/onedrive-sharepoint-appfolder) · [Entra user consent](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/configure-user-consent) · [Entra consent policies](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/manage-app-consent-policies) · [Publisher verification](https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview) · [Dropbox developer guide](https://docs.dropboxapi.com/dropbox-api/docs/developer-resources/developer-guide)
- Cloudflare: [R2 pricing](https://developers.cloudflare.com/r2/pricing/) · [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) · [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
