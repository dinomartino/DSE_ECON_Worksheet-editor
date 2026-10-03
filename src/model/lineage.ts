import { flattenBlocks, questionBlockLists } from './edits';
import { newId } from './factories';
import type { MarkScheme } from './markSchemeTypes';
import type { ContentBlock, Question, QuestionLineage } from './types';

/**
 * Question identity across copies (§ docs/design/question-library.md, "Ids").
 *
 * Every edit is addressed by id, so a copy that keeps any id its source holds is not a
 * copy: an edit to one lands in both. Diagram-internal ids (curves, points, labels,
 * areas) are scoped to their diagram and cross-referenced inside it, so they are kept.
 */

/** Which lookup an id is found by — a clash only matters within one space. */
export type IdSpace = 'question' | 'block' | 'row' | 'cell' | 'option' | 'part' | 'scheme';

export interface IdOwner {
  space: IdSpace;
  owner: { id: string };
}

/** Every id-bearing object in a block list: blocks at any depth, table rows and cells. */
export function* blockIdOwners(blocks: ContentBlock[]): Generator<IdOwner> {
  for (const block of flattenBlocks(blocks)) {
    yield { space: 'block', owner: block };
    if (block.kind !== 'table') continue;
    for (const row of block.rows) {
      yield { space: 'row', owner: row };
      for (const cell of row.cells) yield { space: 'cell', owner: cell };
    }
  }
}

function* schemeIdOwners(scheme: MarkScheme | undefined): Generator<IdOwner> {
  if (!scheme) return;
  for (const route of scheme.routes ?? []) {
    yield { space: 'scheme', owner: route };
    for (const group of route.groups ?? []) {
      yield { space: 'scheme', owner: group };
      for (const point of group.points ?? []) yield { space: 'scheme', owner: point };
    }
  }
  for (const level of scheme.levels ?? []) yield { space: 'scheme', owner: level };
  for (const descriptor of scheme.ec?.descriptors ?? []) yield { space: 'scheme', owner: descriptor };
}

type Leaf = { id: string; scheme?: MarkScheme };

/**
 * Every object in a question that owns an id. Read structurally, like `questionBlockLists`,
 * so no concrete type id is named (§ Question-type registry).
 */
export function* questionIdOwners(question: Question): Generator<IdOwner> {
  yield { space: 'question', owner: question };
  const shaped = question as {
    scheme?: MarkScheme;
    parts?: Array<Leaf & { subParts?: Leaf[] }>;
    options?: Array<{ id: string }>;
  };
  for (const option of shaped.options ?? []) yield { space: 'option', owner: option };
  for (const blocks of questionBlockLists(question)) yield* blockIdOwners(blocks);
  yield* schemeIdOwners(shaped.scheme);
  for (const part of shaped.parts ?? []) {
    yield { space: 'part', owner: part };
    yield* schemeIdOwners(part.scheme);
    for (const sub of part.subParts ?? []) {
      yield { space: 'part', owner: sub };
      yield* schemeIdOwners(sub.scheme);
    }
  }
}

/**
 * The same question under new ids at every level — the only safe way to put a second
 * copy of a question into a document. Content, including `lineage`, is kept verbatim.
 * Renewed on a deep clone, so the source is never touched and nothing is shared.
 */
export function freshIds<Q extends Question>(question: Q): Q {
  const copy = structuredClone(question);
  for (const { owner } of questionIdOwners(copy)) owner.id = newId();
  return copy;
}

/**
 * A question's identity across copies: `lineage.rootId`, or its own id for an original.
 * A `rootId` that is not a string (a hand-edited file) reads as absent.
 */
export function rootIdOf(question: Pick<Question, 'id' | 'lineage'>): string {
  const rootId = question.lineage?.rootId as unknown;
  return typeof rootId === 'string' && rootId ? rootId : question.id;
}

/**
 * A part's or sub-part's identity across copies: its `rootId`, or its own id for a part
 * of an original. A `rootId` that is not a string reads as absent, as `rootIdOf` does.
 */
export function partRootOf(part: { id: string; rootId?: unknown }): string {
  const rootId = part.rootId;
  return typeof rootId === 'string' && rootId ? rootId : part.id;
}

/**
 * `freshIds`, with every part and sub-part stamped with its source's `partRootOf` (read
 * structurally, the `part` owners of `questionIdOwners` walked in step), so the copy's
 * parts keep their identity across copies (`model/tagSlots.ts`).
 */
export function freshIdsKeepingParts<Q extends Question>(question: Q): Q {
  const copy = freshIds(question);
  const sources = [...questionIdOwners(question)];
  const copies = [...questionIdOwners(copy)];
  sources.forEach((source, index) => {
    if (source.space !== 'part') return;
    (copies[index].owner as { rootId?: string }).rootId = partRootOf(source.owner);
  });
  return copy;
}

/**
 * A copy taken from another document: fresh ids, plus the lineage that ties it back to
 * its first ancestor. `rootId` survives a copy of a copy. Only the per-copy fields
 * (`fromDocId`, `copiedAt`) are renewed; any other lineage field (a later build's
 * publisher, licence or source) travels with the copy unchanged.
 *
 * Parts keep their identity (`freshIdsKeepingParts`), so copies agree on "part (b)"
 * however either is later reordered.
 */
export function copyQuestion<Q extends Question>(question: Q, fromDocId?: string): Q {
  const lineage = question.lineage;
  const kept = lineage && typeof lineage === 'object' && !Array.isArray(lineage) ? { ...lineage } : {};
  delete (kept as Partial<QuestionLineage>).fromDocId;
  delete (kept as Partial<QuestionLineage>).copiedAt;
  const copy = freshIdsKeepingParts(question);
  return {
    ...copy,
    lineage: {
      ...kept,
      rootId: rootIdOf(question),
      ...(fromDocId ? { fromDocId } : {}),
      copiedAt: new Date().toISOString(),
    },
  };
}

/**
 * "Treat as a new question": the question cut loose from its origin. `lineage` goes, and
 * so does every part's and sub-part's `rootId` (read structurally), so it becomes the
 * root of its own copies. Its content, ids and tags are kept. The same object when it
 * carries neither.
 */
export function withoutLineage<Q extends Question>(question: Q): Q {
  const parts = [...questionIdOwners(question)].filter(
    (entry) => entry.space === 'part' && 'rootId' in entry.owner,
  );
  if (!('lineage' in question) && parts.length === 0) return question;
  const copy = structuredClone(question);
  delete (copy as Partial<Question>).lineage;
  for (const { space, owner } of questionIdOwners(copy)) {
    if (space === 'part') delete (owner as { rootId?: unknown }).rootId;
  }
  return copy;
}
