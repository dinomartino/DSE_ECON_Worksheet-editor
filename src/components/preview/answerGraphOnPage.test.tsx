import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { applyAnswerGraph } from '@/model/edits';
import type { OutputMode, StructuredQuestion, Worksheet } from '@/model/types';
import type { AnswerGraphNode } from '@/render/ir';
import { renderWorksheet } from '@/render/worksheet';
import { useWorksheetStore } from '@/store/worksheetStore';
import { buildTranslateFixture } from '@/test/translateFixture';
import { AnswerGraphOnPage, answerGraphKey } from './AnswerGraphView';

const STUDENT: OutputMode = { language: 'en', version: 'student' };

const graphNodes = (worksheet: Worksheet): AnswerGraphNode[] =>
  renderWorksheet(worksheet, STUDENT).items.flatMap((item) =>
    item.type === 'question'
      ? item.question.nodes.filter((node): node is AnswerGraphNode => node.kind === 'answerGraph')
      : [],
  );

const structured = (worksheet: Worksheet, id: string) =>
  worksheet.questions.find((question) => question.id === id) as StructuredQuestion;

describe('graph answer space on the page', () => {
  it('each box names the leaf that owns it, outside its content key', () => {
    const nodes = graphNodes(buildTranslateFixture());
    expect(nodes.map((node) => node.owner)).toEqual([
      { questionId: 'sq1', partId: 'sq1-a', subPartId: 'sq1-a-i' },
      { questionId: 'sq1', partId: 'sq1-a' },
      { questionId: 'sq2' },
    ]);
    // Identical boxes still share one exported image.
    expect(nodes[0]!.key).not.toContain('sq1');
  });

  it('read-only draws no chrome; the editable page adds print-hidden select and drag', () => {
    const [node] = graphNodes(buildTranslateFixture());
    const plain = renderToStaticMarkup(<AnswerGraphOnPage node={node!} language="en" />);
    expect(plain).not.toContain('data-print-hide');
    expect(plain).not.toContain('<button');

    const controls = { scale: 1, onSelect: () => {}, onResize: () => {} };
    const idle = renderToStaticMarkup(<AnswerGraphOnPage node={node!} language="en" controls={controls} />);
    expect(idle).toMatch(/<button[^>]*data-print-hide/);
    expect(idle).not.toContain('ns-resize');

    const selected = renderToStaticMarkup(
      <AnswerGraphOnPage
        node={node!}
        language="en"
        controls={{ ...controls, selectedKey: answerGraphKey(node!.owner!) }}
      />,
    );
    expect(selected).toMatch(/<button[^>]*aria-label="Drag to change the height"[^>]*data-print-hide/);
    expect(selected).toContain('ns-resize');
  });
});

describe('resizing and removing a graph answer space', () => {
  beforeEach(() => {
    useWorksheetStore.setState({
      worksheet: buildTranslateFixture(),
      past: [],
      future: [],
      dirty: false,
      readOnly: false,
    });
  });
  const store = () => useWorksheetStore.getState();

  it('sets whole lines at each level, clamped 6 to 40, one undo step each', () => {
    store().resizeAnswerGraph({ questionId: 'sq2' }, 23.6);
    expect(structured(store().worksheet, 'sq2').answerGraph?.lines).toBe(24);
    store().resizeAnswerGraph({ questionId: 'sq1', partId: 'sq1-a' }, 99);
    expect(structured(store().worksheet, 'sq1').parts[0]!.answerGraph?.lines).toBe(40);
    store().resizeAnswerGraph({ questionId: 'sq1', partId: 'sq1-a', subPartId: 'sq1-a-i' }, 2);
    expect(structured(store().worksheet, 'sq1').parts[0]!.subParts![0]!.answerGraph?.lines).toBe(6);
    // Unchanged content otherwise: the titles ride along.
    expect(structured(store().worksheet, 'sq2').answerGraph?.xTitle).toBeDefined();
    // The sub-part was already 6, so its clamped drag was no change and cost no undo.
    expect(store().past).toHaveLength(2);
    store().undo();
    expect(structured(store().worksheet, 'sq1').parts[0]!.answerGraph?.lines).toBe(6);
  });

  it('a stale or box-less address changes nothing', () => {
    const before = store().worksheet;
    expect(applyAnswerGraph(before, { questionId: 'gone' }, () => undefined)).toBe(before);
    expect(applyAnswerGraph(before, { questionId: 'sq1', partId: 'nope' }, () => undefined)).toBe(before);
    store().resizeAnswerGraph({ questionId: 'sq2' }, 8);
    expect(store().past).toHaveLength(0);
  });

  it('removes only the box', () => {
    store().removeAnswerGraph({ questionId: 'sq1', partId: 'sq1-a' });
    const part = structured(store().worksheet, 'sq1').parts[0]!;
    expect('answerGraph' in part).toBe(false);
    expect(part.subParts![0]!.answerGraph).toBeDefined();
  });
});
