import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const checkForUpdate = vi.fn();
vi.mock('@/desktop/updater', () => ({
  isDesktop: () => false,
  currentVersion: async () => null,
  checkForUpdate,
}));

const { UpdateBanner, UpdateBar, VersionLine } = await import('./UpdateBanner');

/**
 * The banner must be invisible everywhere it is not wanted — on the web, and in print.
 * There is no DOM in this suite, so the effect-driven wrapper is checked for its
 * first paint (nothing) and the bar itself is rendered directly.
 */

describe('UpdateBanner', () => {
  it('renders nothing before an update is known — the web never gets one', () => {
    checkForUpdate.mockResolvedValue({ kind: 'none' });
    expect(renderToStaticMarkup(<UpdateBanner />)).toBe('');
  });

  it('shows no version line on the web', () => {
    expect(renderToStaticMarkup(<VersionLine />)).toBe('');
  });

  it('offers the version, the two actions, and hides itself from print', () => {
    const markup = renderToStaticMarkup(
      <UpdateBar version="1.4.0" state="offer" onInstall={() => {}} onDismiss={() => {}} />,
    );

    expect(markup).toContain('Version 1.4.0 is ready');
    expect(markup).toContain('Restart now');
    expect(markup).toContain('Later');
    expect(markup).toContain('data-print-hide');
  });

  it('reports progress and disables the action while installing', () => {
    const markup = renderToStaticMarkup(
      <UpdateBar version="1.4.0" state="installing" onInstall={() => {}} onDismiss={() => {}} />,
    );

    expect(markup).toContain('Installing version 1.4.0');
    expect(markup).toContain('disabled');
  });

  it('offers a retry when the install failed', () => {
    const markup = renderToStaticMarkup(
      <UpdateBar version="1.4.0" state="failed" onInstall={() => {}} onDismiss={() => {}} />,
    );

    expect(markup).toContain('could not be installed');
    expect(markup).toContain('Try again');
  });
});
