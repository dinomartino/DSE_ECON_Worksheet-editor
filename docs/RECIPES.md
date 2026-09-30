# Recipes

How to do the recurring tasks. Files in the order to touch them, and the test that
guards the result. The map is [`CODEMAP.md`](./CODEMAP.md); the *why* is in
[`SYSTEM_ARCHITECTURE.md`](../SYSTEM_ARCHITECTURE.md).

## Add a question type

1. `src/model/types.ts` — the interface, added to the `Question` union.
2. `src/model/factories.ts` — a `create…Question()` factory.
3. `src/registry/<type>.ts` — one `QuestionTypeDefinition`: `id` · `displayName` ·
   `create` · `render` · `EditorPanel` · `mapTexts` (see below), plus `examGapLines?` / `healthFacts?` /
   `answerKey?` (without it the type is left out of the answer key) / `variant?` (without
   it the type prints identically in every paper version).
4. `src/registry/index.ts` — add it to `DEFINITIONS`.
5. `src/model/migrations.ts` — nothing, unless the type adds a `Worksheet` field.

No other file may learn the id. `render()` must copy the block's `format` onto every
hand-built numbered paragraph.

Guard: `src/registry/registry.test.ts` (greps eighteen shared modules for type literals, and
asserts `format` reaches the IR for every registered type).

## Give a new question type `mapTexts`

Every BiText the type stores goes through the walker it is handed, or translation and the
untranslated count never see it.

1. `src/registry/<type>.ts` — `mapTexts(question, walk)`: `patch(question, { … })` with
   `walk.text` / `walk.optional` (never creates an absent field) / `walk.list`,
   `walk.blocks` for content blocks, `walk.scheme`, `walk.answerGraph`, `walk.diagramBlock`,
   and `walk.scope('part:<id>', '(a)')` per nested item (`mapSame` over lists). Give each
   slot a `kind`, a `role` (`teacher` for key-only text) and its page `target`.
2. Text that does not print as the question stands goes through `walk.unprinted()`.
3. `src/test/translateFixture.ts` — add a question of the type holding every field.
4. A new BiText field on a block, layout element, band or diagram belongs in
   `src/model/textWalk.ts` (diagrams: `src/model/diagramText.ts`), not in a type.

Return the question itself when nothing changed: `patch` and `mapSame` do that.

Guard: `src/model/textWalk.census.test.ts` (every stored `{en, zh}` is a slot),
`src/model/textWalk.test.ts` (an identity visit returns the same object).

## Add a ContentBlock kind

1. `src/model/types.ts` — the interface, added to the `ContentBlock` union.
2. `src/model/factories.ts` — a factory; `src/model/edits.ts:flattenBlocks` if it nests.
3. `src/render/ir.ts` — a node type in `RenderNode`, emitted by `renderContentBlocks`.
4. `src/export/docx/body.ts:renderNodeXml` — the OOXML arm.
5. `src/components/preview/Preview.tsx` — the DOM arm, with an `EditTarget` if it is authored.
6. `src/export/clipboard.ts` — the HTML/text arm.
7. `src/model/textWalk.ts` `Walk.block` — its BiTexts (the switch will not compile
   without the arm), and one in `src/test/translateFixture.ts`.

All three backends or none: a node the exporter cannot draw is a silent data loss.

Guard: `src/export/docx/docx.test.ts`, `src/render/gaps.test.ts`.

## Add a layout element

1. `src/model/types.ts` — a new arm of `LayoutElement`.
2. `src/model/flow.ts` — a `create…Element()` and an entry in `LAYOUT_NAME`.
3. `src/model/documentShape.ts:hiddenLayoutKinds` — which document shapes offer it.
4. `src/render/worksheet.ts:renderWorksheet` — the IR it emits.
5. `src/components/editor/AddRail.tsx` — the insert menu entry.
6. Backends, as for a block, if it needs a node kind of its own.
7. `src/model/textWalk.ts` `mapLayout` — its BiTexts, or a text-free case (the switch
   will not compile without one), and one in `src/test/translateFixture.ts`.

An insert writes both `layout` and `flow`, always through `applyOrder`.

Guard: `src/model/flow.test.ts`, `src/render/gaps.test.ts`.

## Add an optional Worksheet field

1. `src/model/types.ts` — the optional field on `Worksheet`.
2. `src/model/migrations.ts:KNOWN_KEYS` — **add it here or it saves and vanishes on reload.**
3. `src/model/migrations.ts` `normalize()` — a default, if downstream assumes shape.
4. Whoever reads it.

No migration and no version bump: an absent optional field is valid v1.

Guard: `src/model/backwardCompat.test.ts` (round-trips the frozen corpus).

## Changing the shape of stored data

First ask whether it needs one: a rendering change never does, and an optional field with
a default is "Add an optional Worksheet field" above. Only a changed meaning or shape does.

1. `src/model/migrations.ts` — append one pure, total step to `MIGRATIONS` (index = *from*
   version − 1).
2. Bump `CURRENT_SCHEMA_VERSION`; add any new top-level keys to `KNOWN_KEYS`.
3. Freeze a **new** `src/test/corpus/v<N>-published.json`, written by the last build of the
   old version. Never regenerate an existing corpus — it is the only fixture not built by
   the current build, and so the only one that can catch a step that drops data.
4. Extend `src/model/backwardCompat.test.ts` to open every corpus and assert content survives.
5. Older builds will now meet your files: they open them read-only and never write them
   (`src/model/migrations.ts:isNewerThanBuild`) — nothing to do, but do not weaken it.

Removing a field is only allowed after its data has moved somewhere else. Collapsing steps
and the size budget: `SYSTEM_ARCHITECTURE.md` § Schema evolution.

Guard: `src/model/backwardCompat.test.ts`, `src/storage/legacyIndex.test.ts`,
`src/storage/newerDocument.test.tsx`.

## Add an edit target

1. `src/render/ir.ts:EditTarget` — the new arm, keyed by id, never by index into a list
   that reorders.
2. `src/model/edits.ts` — `editTargetKey`, `applyEditTarget`, `textOfTarget`, and
   `formatOfTarget`/`applyFormatTarget` if it is formattable (`isFormattable`).
3. `src/render/worksheet.ts` or the type's `render()` — attach `edit` to the node.
4. `src/components/preview/Preview.tsx` — it becomes clickable for free once `edit` is set.

Derived text carries no target; the authored wording around a number does.
The exporter never reads `edit`.

Guard: `src/model/edits.test.ts` (every target reads back what it wrote).

## Add a band field

1. `src/model/types.ts` — the new `BandField` arm.
2. `src/model/bands.ts` — a `create…Field()`; `duplicateComputedFields` if it is computed.
3. `src/model/bandSegments.ts` — the `bandFieldSegments` arm and a `DEFAULT_FIELD_WORDING`
   entry: authored prefix · derived value · authored suffix.
4. `src/components/preview/BandEditor.tsx` — the on-page arm, plus `bandFieldStyle`.
5. `src/export/docx/body.ts` — the segments walk; only a genuine placeholder becomes a
   native `PAGE`/`NUMPAGES` field.
6. `src/model/textWalk.ts` reads `prefix`/`suffix` of any kind; other BiTexts need an arm
   there, and one of the field in `src/test/translateFixture.ts`.

A computed value is never stored. Both band paths must agree.

Guard: `src/export/docx/bandWording.test.ts`, `src/components/preview/bandFieldStyle.test.ts`.

## Add a diagram variant

1. `src/model/diagram.ts` — the geometry on `Diagram`, in unit space (0–1), clamped.
2. `src/render/diagram.ts` — a `…Layout()` measurer plus its arm of `diagramSvg`;
   all pixel↔unit maths comes from `diagramPlot`.
3. `src/model/diagramDraw.ts` — `hitTest`, `applyDrag`, `cursorFor`, `deleteHandle`
   arms so its parts can be dragged; labels store offsets, not positions.
4. `src/model/diagramTemplates.ts:DIAGRAM_TEMPLATES` — a starting shape.
5. `src/components/editor/DiagramEditor.tsx` (+ a canvas, as `FlowCanvas`/`ForumCanvas` do).
6. `src/model/diagramText.ts` — its text handles, kept in step with `handleText`, and one
   in `src/test/translateFixture.ts`.

Export needs nothing: `src/export/diagramImage.ts` rasterises the same SVG.

Guard: `src/render/diagram.test.ts`, `src/model/diagramDraw.test.ts`.

## Add a diagram template

1. Build it in the topic's file (`src/model/diagramTemplatesMarket.ts` · `…Macro.ts` ·
   `…Trade.ts`) in relations, never free coordinates, so a drag keeps the scheme's marks
   (kit: `src/model/diagramTemplateKit.ts`):
   - equilibria and readings as anchors — `eq(a, b)`, `reading(curve, line)`, `pin(ref)`;
   - shifted copies `shiftOf`, prices `priceLine` (level), verticals `upright`, MR /
     tangent / parallel via `derived`;
   - change arrows, gaps, brackets and wedges as spans — `axisArrows`, `span`;
   - welfare areas through the Shade presets — `shade(resolved, id, roles)` inside `finish`.
   Return `finish(…)`: it resolves every relation into `at`/`points` for older builds.
2. Give it a `group` and a bilingual name and hint; never reuse or remove a shipped id.
3. `node scripts/template-gallery.mjs --only=<id>` and read all three languages for
   collisions; update `docs/Diagram_Requirements/COVERAGE.md` for the items it meets.

Guard: `src/model/diagramTemplates.test.ts`, `src/model/diagramTemplateRelations.test.ts`,
`src/glossary/seededTerms.test.ts` (the Chinese must pass the EDB glossary check).

## Add a deny-list row

A wrong or non-HK rendering of a glossary term (市場失靈 for market failure) that the check
should flag and the auto-fix should replace.

1. `src/glossary/deny.ts:DENY` — `en` is the glossary key verbatim; `forms` the wrong
   renderings; `evidence` where it was seen. `kind: 'wrong'` is pre-ticked in Check terms;
   `'variant'` (an accepted variant) never is.
2. `fix` only when it is not the entry's preferred rendering (terms of trade → 貿易比率).
3. A form that means another term (缺乏彈性 for "elastic demand") is `reversal: true` with
   `means`: reported as a conflict, never fixed.
4. Another key with the same rendering (production-possibility curve / frontier) gets the
   same row, unless the slip is no slip for it — then exempt it in the test.
5. Never edit the JSON. A parsing or preference correction goes in
   `src/glossary/overrides.ts`, with a comment citing its source.

Guard: `src/glossary/deny.test.ts` — every fix is a variant of its entry, no form is one, a
form that renders another entry must be a reversal, keys sharing a rendering share the row,
and no form is rewritten inside a longer glossary term.

## Add on-page chrome

1. Put `data-print-hide` on the element, or it appears in the print PDF.
2. Keep it inside its group's hover box, or it hides itself as the pointer reaches it.
3. A control over a band row must occupy exactly the space the read-only row does.
4. An overlay that owns the keyboard calls `src/components/ui/modalLayer.ts:useModalLayer`
   — `stopPropagation` cannot separate window listeners.
5. Anything that paints on the paper takes literal hex, not a semantic token.

Guard: `src/components/preview/bandChrome.test.ts`; then screenshot (below).

## Add a desktop-only behaviour

1. `src/platform/index.ts` — a function that checks `isDesktop()` first and reaches Tauri
   through a dynamic `import('@tauri-apps/…')` **inside** the function.
2. The web fallback in the same function (browser download, `window.print()`, …).
3. `src-tauri/capabilities/` — the permission, if the plugin needs one.
4. Call it from the UI; the UI never imports `@tauri-apps/*` itself.

A static Tauri import still compiles, so it is caught three times: `src/test/tauriImports.test.ts`
(`npm test`), ESLint (`npm run lint`), and `scripts/check-web-bundle.mjs` (`postbuild`).

Guard: `src/platform/platform.test.ts`, `src/test/tauriImports.test.ts`; then `npm run build`
and `npm run desktop:dev`.

**A native command of our own** (as `print_to_pdf` in `src-tauri/src/pdf/mod.rs`): a
`#[tauri::command]`, registered in `generate_handler!` in `src-tauri/src/lib.rs`, named in
`src-tauri/build.rs` (`AppManifest::commands`, which generates `allow-<name>`), and that
permission added to `src-tauri/capabilities/default.json` — a command left out of either is
denied at runtime, not at build. JS calls it with `invoke` from `@tauri-apps/api/core`, in
`src/platform/`. Platform code sits behind `#[cfg(target_os = …)]`; check Windows with a
scratch crate that `#[path]`-includes the module (`cargo check --target
x86_64-pc-windows-msvc` on the whole app fails in `ring`'s C build on macOS).

## Add a Settings section

App Settings (this browser or computer) — never the document, which is **Setup**.

1. A schema of its own, `src/settings/<id>.ts` (the AI one: `src/settings/aiSettings.ts`): a `SettingsSchema` with
   `storageKey: 'econgen.settings.<id>'`, per-platform `defaults(env)` and one validator per
   field from `src/settings/validators.ts`. No field named like key material — secrets go
   through `src/platform/secrets.ts` only.
2. `src/components/settings/sections/<id>.ts` calls `registerSettingsSection` at module
   scope with metadata and `load: () => import('./<id>Section/…')` (the pane, a default
   export taking `SettingsSectionProps`). An app-wide effect (a theme) is its `Effect`.
3. One line in `src/components/settings/sections/index.ts`: `import './<id>';`.
4. The pane reads and writes with `useSettings(SCHEMA)`; changes apply live.

Changing a field's meaning: bump `version` and add `migrate`. A write keeps keys this build
does not know, so an older build never erases a newer one's settings.

Guard: `src/settings/store.test.ts`, `src/components/settings/AppSettingsDialog.test.tsx`;
then screenshot the dialog at an 800 px tall viewport (footer unclipped).

## Add a provider preset

1. `src/ai/types.ts:PROVIDER_IDS` — the new id (a contract change: every `Record<ProviderId, …>`
   must then name it).
2. `src/ai/providers.ts:PRESETS` — the preset as data: `family` picks the adapter
   (`gemini`, `openai` for anything OpenAI-compatible, `anthropic`); quirks go in
   `extraBody`, `extraHeaders`, `maxTokensParam` or a model's `extra`, never in an adapter
   branch. `hk.note` and `privacy` state verified facts only.
3. Check CORS from a browser origin before shipping: preflight **and** an error response
   with a dummy key must carry `Access-Control-Allow-Origin`, or a wrong key reads as a
   network failure (OpenAI's does not: hence `networkOrKey`).
4. Set the preset's `keyPrefix` (the shape check). If that prefix belongs to this provider
   alone, also add it to `OWNED_PREFIXES` in `src/ai/keyShape.ts` (specific before `sk-`),
   so a key pasted under another provider is caught.
5. Record its 401 body with a dummy key into `src/ai/fixtures/` and add the row to
   `src/ai/errors.test.ts`; a new error wording is one `RULES` row in `src/ai/errors.ts`.

Guard: `src/ai/providers.test.ts` (https, Hong Kong status), `src/ai/adapters/adapters.test.ts`
(exact request body), `src/ai/errors.test.ts`. Model ids are hypotheses until a live check
with a real key.

## Check the desktop PDF

Export → PDF on desktop writes through the webview's own print (`src-tauri/src/pdf/`), so
only a desktop run proves it: `npm run desktop:dev`, export a multi-page bilingual paper with
a diagram and a cover, then `pdfinfo` the file — page count equals the sheets on screen,
page size is the paper's — and open it. WebKit's print can differ from Chrome's
(a hard-stop CSS gradient printed as a solid box); draw rules on the paper as SVG.
Export with a wide window (1800 px or more): text must be at true size (a 20 mm margin
sits at 56.7 pt in `pdftotext -bbox`), and every footer must sit at its page's bottom.

## Verify UI

```bash
npm run dev &                                   # the harness drives the real app
node scripts/shot.mjs /tmp/shot.png --seed      # add --dark for the dark scheme
npm run samples                                 # real .docx into /tmp/econ-samples
node scripts/cover-verify.mjs                   # cover: preview vs .docx vs print PDF
node scripts/lq-verify.mjs                      # the QAB booklet, same three ways
```

Seed the shot — an empty document hides exactly the crowding this is meant to catch.
After any UI work, open an exported `.docx` in Word: it is the load-bearing output.

Guard: `npm test`, `npm run typecheck`, `npm run lint` (41 pre-existing problems).

## Record the demo video and screenshots

```bash
npm run build && python3 -m http.server 3931 -d out &   # the built app: no dev badge
npm run demo                                            # or: node scripts/demo.mjs --video | --shots
```

Output lands in `demo-media/` (gitignored): `demo.mp4`, `demo-poster.jpg`, `demo.gif`,
`screenshots/*.webp` and a generated `README.md` with sizes and the timed storyboard.
Needs system Chrome and `ffmpeg`; `cwebp` if present, else screenshots are JPEG.

To show a new feature, add one step to `scripts/demo/record.mjs:STORYBOARD` (`name`,
`caption`, `run(d)`, optional `speed` to fast-forward it) or one entry to
`scripts/demo/screenshots.mjs:SHOTS`. What gets typed lives in `scripts/demo/content.mjs`,
and must stay original text, never past-paper questions. Keep the video under 60 s.

### The diagram film

```bash
npm run demo:diagrams          # or: node scripts/demo.mjs --story=diagrams [--url=…]
```

One continuous recording of the diagram workflow (picker, canvas, Shade ▾, span, other
templates, model answer, export) into `demo-media/diagrams/`: `diagrams.mp4`, numbered
`stills/*.webp` (2× screenshots, cut out of the video), `export/*.docx` with page 1 of
each rendered by LibreOffice (skipped without `soffice` + `pdftoppm`), and a `README.md`.
The worksheet is seeded from `scripts/demo/diagrams-seed.test.ts`, which also reports what
each template anchors, so a "drag it and watch it follow" beat is filmed only when
something follows; the README lists any beat left out. Steps:
`scripts/demo/diagrams.mjs:diagramStoryboard`. Keep it under 2.5 minutes.

## Change the product film

Load the `econ-film` skill (`.claude/skills/econ-film/SKILL.md`) first; its recipes cover
text, re-capture, scenes, timing, the score, a new cut, and multi-agent work. In short:

- On-screen words live only in `scripts/film/timeline.mjs:COPY`; cue times in
  `scripts/film/timeline.mjs:CUES` (by id); assets in `scripts/film/assets.mjs:ASSETS`.
- After a UI change, re-capture the assets that show it: `npm run film:capture -- --only=<job>`.
- `npm run film:doctor` after every change; `npm run film:score` after cue or clip changes;
  look at `--final --at=<s>` stills; render with `FILM_OUT=<scratch>` while exploring.

## Change the translation prompt or checks

1. Words live in `src/translate/promptText.ts`; HKEAA letter and currency forms in
   `src/translate/conventions.ts` (one row feeds both prompt rule 12 and the `symbols`
   check). Never add a prompt rule a deterministic check contradicts.
2. `npm test` fails the sha pin in `src/translate/prompt.test.ts`: bump `PROMPT_VERSION`
   (`src/translate/prompt.ts`) and paste the new sha. The few-shot answers must still pass
   the pipeline with no issue — fix the answer, not the check.
3. `EVAL_GEMINI_KEY=… EVAL_DEEPSEEK_KEY=… npm run eval:translate` (`EVAL_AB=1` adds the
   A/B toggles, `EVAL_GATE=1` enforces the ship gate). The report path is printed; it is
   never committed.

## Try an unreleased desktop build

Follow `DESKTOP-PREVIEW.md`: dev window, a local `.dmg`, or the CI preview workflow.
None of them needs a tag or touches `main`.

## Adding a changelog line

1. `CHANGELOG.md` — one bullet under `## Unreleased` → `### Added`, `### Changed` or
   `### Fixed` (only those three), in the same commit as the change. Written for teachers:
   a **bold lead phrase** naming what they can now do, then a sentence. Inline `**`,
   backticks and `[text](https://…)` render in the app; nothing else does.
2. `npm run changelog` — refreshes `src/whatsNew/changelog.generated.ts` (also run by
   `npm run dev` and `npm run build`). Commit both.

Guard: `src/whatsNew/changelog.generated.test.ts` (the copy is current),
`src/whatsNew/changelog.test.ts` (the real file parses with no problems).

## Closing the changelog at release

1. In `CHANGELOG.md`, rename `## Unreleased` to `## X.Y.Z — YYYY-MM-DD` and put a fresh,
   empty `## Unreleased` above it. `npm run changelog`, commit — before `npm version`, so
   the tag carries it: the app shows this section as "What's new" after the update.
2. After the draft is built: `node scripts/release-notes.mjs vX.Y.Z > /tmp/notes.md`. It
   exits 1 if the section is missing or `## Unreleased` still has entries
   (`--allow-unreleased` reprints an older release's notes).

Guard: `scripts/release-notes.test.ts` (run by hand).

## Cut a release

Only when the user asks. Work lives on `develop`; `main` is what teachers get.

0. On `develop`, all green → `git switch main && git pull && git merge --ff-only develop`
   (or merge a `develop` → `main` pull request). `git push` deploys the web app.
1. Close the changelog (above). `npm run typecheck && npm test` — green before tagging.
2. `npm version patch|minor|major` — runs `scripts/sync-version.mjs`, which writes the
   version into `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml` and stages them.
3. `git push --follow-tags` — the `v*` tag runs `.github/workflows/release.yml`, three
   builds into one **draft** release.
4. Check the draft has both `.dmg`s, the `.app.tar.gz` + `.sig` pair per arch, the
   `-setup.exe` + `.sig`, and `latest.json`. A missing `.sig` means the signing secrets
   were absent and installed apps will not update — fix and re-run, do not publish.
5. Publish with the changelog section as the body: `node scripts/release-notes.mjs vX.Y.Z >
   /tmp/notes.md && gh release edit vX.Y.Z --draft=false --latest --notes-file /tmp/notes.md`.
   A `-beta.N` tag publishes as a prerelease and never reaches a stable install.

Rollback is a new, higher version containing the revert. Afterwards `git switch develop &&
git merge main` so the version bump reaches `develop`. Full detail: `RELEASING.md`.
