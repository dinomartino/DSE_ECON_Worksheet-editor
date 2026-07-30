import type { Worksheet } from './types';

/**
 * Schema versioning (§6). Rules:
 *  - Never change the meaning of an existing field; add new fields as optional.
 *  - Every released version gets a pure migration function to the next version.
 *  - Documents from NEWER versions still load: their unrecognised top-level fields
 *    are stashed in `__unknown` and written back out on save, so a round-trip
 *    through an older build never destroys data.
 */

export const CURRENT_SCHEMA_VERSION = 7;

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
  // v4 -> v5: a section stopped being a container. It owned `questions`/`layout`/`flow`,
  // which fought pagination — a page is measured, not modelled, so a sheet shared by two
  // sections had to be shown as two groups, and every page move had to carry ids between
  // containers first. A section is now a `section` **layout element** in one
  // document-wide flow, carrying the `restartNumbering` flag that was always its real
  // purpose. Each old section contributes its heading as one element followed by its own
  // items, in order, so the printed document is unchanged.
  (doc) => ({ ...flattenSections(doc), schemaVersion: 5 }),
  // v5 -> v6: the wording around a computed band field became authored text. A
  // `totalMarks` field used to store a bare `label` and the renderer supplied the rest
  // ("Full marks: " + the total + " marks"), so the phrasing on the one row a teacher
  // most wants to adjust lived in code and could not be typed, sized or coloured.
  // Each field now carries `prefix`/`suffix` as real rich text, and this writes the old
  // hardcoded spelling into them — so a migrated document prints exactly what it printed
  // before, and the teacher can now change it.
  (doc) => ({ ...migrateFieldWording(doc), schemaVersion: 6 }),
  // v6 -> v7: tables lost `headerRowCount`. It drove `w:tblHeader`, a grey EFEFEF fill and
  // bold runs, and defaulted to 1 — while no HKDSE table has any of them, so the default
  // produced a grey bold top row a teacher's first action was to undo. It also could not
  // describe a real paper: a distribution table's top-left cell is empty, with headings
  // running across the top *and* down the left, which is not a count of rows. Emphasis is
  // ordinary per-cell formatting now.
  //
  // This only drops the dead field. The rows are untouched, so a migrated table prints
  // exactly what the new build prints for it — plain uniform cells, which is the point.
  (doc) => ({ ...stripTableHeaderRows(doc), schemaVersion: 7 }),
];

/**
 * Give every computed band field the wording the renderer used to supply.
 *
 * A stored `label` becomes the prefix, since that is where it printed. Fields that
 * already carry a `prefix` are left alone: a v6 document round-tripping through this
 * build must not have a teacher's own wording overwritten with the default.
 *
 * The strings are literals rather than an import of `DEFAULT_FIELD_WORDING`, for the
 * same reason v2 -> v3 inlines the page defaults: `bandSegments` reaches `factories`
 * through `page`, and `factories` imports this module, so importing them back would
 * close a cycle and make the chain load-order dependent. `migrations.test.ts` asserts
 * the two spellings agree, which is the guard that would otherwise be the import.
 */
/**
 * Drop `headerRowCount` from every table, wherever it sits.
 *
 * Walked generically rather than by following `questions → blocks`, `parts → blocks`,
 * `subParts → blocks`: a table is insertable at every level (§3.3), so an explicit walk
 * would need updating whenever a new nesting appears and the one that was forgotten would
 * keep the dead field forever. Recursing over plain objects and arrays cannot miss one.
 *
 * It rewrites only the objects it actually changes, so a document with no tables comes back
 * with its arrays untouched.
 */
function stripTableHeaderRows(doc: RawDoc): RawDoc {
  const strip = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(strip);
    if (!value || typeof value !== 'object') return value;

    const source = value as RawDoc;
    const next: RawDoc = {};
    for (const [key, child] of Object.entries(source)) {
      // Only on a table: `headerRowCount` is not a name anything else uses, but scoping it
      // to the block that had it keeps the migration honest about what it is for.
      if (key === 'headerRowCount' && source.kind === 'table') continue;
      next[key] = strip(child);
    }
    return next;
  };
  return strip(doc) as RawDoc;
}

function migrateFieldWording(doc: RawDoc): RawDoc {
  const DEFAULT_FIELD_WORDING = {
    totalMarks: {
      prefix: { en: [{ text: 'Full marks: ' }], zh: [{ text: '總分：' }] },
      suffix: { en: [{ text: ' marks' }], zh: [{ text: '分' }] },
    },
    fillIn: { prefix: { en: [{ text: 'Name:' }], zh: [{ text: '姓名：' }] }, suffix: { en: [], zh: [] } },
    pageNumber: { prefix: { en: [], zh: [] }, suffix: { en: [], zh: [] } },
  } as const;

  const field = (raw: unknown): unknown => {
    if (!raw || typeof raw !== 'object') return raw;
    const value = raw as RawDoc;
    const kind = value.kind;
    if (kind !== 'totalMarks' && kind !== 'fillIn' && kind !== 'pageNumber') return value;
    if (value.prefix !== undefined || value.suffix !== undefined) return value;

    const defaults = DEFAULT_FIELD_WORDING[kind];
    const { label, ...rest } = value;
    return {
      ...rest,
      // A `fillIn` with no label printed a bare rule, so an absent label migrates to an
      // empty prefix rather than to "Name:" — inventing a label would add text to a page
      // that never had it.
      prefix: label ?? (kind === 'fillIn' ? { en: [], zh: [] } : defaults.prefix),
      suffix: defaults.suffix,
    };
  };

  const band = (raw: unknown): unknown => {
    if (!raw || typeof raw !== 'object') return raw;
    const value = raw as RawDoc;
    const zones = (value.zones ?? {}) as RawDoc;
    const zone = (list: unknown) => (Array.isArray(list) ? list.map(field) : list);
    return {
      ...value,
      zones: {
        ...zones,
        left: zone(zones.left),
        center: zone(zones.center),
        right: zone(zones.right),
      },
    };
  };

  const bands = (raw: unknown): unknown => (Array.isArray(raw) ? raw.map(band) : raw);

  // All five band lists, the same set `applyEditTarget` walks: masthead, each edge's
  // running rows and each edge's page-1 rows. Missing one would leave a header printing
  // the old wording through a code path that no longer supplies it.
  const edge = (raw: unknown): unknown => {
    if (!raw || typeof raw !== 'object') return raw;
    const value = raw as RawDoc;
    return {
      ...value,
      bands: bands(value.bands),
      ...(value.firstPage && typeof value.firstPage === 'object'
        ? {
            firstPage: {
              ...(value.firstPage as RawDoc),
              bands: bands((value.firstPage as RawDoc).bands),
            },
          }
        : {}),
    };
  };

  return {
    ...doc,
    ...(doc.bands !== undefined ? { bands: bands(doc.bands) } : {}),
    ...(doc.header !== undefined ? { header: edge(doc.header) } : {}),
    ...(doc.footer !== undefined ? { footer: edge(doc.footer) } : {}),
  };
}

/**
 * Splice every section's contents into one document-wide flow.
 *
 * A heading becomes a `section` element *only when the section actually had one*: a
 * single untitled section is how a plain document was stored, and emitting an empty
 * heading for it would put a blank row on the page that was never there before.
 *
 * `restartNumbering` moves onto the element, so the restart travels with the heading a
 * teacher can see and drag rather than with an invisible container.
 */
function flattenSections(doc: RawDoc): RawDoc {
  // Already flat — a v5+ document round-tripping through this build. Matches the
  // `slotsToBands` guard: migrate what is old, never re-migrate what is current.
  if (!Array.isArray(doc.sections) || doc.flow) return doc;

  const { sections: _dropped, ...rest } = doc;
  const questions: unknown[] = [];
  const layout: unknown[] = [];
  const flow: Array<{ type: 'question' | 'layout'; id: string }> = [];

  for (const raw of doc.sections as RawDoc[]) {
    if (!raw || typeof raw !== 'object') continue;
    const sectionQuestions = Array.isArray(raw.questions) ? (raw.questions as RawDoc[]) : [];
    const sectionLayout = Array.isArray(raw.layout) ? (raw.layout as RawDoc[]) : [];

    if (!isEmptyHeading(raw.heading)) {
      const element = {
        kind: 'section',
        // Reusing the section's own id keeps any reference to it valid and makes the
        // migration idempotent in the ids it produces.
        id: raw.id,
        text: raw.heading,
        restartNumbering: raw.restartNumbering === true,
        ...(raw.headingFormat ? { format: raw.headingFormat } : {}),
      };
      layout.push(element);
      flow.push({ type: 'layout', id: raw.id as string });
    }

    // Resolve this section's order exactly as the old `resolveFlow` did, so a document
    // with layout elements keeps the order it was saved with. Inlined rather than
    // imported to keep migrations free of model imports that could re-enter this file.
    for (const entry of resolveLegacyOrder(sectionQuestions, sectionLayout, raw.flow)) {
      flow.push(entry);
    }
    questions.push(...sectionQuestions);
    layout.push(...sectionLayout);
  }

  return { ...rest, questions, layout, flow };
}

function isEmptyHeading(heading: unknown): boolean {
  if (!heading || typeof heading !== 'object') return true;
  const { en, zh } = heading as { en?: unknown; zh?: unknown };
  const empty = (runs: unknown) =>
    !Array.isArray(runs) ||
    runs.every((run) => !String((run as { text?: unknown })?.text ?? '').trim());
  return empty(en) && empty(zh);
}

/**
 * One section's display order, reproducing pre-v5 `resolveFlow`.
 *
 * Questions come out in array order; each layout element follows whichever question
 * preceded it in the stored flow, and anything the flow never mentioned is appended.
 */
function resolveLegacyOrder(
  questions: RawDoc[],
  layout: RawDoc[],
  storedFlow: unknown,
): Array<{ type: 'question' | 'layout'; id: string }> {
  const ids = (list: RawDoc[]) => list.map((entry) => String(entry.id));
  if (layout.length === 0) {
    return ids(questions).map((id) => ({ type: 'question' as const, id }));
  }

  const layoutIds = new Set(ids(layout));
  const questionIds = new Set(ids(questions));
  const after = new Map<string | null, string[]>();
  const placed = new Set<string>();
  let anchor: string | null = null;

  for (const raw of Array.isArray(storedFlow) ? (storedFlow as RawDoc[]) : []) {
    const id = String(raw?.id);
    if (raw?.type === 'question') {
      if (questionIds.has(id)) anchor = id;
      continue;
    }
    if (!layoutIds.has(id) || placed.has(id)) continue;
    const bucket = after.get(anchor);
    if (bucket) bucket.push(id);
    else after.set(anchor, [id]);
    placed.add(id);
  }

  const out: Array<{ type: 'question' | 'layout'; id: string }> = [];
  const emit = (list: string[] | undefined) => {
    for (const id of list ?? []) out.push({ type: 'layout', id });
  };

  emit(after.get(null));
  for (const id of ids(questions)) {
    out.push({ type: 'question', id });
    emit(after.get(id));
  }
  emit(ids(layout).filter((id) => !placed.has(id)));
  return out;
}

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
  'questions',
  'layout',
  'flow',
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
