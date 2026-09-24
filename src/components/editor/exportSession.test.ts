import { describe, expect, it, vi } from 'vitest';
import { deliverFiles, exportKinds, type ExportFile } from './exportSession';

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
