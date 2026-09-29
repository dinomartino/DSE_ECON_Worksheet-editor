import { flattenBlocks, questionBlockLists } from './edits';
import { newId } from './factories';
import type { MarkScheme } from './markSchemeTypes';
import type { ContentBlock, Question } from './types';

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
 * A copy taken from another document: fresh ids, plus the lineage that ties it back to
 * its first ancestor. `rootId` survives a copy of a copy.
 */
export function copyQuestion<Q extends Question>(question: Q, fromDocId?: string): Q {
  return {
    ...freshIds(question),
    lineage: {
      rootId: question.lineage?.rootId ?? question.id,
      ...(fromDocId ? { fromDocId } : {}),
      copiedAt: new Date().toISOString(),
    },
  };
}
