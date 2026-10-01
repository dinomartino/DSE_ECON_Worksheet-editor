import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { UiLanguageOverride } from '@/i18n/language';
import { parseChangelog } from '@/whatsNew/changelog';
import { CHANGELOG } from '@/whatsNew/notes';
import { WhatsNewDialog, WhatsNewOnLaunch } from './WhatsNewDialog';

const LOG = parseChangelog(`## Unreleased
### Added
- **Coming** soon

## 0.4.0 — 2026-10-01
### Added
- **Shaded areas**: consumer \`surplus\`.
### Fixed
- A fix, see [the guide](https://example.test/guide) or [notes](RELEASING.md).

## 0.3.0 — 2026-09-24
### Changed
- Old change.

## Earlier (web app)

Before versions.
`);

const render = (props: Partial<Parameters<typeof WhatsNewDialog>[0]> = {}) =>
  renderToStaticMarkup(
    <WhatsNewDialog onClose={() => {}} changelog={LOG} current="0.4.0" showUnreleased={false} {...props} />,
  );

describe('WhatsNewDialog', () => {
  it('after an update: one release, grouped, with bold, code and links rendered', () => {
    const html = render({ version: '0.4.0' });
    expect(html).toContain('What’s new in 0.4.0');
    expect(html).toContain('Released 1 October 2026');
    expect(html).toContain('<strong class="font-semibold text-ink"><span>Shaded areas</span></strong>');
    expect(html).toMatch(/<code[^>]*>surplus<\/code>/);
    expect(html).toContain('href="https://example.test/guide"');
    // A relative link is only its text.
    expect(html).not.toContain('href="RELEASING.md"');
    expect(html).toContain('>Added</h3>');
    expect(html).toContain('>Fixed</h3>');
    expect(html).not.toContain('Old change');
    expect(html).toContain('See all releases');
    expect(html).toContain('Got it');
  });

  it('on demand: every release, the running one open, older folded, Earlier last', () => {
    const html = render();
    expect(html).toContain('What’s new');
    expect(html).toContain('You have version 0.4.0');
    expect(html.indexOf('0.4.0</span>')).toBeLessThan(html.indexOf('0.3.0</span>'));
    expect(html).toMatch(/<details open=""[^>]*>.*0\.4\.0/);
    expect(html).toMatch(/<details class="group py-4"><summary[^>]*>.*0\.3\.0/);
    expect(html).toContain('Your version');
    expect(html).toContain('Earlier (web app)');
    expect(html).not.toContain('Coming');
  });

  it('shows Unreleased only when asked (dev builds)', () => {
    const html = render({ showUnreleased: true });
    expect(html).toContain('Unreleased');
    expect(html).toContain('Dev build only');
    expect(html.indexOf('Coming')).toBeLessThan(html.indexOf('Shaded areas'));
  });

  it('in 中文: each entry’s zh (English where it has none), groups, dates and Earlier in Chinese', () => {
    const log = parseChangelog(`## 0.4.0 — 2026-10-01
### Added
- **Shaded areas**: consumer surplus.
  <!-- zh: **陰影區域**：消費者
  盈餘。 -->
- Untranslated.
### Fixed
- A fix.

## Earlier (web app)

Before versions.

<!-- zh: 有版本之前。 -->
`);
    const zh = (props: Partial<Parameters<typeof WhatsNewDialog>[0]> = {}) =>
      renderToStaticMarkup(
        <UiLanguageOverride.Provider value="zh-HK">
          <WhatsNewDialog onClose={() => {}} changelog={log} current="0.4.0" showUnreleased={false} {...props} />
        </UiLanguageOverride.Provider>,
      );
    const featured = zh({ version: '0.4.0' });
    expect(featured).toContain('發佈日期：2026年10月1日');
    expect(featured).toContain('<strong class="font-semibold text-ink"><span>陰影區域</span></strong><span>：消費者盈餘。</span>');
    expect(featured).not.toContain('Shaded areas');
    expect(featured).toContain('Untranslated.');
    expect(featured).toContain('>新增</h3>');
    expect(featured).toContain('>修正</h3>');
    const all = zh();
    expect(all).toContain('新增 2 項 · 修正 1 項');
    expect(all).toContain('早期版本');
    expect(all).not.toContain('Earlier (web app)');
    expect(all).toContain('有版本之前。');
    // English mode never shows the comments.
    const en = render({ changelog: log, version: '0.4.0' });
    expect(en).toContain('Shaded areas');
    expect(en).not.toContain('陰影區域');
  });

  it('renders the bundled changelog without a problem', () => {
    expect(CHANGELOG.problems).toEqual([]);
    const html = renderToStaticMarkup(<WhatsNewDialog onClose={() => {}} version="0.3.0" />);
    expect(html).toContain('What’s new in 0.3.0');
    expect(html).toContain('Export dialog');
  });

  it('the launch pop-up renders nothing until it has decided', () => {
    expect(renderToStaticMarkup(<WhatsNewOnLaunch ready returningUser />)).toBe('');
  });
});
