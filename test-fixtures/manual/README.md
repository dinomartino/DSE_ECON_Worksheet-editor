# Documents for testing by hand

Open each file with the start screen's open-file button (the same path as any saved paper). They are ordinary saved documents; all names, schools, emails and
numbers in them are invented. Regenerate with
`EMIT_MANUAL_FIXTURES=1 npx vitest run scripts/emit-manual-fixtures.test.ts`
(`src/test/manualFixtures.test.ts` proves they still open and export). Regenerating rewrites each
file's timestamps; commit only the file you changed.

## `issue-4-repro.json` — GitHub #4, the teacher's paper

24 MC questions, English and 中文 stems alternating. Page break after Q4 and after Q5, so **Q5
is alone on page 2**.

1. Outline: select Q6 and press ↑. Expected: Q6 joins Q5 on page 2 (it used to jump over Q5).
2. Select Q5 and press ↓. Expected: only Q5 moves; the breaks stay where they were.
3. Drag Q10 onto the **lower half** of Q5's row. Expected: it drops *after* Q5, on page 2.
   Drag onto the upper half: it drops before.
4. After each move check the preview (thumbnails and page view) and export a `.docx` (Export →
   Word): the same questions on the same pages, numbers 1–24 in order, no stray blank page.
5. Undo (⌘Z / Ctrl+Z) puts everything back in one step.

## `issue-4-many-breaks.json` — breaks in a row

8 questions: a break first, a page with a single question (Q3 and Q5 each alone), two breaks in
a row (an empty page), and a break last.

1. ↑/↓ on Q3, Q4 and Q8 across breaks; each press moves the question past one position.
2. Drag a question to the lower half of the last row (after the final break) and to the upper
   half of the first row (before the first break).
3. Nothing should vanish: still 8 questions, still the same number of breaks.
4. Preview and `.docx` agree on the pages (including the empty one).

## `mixed-for-anonymiser.json` — for the anonymiser (k-0180)

A realistic mix: plain MC, a combination MC with (1)(2)(3), a very long question, an MC with a
table, an MC with an image placeholder, and a structured question. The title, one stem and the
structured question contain an invented school, teacher names, an email, a phone number and an
address — the things the anonymiser should find. Use it to try the anonymiser, and to check the
document opens, previews and exports to `.docx` at all.

## `option-layout-mix.json` — Option layout for all MC questions (k-0178)

Four MC questions whose options suit different layouts, then a structured question, over two pages
(a New page after Q2). Q1 (short options) is already set to 2 columns and Q2 (mid-length) to a row,
by hand; Q3 (full sentences) and Q4 (four diagrams) are stacked.

Open Setup (頁面設定), the Worksheet tab, **Option layout for all MC questions**. It reads "Now: 2
stacked · 1 in a row · 1 in two columns". After each click look at the page, the thumbnail strip and
the notice (how many questions changed, and Undo):

1. **Fit each question.** Q1 becomes one row, Q2 stays in 2 columns, Q3 stays stacked, Q4 becomes a
   2×2 grid of diagrams; "Changed 3 of 4 MC questions." Undo (or ⌘Z) puts all four back in one step.
2. **All in a row**, from the start. Q1 becomes a row. Q2's options do not fit on one line, so it
   still prints in 2 columns (select Q2: its panel says why); Q3's print in a grid, each option wrapping
   in its own cell. Q4 stays stacked, since a picture cannot sit in a row, and the notice says it left
   one figure question.
3. **All 2 columns**, then **All stacked**: every question changes. A second **All stacked** says
   there is nothing to change.
4. Change one question in its own panel afterwards: only that question changes. Press Undo on an old
   notice after another edit: it is gone (⌘Z still works).
5. Settings → Language → 繁體中文: the block and the notice read in Chinese.
6. Export → Word, and open the file in Word. `npm run samples` writes the same papers, one per
   choice, as `option-layout/…`.

`scripts/option-layout-verify.mjs` does 1–4 with a real mouse in Chrome, in English and 中文.

## The desktop app: dragging and dropped files (k-0182)

Run `npm run desktop:dev` (it starts the web server itself). Before the fix every drag in the
editor did nothing in the app, though it worked in a browser. With `issue-4-repro.json` open:

1. **Content list.** Drag Q10's row onto the lower half of Q5's row: it lands after Q5, on page 2.
   Onto the upper half of a row: before it.
2. **The page.** Drag the small grip in the margin beside Q9 onto the lower half of Q7: it lands
   after Q7.
3. **Thumbnails.** In the strip on the left, drag page 5's card onto the top half of page 2's: page
   5's questions move ahead of page 2's.
4. ⌘Z (Ctrl+Z on Windows) after each puts everything back in one step.

Files dropped on the window (this is the path that changed: it is now the page's own drop):

5. On the start screen, drop a `.json` from Finder: it opens. A backup `.zip`: it restores. A
   Word, PDF or picture file: the import starts. A `.txt` or `.xlsx`: the panel says it can't use it.
6. Hold a file over the start screen: a dashed "Drop a .json to open it…" panel appears; move away
   and it goes.
7. Open a document, then drop a `.json` or `.docx` on the editor: nothing happens, and the app must
   not turn into a view of the file.
8. Send feedback, then drop a PNG on the dialog: it attaches, and no import starts behind it. Dropped
   on the dialog's title or buttons, nothing happens.
9. On the start screen, drag a document card onto a folder row: it files it, as before.

The same drags with a real mouse in Chrome: `node scripts/drag-verify.mjs`. If any of 1–3 still
does nothing in the app, say which one and what you saw.
