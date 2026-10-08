import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { exportDocxBuffer } from '@/export/docx';
import { createWorksheetFrom } from '@/model/newWorksheet';
import { useWorksheetStore } from '@/store/worksheetStore';
import { readPaste, review, withPin } from './pasteSession';

/**
 * The .docx is the load-bearing output: a pasted paper, inserted the way the dialog
 * inserts it, exports a valid file whose student copy carries no answer, while the
 * teacher copy does. `PASTE_DOCX_DIR` keeps the files for opening by hand.
 */

const fixture = (name: string) => readFileSync(path.resolve(__dirname, '../../import/fixtures', name), 'utf8');

describe('a pasted paper exports to .docx', () => {
  it('is valid and leak-free', async () => {
    useWorksheetStore.getState().replaceWorksheet(createWorksheetFrom({ documentType: 'classroom', seedSample: false }));
    // Answers from three routes: a starred option, a key, and a click (a pin).
    const plain = `${fixture('13-inline-answers.txt')}\n\nPart B\n\n${fixture('03-word-plain-structured.txt')}`;
    const read = readPaste({ plain });
    const first = review(read, [], 'auto');
    const unanswered = first.analysis.outline.questions.findIndex((q) => q.kind === 'mc' && !q.answer);
    const pins = unanswered >= 0 ? withPin([], { kind: 'answer', line: first.analysis.outline.questions[unanswered].start, index: 3 }, first.analysis) : [];
    const { batch, analysis } = review(read, pins, 'auto');
    const store = useWorksheetStore.getState();
    const report = store.insertQuestionBatch(batch.builds, { worksheetId: store.worksheet.id, ...(batch.lead ? { lead: batch.lead } : {}) });
    if (!report.ok) throw new Error('refused');
    const worksheet = useWorksheetStore.getState().worksheet;
    const answers = analysis.outline.questions.filter((q) => q.kind === 'mc').map((q) => String.fromCharCode(65 + (q.answer?.index ?? 0)));

    const files: Record<string, Uint8Array> = {};
    for (const version of ['student', 'teacher'] as const) {
      const bytes = await exportDocxBuffer(worksheet, { language: 'en', version });
      files[version] = bytes;
      const zip = await JSZip.loadAsync(bytes);
      for (const part of ['[Content_Types].xml', 'word/document.xml', 'word/styles.xml', 'word/numbering.xml']) expect(zip.file(part), part).not.toBeNull();
      const document = await zip.file('word/document.xml')!.async('string');
      expect(document).toContain('Prices guide the allocation of resources.');
      expect(document).toContain('marginal product of the third worker');
      // The star that marked the answer never prints.
      expect(document).not.toContain('*C.');
      for (const name of Object.keys(zip.files).filter((f) => f.endsWith('.xml'))) {
        const xml = await zip.file(name)!.async('string');
        if (version === 'student') expect(xml, name).not.toMatch(/Answer: [A-D]/);
      }
      if (version === 'teacher') for (const letter of answers) expect(document).toContain(`Answer: ${letter}`);
    }
    const dir = process.env.PASTE_DOCX_DIR;
    if (dir) {
      mkdirSync(dir, { recursive: true });
      for (const [version, bytes] of Object.entries(files)) writeFileSync(path.join(dir, `pasted-${version}.docx`), bytes);
    }
  });
});
