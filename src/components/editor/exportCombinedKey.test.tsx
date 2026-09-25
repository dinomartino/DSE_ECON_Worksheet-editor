import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createMcqQuestion, createWorksheet } from '@/model/factories';
import type { Worksheet } from '@/model/types';
import { parseWorksheet, type WorksheetSummary } from '@/storage';
import { ExportDialog } from './ExportDialog';
import { KEY_DOCUMENTS_SEARCH_FROM, keyDocumentChoices } from './KeyDocumentsField';
import { loadKeyDocuments, movePick, skippedNote, type ExportWhat, type ExportFormat } from './exportSession';

const summary = (id: string, title: string, updatedAt = '2026-09-01T00:00:00Z'): WorksheetSummary => ({
  id,
  title,
  updatedAt,
});

describe('loading the documents a combined key adds', () => {
  const good = (): Worksheet => ({ ...createWorksheet(), questions: [createMcqQuestion()] });

  it('keeps the ticked order and skips, by name, what will not open or render', async () => {
    const first = good();
    const third = good();
    const broken = { ...createWorksheet(), questions: [{ id: 'q', type: 'nonsense' }] } as unknown as Worksheet;
    const store: Record<string, () => Promise<Worksheet | undefined>> = {
      a: async () => first,
      corrupt: async () => parseWorksheet('{ not json'),
      gone: async () => undefined,
      broken: async () => broken,
      c: async () => third,
    };
    const load = vi.fn((id: string) => store[id]());
    const picks = ['a', 'corrupt', 'gone', 'broken', 'c'].map((id) => ({ id, title: `Doc ${id}` }));

    const { worksheets, skipped } = await loadKeyDocuments(picks, load, 'en');
    expect(worksheets).toEqual([first, third]);
    expect(skipped.map((pick) => pick.id)).toEqual(['corrupt', 'gone', 'broken']);
    expect(load).toHaveBeenCalledTimes(5);
    expect(skippedNote(skipped)).toBe('“Doc corrupt”, “Doc gone”, “Doc broken” could not be opened and were left out');
    expect(skippedNote(skipped.slice(0, 1))).toBe('“Doc corrupt” could not be opened and was left out');
    expect(skippedNote([])).toBe('');
  });

  it('migrates an old document in memory, through the store’s parse', async () => {
    const raw = readFileSync('src/test/corpus/v1-published.json', 'utf8');
    const { worksheets, skipped } = await loadKeyDocuments(
      [{ id: 'old', title: 'Old' }],
      async () => parseWorksheet(raw),
      'bilingual',
    );
    expect(skipped).toEqual([]);
    expect(worksheets[0].questions.length).toBeGreaterThan(0);
  });

  it('moves a pick up and down, and ignores a move off either end', () => {
    expect(movePick(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
    expect(movePick(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    const list = ['a', 'b'];
    expect(movePick(list, 0, -1)).toBe(list);
    expect(movePick(list, 1, 1)).toBe(list);
  });

  it('lists newest first and searches by name', () => {
    const docs = [summary('1', 'Paper 1', '2026-09-01'), summary('2', 'Paper 2', '2026-09-20'), summary('3', 'Quiz', '2026-08-01')];
    expect(keyDocumentChoices(docs, '').map((doc) => doc.id)).toEqual(['2', '1', '3']);
    expect(keyDocumentChoices(docs, ' paper ').map((doc) => doc.id)).toEqual(['2', '1']);
  });
});

describe('ExportDialog "Also include"', () => {
  const current = { ...createWorksheet(), name: 'Mock P1' };
  const documents = [summary(current.id, 'Mock P1'), summary('p2', 'Mock P2'), summary('q', 'Unit quiz')];
  const render = (what: ExportWhat, format: ExportFormat = 'docx', list = documents) =>
    renderToStaticMarkup(
      <ExportDialog
        worksheet={current}
        mode={{ language: 'en', version: 'student' }}
        onClose={() => {}}
        onExported={() => {}}
        initialWhat={what}
        initialFormat={format}
        documents={list}
      />,
    );

  it('offers the other saved documents when the answer key is exported', () => {
    for (const what of ['answerKey', 'both'] as const) {
      const markup = render(what);
      expect(markup).toContain('Also include');
      expect(markup).toContain('Mock P2');
      expect(markup).toContain('Unit quiz');
      // This document is not offered to itself.
      expect(markup).not.toMatch(/<span[^>]*title="Mock P1"/);
      expect(markup.indexOf('Also include')).toBeLessThan(markup.indexOf('Language'));
    }
  });

  it('is absent for the paper alone, other apps, PDF, or with nothing else saved', () => {
    expect(render('paper')).not.toContain('Also include');
    expect(render('apps')).not.toContain('Also include');
    expect(render('answerKey', 'pdf')).not.toContain('Also include');
    expect(render('answerKey', 'docx', [documents[0]])).not.toContain('Also include');
  });

  it('adds a search box only once the list is long', () => {
    expect(render('answerKey')).not.toContain('type="search"');
    const many = Array.from({ length: KEY_DOCUMENTS_SEARCH_FROM + 1 }, (_, i) => summary(`d${i}`, `Doc ${i}`));
    expect(render('answerKey', 'docx', many)).toContain('type="search"');
  });
});
