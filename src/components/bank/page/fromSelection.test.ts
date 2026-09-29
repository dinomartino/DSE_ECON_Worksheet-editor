import { beforeEach, describe, expect, it } from 'vitest';
import { rowsOf } from '@/library/indexer';
import { withSharedTags } from '@/library/sharedTags';
import { choiceQuestion, docWith, partsQuestion } from '@/library/testKit';
import { copyQuestion } from '@/model/lineage';
import type { Worksheet } from '@/model/types';
import { useWorksheetStore } from '@/store/worksheetStore';
import { addPicksToOpenDocument } from './addToOpen';
import { computeNumbering } from '@/model/numbering';
import { plain } from '@/model/text';
import { questionPreviewHtml } from './questionPreview';
import { readPicks, sharedTopic, worksheetFromPicks } from './fromSelection';

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
    // Nobody has sat the new worksheet: it is a draft until Setup names a class.
    expect(made.classes).toBeUndefined();
    expect(made.satOn).toBeUndefined();
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

describe('readPicks', () => {
  const original = choiceQuestion('Along a straight-line demand curve…', '', ['C']);
  const home = docWith([original]);
  const copy = { ...copyQuestion(original, home.id), tags: ['C.ped', 'mock 2025'] };
  const other = docWith([copy, partsQuestion('Explain a bumper harvest.')]);
  const sources = new Map<string, Worksheet>([
    [home.id, home],
    [other.id, other],
  ]);
  const loads: string[] = [];
  const store = {
    load: async (id: string) => {
      loads.push(id);
      return sources.get(id);
    },
  };
  const rows = withSharedTags([...rowsOf(home), ...rowsOf(other)]);
  const homeRow = rows.find((r) => r.docId === home.id)!;

  beforeEach(() => {
    loads.length = 0;
  });

  it('gives each pick the tags its row shows, so New worksheet from these carries the union', async () => {
    const picked = await readPicks(store, [homeRow, { ...homeRow, questionId: 'gone' }]);
    expect(picked).toHaveLength(1);
    expect(picked[0].question.tags).toEqual(['C', 'C.ped', 'mock 2025']);
    expect(worksheetFromPicks(picked).questions[0].tags).toEqual(['C', 'C.ped', 'mock 2025']);
    expect(loads).toEqual([home.id]); // one load per document
    expect(home.questions[0].tags).toEqual(['C']); // the source is only read
  });

  it('and Add to the open paper does too', async () => {
    useWorksheetStore.setState({ worksheet: docWith([partsQuestion('Already here')]), past: [], future: [], readOnly: false });
    const [id] = addPicksToOpenDocument(await readPicks(store, [homeRow]));
    expect(useWorksheetStore.getState().worksheet.questions.find((q) => q.id === id)?.tags).toEqual(['C', 'C.ped', 'mock 2025']);
  });
});
