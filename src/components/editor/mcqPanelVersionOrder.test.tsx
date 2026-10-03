import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMcqQuestion, createWorksheet } from '@/model/factories';
import { bi, plain } from '@/model/text';
import type { McqQuestion, OutputMode, Worksheet } from '@/model/types';
import { renderWorksheet } from '@/render/worksheet';
import type { TextNode } from '@/render/ir';

const store: { worksheet: Worksheet; mode: OutputMode; selectedTargetKey?: string } = {
  worksheet: createWorksheet(),
  mode: { language: 'en', version: 'teacher' },
};
vi.mock('@/store/worksheetStore', () => ({
  useWorksheetStore: (select: (s: typeof store) => unknown) => select(store),
}));

const { McqEditorPanel } = await import('./McqEditorPanel');

/** The panel lists options in the order the page shows them, lettered as printed. */

function question(): McqQuestion {
  const q = createMcqQuestion();
  q.blocks = [{ kind: 'paragraph', id: `${q.id}-stem`, text: bi('Stem', '題幹') }];
  q.options = ['w', 'x', 'y', 'z'].map((text, index) => ({ id: `${q.id}-${index}`, text: bi(text, text) }));
  q.answerIndex = 1;
  return q;
}

/** Each excerpt row's marker letter and option text, in panel order. */
function rows(q: McqQuestion): string[] {
  const markup = renderToStaticMarkup(<McqEditorPanel question={q} onChange={() => {}} />).replace(/ class="[^"]*"/g, '');
  return [...markup.matchAll(/data-edit-target="mcqOption:[^"]*">[\s\S]*?<span>([A-D])\.<\/span><\/span><span>([wxyz])<\/span>/g)].map(
    (match) => `${match[1]}.${match[2]}`,
  );
}

const page = (q: McqQuestion, variant?: string) =>
  renderWorksheet({ ...store.worksheet, questions: [q] }, { ...store.mode, ...(variant ? { variant } : {}) })
    .questions[0].nodes.filter((node): node is TextNode => node.kind === 'text' && node.style === 'MCQ Option')
    .map((node, index) => `${String.fromCharCode(65 + index)}.${plain(node.text.en)}`);

describe('the MCQ panel in a shuffled version', () => {
  it('matches the page in Version A and in Version B', () => {
    const q = question();
    store.worksheet = { ...createWorksheet(), questions: [q], versions: { count: 2, seed: 99 } };
    store.mode = { language: 'en', version: 'teacher' };
    expect(rows(q)).toEqual(['A.w', 'B.x', 'C.y', 'D.z']);

    store.mode = { language: 'en', version: 'teacher', variant: 'B' };
    const shown = page(q, 'B');
    expect(shown).not.toEqual(['A.w', 'B.x', 'C.y', 'D.z']);
    expect(rows(q)).toEqual(shown);
    const markup = renderToStaticMarkup(<McqEditorPanel question={q} onChange={() => {}} />);
    expect(markup).toContain('Listed in Version B order');
    // The correct-answer radio is the printed letter of the authored answer.
    const keyed = shown.find((row) => row.endsWith('.x'))!.charAt(0);
    expect(markup).toMatch(new RegExp(`aria-checked="true" aria-label="Option ${keyed}\\. `));
  });
});
