import { describe, expect, it, vi } from 'vitest';
import {
  deliverFiles,
  deliverWorksheetJson,
  exportKinds,
  pdfDestination,
  pdfVariant,
  type ExportFile,
} from './exportSession';

const file = (kind: ExportFile['kind']): ExportFile => ({
  kind,
  name: `${kind}.docx`,
  blob: new Blob([kind]),
});

describe('export delivery', () => {
  it('produces the paper, the key, or both — paper first', () => {
    expect(exportKinds('paper')).toEqual(['paper']);
    expect(exportKinds('answerKey')).toEqual(['answerKey']);
    expect(exportKinds('both')).toEqual(['paper', 'answerKey']);
    expect(exportKinds('apps')).toEqual(['apps']);
  });

  it('web: one download per click, the rest wait already built', async () => {
    const save = vi.fn(async () => undefined);
    const files = [file('paper'), file('answerKey')];

    const first = await deliverFiles(files, { desktop: false, save });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenLastCalledWith(files[0]);
    expect(first.pending).toEqual([files[1]]);
    expect(first.cancelled).toBe(false);

    // The second click hands over the same built blob: no rebuild before the download.
    const second = await deliverFiles(first.pending, { desktop: false, save });
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(files[1]);
    expect(second.pending).toEqual([]);
    expect(second.saved).toHaveLength(1);
  });

  it('web: an undefined path is still a delivered download', async () => {
    const run = await deliverFiles([file('answerKey')], {
      desktop: false,
      save: async () => undefined,
    });
    expect(run.saved).toHaveLength(1);
    expect(run.cancelled).toBe(false);
  });

  it('desktop: one save sheet per file, in order, in one go', async () => {
    const save = vi.fn(async (f: ExportFile) => `/Docs/${f.name}`);
    const run = await deliverFiles([file('paper'), file('answerKey')], { desktop: true, save });
    expect(save).toHaveBeenCalledTimes(2);
    expect(run.saved.map((s) => s.path)).toEqual(['/Docs/paper.docx', '/Docs/answerKey.docx']);
    expect(run.pending).toEqual([]);
  });

  it('desktop: a cancelled sheet stops the run', async () => {
    const save = vi.fn(async () => undefined);
    const run = await deliverFiles([file('paper'), file('answerKey')], { desktop: true, save });
    expect(save).toHaveBeenCalledTimes(1);
    expect(run.cancelled).toBe(true);
    expect(run.saved).toEqual([]);
  });
});

describe('.json and PDF choices', () => {
  it('.json: one save; a cancelled desktop sheet says nothing, the web always reports', async () => {
    const save = vi.fn(async () => '/Users/t/Documents/Econ Worksheets/Unit 3.worksheet.json');
    expect(await deliverWorksheetJson({ desktop: true, save })).toEqual({
      message: 'Exported .json',
      path: '/Users/t/Documents/Econ Worksheets/Unit 3.worksheet.json',
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(await deliverWorksheetJson({ desktop: true, save: async () => undefined })).toBeUndefined();
    expect(await deliverWorksheetJson({ desktop: false, save: async () => undefined })).toEqual({
      message: 'Exported .json',
      path: undefined,
    });
  });

  it('PDF: desktop asks where (a cancel keeps the dialog); the web asks nothing', async () => {
    const choose = vi.fn(async () => '/Users/t/Documents/Econ Worksheets/Unit 3 (Student) (EN).pdf');
    expect(await pdfDestination({ desktop: true, choose })).toEqual({
      file: '/Users/t/Documents/Econ Worksheets/Unit 3 (Student) (EN).pdf',
    });
    expect(await pdfDestination({ desktop: true, choose: async () => undefined })).toBeUndefined();
    const unused = vi.fn(async () => 'never');
    expect(await pdfDestination({ desktop: false, choose: unused })).toEqual({});
    expect(unused).not.toHaveBeenCalled();
  });

  it('PDF prints one version: the chosen one, else the one on screen, else the first', () => {
    expect(pdfVariant([], 'all', undefined)).toBeUndefined();
    expect(pdfVariant(['A', 'B', 'C'], 'B', 'C')).toBe('B');
    expect(pdfVariant(['A', 'B', 'C'], 'all', 'C')).toBe('C');
    expect(pdfVariant(['A', 'B', 'C'], 'all', undefined)).toBe('A');
    expect(pdfVariant(['A', 'B'], 'all', 'D')).toBe('A');
  });
});
