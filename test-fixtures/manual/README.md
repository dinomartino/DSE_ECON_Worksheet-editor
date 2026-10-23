# Documents for testing by hand

Open each file with the start screen's open-file button (the same path as any saved paper). They are ordinary saved documents; all names, schools, emails and
numbers in them are invented. Regenerate with
`EMIT_MANUAL_FIXTURES=1 npx vitest run scripts/emit-manual-fixtures.test.ts`
(`src/test/manualFixtures.test.ts` proves they still open and export).

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
