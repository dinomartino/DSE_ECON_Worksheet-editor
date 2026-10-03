import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The draw canvas toolbar keeps one row from 1470 (measured in Chrome and WebKit, en and
 * 中文). It wrapped at 1512 because 2xl brought back the heading, the shortcuts and the
 * hint, which then needed more than 2xl's 1536 gives. Only the embedded tool names may
 * grow back at 2xl.
 */
describe('draw canvas toolbar', () => {
  const src = readFileSync('src/components/editor/DiagramCanvas.tsx', 'utf8');
  const header = src.slice(src.indexOf('<header'), src.indexOf('</header>'));

  it('nothing in the header widens at 2xl but the embedded tool names', () => {
    const grows = header.match(/2xl:[\w-]+/g) ?? [];
    expect(grows.every((cls) => cls === '2xl:not-sr-only')).toBe(true);
    expect(header).not.toMatch(/\bpx-3\b|\bgap-3\b|\bpx-5\b/);
  });

  it('the overlay hint sits over the stage, not in the row', () => {
    expect(header).toContain("embedded ? '' : 'hidden'");
    expect(src).toMatch(/!embedded && !previewing && toolbarHint && \(\s*<p className="pointer-events-none absolute right-3 top-2/);
  });

  it('clipboard shortcuts live in the tooltip', () => {
    expect(header.match(/<ToolbarButton\s+compact\b/g)).toHaveLength(4);
    expect(src).toContain("compact ? 'hidden' : ''");
  });
});
