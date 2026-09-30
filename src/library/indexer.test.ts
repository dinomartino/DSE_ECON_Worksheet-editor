import { describe, expect, it } from 'vitest';
import { createDiagramBlock, createImageBlock } from '@/model/factories';
import { copyQuestion } from '@/model/lineage';
import type { ContentBlock, Question } from '@/model/types';
import { buildAcceptanceWorksheet } from '@/test/fixtures';
import { isBankRow } from './bankBackend';
import { EXCERPT_MAX, rowsOf } from './indexer';
import { choiceQuestion, docWith, partsQuestion } from './testKit';

const summary = { title: 'Mock 2026', updatedAt: '2026-03-01T00:00:00.000Z' };

describe('rowsOf', () => {
  it('derives one row per question, in printed order, named and dated by the summary', () => {
    const a = choiceQuestion('Which is a free good?', '以下哪項是免費物品？', ['A.scarcity']);
    const b = partsQuestion('A city plans a garden.');
    const doc = docWith([a, b], { classes: [' 5A ', '5B', '5a', ''], satOn: '2025-11-03', createdAt: '2025-10-01T00:00:00.000Z' });
    const rows = rowsOf(doc, summary);
    expect(rows.map((r) => r.questionId)).toEqual([a.id, b.id]);
    expect(rows[0]).toMatchObject({
      docId: doc.id,
      docTitle: 'Mock 2026',
      docUpdatedAt: '2026-03-01T00:00:00.000Z',
      usedOn: '2025-11-03',
      docKind: 'paper',
      classes: ['5A', '5B'],
      rootId: a.id,
      typeId: a.type,
      marks: 1,
      tags: ['A.scarcity'],
      excerpt: { en: 'Which is a free good?', zh: '以下哪項是免費物品？' },
      languages: ['en', 'zh'],
      hasDiagram: false,
      number: 1,
    });
    expect(rows[1]).toMatchObject({ marks: 4, number: 2, languages: ['en'], excerpt: { en: 'A city plans a garden.', zh: 'A city plans a garden.' } });
  });

  it('searches printed text in both languages and the topic names of its tags', () => {
    const [row] = rowsOf(docWith([choiceQuestion('Price ELASTICITY', '價格彈性', ['C.ped'])]));
    expect(row.searchText).toContain('price elasticity');
    expect(row.searchText).toContain('價格彈性');
    expect(row.searchText).toContain('option 3');
    expect(row.searchText).toContain('price elasticity of demand');
    expect(row.searchText).toContain('需求價格彈性');
  });

  it('names a copy by its root and a bank by its kind', () => {
    const original = choiceQuestion('Stem');
    const copy = copyQuestion(original, 'src');
    const [row] = rowsOf(docWith([copy], { kind: 'bank' }));
    expect(row.rootId).toBe(original.id);
    expect(row.questionId).toBe(copy.id);
    expect(row.docKind).toBe('bank');
    expect(row.classes).toBeUndefined();
  });

  it('skips a hidden document', () => {
    expect(rowsOf(docWith([choiceQuestion('Stem')], { bankHidden: true }))).toEqual([]);
  });

  it('flags a figure but never stores its image', () => {
    const src = 'data:image/png;base64,' + 'A'.repeat(5000);
    const withImage = choiceQuestion('Look at the figure');
    withImage.blocks.push(createImageBlock(src, 10, 10) as ContentBlock);
    const withDiagram = choiceQuestion('Look at the diagram');
    withDiagram.blocks.push(createDiagramBlock() as ContentBlock);
    const rows = rowsOf(docWith([withImage, withDiagram]));
    expect(rows.map((r) => r.hasDiagram)).toEqual([true, true]);
    expect(JSON.stringify(rows)).not.toContain('base64');
  });

  it('clips a long stem and reports a missing language', () => {
    const [row] = rowsOf(docWith([partsQuestion('', '只有中文 '.repeat(80))]));
    expect(row.excerpt.en.length).toBeLessThanOrEqual(EXCERPT_MAX + 1);
    expect(row.excerpt.en).toBe(row.excerpt.zh);
    expect(row.excerpt.zh.endsWith('…')).toBe(true);
    expect(row.languages).toEqual(['zh']);
  });

  it('indexes the acceptance worksheet without throwing, one row per question', () => {
    const doc = buildAcceptanceWorksheet();
    expect(rowsOf(doc)).toHaveLength(doc.questions.length);
  });

  it('reads only string tags, and falls back to the question id for a rootId that is not a string', () => {
    // A newer build's tag shape, or a hand-edited file: never a crash, never lost.
    const odd = { ...choiceQuestion('Odd', '', ['C.ped']), lineage: { rootId: 42 } } as unknown as Question;
    (odd as unknown as { tags: unknown[] }).tags = ['C.ped', 7, { code: 'C' }, null, 'mine'];
    const [row] = rowsOf(docWith([odd]));
    expect(row.tags).toEqual(['C.ped', 'mine']);
    expect(row.rootId).toBe(odd.id);
    expect(isBankRow(row)).toBe(true);
    expect(odd.tags).toHaveLength(5);
  });

  it('reads tags that are not a list as none', () => {
    const odd = { ...choiceQuestion('Odd'), tags: 'C.ped' } as unknown as Question;
    expect(rowsOf(docWith([odd]))[0].tags).toEqual([]);
  });
});
