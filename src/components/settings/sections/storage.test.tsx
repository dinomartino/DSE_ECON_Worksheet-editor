import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { resolveMessages } from '@/i18n/catalogue';
import { UiLanguageOverride } from '@/i18n/language';
import type { CloudFolder } from '@/platform/library';
import { settingsSections } from '@/settings/sections';
import type { SyncView } from '@/sync/syncView';
import { STORAGE_MESSAGES } from './storageSection/messages';
import { CloudFolders, refusalText, StorageSectionView, type StorageActions } from './storageSection/StorageSection';

const actions: StorageActions = {
  choose: async () => ({ status: 'cancelled' }),
  cloudFolders: async () => [],
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

  it('the setup step names the cloud folders found here, and what Google Drive needs', () => {
    const found: CloudFolder[] = [
      { id: 'onedrive', provider: 'onedrive', label: 'OneDrive', path: '/Users/t/Library/CloudStorage/OneDrive-School' },
      { id: 'icloud', provider: 'icloud', label: 'iCloud Drive', path: '/Users/t/Library/Mobile Documents/com~apple~CloudDocs' },
    ];
    const setup = (cloud: CloudFolder[] | null, lang: 'en' | 'zh-HK' = 'en') =>
      html(<StorageSectionView view={NONE} actions={actions} initialStep="setup" initialCloud={cloud} />, lang);
    const en = setup(found);
    expect(en).toContain('Cloud folders on this computer:');
    expect(en).toMatch(/<button[^>]*title="Choose a folder in OneDrive"[^>]*>OneDrive<\/button>/);
    expect(en).toMatch(/<button[^>]*title="Choose a folder in iCloud Drive"[^>]*>iCloud Drive<\/button>/);
    expect(en).toContain('install Google Drive for desktop and sign in; the Google Drive website alone gives no folder.');
    const zh = setup(found, 'zh-HK');
    expect(zh).toContain('這部電腦上的雲端資料夾：');
    expect(zh).toContain('這部電腦未有 Google Drive。');

    const withDrive = setup([...found, { id: 'google-drive', provider: 'google-drive', label: 'Google Drive', path: '/p' }]);
    expect(withDrive).toContain('>Google Drive</button>');
    expect(withDrive).not.toContain('Google Drive for desktop');

    expect(setup([])).toContain('No cloud folder was found on this computer.');
    expect(setup([])).not.toContain('Cloud folders on this computer');
    // Detection failed (or not back yet): nothing extra, the plain picker stays.
    const failed = setup(null);
    for (const text of ['Cloud folders', 'No cloud folder', 'Google Drive for desktop']) expect(failed).not.toContain(text);
    expect(failed).toContain('Choose folder…');
  });

  it('a cloud folder button opens the picker there', () => {
    const opened: string[] = [];
    const view = CloudFolders({
      folders: [{ id: 'onedrive-2', provider: 'onedrive', label: 'OneDrive (School)', path: '/p' }],
      disabled: false,
      onOpen: (id) => opened.push(id),
      m: resolveMessages(STORAGE_MESSAGES, 'en'),
    });
    const buttons: ReactElement<{ onClick(): void }>[] = [];
    const walk = (node: unknown) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach(walk);
      const element = node as ReactElement<{ children?: unknown; onClick?: () => void }>;
      if (element.props?.onClick) buttons.push(element as ReactElement<{ onClick(): void }>);
      walk(element.props?.children);
    };
    walk(view);
    expect(buttons).toHaveLength(1);
    buttons[0].props.onClick();
    expect(opened).toEqual(['onedrive-2']);
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

  it('a failed folder action is a notice, not a line left in the panel', () => {
    const source = readFileSync(path.join(__dirname, 'storageSection', 'StorageSection.tsx'), 'utf8');
    expect(source).toContain("notify({ id: 'storage-error', tone: 'error', body: m.failed })");
    expect(source).toContain("notices.dismiss('storage-error')");
    expect(source).not.toMatch(/role="alert"/);
    expect(html(<StorageSectionView view={SYNCED} actions={actions} />)).not.toContain('role="alert"');
  });

  it('the stop confirm says the papers stay and the folder is left as it is', () => {
    const en = html(<StorageSectionView view={SYNCED} actions={actions} initialStep="confirm-stop" />);
    expect(en).toContain('Your worksheets stay on this computer, and the folder is left as it is.');
    expect(en).toContain('>Stop syncing<');
    expect(html(<StorageSectionView view={SYNCED} actions={actions} initialStep="confirm-stop" />, 'zh-HK')).toContain('資料夾亦會保持原狀');
  });

  it('says why a folder was refused, every reason in both languages', () => {
    const reasons = ['app-data', 'home', 'drive-root', 'inside-library'] as const;
    for (const lang of ['en', 'zh-HK'] as const) {
      const m = resolveMessages(STORAGE_MESSAGES, lang);
      const texts = reasons.map((reason) => refusalText(m, reason));
      expect(new Set(texts).size).toBe(reasons.length);
      for (const text of texts) expect(text).not.toMatch(/—|^$/);
    }
    expect(refusalText(resolveMessages(STORAGE_MESSAGES, 'en'), 'drive-root')).toBe('It is a whole drive. Choose a folder inside it.');
  });
});
