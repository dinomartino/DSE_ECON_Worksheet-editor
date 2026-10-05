# Google Drive sync — design

Status: **shelved 2026-10-05.** Teachers run the desktop app on both computers, so the user chose
the library-folder approach (`docs/design/library-folder.md`, from K Phase A). Keep this for
web-only teachers. Written against `develop` at `1cd1fea`. Not built.
Decisions by the user (2026-10-05): Google Drive first (OneDrive maybe later, so the design
is provider-agnostic); free, in the teacher's own Drive; client-side OAuth only; scope
`drive.file`; a visible **Econ Studio** folder holding the same `.json` files; local stays
primary and works offline.

The ask: teachers with a work computer and a personal one want the same papers on both.
Today they save a paper's `.json`, send it to themselves and open it on the other machine.

Prior research: `docs/research/2026-09-paid-product/K-free-sync.md` advised skipping
`drive.file` because the web could not see files that *Drive for desktop* wrote. That
objection does not apply here: both the web app and the desktop app talk to the Drive API
themselves, so every file is created by the app. (Its "Library location" folder idea stays
a separate, later option.)

---

## 1. Goal and non-goals

**Goal.** Open the app on either computer (web or desktop) and find every paper, question
bank and graph as last saved anywhere, with nothing ever lost. A copy of everything sits in
the teacher's own Drive, so a dead laptop costs nothing.

**Non-goals (v1).**
- No real-time co-editing. Sync is "within a minute or so", one document at a time.
- No sharing between teachers (that is F8 in `docs/IDEAS.md`; this design leaves room for it).
- No server, no accounts of ours, no running cost. The developer never receives a document.
- No syncing of AI keys (never), appearance or language (per computer by design).
- No merging of two versions inside one paper: when both changed, both are kept.

---

## 2. How it fits the existing store

### Decision: a sync layer beside the store, not a new store backend

The store stays what it is: `LocalStorageWorksheetStore` (web; IndexedDB after Stage 0)
or `FileWorksheetStore` (desktop), chosen once in `src/storage/index.ts:worksheetStore`.
A new `src/sync/` engine runs beside it and mirrors it to Drive.

Why not a Drive-backed `WorksheetStore`:
- **Local is primary.** A backend swap turns every Drive outage, expired token and slow
  network into a failed save. Offline must keep working exactly as today.
- **Every store rule is already proven** (two halves, per-row index, Trash, folders,
  `NewerDocumentError`, rebuild-by-scan). A second backend would have to re-earn them all.
- **One engine serves both platforms**, because it only talks to the store interface.
- **Disconnect is trivial**: stop the engine; the local library is untouched.

### State-based, not event-based

The change feed (`src/storage/changes.ts:onStoreChange`) only says *when* to run. *What* to
do is decided by comparing three things per document: the local copy, the Drive copy, and
the **base** (both as they were at the last successful sync). So a missed event, a crash
or a week offline is recovered by the next run; there is no queue to lose.

### What the store needs (small, additive)

1. **`StoreChange.origin?: 'sync'`** (`src/library/types.ts`). The engine's own inbound
   writes go through the store and the feed as usual, so the 題庫 index
   (`src/library/bankIndex.ts`) and the dashboard update; the engine ignores events
   marked `sync`, so a download never echoes back as an upload. In memory only, never stored.
2. **`adopt(worksheet)` on both stores**: `save`, except it may replace a local copy that
   a newer build wrote. Today `save()` throws `NewerDocumentError` there, which would block
   the case "my other computer has a newer build and updated this paper". The guard exists
   so an older build cannot write *its own edits* over newer data; `adopt` only ever writes
   the *remote* copy, and only when the local copy is unchanged since the base.

Nothing else in `src/storage/types.ts:WorksheetStore` changes.

### How each existing piece maps

| Piece | In sync v1 | Rule |
|---|---|---|
| Papers, question banks (`kind: 'bank'`) | Yes | One Drive file per document, same `.worksheet.json` bytes `stringifyWorksheet` writes |
| Trash (`src/storage/trash.ts`) | Deletes propagate | Local Trash ↔ Drive Trash; never a hard delete (§5) |
| Folders (`src/storage/folders.ts`) | Stage 4 | v1: a document arriving from Drive lands at root |
| Graphs (`src/storage/graphs.ts:GraphStore`) | Stage 4 | Same engine, `kind: 'graph'`; graphs have no local Trash, so a remote delete only applies if the local graph is unchanged |
| Backup zip (`src/storage/backup.ts`) | Unchanged | Restore still never overwrites; Stage 1's "Restore from Drive" reuses its rules |
| Newer-build documents | Synced, read-only | §5 |
| 題庫 index | Not synced | Derived; rebuilt per machine from change-feed events |
| 題型 registry (`src/storage/patterns.ts`), Translation terms (`src/settings/termPreferences.ts`) | Stage 5 | One small file each, merged per row |
| Settings, AI keys (`src/platform/secrets.ts`) | Never | Per computer; keys never leave the device |

`clear()` ("start completely fresh") **disconnects and forgets sync state; it never
deletes anything in Drive.** Otherwise one click would empty the off-site copy too.

---

## 3. Web storage capacity (Stage 0)

**Problem.** Web documents live in `localStorage`, about 5 MB for the whole origin, with
images base64 inside documents. Two-way sync pulls the *union* of both computers'
libraries onto each, so a teacher at 3 MB on each machine overflows. Safari also deletes
script-written storage for a site not used for 7 days of browsing unless it is persistent
([WebKit ITP](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)).

**Decision.** Moving web documents to IndexedDB is a **prerequisite for Stage 3** (pulling
from Drive), not for Stage 1 (upload-only adds nothing locally). Do it first anyway: the
quota is already a latent risk today. Desktop is unaffected (files).

Rules for the move (`src/storage/idbStore.ts`, a new database `econ-worksheet-docs`; never
inside `econ-worksheet-library`, whose version bump deletes every store):
- **Both halves in one transaction.** A document and its index row are written together,
  so the "intact but unreachable" state cannot happen in IndexedDB at all.
- **Copy, verify, keep.** For each `econ-worksheet:<id>` key: parse, write document + row,
  read back, compare. The `localStorage` original is **not deleted** in this release; it
  stays as a frozen safety copy for at least two releases.
- **A ledger of moved ids** (`id → updatedAt` at move). Each launch sweeps `localStorage`
  and moves any document whose id is not in the ledger, or whose `updatedAt` is newer than
  the ledger's (a tab left open from before the deploy kept saving there). A deleted
  document is never resurrected: its id is in the ledger.
- Trash rows, folders and the trashed documents' bodies move too; `econ-graph:*` moves in
  Stage 4. Small settings keys stay in `localStorage` (the boot scripts read them).
- **One tab moves**, under `navigator.locks.request('econ-storage-move')`.
- **IndexedDB unavailable** (blocked, some private modes): stay on `localStorage`, as today.
- **Cross-tab updates**: `src/storage/index.ts:onDocumentSavedElsewhere` relies on the
  `storage` event, which IndexedDB never fires. Replace with a `BroadcastChannel`, or the
  second-tab tag guard (S4) silently stops working.
- **`navigator.storage.persist()`**: requested after the move and again on connect; the
  Settings pane says whether storage is persistent. Granted by heuristics, so a refusal is
  normal and only shown, never nagged.
- `src/storage/legacyIndex.test.ts` stays as is: the literal keys are still read.

---

## 4. Sync model

### What syncs

v1: papers and question banks. Stage 4: graphs, folders. Stage 5: 題型 registry,
Translation terms. Never: settings, AI keys, the 題庫 index, Trash rows themselves.

### Layout in the teacher's Drive

```
My Drive/
  Econ Studio/                      ← created by the app (appProperties econRole=root)
    S5 Mock Paper 1.worksheet.json  ← one file per document, the normal format
    題庫 Market.worksheet.json
    Graphs/                         ← Stage 4
      Demand shift.graph.json
```

- **Identity is the document id, never the file name.** Each file carries
  `appProperties` (private to the app): `econId`, `econKind`, `econSchema`, `econHash`
  (SHA-256 of the uploaded bytes). If those are unreadable, the id inside the JSON decides.
- File names follow `downloadWorksheetFile`'s naming, so a teacher can download any file
  from Drive and open it in **any** build, including v0.6.0.
- **No manifest file.** One file both computers rewrite would conflict on every change.
- A file the teacher drags into the folder by hand is invisible to the app (`drive.file`
  sees only what the app created). To bring one in, use Open a file, as today.

### Change detection

- **Local changed** = SHA-256 of `stringifyWorksheet(load(id))` ≠ base `localHash`.
  Hashing what the store would write makes re-saves that change nothing (opening a
  document saves it once, `src/app/EditorHost.tsx:EditorHost`) cost nothing.
- **Remote changed** = Drive's `md5Checksum` or `version` ≠ base. Both are assigned by
  Google, so **no decision ever compares two computers' clocks.**
- Remote changes are found with Drive's `changes.list` from a saved page token (cheap);
  a full listing of the folder only on first connect or a lost token.
- Base state, per document: `{ id, kind, fileId, localHash, remoteMd5, remoteVersion,
  syncedAt }`, plus account, root folder id, page token and this computer's name. Stored
  **outside documents**: web IndexedDB `econ-sync`; desktop `worksheets/sync/state.json`
  (a subdirectory no rebuild-by-scan or `clear()` reads as documents).

### The decision table (per document)

| Local | Remote | Action |
|---|---|---|
| unchanged | unchanged | nothing |
| changed | unchanged | upload |
| unchanged | changed | download (`adopt`) |
| changed | changed | **conflict: keep both** (§5) |
| only here, no base | — | upload (new) |
| — | only in Drive, no base | download (new, lands at root) |
| both, no base, same hash | | link, no transfer |
| both, no base, different | | conflict: keep both |
| trashed here | unchanged | move Drive file to Drive Trash |
| unchanged | trashed or gone in Drive | move local copy to Trash |
| trashed either side | changed on the other | **the edit wins**: restore and sync it |

The planner is a pure function, `planSync(local, base, remote) → actions`, table-tested
cell by cell. Each download re-reads the local copy just before writing and drops the step
if it changed since planning (as `saveRevised` in `src/library/tagWrites.ts` does).

### When it runs

- On launch (after connect), on window focus, when back online, every 60 s while visible.
- After a save: debounced ~10 s per document, so a typing session is one upload.
- On leaving a document and before a desktop restart (`setBeforeRestart`).
- **The open document is never written under the editor.** A remote change to it waits
  until it closes; edits made meanwhile meet the normal conflict rule. Opening a document
  first pulls a known remote change (wait up to ~3 s, then open the local copy and say so).
- Web: one tab syncs (`navigator.locks`), others hear status over `BroadcastChannel`.
- Uploads: multipart up to 5 MB, resumable above. Backoff on 429/5xx.

---

## 5. Conflicts

**Rule: keep both, never silently drop.** When both sides changed, the Drive copy keeps the
id (other computers already have it); **this computer's version becomes a copy under a new
id**, saved, uploaded, and named so the teacher sees where it came from:

- en: `S5 Mock (from Work Mac, 5 Oct 14:32)`
- zh: `S5 Mock（來自 Work Mac，10月5日 14:32）`

Written into the copy's `name` (what the list shows; the printed title is untouched), in
the interface language at the time. The copy keeps everything (classes, sat-on) unlike
Duplicate. A notice lists every conflict (§7).

- **Deletes.** Trash on one computer → Drive Trash → Trash on the other. Never a hard
  delete by sync. Drive empties its own Trash after 30 days, our Trash also keeps 30 days.
  Empty Trash / Delete forever locally do nothing in Drive. **An edit beats a delete**, and
  without a base (first connect) live always wins, matching the store's "live wins".
- **Renames** are an edit to `name`: content upload plus a Drive file rename. Two
  renames between syncs are a conflict like any other edit.
- **A newer build's document** (`isNewerThanBuild`): an older build downloads it (via
  `adopt`, opened read-only as today) but **never uploads over a Drive file whose
  `econSchema` is above its own `CURRENT_SCHEMA_VERSION`**. If it somehow holds local
  changes to that id, they go up as a copy.
- **Schema marks.** Sync uploads exactly what a local save writes, so
  `src/model/migrations.ts:writtenSchemaVersion` decides v1/v2 as today; sync never raises
  a mark, and a v2 file opens read-only in v0.4–0.5 exactly as if emailed.
- **Clock skew** cannot pick a winner: decisions use hashes and Google's versions. Times
  are only shown. (Topic tags' newest-wins, `src/library/sharedTags.ts:sharedTags`, still
  uses device clocks; sync makes skew between computers matter more there. Noted, unchanged.)
- **Upload race.** Drive v3 has no conditional write [unverified]. After each upload the
  engine checks the new `version`; a jump of more than one means the other computer also
  wrote, and its revision is fetched and kept as a copy. Drive keeps old revisions of a
  file for about 30 days
  ([revisions](https://developers.google.com/workspace/drive/api/guides/manage-revisions)),
  a second safety net.
- **An unreadable file in Drive** (half-written, edited by hand) is skipped and reported;
  it never overwrites the local copy.
- **Two root folders** (both computers connected for the first time at once): keep the
  older, move the other's files into it, trash the empty one.

---

## 6. Auth

One Google Cloud project, Drive API enabled, OAuth consent screen "External", **In
production**, scope `https://www.googleapis.com/auth/drive.file` only.

- `drive.file` is **non-sensitive**
  ([Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)):
  no app verification, no 100-user cap
  ([verification](https://support.google.com/cloud/answer/13463073)).
- **Must be In production, not Testing**: Testing caps at 100 listed users and expires
  authorisations after 7 days
  ([app audience](https://support.google.com/cloud/answer/15549945)).
- **Brand verification** (light) is needed to show the name and logo on the consent screen
  ([brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification)):
  a homepage and a privacy policy on a domain verified in Search Console, also listed as an
  authorised domain ([requirements](https://support.google.com/cloud/answer/13464321)).
- **Client IDs are public** and fine in the static bundle and the app. No secret is
  embedded on the web. The desktop client's "secret" is not treated as one by Google for
  installed apps ([native apps](https://developers.google.com/identity/protocols/oauth2/native-app)).
- **Hong Kong:** Drive and Google sign-in work without a VPN. (Unlike the Gemini API,
  which is still blocked from HK IPs; this feature has no such issue.)
- **School accounts:** Workspace for Education admins can block unconfigured third-party
  apps ([admin control](https://support.google.com/a/answer/7281227)). The error says so
  and offers a personal Google account, or asking IT to allow the client ID.

### Web: Google Identity Services, token model

- Load `https://accounts.google.com/gsi/client` only when the teacher connects (no Google
  script on the page before that), web only.
- `initTokenClient` → access token, about 1 hour, **held in memory only**.
- **No refresh token in a pure browser app**, and a new token may only be requested from a
  user gesture such as a button press
  ([token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model)).
  After expiry or a reload, sync **pauses** until the teacher clicks: the status chip reads
  "Resume sync", or opening a paper asks for one (a Google window flashes and closes
  itself when consent exists). Edits are never blocked; they upload on resume.
- Authorised JavaScript origins: the production domain and `http://localhost:3000`.
  Vercel preview URLs are random, so sync only works on a registered stable alias.
- Never add `Cross-Origin-Opener-Policy: same-origin`; the GIS popup relies on it absent.
- Disconnect calls `google.accounts.oauth2.revoke` and forgets sync state.

### Desktop: system browser, loopback, PKCE, refresh token in the keychain

Google blocks sign-in inside embedded webviews, and Google's recommended desktop flow is the
loopback redirect with PKCE ([native apps](https://developers.google.com/identity/protocols/oauth2/native-app)).
All of it lives in Rust, `src-tauri/src/oauth.rs` (new):

- `google_connect`: make PKCE verifier and state, listen on `127.0.0.1:<random port>`,
  open the consent page in the system browser, receive the code, answer with a small
  bilingual "You can close this tab" page, exchange it at `oauth2.googleapis.com/token`
  with `reqwest` (already in the tree through the updater plugin). 5-minute timeout.
- The **refresh token goes straight into the OS keychain** (account `sync:google`, the same
  service as AI keys in `src-tauri/src/secrets.rs`, validated separately from `ai:`
  accounts). It never reaches JavaScript.
- `google_access_token` returns a fresh access token (refreshing in Rust);
  `google_disconnect` revokes and deletes the item. Refresh tokens are long-lived, so the
  desktop syncs with no clicks.
- JS reaches these only through a dynamic `import()` behind `isDesktop()` in
  `src/platform/` (the "Never import `@tauri-apps/*` at top level" rule). The commands are
  listed in `src-tauri/build.rs` (as `print_to_pdf` is) and granted in
  `src-tauri/capabilities/default.json`, whose description must say so.
- **CSP:** `app.security.csp` is `null` in `src-tauri/tauri.conf.json` and the web sets
  none, so nothing changes today. If either is ever tightened, allow
  `https://accounts.google.com`, `https://oauth2.googleapis.com`, `https://www.googleapis.com`.

Drive calls themselves are plain `fetch` from shared code on both platforms (as `src/ai/http.ts`
does), behind the provider interface, so OneDrive later is one more provider:

```ts
interface SyncProvider {
  connect(): Promise<Account>; disconnect(): Promise<void>; token(): Promise<string | 'needs-gesture'>;
  ensureRoot(): Promise<FolderRef>; listAll(): Promise<RemoteFile[]>;
  changes(cursor?: string): Promise<{ files: RemoteFile[]; cursor: string }>;
  download(fileId: string): Promise<string>; upload(file: UploadSpec): Promise<RemoteFile>;
  trash(fileId: string): Promise<void>; untrash(fileId: string): Promise<void>;
}
```

---

## 7. UI (sketch)

Strings live in an area `messages.ts` with en and HK zh (`docs/design/ui-language.md`;
Google Drive, PDF, Word stay English; no em dash in screen text).

- **Settings → Google Drive** (new section, `src/components/settings/sections/`).
  Not connected: one paragraph and **Connect Google Drive / 連接 Google Drive**.
  > Keeps a copy of your papers in a folder called "Econ Studio" in your own Google Drive,
  > and brings in your changes from your other computers. Only this app's files are visible
  > to it. Nothing goes anywhere else.
  > 在你自己的 Google Drive「Econ Studio」資料夾保存試卷副本，並帶入你在其他電腦上的修改。
  > 本程式只能看到它自己建立的檔案，資料不會傳送到其他地方。

  Connected: the account email; **This computer's name / 這部電腦的名稱** (default "Mac",
  "Windows PC" or "Browser"; used in conflict copies); last synced; **Sync now / 立即同步**;
  **Open in Google Drive / 在 Google Drive 開啟**; **Disconnect / 中斷連接** ("Your files
  stay in Google Drive and on this computer.").
- **Status chip** on the start screen (beside the version line) and in the editor's top
  bar (`data-print-hide`): Synced 已同步 · Syncing… 同步中… · Offline, will sync later
  離線，稍後同步 · Resume sync 繼續同步 (web, token expired) · Needs attention 需要處理.
  Clicking it opens the Settings section.
- **First connect on the second computer**: a confirm step before anything moves.
  > Google Drive already has 34 papers from your other computer. This computer has 12.
  > After syncing, both will have 44. 2 are the same paper on both. 2 were changed on
  > both, so both versions are kept.
  > Buttons: **Sync / 同步**, **Cancel / 取消**.
  Same id and same content links without copying; nothing is ever dropped.
- **Conflict notice** (start screen, dismissible, lists the papers):
  > 2 papers were changed on both computers. Both versions are kept. The one from this
  > computer is named "… (from Work Mac, 5 Oct 14:32)".
  > 2 份試卷在兩部電腦上都有修改，兩個版本都已保留。這部電腦的版本名為「…（來自 Work Mac，10月5日 14:32）」。
- **Errors**, each one line with one action: Drive full ("Your Google Drive is full. Papers
  stay safe on this computer." / Open Google Drive); offline (chip only); access removed
  ("Google Drive access was removed." / Reconnect); school account blocked (§6); an
  unreadable file in the folder (named, skipped).

---

## 8. Backward compatibility and safety

- **No schema change.** Sync metadata lives outside documents (local base state, Drive
  `appProperties`); nothing goes in `KNOWN_KEYS`; `CURRENT_SCHEMA_VERSION` is untouched.
  The conflict copy uses the existing `name` field.
- **Files in Drive are the normal format**, so every released build opens them.
- **Frozen corpus untouched.** `src/test/corpus/v1-published.json` and the v2/bank corpus
  files are read, never rewritten. `src/model/backwardCompat.test.ts` and
  `src/storage/legacyIndex.test.ts` must pass unchanged at every stage.
- **New tests:**
  - `src/sync/fakeDrive.ts`: an in-memory provider (versions, md5, changes feed, Trash,
    revisions, injected offline / 401 / 403 quota / 429 / torn writes).
  - Planner table tests, one per cell of §4's table.
  - Two-computer simulation: two in-memory stores + one fake Drive, random interleavings of
    edits, deletes, renames, offline spells and skewed clocks. Invariants: every version
    that existed at a sync point is still reachable (live, Trash, copy or Drive revision);
    no endless upload ping-pong; no hard delete by sync.
  - The v1 corpus bytes uploaded from one side and downloaded on the other pass the
    `backwardCompat` assertions; a `schemaVersion: 99` fixture is never overwritten.
  - Stage 0: interrupted move, stale-tab sweep, quota failure mid-move, both halves of
    every moved document listed after reload.
- **Privacy statement** (Settings and the privacy page): "Your files go from this computer
  straight to your own Google Drive. Econ Studio has no server; the developer never sees
  your files, your Google account or your sign-in. Disconnecting removes the app's access;
  your files stay in your Drive."

---

## 9. Stages

Each stage ships alone, behind nothing but its own Settings entry, and keeps `npm test`,
typecheck, lint baseline, `.docx` samples and the web bundle check green.

| # | Stage | Size | Ships |
|---|---|---|---|
| 0 | Web documents to IndexedDB | M | Larger web libraries; persistent storage |
| 1 | Connect + upload-only backup (web) + Restore from Drive | M | Off-site backup; a manual "bring my papers here" |
| 2 | Desktop connect (Rust OAuth, keychain) | M | The same on desktop, with no re-clicks |
| 3 | Two-way sync: planner, conflicts, Trash, newer-build rules, first-connect merge | L | The feature |
| 4 | Graphs and folders (folders mirror as Drive subfolders) | M | Filing follows the teacher |
| 5 | 題型 registry, Translation terms | S | Everything a teacher customises |

**Stage 0** — `src/storage/idbStore.ts` (new), `src/storage/index.ts` (choice, move, sweep,
`BroadcastChannel`), `src/storage/graphs.ts` later. Verify: unit tests above; seed 40
documents in `localStorage` with `scripts/shot.mjs --seed`, reload, screenshot every row
listed; repeat in WebKit.

**Stage 1** — **first, a one-hour spike** (see risks): a file created by the Web client is
listed by the Desktop client of the same project, with its `appProperties`; Drive calls
work by `fetch` from `tauri://localhost` and `http://tauri.localhost`. Then
`src/sync/` (provider interface, `drive.ts`, `fakeDrive.ts`, upload-only engine, base
state), `src/platform/` GIS loader, the Settings section, the status chip, `StoreChange.origin`.
Restore from Drive downloads every file through `restoreBackup`'s rules (identical skip,
collision → "(restored)"). Verify: fake-Drive tests; a real upload of 20 papers checked in
drive.google.com; one downloaded file opened in v0.6.0; `.docx` samples unchanged.

**Stage 2** — `src-tauri/src/oauth.rs`, `src-tauri/src/lib.rs`, `src-tauri/build.rs`, the capability,
`src/platform/` dynamic bridge. Verify: `npm run desktop:dev` connect, quit, relaunch,
syncs without a click; keychain item present; `npm run build` bundle check passes.

**Stage 3** — `planSync`, conflict copies, Trash propagation, `adopt` on both stores,
open-document hold, first-connect confirm and conflict notice. Needs Stage 0 on the web.
Verify: planner and two-computer simulation tests; by hand with two browsers (Chrome and
Safari, different profiles) and one desktop: edit on both offline, reconnect, both kept.

**Stage 4** — graphs in `Graphs/`; dashboard folders as subfolders of `Econ Studio/`
(moving a paper moves its file; a folder rename renames the Drive folder). Verify: tests;
a filed paper lands in the same folder on the other computer.

**Stage 5** — 題型 and terms as one file each under `Econ Studio/Settings/`, merged per
row (union; newest row wins by Drive version). Verify: merge tests; both computers list
the same 題型.

---

## 10. Open questions for the user

1. **Which domain is the app's home for Google?** Brand verification needs a homepage and
   privacy policy on a domain you verify. *Recommended:* serve the web app and a short
   privacy page from a domain you own (aimakecoolstuff.com or a subdomain), and register
   only that origin.
2. **Web re-sign-in after an hour or a reload.** Resume only from the status chip or when
   opening a paper, or on the first click anywhere? *Recommended:* chip and opening a paper
   only; a Google window popping on an unrelated click feels broken.
3. **Conflict copy name.** "S5 Mock (from Work Mac, 5 Oct 14:32)", with the computer's name
   asked on connect? *Recommended:* yes, prefilled ("Mac", "Windows PC", "Browser").
4. **Folders.** Mirror dashboard folders as Drive subfolders (Stage 4), or keep every file
   flat in `Econ Studio/`? *Recommended:* mirror; the Drive folder then looks like the
   dashboard and is useful on its own.
5. **Order.** Desktop connect right after web backup (Stage 2 before two-way sync)?
   *Recommended:* yes; desktop is where sync needs no clicks, and the two-computer
   teachers are likely desktop users.
6. **Remote deletes.** Move to Trash automatically with a notice, or ask first?
   *Recommended:* automatic, with the notice; it is always restorable for 30 days.

---

## Risks found while designing

- **`drive.file` across two OAuth clients is unproven.** The web needs a Web client, the
  desktop a Desktop client. Google ties Picker grants to the Cloud project number
  ([web picker](https://developers.google.com/workspace/drive/picker/guides/web-picker)),
  which suggests per-project access, but one secondary report claims per-client. If the
  spike fails, desktop and web cannot see each other's files and the design needs another
  bridge (e.g. a one-time Picker grant of the folder [unverified]). Stage 1 starts there.
- **Web sync cannot run unattended** past an hour or a reload (no refresh token, gesture
  required). The web is "sync on a click"; the desktop is seamless.
- **CORS from the Tauri webview to googleapis.com is untested** (the AI provider calls that
  would prove it are still on the before-release list). Fallback: route Drive calls through
  Rust.
- **`save()`'s newer-build guard blocks an honest download**, hence `adopt` (§2).
- **IndexedDB breaks the cross-tab tag guard** unless `onDocumentSavedElsewhere` moves to
  `BroadcastChannel` (§3).
- **Consent screen must be "In production"** or every teacher is cut off after 7 days.
