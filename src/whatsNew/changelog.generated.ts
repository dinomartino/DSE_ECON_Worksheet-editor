// Generated from CHANGELOG.md by scripts/sync-changelog.mjs — do not edit.
// Run `npm run changelog` after changing CHANGELOG.md.
export const CHANGELOG_MD = `# Changelog

What each release of Econ Worksheet contains, newest first. Written for teachers: name
the thing they can now do, not the file that changed.

Rules: every feature or fix that lands on \`develop\` adds a line under **Unreleased** in
the same commit. At release, that section is renamed to the version and date, and its
text becomes the GitHub release body (see \`RELEASING.md\`). Sections are grouped as
**Added**, **Changed**, **Fixed**. Nothing below a version heading is edited afterwards.

## Unreleased

### Added
- **Marking scheme in HKEAA notation** on structured question parts: marking points with
  marks, \`/\` alternatives, "any N @ 1", \`max: N\`, "mark the FIRST N only", OR routes,
  level descriptors and Effective Communication marks. Prints in the teacher version
  and the answer key; the student paper is unchanged.
- **MCQ rationale and source note**: per option, why it is right or wrong, and a
  "Source:" line such as "modelled on DSE 2023 Q1". Teacher version and answer key only;
  rationale follows its option when paper versions shuffle.
- **Shaded areas on diagrams**: consumer surplus, producer surplus, deadweight loss and
  tax revenue presets, plus a free shape; grey shade or hatch, draggable label. Areas
  follow the curves they are built on.
- **Shift a curve**: shift D or S left/right/up/down by a percentage to get D₁ (or S₁),
  the shift arrow and the new equilibrium E₁ with guide lines and P₁/Q₁ labels.
- **Graph answer space**: a blank-axes box (optional grid, axis labels, 12/16/20/24
  lines, half or full width) that students draw on, in any part or sub-part.
- **Folders on the start screen**: create, rename and delete folders; move documents in
  from the menu or by dragging; search and filter inside a folder. Folders are kept in
  backups.
- **One Export button** for \`.docx\`, PDF and \`.json\`, chosen inside the dialog; options
  that do not apply to a format are greyed with a reason.
- **What's new**: the first time a new version opens, a short note lists what it adds,
  once. "What's new" beside Send feedback on the start screen, and in the editor's ⋯
  menu, lists every release.

### Fixed
- **Desktop: Export → PDF opens the print sheet** instead of failing silently.
- **Print PDF lost every arrowhead and pie hatching** (axis arrows, shift arrows,
  flow-chart arrows, hatched and dotted pie slices). All now print.
- **Dragging a document onto a folder now works in the desktop app.**
- **Desktop: dropping a worksheet file onto the start screen imports it.** Drop several
  \`.json\` files at once to add them all to your list; nothing already there is replaced.

## 0.3.0 — 2026-09-24

### Added
- **Export dialog**: question paper, a separate **answer key** \`.docx\`, or both, in any
  language, with **include/omit the cover page and the answer space** toggles.
- **Paper versions A–D**: seeded MCQ option shuffles with a per-version key and a
  version map in the answer key.
- **Export for other apps**: ZipGrade key, plain key CSV, Kahoot \`.xlsx\`, Blooket CSV.
- **Pre-print paper check**: marks, timing, missing answers and translations, shown
  before export.
- **Backup all as one zip** and restore (never overwrites); **Trash** with 30-day restore.
- **File dashboard**: saved documents as first-page thumbnails or a list, with search,
  kind filter and ordering. Desktop dialogs start in \`~/Documents/Econ Worksheets\` and
  exported files can be revealed in Finder/Explorer.
- **In-app feedback**: a prefilled GitHub issue, an email, or copy to clipboard.
- **Paste-anywhere download widget** for other websites, always pointing at the latest
  release.

### Changed
- Start-screen sidebar decluttered; version shown with a manual "Check for updates".
- Updates download silently and show the banner only when ready; one check per launch.
  Pending edits are saved before the restart.

## 0.2.0 — 2026-09-23

### Added
- **Desktop app for macOS and Windows** (Tauri 2). Documents become files under the app
  data folder, saving uses the native dialog, and the app updates itself from GitHub
  Releases. The web app is unchanged and stays the primary target.

### Changed
- The sidebar is an inspector: excerpt rows and a mark-scheme grid, no dead ends.
- Contextual tools dock over the page: table and figure rows, right-click menus.
- MCQ options with figures lay out two per row.

## Earlier (web app, July–September 2026)

The web editor before it was versioned: bilingual on-page authoring of HKDSE-format
papers with click-to-edit on the paginated preview; MCQ and structured questions with
derived numbering and marks; sections, headings, stimuli, labelled sources and tables;
supply–demand, business-cycle, pie and flow-chart diagrams with a drawing canvas; cover
page and Paper 2 answer booklet (LQ mode) with dotted answer space; headers and
footers with a separate first page; faithful \`.docx\` export, print-to-PDF and
copy-for-Word, all built in the browser; autosave with undo/redo; the warm studio
theme.
`;
