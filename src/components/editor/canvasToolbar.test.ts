import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The draw canvas toolbar keeps one row from 1024 to 1600 (measured in Chrome, the span
 * tool on and off). It wrapped at 1440: four clipboard buttons, the span tool's two
 * selects and full tool names needed ~1460px. Now, narrower than 2xl the clipboard is one
 * overflow menu, narrower than 1360 the overlay's tools are glyphs, and the span options
 * sit over the stage. Only these may grow back at 2xl.
 */
describe('draw canvas toolbar', () => {
  const src = readFileSync('src/components/editor/DiagramCanvas.tsx', 'utf8');
  const header = src.slice(src.indexOf('<header'), src.indexOf('</header>'));

  it('nothing in the header widens at 2xl but tool names and the clipboard row', () => {
    const grows = header.match(/2xl:[\w-]+/g) ?? [];
    expect(grows.every((cls) => ['2xl:flex', '2xl:hidden'].includes(cls))).toBe(true);
    expect(src).toContain("embedded ? 'sr-only 2xl:not-sr-only' : 'sr-only min-[1360px]:not-sr-only'");
    expect(header).not.toMatch(/\bpx-3\b|\bgap-3\b|\bpx-5\b/);
  });

  it('every clipboard action is reachable at every width: buttons at 2xl, a menu below', () => {
    expect(header).toContain('className="hidden gap-1 2xl:flex"');
    expect(header).toMatch(/<div className="2xl:hidden"[^>]*>\s*<Menu items=\{clipboardItems\}/);
    expect(header).toMatch(/clipboardItems\.map/);
    for (const action of ['m.copy', 'm.paste', 'm.duplicate', 'm.delete']) {
      expect(src).toMatch(new RegExp(`label: ${action.replace('.', '\\.')}, hint:`));
    }
  });

  it('the span options and the hint sit over the stage, not in the row', () => {
    expect(header).not.toContain('<SpanSelects');
    expect(src).toMatch(/data-testid="canvas-span-options"/);
    expect(header).toContain("embedded ? '' : 'hidden'");
    expect(src).toMatch(/!embedded && !previewing && toolbarHint && \(\s*<p\s+className=\{`pointer-events-none absolute right-3 top-2/);
  });

  it('clipboard shortcuts live in the tooltip', () => {
    expect(header.match(/<ToolbarButton\s+key=\{item\.label\}\s+compact\b/g)).toHaveLength(1);
    expect(src).toContain("compact ? 'hidden' : ''");
  });
});
