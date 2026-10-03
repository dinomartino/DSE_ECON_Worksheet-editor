import JSZip from 'jszip';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CSV_FILTERS, pickFile, saveFile } from '@/platform';
import { appSettings } from '@/settings/store';
import { decodeTermsCsv, parseTermsCsv, termsToCsv } from '@/settings/termsCsv';
import { TERM_SETTINGS } from '@/settings/termPreferences';
import { buildBackup, readBackup, TERMS_ENTRY } from '@/storage/backup';
import { backupTermsCsv, restoreTermsCsv } from './termsBackup';
import { exportTermsCsv, pickTermsCsv, readTermsFile, TERMS_FILE_NAME } from './termsFiles';
import { EMPTY_PREFERENCES, full } from './termRows';

/** The desktop shell's paths with the platform faked: the save and open sheets, and a backup. */

vi.mock('@/platform', async (actual) => ({
  ...(await actual<object>()),
  saveFile: vi.fn(async () => ({ path: '/Users/t/Documents/Econ Worksheets/translation-terms.csv' })),
  pickFile: vi.fn(async () => undefined),
}));

class FakeStorage {
  data = new Map<string, string>();
  getItem = (key: string) => this.data.get(key) ?? null;
  setItem = (key: string, value: string) => void this.data.set(key, value);
  removeItem = (key: string) => void this.data.delete(key);
}

const MINE = { ...EMPTY_PREFERENCES, choices: { 'deadweight loss': '無謂損失' }, terms: { t1: { en: 'carbon tax', zh: ['碳稅'] } } };
const utf8 = (text: string) => new TextEncoder().encode(text);
/** 碳稅 in Big5, the way Excel on a Hong Kong Windows saves a plain CSV. */
const BIG5_ROW = new Uint8Array([...utf8('english,chinese\r\ncarbon tax,'), 0xba, 0xd2, 0xb5, 0x7c, 0x0d, 0x0a]);

beforeAll(() => {
  vi.stubGlobal('window', { localStorage: new FakeStorage(), sessionStorage: new FakeStorage(), addEventListener: () => {}, removeEventListener: () => {} });
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => appSettings.write(TERM_SETTINGS, EMPTY_PREFERENCES));

describe('decodeTermsCsv', () => {
  it('reads our UTF-8 with its BOM, and a Big5 CSV from Excel', () => {
    const csv = termsToCsv(MINE);
    expect(parseTermsCsv(decodeTermsCsv(utf8(csv)))).toEqual(parseTermsCsv(csv));
    expect(decodeTermsCsv(BIG5_ROW)).toBe('english,chinese\r\ncarbon tax,碳稅\r\n');
    expect(decodeTermsCsv(utf8('english\r\n'))).toBe('english\r\n');
  });
});

describe('Export and Import on desktop', () => {
  it('Export saves the CSV through the save sheet, named and filtered as CSV', async () => {
    const saved = await exportTermsCsv(MINE);
    expect(saved?.path).toMatch(/translation-terms\.csv$/);
    expect(vi.mocked(saveFile)).toHaveBeenCalledWith(termsToCsv(MINE), TERMS_FILE_NAME, CSV_FILTERS);
  });

  it('Import reads the picked file as bytes, so a Big5 file keeps its Chinese; a cancel is undefined', async () => {
    vi.mocked(pickFile).mockResolvedValueOnce({ name: 'dept.csv', path: '/x/dept.csv', bytes: BIG5_ROW });
    const picked = await pickTermsCsv();
    expect(vi.mocked(pickFile)).toHaveBeenCalledWith(CSV_FILTERS);
    expect(picked?.name).toBe('dept.csv');
    const parsed = parseTermsCsv(picked!.text);
    expect('rows' in parsed && parsed.rows[0].chinese).toEqual(['碳稅']);
    expect(await pickTermsCsv()).toBeUndefined();
  });

  it('the web file input decodes the same way', async () => {
    const file = new File([BIG5_ROW], 'dept.csv', { type: 'text/csv' });
    expect(await readTermsFile(file)).toEqual({ name: 'dept.csv', text: 'english,chinese\r\ncarbon tax,碳稅\r\n' });
  });
});

describe('Translation terms in a backup', () => {
  it('backs up only when the teacher has terms of their own, and a restore merges them back', async () => {
    expect(backupTermsCsv()).toBeUndefined();
    appSettings.write(TERM_SETTINGS, MINE);
    const csv = backupTermsCsv()!;
    expect(csv).toBe(termsToCsv(full(MINE)));
    appSettings.write(TERM_SETTINGS, EMPTY_PREFERENCES);
    expect(await restoreTermsCsv(csv)).toBe(2);
    const restored = full(appSettings.read(TERM_SETTINGS));
    expect(restored.choices).toEqual({ 'deadweight loss': '無謂損失' });
    expect(Object.values(restored.terms).map((t) => [t.en, t.zh])).toEqual([['carbon tax', ['碳稅']]]);
    // Nothing new the second time; a broken CSV adds nothing and never throws.
    expect(await restoreTermsCsv(csv)).toBe(0);
    expect(await restoreTermsCsv('not,a,terms,file')).toBe(0);
  });

  it('finds the terms in a backup that was unzipped and zipped again (a folder inside)', async () => {
    const csv = termsToCsv(MINE);
    const original = await JSZip.loadAsync(await buildBackup([], '2026-10-02T00:00:00.000Z', undefined, undefined, [], csv));
    const rezipped = new JSZip();
    for (const entry of Object.values(original.files)) {
      if (!entry.dir) rezipped.file(`Econ Studio backup/${entry.name}`, await entry.async('uint8array'));
    }
    rezipped.file(`__MACOSX/Econ Studio backup/${TERMS_ENTRY}`, 'resource fork');
    const read = await readBackup(await rezipped.generateAsync({ type: 'uint8array' }));
    expect(read.terms).toBe(csv);
  });
});
