import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { OPEN_EDITOR, inOpenEditor, isEditorClick } from './editorClick';

/**
 * k-0484 (user u-zatn): a second click inside the text box being edited, to put the caret on
 * a word or select some, reached the question's own click handler, which dropped the text
 * selection, and the format bar vanished with the caret still in the box.
 */
const node = (inEditor: boolean) => ({
  closest: (selector: string) => (selector === OPEN_EDITOR && inEditor ? {} : null),
});

describe('a click that is the open editor’s own', () => {
  it('is one that lands inside the open editor (a caret moved, a word double-clicked, a tap)', () => {
    expect(inOpenEditor(node(true) as unknown as EventTarget)).toBe(true);
    expect(isEditorClick(node(true) as unknown as EventTarget, false)).toBe(true);
  });

  it('is one whose press began there: a drag-select released past the box', () => {
    // The browser sends that click to the common ancestor (the question, the paper).
    expect(isEditorClick(node(false) as unknown as EventTarget, true)).toBe(true);
  });

  it('is not a click that began and ended outside it: that one still ends editing', () => {
    expect(isEditorClick(node(false) as unknown as EventTarget, false)).toBe(false);
    expect(isEditorClick(null, false)).toBe(false);
    expect(inOpenEditor({} as EventTarget)).toBe(false);
  });

  it('is what the page’s deselecting click handlers ask first', () => {
    const preview = readFileSync('src/components/preview/Preview.tsx', 'utf8');
    // The question's and the layout element's body click, and both papers' blank click.
    expect(preview.match(/if \(editorClick\(event\)\) return;/g)?.length).toBe(2);
    expect(preview.match(/if \(swept \|\| editorClick\(event\)\) return;/g)?.length).toBe(2);
    const key = readFileSync('src/components/preview/AnswerKeyPreview.tsx', 'utf8');
    expect(key).toContain('if (editorClick(event) || !isBlankAreaClick(event.target)) return;');
  });
});
