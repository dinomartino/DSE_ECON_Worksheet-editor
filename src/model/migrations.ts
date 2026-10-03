import { foldLegacyClassTag } from './classes';
import { normalizeAnswerKeyLayout } from './answerKeyLayout';
import type { Worksheet } from './types';

/**
 * Schema versioning. **Schema v1 is published — real documents exist in the wild.**
 * A change to the stored shape must do one of:
 *  - **Add an optional field** — free, but add it to `KNOWN_KEYS` or it saves and
 *    vanishes on reload.
 *  - **Change a field's meaning/shape** — append to `MIGRATIONS`, bump
 *    `CURRENT_SCHEMA_VERSION`, prove against the frozen corpus.
 *  - **Remove a field** — only by migrating its data elsewhere first.
 * `migrate` runs on every load: validate, normalize, run the chain, stash unknown fields
 * in `__unknown` so a newer build's document survives a round-trip.
 *
 * **Written version ≠ build version** (`writtenSchemaVersion`): a document is saved at the
 * oldest version that reads it correctly, so it is marked newer only when it uses
 * something an older build would mis-print.
 */

/** The newest schema this build reads and writes. */
export const CURRENT_SCHEMA_VERSION = 2;

/**
 * v2 = v1 plus what v0.5.0 reads as v1 but mis-prints: the diagram answer layer
 * (`answer: true`; teacher answers on the student copy), `answerKeyLayout` (every key as
 * Classic), a section's `answerCount` (it totals every question), and an essay's own
 * `answer` or `scheme` (a question with no parts; its teacher copy and key leave them
 * out). A document using any of them is written at 2 and opens read-only there. A
 * section's `targetMarks` alone stays at 1: v0.5.0 keeps it and prints the same.
 */
const ANSWER_LAYER_VERSION = 2;

type RawDoc = Record<string, unknown>;

/**
 * Ordered chain. Index i migrates a document at version (i + 1) to version (i + 2).
 *
 * A step added here must be **pure and total**: it
 * receives whatever a real saved document contained, including fields this build has
 * never seen, and must not assume any optional structure is present. Prove each new
 * step against the frozen corpus in `src/model/backwardCompat.test.ts` — that fixture
 * is the only input written by an older build, and so the only one that can catch a
 * step which drops data.
 */
const MIGRATIONS: Array<(doc: RawDoc) => RawDoc> = [
  // 1 → 2: additive (§ ANSWER_LAYER_VERSION). Nothing to change; a develop build's v1
  // document already carrying either field keeps it.
  (doc) => doc,
];

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
  'name',
  'title',
  'titleFormat',
  'instructions',
  'instructionsFormat',
  'questions',
  'layout',
  'flow',
  'fonts',
  'baseFontSize',
  'examGapLines',
  'bands',
  'cover',
  'pageFurniture',
  'pageSetup',
  'header',
  'footer',
  'versions',
  'target',
  'kind',
  'classes',
  'satOn',
  'bankHidden',
  'answerKeyLayout',
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

  // Apply the chain step by step. A document newer than this build is left alone, not
  // rejected: its extra fields survive via __unknown, it keeps its own schemaVersion,
  // and `isNewerThanBuild` makes the editor show it read-only rather than rewrite it.
  for (let v = version; v < CURRENT_SCHEMA_VERSION; v += 1) {
    const step = MIGRATIONS[v - 1];
    if (!step) throw new SchemaError(`Missing migration from schema version ${v}.`);
    doc = step(doc);
  }

  // Develop-only shapes that never reached a release are read tolerantly, not migrated:
  // no released document holds them, so no version bump (which would make every released
  // build open new documents read-only).
  doc = foldLegacyClassTag(doc);

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

/**
 * Saved by a build newer than this one (§ The published-document promise).
 *
 * Such a document opens — a teacher is never refused their work — but read-only: this
 * build renders it by rules older than the ones it was written for, and writing it back
 * would rewrite fields the newer build depends on. `migrate` keeps the higher version.
 */
export function isNewerThanBuild(worksheet: Pick<Worksheet, 'schemaVersion'>): boolean {
  return worksheet.schemaVersion > CURRENT_SCHEMA_VERSION;
}

/** Fill in defaults for optional structures so downstream code can assume shape. */
function normalize(worksheet: Worksheet): Worksheet {
  // A malformed answer-key layout loses only what is malformed, never the document.
  const answerKeyLayout = normalizeAnswerKeyLayout(worksheet.answerKeyLayout);
  const { answerKeyLayout: _stored, ...rest } = worksheet;
  void _stored;
  return {
    ...rest,
    ...(answerKeyLayout ? { answerKeyLayout } : {}),
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

/**
 * Inverse of `migrate`'s unknown-field stashing: splice them back for saving, at the
 * version the content needs (§ `writtenSchemaVersion`).
 */
export function serializeWorksheet(worksheet: Worksheet): Record<string, unknown> {
  const { __unknown, ...rest } = worksheet;
  const out: RawDoc = { ...(__unknown ?? {}), ...rest };
  out.schemaVersion = writtenSchemaVersion(worksheet.schemaVersion, out);
  return out;
}

/**
 * The `schemaVersion` to store: a newer build's own version is kept; otherwise the oldest
 * version whose builds print this content correctly. Re-derived on every save, so a
 * document that stops using a v2 feature opens editable in v0.5.0 again. `doc` is the
 * stored record (a worksheet, or a saved graph); unreadable parts never lower the mark.
 */
export function writtenSchemaVersion(version: number, doc: unknown): number {
  if (version > CURRENT_SCHEMA_VERSION) return version;
  if (isRecord(doc) && (doc.answerKeyLayout !== undefined || hasAnswerAnySection(doc.layout) || hasEssayAnswer(doc.questions))) {
    return ANSWER_LAYER_VERSION;
  }
  return hasAnswerElement(doc) ? ANSWER_LAYER_VERSION : 1;
}

function isRecord(value: unknown): value is RawDoc {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** A section with "answer any n" (`model/marks.ts:answerCountOf`). */
function hasAnswerAnySection(layout: unknown): boolean {
  return (
    Array.isArray(layout) &&
    layout.some(
      (element) =>
        isRecord(element) &&
        element.kind === 'section' &&
        element.answerCount !== undefined,
    )
  );
}

/** A question with no parts carrying its own answer or scheme (as the essay prints them). */
function hasEssayAnswer(questions: unknown): boolean {
  return (
    Array.isArray(questions) &&
    questions.some(
      (question) =>
        isRecord(question) &&
        Array.isArray(question.parts) &&
        question.parts.length === 0 &&
        (hasWords(question.answer) || schemeHasContent(question.scheme)),
    )
  );
}

/** As `isSchemeEmpty`, read structurally: any level, an EC block, or a worded point. */
function schemeHasContent(scheme: unknown): boolean {
  if (!isRecord(scheme)) return false;
  if ((Array.isArray(scheme.levels) && scheme.levels.length > 0) || scheme.ec) return true;
  return hasWords(scheme.routes);
}

/** Any run anywhere in `value` with non-blank `text` (as `isBiTextEmpty`, negated). */
function hasWords(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasWords);
  if (!isRecord(value)) return false;
  if (typeof value.text === 'string') return value.text.trim().length > 0;
  return Object.values(value).some(hasWords);
}

/** Answer-layer lists; pie, flow and forum diagrams never draw them (`hasAnswerLayer`). */
const ANSWER_LISTS = ['curves', 'points', 'labels', 'arrows', 'areas', 'spans'];

/** Any diagram anywhere in `value` with an element flagged `answer` (as `hasAnswerLayer`). */
function hasAnswerElement(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasAnswerElement);
  if (!isRecord(value)) return false;
  const diagram = value.kind === 'diagram' ? value.diagram : undefined;
  if (isRecord(diagram) && !diagram.pie && !diagram.flow && !diagram.forum) {
    const flagged = ANSWER_LISTS.some((list) => {
      const elements = diagram[list];
      return Array.isArray(elements) && elements.some((element) => isRecord(element) && Boolean(element.answer));
    });
    if (flagged) return true;
  }
  return Object.values(value).some(hasAnswerElement);
}
