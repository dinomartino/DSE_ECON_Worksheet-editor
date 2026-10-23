import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { exportDocxBuffer } from '@/export/docx';
import { resolveFlow } from '@/model/flow';
import { parseWorksheet } from '@/storage/document';
import { useWorksheetStore } from '@/store/worksheetStore';

/*
 * `test-fixtures/manual/` holds documents a person opens in the app by hand
 * (README there). They are not frozen evidence like `corpus/`; this only proves they
 * still open through the app's own load path, keep their shape, and export.
 */
const DIR = 'test-fixtures/manual';
const load = (name: string) => parseWorksheet(readFileSync(`${DIR}/${name}.json`, 'utf8'));
const shape = (name: string) =>
  resolveFlow(load(name))
    .filter((i) => i.type === 'question' || i.element.kind === 'pageBreak')
    .map((i) => (i.type === 'question' ? 'Q' : '|'))
    .join('');

describe('manual test documents', () => {
  it('lists the three files', () => {
    expect(readdirSync(DIR).filter((f) => f.endsWith('.json')).sort()).toEqual([
      'issue-4-many-breaks.json',
      'issue-4-repro.json',
      'mixed-for-anonymiser.json',
    ]);
  });

  it('issue-4-repro: 24 MCs, breaks after Q4 and Q5', () => {
    expect(shape('issue-4-repro')).toBe(`QQQQ|Q|${'Q'.repeat(19)}`);
  });

  it('issue-4-many-breaks: break first and last, two in a row, a lone question', () => {
    expect(shape('issue-4-many-breaks')).toBe('|QQ|Q||Q|QQQ|Q|');
  });

  it('mixed-for-anonymiser: combination MC, table, image, long text, structured', () => {
    const w = load('mixed-for-anonymiser');
    const json = JSON.stringify(w.questions);
    expect(w.questions.some((q) => q.type === 'mcq' && (q.statements?.length ?? 0) === 3)).toBe(true);
    expect(w.questions.some((q) => q.type === 'structured')).toBe(true);
    expect(json).toContain('"kind":"table"');
    expect(json).toContain('"kind":"image"');
  });

  it.each(['issue-4-repro', 'issue-4-many-breaks', 'mixed-for-anonymiser'])('%s exports a .docx', async (name) => {
    const bytes = await exportDocxBuffer(load(name), { language: 'bilingual', version: 'student' });
    expect(bytes.length).toBeGreaterThan(2000);
  });

  it('issue-4-repro: ↑ on Q6 lands after Q5 on page 2 (the fix)', () => {
    const w = load('issue-4-repro');
    useWorksheetStore.setState({ worksheet: w, past: [], future: [] });
    const q6 = w.questions[5].id;
    useWorksheetStore.getState().moveQuestion(q6, -1);
    const order = resolveFlow(useWorksheetStore.getState().worksheet)
      .filter((i) => i.type === 'question' || i.element.kind === 'pageBreak')
      .map((i) => (i.type === 'question' ? i.id : '|'));
    expect(order.slice(4, 9)).toEqual(['|', w.questions[4].id, q6, '|', w.questions[6].id]);
  });
});
