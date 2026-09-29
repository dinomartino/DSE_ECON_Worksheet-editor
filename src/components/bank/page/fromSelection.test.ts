import { describe, expect, it } from 'vitest';
import { choiceQuestion, docWith, partsQuestion } from '@/library/testKit';
import { computeNumbering } from '@/model/numbering';
import { plain } from '@/model/text';
import { questionPreviewHtml } from './questionPreview';
import { sharedTopic, worksheetFromPicks } from './fromSelection';

describe('worksheetFromPicks', () => {
  it('copies the picks in picked order, with fresh ids and lineage back to their source', () => {
    const first = choiceQuestion('Second in the source', '', ['C.ped']);
    const second = partsQuestion('First in the source');
    const made = worksheetFromPicks([
      { question: first, fromDocId: 'doc-a' },
      { question: second, fromDocId: 'doc-b' },
    ]);
    expect(made.questions).toHaveLength(2);
    expect(made.questions[0].id).not.toBe(first.id);
    expect(made.questions[0].lineage).toMatchObject({ rootId: first.id, fromDocId: 'doc-a' });
    expect(made.questions[1].lineage).toMatchObject({ rootId: second.id, fromDocId: 'doc-b' });
    expect(made.questions[0].tags).toEqual(['C.ped']);
    const numbering = computeNumbering(made);
    expect(numbering.questions.map((entry) => entry.question.id)).toEqual(made.questions.map((q) => q.id));
    expect(made.layout).toEqual([]); // no section headings to reorder them under
    expect(made.kind).toBeUndefined();
  });

  it('leaves out a question of a type this build does not know', () => {
    const unknown = { ...choiceQuestion('from the future'), type: 'hologram' } as unknown as ReturnType<typeof choiceQuestion>;
    expect(worksheetFromPicks([{ question: unknown, fromDocId: 'x' }]).questions).toEqual([]);
  });

  it('is titled after the one coarse topic every pick shares', () => {
    expect(sharedTopic([choiceQuestion('a', '', ['C.ped']), choiceQuestion('b', '', ['C', 'D'])])).toEqual({
      en: 'Market and Price',
      zh: '市場與價格',
    });
    expect(sharedTopic([choiceQuestion('a', '', ['C.ped']), choiceQuestion('b', '', ['D'])])).toBeUndefined();
    expect(sharedTopic([choiceQuestion('a')])).toBeUndefined();
    const made = worksheetFromPicks([{ question: choiceQuestion('a', '', ['H.money']), fromDocId: 'x' }]);
    expect(plain(made.title.en)).toBe('Money and Banking');
  });
});

describe('questionPreviewHtml', () => {
  it('renders one question alone, Teacher version, from its own document', () => {
    const lead = choiceQuestion('Unrelated first question');
    const target = { ...choiceQuestion('Along a straight-line demand curve, elasticity…'), answerIndex: 1 };
    const doc = docWith([lead, target]);
    const preview = questionPreviewHtml(doc, target.id, 'en')!;
    expect(preview.html).toContain('Along a straight-line demand curve');
    expect(preview.html).not.toContain('Unrelated first question');
    expect(preview.html).not.toMatch(/<script/i);
    expect(preview.widthPx).toBeCloseTo((11906 - 2880) / 15, 0);
    expect(questionPreviewHtml(doc, 'missing', 'en')).toBeUndefined();
  });
});
