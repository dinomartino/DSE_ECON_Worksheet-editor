import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createMcqQuestion, createWorksheet } from '@/model/factories';
import type { Worksheet } from '@/model/types';
import { parseWorksheet, type WorksheetSummary } from '@/storage';
import { ExportDialog } from './ExportDialog';
import { KEY_DOCUMENTS_SEARCH_FROM, KeyDocumentsField, keyDocumentChoices } from './KeyDocumentsField';
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

  const OPEN = 'Add other documents’ answer keys to this file…';

  it('is folded away when the answer key is exported: a link, nothing ticked (k-0299 step C)', () => {
    for (const what of ['answerKey', 'both'] as const) {
      const markup = render(what);
      expect(markup).toContain(OPEN);
      expect(markup).not.toContain('Mock P2');
      expect(markup.indexOf(OPEN)).toBeLessThan(markup.indexOf('Language'));
    }
  });

  it('opened, offers the other saved documents, never this one', () => {
    const others = documents.filter((doc) => doc.id !== current.id);
    const markup = renderToStaticMarkup(
      <KeyDocumentsField documents={others} picked={[{ id: 'p2', title: 'Mock P2' }]} onChange={() => {}} currentTitle="Mock P1" />,
    );
    expect(markup).toContain('Also include');
    expect(markup).toContain('Mock P2');
    expect(markup).toContain('Unit quiz');
    expect(markup).not.toMatch(/<span[^>]*title="Mock P1"/);
  });

  it('is absent for the paper alone, other apps, PDF, or with nothing else saved', () => {
    expect(render('paper')).not.toContain(OPEN);
    expect(render('apps')).not.toContain(OPEN);
    expect(render('answerKey', 'pdf')).not.toContain(OPEN);
    expect(render('answerKey', 'docx', [documents[0]])).not.toContain(OPEN);
  });

  it('adds a search box only once the list is long', () => {
    const field = (list: WorksheetSummary[]) =>
      renderToStaticMarkup(
        <KeyDocumentsField documents={list} picked={[{ id: list[0].id, title: list[0].title }]} onChange={() => {}} currentTitle="Mock P1" />,
      );
    expect(field(documents.slice(1))).not.toContain('type="search"');
    const many = Array.from({ length: KEY_DOCUMENTS_SEARCH_FROM + 1 }, (_, i) => summary(`d${i}`, `Doc ${i}`));
    expect(field(many)).toContain('type="search"');
  });
});
