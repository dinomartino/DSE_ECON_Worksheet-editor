import { describe, expect, it } from 'vitest';
import { collectDiagramNodes, collectDiagramNodesIn } from '@/export/diagramImage';
import { diagramImages } from '@/components/start/thumbnail';
import { DIAGRAM_TEMPLATES, buildFromTemplate } from '@/model/diagramTemplates';
import { questionLayer } from '@/model/diagramAnswers';
import type { LanguageMode, OutputMode } from '@/model/types';
import { buildAcceptanceWorksheet } from '@/test/fixtures';
import { buildAnswerLayerWorksheet, ppfAnswerDiagram } from '@/test/answerLayerFixture';
import { renderAnswerKey } from './answerKey';
import { ANSWER_INK, diagramPlot, diagramSize, diagramSvg } from './diagram';
import { withAnswerLayers, type RenderNode } from './ir';
import { renderWorksheet } from './worksheet';
import { requireQuestionType } from '@/registry';

/**
 * The answer layer through the one renderer and every route to it: the student version
 * never draws it, the teacher version and the answer key draw it in red, and a diagram
 * without one renders exactly as before.
 */

const size = { widthPx: 400, heightPx: 320, language: 'en' as LanguageMode };
const ANSWER_GROUP = /<g data-answer="" fill="#C00000">[\s\S]*?<\/g>/g;
const STUDENT: OutputMode = { language: 'en', version: 'student' };
const TEACHER: OutputMode = { language: 'en', version: 'teacher' };

describe('diagramSvg answers', () => {
  it('leaves the answer layer out by default and when hidden', () => {
    const svg = diagramSvg(ppfAnswerDiagram(), size);
    expect(svg).toBe(diagramSvg(ppfAnswerDiagram(), { ...size, answers: 'hide' }));
    expect(svg).not.toContain(ANSWER_INK);
    expect(svg).not.toContain('data-answer');
    expect(svg).not.toContain('>PPF<');
    expect(svg).not.toContain('A (10, 12.5)');
    // The blank axes are still there, with their title and ticks.
    expect(svg).toContain('Diagram 1');
    expect(svg).toContain('Good X');
    expect(svg).toContain('>25<');
  });

  it('draws the answer layer in red when shown', () => {
    const svg = diagramSvg(ppfAnswerDiagram(), { ...size, answers: 'show' });
    const groups = svg.match(ANSWER_GROUP) ?? [];
    expect(groups).toHaveLength(2);
    expect(groups.join('')).toContain('>PPF<');
    expect(groups.join('')).toContain('A (10, 12.5)');
    // Every stroke and dot in the layer is the answer ink, not black.
    expect(groups.join('')).not.toContain('"#000"');
    expect(groups.join('')).toContain(`stroke="${ANSWER_INK}"`);
  });

  it('keeps the frame and every question element where they were', () => {
    const shown = diagramSvg(ppfAnswerDiagram(), { ...size, answers: 'show' });
    const hidden = diagramSvg(ppfAnswerDiagram(), size);
    // Same canvas, same plot, and with the red groups taken out, the same bytes.
    expect(shown.replace(ANSWER_GROUP, '')).toBe(hidden);
    expect(diagramSize(ppfAnswerDiagram(), 400, 'en')).toEqual(diagramSize(questionLayer(ppfAnswerDiagram()), 400, 'en'));
    expect(diagramPlot(ppfAnswerDiagram(), size).plot).toEqual(diagramPlot(ppfAnswerDiagram(), { ...size, answers: 'show' }).plot);
  });

  it('measures the frame with the answer layer, so an answer span on an axis does not jump it', () => {
    const diagram = ppfAnswerDiagram();
    diagram.spans = [
      { id: 'sp', from: { x: 0.2, y: 0 }, to: { x: 0.6, y: 0 }, style: 'doubleArrow', along: 'x', label: { en: [{ text: 'Q' }], zh: [{ text: 'Q' }] }, answer: true },
    ];
    expect(diagramSvg(diagram, { ...size, answers: 'show' }).replace(ANSWER_GROUP, '')).toBe(diagramSvg(diagram, size));
  });

  it('renders an untouched diagram byte-identically whatever it is told', () => {
    for (const template of DIAGRAM_TEMPLATES) {
      const diagram = buildFromTemplate(template.id);
      for (const language of ['en', 'bilingual'] as LanguageMode[]) {
        const options = { ...diagramSize(diagram, 400, language), language };
        const plain = diagramSvg(diagram, options);
        expect(diagramSvg(diagram, { ...options, answers: 'show' })).toBe(plain);
        expect(diagramSvg(diagram, { ...options, answers: 'hide' })).toBe(plain);
        expect(plain).not.toContain('data-answer');
      }
    }
  });

  it('drops dependents gracefully: no crash, nothing dangling', () => {
    const diagram = ppfAnswerDiagram();
    // A question point on the answer curve, and an area edged by it.
    diagram.points = [{ id: 'q', at: { x: 0.4, y: 0.5 }, anchor: { on: 'ppf', x: { x: 0.4, y: 0 } }, label: { en: [{ text: 'Q' }], zh: [{ text: 'Q' }] } }];
    diagram.areas = [{ id: 'ar', band: { edges: [{ curve: 'ppf' }, { level: 0 }], from: 0, to: 0.8 }, label: { en: [{ text: 'feasible' }], zh: [{ text: 'feasible' }] } }];
    const student = diagramSvg(diagram, size);
    expect(student).not.toContain('>Q<');
    expect(student).not.toContain('feasible');
    const teacher = diagramSvg(diagram, { ...size, answers: 'show' });
    expect(teacher).toContain('>Q<');
    expect(teacher).toContain('feasible');
  });
});

describe('the answer layer through the walker', () => {
  const diagramsIn = (mode: OutputMode) => collectDiagramNodes(buildAnswerLayerWorksheet(), mode);

  it('marks the teacher version only', () => {
    expect(diagramsIn(STUDENT).map((n) => n.answers)).toEqual([undefined]);
    expect(diagramsIn(TEACHER).map((n) => n.answers)).toEqual([true]);
  });

  it('marks nothing on a document without an answer layer, and keeps the array', () => {
    const worksheet = buildAcceptanceWorksheet();
    const nodes = renderWorksheet(worksheet, TEACHER).items.flatMap((item) =>
      item.type === 'question' ? item.question.nodes : item.layout.nodes,
    );
    expect(JSON.stringify(nodes)).not.toContain('"answers"');
    expect(withAnswerLayers(nodes, TEACHER)).toBe(nodes);
  });

  it('reaches nested figures (source panels)', () => {
    const [node] = diagramsIn(TEACHER);
    const source: RenderNode = { kind: 'source', nodes: [{ ...node, answers: undefined }], framed: true, blockId: 's' };
    const [marked] = withAnswerLayers([source], TEACHER);
    expect(marked.kind === 'source' && marked.nodes[0].kind === 'diagram' && marked.nodes[0].answers).toBe(true);
  });

  it('re-renders on a Student/Teacher switch (the per-question cache keys on the mode)', () => {
    const worksheet = buildAnswerLayerWorksheet();
    const student = renderWorksheet(worksheet, STUDENT);
    const teacher = renderWorksheet(worksheet, TEACHER);
    expect(teacher.items[0]).not.toBe(student.items[0]);
  });

  it('gives the student and teacher exports their own pictures', () => {
    const worksheet = buildAnswerLayerWorksheet();
    const [student] = [...diagramImages(worksheet, STUDENT).values()];
    const [teacher] = [...diagramImages(worksheet, TEACHER).values()];
    expect(decodeURIComponent(student)).not.toContain(ANSWER_INK);
    expect(decodeURIComponent(teacher)).toContain(ANSWER_INK);
  });
});

describe('the answer key', () => {
  it('prints the question diagram with its answer layer under the part', () => {
    const nodes = renderAnswerKey(buildAnswerLayerWorksheet(), 'en');
    const diagrams = collectDiagramNodesIn(nodes);
    expect(diagrams).toHaveLength(1);
    expect(diagrams[0].answers).toBe(true);
  });

  it('counts a part answered by its drawn answer', () => {
    const worksheet = buildAnswerLayerWorksheet();
    const question = worksheet.questions[0];
    const facts = requireQuestionType(question).healthFacts?.(question as never);
    expect(facts?.unansweredParts).toBe(0);
  });

  it('adds nothing to the key of a document without one', () => {
    const worksheet = buildAcceptanceWorksheet();
    expect(JSON.stringify(renderAnswerKey(worksheet, 'en'))).not.toContain('"answers"');
  });
});
