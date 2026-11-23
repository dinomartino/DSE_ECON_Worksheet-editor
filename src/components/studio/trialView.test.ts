import { describe, expect, it } from 'vitest';
import { REQUEST, okOutcome, studioDraft } from '@/questionStudio/fixtures';
import { createTrialLog } from '@/questionStudio/trialLog';
import { keyPointLabel, languageOfSides, readingList, sheetDraftOf } from './trialView';

const copyFail = { id: 'copy' as const, state: 'fail' as const, findings: [{ id: 'copy.close' }], value: 40 };

function record() {
  const log = createTrialLog(undefined);
  const add = (label: string, ids: string[], at: string) => log.getState().record({ label, kind: 'write', request: REQUEST, outcome: okOutcome(ids.map((id) => studioDraft(id, id.startsWith('x') ? { rows: [copyFail] } : {}))), compared: { past: 1, mine: 0 }, at });
  add('B02', ['b2a', 'b2b'], '2026-11-24T01:02:00Z');
  add('mine', ['m1'], '2026-11-24T01:03:00Z');
  add('B01', ['b1a', 'xleft'], '2026-11-24T01:01:00Z');
  add('mine', ['m2'], '2026-11-24T01:04:00Z');
  return log;
}

describe('the trial kit’s reading list', () => {
  it('is the teacher’s own requests newest first, then the briefs in order, and never a draft the studio left out', () => {
    expect(readingList(record().getState().runs, 'all').map(({ entry }) => entry.id)).toEqual(['m2', 'm1', 'b1a', 'b2a', 'b2b']);
  });

  it('keeps to the briefs, or to the teacher’s own', () => {
    const runs = record().getState().runs;
    expect(readingList(runs, 'briefs').map(({ entry }) => entry.id)).toEqual(['b1a', 'b2a', 'b2b']);
    expect(readingList(runs, 'mine').map(({ entry }) => entry.id)).toEqual(['m2', 'm1']);
  });

  it('drops a draft once both marks are given, so the top is always the next to mark', () => {
    const log = record();
    log.getState().mark('m2', { key: 'ok' });
    expect(readingList(log.getState().runs, 'todo').map(({ entry }) => entry.id)).toContain('m2');
    log.getState().mark('m2', { use: 'asis' });
    log.getState().mark('b1a', { key: 'bad', use: 'reject' });
    expect(readingList(log.getState().runs, 'todo').map(({ entry }) => entry.id)).toEqual(['m1', 'b2a', 'b2b']);
    expect(readingList(log.getState().runs, 'all')).toHaveLength(5);
  });

  it('reads an empty record as an empty list', () => {
    expect(readingList([], 'todo')).toEqual([]);
  });
});

describe('a recorded draft drawn as the studio draws one', () => {
  it('carries the sides, level and shape it was asked for and no example or note', () => {
    const run = record().getState().runs[1];
    const sheet = sheetDraftOf(run, run.drafts[0]);
    expect(sheet.draft).toBe(run.drafts[0].draft);
    expect(sheet.request).toMatchObject({ keyPoint: 'C.ped', level: 'same', shape: 'any', sides: ['en', 'zh'], examples: [], note: '' });
  });

  it('names the language by its sides', () => {
    expect(languageOfSides(['en'])).toBe('en');
    expect(languageOfSides(['zh'])).toBe('zh');
    expect(languageOfSides(['en', 'zh'])).toBe('bilingual');
  });

  it('names a key point in the draft’s language, or falls back to its code (k-0500)', () => {
    expect(keyPointLabel('C.ped', 'en')).toBe('Price elasticity of demand');
    expect(keyPointLabel('C.ped', 'zh')).toBe('需求價格彈性');
    expect(keyPointLabel('Z.nothing', 'en')).toBe('Z.nothing');
  });
});
