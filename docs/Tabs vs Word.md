Econ Studio · Tab key review · 18 Oct 2026

# Tabs vs Word

A Word user lines text up with Tab: "Name: → Class: → No.:", a "(3 marks)" against the margin, an answer line drawn to the margin. Today Econ Studio has none of this in teachers' own text. Tab only works inside tables. Everywhere else it closes the field, and whatever is typed next is lost. Tab-stop machinery already exists for generated rows (header bands, MC option rows, marks, answer space), so most of the hard part is built. It is just not available to the teacher.

Tested by hand in the app (develop, headless Chromium), and the `.docx` checked in LibreOffice. Word behaviour taken from Microsoft's documentation and ECMA-376, not yet tried against real Word.

**Rechecked 18 Oct against the code and LibreOffice 7.4.7.** Two claims below were wrong and are corrected: the `.docx` keeps the tab (item 3), and default stops are measured from the margin, not the text (Phase 1 item 3).

## Status: all three phases built (18 Oct 2026, develop, unreleased)

- **Phase 1.** Tab types a tab in any text paragraph (`[data-tab-host]`). Shift+Tab does nothing; Esc then Tab leaves. Tables keep Tab = next cell, and the format bar's **→|** types a tab there. The page lays tabs out as Word does (`src/components/preview/tabLayout.ts`, rules in `src/model/tabStops.ts`), with the same span while editing as idle. Export writes `<w:tab/>`, and the clipboard writes `mso-tab-count`.
- **Phase 2.** `TextFormat.tabStops`, the ruler (**└┘** on the format bar: click, drag, drag off, double-click, arrow keys) and the **Tab stops…** panel (`src/components/preview/TabRuler.tsx`). Export writes `<w:tabs>` and clipboard `tab-stops`.
- **Phase 3.** Quick layouts in the panel: text to the right margin, an answer line to the margin, and a Name / Class / No. line (`tabPresetStops`, `applyTabPreset`).

**Decisions that differ from the proposal below:**
- **No schema bump.** `tabStops` is nested and additive. An older build keeps it and prints every word, only on the default grid, so under `writtenSchemaVersion`'s rule it stays at 1 and 0.8.x users are not locked to read-only.
- **The default stays 720 twips**, so the page and the file always agree and untouched documents export byte for byte. The Chinese-template default is 480 (see the references below), recorded as a follow-up.
- **Import is unchanged.** It still reads tabs as structure (cells, options) and turns a lone tab into a space (`src/import/lines.ts`). Keeping typed tabs there is a separate change to a scored pipeline.

**Verified:** the same fixture laid out by the page and by LibreOffice 7.4 from our `.docx` agrees within 0.3 pt for every stop kind (left with underscore leader, decimal, centre, right with dot leader, default grid, a carried tab, cells measured from their own edge). Every page word sits a uniform 2.9 pt right of LibreOffice's, tabbed or not: that is an existing inset, not this change. Samples are byte-identical except the six whose MC versions shuffle at random on every run, base included. `cover-verify` passes. `lq-verify` fails only the dotted-pitch check, which fails the same way on the unchanged build in this environment (no CJK font).

**Known gaps:**
- In a paragraph carrying "(n marks)" that has typed tabs and no stops of its own, Word sends the first tab to the marks' right stop. The page now does too, but after a carried tab the last word drops one line more on the page than in Word.
- A layout element's text is inset ~3 px on the page, so a stop at the margin ends its text a few px short there.
- Not yet opened in real Word or the Tauri window.

**Real references** (`real_life_reference/`, 5 Word files): right stops at the margin for marks are by far the most common use (572 in the HKEAA 2019 Paper 2, `→(1)` throughout the DBS answers). Left stops serve hanging (a)/(b) and label rows. No file uses a leader. Default tab stop: 720 in the zh-HK-language file, 480 in the three zh-TW-template files, 2300 in HKEAA's.

## What a Word user hits

1

### Tab throws away what comes next

Loses work

Editing a question stem, type "Name:", press Tab, type "Class:". Tab closes the field and moves focus to the next item, and "Class:" goes nowhere. Same in MC options and header fields. Sidebar text boxes move focus to the next button.

**Word:** Tab inserts a tab, and the text jumps to the next tab stop.

2

### A pasted tab shows as one space

Wrong on screen

A tab pasted from Word or Notes is stored, but the page shows a single space ("Name: Class: No.:"). While editing it shows as an 8-character gap instead, so editing and idle disagree.

**Word:** the text after the tab sits at the next stop, every 0.5 in by default.

3

### The `.docx` loses the tab

Wrong in the file

Export writes the tab as a raw character inside `<w:t>` (`src/export/docx/runs.ts:75`), not as Word's tab element. ~~LibreOffice drops it completely~~ **Corrected:** LibreOffice 7.4 reads it as a real tab. A stem exported from the app with "Name:\tClass:\tNo.:" puts Class at 144 pt and No. at 180 pt, on the 0.5 in grid, the same result as `<w:tab/>`. Word's handling is still untested. The real loss is the **clipboard**: the tab goes into the HTML as a bare character, so paste into Word collapses it to a space.

**Word:** a tab is `<w:tab/>` in its own run (the spec form, so worth writing anyway).

4

### No way to set a tab stop

Missing

There is no ruler and no Tabs dialog, so a teacher cannot right-align "(3 marks)" in their own text, centre a line, or draw a dotted or underlined answer line to the margin. They fall back on spaces and underscores, which break as soon as the font, size or language changes.

**Word:** click the ruler to add a left, centre, right or decimal stop. Leaders (dots, dashes, line) fill the gap.

5

### Import flattens tabs to spaces

Hides the problem

Word's tabs come in as `\t` (`readDocx.ts:280`, `docxBody.ts:380`). They are used as structure hints (option letters, label lists, answer lines) and then mostly turned into spaces (`src/import/lines.ts:231`, `docxChrome.ts:453`), because the page could not show them. Once tabs render, the tabs a teacher typed in Word could be kept.

## What already exists

- **Band rows** (header, masthead): Word's tab rule is already implemented for centre and right stops. `src/components/preview/bandRow.tsx` resolves each tab like Word, sizes an inline spacer to it, and wraps when no stop is left. It does not yet handle left stops, the default 0.5 in grid, or leaders.
- **MC option rows and label lists** export as real tab stops (`src/render/ir.ts` `ColumnsNode`). The preview lays them out as flex boxes, not tabs.
- **Marks** export as a right tab at the margin. **Answer space** exports as a right tab with a dotted underline. The preview draws both separately.
- **Tables:** Tab and Shift+Tab move between cells, and Tab in the last cell adds a row, as in Word.
- **Rich text** (`InlineRun.text`) already allows a tab character. Phase 1 needs no schema change.

## Proposal

### Phase 1 — Tab types a tab (no schema change)

1. **Tab inserts a tab** in every page text field (stems, parts, MC options, text blocks, header fields) and in sidebar text boxes. Shift+Tab does nothing in text, as in Word. Esc then Tab still leaves the field, for keyboard users.
2. **Tables keep Tab = next cell.** A tab inside a cell goes through a small "Insert tab" button on the format bar. Ctrl+Tab cannot be used in the browser (Chrome takes it) but can be added in the desktop app.
3. **The page shows tabs as Word does:** default stops every 720 twips (0.5 in), already written as `w:defaultTabStop` in `settings.xml`, **measured from the page's left margin, not the text's left edge** (verified: a stem indented 18 pt still tabs to margin + 36/72/108 pt). A hanging indent acts as an extra stop on the first line, and stops left of the caret are skipped. Generalise `bandRow.tsx`'s `resolveTab` (left stops plus the default grid) so editing and idle draw the same thing.
   - CSS `tab-size` cannot do this: it counts from the paragraph's own edge, which is the indent. It has to be a measured spacer, as `layoutBandRow` already does.
   - The measure must run before pagination reads heights, because a tab that wraps changes a paragraph's height.
4. **Export a real tab:** `mso-tab-count` in clipboard HTML (the real fix: paste loses it today; `TAB_HTML` already exists in `clipboard.ts`), `<w:r><w:tab/></w:r>` in the `.docx` (spec form; only documents with a tab change bytes), `\t` in plain text.
6. **Import keeps typed tabs** in body text once the page renders them (item 5 above).
5. **Show ¶ marks** (optional): a toggle showing tabs as → and line breaks as ↵, print-hidden.

Proof: the round trip type → preview → `.docx` → LibreOffice PDF lines up within 1 pt, `npm run samples` and `lq-verify` stay green, and a document with no tabs exports byte-identical.

### Phase 2 — Tab stops on a paragraph (schema v3)

1. **Data:** optional `tabStops: { pos (twips), align: left | center | right | decimal, leader: none | dot | hyphen | underscore }[]` on a paragraph's format. Since an older build would print it wrongly, this is a schema bump. It needs a new step in `MIGRATIONS`, a new frozen corpus file, and `backwardCompat.test.ts` green.
2. **Ruler** above the paragraph being edited (print-hidden): a tab-type picker at its left end, click to add a stop, drag to move, drag off to delete, double-click for the dialog. Stops carry to the next paragraph on Enter.
3. **Tabs dialog** in the sidebar: position in cm, alignment, leader, Set / Clear / Clear all.
4. **Preview:** the same resolver plus centre, right and decimal alignment and leader fills.
5. **Export:** `<w:tabs>` on the paragraph, measured from the margin as Word does (LibreOffice already imports `.docx` that way).

### Phase 3 — One-click layouts teachers actually use

- **Name / Class / No. line:** three underlined fields to the margin.
- **Answer line to the margin:** a right stop with an underscore or dot leader.
- **Right-aligned trailing text** such as "(3 marks)" or a source line.

Each is a preset that sets real stops, so the teacher can still adjust them in Word.

Deliberately left out: Word's "Tab at the start of a line indents the paragraph" (an AutoFormat option many users find confusing), and bar tabs.

## Open questions

- **Default tab width for Chinese papers:** Chinese Word shows "2 字元". The twip value in a zh-HK Normal template is unverified (probably 480). Check one real Word file before choosing.
- **What real Word does with a raw tab inside text**, from files already exported by 0.8.x. LibreOffice 7.4 treats it as a real tab. Word is still unchecked.
- **Risk: one stop jump.** The preview already measures text a little differently from Word (justified lines pack tighter in Word). Before a tab, a few points of difference can send the text to the next stop, a 0.5 in jump rather than a slightly different line break. Prove it on bilingual and 標楷體 text, not only English.
- **Old builds:** a document with tabs opened in 0.8.x still opens, shows a space on screen and exports a raw tab. No migration is needed for Phase 1.
- Phase 2 is a schema bump, which is the user's call.
