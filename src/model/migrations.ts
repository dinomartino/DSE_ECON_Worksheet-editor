import type { Worksheet } from './types';

/**
 * Schema versioning (§6). Rules:
 *  - Never change the meaning of an existing field; add new fields as optional.
 *  - Every **released** version gets a pure migration function to the next version.
 *  - Documents from NEWER versions still load: their unrecognised top-level fields
 *    are stashed in `__unknown` and written back out on save, so a round-trip
 *    through an older build never destroys data.
 *
 * ## The app has shipped: documents exist in the wild
 *
 * **Schema v1 is published.** Real teachers have real worksheets saved by it, so from
 * here on every change to the stored shape has to carry those documents forward. This
 * is the constraint that outranks tidiness in this file: a document that will not open
 * is a teacher's work destroyed, and there is no undo for it.
 *
 * Concretely, a change to `Worksheet` and its nested types must do one of:
 *
 *  - **Add an optional field.** Free — an older document simply lacks it, `normalize`
 *    defaults it, and no version bump is needed. Add the key to `KNOWN_KEYS` (see
 *    below) or it will save and then vanish on reload.
 *  - **Change the meaning or shape of an existing field.** Append a step to
 *    `MIGRATIONS`, bump `CURRENT_SCHEMA_VERSION`, and prove it against the frozen
 *    corpus (`src/model/backwardCompat.test.ts`). The loop below needs no edit.
 *  - **Remove a field.** Only ever by migrating its data somewhere else first. Deleting
 *    it outright silently discards whatever teachers had stored in it.
 *
 * ## Why the chain is still empty
 *
 * Because v1 *is* the current version — not because migrations are optional here. The
 * model did change seven times (a font pair, page setup, banded headers, flattened
 * sections, authored field wording, dropped table header rows, per-block captions), but
 * every one of those predates the release, so their migration steps upgraded documents
 * that never existed and were deleted rather than carried forever. That reasoning
 * expired the day the app shipped: the *next* shape change is the first one with real
 * data on the other side of it, and it needs a real step here.
 *
 * The machinery is fully built and exercised on every load: `migrate` validates,
 * normalizes, runs the chain, and stashes unknown fields so a document from a newer
 * build survives a round-trip through an older one.
 */

export const CURRENT_SCHEMA_VERSION = 1;

type RawDoc = Record<string, unknown>;

/**
 * Ordered chain. Index i migrates a document at version (i + 1) to version (i + 2).
 *
 * Empty only because v1 is current. A step added here must be **pure and total**: it
 * receives whatever a real saved document contained, including fields this build has
 * never seen, and must not assume any optional structure is present. Prove each new
 * step against the frozen corpus in `src/model/backwardCompat.test.ts` — that fixture
 * is the only input written by an older build, and so the only one that can catch a
 * step which drops data.
 */
const MIGRATIONS: Array<(doc: RawDoc) => RawDoc> = [];

/**
 * Top-level keys this build understands; anything else is preserved as unknown.
 *
 * **Every optional field added to `Worksheet` must be listed here.** A key missing from
 * this set is not merely unrecognised — `migrate` deletes it from the worksheet and
 * stashes it in `__unknown`, so the value survives in the saved JSON but never reaches
 * the model. The symptom is formatting that saves correctly and then vanishes on
 * reload, which is exactly what `titleFormat`, `instructionsFormat` and `bands` did
 * before they were added here. `model.test.ts` asserts the set covers the type.
 */
export const KNOWN_KEYS = new Set([
  'schemaVersion',
  'id',
  'title',
  'titleFormat',
  'instructions',
  'instructionsFormat',
  'questions',
  'layout',
  'flow',
  'fonts',
  'baseFontSize',
  'bands',
  'cover',
  'pageFurniture',
  'pageSetup',
  'header',
  'footer',
  'createdAt',
  'updatedAt',
  '__unknown',
]);

export class SchemaError extends Error {}

/**
 * Bring any saved document up to the current schema version.
 * Pure: never mutates its input.
 */
export function migrate(input: unknown): Worksheet {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new SchemaError('Not a worksheet document.');
  }

  let doc = { ...(input as RawDoc) };
  const version = typeof doc.schemaVersion === 'number' ? doc.schemaVersion : 1;

  if (version < 1) throw new SchemaError(`Unsupported schema version ${version}.`);

  // Apply the chain step by step; a document newer than this build is left alone
  // (its extra fields survive via __unknown) rather than being rejected.
  for (let v = version; v < CURRENT_SCHEMA_VERSION; v += 1) {
    const step = MIGRATIONS[v - 1];
    if (!step) throw new SchemaError(`Missing migration from schema version ${v}.`);
    doc = step(doc);
  }

  // Re-collect unknown fields (a newer doc may carry keys this build never sees).
  const unknown: Record<string, unknown> = { ...((doc.__unknown as Record<string, unknown>) ?? {}) };
  for (const [key, value] of Object.entries(doc)) {
    if (!KNOWN_KEYS.has(key)) unknown[key] = value;
  }

  const worksheet = {
    ...doc,
    schemaVersion: Math.max(CURRENT_SCHEMA_VERSION, version),
  } as unknown as Worksheet;

  for (const key of Object.keys(unknown)) {
    delete (worksheet as unknown as RawDoc)[key];
  }
  worksheet.__unknown = Object.keys(unknown).length > 0 ? unknown : undefined;

  return normalize(worksheet);
}

/** Fill in defaults for optional structures so downstream code can assume shape. */
function normalize(worksheet: Worksheet): Worksheet {
  return {
    ...worksheet,
    fonts: worksheet.fonts ?? { latin: 'Times New Roman', eastAsia: 'PMingLiU' },
    pageSetup: worksheet.pageSetup ?? {
      paper: 'A4',
      orientation: 'portrait',
      margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
    },
    questions: worksheet.questions ?? [],
    layout: worksheet.layout ?? [],
    flow: worksheet.flow ?? [],
  };
}

/** Inverse of `migrate`'s unknown-field stashing: splice them back for saving. */
export function serializeWorksheet(worksheet: Worksheet): Record<string, unknown> {
  const { __unknown, ...rest } = worksheet;
  return { ...(__unknown ?? {}), ...rest };
}
