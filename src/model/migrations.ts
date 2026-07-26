import type { Worksheet } from './types';

/**
 * Schema versioning (§6). Rules:
 *  - Never change the meaning of an existing field; add new fields as optional.
 *  - Every released version gets a pure migration function to the next version.
 *  - Documents from NEWER versions still load: their unrecognised top-level fields
 *    are stashed in `__unknown` and written back out on save, so a round-trip
 *    through an older build never destroys data.
 */

export const CURRENT_SCHEMA_VERSION = 4;

type RawDoc = Record<string, unknown>;

/** Ordered chain. Index i migrates a document at version (i + 1) to version (i + 2). */
const MIGRATIONS: Array<(doc: RawDoc) => RawDoc> = [
  // v1 -> v2: worksheets gained a configurable font pair (§7.4). Older documents
  // used the hardcoded Times New Roman / PMingLiU pairing, which becomes the default.
  (doc) => ({
    ...doc,
    schemaVersion: 2,
    fonts: doc.fonts ?? { latin: 'Times New Roman', eastAsia: 'PMingLiU' },
  }),
  // v2 -> v3: worksheets gained page setup and authored header/footer slots. Older
  // documents were fixed at A4 portrait with 2.54cm margins, a header showing the
  // title and a centred page-number footer; those become the explicit defaults so a
  // migrated document exports byte-identically until the teacher changes something.
  // Left as literals rather than importing `model/page`, which would make the
  // factories -> migrations import cycle load-order dependent.
  (doc) => ({
    ...doc,
    schemaVersion: 3,
    pageSetup:
      doc.pageSetup ?? {
        paper: 'A4',
        orientation: 'portrait',
        margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      },
  }),
  // v3 -> v4: a header/footer became a list of `Band` rows instead of one
  // left/centre/right triple, so it can express the stacked rows every real paper uses
  // (`real_life_reference/head2.png` has five). A v3 document's single triple becomes a
  // one-band list, which renders and exports identically — the migration changes the
  // shape, never the printed output.
  (doc) => ({
    ...doc,
    schemaVersion: 4,
    header: slotsToBands(doc.header),
    footer: slotsToBands(doc.footer),
  }),
];

/**
 * Rewrite a v3 header/footer (`slots`) as v4 bands.
 *
 * The old `pageNumber` and `pageCount` parts were separate tokens a teacher assembled
 * with literal text between them; the pair collapses into one `pageNumber` field with
 * the `longForm` pattern, which is what "Page 3 of 12" always meant. A lone page number
 * becomes the `plain` pattern.
 */
function slotsToBands(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const hf = value as RawDoc;
  // Already migrated, or authored by a newer build: leave it exactly as found.
  if (!hf.slots || hf.bands) return value;

  const slots = hf.slots as Record<string, Array<RawDoc> | undefined>;
  const zone = (parts: Array<RawDoc> | undefined): RawDoc[] => {
    const list = parts ?? [];
    const hasNumber = list.some((p) => p.kind === 'pageNumber');
    const hasCount = list.some((p) => p.kind === 'pageCount');
    // "Page " + # + " of " + N was one idiom spelled in four parts. Collapsing it means
    // dropping the connecting text too: the new field's pattern already prints "Page 3
    // of 12", so keeping the old literals beside it would read "Page Page 3 of 12 of".
    const collapsing = hasNumber && hasCount;

    const out: RawDoc[] = [];
    for (const part of list) {
      if (part.kind === 'text') {
        if (!collapsing) out.push({ kind: 'text', id: part.id, text: part.text });
      } else if (part.kind === 'pageNumber') {
        out.push({ kind: 'pageNumber', id: part.id, pattern: collapsing ? 'longForm' : 'plain' });
      }
      // `pageCount` alone carried no number a reader could act on; as the second half of
      // a pair it is folded into the field above.
    }
    return out;
  };

  const { slots: _dropped, ...rest } = hf;
  return {
    ...rest,
    bands: [
      {
        id: `${(hf.id as string) ?? 'hf'}-band`,
        zones: {
          left: zone(slots.left),
          center: zone(slots.center),
          right: zone(slots.right),
        },
      },
    ],
  };
}

/**
 * Top-level keys this build understands; anything else is preserved as unknown.
 *
 * **Every optional field added to `Worksheet` must be listed here.** A key missing from
 * this set is not merely unrecognised — `migrate` deletes it from the worksheet and
 * stashes it in `__unknown`, so the value survives in the saved JSON but never reaches
 * the model. The symptom is formatting that saves correctly and then vanishes on
 * reload, which is exactly what `titleFormat`, `instructionsFormat` and `bands` did
 * before they were added here. `migrations.test.ts` asserts the set covers the type.
 */
export const KNOWN_KEYS = new Set([
  'schemaVersion',
  'id',
  'title',
  'titleFormat',
  'instructions',
  'instructionsFormat',
  'sections',
  'fonts',
  'bands',
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
    sections: (worksheet.sections ?? []).map((section) => ({
      ...section,
      questions: section.questions ?? [],
    })),
  };
}

/** Inverse of `migrate`'s unknown-field stashing: splice them back for saving. */
export function serializeWorksheet(worksheet: Worksheet): Record<string, unknown> {
  const { __unknown, ...rest } = worksheet;
  return { ...(__unknown ?? {}), ...rest };
}
