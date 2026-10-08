import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeLocalStorage } from '@/library/bankTestKit';
import type { FoundLibrary, LibraryChooseResult } from '@/platform/library';
import { closeNotice, resetNoticesForTest, runNoticeAction, useNoticeStore } from '@/store/notices';
import { FOUND_DONE_KEY, FOUND_NOTICE_ID, offerFoundFolder, resetFoundFolderForTest, withdrawFoundFolder } from './foundFolder';

/** The second computer's one-time offer of a library found in a cloud folder. */

const ui = { lang: 'en' as 'en' | 'zh-HK' };
vi.mock('@/i18n/language', async (original) => ({
  ...(await original<typeof import('@/i18n/language')>()),
  uiLanguage: () => ui.lang,
}));

const ONEDRIVE: FoundLibrary = { id: 'onedrive-2', provider: 'onedrive', label: 'OneDrive (School)' };
const notices = () => useNoticeStore.getState().notices;

function deps(found: FoundLibrary | null | Error = ONEDRIVE, picked: LibraryChooseResult | Error = { status: 'cancelled' }) {
  return {
    find: vi.fn(async () => {
      if (found instanceof Error) throw found;
      return found;
    }),
    choose: vi.fn(async () => {
      if (picked instanceof Error) throw picked;
      return picked;
    }),
    openSettings: vi.fn(),
  };
}

let storage: Storage;

function launch(): void {
  resetFoundFolderForTest();
  resetNoticesForTest();
}

beforeEach(() => {
  storage = fakeLocalStorage();
  vi.stubGlobal('window', { __TAURI_INTERNALS__: {}, localStorage: storage });
  launch();
});

afterEach(() => {
  vi.unstubAllGlobals();
  ui.lang = 'en';
});

function offer() {
  const notice = notices().find((n) => n.id === FOUND_NOTICE_ID);
  if (!notice) throw new Error('no offer');
  return notice;
}

describe('offerFoundFolder', () => {
  it('names the cloud folder once per launch, and its button opens the picker there through choose', async () => {
    const d = deps();
    await offerFoundFolder(d);
    await offerFoundFolder(d);
    expect(d.find).toHaveBeenCalledTimes(1);
    expect(notices()).toHaveLength(1);
    expect(offer()).toMatchObject({
      tone: 'info',
      body: 'Found your Econ Studio folder in OneDrive (School). Use it on this computer too?',
      dismissible: true,
    });
    expect(offer().actions).toHaveLength(1);
    runNoticeAction(FOUND_NOTICE_ID, offer().actions![0]);
    await vi.waitFor(() => expect(d.choose).toHaveBeenCalledWith('Choose a folder in your cloud drive', 'onedrive-2'));
    expect(notices()).toEqual([]);
    expect(storage.getItem(FOUND_DONE_KEY)).not.toBeNull();
  });

  it('closing it is remembered on this computer: the next launch offers nothing', async () => {
    await offerFoundFolder(deps());
    closeNotice(FOUND_NOTICE_ID);
    expect(storage.getItem(FOUND_DONE_KEY)).not.toBeNull();
    launch();
    const d = deps();
    await offerFoundFolder(d);
    expect(d.find).not.toHaveBeenCalled();
    expect(notices()).toEqual([]);
  });

  it('left alone, it comes back next launch', async () => {
    await offerFoundFolder(deps());
    launch();
    await offerFoundFolder(deps());
    expect(offer()).toBeDefined();
  });

  it('nothing found, or a lookup that fails, says nothing and is not remembered', async () => {
    await offerFoundFolder(deps(null));
    launch();
    await offerFoundFolder(deps(new Error('boom')));
    expect(notices()).toEqual([]);
    expect(storage.getItem(FOUND_DONE_KEY)).toBeNull();
  });

  it('a refused folder or a failed picker says so, with a way to Settings', async () => {
    const refused = deps(ONEDRIVE, { status: 'refused', reason: 'inside-library' });
    await offerFoundFolder(refused);
    runNoticeAction(FOUND_NOTICE_ID, offer().actions![0]);
    await vi.waitFor(() => expect(notices()).toHaveLength(1));
    expect(notices()[0]).toMatchObject({ tone: 'warning', title: "That folder can't be used" });
    notices()[0].actions![0].run();
    expect(refused.openSettings).toHaveBeenCalled();

    storage.clear();
    launch();
    await offerFoundFolder(deps(ONEDRIVE, new Error('boom')));
    runNoticeAction(FOUND_NOTICE_ID, offer().actions![0]);
    await vi.waitFor(() => expect(notices()).toHaveLength(1));
    expect(notices()[0]).toMatchObject({ tone: 'error', body: 'That did not work. Please try again.' });
  });

  it('a folder chosen in Settings takes the offer down', async () => {
    await offerFoundFolder(deps());
    withdrawFoundFolder();
    expect(notices()).toEqual([]);
  });

  it('does nothing on the web', async () => {
    vi.stubGlobal('window', { localStorage: storage });
    const d = deps();
    await offerFoundFolder(d);
    expect(d.find).not.toHaveBeenCalled();
    expect(notices()).toEqual([]);
  });

  it('speaks Hong Kong Chinese when the interface does', async () => {
    ui.lang = 'zh-HK';
    await offerFoundFolder(deps());
    expect(offer().body).toBe('在 OneDrive (School) 找到你的 Econ Studio 資料夾。要在這部電腦也使用嗎？');
    expect(offer().actions![0].label).toBe('選擇資料夾…');
  });
});
