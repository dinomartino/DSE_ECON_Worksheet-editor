import { describe, expect, it, vi } from 'vitest';
import {
  deliverFiles,
  deliverWorksheetJson,
  exportKinds,
  pdfDestination,
  pdfVariant,
  planned,
  withPlace,
  type ExportFile,
  type ExportSaver,
  type PlannedFile,
  type SavedPlace,
} from './exportSession';

/** A file not built yet; `log` records when it is. */
const plan = (kind: ExportFile['kind'], log: string[] = []): PlannedFile => ({
  kind,
  name: `${kind}.docx`,
  build: async () => {
    log.push(`build ${kind}`);
    return new Blob([kind]);
  },
});

/**
 * A fake platform. `file`: what a single-file choice gives (`download` = no picker, the
 * anchor download; `cancel`; a picked name or path). `folder`: the same for a folder.
 */
function saver(
  options: {
    folders?: boolean;
    file?: 'download' | 'cancel' | SavedPlace;
    folder?: 'cancelled' | 'unavailable' | SavedPlace;
  },
  log: string[] = [],
) {
  const written: Array<{ name: string; text: Promise<string> }> = [];
  const result: ExportSaver = {
    folders: options.folders ?? false,
    chooseFile: async (chosen) => {
      log.push(`choose ${chosen.name}`);
      const place = options.file ?? 'download';
      if (place === 'cancel') return undefined;
      return {
        write: async (blob) => {
          written.push({ name: chosen.name, text: blob.text() });
          return place === 'download' ? {} : place;
        },
      };
    },
    chooseFolder: async () => {
      log.push('choose folder');
      const folder = options.folder ?? 'unavailable';
      if (typeof folder === 'string') return folder;
      return {
        ...folder,
        write: async (name, blob) => {
          written.push({ name, text: blob.text() });
          return folder.path ? { path: `${folder.path}/${name}`, name } : { name };
        },
      };
    },
  };
  return { saver: result, written, log };
}

describe('export delivery', () => {
  it('produces the paper, the key, or both — paper first', () => {
    expect(exportKinds('paper')).toEqual(['paper']);
    expect(exportKinds('answerKey')).toEqual(['answerKey']);
    expect(exportKinds('both')).toEqual(['paper', 'answerKey']);
    expect(exportKinds('apps')).toEqual(['apps']);
  });

  it('no picker (Firefox, Safari): one download per click, the rest wait already built', async () => {
    const { saver: web, written } = saver({});
    const first = await deliverFiles([plan('paper'), plan('answerKey')], web);
    expect(written.map((w) => w.name)).toEqual(['paper.docx']);
    expect(first.pending.map((f) => f.name)).toEqual(['answerKey.docx']);
    expect(first.cancelled).toBe(false);

    // The second click hands over the same built blob: no rebuild before the download.
    const built = first.pending[0].blob;
    const second = await deliverFiles(first.pending.map(planned), web);
    expect(written.map((w) => w.name)).toEqual(['paper.docx', 'answerKey.docx']);
    expect(second.saved[0].file.blob).toBe(built);
    expect(second.pending).toEqual([]);
  });

  it('no picker: a plain download is still delivered, with nowhere to name', async () => {
    const run = await deliverFiles([plan('answerKey')], saver({}).saver);
    expect(run.saved).toHaveLength(1);
    expect(run.saved[0].path).toBeUndefined();
    expect(run.saved[0].name).toBeUndefined();
    expect(run.cancelled).toBe(false);
  });

  it('one file: asks where before building it, then writes it there', async () => {
    const log: string[] = [];
    const { saver: picker, written } = saver({ file: { name: 'Mine.docx' } }, log);
    const run = await deliverFiles([plan('paper', log)], picker);
    expect(log).toEqual(['choose paper.docx', 'build paper']);
    expect(await written[0].text).toBe('paper');
    expect(run.saved[0].name).toBe('Mine.docx');
  });

  it('one file, picker cancelled: nothing is built or written', async () => {
    const log: string[] = [];
    const { saver: picker, written } = saver({ file: 'cancel' }, log);
    const run = await deliverFiles([plan('paper', log)], picker);
    expect(run).toEqual({ saved: [], pending: [], cancelled: true });
    expect(log).toEqual(['choose paper.docx']);
    expect(written).toEqual([]);
  });

  it('several files: one folder, asked for first, then every file into it', async () => {
    const log: string[] = [];
    const { saver: picker, written } = saver({ folders: true, folder: { name: 'Unit 3' } }, log);
    const run = await deliverFiles([plan('paper', log), plan('answerKey', log)], picker);
    expect(log).toEqual(['choose folder', 'build paper', 'build answerKey']);
    expect(written.map((w) => w.name)).toEqual(['paper.docx', 'answerKey.docx']);
    expect(run.pending).toEqual([]);
    expect(run.folder).toEqual({ name: 'Unit 3', path: undefined });
  });

  it('several files, desktop: the folder sheet, and a path for each file', async () => {
    const { saver: desktop } = saver({ folders: true, folder: { path: '/Docs/Out' } });
    const run = await deliverFiles([plan('paper'), plan('answerKey')], desktop);
    expect(run.saved.map((s) => s.path)).toEqual(['/Docs/Out/paper.docx', '/Docs/Out/answerKey.docx']);
  });

  it('several files, folder cancelled: nothing is built or written', async () => {
    const log: string[] = [];
    const { saver: picker, written } = saver({ folders: true, folder: 'cancelled' }, log);
    const run = await deliverFiles([plan('paper', log), plan('answerKey', log)], picker);
    expect(run.cancelled).toBe(true);
    expect(log).toEqual(['choose folder']);
    expect(written).toEqual([]);
  });

  it('several files, folder picker failed: back to one file per click', async () => {
    const { saver: picker, written } = saver({ folders: true, folder: 'unavailable' });
    const run = await deliverFiles([plan('paper'), plan('answerKey')], picker);
    expect(written.map((w) => w.name)).toEqual(['paper.docx']);
    expect(run.pending.map((f) => f.name)).toEqual(['answerKey.docx']);
  });

  it('the status line names the picked file or folder, never over a desktop path', () => {
    expect(withPlace('Exported .docx', [{ name: 'A.docx' }])).toBe('Exported “A.docx”');
    expect(withPlace('Exported 2 files', [{ name: 'a' }, { name: 'b' }], { name: 'Unit 3' })).toBe(
      'Exported 2 files to “Unit 3”',
    );
    expect(withPlace('Exported .docx', [{}])).toBe('Exported .docx');
    expect(withPlace('Exported .docx', [{ path: '/Docs/A.docx' }])).toBe('Exported .docx');
    expect(withPlace('Exported 2 files', [{ path: '/D/a' }, { path: '/D/b' }], { path: '/D' })).toBe(
      'Exported 2 files',
    );
  });
});

describe('.json and PDF choices', () => {
  it('.json: one save; a cancel says nothing, a download or a picked file reports', async () => {
    const save = vi.fn(async () => ({ path: '/Users/t/Documents/Econ Worksheets/Unit 3.worksheet.json' }));
    expect(await deliverWorksheetJson({ save })).toEqual({
      message: 'Exported .json',
      path: '/Users/t/Documents/Econ Worksheets/Unit 3.worksheet.json',
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(await deliverWorksheetJson({ save: async () => undefined })).toBeUndefined();
    expect(await deliverWorksheetJson({ save: async () => ({}) })).toEqual({ message: 'Exported .json' });
    expect(await deliverWorksheetJson({ save: async () => ({ name: 'U.json' }) })).toEqual({
      message: 'Exported .json',
      name: 'U.json',
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
