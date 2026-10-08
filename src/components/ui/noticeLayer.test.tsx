import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Notice } from '@/store/notices';
import { APP_STACK_CLASS, NoticeStackView } from './NoticeLayer';

const notice = (over: Partial<Notice> & Pick<Notice, 'id' | 'tone' | 'body'>): Notice => ({
  scope: 'app',
  dismissible: true,
  rev: 1,
  ...over,
});
const draw = (notices: Notice[]) => renderToStaticMarkup(<NoticeStackView notices={notices} className={APP_STACK_CLASS} />);

describe('NoticeStackView', () => {
  it('draws nothing when there is nothing to say', () => {
    expect(draw([])).toBe('');
  });

  it('floats, stays out of print, and takes no clicks but on its cards', () => {
    const markup = draw([notice({ id: 'a', tone: 'info', body: 'Saved' })]);
    expect(markup).toContain('data-print-hide');
    expect(markup).toMatch(/class="pointer-events-none[^"]*\bfixed\b/);
    expect(markup).toContain('pointer-events-auto');
  });

  it('info and success are polite; warnings and errors are alerts', () => {
    const markup = draw([
      notice({ id: 'a', tone: 'success', body: 'Copied' }),
      notice({ id: 'b', tone: 'error', body: 'Could not copy' }),
    ]);
    expect(markup).toMatch(/role="status"[^>]*data-notice="success"/);
    expect(markup).toMatch(/role="alert"[^>]*data-notice="error"/);
  });

  it('newest on top, with a named close button unless it cannot be dismissed', () => {
    const markup = draw([
      notice({ id: 'a', tone: 'info', body: 'Older' }),
      notice({ id: 'b', tone: 'info', body: 'Newer', dismissible: false }),
    ]);
    expect(markup.indexOf('Newer')).toBeLessThan(markup.indexOf('Older'));
    expect(markup.match(/aria-label="Dismiss notification"/g)).toHaveLength(1);
  });

  it('shows four and counts the rest', () => {
    const markup = draw(['1', '2', '3', '4', '5', '6'].map((id) => notice({ id, tone: 'error', body: `E${id}` })));
    expect(markup).not.toContain('E1');
    expect(markup).not.toContain('E2');
    expect(markup).toContain('E6');
    expect(markup).toContain('+2 more');
  });

  it('draws details and actions', () => {
    const markup = draw([
      notice({
        id: 'a',
        tone: 'warning',
        body: 'Restored 3',
        details: ['broken.json: not valid JSON'],
        actions: [{ label: 'Show in Finder', run: () => {} }],
      }),
    ]);
    expect(markup).toContain('broken.json: not valid JSON');
    expect(markup).toContain('Show in Finder');
  });

  it('wraps a long detail line instead of cutting it off', () => {
    const reason = 'A newer version of Econ Studio set up this folder. Update the app to use it.';
    const markup = draw([notice({ id: 'a', tone: 'warning', body: 'Cannot reach the folder', details: [reason] })]);
    expect(markup).toMatch(new RegExp(`<li class="break-words">${reason}</li>`));
    expect(markup).not.toMatch(/<li[^>]*truncate/);
  });
});
