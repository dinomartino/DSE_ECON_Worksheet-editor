import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { holdScrollers } from './bankDrag';

/** Just enough DOM: listeners by type, and elements in a parent chain. */
function fakeDom() {
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  const on = (type: string, fn: (event: unknown) => void) => {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type)!.add(fn);
  };
  const off = (type: string, fn: (event: unknown) => void) => listeners.get(type)?.delete(fn);
  const fire = (type: string, event: unknown) => [...(listeners.get(type) ?? [])].forEach((fn) => fn(event));
  const body = { parentElement: null };
  const el = (parentElement: object, scrollable: boolean) => ({
    parentElement,
    scrollTop: 0,
    scrollLeft: 0,
    scrollHeight: scrollable ? 5000 : 100,
    clientHeight: 100,
    scrollWidth: 100,
    clientWidth: 100,
    contains: () => false,
  });
  const list = el(body, true);
  const wrapper = el(list, false);
  const row = el(wrapper, false);
  vi.stubGlobal('document', { body, getElementById: () => null, addEventListener: on, removeEventListener: off });
  vi.stubGlobal('window', { addEventListener: on, removeEventListener: off });
  return { list, row, fire, listeners };
}

describe('holdScrollers (the 題庫 list keeps its place through a drag)', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it('puts the list back whenever something scrolls it mid-drag', () => {
    const dom = fakeDom();
    dom.list.scrollTop = 300;
    const hold = holdScrollers(dom.row as unknown as HTMLElement);
    dom.list.scrollTop = 4372; // WebKit's autoscroll toward the pointer
    dom.fire('scroll', { target: dom.list });
    expect(dom.list.scrollTop).toBe(300);
    dom.list.scrollTop = 0;
    hold.restore(); // the drag's frame
    expect(dom.list.scrollTop).toBe(300);
    hold.release(true);
    dom.list.scrollTop = 900; // the teacher scrolls it afterwards
    dom.fire('scroll', { target: dom.list });
    expect(dom.list.scrollTop).toBe(900);
  });

  it('after Esc, holds until the button is up', () => {
    const dom = fakeDom();
    dom.list.scrollTop = 120;
    const hold = holdScrollers(dom.row as unknown as HTMLElement);
    hold.release(false);
    dom.list.scrollTop = 0;
    dom.fire('scroll', { target: dom.list });
    expect(dom.list.scrollTop).toBe(120);
    dom.fire('pointermove', { buttons: 1 });
    dom.list.scrollTop = 0;
    dom.fire('scroll', { target: dom.list });
    expect(dom.list.scrollTop).toBe(120);
    dom.fire('pointerup', {});
    expect(dom.listeners.get('scroll')?.size ?? 0).toBe(0);
    dom.list.scrollTop = 0;
    dom.fire('scroll', { target: dom.list });
    expect(dom.list.scrollTop).toBe(0);
  });
});
