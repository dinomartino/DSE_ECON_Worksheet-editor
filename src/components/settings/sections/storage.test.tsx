import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { UiLanguageOverride } from '@/i18n/language';
import { settingsSections } from '@/settings/sections';
import type { SyncView } from '@/sync/syncView';
import { StorageSectionView, type StorageActions } from './storageSection/StorageSection';

const actions: StorageActions = {
  choose: async () => 'cancelled',
  stop: async () => {},
  syncNow: () => {},
  showFolder: async () => {},
};

const NONE: SyncView = { location: { deviceId: 'd', root: null, status: 'none' }, status: { state: 'stopped' }, attention: [] };
const ROOT = '/Users/teacher/Library/CloudStorage/OneDrive/Econ Studio';
const SYNCED: SyncView = {
  location: { deviceId: 'd', root: ROOT, status: 'ok' },
  status: { state: 'idle', lastSyncedAt: new Date(2026, 9, 7, 14, 32).getTime() },
  attention: [],
};

const html = (element: ReactElement, lang: 'en' | 'zh-HK' = 'en') =>
  renderToStaticMarkup(<UiLanguageOverride.Provider value={lang}>{element}</UiLanguageOverride.Provider>);

describe('Settings → Storage location', () => {
  it('is registered for the desktop only, after Language', async () => {
    await import('./index');
    expect(settingsSections({ desktop: false }).map((s) => s.id)).not.toContain('storage');
    const desktop = settingsSections({ desktop: true });
    expect(desktop.at(-1)).toMatchObject({ id: 'storage', label: { en: 'Storage location', zh: '儲存位置' } });
    expect(typeof (await desktop.at(-1)!.load()).default).toBe('function');
  });

  it('with no folder: what a folder is for, and Choose a folder…', () => {
    const en = html(<StorageSectionView view={NONE} actions={actions} />);
    expect(en).toContain('choose a folder inside OneDrive, Google Drive, iCloud Drive or Dropbox');
    expect(en).toContain('Choose a folder…');
    expect(en).not.toContain('Before you choose');
    expect(html(<StorageSectionView view={NONE} actions={actions} />, 'zh-HK')).toContain('選擇資料夾…');
  });

  it('the setup step: tips and this computer’s name before the picker', () => {
    const en = html(<StorageSectionView view={NONE} actions={actions} initialStep="setup" />);
    expect(en).toContain('Before you choose');
    expect(en).toContain('Install this update on your other computer too, then choose the same folder there.');
    expect(en).toContain('Nothing is lost, but you get two copies.');
    expect(en).toContain('This computer&#x27;s name');
    expect(en).toMatch(/<input[^>]*value="(Mac|Windows PC|Computer)"/);
    const zh = html(<StorageSectionView view={NONE} actions={actions} initialStep="setup" />, 'zh-HK');
    expect(zh).toContain('這部電腦的名稱');
    expect(zh).toContain('請在另一部電腦也安裝此更新');
  });

  it('with a folder: the path, synced at, Sync now, Show folder, Stop; no Needs attention when empty', () => {
    const en = html(<StorageSectionView view={SYNCED} actions={actions} />);
    expect(en).toContain(ROOT);
    expect(en).toContain('Synced at 14:32');
    for (const label of ['Sync now', 'Show folder', 'Stop syncing on this computer…']) expect(en).toContain(label);
    expect(en).not.toContain('Needs attention');
    expect(html(<StorageSectionView view={SYNCED} actions={actions} />, 'zh-HK')).toContain('已於 14:32 同步');
  });

  it('the folder away: says so, with a plain reason', () => {
    const away: SyncView = { ...SYNCED, status: { state: 'unavailable', reason: 'root-missing' } };
    const en = html(<StorageSectionView view={away} actions={actions} />);
    expect(en).toContain('Can&#x27;t reach the folder.');
    expect(en).toContain('Your cloud drive may be signed out or still starting.');
    expect(html(<StorageSectionView view={away} actions={actions} />, 'zh-HK')).toContain('無法連接資料夾。');
  });

  it('Needs attention lists copies, held files and errors in plain words', () => {
    const view: SyncView = {
      ...SYNCED,
      attention: [
        { kind: 'conflict', id: 'c', name: 'Mock (Home Mac, 5 Oct 14:32)' },
        { kind: 'unreadable', id: 'u', name: 'Quiz 3' },
        { kind: 'newer-build', id: 'n', name: 'Paper 2' },
        { kind: 'error', name: 'abc.worksheet.json' },
      ],
    };
    const en = html(<StorageSectionView view={view} actions={actions} />);
    expect(en).toContain('Needs attention');
    expect(en).toContain('Mock (Home Mac, 5 Oct 14:32)');
    expect(en).toContain('Changed on both computers, so both versions are kept.');
    expect(en).toContain('often because it is not downloaded');
    expect(en).toContain('Update the app to sync it.');
    expect(en).toContain('It will try again.');
    expect(html(<StorageSectionView view={view} actions={actions} />, 'zh-HK')).toContain('需要處理');
  });

  it('the stop confirm says the papers stay and the folder is left as it is', () => {
    const en = html(<StorageSectionView view={SYNCED} actions={actions} initialStep="confirm-stop" />);
    expect(en).toContain('Your worksheets stay on this computer, and the folder is left as it is.');
    expect(en).toContain('>Stop syncing<');
    expect(html(<StorageSectionView view={SYNCED} actions={actions} initialStep="confirm-stop" />, 'zh-HK')).toContain('資料夾亦會保持原狀');
  });
});
