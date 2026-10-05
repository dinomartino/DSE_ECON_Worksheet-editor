# How other apps sync through the cloud (survey, 2026-10-05)

Econ Studio 經濟備課室. Written against `develop` at `93ba8a0`. Research only; nothing is built.
The user chose the **Library location** approach (K Phase A,
`docs/research/2026-09-paid-product/K-free-sync.md`): the desktop library lives in a folder the
teacher picks inside OneDrive, Google Drive for desktop, iCloud Drive or Dropbox. The direct
Google Drive API design (`docs/design/drive-sync.md`) is shelved. This survey asks how about 20
other apps do it, what went wrong for them, and what that means for us. It extends K § 2.6
(Obsidian, Logseq, Zotero) and does not repeat it.

Markers: **[unverified]** = from memory, a search-result snippet or a secondary source, not read
on a primary page. Numbers in brackets point to § 8 Sources.

---

## 1. Summary

- **Bring-your-own folder works for apps whose unit is one self-contained file.** Obsidian,
  KeePassXC, Typora, iA Writer and Ulysses still rely on it. Our paper (one `.worksheet.json`,
  images inline as `data:` URLs) is that shape.
- **The apps that left folder sync had databases or multi-file packages, or wanted web,
  sharing or a subscription.** Day One cites "thousands of cases of data loss and duplication with
  iCloud and Dropbox" [20]. 1Password 8 dropped Dropbox/iCloud vaults for accounts [21]. Logseq
  moved to a database because "it's unacceptable that Logseq still loses data" [14]. None of
  those reasons applies to us, **provided** no shared index lives in the folder (K § 4).
- **Every serious folder app tells users the same three things:** one computer at a time; wait
  for the cloud to finish before switching; keep files downloaded, not online-only. Scrivener
  says it most bluntly: "Never, *ever* open the same project on more than one computer at a
  time" [7].
- **Conflict copies get a named home**, not just a toast. Scrivener has a "Conflicts" folder in
  the Binder [7]. Joplin has a "Conflicts" notebook [30]. Obsidian names copies
  `note (Conflicted copy device-name YYYYMMDDHHMM).md` [2].
- **Automatic merging of whole files backfires.** Obsidian Sync merges Markdown by default but
  added a "Create conflict file" option in 1.9.7, because merged text could need hand repair [2].
  For our JSON, never merge a paper automatically; keep both.
- **Local history outside the synced folder is the safety net everyone ships.** Obsidian's File
  recovery keeps 5-minute snapshots for 7 days, per device, never synced [3]. Scrivener: keep
  backups local, "never in Dropbox" [7]. Joplin restores a "pre-sync version" from note
  history [30]. KeePass keeps the losing edit as a history entry [11].
- **Platform sync (iCloud/CloudKit) shuts out Windows.** GoodNotes and Notability each had to
  build a paid cloud of their own to reach Windows, Android or the web [34][35]. Bear stayed
  Apple-only [33]. A school-PC-plus-home-Mac teacher should not be steered to iCloud.
- **For a Windows and Mac teacher, OneDrive is the easy default.** It is built into Windows 10
  and 11 [44]. Google Drive for desktop may need the school to install it ("your organization
  must install it for you" on a managed Mac) [40]. Obsidian and Scrivener both warn against
  iCloud on Windows [1][7].
- **No cloud client, only the website?** Folder apps have no answer: Obsidian has no web app and
  sells Obsidian Sync instead [5]. API apps (draw.io, Joplin) work with no client, but they
  then own the files in the cloud and do not share them with a folder.
- **Folder on one machine and API on the other only works with folder-scoped APIs.** Scrivener
  for iOS reads the same Dropbox folder the desktop syncs [8]. Joplin and Remotely Save use the
  OneDrive and Dropbox "App folder" [31][6]. Google's `drive.file` scope only sees files the app
  created or the user picked [42]. Even draw.io hits this: a Drive file not yet opened through it
  gives a permissions error [28]. So **the shelved Drive design cannot share a library with a
  folder-mode machine.**
- **Recommendation for "no client":** a guided "Set up OneDrive (or Google Drive) on this
  computer" step, plus today's open-a-file and backup paths through the cloud website. If an
  API stage is ever built for desktop users, it should be **OneDrive App Folder** (it
  interoperates with folder mode), not Google `drive.file`.
- **CRDTs are not worth it** for one teacher on two computers. Even Actual Budget, a CRDT app,
  says "avoid simultaneous usage of the same budget file" [37]. It would also mean a new
  document format and schema migration.

---

## 2. Comparison

| App | Sync model | Cost of sync | Setup the user sees | Conflicts: what the user sees | Documented warnings / failure modes | Changed over time |
|---|---|---|---|---|---|---|
| **Obsidian** | Own folder ("vault") in any synced folder; or paid Obsidian Sync | Free; Sync $4–10/mo [4] | Create or open vault in a cloud folder; iCloud needs `iCloud Drive/Obsidian/<vault>` [1] | Folder mode: the cloud client's copies. Sync: merge, or `(Conflicted copy device date)` file since 1.9.7 [2] | See K § 2.6. Plus "Keep Downloaded" on iCloud, "Always keep on this device" on OneDrive [1] | Added a conflict-file option because auto-merge needed fixing [2] |
| **Scrivener** | Project package in Dropbox (desktop); Dropbox API on iOS | Free (your Dropbox) | Save project in Dropbox; iOS: link Dropbox, default `Apps/Scrivener` [8] | "Conflicts" folder in the Binder [7]; warning if project "appears to be open" elsewhere (lock file) [9] | Never open on two computers; wait for the green tick; don't sleep before upload; avoid "smart" storage (files "appear to be missing or blank"); advisories against Google Drive, OneDrive, Box, iCloud for Windows [7] | iOS sync is **manual** on purpose: "we'd rather have users complaining that they don't like manual sync than … lost four hours of writing" [8] |
| **KeePassXC / KeePass** | One encrypted file in any synced folder | Free | Put the `.kdbx` in your cloud folder [10] | Cloud client makes a copy; user merges with "Merge from" (XC) or File → Synchronize (KeePass), which keeps the loser as history [11] | Encrypted file cannot be merged by Dropbox; copies need manual merge [12, discussion] | KeePassXC deliberately has no built-in cloud: "simple, not tied to a specific cloud provider" [10]. A Dropbox/Nextcloud sync PR is proposed **[unverified whether merged]** [12] |
| **Typora** | Plain files; no sync of its own | Free (paid app) | Save into any cloud folder [17] | Cloud client's copies | Auto-reload misses changes in cloud folders; iCloud edits not kept (issue reports) **[unverified]** [17] | — |
| **iA Writer / Ulysses** | "Library locations" / "External folders" pointing at cloud folders; Ulysses' own library uses iCloud | Paid apps, free sync | Add a folder from Files or Dropbox [18][19] | Cloud client's copies **[unverified]** | Ulysses: turn off "Read and write Markdown files" to keep full features in Dropbox folders [19] | iOS Files integration let both drop provider-specific code **[unverified]** |
| **Zotero** | Own free server for data; WebDAV or paid storage for files | Data free; 300 MB files free [13] | Sign in | "Conflict resolution dialog asking which version you'd like to keep" [13] | See K § 2.6: data directory in a cloud folder "is extremely likely to corrupt" [13] | — |
| **Logseq** | Was: Markdown folder (+ paid Logseq Sync). Now: DB version with "RTC" sync | Sync $5/mo backer tier during beta **[unverified]** [16] | — | `logseq/bak` (K § 2.6) | See K § 2.6 | Moved to a database; Markdown file-sync was too hard for collaboration and "Logseq still loses data" [14]; split into "OG" (files) and DB versions [15] |
| **Day One** | Was Dropbox/iCloud; now own Day One Sync | Paid subscription [20] | Sign in | — | "Duplicate entries" on Dropbox, "data loss" on iCloud [20] | **Left folder sync** for reliability, plus shared journals, web, encryption [20] |
| **1Password** | Was local vaults via Dropbox/iCloud/Wi-Fi; now 1Password.com account | Subscription | Sign in | — | Vault sync broke when providers changed APIs or apps **[unverified]** [22] | **Left folder sync** in 1Password 8: "1Password 8 requires a 1Password membership" [21] |
| **draw.io** | Static web app that saves straight to the user's Google Drive, OneDrive, Dropbox, GitHub, device | Free; "doesn't store your diagram data" [23] | Pick a storage location; authorise; "you are not signing in to draw.io" [25] | Google Drive and OneDrive: changes "detected and merged automatically"; others: File → Synchronize [26] | Third-party cookies, Workspace admins blocking the app, file must be picked first [27][28] | Moved to per-file Drive access; links to files never opened in draw.io now fail until opened via Drive [28] |
| **Joplin** | Own sync protocol over Dropbox, OneDrive, WebDAV, S3, Nextcloud, file system, or Joplin Cloud | Free over your cloud; Joplin Cloud paid | Pick a target, authorise | "Creates a Conflict notebook and copies the local note to it" [30] | Files in the target are not meant to be edited by hand [29]; "always synchronise before you start editing, and after" [30] | — |
| **Excalidraw** | Web app; File System Access API saves back to the same file; Excalidraw+ for cloud | Free; plus paid | Open/save a file | None (single user, one file) | Without the API (Safari, Firefox) every save is a download [32] | Dropped its Electron app: the web could do it [32] |
| **Remotely Save** (Obsidian plugin) | Adds API sync to Obsidian for devices with no client | Free: Dropbox, OneDrive App Folder, S3, WebDAV; paid: Google Drive, OneDrive full [6] | Configure in plugin | Free: keep newer or larger; paid: merge small Markdown [6] | "ALWAYS, ALWAYS, backup your vault before using this plugin" [6] | Community answer to "no client on my phone" |
| **Bear** | CloudKit (Apple's database sync) | Paid Pro | None, uses your Apple ID [33] | "Conflicted notes" help page **[unverified details]** | Apple only; Bear Web needs iCloud and fails with Advanced Data Protection on [33] | Chose CloudKit over file sync for speed and a future web app [33] |
| **GoodNotes** | iCloud between Apple devices; Goodnotes Cloud across all | Goodnotes Cloud needs Pro [34] | Sign in to a Goodnotes account | — | iCloud "does not sync your full library to Android, Windows, or Web" [34] | **Built its own cloud** to go cross-platform |
| **Notability** | Was iCloud; now Notability Cloud | Account-based [35] | Sign in | — | "iCloud Sync is unavailable in Notability Cloud" [35] | **Left iCloud** for its own cloud to reach Android and web |
| **Anki** | Own free server (AnkiWeb) | Free [36] | Sign in; first sync asks Upload or Download | Most edits merge; some changes force a **whole-collection** "keep local or AnkiWeb" choice [36] | Download "will replace any local changes" [36] | — |
| **Notion, Google Classroom, Kahoot, Quizlet, MS Forms** | Own server, account | Free tiers, paid plans | Sign in (often the school account) | Server decides; real-time | Needs the network; data lives with the vendor **[unverified, general knowledge]** | — |
| **Actual Budget** | Local-first; changes sync through a server you host | Free, open source [37] | Run or rent a server, log in | "Should work unless the edits conflict. To be safe, avoid simultaneous usage" [37] | You run the server | — |

---

## 3. The models, briefly

### 3.1 Bring your own folder
Survivors keep one self-contained file per thing, and never put a live database or index in
the folder (Zotero forbids it [13]; DEVONthink syncs a separate "store", never the live database [45]). The app's
job is to survive the sync client, not to sync. Scrivener is the warning case: its project is a
*package* of many files that must arrive together, so a half-synced project shows "Invalid
Project" errors [8], and it falls back on strict human rules [7]. KeePass shows the best
recovery move: when two copies diverge, it merges them **and** keeps the loser as history, so
nothing is lost [11].

### 3.2 Bring your own cloud via the provider's API
draw.io is the closest app to us: a static site with no server and no account, saving straight to
the user's Drive or OneDrive. It works with no desktop client, keeps revision history from the
provider, and merges concurrent edits on Drive and OneDrive [24][26]. The costs: OAuth support
(cookies, admin blocks [27]) and per-file Drive access, so files must be opened through it
first [28]. Joplin writes its own opaque format into `Apps/Joplin` [31], which gives a clean
conflict model but files a user cannot open by hand [29].

### 3.3 Platform sync (iCloud / CloudKit)
Fast and setup-free for Apple users, and impossible for a Windows school PC. iCloud for Windows
exists (Apple documents "Always keep on this device" for it [43]), but Obsidian warns it "may lead to file duplication or corruption" [1], and Scrivener
lists it as unsupported [7]. GoodNotes and Notability, both iCloud-first, built paid clouds to
leave the Apple world [34][35].

### 3.4 Own server
Day One, 1Password, Notability, GoodNotes and Logseq all ended up here, and each made sync a paid
feature [20][21][34][16]. Anki is the rare free one, and its non-mergeable case asks the user
to replace a **whole collection** [36]. That is a choice nobody can make safely.

### 3.5 Local-first / CRDT
Ink & Switch's essay names file sync's weakness ("a conflict that needs to be merged manually")
and in 2019 judged CRDTs not ready to replace proven products [38]. Automerge 3 (2025) is far
faster and claims production readiness **[unverified; release notes not read]** [39]. For one
teacher on two computers, simultaneous edits are rare, and "keep both + local history" covers
them. A CRDT would change the stored format (migration, a new corpus) for little gain.

---

## 4. Patterns that work

1. **First-run setup screen with concrete rules.** Draft wording (zh to be written with the UI,
   per `docs/design/ui-language.md`):
   - "Use one computer at a time. Before switching, close the paper and wait until OneDrive
     shows it is up to date."
   - "In OneDrive or Google Drive, right-click this folder → Always keep on this device."
   - "Don't use iCloud Drive on a Windows computer." (shown only on Windows when the path is iCloud)
   - "Keep this folder in one cloud service only."
2. **Detect the provider from the path** and tailor the advice: OneDrive, `~/Library/CloudStorage/*`,
   iCloud, Dropbox. Obsidian and Scrivener give per-provider advice [1][7]; we can do it
   automatically.
3. **Conflict copies have a home.** A "Needs attention / 要處理" view in the library listing each
   copy by computer name and time, as Joplin's notebook [30] and Scrivener's folder [7] do. It
   sits beside K's dashboard banner, not instead of it.
4. **Keep both, never auto-merge a paper.** Obsidian added a conflict-file option [2]. KeePass
   keeps the loser as history [11].
5. **Per-device history outside the folder** (K § 4.4), with a visible "Restore from this
   computer" next to each conflict. Obsidian [3], Joplin [30] and Scrivener [7] all keep this
   local and unsynced.
6. **Soft "open elsewhere" warning.** Scrivener's lock file warns "appears to be open" on another
   computer [9]. Stale locks after a crash are its known annoyance [9]. A safer variant for us:
   each computer writes only its own `devices/<computer>.json` (one writer per file, so it can
   never conflict) with "editing <id> since 10:42". The other computer shows a warning, never a
   block. Our compare-and-swap check (K § 4.3) remains the real guard.
7. **Per-paper decisions only.** Never offer Anki's "replace everything here / there" [36].

---

## 5. Failure stories to avoid

- **Silent loser on iCloud.** Day One saw "data loss" on iCloud [20], and K § 2.1 explains why:
  iCloud hides the losing version. Only our own per-device history can recover it.
- **Duplicates on Dropbox.** Day One's "duplicate entries" [20] came from syncing records, not
  files. Our scan must treat "same id in two files" as a conflict, never as two papers (K § 2.1).
- **Half-arrived multi-file data.** Scrivener's "Invalid Project" [8], Logseq's losses [14].
  Rule: never write a paper as several files, and never keep a shared index in the folder.
- **Online-only files look blank or missing** (Scrivener [7], Obsidian [1]). Rule: show such a row
  as "Not downloaded yet", never as deleted or corrupt (K § 2.2).
- **Leaving the cloud client mid-upload.** Google Drive for desktop moves unsyncable files to
  `lost_and_found`, which is deleted if you disconnect the account [41]. Scrivener: don't sleep
  the computer before the upload finishes [7]. Put this in the help text.
- **Whole-library overwrite prompts** (Anki [36]) and **"start fresh" deleting synced files**
  (K § 1). Both turn one click into loss on every device.

---

## 6. The "no client installed, only the cloud website" case

**How others handle it**
- **Folder apps:** no answer. Obsidian has no web app; its answer is the paid Obsidian Sync [5][4].
  Scrivener's desktop needs the Dropbox client [8]. Typora, KeePassXC: same.
- **API apps:** draw.io and Joplin need no client at all [25][29]. But the files then live only
  where the API wrote them.
- **Hybrid (folder on desktop, API elsewhere):** Scrivener iOS, Joplin, Remotely Save. It works
  only because Dropbox and OneDrive scopes can see a whole folder ("App folder"). Remotely Save
  charges for Google Drive and full OneDrive access [6], which suggests those are harder.
- **Google `drive.file` is per-file.** It covers files "that you open with an app or that the user
  shares with an app while using the Google Picker" [42]. A secondary source says picking a
  folder does not grant its children **[unverified]** [46]. draw.io's own issue shows the effect
  [28]. So a Drive-API computer cannot see papers that a Drive-for-desktop computer wrote into
  the library folder.

**What it implies for us**
1. **First, a guided install step** in the Library location dialog: "No OneDrive on this
   computer? It comes with Windows: sign in from the Start menu. On a Mac, get OneDrive from
   the App Store." This is cheap and fits the user's decision. Google Drive for desktop may need
   the school IT to install it [40]; say so.
2. **Second, the website as a manual bridge, already possible.** Papers are plain
   `.worksheet.json` files. A teacher can download one from onedrive.com and open it in the app,
   or upload a backup zip. Name this route in help, and check that opening a downloaded file
   never makes a duplicate that looks like a conflict.
3. **Third, only if teachers ask: a direct-API stage.** For **desktop** teachers it must be
   **OneDrive App Folder** (`Apps/Econ Studio`), which a folder-mode computer can also use
   (K § 3.2). The shelved Google Drive design stays right for **web-only** teachers, but as a
   separate kind of library ("Connect Google Drive", used on every computer), never mixed with a
   folder-mode library.

---

## 7. What this means for Econ Studio

Keep the plan: K Phase A, with its five store changes. The survey adds these, roughly in order
of value:

1. **Ship the setup screen with rules and provider detection** (§ 4.1–4.2). Every folder app
   relies on user rules. We can show them at the moment of choosing and tailor them to the path.
2. **Recommend OneDrive by default** for the Windows + Mac teacher. List Google Drive and Dropbox
   as fine. Steer away from iCloud when either computer runs Windows.
3. **Give conflict copies a permanent "Needs attention" home**, plus the banner. Keep both, never
   merge. Show "Restore from this computer" beside each one.
4. **Keep the per-device history out of the synced folder** (already in K). This is the only
   recovery for iCloud's hidden loser.
5. **Consider the warn-only "open on SCHOOLPC" marker** (§ 4.6). It is cheap if each computer
   writes only its own file. Not needed for the first release.
6. **For "no client": a guided install plus the manual website route now.** OneDrive App Folder
   later, if asked. **Record in `drive-sync.md` that `drive.file` cannot share a library with
   folder mode**, so the two are never combined. (That file is not edited here.)
7. **No server, no CRDT.** The apps that built servers did it for collaboration, web access or
   subscriptions, which we don't need. Their reliability problems came from shapes (databases,
   packages, shared indexes) that K's design already avoids.

---

## 8. Sources

1. Obsidian Help, "Sync your notes across devices": https://obsidian.md/help/sync-notes
2. Obsidian Help, "Troubleshoot Obsidian Sync" (conflict resolution): https://obsidian.md/help/sync/troubleshoot
3. Obsidian Help, "File recovery": https://obsidian.md/help/plugins/file-recovery
4. Obsidian Sync (pricing): https://obsidian.md/sync
5. Obsidian Forum, "Can I use Obsidian on the Web" (community answers; no official web app) **[secondary]**: https://forum.obsidian.md/t/can-i-use-obsidian-on-the-web/53621
6. Remotely Save README: https://github.com/remotely-save/remotely-save
7. Literature & Latte KB, "Using Scrivener with Cloud-Sync Services": https://scrivener.tenderapp.com/help/kb/cloud-syncing/using-scrivener-with-cloud-sync-services
8. Literature & Latte blog, "Scrivener for iOS: Syncing": https://www.literatureandlatte.com/blog/scrivener-for-ios-syncing
9. Literature & Latte forum, "Project Already Open" (lock file) **[secondary]**: https://forum.literatureandlatte.com/t/project-already-open/35136
10. KeePassXC FAQ: https://keepassxc.org/docs/
11. KeePass 2 Help, "Synchronization": https://keepass.info/help/v2/sync.html
12. KeePassXC PR #13341, cloud sync (proposed) and issue #1217 (Dropbox): https://github.com/keepassxreboot/keepassxc/pull/13341 , https://github.com/keepassxreboot/keepassxc/issues/1217
13. Zotero, "Syncing": https://www.zotero.org/support/sync
14. Logseq, "Why the database version and how it's going?": https://discuss.logseq.com/t/why-the-database-version-and-how-its-going/26744
15. Logseq, "Big update: Logseq is splitting into two versions": https://logseq.io/page/b2ad9ce1-9cb7-4436-8083-54cb4516d324/df4dc09d-0a12-4c87-904e-22a9bf4c350a
16. Logseq blog, "How to Set Up and Use Logseq Sync" and the backer tiers (search snippets) **[unverified]**: https://blog.logseq.com/how-to-setup-and-use-logseq-sync/
17. Typora Support, "Work with Mobile and other Devices" (search snippet) **[unverified]**: https://support.typora.io/Sync/
18. iA Writer, "Organize" / Library locations (search snippet) **[unverified]**: https://ia.net/writer/support/library/organize
19. Ulysses Help, "External Folders" and "Dropbox" (search snippets) **[unverified]**: https://help.ulysses.app/the-library/external-folders
20. Day One, "Day One Sync FAQ": https://dayoneapp.com/guides/day-one-sync/day-one-sync-faq/
21. 1Password Support, "Migrate your existing 1Password data from standalone vaults": https://support.1password.com/migrate-1password-account/
22. 1Password Community, "Local vaults removed in 1Password 8" **[secondary]**: https://1password.community/discussion/135701/local-vaults-removed-in-1password-8
23. draw.io, "Advantages of a bring-your-own-storage model": https://www.drawio.com/docs/security/secure-diagramming-storage/
24. draw.io, "Compare storage locations": https://www.drawio.com/docs/manual/file-storage-locations-compare/
25. draw.io, "Use draw.io with Google Drive": https://www.drawio.com/docs/integrations/google/google-drive-diagrams/
26. draw.io, "Synchronize and merge external changes": https://drawio.com/doc/faq/synchronize
27. draw.io, "Troubleshoot problems between draw.io and Google Drive": https://www.drawio.com/docs/integrations/google/gsuite-troubleshoot/
28. draw.io issue #3742, "Opening Google Drive files directly in the editor for the first time does not work": https://github.com/jgraph/drawio/issues/3742
29. Joplin, "Synchronisation": https://joplinapp.org/help/apps/sync/
30. Joplin, "Conflicts": https://joplinapp.org/help/apps/conflict/
31. Joplin, "OneDrive synchronisation" (`/Apps/Joplin`; search snippet): https://joplinapp.org/help/apps/sync/onedrive/
32. web.dev, "Excalidraw and Fugu"; Excalidraw blog, "Deprecating Excalidraw Electron": https://web.dev/articles/excalidraw-and-fugu , https://plus.excalidraw.com/blog/deprecating-excalidraw-electron
33. Bear FAQ, "Syncing & Privacy" and "Bear for web, Android & Windows": https://bear.app/faq/syncing-privacy/ , https://bear.app/faq/what-about-bear-for-web-android-windows/
34. Goodnotes Support, "Sync your Goodnotes library across all platforms with Goodnotes Cloud" (page returned 403; quoted from search snippet) **[unverified]**: https://support.goodnotes.com/hc/en-us/articles/10277366719759-Sync-your-Goodnotes-library-across-all-platforms-with-Goodnotes-Cloud
35. Notability, "Notability Cloud FAQ" (search snippet) **[unverified]**: https://support.gingerlabs.com/hc/en-us/articles/9598417028378-Notability-Cloud-FAQ
36. Anki Manual, "Syncing with AnkiWeb": https://docs.ankiweb.net/syncing.html
37. Actual Budget docs, "Syncing across devices": https://actualbudget.org/docs/getting-started/sync/
38. Ink & Switch, "Local-first software" (2019): https://www.inkandswitch.com/essay/local-first/
39. Ink & Switch Dispatch 011, "Automerge 3.0 Beta" **[3.0 release claims unverified]**: https://www.inkandswitch.com/newsletter/dispatch-011/
40. Google Drive Help, "Use Google Drive for desktop": https://support.google.com/drive/answer/10838124
41. Google Drive Help, "Fix problems in Drive for desktop": https://support.google.com/drive/answer/2565956
42. Google for Developers, "Choose Google Drive API scopes": https://developers.google.com/workspace/drive/api/guides/api-specific-auth
43. Apple Support, "Keep iCloud Drive files downloaded on your Windows computer": https://support.apple.com/guide/icloud-windows/keep-files-downloaded-icw8531ad6b7/icloud
44. Microsoft Support, "Sync files with OneDrive in Windows": https://support.microsoft.com/en-us/office/sync-files-with-onedrive-in-windows-615391c4-2bd3-4aae-a42a-858262e42a49
45. DEVONtechnologies forum, "Dropbox and Sync" (sync store, not the database) **[secondary]**: https://discourse.devontechnologies.com/t/dropbox-and-sync/15279
46. "Simplifying folder selection in Google Picker with drive.file scope" **[secondary, unverified]**: https://iifx.dev/en/articles/460025056/simplifying-folder-selection-in-google-picker-with-drive-file-scope
