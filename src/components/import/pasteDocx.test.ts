import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { exportDocxBuffer } from '@/export/docx';
import { createImageBlock } from '@/model/factories';
import { createWorksheetFrom } from '@/model/newWorksheet';
import { useWorksheetStore } from '@/store/worksheetStore';
import { imagePin, readPaste, review, withPin } from './pasteSession';

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

  it('carries a picture added in the review once, at its size, and never a figure slot', async () => {
    useWorksheetStore.getState().replaceWorksheet(createWorksheetFrom({ documentType: 'classroom', seedSample: false }));
    const plain = ['1.\tStudy the market for tea.', 'Figure 1', 'a)\tExplain the shift in demand.\t(3 marks)', '2.\tWhich diagram shows a rise in supply?', 'A.\tP', 'B.\tQ', 'C.\tR', 'D.\tS', 'Ans: B'].join('\n');
    const read = readPaste({ plain });
    const first = review(read, [], 'auto');
    expect(first.analysis.flags.map((f) => f.kind)).toContain('figureMissing');
    const graph = { ...createImageBlock(drawnGraph(), 420, 315), naturalWidthPx: 160, naturalHeightPx: 120 };
    const option = { ...createImageBlock(drawnGraph(), 400, 300), naturalWidthPx: 160, naturalHeightPx: 120 };
    const pins = [imagePin(1, graph, 'fig'), imagePin(5, option, 'opt')];
    const { batch } = review(read, pins, 'auto');
    const store = useWorksheetStore.getState();
    const report = store.insertQuestionBatch(batch.builds, { worksheetId: store.worksheet.id });
    if (!report.ok) throw new Error('refused');
    const worksheet = useWorksheetStore.getState().worksheet;

    const files: Record<string, Uint8Array> = {};
    for (const version of ['student', 'teacher'] as const) {
      const bytes = await exportDocxBuffer(worksheet, { language: 'en', version });
      files[version] = bytes;
      const zip = await JSZip.loadAsync(bytes);
      const document = await zip.file('word/document.xml')!.async('string');
      // One drawing per picture: the stem's at 420 px, the option's capped at option width.
      expect(document.match(/<w:drawing>/g)).toHaveLength(2);
      expect(document).toContain(`cx="${420 * 9525}" cy="${315 * 9525}"`);
      expect(document).toContain(`cx="${240 * 9525}" cy="${180 * 9525}"`);
      expect(Object.keys(zip.files).filter((f) => f.startsWith('word/media/'))).toHaveLength(2);
      if (version === 'student') expect(document).not.toMatch(/Answer: [A-D]/);
      else expect(document).toContain('Answer: B');
    }
    const dir = process.env.PASTE_DOCX_DIR;
    if (dir) {
      mkdirSync(dir, { recursive: true });
      for (const [version, bytes] of Object.entries(files)) writeFileSync(path.join(dir, `pasted-figures-${version}.docx`), bytes);
    }
  });
});

/** A small supply-and-demand sketch drawn pixel by pixel, as a PNG data URL (no real figure). */
function drawnGraph(): string {
  const w = 160;
  const h = 120;
  const rgb = new Uint8Array(w * h * 3).fill(255);
  const dot = (x: number, y: number, c: [number, number, number]) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    rgb.set(c, (y * w + x) * 3);
  };
  for (let x = 10; x < w - 5; x++) dot(x, h - 10, [0, 0, 0]);
  for (let y = 5; y < h - 10; y++) dot(10, y, [0, 0, 0]);
  for (let t = 0; t < 120; t++) {
    dot(20 + t, 15 + Math.round(t * 0.75), [31, 90, 200]);
    dot(20 + t, h - 20 - Math.round(t * 0.75), [200, 60, 40]);
  }
  const raw = new Uint8Array(h * (w * 3 + 1));
  for (let y = 0; y < h; y++) raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (w * 3 + 1) + 1);
  const chunk = (type: string, data: Uint8Array) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), Buffer.from(data)]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array())]);
  return `data:image/png;base64,${png.toString('base64')}`;
}
