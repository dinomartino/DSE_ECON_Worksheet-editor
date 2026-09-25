/**
 * The web path must stay exactly what shipped: `isDesktop()` is false anywhere but the
 * Tauri webview, and `saveFile` then falls through to the anchor download. If this ever
 * flips, a browser build would try to import `@tauri-apps/*` and fail at runtime.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  chooseSavePath,
  DOCX_FILTERS,
  exportsFolder,
  isDesktop,
  JSON_FILTERS,
  LAST_FOLDER_KEY,
  ZIP_FILTERS,
  openExternal,
  openFolder,
  pickFile,
  pickTextFile,
  PDF_FILTERS,
  revealFile,
  revealLabel,
  saveFile,
  savePdf,
} from '.';
import { pickWorksheetFile, savedWorksheetPath, savedWorksheetsFolder } from '@/storage';

const downloads: Array<{ fileName: string; text: string }> = [];

vi.mock('@/storage/download', () => ({
  triggerDownload: async (blob: Blob, fileName: string) => {
    downloads.push({ fileName, text: await blob.text() });
  },
}));

afterEach(() => {
  downloads.length = 0;
  vi.unstubAllGlobals();
});

describe('isDesktop', () => {
  it('is false with no window at all', () => {
    expect(isDesktop()).toBe(false);
  });

  it('is false in a plain browser window', () => {
    vi.stubGlobal('window', {});
    expect(isDesktop()).toBe(false);
  });

  it('is true only when the shell has injected its internals', () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    expect(isDesktop()).toBe(true);
  });
});

describe('saveFile on the web', () => {
  it('downloads the text and returns no path', async () => {
    const path = await saveFile('{"a":1}', 'doc.worksheet.json');
    // Web has no destination to report — the browser chose it.
    expect(path).toBeUndefined();
    // triggerDownload's blob read is async; let it land.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(downloads).toEqual([{ fileName: 'doc.worksheet.json', text: '{"a":1}' }]);
  });

  it('passes a Blob through unchanged', async () => {
    await saveFile(new Blob(['zip-bytes']), 'paper.docx');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(downloads[0]).toEqual({ fileName: 'paper.docx', text: 'zip-bytes' });
  });

  it('wraps raw bytes', async () => {
    await saveFile(new TextEncoder().encode('hi'), 'x.docx');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(downloads[0]?.text).toBe('hi');
  });
});

// ---- Desktop file locations --------------------------------------------------------
// The Tauri modules are faked; `window.__TAURI_INTERNALS__` flips `isDesktop()`.

const tauri = {
  saveCalls: [] as Array<{ defaultPath?: string }>,
  openCalls: [] as Array<{ defaultPath?: string; multiple?: boolean; directory?: boolean }>,
  saveResult: null as string | null,
  openResult: null as string | null,
  mkdirFails: false,
  mkdirs: [] as string[],
  written: new Map<string, string>(),
  readable: new Map<string, string>(),
  opened: [] as string[],
  revealed: [] as string[],
  openPathFails: false,
  invoked: [] as Array<{ command: string; args: Record<string, unknown> }>,
  invokeFails: undefined as string | undefined,
};

vi.mock('@tauri-apps/api/path', () => ({
  documentDir: async () => '/Users/t/Documents',
  appDataDir: async () => '/Users/t/Library/Application Support/app',
  join: async (...parts: string[]) => parts.join('/'),
  dirname: async (path: string) => path.slice(0, path.lastIndexOf('/')),
  basename: async (path: string) => path.slice(path.lastIndexOf('/') + 1),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: async (options: { defaultPath?: string }) => {
    tauri.saveCalls.push(options);
    return tauri.saveResult;
  },
  open: async (options: { defaultPath?: string }) => {
    tauri.openCalls.push(options);
    return tauri.openResult;
  },
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  mkdir: async (path: string) => {
    if (tauri.mkdirFails) throw new Error('forbidden path');
    tauri.mkdirs.push(path);
  },
  writeTextFile: async (path: string, text: string) => {
    tauri.written.set(path, text);
  },
  writeFile: async (path: string, bytes: Uint8Array) => {
    tauri.written.set(path, new TextDecoder().decode(bytes));
  },
  readTextFile: async (path: string) => {
    const text = tauri.readable.get(path);
    if (text === undefined) throw new Error(`ENOENT ${path}`);
    return text;
  },
  readFile: async (path: string) => {
    const text = tauri.readable.get(path);
    if (text === undefined) throw new Error(`ENOENT ${path}`);
    return new TextEncoder().encode(text);
  },
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (command: string, args: Record<string, unknown>) => {
    tauri.invoked.push({ command, args });
    if (tauri.invokeFails) throw tauri.invokeFails;
  },
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
  openPath: async (path: string) => {
    if (tauri.openPathFails) throw new Error('not allowed');
    tauri.opened.push(path);
  },
  revealItemInDir: async (path: string) => {
    tauri.revealed.push(path);
  },
  openUrl: async (url: string) => {
    tauri.opened.push(url);
  },
}));

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => void map.delete(key),
    setItem: (key, value) => void map.set(key, String(value)),
  };
}

function desktop(storage: Storage | 'throws' = memoryStorage()) {
  const win: Record<string, unknown> = { __TAURI_INTERNALS__: {} };
  if (storage === 'throws') {
    Object.defineProperty(win, 'localStorage', {
      get() {
        throw new Error('SecurityError');
      },
    });
  } else {
    win.localStorage = storage;
  }
  vi.stubGlobal('window', win);
  return storage;
}

beforeEach(() => {
  tauri.saveCalls.length = 0;
  tauri.openCalls.length = 0;
  tauri.saveResult = null;
  tauri.openResult = null;
  tauri.mkdirFails = false;
  tauri.mkdirs.length = 0;
  tauri.written.clear();
  tauri.readable.clear();
  tauri.opened.length = 0;
  tauri.revealed.length = 0;
  tauri.openPathFails = false;
  tauri.invoked.length = 0;
  tauri.invokeFails = undefined;
});

const DEFAULT = '/Users/t/Documents/Econ Worksheets';

describe('the last-folder key', () => {
  it('is not a document key, so the web store never lists or clears it', () => {
    expect(LAST_FOLDER_KEY.startsWith('econ-worksheet:')).toBe(false);
    expect(LAST_FOLDER_KEY).not.toBe('econ-worksheet-index');
  });
});

describe('web fallbacks', () => {
  it('pickTextFile returns undefined', async () => {
    expect(await pickTextFile(JSON_FILTERS)).toBeUndefined();
  });

  it('exportsFolder and the stored paths are undefined', async () => {
    expect(await exportsFolder()).toBeUndefined();
    expect(await savedWorksheetPath('abc')).toBeUndefined();
    expect(await savedWorksheetsFolder()).toBeUndefined();
  });

  it('revealFile and openFolder are no-ops', async () => {
    await revealFile('/x/y.docx');
    await openFolder('/x');
    expect(tauri.revealed).toEqual([]);
    expect(tauri.opened).toEqual([]);
  });

  it('pickWorksheetFile returns undefined', async () => {
    expect(await pickWorksheetFile()).toBeUndefined();
  });
});

describe('openExternal', () => {
  it('opens https in a new tab and mailto in place on the web', async () => {
    const win = { open: vi.fn(), location: { href: '' } };
    vi.stubGlobal('window', win);
    await openExternal('https://github.com/x');
    expect(win.open).toHaveBeenCalledWith('https://github.com/x', '_blank', 'noopener');
    await openExternal('mailto:a@b.c?subject=x');
    expect(win.location.href).toBe('mailto:a@b.c?subject=x');
    expect(tauri.opened).toEqual([]);
  });

  it('goes through the opener on desktop', async () => {
    desktop();
    await openExternal('https://github.com/x');
    expect(tauri.opened).toEqual(['https://github.com/x']);
  });

  it('refuses any other scheme', async () => {
    desktop();
    await expect(openExternal('file:///etc/passwd')).rejects.toThrow();
    expect(tauri.opened).toEqual([]);
  });
});

describe('revealLabel', () => {
  it('is safe with no navigator', () => {
    vi.stubGlobal('navigator', undefined);
    expect(revealLabel()).toBe('Show in folder');
  });

  it('names Finder on macOS and Explorer on Windows', () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel', userAgent: 'Mozilla/5.0 (Macintosh)' });
    expect(revealLabel()).toBe('Show in Finder');
    vi.stubGlobal('navigator', { platform: 'Win32', userAgent: 'Mozilla/5.0 (Windows NT 10.0)' });
    expect(revealLabel()).toBe('Show in Explorer');
    vi.stubGlobal('navigator', { platform: 'Linux x86_64', userAgent: 'X11; Linux' });
    expect(revealLabel()).toBe('Show in folder');
  });
});

describe('saveFile on desktop', () => {
  it('starts in ~/Documents/Econ Worksheets, creating it', async () => {
    desktop();
    tauri.saveResult = `${DEFAULT}/paper.docx`;
    const path = await saveFile('bytes', 'paper.docx', DOCX_FILTERS);
    expect(tauri.mkdirs).toEqual([DEFAULT]);
    expect(tauri.saveCalls[0]?.defaultPath).toBe(`${DEFAULT}/paper.docx`);
    expect(path).toBe(`${DEFAULT}/paper.docx`);
    expect(tauri.written.get(path!)).toBe('bytes');
  });

  it('remembers the chosen folder and starts there next time', async () => {
    const storage = desktop();
    tauri.saveResult = '/Users/t/Desktop/a.docx';
    await saveFile('x', 'a.docx');
    expect(storage !== 'throws' && storage.getItem(LAST_FOLDER_KEY)).toBe('/Users/t/Desktop');

    tauri.saveResult = '/Users/t/Desktop/b.docx';
    await saveFile('x', 'b.docx');
    expect(tauri.saveCalls[1]?.defaultPath).toBe('/Users/t/Desktop/b.docx');
  });

  it('falls back to the bare name when the default folder cannot be made', async () => {
    desktop();
    tauri.mkdirFails = true;
    tauri.saveResult = '/somewhere/c.docx';
    expect(await saveFile('x', 'c.docx')).toBe('/somewhere/c.docx');
    expect(tauri.saveCalls[0]?.defaultPath).toBe('c.docx');
  });

  it('still exports when localStorage is unavailable', async () => {
    desktop('throws');
    tauri.saveResult = `${DEFAULT}/d.docx`;
    expect(await saveFile('x', 'd.docx')).toBe(`${DEFAULT}/d.docx`);
    expect(tauri.saveCalls[0]?.defaultPath).toBe(`${DEFAULT}/d.docx`);
  });

  it('returns undefined and remembers nothing when cancelled', async () => {
    const storage = desktop();
    expect(await saveFile('x', 'e.docx')).toBeUndefined();
    expect(storage !== 'throws' && storage.getItem(LAST_FOLDER_KEY)).toBe(null);
  });
});

describe('PDF to a file', () => {
  const A4 = { widthPt: 595.3, heightPt: 841.9, landscape: false, pages: 4 };

  it('chooseSavePath asks in the start folder with the PDF filter, writes nothing', async () => {
    const storage = desktop();
    tauri.saveResult = '/Users/t/Desktop/p.pdf';
    expect(await chooseSavePath('p.pdf', PDF_FILTERS)).toBe('/Users/t/Desktop/p.pdf');
    expect(tauri.saveCalls[0]).toMatchObject({ defaultPath: `${DEFAULT}/p.pdf`, filters: PDF_FILTERS });
    expect(tauri.written.size).toBe(0);
    expect(storage !== 'throws' && storage.getItem(LAST_FOLDER_KEY)).toBe('/Users/t/Desktop');
  });

  it('chooseSavePath is undefined when cancelled, and always on the web', async () => {
    desktop();
    expect(await chooseSavePath('p.pdf', PDF_FILTERS)).toBeUndefined();
    vi.unstubAllGlobals();
    expect(await chooseSavePath('p.pdf', PDF_FILTERS)).toBeUndefined();
    expect(tauri.saveCalls).toHaveLength(1);
  });

  it('savePdf invokes the shell command with the path and page box', async () => {
    desktop();
    await savePdf('/Users/t/Desktop/p.pdf', A4);
    expect(tauri.invoked).toEqual([
      {
        command: 'print_to_pdf',
        args: { path: '/Users/t/Desktop/p.pdf', widthPt: 595.3, heightPt: 841.9, landscape: false, pages: 4 },
      },
    ]);
  });

  it('savePdf rejects when the command does, and on the web without calling it', async () => {
    desktop();
    tauri.invokeFails = 'Command print_to_pdf not allowed';
    await expect(savePdf('/x/p.pdf', A4)).rejects.toBe('Command print_to_pdf not allowed');
    vi.unstubAllGlobals();
    await expect(savePdf('/x/p.pdf', A4)).rejects.toThrow('desktop app');
    expect(tauri.invoked).toHaveLength(1);
  });
});

describe('pickTextFile on desktop', () => {
  it('opens in the start folder, reads the file and remembers its folder', async () => {
    const storage = desktop();
    tauri.openResult = '/Users/t/Downloads/q.worksheet.json';
    tauri.readable.set(tauri.openResult, '{"hello":1}');
    const picked = await pickTextFile(JSON_FILTERS);
    expect(tauri.openCalls[0]).toMatchObject({
      multiple: false,
      directory: false,
      defaultPath: DEFAULT,
    });
    expect(picked).toEqual({
      name: 'q.worksheet.json',
      path: '/Users/t/Downloads/q.worksheet.json',
      text: '{"hello":1}',
    });
    expect(storage !== 'throws' && storage.getItem(LAST_FOLDER_KEY)).toBe('/Users/t/Downloads');
    expect(await exportsFolder()).toBe('/Users/t/Downloads');
  });

  it('returns undefined when cancelled', async () => {
    desktop();
    expect(await pickTextFile(JSON_FILTERS)).toBeUndefined();
  });

  it('pickWorksheetFile throws on a file that is not a worksheet', async () => {
    desktop();
    tauri.openResult = '/x/bad.json';
    tauri.readable.set('/x/bad.json', 'not json');
    await expect(pickWorksheetFile()).rejects.toThrow();
  });
});

describe('pickFile on desktop', () => {
  it('reads the picked file as bytes and remembers its folder', async () => {
    const storage = desktop();
    tauri.openResult = '/Users/t/Desktop/backup.zip';
    tauri.readable.set(tauri.openResult, 'PK');
    const picked = await pickFile(ZIP_FILTERS);
    expect(tauri.openCalls[0]).toMatchObject({ multiple: false, defaultPath: DEFAULT });
    expect(picked?.name).toBe('backup.zip');
    expect(new TextDecoder().decode(picked?.bytes)).toBe('PK');
    expect(storage !== 'throws' && storage.getItem(LAST_FOLDER_KEY)).toBe('/Users/t/Desktop');
  });

  it('returns undefined when cancelled, and always on the web', async () => {
    desktop();
    expect(await pickFile(ZIP_FILTERS)).toBeUndefined();
    vi.unstubAllGlobals();
    expect(await pickFile(ZIP_FILTERS)).toBeUndefined();
  });
});

describe('folders on desktop', () => {
  it('exportsFolder is the default folder until something is saved', async () => {
    desktop();
    expect(await exportsFolder()).toBe(DEFAULT);
  });

  it('openFolder opens, and falls back to reveal outside the opener scope', async () => {
    desktop();
    await openFolder('/Users/t/Documents/Econ Worksheets');
    expect(tauri.opened).toEqual(['/Users/t/Documents/Econ Worksheets']);
    tauri.openPathFails = true;
    await openFolder('/Volumes/USB');
    expect(tauri.revealed).toEqual(['/Volumes/USB']);
  });

  it('the stored document path is under $APPDATA/worksheets', async () => {
    desktop();
    const appData = '/Users/t/Library/Application Support/app';
    expect(await savedWorksheetsFolder()).toBe(`${appData}/worksheets`);
    expect(await savedWorksheetPath('abc')).toBe(`${appData}/worksheets/abc.worksheet.json`);
  });
});
