# Working in this repository

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

## Verifying work

- `npm test` — 829 tests, ~1.2s. `npm run typecheck`, `npm run lint` (44 pre-existing
  problems: 2 errors, 42 warnings — both errors are in `Preview.tsx`).
- **UI work is verified in a browser**, not by reading source: screenshot with
  `scripts/shot.mjs`. Density and layout problems are invisible in the code.
- **After UI work, prove the `.docx` still exports** and is leak-free — it is the
  load-bearing output. `npm run samples` emits real files.
- `scripts/cover-verify.mjs` and `scripts/lq-verify.mjs` check that the three backends
  (preview, `.docx`, print PDF) still agree.

## The constraints that shape everything

- **One IR, three backends.** `registry.render()` emits `RenderNode[]` once; preview,
  `.docx` and clipboard all read it. They must never disagree.
- **Browser-only.** Static export, no server runtime, nothing reads `process.env` at
  runtime. `.docx` is built client-side.
- **Numbering and marks are derived, never stored.**
- **New on-page chrome needs `data-print-hide`**, or it appears in the PDF.
