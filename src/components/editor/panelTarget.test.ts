import { describe, it, expect } from 'vitest';
import { editTargetKey } from '@/model/edits';
import { CURRENT_ATTR, TARGET_ATTR, markPanelTarget, panelTargetCandidates } from './panelTarget';

/**
 * The sidebar marks the control matching the page's selection. The node test
 * environment has no DOM, so a minimal element stands in: attributes and a
 * `querySelectorAll` for `[data-edit-target]`, all `markPanelTarget` reads.
 */
class FakeElement {
  attrs = new Map<string, string>();
  writes = 0;
  constructor(key: string) {
    this.attrs.set(TARGET_ATTR, key);
  }
  getAttribute(name: string) {
    return this.attrs.get(name) ?? null;
  }
  hasAttribute(name: string) {
    return this.attrs.has(name);
  }
  setAttribute(name: string, value: string) {
    this.writes += 1;
    this.attrs.set(name, value);
  }
  removeAttribute(name: string) {
    this.writes += 1;
    this.attrs.delete(name);
  }
}

function panel(...keys: string[]) {
  const elements = keys.map((key) => new FakeElement(key));
  const root = { querySelectorAll: () => elements } as unknown as ParentNode;
  const marked = () =>
    elements.filter((el) => el.hasAttribute(CURRENT_ATTR)).map((el) => el.getAttribute(TARGET_ATTR));
  return { root, elements, marked };
}

const option = (id: string) => editTargetKey({ kind: 'mcqOption', questionId: 'Q', optionId: id });
const para = (id: string) => editTargetKey({ kind: 'blockText', blockId: id });

describe('marking the panel control for the page selection', () => {
  it('marks the exact match and only it', () => {
    const { root, marked } = panel(para('stem'), option('a'), option('b'));
    expect(markPanelTarget(root, option('b'))).toBeDefined();
    expect(marked()).toEqual([option('b')]);
  });

  it('moves the mark when the selection moves, and clears it when it goes', () => {
    const { root, marked } = panel(option('a'), option('b'));
    markPanelTarget(root, option('a'));
    markPanelTarget(root, option('b'));
    expect(marked()).toEqual([option('b')]);
    expect(markPanelTarget(root, undefined)).toBeUndefined();
    expect(marked()).toEqual([]);
  });

  it('leaves an already-marked control untouched, so its pulse does not replay', () => {
    const { root, elements } = panel(option('a'));
    markPanelTarget(root, option('a'));
    const writes = elements[0].writes;
    markPanelTarget(root, option('a'));
    expect(elements[0].writes).toBe(writes);
  });

  it('marks nothing when no control matches', () => {
    const { root, marked } = panel(option('a'));
    expect(markPanelTarget(root, editTargetKey({ kind: 'worksheetTitle' }))).toBeUndefined();
    expect(marked()).toEqual([]);
  });

  it('falls back to the owning control for a component without its own', () => {
    const cell = editTargetKey({ kind: 'tableCell', blockId: 'tbl', cellId: 'c1' });
    const { root, marked } = panel(para('stem'), para('tbl'));
    markPanelTarget(root, cell);
    expect(marked()).toEqual([para('tbl')]);
  });

  it('prefers the exact control over the fallback when both exist', () => {
    const caption = editTargetKey({ kind: 'blockCaption', blockId: 'tbl' });
    const { root, marked } = panel(para('tbl'), caption);
    markPanelTarget(root, caption);
    expect(marked()).toEqual([caption]);
  });
});

describe('candidate keys', () => {
  it('names the block for its cells, caption and source lines', () => {
    for (const key of [
      editTargetKey({ kind: 'tableCell', blockId: 'B', cellId: 'C' }),
      editTargetKey({ kind: 'blockCaption', blockId: 'B' }),
      editTargetKey({ kind: 'sourceLabel', blockId: 'B' }),
      editTargetKey({ kind: 'sourceFootnote', blockId: 'B' }),
    ]) {
      expect(panelTargetCandidates(key)).toEqual([key, para('B')]);
    }
  });

  it('names a label-list row by its label for the value column', () => {
    const cell = (column: 'label' | 'value') =>
      editTargetKey({ kind: 'labelListCell', elementId: 'E', rowId: 'R', column });
    expect(panelTargetCandidates(cell('value'))).toEqual([cell('value'), cell('label')]);
    expect(panelTargetCandidates(cell('label'))).toEqual([cell('label')]);
  });

  it('has no fallback for a component with its own control', () => {
    expect(panelTargetCandidates(option('a'))).toEqual([option('a')]);
    expect(panelTargetCandidates(para('p'))).toEqual([para('p')]);
  });
});
