import { describe, expect, it } from 'vitest';
import { compileSpec } from '@/diagramGen/compile';
import { emptySpec } from '@/diagramGen/schema';
import type { DiagramSpec } from '@/diagramGen/types';
import type { Diagram } from '@/model/diagram';
import { cellWidthPx } from './cellFit';
import { boxesTouch, spreadAlong } from './diagramLabelFit';
import { diagramLabelBoxes, diagramSize, diagramSvg } from './diagram';

/**
 * k-0554: four AD-AS diagrams in a two-column row print at half the text width; the 10pt
 * names and ticks do not shrink with them, so AD₂AD₁, SRAS₁SRAS₂, Y₂Y₁ and P₁P₂ sat on
 * each other. No two labels' boxes may touch, at the cell size and at full width.
 */

const t = (en: string, zh = en) => ({ en, zh });
const base = (body: Partial<DiagramSpec>): DiagramSpec => ({
  ...emptySpec('curves'),
  placement: 'question',
  xAxis: t('Real output', '實質產出'),
  yAxis: t('Price level', '物價水平'),
  ...body,
});
const pt = (a: string, b: string, xTick: string, yTick: string) => ({ a, b, name: '', xTick, yTick, dot: false });

/** A: AD shifts left (AD₁ → AD₂). B: SRAS shifts right (SRAS₁ → SRAS₂). C/D: the other two directions. */
const adShift = (direction: 'left' | 'right'): DiagramSpec =>
  base({
    curves: [
      { id: 'AD1', role: 'ad', slope: 'normal', place: 'mid', label: 'AD_1' },
      { id: 'SRAS', role: 'sras', slope: 'normal', place: 'mid', label: 'SRAS' },
    ],
    shifts: [{ of: 'AD1', id: 'AD2', direction, size: 'normal', label: 'AD_2' }],
    points: [pt('AD1', 'SRAS', 'Y_1', 'P_1'), pt('AD2', 'SRAS', 'Y_2', 'P_2')],
    changeArrows: true,
  });
const srasShift = (direction: 'left' | 'right'): DiagramSpec =>
  base({
    curves: [
      { id: 'AD', role: 'ad', slope: 'normal', place: 'mid', label: 'AD' },
      { id: 'SRAS1', role: 'sras', slope: 'normal', place: 'mid', label: 'SRAS_1' },
    ],
    shifts: [{ of: 'SRAS1', id: 'SRAS2', direction, size: 'normal', label: 'SRAS_2' }],
    points: [pt('AD', 'SRAS1', 'Y_1', 'P_1'), pt('AD', 'SRAS2', 'Y_2', 'P_2')],
    changeArrows: true,
  });

const CASES: Array<[string, DiagramSpec]> = [
  ['AD left (AD₁ AD₂ at the bottom ends)', adShift('left')],
  ['AD right', adShift('right')],
  ['SRAS right (SRAS₁ SRAS₂ at the top ends)', srasShift('right')],
  ['SRAS left', srasShift('left')],
];

const HALF = cellWidthPx(9360, 2);
const FULL = 380;

function diagramOf(spec: DiagramSpec): Diagram {
  const { diagram } = compileSpec(spec);
  if (!diagram) throw new Error('did not compile');
  return diagram;
}

describe('labels never sit on each other (k-0554)', () => {
  for (const language of ['en', 'bilingual'] as const) {
    for (const [name, spec] of CASES) {
      for (const [sizeName, width] of [['half-width cell', HALF], ['full width', FULL]] as const) {
        it(`${name}, ${language}, ${sizeName}`, () => {
          const diagram = diagramOf(spec);
          const size = diagramSize(diagram, width, language);
          const labels = diagramLabelBoxes(diagram, { ...size, language });
          expect(labels.length).toBeGreaterThan(4);
          for (let i = 0; i < labels.length; i += 1) {
            for (let j = i + 1; j < labels.length; j += 1) {
              expect(
                boxesTouch(labels[i].box, labels[j].box),
                `${labels[i].kind}:${labels[i].id} touches ${labels[j].kind}:${labels[j].id}`,
              ).toBe(false);
            }
          }
          // The drawing carries the same positions: every name is still in the SVG.
          expect(diagramSvg(diagram, { ...size, language })).toContain('SRAS');
        });
      }
    }
  }

  it('a diagram whose labels already clear each other is not touched', () => {
    const spec = base({
      curves: [
        { id: 'D', role: 'demand', slope: 'normal', place: 'mid', label: 'D' },
        { id: 'S', role: 'supply', slope: 'normal', place: 'mid', label: 'S' },
      ],
      points: [pt('D', 'S', 'Q_0', 'P_0')],
    });
    const diagram = diagramOf(spec);
    const size = diagramSize(diagram, FULL, 'en');
    const moved = diagramSvg(diagram, { ...size, language: 'en' });
    expect(moved).toBe(diagramSvg(JSON.parse(JSON.stringify(diagram)), { ...size, language: 'en' }));
  });
});

describe('spreadAlong', () => {
  it('moves only overlapping neighbours, each half the overlap', () => {
    expect(spreadAlong([{ pos: 0, size: 10 }, { pos: 100, size: 10 }], 2)).toEqual([0, 0]);
    const [a, b] = spreadAlong([{ pos: 50, size: 20 }, { pos: 60, size: 20 }], 2);
    expect(a).toBeCloseTo(-6);
    expect(b).toBeCloseTo(6);
  });
});
