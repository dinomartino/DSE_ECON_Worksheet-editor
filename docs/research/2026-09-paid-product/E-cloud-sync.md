# E. Cloud storage and sync: research and recommended design

Econ Studio 經濟備課室. Researched 2026-09-30. Grounded in the repo at `develop` (ccaff59).
Anything marked **[unverified]** comes from memory or a secondary source and was not checked
against a primary source.

---

## 0. TL;DR

- **Sync model:** whole-document sync. Each document carries a server revision number, pushes
  are conditional (compare-and-swap on `base_rev`), and a conflict produces a **conflict copy**.
  Nothing is ever overwritten. This is the Obsidian Sync / Dropbox model, and it matches the
  repo's rule that a restore never overwrites and a collision becomes a copy. **No CRDT, no
  third-party sync engine.**
- **Backend:** **Supabase Pro ($25/mo), Singapore region (`ap-southeast-1`).** Postgres holds the
  document body and its revision in one row, so the conditional update is a single atomic
  statement. Supabase Auth handles sign-in, RLS isolates each user's rows, and Storage holds
  images later. The browser and the Tauri webview talk to it directly, so **the web app stays
  a static export with no server code of our own**. A payment webhook is the only server code.
- **Cost:** about **US$25/mo at 1k users** and **about US$40–70/mo at 10k users** (details in §2).
- **Mixed versions:** the server stores bytes. It never migrates. Migration stays a read-time
  concern (`migrate()`), as today. A document from a newer build downloads and opens read-only
  through the existing `isNewerThanBuild` path. The server also refuses a push whose
  `schema_version` is lower than the stored one.
- **Sync metadata never goes inside the Worksheet JSON.** It lives in a sidecar
  (`econ-worksheet-sync` key / `worksheets/sync.json`), just as Trash and folders already do.
- **Lapsed subscription:** sync pauses. Local copies stay fully editable, the cloud copy stays
  downloadable (read-only) for 12 months, and a full export is always available. The data is
  never held hostage.
- **BYO cloud (Drive/OneDrive/iCloud):** worth it later as a cheap desktop-only "store my
  library in this folder" option. It is wrong as the paid product. §3 has the reasons.
- **One web-specific blocker surfaced:** the web store keeps documents in **`localStorage`**
  (`src/storage/index.ts:82`), which is capped at about 5 MB per origin **[unverified exact
  figure; browser-dependent]**. A cloud library of 50 × 200 KB = 10 MB cannot be mirrored
  there. The web client must list from the cloud and fetch bodies lazily into IndexedDB.

---

## 1. Sync model options

### What the app actually needs
- One user and several devices (school PC, home Mac, web). Real-time co-editing is **not**
  required. Sharing with colleagues is a "maybe later" and most likely means *send a copy* or
  *read-only share*, not live co-authoring.
- Documents are self-contained JSON `Worksheet`s: typically 30 KB for the v1 corpus
  (`src/test/corpus/v1-published.json` is 30,338 bytes), and up to hundreds of KB when images
  are inline. `ImageBlock.src` is "data: URL or app-managed asset id" (`src/model/types.ts`).
- Schema versioning is already strong. `migrate()` runs on every load, unknown top-level keys
  are stashed in `__unknown` and spliced back on save (`serializeWorksheet`), and a document
  newer than the build opens read-only (`isNewerThanBuild`, `NewerDocumentError`).
- Storage already sits behind one interface (`WorksheetStore` in `src/storage/types.ts`), and
  the change feed (`src/storage/changes.ts`) is the single choke point every mutation passes.
  That is exactly where a sync outbox hooks in.

### Options compared

| Model | Fit | Mixed app versions | Effort for a solo dev |
|---|---|---|---|
| **Whole-doc, revision number + conflict copy** (Obsidian/Dropbox style) | Good. Conflicts only arise when the same document is edited offline on two devices, which is rare for one person. | Good. The server stores opaque bytes plus a `schema_version` column, and the client's existing `migrate`/read-only logic decides everything. | Low: about 300–600 lines of client code, one table, one RPC. |
| **Operation log** (send mutations, server replays them) | Poor. Every editor action would need a stable, versioned op format. | Bad. An old build must understand ops from a new build, so the op log becomes a second schema to freeze. | High |
| **CRDT** (Yjs, Automerge 3, Loro) | Built for concurrent editing, which isn't needed here. It would need the whole store model to become CRDT-native. | Weak. Schema migration inside CRDTs is unsolved in practice: Automerge points to the Cambria lens research, which is "not yet implemented in Automerge". Automerge 3 files "may not be readable by older clients". | High. It rewrites the storage format, and the frozen v1 corpus is plain JSON, so every document needs converting. |
| **Row-sync engines** (PowerSync, ElectricSQL, Zero, Triplit) | Mismatched. They replicate relational Postgres rows into client SQLite. A 200 KB JSON blob per row gains nothing, and the app is not relational. | You manage the client schema per version. | Medium–high, plus another vendor. |
| **Hosted BaaS with sync built in** (InstantDB, Jazz, Liveblocks, Y-Sweet) | Overkill or mismatched. Liveblocks costs about $299/mo at 10k MAU (secondary source). | Vendor-dependent | Low to start, high lock-in risk |

**The vendor churn is the decisive evidence for choosing the boring option.** Across 2025–2026:
- **InstantDB:** the team joined OpenAI. New signups are closed, "Cloud apps will shut down on
  August 31st, 2027", and existing users are told to migrate within 12 months
  ([instantdb.com/pricing](https://www.instantdb.com/pricing), fetched 2026-09-30).
- **Jamsocket (hosted Y-Sweet)** joined Modal on 2025-07-10. Y-Sweet stays MIT open source,
  self-host only in practice
  ([modal.com/blog/jamsocket-is-joining-modal](https://modal.com/blog/jamsocket-is-joining-modal)).
- **Triplit** was acquired by Supabase on 2025-10-08. Its founder now works on integrations
  rather than on Triplit
  ([supabase.com/blog/triplit-joins-supabase](https://supabase.com/blog/triplit-joins-supabase)).
- **Replicache** is in maintenance mode; users are told to migrate to Zero
  ([github.com/rocicorp/replicache/releases](https://github.com/rocicorp/replicache/releases),
  [zero.rocicorp.dev](https://zero.rocicorp.dev/docs/release-notes/1.0)).
- **ElectricSQL** moved to `electric.ax`, and its pricing now centres on "Durable Streams" for
  agents: $1 per million writes, $0.10/GB-month retention, and Postgres Sync adds $2 per million
  shape-log writes ([electric.ax pricing post, 2026-04-02](https://electric.ax/blog/2026/04/02/electric-cloud-pricing)).
- **PowerSync** is healthy. Pro starts at $49/mo with 30 GB synced and 1,000 peak clients
  ([powersync.com/pricing](https://www.powersync.com/pricing)), but it is a row engine (see above).

A teacher's promise that must hold for years should not rest on a sync startup's roadmap.
Postgres plus a bucket plus a small protocol we own survives any vendor change: Supabase is
open source and self-hostable, and a pg_dump plus an S3 copy moves anywhere.

**CRDT libraries for reference.** Automerge 3 (2025) cut memory use by about 10× and has the
same file format as 2.x ([automerge.org/blog/automerge-3](https://automerge.org/blog/automerge-3/),
[migration guide](https://automerge.org/docs/guides/migrating-from-automerge-2-to-automerge-3/)).
Loro 1.0 has a stable encoding ([loro.dev/blog/v1.0](https://loro.dev/blog/v1.0)). Cambria:
[inkandswitch.com/cambria](https://www.inkandswitch.com/cambria/). Revisit a CRDT only if
*live* department co-editing becomes a real requirement, and then only for the shared-document
path.

---

## 2. Backends

### Sizing assumptions
- 50 documents × 200 KB = **10 MB per user**. That makes **10 GB at 1k users and 100 GB at
  10k users.** Add revision history (last 20 revisions or 30 days); assume ×2 to ×3 on top.
- Images are inline today. If they are later split into content-addressed assets, assume
  about 20 MB per user: 20 GB at 1k users, 200 GB at 10k.
- Egress: a full first sync of a new device is about 10 MB. Steady state is roughly 20 docs
  edited per month, each pulled by 1–2 other devices, which is about 5–10 MB. Budget
  **~20 MB per user per month: 20 GB at 1k users, 200 GB at 10k.**
- Writes: autosave fires on dirty, so cloud pushes must be debounced (for example 5 s idle,
  plus on blur/close). Budget about 300 pushes per user per month.

### Comparison

| Backend | 1k users | 10k users | Near HK | Notes |
|---|---|---|---|---|
| **Supabase** (Postgres + Auth + Storage + RLS) | **$25/mo.** 10–30 GB DB goes a bit past the 8 GB included (+$0.125/GB, so about +$1–3). | **About $40–70/mo.** 100–300 GB of DB disk costs about $12–37 at $0.125/GB, or move bodies to Storage at $0.0213/GB. Egress of 200 GB fits the 250 GB included. MAUs are within 100k. Optionally add a Small compute upgrade. | Singapore `ap-southeast-1`, Tokyo, Seoul. **No HK region.** | Pro: $25, 8 GB DB, 100 GB storage, 250 GB egress, 100k MAU, $10 compute credit, daily backups kept 7 days; PITR is +$100/mo ([supabase.com/pricing](https://supabase.com/pricing)). Egress is $0.09/GB uncached and ~$0.03/GB cached ([docs](https://supabase.com/docs/guides/platform/manage-your-usage/egress)). Regions: [docs](https://supabase.com/docs/guides/platform/regions). AES-256 at rest, TLS in transit, DPA available ([security](https://supabase.com/security), [DPA](https://supabase.com/legal/customer-resources/data-processing-addendum)). **Free tier pauses after 1 week of inactivity, so it is unusable for production.** |
| **Cloudflare** (Workers + D1 + R2) | About $5–8/mo | About $15–25/mo. Workers $5 includes 10M requests. R2 at $0.015/GB, $4.50 per million writes, **$0 egress**. D1 at $0.75/GB beyond 5 GB. | Global edge, with PoPs in HK. R2 and D1 take location hints (APAC). | Cheapest at scale. **But you write and run the API Worker, auth (e.g. Better Auth), and access control yourself**, which is several weeks more work and more surface to secure. ([R2](https://www.cloudflare.com/products/r2/), [D1](https://developers.cloudflare.com/d1/platform/pricing/), [Workers](https://developers.cloudflare.com/workers/platform/pricing/)) |
| **Firebase** (Firestore + Storage + Auth) | About $0–10 | About $20–60 **[unverified per-unit rates]** | **HK region available (`asia-east2`)** | 1 MiB document limit, so inline-image documents must go to Storage. Cloud Storage has required the Blaze plan since 2026-02-03 ([FAQ](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024)). NoSQL with per-read billing is harder to reason about. Still a valid choice if an HK data location is ever a selling point. |
| **Vercel Functions + Neon + Blob** | About $20+ (Vercel Pro plus Neon Launch) | About $40–80 | Vercel `hkg1`/`sin1` functions; Neon Singapore **[unverified]** | Adds a server runtime to a deployment that is deliberately static (`SYSTEM_ARCHITECTURE.md` § Deployment). Neon storage costs $0.35/GB-month ([neon.com/pricing](https://neon.com/pricing)). Blob storage is about $0.023/GB, advanced ops $5 per million ([docs](https://vercel.com/docs/vercel-blob/usage-and-pricing)). You also need an auth vendor. |
| **Convex** | $25/developer/mo (Professional: 50 GB DB, 100 GB files, 50 GB egress) | About $25–40 | "Selectable data region"; Asia availability **[unverified]** | A nice developer experience, but a proprietary runtime means more lock-in ([convex.dev/pricing](https://www.convex.dev/pricing)). |
| **PocketBase** (self-hosted) | A $5–10 VPS | A $10–20 VPS | Anywhere, including HK VPS providers | Still pre-1.0. "Full backward compatibility is not guaranteed" and it is "not recommended for production critical applications" ([docs](https://pocketbase.io/docs/)). You also run the server, backups and uptime yourself. |
| **AWS** (S3 + Cognito + Lambda) | About $5–15 | About $20–50 | **HK `ap-east-1`** | Most operations work of all. Worth it only for strict HK residency. |

**Why Supabase wins for this app:**
1. **The static export survives.** supabase-js calls Postgres (via PostgREST/RPC) and Storage
   straight from the browser and from the Tauri webview. RLS (`user_id = auth.uid()`) is the
   whole access-control layer. No API server is added to the Vercel deployment. The one
   exception is a Supabase Edge Function for the payment-provider webhook that writes an
   `entitlements` row.
2. **Atomic conditional writes are trivial**:
   `UPDATE docs SET … WHERE id=$1 AND rev=$2 RETURNING rev`. On object storage alone
   (R2/S3/Drive) this needs If-Match support and extra care.
3. **Auth covers HK teachers**: Google, Microsoft (Azure) and email OTP/magic link. Desktop
   uses PKCE with a deep-link or loopback redirect.
4. **The exit path is open.** Supabase itself is open source and self-hostable, and the data is
   plain Postgres rows plus S3-compatible objects.
5. **Cost per user is negligible**: under US$0.01 per user per month at 10k users.

**Region: Singapore.** HK to Singapore is roughly 30–40 ms **[unverified typical RTT]**. Tokyo
is the fallback. A Supabase project's region is fixed at creation, so choose it deliberately.
If schools ever *require* data kept in HK, Firebase `asia-east2` or AWS `ap-east-1` are the
options. Nothing in the PDPO requires this today (§4).

---

## 3. "Bring your own cloud" (Google Drive / OneDrive / iCloud Drive)

**Desktop, "save the library to a synced folder":**
- Pros: zero storage cost to you. Data stays in the teacher's or school's own account (a strong
  privacy story, and the school stays the data user). No lock-in, no server, and sharing a
  folder with colleagues comes for free.
- Cons:
  - The sync client, not the app, resolves conflicts, and each does it differently: OneDrive
    appends the device name, iCloud adds " 2", Google Drive keeps both **[unverified exact
    behaviours]**. The app must scan for and adopt those files.
  - Files-on-demand placeholders mean a file can exist without its contents being local.
  - Two devices can write `index.json` concurrently and corrupt it. The app already
    rebuilds the index by scanning, which helps, but `folders.json` and `patterns.json` would
    conflict too.
  - The desktop fs scope is currently `$APPDATA/**` only (`fileStore.ts`), so a user-chosen
    folder needs scope changes.
  - It cannot support a subscription, because there is no service to charge for.

**Web, via provider APIs:**
- Google Drive: the `drive.file` and `drive.appdata` scopes are non-sensitive, so no CASA
  security assessment is needed
  ([Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth),
  [appdata](https://developers.google.com/workspace/drive/api/guides/appdata)).
  - Google Workspace for Education admins can block unconfigured apps (`admin_policy_enforced`).
    Over-18 users can request access, but it is friction
    ([Google Workspace Updates](https://workspaceupdates.googleblog.com/2024/11/request-access-to-third-party-apps-on-behalf-of-students.html),
    [admin help](https://support.google.com/a/answer/13288950?hl=en)).
- OneDrive: **`Files.ReadWrite.AppFolder` delegated access works only for personal Microsoft
  accounts, not school/work accounts**
  ([Microsoft Learn](https://learn.microsoft.com/en-us/graph/onedrive-sharepoint-appfolder)).
  School OneDrive therefore needs broad `Files.ReadWrite`, which tenant admins often gate.
- iCloud Drive has no general web API for third-party apps **[unverified; CloudKit JS covers
  app containers, not the Drive folder]**.
- In total that is three providers, three OAuth setups and three conflict semantics. That is
  more work than one Supabase backend, and it still doesn't cover web plus iCloud users.

**Verdict:** don't make BYO cloud the paid sync. It could later be a **free desktop option**
("Keep my library in this folder…") for privacy-minded teachers or schools that forbid
third-party storage. It would reuse the same conflict-copy logic when the app finds
`*.worksheet.json` duplicates. Plain export to `.docx` or a backup zip into a Drive folder
already covers "put a copy in the school drive".

---

## 4. Privacy and legal (Hong Kong PDPO)

Not legal advice. Before charging money, have an HK solicitor review the Privacy Policy and PICS.

- **Roles.** For the teacher's own account (name, email, school, billing), Econ Studio is the
  **data user**. For any personal data *inside* worksheets (student names, marks), the teacher
  or school is the data user and Econ Studio acts as its **data processor**. Under DPP2(3) and
  DPP4(2), a data user must bind its processor "by contractual or other means" on retention
  and security. Under s.65(2), the processor's acts are attributed to the data user. So schools
  will want Terms that say what you do with the data
  ([PCPD cloud guidance](https://www.pcpd.org.hk/english/resources_centre/publications/files/IL_cloud_e.pdf),
  [PDPO at a glance](https://www.pcpd.org.hk/english/data_privacy_law/ordinance_at_a_Glance/ordinance.html)).
  - Practical step: tell teachers in the UI and the policy that worksheets should not need
    student personal data, and design no feature that collects it, such as class lists. This
    keeps you mostly outside processor exposure.
- **Cross-border transfer.** **s.33 is still not in force.** There is no timetable, and the
  PCPD's 2022 model contractual clauses are recommended but non-binding
  ([DLA Piper](https://www.dlapiperdataprotection.com/?t=transfer&c=HK),
  [PCPD cross-border guidance](https://www.pcpd.org.hk/english/resources_centre/publications/files/GN_crossborder_e.pdf),
  [PCPD model clauses](https://www.pcpd.org.hk/english/resources_centre/publications/files/guidance_model_contractual_clauses.pdf)).
  Storing in Singapore is lawful. **Disclose the location** (Singapore, provider Supabase/AWS)
  in the PICS as a class of transferee.
- **Reform watch.** In 2023–24 the government proposed mandatory breach notification,
  administrative fines, direct regulation of processors and possible activation of s.33, then
  put them on hold in Nov 2024. One secondary source says the PCPD was consulting LegCo in
  Feb 2026 on reviving them
  ([recordinglaw.com](https://www.recordinglaw.com/world-laws/world-data-privacy-laws/hong-kong-data-privacy-laws/),
  [HFW](https://www.hfw.com/insights/a-new-era-for-data-protection-in-hong-kong-legislative-updates-for-a-digital-age/)).
  **[unverified: treat as pending]** Build as if breach notification within 5 business days
  already applied: keep an incident runbook and know how to contact every user.
- **The Privacy Policy and PICS need** (DPP1(3), DPP5):
  - the purposes of collection;
  - the classes of transferees (Supabase/AWS Singapore, the payment processor, email provider,
    and AI providers if the ✦ AI features ever route through you; today they go straight to
    the teacher's key);
  - the right to access and correct data (DPP6; a data access request is answered within
    40 days **[from memory]**) and a contact person;
  - retention periods, security measures and the cross-border location;
  - direct marketing: opt-in consent under Part 6A before sending marketing email;
  - a Chinese version.
- **Encryption.** Supabase provides AES-256 at rest, including backups, and TLS 1.2+ in transit.
  That is adequate for DPP4.
  - **End-to-end encryption is feasible but not recommended for v1.** A lost passphrase means
    lost documents, which contradicts "a file must always reopen". It also complicates
    colleague sharing (key exchange) and any server-side feature. A better privacy lever is to
    keep **"Local only" (no account) a first-class mode forever**.
- **Backups and deletion.**
  - Account deletion removes rows and objects immediately. Backups roll off after 7 days on
    Supabase Pro. State "deleted within 7 days from backups" in the policy, and send a
    confirmation email.
  - s.26 requires erasing personal data no longer needed, so purge lapsed accounts on a stated
    schedule.
- **When a subscription lapses** (recommended policy):
  1. Sync stops, and every device's local copy stays **fully editable**. Local-first means the
     app never reads from the cloud to open a document.
  2. The cloud copy stays **readable and downloadable** (web read-only, "Download all" backup
     zip through the existing `backup.ts` format) for **12 months**, with reminder emails at
     30, 7 and 1 days before deletion.
  3. After that, delete, and say so in the Terms. Never lock a teacher's work behind a
     paywall; that would break the published-document promise in spirit.

---

## 5. Migrating existing local documents on first sign-in

The principle: **the cloud is added beside local storage, never swapped in for it.** Local
storage stays the source of truth on each device, and the cloud is a replica plus a mailbox
between devices.

1. **Preflight backup, automatically.** Before the first upload, write a full backup zip with
   the existing `backup.ts`. On desktop, write it to `worksheets/backups/pre-sync-<date>.zip`.
   On the web, write it to IndexedDB and offer a download. The teacher can always get back to
   exactly what they had.
2. **Upload raw bytes, not re-serialised documents.** Push the stored JSON text exactly as it
   sits in `econ-worksheet:<id>` or `<id>.worksheet.json`. Parse it only to extract metadata
   columns: `schema_version`, title, `updatedAt`, `questionCount`, `hasCover`, `kind`.
   - The server never runs `migrate`.
   - A document from a newer build uploads safely, because this build never rewrites it.
   - An unparseable document is skipped and named in the result, like backup restore.
3. **Id collisions across devices.** Ids are random, but the same document can exist on two
   machines (copied by file). If the cloud already has the id:
   - identical content hash: link it, no upload;
   - otherwise upload the local one as a **copy** with a new id named "… (from <device>)".
   This is the same rule as backup restore: an identical id is skipped and any other
   collision becomes a copy.
4. **Folders and 題型 merge as a union**, the same as backup restore: a folder with the same id
   or name is reused, and a document is filed only if it has no folder yet. Store them as two
   small per-user JSON rows with their own `rev`.
5. **Trash uploads as tombstoned rows** (`deleted_at`), so the 30-day restore still works
   across devices. "Live wins" carries over: an edit resurrects a tombstone.
6. **Idempotent and resumable.** Keep a per-document state in the sync sidecar: pending,
   uploaded or linked. A crash or closed tab resumes where it stopped. The UI shows
   "Uploaded 37 of 50".
7. **Never delete anything local** as part of migrating.
8. **Tests that prove it, alongside the frozen corpus:**
   - upload the v1 corpus, download it, `migrate`, and assert the same six `backwardCompat`
     properties;
   - assert the uploaded bytes are byte-identical to the stored bytes;
   - a legacy-index-style test that one malformed cloud summary row never empties the list,
     mirroring `legacyIndex.test.ts`.
   - **The corpus file itself never changes.** If a sync envelope format is ever persisted, it
     gets its *own* frozen fixture.

---

## 6. Recommended design

### Server (Supabase, Singapore)
```sql
create table docs (
  id            text primary key,          -- existing Worksheet.id
  user_id       uuid not null references auth.users,
  rev           bigint not null default 1, -- server revision, +1 per accepted push
  body          text,                      -- raw stored JSON (gzip+base64 later if needed)
  body_hash     text not null,             -- sha-256 of body, for no-op and identical checks
  schema_version int not null,
  title text, question_count int, has_cover bool, kind text,   -- WorksheetSummary mirror
  deleted_at    timestamptz,               -- tombstone = Trash
  updated_at    timestamptz not null,      -- client's Worksheet.updatedAt
  server_at     timestamptz not null default now(),          -- pull cursor
  device        text
);
-- RLS: user_id = auth.uid() for select/insert/update; no delete (purge via RPC).
create table doc_revisions (doc_id text, rev bigint, body text, saved_at timestamptz, device text);
-- trigger: on update, copy the old row here; a cron keeps the last 20 or 30 days.
create table user_state (user_id uuid, key text, rev bigint, body jsonb);  -- folders, patterns
create table entitlements (user_id uuid primary key, active_until timestamptz, plan text);
```
**`push_doc(id, base_rev, body, hash, schema_version, meta…, protocol)`** is an RPC with
`security definer` that checks `auth.uid()`, which is also where entitlement is enforced. It:
- rejects the call if the entitlement has lapsed (so reads keep working);
- rejects it if `protocol` < `min_protocol`, returning "update the app to sync";
- **rejects a downgrade**: `schema_version < stored.schema_version`. This is belt and braces
  over the client's `NewerDocumentError`;
- otherwise runs `UPDATE … WHERE rev = base_rev`. If no row matches, it returns
  `{conflict, server_rev, server_hash}`. It also inserts when `base_rev = 0` and the id is
  absent.

Keep bodies in Postgres at first, for the atomic compare-and-swap. If DB disk ever costs real
money (above about 100 GB), move the body to Storage under `/{user}/{id}/{rev}.json`, with the
row keeping the pointer and CAS applied to the row.

### Client
- **A `SyncedStore` decorator around the existing store**, in the style of `withChangeFeed`. It
  leaves every `WorksheetStore` method's behaviour unchanged and enqueues ids into an outbox.
- **The sync sidecar** is a new key `econ-worksheet-sync` or file `worksheets/sync.json`. It
  holds `{ id → { rev, hash } }`, the pull cursor and the device name.
  - It lives outside the `econ-worksheet:` prefix and is not a `*.worksheet.json`, so older
    builds ignore it, the same reasoning as for Trash and folders.
  - **Nothing sync-related goes into `Worksheet` or `KNOWN_KEYS`.**
- **Dirty detection is by hash, not by trusting a flag.** An older, non-syncing build may have
  edited files on the same machine. On start, re-hash and compare with the sidecar.
- **When to push:** debounce 5 s after the last save, and also on `visibilitychange`/blur/close.
  Coalesce per id. Send only the latest body.
- **When to pull:** on start, on window focus, every 5 minutes, and optionally through a Supabase
  Realtime subscription on `docs` for "changed on another device".
  Query: `select … where server_at > cursor`.
- **Downloaded documents go through the normal load path**: `parseWorksheet` then `migrate`.
  A newer `schemaVersion` opens read-only, and "Duplicate as editable copy" still works, with
  no new code. An older build never pushes a document it loaded as newer; that is already
  enforced by `NewerDocumentError`.
- **The web client** lists from the cloud's metadata columns, fetches bodies lazily on open, and
  caches them in IndexedDB. It must not mirror the whole library into `localStorage`. This is
  the only structural change to the web store.

### Conflict policy
| Case | Action |
|---|---|
| Push rejected (`rev` moved) and server hash equals local hash | No conflict; adopt `server_rev` |
| Push rejected, contents differ | Fetch the server version. It **keeps the id** (the canonical copy), like Obsidian, where the original keeps the remote version. The local version is saved as a **new document** "Title (conflicted copy, <device>, 2026-09-30 14:32)" and pushed. If it was open in the editor, the editor stays on the conflicted copy and shows a banner. **Nothing is lost.** |
| Edit vs delete | The edit wins: the tombstone is cleared ("Live wins", as in Trash) |
| Newer-schema document arrives | Stored locally as-is and opens read-only. This build never pushes to that id. |
| Older build pushes over newer-schema doc | Server rejects it (downgrade guard); the client makes an editable copy instead |
| Folders or 題型 conflict | Per-row union merge and retry (they are maps; no copy needed) |

Every accepted push also leaves the previous body in `doc_revisions`. A "Version history"
panel (restore = save as copy) is the last safety net and a sellable feature.

### Versioning rules (additions to § Schema evolution)
1. **The server stores bytes and never migrates.** `schema_version` is metadata, not a switch.
2. **The sync protocol has its own integer version**, independent of the schema version. The
   server keeps `min_protocol`. Too-old clients keep working locally and are told to update to
   sync.
3. **A schema bump now has a cross-device effect.** Devices on the older build see new
   documents as read-only. So:
   - prefer additive changes (they already round-trip through `__unknown` and nested
     pass-through);
   - ship desktop auto-update before any bump;
   - add a test that an older build's load, edit and save preserves unknown *nested* fields,
     not just top-level ones.
4. **Frozen corpus:** unchanged. Add a round-trip test that runs the corpus through the sync
   upload and download pipeline.

### Costs (US$/month, estimated)
| | 1k users | 10k users |
|---|---|---|
| Supabase Pro | 25 | 25 |
| DB disk beyond 8 GB (bodies + 20-revision history) | 1–3 | 12–37 |
| Compute upgrade (optional) | 0 | 0–15 |
| Egress (fits in the 250 GB included) | 0 | 0 |
| Storage, if images are split out (100 GB included) | 0 | 0–2 |
| **Total** | **≈ 25–30** | **≈ 40–80** |

Payment-provider fees (Stripe, Paddle or Lemon Squeezy) dwarf infrastructure and belong in a
separate track.

### Suggested order of work
1. Auth plus entitlement (sign-in on web and desktop, plus the webhook).
2. The `docs` table, RLS, `push_doc` RPC and revision trigger.
3. `SyncedStore` for **desktop first**, because the file store has no quota problem. Then
   first-sign-in migration with the preflight backup.
4. Conflict copies and version history UI.
5. The web store: lazy fetch plus IndexedDB cache.
6. Later: colleague sharing as a *read-only link or send-a-copy* (`shares` table plus an RLS
   policy). Only if live co-editing is demanded, evaluate Yjs through self-hosted Y-Sweet for
   shared documents only.

---

## Sources
- Supabase: [pricing](https://supabase.com/pricing) · [regions](https://supabase.com/docs/guides/platform/regions) · [egress](https://supabase.com/docs/guides/platform/manage-your-usage/egress) · [security](https://supabase.com/security) · [DPA](https://supabase.com/legal/customer-resources/data-processing-addendum) · [Triplit joins Supabase](https://supabase.com/blog/triplit-joins-supabase)
- Cloudflare: [R2](https://www.cloudflare.com/products/r2/) · [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) · [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- Firebase: [Firestore billing](https://firebase.google.com/docs/firestore/pricing) · [Storage Blaze requirement FAQ](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024)
- Vercel Blob: [pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing) · Neon: [pricing](https://neon.com/pricing) · Convex: [pricing](https://www.convex.dev/pricing) · PocketBase: [docs](https://pocketbase.io/docs/)
- Sync engines: [PowerSync pricing](https://www.powersync.com/pricing) · [Electric Cloud pricing](https://electric.ax/blog/2026/04/02/electric-cloud-pricing) · [Zero 1.0](https://zero.rocicorp.dev/docs/release-notes/1.0) · [Replicache releases](https://github.com/rocicorp/replicache/releases) · [InstantDB shutdown notice](https://www.instantdb.com/pricing) · [Jamsocket joins Modal](https://modal.com/blog/jamsocket-is-joining-modal) · [Y-Sweet](https://github.com/jamsocket/y-sweet) · [Liveblocks pricing](https://liveblocks.io/pricing)
- CRDTs: [Automerge 3](https://automerge.org/blog/automerge-3/) · [Automerge 2→3 migration](https://automerge.org/docs/guides/migrating-from-automerge-2-to-automerge-3/) · [Loro 1.0](https://loro.dev/blog/v1.0) · [Cambria](https://www.inkandswitch.com/cambria/)
- Obsidian conflict model: [Troubleshoot Obsidian Sync](https://obsidian.md/help/sync/troubleshoot)
- BYO cloud: [Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth) · [Drive appdata](https://developers.google.com/workspace/drive/api/guides/appdata) · [OneDrive app folder](https://learn.microsoft.com/en-us/graph/onedrive-sharepoint-appfolder) · [GWfE third-party access](https://support.google.com/a/answer/13288950?hl=en) · [GWfE access requests](https://workspaceupdates.googleblog.com/2024/11/request-access-to-third-party-apps-on-behalf-of-students.html)
- PDPO: [PDPO at a glance](https://www.pcpd.org.hk/english/data_privacy_law/ordinance_at_a_Glance/ordinance.html) · [PCPD cloud guidance](https://www.pcpd.org.hk/english/resources_centre/publications/files/IL_cloud_e.pdf) · [PCPD cross-border guidance](https://www.pcpd.org.hk/english/resources_centre/publications/files/GN_crossborder_e.pdf) · [model clauses](https://www.pcpd.org.hk/english/resources_centre/publications/files/guidance_model_contractual_clauses.pdf) · [DLA Piper HK transfer](https://www.dlapiperdataprotection.com/?t=transfer&c=HK) · [HFW reform](https://www.hfw.com/insights/a-new-era-for-data-protection-in-hong-kong-legislative-updates-for-a-digital-age/) · [2026 reform status (secondary)](https://www.recordinglaw.com/world-laws/world-data-privacy-laws/hong-kong-data-privacy-laws/)
