import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { renamedName } from './DocumentName';
import { bi, documentName, plain } from '@/model/text';
import { createWorksheetFrom } from '@/model/newWorksheet';
import { KNOWN_KEYS } from '@/model/migrations';
import { docxFileName } from '@/export/docx';
import { worksheetTitle } from '@/storage';

/**
 * What a document is **called** and what heading it **prints** are two questions.
 *
 * They were one field, and a rename therefore stamped the new name across the top of
 * page 1 — a filing decision silently editing the paper. `name` answers the first,
 * `title` the second, and the tests below hold them apart.
 */
describe('renaming a document', () => {
  const doc = (over: Partial<ReturnType<typeof createWorksheetFrom>> = {}) => ({
    ...createWorksheetFrom(),
    ...over,
  });

  it('never touches the printed title', () => {
    // The whole point. Renaming must leave the heading exactly as authored.
    const worksheet = doc({ title: bi('Trade and Growth', '貿易與增長'), name: 'DSE Mock 2026' });
    expect(plain(worksheet.title.en)).toBe('Trade and Growth');
    expect(worksheetTitle(worksheet)).toBe('DSE Mock 2026');
  });

  it('is listed in KNOWN_KEYS, or it saves and vanishes on reload', () => {
    expect(KNOWN_KEYS.has('name')).toBe(true);
  });

  it('falls back to the printed title for documents saved before `name` existed', () => {
    // Backward compatibility: absent `name` must behave exactly as it always did.
    const worksheet = doc({ title: bi('S5 Economics Test', '') });
    expect(worksheet.name).toBeUndefined();
    expect(worksheetTitle(worksheet)).toBe('S5 Economics Test');
  });

  it('names a document titled only in Chinese by its Chinese title', () => {
    // Such a document is *not* untitled — English-then-Chinese is the fallback order.
    expect(worksheetTitle(doc({ title: bi('', '經濟科測驗') }))).toBe('經濟科測驗');
  });

  it('reads "Untitled" only with no name and no title', () => {
    expect(worksheetTitle(doc({ title: bi('', '') }))).toBe('Untitled');
  });

  it('gives the file list and the .docx filename the same answer', () => {
    // Two copies of the fallback chain meant a renamed document downloaded under its
    // old title — the list and the download disagreeing about what the file is called.
    const worksheet = doc({ title: bi('Old Printed Heading', ''), name: 'DSE Mock 2026' });
    expect(worksheetTitle(worksheet)).toBe('DSE Mock 2026');
    expect(docxFileName(worksheet, { language: 'en', version: 'student' })).toBe(
      'DSE Mock 2026 (Student) (EN).docx',
    );
  });

  it('is reached through the one chain by every consumer that names a document', () => {
    // Four places name the document — the toolbar, the outline header, the file list
    // and the `.docx` filename. Each one that respells the fallback is a place that
    // keeps showing the *printed title* after a rename; two of them did.
    //
    // Asserted as "calls `documentName`" rather than "never spells `title.en ||
    // title.zh`", because that phrase has an unrelated legitimate use: `docProps` in
    // `export/docx/index.ts` carries the document's **printed title**, language-aware,
    // which is genuinely `title` and must not follow the file name.
    const sources = [
      'src/components/editor/Outline.tsx',
      'src/components/editor/DocumentName.tsx',
      'src/export/docx/index.ts',
      'src/storage/index.ts',
    ];
    // Either directly or through `worksheetTitle`, which is `documentName` plus the
    // file list's own fallback word.
    for (const file of sources) {
      const source = readFileSync(file, 'utf8');
      expect(source, `${file} does not use the shared chain`).toMatch(
        /documentName\(|worksheetTitle\(/,
      );
    }
  });

  it('shares one chain, and it prefers the name', () => {
    expect(documentName({ name: 'Called', title: bi('Printed', '') })).toBe('Called');
    expect(documentName({ title: bi('Printed', '') })).toBe('Printed');
    expect(documentName({ title: bi('', '') })).toBeUndefined();
    // Whitespace is not a name.
    expect(documentName({ name: '   ', title: bi('Printed', '') })).toBe('Printed');
  });
});

describe('what a typed name commits', () => {
  it('stores the trimmed text', () => {
    expect(renamedName('Old', '  Mock Paper 2  ')).toBe('Mock Paper 2');
  });

  it('stores nothing for a blank or whitespace-only name', () => {
    // A slip, not a request: committing would leave the document reading "Untitled".
    expect(renamedName('Paper 2', '')).toBeUndefined();
    expect(renamedName('Paper 2', '   ')).toBeUndefined();
  });

  it('stores nothing when the name is unchanged', () => {
    // Or tabbing through the toolbar spends an undo entry renaming nothing.
    expect(renamedName('Paper 2', 'Paper 2')).toBeUndefined();
    expect(renamedName('Paper 2', '  Paper 2  ')).toBeUndefined();
  });
});
