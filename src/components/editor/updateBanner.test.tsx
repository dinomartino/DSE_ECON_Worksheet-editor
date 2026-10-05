import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const checkForUpdate = vi.fn();
vi.mock('@/desktop/updater', () => ({
  isDesktop: () => false,
  currentVersion: async () => null,
  checkForUpdate,
}));

const { UpdateBanner, updateNotice, VersionLine } = await import('./UpdateBanner');
const { APP_STACK_CLASS, NoticeStackView } = await import('@/components/ui/NoticeLayer');
const { notify, resetNoticesForTest, useNoticeStore } = await import('@/store/notices');

/**
 * The banner must be invisible everywhere it is not wanted — on the web, and in print.
 * There is no DOM in this suite, so the effect-driven wrapper is checked for its
 * first paint (nothing) and the notice it raises is drawn as the app's stack draws it.
 */

const handlers = { onInstall: () => {}, onDismiss: () => {} };
const drawn = (state: 'offer' | 'installing' | 'failed') => {
  resetNoticesForTest();
  notify(updateNotice('1.4.0', state, 'en', handlers));
  return renderToStaticMarkup(<NoticeStackView notices={useNoticeStore.getState().notices} className={APP_STACK_CLASS} />);
};

describe('UpdateBanner', () => {
  it('renders nothing before an update is known — the web never gets one', () => {
    checkForUpdate.mockResolvedValue({ kind: 'none' });
    expect(renderToStaticMarkup(<UpdateBanner />)).toBe('');
  });

  it('shows no version line on the web', () => {
    expect(renderToStaticMarkup(<VersionLine />)).toBe('');
  });

  it('offers the version, the two actions, and hides itself from print', () => {
    const markup = drawn('offer');

    expect(markup).toContain('Version 1.4.0 is ready');
    expect(markup).toContain('Restart now');
    expect(markup).toContain('Later');
    expect(markup).toContain('data-print-hide');
  });

  it('floats in the notice stack rather than taking a row of the page', () => {
    expect(drawn('offer')).toMatch(/class="[^"]*\bfixed\b/);
  });

  it('reports progress and disables the action while installing', () => {
    const markup = drawn('installing');

    expect(markup).toContain('Installing version 1.4.0');
    expect(markup).toContain('disabled');
  });

  it('offers a retry when the install failed', () => {
    const markup = drawn('failed');

    expect(markup).toContain('could not be installed');
    expect(markup).toContain('Try again');
  });

  it('closing it is "Later", and every state shares one id so it never stacks twice', () => {
    const notice = updateNotice('1.4.0', 'offer', 'en', handlers);
    expect(notice.onDismiss).toBe(handlers.onDismiss);
    expect(notice.id).toBe(updateNotice('1.4.0', 'installing', 'en', handlers).id);
  });
});
