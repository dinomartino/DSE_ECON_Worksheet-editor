# Past paper bank 歷屆試題庫 (k-0443, k-0444, k-0447)

Status: step B (k-0443) and step C (k-0444) built, 2026-11-16, on `develop` (not released). Plan: k-0441 `PLAN.md` § 15
(the past-paper bank's own session), approved by the user with the data in a separate public repo,
questions and official answers only (u-58jj). The user then asked for it to be **a bank of
its own, not mixed into the 題庫** (u-xpin).

## What it is

A second question bank beside the teacher's own: HKCEE, HKALE and HKDSE MC questions with
answers, by topic, English and 中文 in one record. Read-only. It is not stored in the
teacher's documents and never counts as one; questions taken from it are ordinary copies.

## Where it sits

- **Start screen → Library**: a row of its own, *Past paper bank 歷屆試題庫*, under *Question
  bank 題庫*. It opens its own screen (view `pastpapers`): topics down the left, the topic's
  questions as they print (Student version, an Answer chip), search (this topic, or every
  topic by the list's search index), Exam chips (HKCEE / HKALE / HKDSE), Years, Paper (one
  paper of every topic, in question order: "HKDSE 2016 Paper 1"), the paper language
  (EN / 中文), and a tray of picks: Add to → New
  worksheet / New Paper 1 / one of your papers, or Copy to my question bank.
- **Names are paper words** (user u-cs6l): topic names, paper names, question sources and the
  search cards follow the question language (the screen's EN / 中文; the open document's mode in
  the 題庫 tab, both names for a bilingual paper's topic list), never the interface language,
  as curriculum names do (SYSTEM_ARCHITECTURE § Curriculum names are paper-side). One helper,
  `src/pastpapers/pack.ts:packName`. Proof: `scripts/pastpaper-language-verify.mjs`.
- **Tables sized to their words** (user u-zhww): the export leaves every table without a width,
  which the editor reads as the whole column. The loader (`src/pastpapers/pack.ts:withFittedTables`,
  through `src/model/tableFit.ts:fitTableToContent`) stores a width from the words (both
  languages, typed tabs to the 0.5 in grid), centres a narrower stem or passage table, keeps an
  option's table in its half of a two-by-two grid (≤ 0.9), centres figures and a short heading
  row, and sizes for the narrower of the bank's page and a new paper's. A stored width (export or
  teacher) is kept. The table bar's Fit to content / Full width reuse it
  (`src/model/tableFit.ts:refitTable`).
- **Editor → 題庫 tab**: a switch at its top, *My bank* / *Past papers*. Past papers lists a
  topic's questions with Insert (after the insert anchor; one ⌘Z; the review bar) and
  marks those already in the paper. The switch is not drawn when the bank is off.

- **By topic / By year** (k-0497, user u-nlb5): a switch at the top of the screen's left column
  and of the 題庫 tab's Past papers side. By year lists the exams (HKDSE, then HKCEE, then HKALE),
  each year newest first (HKDSE 2026 … 2012, then the Practice and Sample papers), with the paper
  and question count; a year opens to its questions in paper, then question-number order. A year
  with more than one paper (HKALE) lists its papers under it, to narrow to one, and the questions
  get a heading at each paper. Built only from the source tags of the list's search index
  (`src/pastpapers/years.ts`), so the list needs no topic downloaded; each question downloads its
  topic when scrolled to, as a search of every topic does. Without an index (an older export) only
  the years of opened topics are listed, with a Download every year button. Exam chips and Years
  narrow the list (the open year follows when they drop it); the Paper filter is hidden (the list
  is it); search is This year / Every year (every year in year order). Keyboard: ↑ ↓ the year
  above or below, Home / End, → ← a year's papers. The view is remembered on this computer
  (`view` in `econgen.settings.pastPapers`), the open year for the session; going to By year opens
  the paper the Paper filter had chosen. Picks of one paper across topics make a new worksheet
  named after the paper ("HKDSE 2019 Paper 1"). The tab has a year picker instead of the list.
  Proof: `src/pastpapers/years.test.ts`, `scripts/pastpaper-years-verify.mjs` (EN and 中, live bank).

The user's "the top part" was read as these two tops: the Library's list of banks, and the
top of the 題庫 tab. A fourth sidebar tab was the alternative (the 400 px sidebar holds three).

## Data, and the switches

Static files from one address (`src/pastpapers/config.ts:BUILT_IN_SOURCE`):
`manifest.json` (the list) and `topics/<id>.json` (one editor `kind: 'bank'` document per
topic). Read on demand: the list when the bank is opened, a topic when it is opened.

- Kept in IndexedDB `econ-pastpaper-bank` (web and desktop), not in the ~5 MB of document
  storage and not in backups. A topic is read from there while its `sha256` matches the
  list's; the list is checked at every opening (through `latest.json` since k-0447, below),
  and the kept copy is used offline.
- Off for everyone at their next opening: `"enabled": false` in `manifest.json` (it also
  drops every kept topic of that source). Gone from a build: `BUILT_IN_SOURCE = ''`.
  Per computer: Settings → Past paper bank → Built-in / Off / Another address (https; http
  only on localhost; or a path on the app's origin). Remove downloads is there too.
- The desktop app needs no permission for it: the webview's own fetch, as the AI requests
  (CSP null; no Tauri plugin). The download is a GET with no credentials and no body.
- **The public data repo is live** (2026-11-17, u-qbmp):
  `https://raw.githubusercontent.com/dinomartino/dse-econ-question-bank/main/` (`BUILT_IN_SOURCE`).
  Its manifest names no format; question ids start `pp-`, root ids `pp:`. This repo is public
  too: the exporter's private names never appear here (u-qbmp).

## Hosting and caching (k-0447)

The user's question (u-1vja): GitHub limits with many teachers. Plan and measurements:
`Outbox/k-0447-bank-caching/PLAN.md`; accepted as recommended (u-mzws): topic files from
jsDelivr pinned to a commit, a tiny `latest.json` on GitHub, topics kept by fingerprint,
GitHub at the commit as the fallback, offline for opened topics; one extra commit per publish
and jsDelivr seeing teachers' IP addresses are accepted.

**How the editor reads a GitHub repo** (`BUILT_IN_SOURCE`, or any other address of the form
`https://raw.githubusercontent.com/<owner>/<repo>/<branch>/`; `config.ts:gitHubSource`):

1. `latest.json` from GitHub raw on the branch, revalidated at every opening (usually
   "304 unchanged": the only request that reaches GitHub).
2. It names the commit whose list is kept → nothing else is downloaded.
3. A new commit → its `manifest.json` once from `https://cdn.jsdelivr.net/gh/<repo>@<commit>/`,
   else `https://raw.githubusercontent.com/<repo>/<commit>/` (`config.ts:pinnedSource`). Topics
   come from the same two, in that order, when opened. A file at a commit never changes, so
   jsDelivr and the browser keep it for a year (`immutable`, measured).
4. Topics are kept under the bank's own address and the file's name (`<branch base>|topics/x.json`),
   never the commit's or the mirror's, and checked by `sha256`: a publish re-downloads only the
   topics whose fingerprint changed. The copies kept before k-0447 stay valid.
5. GitHub can't be reached (no connection, or it throttles the school's address: 429) → the
   kept list, with the topics at its commit; with nothing kept, jsDelivr's copy of
   `latest.json` (`…@<branch>/latest.json`, up to 12 h old), never preferred over a kept list.
6. **No `latest.json` (404), or one this build can't read** → the branch, exactly as before
   k-0447 (`<base>manifest.json` fresh, topics from the branch). This is today's published repo:
   the editor keeps working with it until the publish step below lands (proof: step 0 of
   `scripts/pastpaper-cache-verify.mjs`). It costs one 404 per opening until then.
7. The web build asks the browser once to keep the store (`navigator.storage.persist()`,
   `bank.ts:keepDownloads`; Firefox may ask the teacher). Safari can still clear it after 7
   days unused; the desktop app is not affected.

Another address that is not a GitHub repo root (a local export, `/pastpaper-bank/`) is read
as before: `manifest.json` fresh, files beside it; it never asks for `latest.json`.

Settings → Past paper bank → Built-in says: "Downloaded from jsDelivr, a public service that
mirrors dinomartino/dse-econ-question-bank on GitHub, and from GitHub itself. Like any
website, both see your computer's IP address."

Measured in Chrome against the live bank (`scripts/pastpaper-cache-verify.mjs`, live commit
`96d99386`, `latest.json` served by the script, the publish simulated): first visit = `latest.json`
+ the list and opened topics from jsDelivr at the commit; second visit = `latest.json` only; a
publish changing one topic = `latest.json` + the new list + that topic; jsDelivr down = the same
files from GitHub raw at the commit; no connection = opened topics show, others say they can't
be downloaded; no `latest.json` = the branch.

### `latest.json`: what the export side must do (kp-bank; not built in this repo)

**The file.** At the root of the public repo, on `main`, beside `manifest.json`. UTF-8, no BOM,
one line and a newline:

```json
{"version":1,"commit":"<40 lower-case hex>","enabled":true,"published":"2026-11-20T09:15:00Z"}
```

- `version`: `1`. A different version is ignored by this build (it reads the branch), so a
  change of meaning bumps it; a new optional key does not.
- `commit`: the **full** id of the commit that holds the `manifest.json` and `topics/` being
  published (the *data commit*). Never a short id, a branch or a tag.
- `enabled`: `true`. `false` is the off switch: `{"version":1,"enabled":false}` (no commit
  needed) turns the bank off at every teacher's next opening and drops what their computer
  kept. A takedown also sets `"enabled": false` in `manifest.json` on `main`, for the branch
  fallback.
- `published`: when, ISO 8601 UTC. Informational; the editor does not compare it.
- Nothing else in it (the editor ignores unknown keys; keep it tiny).

**The exporter (`question_bank.py`)** must:

1. Keep writing `manifest.json` and `topics/<id>.json` exactly as now, with a `sha256` (hex of
   the file's exact UTF-8 bytes) and `bytes` on **every** topic row: the fingerprint is what
   lets a publish re-download only changed topics (a row without one re-downloads at every
   publish). Deterministic output stays required (same bank → same bytes).
2. Never put `latest.json` in the export folder: the export cannot know the data commit.
3. Offer the writer, so the Mac step does not hand-type JSON: e.g. `question_bank.py
   latest-json --commit <sha> --out <public clone>/latest.json` (and `--disabled` for the
   off switch), which refuses anything but 40 lower-case hex, writes the bytes above, and
   checks in the public clone that `git cat-file -e <sha>:manifest.json` succeeds and that
   every topic row of that manifest has a `sha256`. The exact command name is kp-bank's call;
   the bytes and checks are not.
4. Keep every topic file under 20 MB (jsDelivr's per-file limit; the largest today is 6.2 MB).
   A larger file still works through the GitHub fallback, but loses the mirror.

**The Mac publish step** (`Outbox/k-0441-question-bank/LOCAL-SYNC-PROMPT.md`, steps 10–11)
must become:

1. Step 10 as now: copy `manifest.json` and `topics/` into the clean clone, check the diff,
   commit them (the data commit; same neutral author, same message rules). `latest.json`
   must **not** be in this commit.
2. Then, still in step 10: `DATA=$(git rev-parse HEAD)`; write `latest.json` naming `$DATA`
   (the exporter's writer); `git add latest.json`; `git commit -m "Publish: latest.json
   names <first 8 of $DATA>"`. Proof: `git show --stat HEAD` lists `latest.json` only, and
   `git show HEAD~1 --stat` is the data commit. The proof line in step 10 that "only
   `manifest.json` and `topics/` change" applies to the data commit; the second commit
   changes `latest.json` only.
3. Step 11: show both commits (`git log -2 --stat --format='%h %an <%ae> %s'`) and wait for
   the OK; then **one** `git push origin main` sends both (no force, no tags, as now). If the
   push is rejected: stop; never rebase or amend (that would orphan the commit `latest.json`
   names).
4. After the push, three checks (GitHub's cache can lag up to 5 min; try again once):
   ```
   curl -sL https://raw.githubusercontent.com/dinomartino/dse-econ-question-bank/main/latest.json   # names $DATA
   curl -sL https://cdn.jsdelivr.net/gh/dinomartino/dse-econ-question-bank@$DATA/manifest.json | shasum -a 256
   shasum -a 256 "$PUBLIC/manifest.json"                                                              # the same hash
   ```
   No jsDelivr purge is needed: an address with a commit id is new by construction.
5. A takedown: write `latest.json` with `--disabled`, set `"enabled": false` in
   `manifest.json`, commit both together, OK, push.

**Live since 2026-11-17 (u-k7hq):** data repo `main` 8272b9c, `latest.json` naming
`ce84ba12` (the syllabus manifest). `node scripts/pastpaper-cache-verify.mjs <out> --live`
passed 17/17 against it, nothing supplied: first visit (GitHub `latest.json`, then the list and
topics from jsDelivr at `ce84ba1`), second visit (`latest.json` only), GitHub down with a kept
list (no jsDelivr `latest.json`; a new topic from jsDelivr), GitHub down with nothing kept
(jsDelivr's `latest.json`), jsDelivr down (GitHub raw at the commit), no connection, A–J parts;
`scripts/pastpaper-topics-verify.mjs` all passed with no `--codes`.

The first `latest.json` can come with k-0448's syllabus republish: data commit (manifest gains
`syllabus`), then the `latest.json` commit naming it.

## Copies

Every way out copies (`copyQuestion`): fresh ids, `lineage.rootId` kept (`pp:CE2011/P2/Q8`),
so "Already in this paper" and the teacher's bank see two copies as one question. A shared
stimulus goes in once, in front of its questions, with `span` = how many came along; its
range is derived by the paper, as every stimulus's is (`src/library/stimuli.ts`).

Copy to my question bank (k-0444) keeps the passage too: in the teacher's bank document,
right before the copies it serves, with their count as its span. And the 題庫's own Insert
brings a passage with any question it serves in its document, a bank or a paper
(`loadBankCopies` reads `stimuliServing`; `commitBankCopies` plans one copy per group). A
question inserted alone gets the passage with span 1; inserting its partner later brings a
second copy of the passage (nothing links two copies of one passage).

No change to the stored document shape for copies: a copy is an ordinary MCQ (and stimulus).

**Show source (year + question no.)** (user u-w7gs, 2026-11-18): a box in the tray and in the
editor's Past papers tab. Every bank question already carries its source as `provenance`
("HKDSE 2019 Paper 1 Q12" / "香港中學文憑考試 2019 卷一 第 12 題"), which until now printed only in
the teacher's copy and the answer key. With the box ticked, a paper that gets its first sourced
questions turns on `Worksheet.showQuestionSources` in the same commit (one ⌘Z), and each
question prints its source in brackets at the right of its numbered line (`render/questionSource.ts`).
After that the paper's own switch rules (Setup → Page), so adding more never flips a paper; in the
tab the box then reads "Show sources on this paper" and is that switch. The choice is remembered
in `econgen.settings.pastPapers` (`showSources`), off by default. One optional paper field, in
`KNOWN_KEYS`; no schema bump; nothing stored on the copies.

**Source format** (user u-z6ft, 2026-11-19): beside the box, a picker (`SourceFormatSelect`):
Full "(HKDSE 2019 Paper 1 Q12)" (default), Short "(DSE2019/P1/Q12)", Short Roman
"(DSE2019/I/Q12)". Short labels are the bank's own tag shape, one string on both language
sides (so a bilingual paper prints it once): CE / AL / DSE, a year or SP / PP, `P<n>` or a
Roman numeral, `Q<n>`. They are read off the printed `provenance` (`questionSource.ts:sourceParts`,
English side first, then Chinese), never off `tags`, so a source the teacher rewrote in their own
words prints in full. Stored per paper as `Worksheet.questionSourceFormat` only when not full
(`KNOWN_KEYS`, no schema bump); remembered as `sourceFormat` in `econgen.settings.pastPapers`.
The bank sets it with the switch in the insert's commit (`actions.ts:sourcesPatch`); after
that Setup → Page and the tab's picker are the paper's. Position and the own-line rule are
unchanged.

## Questions whose options are pictures (k-0444)

The editor already had the shape: an MC option may carry blocks (`McqOption.blocks`), and
with `optionLayout: 'columns2'` they print as a grid, two per row, each letter (and caption)
directly above its own figure: A B, then C D (`registry/mcq.ts`, an `optionRow` per row, a
borderless layout table in Word). k-0444 adds:

- The loader gives `columns2` to a question whose every option holds a picture, diagram or
  table and which sets no layout (`pack.ts:withPictureGrid`), so the trial export prints right.
- A figure wider than its half of the page prints at the cell's width (height in proportion;
  the stored size is untouched), and a table option takes at most 90% of its cell, so two
  tables never read as one.
- The whole question stays on one page: an MC is kept whole by the page flow, and the `.docx`
  breaks its pages where the preview's sheets do (`joinWithPageBreaks`), so Word draws the
  same pages.
- The Chinese picture prints in 中文 in options as in the stem, and now in a table cell too
  (`CellImage.srcZh`, nested, additive).
- A table may draw no lines at all (`TableBorders` `none`, additive: an older build draws it
  ruled): the placing grid for diagrams numbered (1) to (4). Also offered in the table's
  context bar ("No lines" / 無框線).

Checked on the 17 picture-option questions of the trial export (preview, the editor, the
`.docx` of the real Export dialog in English and 中文, drawn by LibreOffice) and on two
synthetic questions for the variants not yet exported (numbered diagrams, table options).
Not opened in real Word.

## The web build's 5 MB (k-0444)

A browser keeps about 5 MB (5 Mi UTF-16 units) for all of a site's documents; pictures are
stored inside documents. `src/storage/webQuota.ts` measures it (web only; desktop saves files).
The toolbar's save status says "Storage nearly full" once a save leaves it 80% full; the Past
paper bank's tray says how full the picks would make it, and refuses Add and Copy to my
question bank when they would not fit.

## What the editor needs from the export

The loader is tolerant (unknown fields ignored, a bad entry drops only itself, a question
of a type this build does not know is left out and counted), so the export may change.
What it reads:

1. `manifest.json`: `topics[]` with `id` and `file` (relative, inside the source). Optional:
   `title {en, zh}`, `syllabusOrder`, `questions`, `bytes`, `sha256` (hex of the file's UTF-8
   bytes), `enabled`, `questions` total, optional `format: "question-bank-pack"` (the published bank names none).
   **`syllabus`** (k-0446): per topic, the editor's topic codes it covers (`["C.ped", "C.pes"]`,
   `["G"]`; `src/model/topics.ts`), the same codes the export already stamps on the topic's
   questions. The picker groups topics under the part of the first code it knows (A to J,
   EL1/EL2; names from `model/topics.ts`, never from the bank), inside a part in the list's
   order; topics without a known code go last under "Other topics"; a list where no topic
   names one is listed flat, as before (`src/pastpapers/groups.ts`). **Requested change:**
   the exporter writes it from the same table it tags questions with.
2. Each topic file opens in the editor's loader (`migrate`) as a document.
3. Per question: a tag `CE2011/P2/Q8` (`(CE|AL|DSE)(year|SP|PP)/P<n>/Q<n>`) for the filters and
   the printed number; `provenance {en, zh}` for the source line; a stable `lineage.rootId`.
4. A shared stimulus: a `stimulus` layout element directly before its questions in `flow`.
   **Requested change:** export its lead sentence as the stimulus's `prefix`/`suffix` without
   the numbers (and `span`), since the editor prints "Questions N and M" itself. Until then the
   loader lifts it (`src/pastpapers/pack.ts:liftStimulusLead`) only when both languages name
   exactly the questions that follow (23 of the trial export's 26 stimuli); the other 3 print
   their sentence as exported, beside the editor's.
5. **Questions whose options are pictures** (the bank's `picture-options`): export them as
   `type: "mcq"`, as the trial export already does, plus `"optionLayout": "columns2"`
   (add it to the exporter's allowed keys). Per variant:
   - **Four pictures A to D**: each option `{ id, text, blocks: [image] }`; `text` is the
     caption under the letter ("Chilled chicken"), or empty `{ "en": [], "zh": [] }`.
     Each image ≤ 302 px wide (half the 621 px column less 8 px), with `srcZh` when the
     Chinese picture differs. The editor prints a wider one at that width.
   - **Diagrams numbered (1) to (4), options A to D are combinations**: the stem holds, after
     its question paragraph, one table `{ kind: "table", borders: "none", rows: [two rows of
     two cells] }`; each cell `{ id, text: "(1)" in both languages, align: "center",
     vAlign: "top", image: { src, srcZh?, widthPx ≤ 290, heightPx, altText } }`. The options
     are ordinary text ("(1) and (2) only"); `statements` stays absent. A build before k-0444
     draws that table with lines and the English picture in 中文.
     The editor prints each "(n)" at its picture's upper-left corner, as on the papers, whatever
     the cell's `align` (k-0555: `TableNodeCell.labelAtImage`, `src/render/figureLabel.ts`); a
     build before k-0555 centres it, as the export's `align: "center"` says.
   - **Four tables as options**: each option `{ id, text: empty, blocks: [table] }`, the table
     as any other (no picture inside a cell of it).
   An unknown `type` still works as before: older builds leave it out and count it.
6. **The search index** (k-0444, below).

## The search index (k-0444)

A `search` block in `manifest.json`, so a search across the bank needs no topic downloaded:
the screen lists what matches from it at once, and each question's topic downloads only
when its card is scrolled to. Without it (an older export) "Every topic" offers to download
the whole bank once, as before. Reference implementation: `scripts/pastpaper-index.mjs`
(`node scripts/pastpaper-index.mjs <pack> <out>`), which made the trial pack's.

```json
"search": {
  "version": 1,
  "questions": [
    { "topic": "quantity-theory-of-money", "source": "DSE2016/P1/Q34",
      "en": "According to the classical quantity theory of money, which of the following diagrams …",
      "zh": "根據古典貨幣數量理論，當每年的貨幣供應以一固定的百分率增長時，下列哪幅圖是正確的？",
      "pictures": 4 }
  ]
}
```

- One row per question of every topic file. `topic` is the topic's `id`; `source` its source
  tag (the key that finds it in the topic file; one row per tag).
- `en` / `zh`: the question's plain words in reading order: its shared passage (when it has
  one), the stem (paragraphs, table cells, captions, source labels), the statements, the
  options (text, then any text in their blocks). Runs joined, formatting dropped, whitespace
  collapsed to single spaces. No answer, no explanation.
- `pictures`: pictures in the question and its passage; omitted when none.
- `version: 1`. A later version is ignored by this build (it falls back to downloading), so
  a change of meaning bumps it; a new optional field does not.
- The editor matches every typed word against both languages, the source tag and the source
  line it builds from the tag ("HKDSE 2016 Paper 1 Q34", "香港中學文憑考試 2016 卷一 第 34
  題"), so those need not be repeated in `en` / `zh`.
- Size on the trial pack: 1,741 rows, the list 1.24 MB (338 kB compressed, as GitHub serves
  it), against 34 MB for the topics. Kept on the computer with the list.

## Arrange 編排 (k-0556)

The teacher's own order of the bank (users u-dqw8 + u-o86n): the screen's third view lists
every question by syllabus part and bank topic, off the list's search index, each with its
source in the editor's Short form (DSE2024/P1/Q38, `pack.ts:shortSourceLabel`); its papers print sources Short. The teacher reorders inside a topic, moves questions between topics (drag, Alt + ↑ ↓,
Move to…), ticks a part or topic whole, and makes a worksheet from a part, a topic or the
ticked set in that order: copies from several topics get a heading per topic (the teacher's
topic, in the teacher's order), and sources print Short only when Arrange's own Show source
tick (off each visit) is on. The order is a view only: kept per bank address in localStorage
(`econgen.pastPaperArrange.v1`, only the topics changed, by source tag), never in a document,
a backup or the bank. A later publish's new questions go to the end of their own topic; a
question or topic the bank drops leaves the lists. Code: `src/pastpapers/arrange.ts`,
`src/components/pastpapers/PastPaperArrange.tsx`.

## Not built

The editor's 題庫 tab searches the open topic only (the screen searches every topic). A
passage inserted for one question and later its partner is two copies of the passage.
