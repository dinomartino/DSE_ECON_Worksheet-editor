import { describe, expect, it } from 'vitest';
import { createAnswerGraph } from '@/model/answerGraph';
import { buildFromTemplate } from '@/model/diagramTemplates';
import { bi } from '@/model/text';
import type { LanguageMode } from '@/model/types';
import { answerGraphNode, answerGraphSvg } from './answerGraph';
import { diagramSvg } from './diagram';

/**
 * Model output lands in labels (AI translation fills diagram and answer-graph text), and
 * the SVG is a string later shown as an image or inlined: every label must come out as
 * text, never markup.
 */

const PAYLOAD = '<img src=x onerror=alert(1)>';
const LANGUAGES: LanguageMode[] = ['en', 'zh', 'bilingual'];

function assertEscaped(svg: string) {
  expect(svg).not.toContain('<img');
  expect(svg).not.toMatch(/<[^>]*\sonerror=/);
  expect(svg).toContain('&lt;img src=x onerror=alert(1)&gt;');
}

describe('label text is escaped in the SVG', () => {
  it('in a diagram: title, curve label and free label, both sides', () => {
    const diagram = buildFromTemplate('ad-as');
    const hostile = bi(PAYLOAD, PAYLOAD);
    diagram.title = hostile;
    diagram.curves = diagram.curves.map((curve, index) => (index === 0 ? { ...curve, label: hostile } : curve));
    diagram.labels = [...(diagram.labels ?? []), { id: 'x1', at: { x: 0.5, y: 0.5 }, text: hostile }];
    for (const language of LANGUAGES) {
      assertEscaped(diagramSvg(diagram, { widthPx: 400, heightPx: 300, language }));
    }
  });

  it('in an answer graph: both axis titles', () => {
    const graph = { ...createAnswerGraph(), xTitle: bi(PAYLOAD, PAYLOAD), yTitle: bi(PAYLOAD, '') };
    for (const language of LANGUAGES) {
      assertEscaped(answerGraphSvg(answerGraphNode(graph), { widthPx: 400, heightPx: 300, language }));
    }
  });
});
