import { describe, expect, it } from 'vitest';
import { richMcq, richStructured } from '@/test/idFixture';
import { resolveDiagram } from './diagramAnchors';
import { copyQuestion, freshIds } from './lineage';

/** Every `id` in a value, except those inside a diagram's own geometry. */
function ids(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const entry of value) ids(entry, out);
  } else if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if (key === 'id' && typeof entry === 'string') out.push(entry);
      else if (key !== 'diagram' && key !== 'lineage') ids(entry, out);
    }
  }
  return out;
}

/** Every `diagram` geometry in a value, in walk order. */
function diagrams(value: unknown, out: unknown[] = []): unknown[] {
  if (Array.isArray(value)) {
    for (const entry of value) diagrams(entry, out);
  } else if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if (key === 'diagram') out.push(entry);
      else diagrams(entry, out);
    }
  }
  return out;
}

describe('freshIds', () => {
  it.each([
    ['structured', richStructured],
    ['mcq', richMcq],
  ])('renews every id a %s question holds, outside diagram geometry', (_name, build) => {
    const source = build();
    const before = structuredClone(source);
    const copy = freshIds(source);

    const sourceIds = ids(source);
    const copyIds = ids(copy);
    expect(copyIds).toHaveLength(sourceIds.length);
    expect(new Set(copyIds).size).toBe(copyIds.length);
    expect(copyIds.filter((id) => sourceIds.includes(id))).toEqual([]);
    // The source is untouched, and nothing is shared by reference.
    expect(source).toEqual(before);
    expect(copy.blocks[0]).not.toBe(source.blocks[0]);
  });

  it('covers the rich fixture: rows, cells, schemes, levels, EC and nested blocks', () => {
    // Guards the fixture itself, so the test above cannot pass by walking too little.
    const count = ids(richStructured()).length;
    expect(count).toBeGreaterThan(40);
  });

  it('keeps diagram geometry verbatim, so its cross-references still resolve', () => {
    const source = richStructured();
    const copy = freshIds(source);
    const before = diagrams(source) as Parameters<typeof resolveDiagram>[0][];
    const after = diagrams(copy) as Parameters<typeof resolveDiagram>[0][];
    expect(after).toHaveLength(3);
    expect(after).toEqual(before);
    after.forEach((diagram, i) => expect(resolveDiagram(diagram)).toEqual(resolveDiagram(before[i])));
  });

  it('keeps content, and an existing lineage, verbatim', () => {
    const source = { ...richMcq(), lineage: { rootId: 'root-1' } };
    const copy = freshIds(source);
    expect(copy.options.map((o) => o.text)).toEqual(source.options.map((o) => o.text));
    expect(copy.lineage).toEqual({ rootId: 'root-1' });
  });
});

describe('copyQuestion', () => {
  it('stamps lineage back to the original, through a copy of a copy', () => {
    const original = richMcq();
    const first = copyQuestion(original, 'doc-a');
    expect(first.id).not.toBe(original.id);
    expect(first.lineage).toMatchObject({ rootId: original.id, fromDocId: 'doc-a' });
    expect(Date.parse(first.lineage!.copiedAt!)).not.toBeNaN();

    const second = copyQuestion(first);
    expect(second.lineage!.rootId).toBe(original.id);
    expect(second.lineage).not.toHaveProperty('fromDocId');
    expect(original.lineage).toBeUndefined();
  });

  it('keeps lineage fields it does not know, renewing only the per-copy ones', () => {
    // A later build's `publisher` / `licence` must survive every copy this build makes.
    const future = {
      ...richMcq(),
      lineage: { rootId: 'root-1', fromDocId: 'old-doc', copiedAt: '2020-01-01T00:00:00.000Z', publisher: 'pack', licence: { kind: 'cc-by' } },
    } as unknown as ReturnType<typeof richMcq>;
    const copy = copyQuestion(future, 'doc-b');
    expect(copy.lineage).toMatchObject({ rootId: 'root-1', fromDocId: 'doc-b', publisher: 'pack', licence: { kind: 'cc-by' } });
    expect(copy.lineage!.copiedAt).not.toBe('2020-01-01T00:00:00.000Z');
    expect(copyQuestion(future).lineage).not.toHaveProperty('fromDocId');
  });

  it('roots a copy at the question itself when rootId is not a string', () => {
    const odd = { ...richMcq(), lineage: { rootId: 42 } } as unknown as ReturnType<typeof richMcq>;
    expect(copyQuestion(odd).lineage!.rootId).toBe(odd.id);
  });
});
