import { beforeEach, describe, expect, it } from 'vitest';
import { presetFor } from '@/ai/providers';
import { createWorksheetFrom } from '@/model/newWorksheet';
import type { McqQuestion } from '@/model/types';
import { useWorksheetStore } from '@/store/worksheetStore';
import { scriptedClient } from '@/translate/testKit';
import { INVENTED, REQUEST, corpusOf, solver, writeReply } from './fixtures';
import { EMPTY_CORPUS } from './nearCopy';
import { studioBuilds } from './insert';
import { writeDrafts } from './run';
import type { StudioDeps } from './types';

const [A] = INVENTED;
const store = () => useWorksheetStore.getState();
const live = () => new AbortController().signal;

async function drafts(copyOf = false) {
  const corpus = copyOf ? corpusOf([{ en: [A.stem.en, ...A.options.map((o) => o.en)].join(' ') }]) : EMPTY_CORPUS;
  const client = scriptedClient(copyOf ? [writeReply([A, INVENTED[1], INVENTED[2]]), writeReply([A]), solver()] : [writeReply([A, INVENTED[1], INVENTED[2]]), solver()]);
  const deps: StudioDeps = { client, preset: presetFor('gemini'), glossary: null, corpus };
  const out = await writeDrafts(REQUEST, deps, { signal: live() });
  if (!out.ok) throw new Error(out.error.kind);
  return out.drafts;
}

describe('studioBuilds', () => {
  beforeEach(() => {
    store().replaceWorksheet(createWorksheetFrom({ documentType: 'paper1' }));
    store().setMode({ language: 'bilingual', version: 'student' });
  });

  it('builds one MC question per draft, tagged with the key point, with its key and explanation', async () => {
    const list = await drafts();
    const before = store().worksheet.questions.length;
    const report = store().insertQuestionBatch(studioBuilds(list, 'C.ped'), { worksheetId: store().worksheet.id });
    if (!report.ok) throw new Error(report.refused);
    expect(report.questionIds).toHaveLength(3);
    expect(store().worksheet.questions).toHaveLength(before + 3);
    const inserted = store().worksheet.questions.filter((q) => report.questionIds.includes(q.id)) as McqQuestion[];
    expect(inserted.map((q) => q.type)).toEqual(['mcq', 'mcq', 'mcq']);
    expect(inserted.map((q) => q.tags)).toEqual([['C.ped'], ['C.ped'], ['C.ped']]);
    expect(inserted[0].answerIndex).toBe(A.answer);
    expect(inserted[0].options).toHaveLength(4);
    expect(inserted[0].options[2].text.en.map((r) => r.text).join('')).toBe('unit elastic.');
    expect(inserted[0].explanation?.en.length).toBeGreaterThan(0);
    // Nothing that says "a copy": no source line, no lineage.
    expect(inserted[0].provenance).toBeUndefined();
    expect(inserted[0].lineage).toBeUndefined();
    // Labelled until the teacher presses Checked.
    expect(inserted.every((q) => q.aiMade === true)).toBe(true);
    // The combination item keeps its statements.
    expect((inserted[2].statements ?? []).length).toBe(3);
  });

  it('inserts as one commit: one undo takes them all out', async () => {
    const list = await drafts();
    const before = store().worksheet;
    const report = store().insertQuestionBatch(studioBuilds(list, 'C.ped'), { worksheetId: store().worksheet.id });
    expect(report.ok).toBe(true);
    store().undo();
    expect(store().worksheet.questions).toHaveLength(before.questions.length);
  });

  it('never builds a draft that failed a hard check', async () => {
    const list = await drafts(true);
    const failedOne = { ...list[0], status: 'failed' as const };
    expect(studioBuilds([failedOne, list[1]], 'C.ped')).toHaveLength(1);
  });

  it('nothing is inserted until the builds are handed to the store', async () => {
    const before = store().worksheet;
    await drafts();
    expect(store().worksheet).toBe(before);
  });
});
