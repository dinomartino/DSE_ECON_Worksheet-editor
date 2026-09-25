# Working in this repository

## Fresh session? Start here

1. [`docs/STATUS.md`](./docs/STATUS.md) — what we are doing now, and what is broken.
2. [`docs/CODEMAP.md`](./docs/CODEMAP.md) — the map: areas, key files, invariants.
3. [`docs/RECIPES.md`](./docs/RECIPES.md) — how to do the recurring tasks.
4. [`docs/GLOSSARY.md`](./docs/GLOSSARY.md) — words this repo uses in its own way.
5. [`docs/IDEAS.md`](./docs/IDEAS.md) — the ranked feature backlog, from competitor research.

Open `SYSTEM_ARCHITECTURE.md` only for the section you are about to touch. **Update
`docs/STATUS.md` before ending the session.**

Read [`SYSTEM_ARCHITECTURE.md`](./SYSTEM_ARCHITECTURE.md) before structural changes. It
records the rules a change must keep, and why. Where it and the code disagree, the code
is right — fix the document in the same change.

## Backward compatibility is not optional

**This app is published and schema v1 has shipped.** Real teachers have real worksheets
saved on their machines. A document saved by any released build must keep opening, keep
its content, and keep rendering. A file that will not open is someone's work destroyed,
and there is no undo for it.

Before changing anything in `src/model/types.ts` or the shape of stored data, decide
which of these you are doing:

- **Adding an optional field** — free, but it *must* go in `KNOWN_KEYS`
  (`src/model/migrations.ts`) or it will save correctly and vanish on reload.
- **Changing a field's meaning or shape** — append a step to `MIGRATIONS`, bump
  `CURRENT_SCHEMA_VERSION`, and prove it against the frozen corpus.
- **Removing a field** — only after migrating its data somewhere else.

`src/test/corpus/v1-published.json` is a frozen document written by the v1 build. **Never
regenerate it to make a test pass** — that rewrites the evidence instead of migrating the
data. It is the only fixture in this repo not constructed by the current build, and so
the only one that can catch a migration which silently drops data. A new schema version
gets a *new* corpus file beside it; the old one never changes.

**The promise covers saved documents, not exported bytes.** A teacher's file must always
reopen. An untouched document exporting byte-identically stays a strong convention (and
many tests pin it), but is not a binding guarantee — changing how an old document *prints*
is allowed, breaking its ability to *open* is not.

**Storage has two halves that fail independently**: the document under
`econ-worksheet:<id>`, and its summary in the `econ-worksheet-index` array. The start
screen is the only route in, so a document with a broken index entry is intact but
unreachable. Index entries are validated per row — one malformed summary must never empty
the list.

Two guards: `src/model/backwardCompat.test.ts` (documents) and
`src/storage/legacyIndex.test.ts` (the index). If either fails, a published document just
broke.

The full policy — collapsing migrations, their size budget, files from a newer build
(opened read-only, never overwritten) — is `SYSTEM_ARCHITECTURE.md` § Schema evolution.

## Verifying work

- `npm test` — ~1500 tests, ~3s. `npm run typecheck`, `npm run lint` (44 pre-existing
  problems: 3 errors, 41 warnings — in `Preview.tsx` and `InlineEditable.tsx`).
- `src/test/codemap.test.ts` guards the docs: every path and `path:symbol` cited in
  `docs/` must still exist. If it fails, the map rotted — fix the map.
- **UI work is verified in a browser**, not by reading source: screenshot with
  `scripts/shot.mjs`. Density and layout problems are invisible in the code.
- **After UI work, prove the `.docx` still exports** and is leak-free — it is the
  load-bearing output. `npm run samples` emits real files.
- `scripts/cover-verify.mjs` and `scripts/lq-verify.mjs` check that the three backends
  (preview, `.docx`, print PDF) still agree.
- **Desktop work is verified in the shell**: `npm run desktop:dev` runs it, `npm run
  desktop:build` produces installers. To hand the user an unreleased `.dmg`, follow
  `DESKTOP-PREVIEW.md` (copy-paste steps, no tag, no `main`). The web build must stay green
  too. A static `@tauri-apps/*` import fails `npm test` (`src/test/tauriImports.test.ts`),
  `npm run lint`, and `npm run build` (`postbuild`: `scripts/check-web-bundle.mjs`).
- **Every feature or fix adds a line under Unreleased in `CHANGELOG.md`**, in the same
  commit, written for teachers. It is the release body and the in-app "What's new".
- Releases are tags, not pushes: `npm version <patch|minor|major>` then `git push
  --follow-tags`, then publish the draft once its assets are complete
  (`gh release edit vX.Y.Z --draft=false --latest`). See `RELEASING.md`.

## Branches: work on `develop`, `main` ships

**Every push to `main` deploys the web app to teachers** (Vercel production). So:

- **All work — yours and any sub-agent's — happens on `develop`**, or on a short
  feature branch cut from it and merged back. Start a session with
  `git switch develop && git pull`. Never commit or push to `main` directly.
- Pushing `develop` is safe: Vercel builds a preview, CI runs, nothing reaches teachers.
- **Releasing is the user's call, and their word is the sign-off.** Only when they say
  so, but then do the whole sequence without further confirmation: merge `develop` into
  `main`, tag on `main` (`npm version …`, `git push --follow-tags`), wait for the Release
  workflow, check the draft's assets, and publish it. See `RELEASING.md`.
- An urgent fix for teachers: branch from `main`, merge to `main`, then merge `main`
  back into `develop` so the two do not drift.

## The constraints that shape everything

- **One IR, three backends.** `registry.render()` emits `RenderNode[]` once; preview,
  `.docx` and clipboard all read it. They must never disagree.
- **Browser-only.** Static export, no server runtime, nothing reads `process.env` at
  runtime. `.docx` is built client-side.
- **Never import `@tauri-apps/*` at the top level.** The same `out/` serves the web and
  the desktop shell; a static import puts Tauri in the web bundle (it still compiles — the
  guards above catch it). Load them with a dynamic `import()` inside a function, behind
  an `isDesktop()` check, in `src/platform/`, `src/desktop/` or `src/storage/fileStore.ts`.
- **Numbering and marks are derived, never stored.**
- **New on-page chrome needs `data-print-hide`**, or it appears in the PDF.
