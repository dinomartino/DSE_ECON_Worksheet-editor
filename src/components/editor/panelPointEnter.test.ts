import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { splitGroupPoint, splitMarkPoint, withoutEmptyGroupPoint, withoutEmptyMarkPoint } from '@/model/markScheme';
import type { MarkGroup, MarkScheme } from '@/model/markSchemeTypes';

/**
 * k-0482: Enter in the side panel's marking-point box makes the page's Enter (a new point
 * with the same mark), not a line break inside the point (how GitHub #7's blank lines got in).
 */
describe('Enter in the panel’s point box splits the point as the page does', () => {
  const group: MarkGroup = {
    id: 'g',
    points: [
      { id: 'p1', text: { en: [{ text: 'Demand rises' }], zh: [{ text: '需求上升' }] }, marks: 1 },
      { id: 'p2', text: { en: [], zh: [] }, marks: 1 },
    ],
  };

  it('splits at the caret: the words after it start a new point with the same mark', () => {
    const next = splitGroupPoint(group, 'p1', 'en', 6, 6, 'new');
    expect(next.points.map((p) => p.id)).toEqual(['p1', 'new', 'p2']);
    expect(next.points[0].text).toEqual({ en: [{ text: 'Demand' }], zh: [{ text: '需求上升' }] });
    expect(next.points[1]).toEqual({ id: 'new', text: { en: [{ text: ' rises' }], zh: [] }, marks: 1 });
  });

  it('gives exactly what the page’s scheme-level split gives', () => {
    const scheme: MarkScheme = { routes: [{ id: 'r', groups: [group] }] };
    for (const [start, end] of [[0, 0], [6, 6], [12, 12], [2, 8]]) {
      expect(splitGroupPoint(group, 'p1', 'en', start, end, 'n')).toEqual(
        splitMarkPoint(scheme, 'p1', 'en', start, end, 'n').routes[0].groups[0],
      );
    }
    expect(withoutEmptyGroupPoint(group, 'p2')).toEqual(withoutEmptyMarkPoint(scheme, 'p2').routes[0].groups[0]);
  });

  it('Enter on an empty point removes it, never the group’s only point', () => {
    expect(withoutEmptyGroupPoint(group, 'p2').points.map((p) => p.id)).toEqual(['p1']);
    const alone: MarkGroup = { id: 'g', points: [{ id: 'only', text: { en: [], zh: [] } }] };
    expect(withoutEmptyGroupPoint(alone, 'only')).toBe(alone);
    expect(withoutEmptyGroupPoint(group, 'p1')).toBe(group);
  });

  it('is wired with Shift+Enter and IME confirmation left alone; the answer box keeps its line break', () => {
    const field = readFileSync('src/components/editor/BiTextField.tsx', 'utf8');
    expect(field).toContain("if (event.key !== 'Enter' || event.shiftKey");
    expect(field).toContain('if (isImeKeydown(event.nativeEvent)) return;');
    const editor = readFileSync('src/components/editor/MarkSchemeEditor.tsx', 'utf8');
    expect(editor).toContain('onEnter={onEnter}');
    // The page's answer field takes a line break on Enter (`enterBreaksLine`); the panel's matches.
    const enter = readFileSync('src/components/preview/fieldEnter.ts', 'utf8');
    expect(enter).toMatch(/case "partAnswer":[\s\S]*return true;/);
  });
});
