import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DialogTabs } from './Dialog';

/**
 * A dialog's section tabs: the 184px side rail on a dialog of 34rem or more (Mac, iPad), a
 * strip across the top below that (iPhone, a third of iPad Split View), so the settings keep
 * the width. The switch is a container query on the dialog; the real widths are checked in
 * Chrome (k-0197).
 */
const draw = (value: 'a' | 'b' = 'b') =>
  renderToStaticMarkup(
    <DialogTabs<'a' | 'b'>
      value={value}
      onChange={() => {}}
      tabs={[
        { id: 'a', label: 'Worksheet', hint: 'Title, fonts, sections' },
        { id: 'b', label: 'Header & footer', hint: 'Page 1, later pages' },
      ]}
    >
      <p>Panel</p>
    </DialogTabs>,
  );
const classOf = (markup: string, tag: string) => new RegExp(`<${tag}[^>]*class="([^"]*)"`).exec(markup)?.[1].split(' ') ?? [];

describe('a dialog’s section tabs', () => {
  it('ask the dialog’s own width, not the window’s', () => {
    const markup = draw();
    expect(markup).toMatch(/^<div data-dialog-tabs="true" class="@container /);
    expect(markup).toContain('flex min-h-0 flex-1 flex-col @min-[34rem]:flex-row');
  });

  it('keep the side rail exactly as it was from 34rem up', () => {
    const nav = classOf(draw(), 'nav');
    for (const rail of ['block', 'w-[184px]', 'self-stretch', 'space-y-0.5', 'overflow-y-auto', 'border-r', 'border-b-0', 'p-2']) {
      expect(nav, rail).toContain(`@min-[34rem]:${rail}`);
    }
  });

  it('run as one strip across the top below that, scrolling sideways, labels only', () => {
    const markup = draw();
    const nav = classOf(markup, 'nav');
    for (const strip of ['flex', 'overflow-x-auto', 'border-b']) expect(nav, strip).toContain(strip);
    expect(nav).not.toContain('w-[184px]');
    // The hint line is the rail's; the strip shows the label alone, on one line.
    expect(markup).toContain('class="hidden truncate text-[10px] text-ink-subtle @min-[34rem]:block">Title, fonts, sections');
    expect(markup).toContain('class="block whitespace-nowrap text-[13px] font-medium @min-[34rem]:truncate">Header &amp; footer');
  });

  it('mark the open tab with the bar under it in the strip and beside it in the rail', () => {
    const bars = [...draw('b').matchAll(/<span aria-hidden="true" class="([^"]*)"/g)].map((m) => m[1]);
    expect(bars).toHaveLength(2);
    const [closed, open] = bars;
    for (const bar of bars) {
      expect(bar).toContain('inset-x-2.5 bottom-0 h-0.5');
      expect(bar).toContain('@min-[34rem]:inset-y-1.5 @min-[34rem]:left-0 @min-[34rem]:h-auto @min-[34rem]:w-0.5');
    }
    expect(open).toContain('opacity-100');
    expect(closed).toContain('opacity-0');
    expect(draw('b')).toMatch(/aria-selected="true"[^>]*>(?:(?!<\/button>).)*Header &amp; footer/);
  });
});
