# Recipes

How to do the recurring tasks. Files in the order to touch them, and the test that
guards the result. The map is [`CODEMAP.md`](./CODEMAP.md); the *why* is in
[`SYSTEM_ARCHITECTURE.md`](../SYSTEM_ARCHITECTURE.md).

## Add a question type

1. `src/model/types.ts` — the interface, added to the `Question` union.
2. `src/model/factories.ts` — a `create…Question()` factory.
3. `src/registry/<type>.ts` — one `QuestionTypeDefinition`: `id` · `displayName` ·
   `create` · `render` · `EditorPanel`, plus `examGapLines?` / `countMissingTranslations?` / `healthFacts?` /
   `answerKey?` (without it the type is left out of the answer key).
4. `src/registry/index.ts` — add it to `DEFINITIONS`.
5. `src/model/migrations.ts` — nothing, unless the type adds a `Worksheet` field.

No other file may learn the id. `render()` must copy the block's `format` onto every
hand-built numbered paragraph.

Guard: `src/registry/registry.test.ts` (greps ten shared modules for type literals, and
asserts `format` reaches the IR for every registered type).

## Add a ContentBlock kind

1. `src/model/types.ts` — the interface, added to the `ContentBlock` union.
2. `src/model/factories.ts` — a factory; `src/model/edits.ts:flattenBlocks` if it nests.
3. `src/render/ir.ts` — a node type in `RenderNode`, emitted by `renderContentBlocks`.
4. `src/export/docx/body.ts:renderNodeXml` — the OOXML arm.
5. `src/components/preview/Preview.tsx` — the DOM arm, with an `EditTarget` if it is authored.
6. `src/export/clipboard.ts` — the HTML/text arm.

All three backends or none: a node the exporter cannot draw is a silent data loss.

Guard: `src/export/docx/docx.test.ts`, `src/render/gaps.test.ts`.

## Add a layout element

1. `src/model/types.ts` — a new arm of `LayoutElement`.
2. `src/model/flow.ts` — a `create…Element()` and an entry in `LAYOUT_NAME`.
3. `src/model/documentShape.ts:hiddenLayoutKinds` — which document shapes offer it.
4. `src/render/worksheet.ts:renderWorksheet` — the IR it emits.
5. `src/components/editor/AddRail.tsx` — the insert menu entry.
6. Backends, as for a block, if it needs a node kind of its own.

An insert writes both `layout` and `flow`, always through `applyOrder`.

Guard: `src/model/flow.test.ts`, `src/render/gaps.test.ts`.

## Add an optional Worksheet field

1. `src/model/types.ts` — the optional field on `Worksheet`.
2. `src/model/migrations.ts:KNOWN_KEYS` — **add it here or it saves and vanishes on reload.**
3. `src/model/migrations.ts` `normalize()` — a default, if downstream assumes shape.
4. Whoever reads it.

No migration and no version bump: an absent optional field is valid v1.

Guard: `src/model/backwardCompat.test.ts` (round-trips the frozen corpus).

## Add a migration

1. `src/model/migrations.ts` — append a step to `MIGRATIONS` (index = *from* version − 1).
2. Bump `CURRENT_SCHEMA_VERSION`; add any new keys to `KNOWN_KEYS`.
3. Add a **new** corpus file beside `src/test/corpus/v1-published.json`. Never regenerate
   the old one — it is the only fixture not built by the current build, and so the only
   one that can catch a migration that drops data.
4. Extend `src/model/backwardCompat.test.ts` to open both corpora and assert content survives.

Removing a field is only allowed after its data has moved somewhere else.

Guard: `src/model/backwardCompat.test.ts`, `src/storage/legacyIndex.test.ts`.

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

Export needs nothing: `src/export/diagramImage.ts` rasterises the same SVG.

Guard: `src/render/diagram.test.ts`, `src/model/diagramDraw.test.ts`.

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

A top-level Tauri import lands in the web bundle and throws on load — `npm run build` fails.

Guard: `src/platform/platform.test.ts`; then `npm run build` and `npm run desktop:dev`.

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

Guard: `npm test`, `npm run typecheck`, `npm run lint` (44 pre-existing problems).

## Try an unreleased desktop build

Follow `DESKTOP-PREVIEW.md`: dev window, a local `.dmg`, or the CI preview workflow.
None of them needs a tag or touches `main`.

## Cut a release

Only when the user asks. Work lives on `develop`; `main` is what teachers get.

0. On `develop`, all green → `git switch main && git pull && git merge --ff-only develop`
   (or merge a `develop` → `main` pull request). `git push` deploys the web app.
1. `npm run typecheck && npm test` — green before tagging.
2. `npm version patch|minor|major` — runs `scripts/sync-version.mjs`, which writes the
   version into `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml` and stages them.
3. `git push --follow-tags` — the `v*` tag runs `.github/workflows/release.yml`, three
   builds into one **draft** release.
4. Check the draft has both `.dmg`s, the `.app.tar.gz` + `.sig` pair per arch, the
   `-setup.exe` + `.sig`, and `latest.json`. A missing `.sig` means the signing secrets
   were absent and installed apps will not update — fix and re-run, do not publish.
5. Press **Publish release**. A `-beta.N` tag publishes as a prerelease and never
   reaches a stable install.

Rollback is a new, higher version containing the revert. Afterwards `git switch develop &&
git merge main` so the version bump reaches `develop`. Full detail: `RELEASING.md`.
