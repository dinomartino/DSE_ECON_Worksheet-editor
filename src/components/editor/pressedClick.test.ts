import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { CLICK_MAX_MS, CLICK_SLOP_PX, isMisdirected, type Press } from './pressedClick';

/**
 * k-0478: after clicking text on the page, the first click on a side-panel control was lost.
 * The press blurred the page's field, the selection cleared, the panel moved, and the release
 * landed on something else, so the browser clicked a common ancestor instead of the button.
 */
describe('a press on a panel control clicks it even if the panel moved', () => {
  const inside = { id: 'label inside the button' };
  const elsewhere = { id: 'the card under the pointer after the jump' };
  const control = {
    isConnected: true,
    contains: (node: unknown) => node === inside || node === control,
  } as unknown as Element;
  const press: Press = { control, x: 100, y: 200, at: 1000 };

  it('redirects a click the layout shift sent elsewhere', () => {
    expect(isMisdirected(press, { target: elsewhere as unknown as EventTarget, x: 100, y: 200, at: 1120 })).toBe(true);
  });

  it('leaves a click that reached the control alone (no double click)', () => {
    expect(isMisdirected(press, { target: inside as unknown as EventTarget, x: 100, y: 200, at: 1120 })).toBe(false);
    expect(isMisdirected(press, { target: control, x: 100, y: 200, at: 1120 })).toBe(false);
  });

  it('is a click only: not a drag, not a long press, not a control that left the page', () => {
    const away = { target: elsewhere as unknown as EventTarget, at: 1120 };
    expect(isMisdirected(press, { ...away, x: 100 + CLICK_SLOP_PX + 1, y: 200 })).toBe(false);
    expect(isMisdirected(press, { ...away, x: 100, y: 200, at: 1000 + CLICK_MAX_MS + 1 })).toBe(false);
    const gone = { ...press, control: { ...control, isConnected: false, contains: () => false } as unknown as Element };
    expect(isMisdirected(gone, { ...away, x: 100, y: 200 })).toBe(false);
  });

  it('is installed on the side panel, and the "where" line no longer vanishes', () => {
    const sidebar = readFileSync('src/components/editor/Sidebar.tsx', 'utf8');
    expect(sidebar).toContain('usePressedClick(asideRef)');
    expect(sidebar).toContain('ref={asideRef}');
    const where = readFileSync('src/components/editor/drqPanelParts.tsx', 'utf8');
    expect(where).not.toContain('if (crumbs.length === 0) return null;');
    // A fixed height: the line is the same size with crumbs or with the hint.
    expect(where).toMatch(/flex h-9 items-center/);
  });
});
