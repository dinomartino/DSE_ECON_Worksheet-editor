import { describe, expect, it } from 'vitest';
import frozen from './diagramTemplatesStored.frozen.json';
import type { Diagram } from '@/model/diagram';
import { resolveDiagram } from '@/model/diagramAnchors';
import { buildFromTemplate } from '@/model/diagramTemplates';
import { diagramSize, diagramSvg } from './diagram';

/**
 * Template diagrams as the build *before* template shift arrows followed their curves
 * inserted them (fixed arrows), with the SVG that build drew. A diagram already in a
 * document keeps its stored geometry, so it must still draw byte-identically. Never
 * regenerate the fixture to make a test pass.
 */
const cases = frozen as unknown as Record<string, { diagram: Diagram; svg: Record<'en' | 'bilingual', string> }>;

describe('template diagrams saved before shift arrows followed', () => {
  it('render byte-identically', () => {
    for (const [id, { diagram, svg }] of Object.entries(cases)) {
      for (const language of ['en', 'bilingual'] as const) {
        const size = diagramSize(diagram, 400, language);
        expect(diagramSvg(diagram, { ...size, language }), `${id}|${language}`).toBe(svg[language]);
      }
    }
  });

  it('keep their arrows where they were stored', () => {
    for (const { diagram } of Object.values(cases)) {
      expect(diagram.arrows.every((a) => !a.follows)).toBe(true);
      expect(resolveDiagram(diagram).arrows).toBe(diagram.arrows);
    }
  });

  it('are the templates whose fresh inserts now follow', () => {
    for (const id of Object.keys(cases)) expect(buildFromTemplate(id).arrows.every((a) => a.follows), id).toBe(true);
  });
});
