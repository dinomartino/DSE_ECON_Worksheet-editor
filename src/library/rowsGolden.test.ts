import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { migrate } from '@/model/migrations';
import golden from './rowsGolden.json';
import { INDEX_FORMAT, STORED_INDEX_FORMAT } from './bankBackend';
import { rowsOf } from './indexer';

/**
 * A golden `rowsOf` output. Stored index rows are only re-derived when their document's
 * `updatedAt` moves or the stored format key does, so a change to what `rowsOf` writes
 * (shape, excerpt, search text, `contentKey`) leaves every persisted index stale unless
 * `INDEX_FORMAT` is bumped. This fails first, to say so.
 *
 * The input is a literal document (not built by factories), so only the rows logic moves it.
 * After bumping, regenerate: `UPDATE_ROWS_GOLDEN=1 npm test -- src/library/rowsGolden`.
 * Topic labels are folded into the key already (`STORED_INDEX_FORMAT`): a label-only
 * change needs the regeneration, not the bump.
 */

const text = (en: string, zh = '') => ({ en: en ? [{ text: en }] : [], zh: zh ? [{ text: zh }] : [] });

const DOC = {
  schemaVersion: 1,
  id: 'doc-golden',
  name: 'Golden paper',
  title: text('Golden paper', '樣本卷'),
  instructions: text(''),
  classes: ['5A'],
  satOn: '2026-03-02',
  questions: [
    {
      id: 'q-mcq',
      type: 'mcq',
      blocks: [{ kind: 'paragraph', id: 'b1', text: text('Along a straight-line demand curve, PED is', '沿直線需求曲線，需求價格彈性') }],
      marks: 1,
      options: ['constant', 'rising', 'falling', 'zero'].map((en, i) => ({ id: `o${i}`, text: text(en, `選項${i + 1}`) })),
      answerIndex: 1,
      tags: ['C.ped', 'C.ped::Straight-line PED', 'mock 2025'],
      tagsAt: '2026-03-04T08:00:00.000Z',
    },
    {
      id: 'q-lq',
      type: 'structured',
      blocks: [{ kind: 'paragraph', id: 'b2', text: text('Explain a bumper harvest.') }],
      parts: [{ id: 'p1', blocks: [{ kind: 'paragraph', id: 'b3', text: text('Draw the diagram.') }], marks: 4 }],
      lineage: { rootId: 'root-1', fromDocId: 'bank-1', copiedAt: '2026-01-01T00:00:00.000Z' },
      tags: ['C.equilibrium'],
    },
  ],
  layout: [],
  flow: [
    { type: 'question', id: 'q-mcq' },
    { type: 'question', id: 'q-lq' },
  ],
  createdAt: '2026-03-01T00:00:00.000Z',
  updatedAt: '2026-03-05T00:00:00.000Z',
};

describe('the golden rowsOf output', () => {
  it(`is unchanged at INDEX_FORMAT ${INDEX_FORMAT}`, () => {
    const rows = rowsOf(migrate(structuredClone(DOC)), { title: 'Golden paper', updatedAt: DOC.updatedAt });
    const actual = JSON.parse(JSON.stringify({ format: INDEX_FORMAT, rows }));
    if (process.env.UPDATE_ROWS_GOLDEN === '1') {
      writeFileSync(fileURLToPath(new URL('./rowsGolden.json', import.meta.url)), `${JSON.stringify(actual, null, 2)}\n`);
      return;
    }
    expect(
      actual,
      'rowsOf output changed: bump INDEX_FORMAT in src/library/bankBackend.ts so stored indexes rebuild, ' +
        'then regenerate with UPDATE_ROWS_GOLDEN=1 npm test -- src/library/rowsGolden',
    ).toEqual(golden);
  });

  it('stamps stored indexes with the rows version and a hash of the topic labels', () => {
    expect(STORED_INDEX_FORMAT).toMatch(new RegExp(`^${INDEX_FORMAT}\\.[0-9a-z]+$`));
  });
});
