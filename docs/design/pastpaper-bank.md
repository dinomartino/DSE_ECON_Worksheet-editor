# Past paper bank 歷屆試題庫 (k-0443, k-0444)

Status: step B (k-0443) and step C (k-0444) built, 2026-11-16, on `develop` (not released). Plan: k-0441 `PLAN.md` § 15
(kp-econ-bank session), approved by the user with the data in a separate public repo,
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
- **Editor → 題庫 tab**: a switch at its top, *My bank* / *Past papers*. Past papers lists a
  topic's questions with Insert (after the insert anchor; one ⌘Z; the review bar) and
  marks those already in the paper. The switch is not drawn when the bank is off.

The user's "the top part" was read as these two tops: the Library's list of banks, and the
top of the 題庫 tab. A fourth sidebar tab was the alternative (the 400 px sidebar holds three).

## Data, and the switches

Static files from one address (`src/pastpapers/config.ts:BUILT_IN_SOURCE`):
`manifest.json` (the list) and `topics/<id>.json` (one editor `kind: 'bank'` document per
topic). Read on demand: the list when the bank is opened, a topic when it is opened.

- Kept in IndexedDB `econ-pastpaper-bank` (web and desktop), not in the ~5 MB of document
  storage and not in backups. A topic is read from there while its `sha256` matches the
  list's; the list is always asked for fresh, and the kept copy is used offline.
- Off for everyone at their next opening: `"enabled": false` in `manifest.json` (it also
  drops every kept topic of that source). Gone from a build: `BUILT_IN_SOURCE = ''`.
  Per computer: Settings → Past paper bank → Built-in / Off / Another address (https; http
  only on localhost; or a path on the app's origin). Remove downloads is there too.
- The desktop app needs no permission for it: the webview's own fetch, as the AI requests
  (CSP null; no Tauri plugin). The download is a GET with no credentials and no body.
- **The public data repo does not exist yet** (the user's go is pending). Until then the
  built-in source answers "not found" and the screen says the bank can't be reached.

## Copies

Every way out copies (`copyQuestion`): fresh ids, `lineage.rootId` kept (`kp:CE2011/P2/Q8`),
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
   bytes), `enabled`, `questions` total, `format: "kp-editor-pack"`.
2. Each topic file opens in the editor's loader (`migrate`) as a document.
3. Per question: a tag `CE2011/P2/Q8` (`(CE|AL|DSE)(year|SP|PP)/P<n>/Q<n>`) for the filters and
   the printed number; `provenance {en, zh}` for the source line; a stable `lineage.rootId`.
4. A shared stimulus: a `stimulus` layout element directly before its questions in `flow`.
   **Requested change:** export its lead sentence as the stimulus's `prefix`/`suffix` without
   the numbers (and `span`), since the editor prints "Questions N and M" itself. Until then the
   loader lifts it (`src/pastpapers/pack.ts:liftStimulusLead`) only when both languages name
   exactly the questions that follow (23 of the trial export's 26 stimuli); the other 3 print
   their sentence as exported, beside the editor's.
5. **Questions whose options are pictures** (kp-bank's `picture-options`): export them as
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

## Not built

The editor's 題庫 tab searches the open topic only (the screen searches every topic). A
passage inserted for one question and later its partner is two copies of the passage.
