import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { collectDiagramNodes } from '@/export/diagramImage';
import { createDiagramBlock } from '@/model/factories';
import type { DiagramBlock, OutputMode, StructuredQuestion, VersionMode, Worksheet } from '@/model/types';
import { buildAnswerLayerWorksheet } from '@/test/answerLayerFixture';
import { DiagramCanvas } from '@/components/editor/DiagramCanvas';
import { ANSWER_INK } from './diagram';
import { diagramBlockSvg, diagramNodeSvg } from './diagramPage';

/**
 * The draw canvas's Preview draws what the page prints: `diagramBlockSvg` (the canvas)
 * against the walker's own node through `diagramNodeSvg` (the page), in both versions.
 */

function diagramBlockOf(worksheet: Worksheet): DiagramBlock {
  const question = worksheet.questions[0] as StructuredQuestion;
  const block = question.parts[0].blocks.find((b) => b.kind === 'diagram');
  if (!block || block.kind !== 'diagram') throw new Error('fixture has no diagram');
  return block;
}

const VERSIONS: VersionMode[] = ['student', 'teacher'];

describe("the canvas Preview's picture", () => {
  it('is the page’s picture, in the Student and the Teacher version', () => {
    const worksheet = buildAnswerLayerWorksheet();
    const block = diagramBlockOf(worksheet);
    for (const version of VERSIONS) {
      for (const language of ['en', 'bilingual'] as const) {
        const mode: OutputMode = { language, version };
        const [node] = collectDiagramNodes(worksheet, mode);
        expect(node.blockId).toBe(block.id);
        const page = diagramNodeSvg(node, language);
        expect(diagramBlockSvg(block, version, language)).toBe(page);
        // The answer layer is red in the Teacher version and absent from the Student one.
        if (version === 'teacher') expect(page).toContain(ANSWER_INK);
        else expect(page).not.toContain(ANSWER_INK);
      }
    }
  });

  it('is the same in both versions when there is no answer layer', () => {
    const block = createDiagramBlock('supply-demand');
    expect(diagramBlockSvg(block, 'teacher', 'en')).toBe(diagramBlockSvg(block, 'student', 'en'));
    expect(diagramBlockSvg(block, 'student', 'en')).not.toContain('data-answer');
  });

  it('opens the canvas in Edit, with Preview one click away', () => {
    const html = renderToStaticMarkup(
      createElement(DiagramCanvas, { block: diagramBlockOf(buildAnswerLayerWorksheet()), onChange: () => {} }),
    );
    expect(html).toMatch(/role="radiogroup" aria-label="Canvas mode"/);
    expect(html).toMatch(/aria-checked="true"[^>]*>Edit/);
    expect(html).toMatch(/aria-checked="false"[^>]*>Preview/);
    expect(html).not.toContain('data-canvas-preview');
  });
});
