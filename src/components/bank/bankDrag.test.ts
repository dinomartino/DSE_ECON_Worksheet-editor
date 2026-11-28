import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { choiceQuestion, docWith, row } from '@/library/testKit';
import { createSectionElement, resolveFlow } from '@/model/flow';
import { bi } from '@/model/text';
import type { Worksheet } from '@/model/types';
import { useWorksheetStore } from '@/store/worksheetStore';
import {
  aimBankDragForTest,
  bankDragKey,
  cancelBankDrag,
  isBankDragActive,
  resetBankDragForTest,
  rowDragHandlers,
  useBankDrag,
  holdScrollers,
} from './bankDrag';
import { useBankSession } from './bankSession';
import { provisionalWorksheet } from './dropSlot';

/**
 * The drag's commit contract, driven through the row's real pointer handlers (the page
 * geometry is aimed through the test seam; `dropSlot.test.ts` covers picking the slot).
 */

const store = () => useWorksheetStore.getState();

const picked = choiceQuestion('The supply of flats is inelastic in the short run because…', '', ['C.pes']);
const bank = { ...docWith([picked]), id: 'doc-bank' };
const source = { load: async (id: string) => (id === bank.id ? bank : undefined) };
const bankRow = row({ docId: bank.id, questionId: picked.id, rootId: picked.id, tags: ['C.pes', 'C.ped'] });

const el = {
  setPointerCapture: () => {},
  releasePointerCapture: () => {},
  hasPointerCapture: () => true,
  style: {} as Record<string, string>,
};
const event = (x: number, y: number, extra: Record<string, unknown> = {}) =>
  ({
    button: 0,
    buttons: 1,
    isPrimary: true,
    ctrlKey: false,
    metaKey: false,
    pointerId: 1,
    pointerType: 'mouse',
    clientX: x,
    clientY: y,
    currentTarget: el,
    target: { closest: () => null },
    ...extra,
  }) as unknown as ReactPointerEvent<HTMLElement>;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('dragging a 題庫 row onto the page', () => {
  let open: Worksheet;
  const q1 = choiceQuestion('Q1 here');
  const q2 = choiceQuestion('Q2 here');
  const q3 = choiceQuestion('Q3 here');
  const section = createSectionElement(bi('Section B', ''));

  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => {});
    vi.stubGlobal('window', { getSelection: () => null, setTimeout });
    vi.stubGlobal('document', { body: { style: {} }, getElementById: () => null });
    resetBankDragForTest();
    open = docWith([q1, q2, q3], {
      layout: [section],
      flow: [
        { type: 'question', id: q1.id },
        { type: 'question', id: q2.id },
        { type: 'layout', id: section.id },
        { type: 'question', id: q3.id },
      ],
    });
    store().replaceWorksheet(open);
    useBankSession.setState({ review: null });
  });
  afterEach(() => {
    resetBankDragForTest();
    vi.unstubAllGlobals();
  });

  const pickUp = async (reports: unknown[] = []) => {
    const handlers = rowDragHandlers(bankRow, 'k', 'The supply of flats', { source, onReport: (r) => reports.push(r) });
    handlers.onPointerDown(event(10, 10));
    handlers.onPointerMove(event(40, 30));
    await flush();
    return handlers;
  };

  it('a press that does not travel stays a click', () => {
    const handlers = rowDragHandlers(bankRow, 'k', 'label', { source });
    handlers.onPointerDown(event(10, 10));
    handlers.onPointerMove(event(12, 11));
    handlers.onPointerUp(event(12, 11));
    expect(useBankDrag.getState().active).toBeNull();
  });

  it('shows a provisional copy while nothing reaches the document', async () => {
    await pickUp();
    const { active, ghost } = useBankDrag.getState();
    expect(active?.label).toBe('The supply of flats');
    expect(ghost?.id).not.toBe(picked.id);
    expect(ghost?.lineage?.rootId).toBe(picked.id);
    aimBankDragForTest(3);
    expect(useBankDrag.getState().slot).toBe(3);
    expect(store().worksheet).toBe(open);
    expect(store().past).toHaveLength(0);
    expect(store().dirty).toBe(false);
  });

  it('a drop is one commit at the slot shown, and one ⌘Z takes it out', async () => {
    const reports: unknown[] = [];
    const handlers = await pickUp(reports);
    aimBankDragForTest(3); // under the Section B marker
    const ghost = useBankDrag.getState().ghost!;
    const shown = provisionalWorksheet(open, ghost, 3);
    handlers.onPointerUp(event(300, 400));

    const after = store().worksheet;
    expect(store().past).toHaveLength(1);
    const order = resolveFlow(after).map((item) => item.id);
    const copy = after.questions.find((q) => !open.questions.includes(q))!;
    expect(order).toEqual([q1.id, q2.id, section.id, copy.id, q3.id]);
    // Where the page showed it.
    expect(order.map((id) => (id === copy.id ? 'new' : id))).toEqual(
      resolveFlow(shown).map((item) => (item.id === ghost.id ? 'new' : item.id)),
    );
    // The same copy Enter on a focused row makes: fresh ids, lineage, the bank's tag union, a review.
    expect(copy.id).not.toBe(picked.id);
    expect(copy.lineage).toMatchObject({ rootId: picked.id, fromDocId: bank.id });
    expect(copy.tags).toEqual(['C.pes', 'C.ped']);
    expect(useBankSession.getState().review?.questionIds).toEqual([copy.id]);
    expect(store().insertAnchorId).toBe(copy.id);
    expect(useBankDrag.getState()).toMatchObject({ active: null, ghost: null, slot: null });
    expect(reports).toHaveLength(1);

    store().undo();
    expect(store().worksheet.questions).toEqual(open.questions);
    expect(resolveFlow(store().worksheet).map((item) => item.id)).toEqual(resolveFlow(open).map((item) => item.id));
  });

  it('⌘Z and redo are swallowed while the drag is in hand; the page undo stands down', async () => {
    const chord = (k: string, mods: Record<string, boolean> = {}) => ({ key: k, metaKey: false, ctrlKey: false, shiftKey: false, ...mods });
    expect(isBankDragActive()).toBe(false);
    const handlers = await pickUp();
    aimBankDragForTest(3);
    expect(isBankDragActive()).toBe(true);
    expect(bankDragKey(chord('z', { metaKey: true }))).toBe('swallow');
    expect(bankDragKey(chord('Z', { metaKey: true, shiftKey: true }))).toBe('swallow');
    expect(bankDragKey(chord('z', { ctrlKey: true }))).toBe('swallow');
    expect(bankDragKey(chord('y', { ctrlKey: true }))).toBe('swallow');
    expect(bankDragKey(chord('Escape'))).toBe('cancel');
    expect(bankDragKey(chord('a'))).toBeNull();
    // The drag is untouched: same slot, same copy, nothing written.
    expect(useBankDrag.getState().slot).toBe(3);
    expect(store().worksheet).toBe(open);

    handlers.onPointerUp(event(300, 400));
    expect(isBankDragActive()).toBe(false);
    expect(store().past).toHaveLength(1);
  });

  it('a drop before the question is read still holds undo off until it commits', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slow = { load: async (id: string) => (await gate, source.load(id)) };
    const handlers = rowDragHandlers(bankRow, 'k', 'label', { source: slow });
    handlers.onPointerDown(event(10, 10));
    handlers.onPointerMove(event(40, 30));
    aimBankDragForTest(1);
    handlers.onPointerUp(event(300, 400));
    expect(isBankDragActive()).toBe(true);
    expect(store().past).toHaveLength(0);

    release();
    await flush();
    await flush();
    expect(isBankDragActive()).toBe(false);
    expect(store().past).toHaveLength(1);
  });

  it('reaches the very start of the paper', async () => {
    const handlers = await pickUp();
    aimBankDragForTest(0);
    handlers.onPointerUp(event(300, 10));
    expect(resolveFlow(store().worksheet)[0].id).not.toBe(q1.id);
    expect(store().worksheet.questions[0].lineage?.rootId).toBe(picked.id);
  });

  it('Esc (cancel) leaves the document exactly as it was, and clean', async () => {
    await pickUp();
    aimBankDragForTest(1);
    cancelBankDrag();
    expect(store().worksheet).toBe(open);
    expect(store().past).toHaveLength(0);
    expect(store().dirty).toBe(false);
    expect(useBankDrag.getState()).toMatchObject({ active: null, ghost: null, slot: null });
  });

  it('a release off the page cancels', async () => {
    const handlers = await pickUp();
    aimBankDragForTest(null);
    handlers.onPointerUp(event(900, 10));
    expect(store().worksheet).toBe(open);
    expect(store().dirty).toBe(false);
  });

  it('a lost pointer cancels', async () => {
    const handlers = await pickUp();
    aimBankDragForTest(2);
    handlers.onLostPointerCapture();
    expect(store().worksheet).toBe(open);
    expect(useBankDrag.getState().active).toBeNull();
  });

  it('a read-only document refuses the drop', async () => {
    const handlers = await pickUp();
    aimBankDragForTest(1);
    useWorksheetStore.setState({ readOnly: true });
    handlers.onPointerUp(event(300, 400));
    expect(store().worksheet).toBe(open);
    expect(store().past).toHaveLength(0);
    useWorksheetStore.setState({ readOnly: false });
  });
});

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
