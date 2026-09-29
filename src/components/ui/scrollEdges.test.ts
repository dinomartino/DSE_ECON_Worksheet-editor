import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NO_OVERFLOW, readScrollEdges, watchScrollEdges, type ScrollEdges } from './scrollEdges';

/**
 * The start screen's edge hints: a fade while content hides below, a hairline once it
 * has gone up, nothing when it fits. And no state update per scroll frame (a no-op
 * setState once looped into "Maximum update depth").
 */

/** A pane 300px tall over 1000px of content, with the browser APIs the watcher uses. */
function fakePane(scrollHeight = 1000) {
  const listeners = new Set<() => void>();
  return {
    scrollTop: 0,
    scrollHeight,
    clientHeight: 300,
    offsetWidth: 400,
    clientWidth: 400,
    children: [{}, {}],
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    scroll(to: number) {
      this.scrollTop = to;
      for (const fn of listeners) fn();
    },
    listeners,
  };
}

let frames: (() => void)[] = [];
let resized: (() => void)[] = [];
let observed = 0;
const flush = () => {
  const run = frames;
  frames = [];
  for (const fn of run) fn();
};

beforeEach(() => {
  frames = [];
  resized = [];
  observed = 0;
  vi.stubGlobal('requestAnimationFrame', (fn: () => void) => frames.push(fn));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => (frames[id - 1] = () => {}));
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(fn: () => void) {
        resized.push(fn);
      }
      observe() {
        observed += 1;
      }
      disconnect() {}
    },
  );
  vi.stubGlobal(
    'MutationObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

function watch(pane: ReturnType<typeof fakePane>) {
  const seen: ScrollEdges[] = [];
  const stop = watchScrollEdges(pane as unknown as HTMLElement, (e) => seen.push(e));
  return { seen, stop };
}

describe('readScrollEdges', () => {
  const at = (scrollTop: number, scrollHeight = 1000) =>
    readScrollEdges({ scrollTop, scrollHeight, clientHeight: 300, offsetWidth: 400, clientWidth: 400 });

  it('content that fits is at both edges', () => {
    expect(at(0, 300)).toEqual(NO_OVERFLOW);
  });
  it('at the top of overflowing content, only the bottom hides', () => {
    expect(at(0)).toMatchObject({ atTop: true, atBottom: false });
  });
  it('midway, both edges hide', () => {
    expect(at(350)).toMatchObject({ atTop: false, atBottom: false });
  });
  it('at the end, only the top hides', () => {
    expect(at(700)).toMatchObject({ atTop: false, atBottom: true });
  });
  it('a sub-pixel offset (page zoom) still counts as at the edge', () => {
    expect(at(0.5)).toMatchObject({ atTop: true });
    expect(at(699.4)).toMatchObject({ atBottom: true });
  });
  it('reports a classic scrollbar as the gutter', () => {
    expect(readScrollEdges({ scrollTop: 0, scrollHeight: 1000, clientHeight: 300, offsetWidth: 400, clientWidth: 385 }).gutter).toBe(15);
  });
});

describe('watchScrollEdges', () => {
  it('measures at once: overflowing content shows the bottom hint', () => {
    const { seen } = watch(fakePane());
    expect(seen).toEqual([{ atTop: true, atBottom: false, gutter: 0 }]);
  });

  it('reports nothing for content that fits (the initial state already says so)', () => {
    const { seen } = watch(fakePane(300));
    expect(seen).toEqual([]);
  });

  it('throttles scroll to one measure a frame, and reports only changes', () => {
    const pane = fakePane();
    const { seen } = watch(pane);
    pane.scroll(10);
    pane.scroll(20);
    pane.scroll(30);
    expect(frames).toHaveLength(1);
    flush();
    expect(seen.at(-1)).toMatchObject({ atTop: false, atBottom: false });
    pane.scroll(200);
    flush();
    pane.scroll(400);
    flush();
    expect(seen).toHaveLength(2);
    pane.scroll(700);
    flush();
    expect(seen.at(-1)).toMatchObject({ atTop: false, atBottom: true });
    expect(seen).toHaveLength(3);
  });

  it('re-measures when the pane or its content resizes', () => {
    const pane = fakePane();
    const { seen } = watch(pane);
    expect(observed).toBe(3); // the pane and its two children
    pane.clientHeight = 1000; // a taller window: everything fits
    resized[0]();
    flush();
    expect(seen.at(-1)).toEqual(NO_OVERFLOW);
  });

  it('tears down its listener and pending frame', () => {
    const pane = fakePane();
    const { seen, stop } = watch(pane);
    pane.scroll(100);
    stop();
    flush();
    expect(pane.listeners.size).toBe(0);
    expect(seen).toHaveLength(1);
  });
});
