Econ Studio · table editor review · 15 Oct 2026

# Tables vs Word

The table itself is close to Word: real Word tables in the export, merges, column and row drags, cell padding, and table alignment. What makes it feel hard is the basic editing. Six everyday gestures work differently from Word, and three of them lose the teacher's work without warning. Fix those first, then add features.

Tested by hand in the app (develop, Chrome) as a Word user would, and checked against Microsoft Word on this Mac (Microsoft 365, 中文 UI). Not yet tried in the desktop window or with real teachers.

## What a Word user hits in the first hour

1

### Typing after one click is thrown away

Loses work

One click on a cell only selects it. The teacher starts typing and nothing appears. A second click opens the cell. The sidebar hint even says "Click a cell to type in it". Every teacher hits this on the first cell of the first table.

**Word:** one click puts the caret in the cell.

A cell selected after one click, with the typed text missing

After one click and typing: the cell is selected, the text went nowhere.

2

### Enter closes the cell

Loses work

Enter ends editing, and the next keystrokes land nowhere. Shift+Enter makes a new line, but nobody coming from Word knows that. Enter is the most-used key in a Word cell, for two-line labels like "Quantity / (units)".

**Word:** Enter starts a new line inside the cell.

3

### Clicking the question text can delete a column

Deletes data

The red ✕ that deletes a column floats 25px above the table, on top of the last line of the question text. Double-clicking the word "Country" deleted column 2. Undo did nothing until Escape was pressed.

A red delete-column button sitting on the word Country in the question text

The column ✕ sits on "Country" in the stem.

4

### Merge doesn't work on a selection, and hides text

Hides data

Select two or more cells and the Merge buttons disappear. Merging only works one neighbour at a time ("Merge →", "Merge ↓"), so three across only works if done right to left, and a 2×2 merge is impossible. When cells merge, the absorbed cell's text is hidden, not combined: "2025" vanished below.

**Word:** select the cells, Merge Cells; the texts are kept, one under the other.

Two rows of cells selected, toolbar without Merge

A range selected: no Merge.

Merged header cell showing 2024 only

"2024" and "2025" merged: "2025" is gone.

5

### Bolding a header row is one cell at a time

Friction

The format bar only appears if you click on a cell's words. Clicking the blank part of the same cell shows a different toolbar. ⌘B on a selected cell or row does nothing. So a header row is bolded by clicking each cell's text and pressing B.

**Word:** select the row, ⌘B.

Clicking blank space in a cell shows only the table bar

Click the blank part: table bar only.

Clicking a word in the cell shows format bar plus table bar

Click the word: format bar and table bar.

6

### The table bar speaks in symbols

Friction

The bar reads `T⇤ T↔ T⇥ · Merge → Merge ↓ · ⊞⇤ ⊞↔ ⊞⇥ · Grid Box T-account`, with no group names. The tooltips are good, but at a glance nobody can tell that the first three move text inside the cell and the next three move the whole table.

**Word:** two named tabs, 表格設計 and 表格版面配置, with words under every button.

7

### Smaller things fast typists notice

Friction

**Tab in the last cell does nothing.** In Word it adds a row (checked in Word on this Mac). Arrow keys also stop at the cell edge instead of moving to the next cell.

**Pasting a table from Word or Excel puts everything into one cell** as text. Teachers often build data in Excel.

**The insert-table menu opens cut off** at the edge of the sidebar, and inserting a table isn't offered from the top bar or the Element menu, where a Word user looks first.

**A merged cell has a resize grip through its middle**, so clicking the centre of a merged header grabs the column border instead of the cell.

**No "Delete table"** in the right-click menu; ⌘C on selected cells copies nothing.

Table insert menu clipped at the sidebar's left edge

The insert menu, cut off at the sidebar edge.

Pasted Word table text all inside one cell

A pasted 2×3 table lands in one cell.

## Already works like Word

- Tab and Shift+Tab move between cells
- Hover + buttons insert rows and columns above, below, left and right
- Right-click menu inserts and deletes rows and columns
- Drag a column border, a row border or the table edge, one undo each
- Drag across cells to select a range
- Text alignment inside cells works over a range
- Table left / centre / right and indent, kept apart as in Word
- Cell padding, with more control than Word
- Each structural action is one undo
- The export is a real Word table that stays editable

Word's Table Layout ribbon tab

For reference, Word's 表格版面配置 tab: every button labelled, grouped by what it acts on.

Word's right-click menu in a table cell

Word's right-click menu in a cell.

## Task by task

| Task | Word | Econ Studio today | Gap |
| --- | --- | --- | --- |
| Click a cell and type | One click, caret | Two clicks; the first silently drops typing | Blocker |
| Enter in a cell | New line | Closes the cell | Blocker |
| Merge cells | Select, Merge | Neighbour by neighbour; no 2×2; text hidden | Blocker |
| Delete-column button | On the table only | Sits on the question text | Blocker |
| Insert a table | Insert ▸ Table grid | Sidebar only; menu cut off; right-click is a fixed 3×3 | Friction |
| Tab in the last cell | Adds a row | Nothing | Friction |
| Arrow keys at a cell edge | Next cell | Stay in the cell | Friction |
| Bold a header row | Select row, ⌘B | Click each cell's words, press B | Friction |
| Paste from Word / Excel | Fills the cells | All in one cell | Friction |
| Copy cells | ⌘C | Copies nothing | Friction |
| Delete the table | Right-click or Layout ▸ Delete | Sidebar ✕ only | Friction |
| Exact width / height | Number boxes | Drag only | Friction |
| Vertical alignment | Top / centre / bottom | Always centred | Low |
| Repeat header row on each page | Yes | Not possible | Long tables |
| Long table across pages | Rows break across pages | Whole table jumps to the next page | Friction |
| Cell shading | Yes | No | Low value |
| Borders | Any edge, any style | Grid / Box / T-account | Fine by design |
| Add / delete rows and columns | Ribbon, menu, hover + | Hover chips and menu | Fine |
| Resize by dragging | Yes | Yes | Fine |

## Plan

Three phases. Phase 1 removes almost all of the first-hour confusion and doesn't change how documents are saved. Phases 2 and 3 add what Word users expect next. Every step keeps old worksheets opening and exporting as before.

### Phase 1 · Make the basics behave like Word

Small changes · no change to saved files

1. Move the row and column ✕ buttons off the question text, so they only show over the table itself.S
2. One click in a cell puts the caret there.S–M

   Changes a written design rule: "first click selects, second begins editing". Only for table cells.
3. Enter in a cell makes a new line; Escape or clicking away finishes.S

   Changes the rule "Enter commits, a field is a line", for cells only. The cell stays one Word paragraph.
4. Tab in the last cell adds a row; arrow keys move to the next cell at the edge.S
5. Fix the cut-off insert menu, and offer "Table…" with the size grid in the right-click menu, inserted where you clicked.S
6. Name the table bar's groups (Cell text · Table position · Lines), add Delete table and Select table to the right-click menu.S
7. Remove the resize grip from inside merged cells, and correct the misleading sidebar hint.S

### Phase 2 · Selections work like Word

Medium changes · no change to saved files

1. Merge cells over any selected rectangle, 2×2 included, keeping every cell's text one under the other. Word export and copy-paste checked in Word.M
2. Format a selection: B / I / U, size and colour apply to every selected cell, and ⌘B ⌘I ⌘U work.M
3. Paste a table from Word or Excel into the cells, adding rows if needed.M
4. ⌘C on selected cells copies them as a table.S–M
5. Exact column width and row height boxes in the sidebar.S–M

### Phase 3 · New table settings

Adds optional fields to saved files · your call each

1. Vertical alignment in a cell: top, centre, bottom.S–M
2. Repeat the heading row on each page, with long tables splitting across pages in the app as Word already does.M–L

   The design notes say "Tables have no header row: no HKDSE table has grey or bold header treatment". Repeating the row without styling it would be a different feature.
3. Cell shading.S–M

   The export code says "no shading: an HKDSE table is uniform". Only if teachers ask.

## Not worth copying from Word

- Table styles gallery and banded rows
- Draw Table and Eraser
- Border painter, line styles and weights
- Per-edge borders (removed once already for not matching real papers)
- AutoFit to contents (the page layout depends on fixed column widths)
- Text wrapping around a table
- Text direction, sort, formulas, nested tables, split table

## Decisions for you

1. **Start Phase 1?** It's the biggest improvement for the least risk.
2. **One click to type in a cell, and Enter for a new line.** Both change written design rules, only inside table cells. I recommend yes; it's what every Word user expects.
3. **Phase 3 items.** Vertical alignment is cheap and harmless. Heading-row repeat and shading go against "an HKDSE table is uniform"; keep them out unless teachers ask.