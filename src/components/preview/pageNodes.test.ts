import { describe, expect, it } from 'vitest';
import type { RenderNode } from '@/render/ir';
import { pageNodes } from './pageNodes';
import { breakAfterNodes } from './Preview';

const stem: RenderNode = { kind: 'text', style: 'Sub-question', text: { en: [], zh: [] }, keepNext: true };

describe('pageNodes', () => {
  it('draws a question’s answer space one line per node, so a sheet can break between lines as Word does', () => {
    const nodes: RenderNode[] = [stem, { kind: 'answerSpace', lines: 3 }];
    const split = pageNodes(nodes);
    expect(split).toEqual([stem, ...Array.from({ length: 3 }, () => ({ kind: 'answerSpace', lines: 1 }))]);
    // The part keeps with its first line; any line may end a sheet.
    expect(breakAfterNodes(split)).toEqual([1, 2]);
  });

  it('leaves a flow element’s space and a fill whole', () => {
    const nodes: RenderNode[] = [
      { kind: 'answerSpace', lines: 4, elementId: 'el' },
      { kind: 'answerSpace', lines: 4, elementId: 'fill', fill: true },
    ];
    expect(pageNodes(nodes)).toBe(nodes);
  });

  it('keeps one array per question, for the item memo', () => {
    const nodes: RenderNode[] = [stem, { kind: 'answerSpace', lines: 2 }];
    expect(pageNodes(nodes)).toBe(pageNodes(nodes));
  });
});
