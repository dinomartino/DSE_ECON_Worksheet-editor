import { beforeEach, describe, expect, it } from 'vitest';
import { createWorksheet } from '@/model/factories';
import type { McqQuestion, Worksheet } from '@/model/types';
import type { WorksheetStore } from '@/storage';
import { useWorksheetStore } from '@/store/worksheetStore';
import { buildsOf, insertIntoOpenPaper, keepInMyBank, languageOf, materialize, paperName, pickedEntries } from './deliver';
import { INVENTED } from './fixtures';
import type { SheetDraft } from './session';
import type { StudioDraft } from './types';

const [A, B, C] = INVENTED;

function entry(id: string, source: (typeof INVENTED)[number], over: { keyPoint?: string; status?: StudioDraft['status']; sides?: Array<'en' | 'zh'> } = {}): SheetDraft {
  return {
    draft: {
      id,
      draft: { kind: 'mcq', stem: source.stem, statements: source.statements, options: source.options, answerIndex: source.answer, explanation: source.explanation },
      angle: source.angle,
      status: over.status ?? 'ok',
      checks: [],
      attempt: 1,
    },
    request: { keyPoint: over.keyPoint ?? 'C.ped', points: [], examples: [], count: 1, level: 'same', shape: 'any', sides: over.sides ?? ['en', 'zh'], note: '' },
  };
}

describe('what the tray sends', () => {
  const sheet = [entry('d1', A), entry('d2', B, { status: 'failed' }), entry('d3', C, { keyPoint: 'C.law-of-demand' })];

  it('is the ticked drafts, in the order ticked, never one that failed or is gone', () => {
    expect(pickedEntries(sheet, ['d3', 'd1']).map((e) => e.draft.id)).toEqual(['d3', 'd1']);
    expect(pickedEntries(sheet, ['d2', 'd9', 'd1']).map((e) => e.draft.id)).toEqual(['d1']);
    expect(pickedEntries(sheet, [])).toEqual([]);
  });

  it('makes one multiple-choice build each, tagged with its own key point, as an original', () => {
    const builds = buildsOf(pickedEntries(sheet, ['d1', 'd3']));
    expect(builds.map((b) => b.typeId)).toEqual(['mcq', 'mcq']);
    const questions = builds.map((b) => materialize(b) as McqQuestion);
    expect(questions.map((q) => q.tags)).toEqual([['C.ped'], ['C.law-of-demand']]);
    expect(questions[0].options).toHaveLength(4);
    expect(questions[0].answerIndex).toBe(A.answer);
    expect(questions[0].lineage).toBeUndefined();
    expect(questions[0].provenance).toBeUndefined();
    expect(questions[0].id).not.toBe(questions[1].id);
  });

  it('opens a new paper in the language its drafts were written in, both sides when they differ', () => {
    expect(languageOf([entry('a', A, { sides: ['en'] }), entry('b', B, { sides: ['en'] })])).toBe('en');
    expect(languageOf([entry('a', A, { sides: ['zh'] })])).toBe('zh');
    expect(languageOf([entry('a', A)])).toBe('bilingual');
    expect(languageOf([entry('a', A, { sides: ['en'] }), entry('b', B, { sides: ['zh'] })])).toBe('bilingual');
  });

  it('names a new paper after the key point when every draft tests it, else leaves it unnamed', () => {
    expect(paperName([entry('a', A), entry('b', B)], 'en')).toBe('Price elasticity of demand');
    expect(paperName([entry('a', A)], 'zh')).toBe('需求價格彈性');
    expect(paperName([entry('a', A)], 'bilingual')).toBe('Price elasticity of demand 需求價格彈性');
    expect(paperName([entry('a', A), entry('c', C, { keyPoint: 'C.law-of-demand' })], 'en')).toBe('');
    expect(paperName([entry('a', A, { keyPoint: 'nonsense' })], 'en')).toBe('');
  });
});

describe('into a paper', () => {
  beforeEach(() => {
    useWorksheetStore.getState().replaceWorksheet(createWorksheet());
  });

  it('inserts every build at once, selects the first, and one ⌘Z takes them all back', () => {
    const before = useWorksheetStore.getState().worksheet.questions.length;
    const result = insertIntoOpenPaper(buildsOf([entry('d1', A), entry('d2', B)]));
    expect(result.ok).toBe(true);
    const state = useWorksheetStore.getState();
    expect(state.worksheet.questions).toHaveLength(before + 2);
    if (result.ok) {
      expect(result.ids).toHaveLength(2);
      expect(state.selectedQuestionId).toBe(result.ids[0]);
      const inserted = state.worksheet.questions.find((q) => q.id === result.ids[0]) as McqQuestion;
      expect(inserted.tags).toEqual(['C.ped']);
    }
    state.undo();
    expect(useWorksheetStore.getState().worksheet.questions).toHaveLength(before);
  });

  it('inserts nothing for no builds, and nothing into a read-only paper', () => {
    expect(insertIntoOpenPaper([])).toEqual({ ok: false, reason: 'nothing' });
    useWorksheetStore.setState({ readOnly: true });
    try {
      expect(insertIntoOpenPaper(buildsOf([entry('d1', A)]))).toEqual({ ok: false, reason: 'readOnly' });
    } finally {
      useWorksheetStore.setState({ readOnly: false });
    }
  });
});

describe('into the question bank', () => {
  function memory() {
    const map = new Map<string, Worksheet>();
    const store = {
      list: async () => [...map.values()].map((d) => ({ id: d.id, title: 'Bank', updatedAt: d.updatedAt, kind: d.kind })),
      load: async (id: string) => structuredClone(map.get(id)),
      save: async (w: Worksheet) => void map.set(w.id, structuredClone(w)),
    } as unknown as WorksheetStore;
    return { map, store };
  }

  it('keeps them in the one bank (made when there is none), as originals tagged with their key point', async () => {
    const { map, store } = memory();
    const kept = await keepInMyBank(buildsOf([entry('d1', A), entry('d3', C, { keyPoint: 'C.law-of-demand' })]), { store });
    expect(kept).toMatchObject({ copied: 2, already: 0 });
    expect(map.size).toBe(1);
    const bank = [...map.values()][0];
    expect(bank.kind).toBe('bank');
    expect(bank.questions.map((q) => (q as McqQuestion).tags)).toEqual([['C.ped'], ['C.law-of-demand']]);
    expect(bank.questions.every((q) => q.lineage === undefined)).toBe(true);
  });

  it('never keeps the same question twice', async () => {
    const { map, store } = memory();
    await keepInMyBank(buildsOf([entry('d1', A)]), { store });
    const again = await keepInMyBank(buildsOf([entry('d9', A), entry('d2', B)]), { store });
    expect(again).toMatchObject({ copied: 1, already: 1 });
    expect(map.size).toBe(1);
    expect([...map.values()][0].questions).toHaveLength(2);
  });
});
