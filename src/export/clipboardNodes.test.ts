import { describe, expect, it } from 'vitest';
import { partedQuestion } from '@/library/testKit';
import { createParagraphBlock } from '@/model/factories';
import { questionTagSlots, slotHighlightIds } from '@/model/tagSlots';
import { bi } from '@/model/text';
import type { OutputMode, Worksheet } from '@/model/types';
import { buildAcceptanceWorksheet } from '@/test/fixtures';
import { highlightedNodes, questionClipboardHtml, questionClipboardNodes } from './clipboard';

const MODES: OutputMode[] = [
  { language: 'bilingual', version: 'teacher' },
  { language: 'en', version: 'student' },
  { language: 'zh', version: 'teacher', omitAnswerSpace: true },
];

const bodyOf = (html: string) => /<body style="[^"]*">([\s\S]*)<\/body>/.exec(html)?.[1];

describe('questionClipboardNodes', () => {
  it('joined, is exactly questionClipboardHtml’s body, for every question, mode and printed number', () => {
    const worksheet = buildAcceptanceWorksheet();
    for (const mode of MODES) {
      for (const question of worksheet.questions) {
        for (const number of [undefined, 12]) {
          const nodes = questionClipboardNodes(worksheet, question.id, mode, new Map(), number);
          expect(nodes.length).toBeGreaterThan(0);
          expect(bodyOf(questionClipboardHtml(worksheet, question.id, mode, new Map(), number))).toBe(nodes.map((node) => node.html).join(''));
        }
      }
    }
    expect(questionClipboardNodes(worksheet, 'missing', MODES[0])).toEqual([]);
    expect(bodyOf(questionClipboardHtml(worksheet, 'missing', MODES[0]))).toBe('');
  });

  it('names each node’s block or answer, so a reader can mark one part and the clipboard never carries it', () => {
    const question = partedQuestion([{}, { subs: [undefined, undefined] }, {}]);
    question.parts[1].blocksBefore = [createParagraphBlock(bi('Now the price rises.', ''))];
    question.parts[1].subParts![0].answer = bi('Model answer (b)(i)', '');
    const base = buildAcceptanceWorksheet();
    const worksheet: Worksheet = { ...base, questions: [question], flow: [{ type: 'question', id: question.id }] };
    const mode: OutputMode = { language: 'en', version: 'teacher' };
    const nodes = questionClipboardNodes(worksheet, question.id, mode);
    const slots = questionTagSlots(question);
    const b = slots.find((slot) => slot.label === '(b)')!;
    const marked = highlightedNodes(
      nodes.map((node) => node.target),
      slotHighlightIds(slots, [b.key]),
    );
    const text = (keep: boolean) => nodes.filter((_, i) => marked[i] === keep).map((node) => node.html).join('');
    expect(text(true)).toContain('Part 2');
    expect(text(true)).toContain('Part 2.1');
    expect(text(true)).toContain('Model answer (b)(i)');
    expect(text(true)).toContain('Part 2.2');
    // The stem, the interlude (context, not the part), (a) and (c) stay unmarked.
    expect(text(false)).toContain('A market for rice.');
    expect(text(false)).toContain('Now the price rises.');
    expect(text(false)).toContain('Part 1');
    expect(text(false)).toContain('Part 3');
    // Marking is the reader's: the clipboard is the plain join of the same nodes.
    expect(bodyOf(questionClipboardHtml(worksheet, question.id, mode))).toBe(nodes.map((node) => node.html).join(''));
  });

  it('highlights a run: a named id starts or continues it, an unnamed node follows the one before, another id ends it', () => {
    const on = new Set(['x']);
    expect(highlightedNodes([undefined, 'x', undefined, 'x', 'y', undefined, 'x'], on)).toEqual([false, true, true, true, false, false, true]);
  });
});
