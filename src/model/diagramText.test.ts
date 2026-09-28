import { describe, expect, it } from 'vitest';
import { fullDiagram } from '@/test/translateFixture';
import type { Diagram } from './diagram';
import { handleText, isTextHandle, setHandleText, type DiagramHandle } from './diagramDraw';
import { mapDiagramTexts } from './diagramText';
import { buildFromTemplate, createBlankDiagram } from './diagramTemplates';
import { bi } from './text';
import type { SlotKind } from './textSlots';
import type { BiText } from './types';

function visited(d: Diagram): Map<string, { text: BiText; kind: SlotKind }> {
  const seen = new Map<string, { text: BiText; kind: SlotKind }>();
  const out = mapDiagramTexts(d, (segment, text, kind) => {
    seen.set(segment, { text, kind });
    return text;
  });
  expect(out).toBe(d);
  return seen;
}

/** Writes `text` at one segment and nowhere else. */
const writeAt = (d: Diagram, at: string, text: BiText) =>
  mapDiagramTexts(d, (segment, current) => (segment === at ? text : current));

/**
 * Every handle kind, and the segment its text lives at (null: not text). Keyed by the
 * whole union, so a new handle kind fails to compile until it is placed here.
 */
const HANDLES: Record<DiagramHandle['kind'], [DiagramHandle, string][] | null> = {
  vertex: null, curve: null, point: null, arrowFrom: null, arrowTo: null, arrow: null,
  area: null, areaVertex: null, span: null, spanFrom: null, spanTo: null,
  label: [[{ kind: 'label', labelId: 'l1' }, 'label:l1']],
  curveLabel: [[{ kind: 'curveLabel', curveId: 'c1' }, 'curve:c1']],
  pointLabel: [[{ kind: 'pointLabel', pointId: 'pt1' }, 'point:pt1/label']],
  arrowLabel: [[{ kind: 'arrowLabel', arrowId: 'a1' }, 'arrow:a1']],
  pointTick: [
    [{ kind: 'pointTick', pointId: 'pt1', axis: 'x' }, 'point:pt1/xTick'],
    [{ kind: 'pointTick', pointId: 'pt1', axis: 'y' }, 'point:pt1/yTick'],
  ],
  axisTick: [
    [{ kind: 'axisTick', axis: 'x', tickId: 'xt1' }, 'x/tick:xt1'],
    [{ kind: 'axisTick', axis: 'y', tickId: 'yt1' }, 'y/tick:yt1'],
  ],
  axisTitle: [
    [{ kind: 'axisTitle', axis: 'x' }, 'x/title'],
    [{ kind: 'axisTitle', axis: 'y' }, 'y/title'],
  ],
  diagramTitle: [[{ kind: 'diagramTitle' }, 'title']],
  areaLabel: [[{ kind: 'areaLabel', areaId: 'ar1' }, 'area:ar1']],
  spanLabel: [[{ kind: 'spanLabel', spanId: 's1' }, 'span:s1']],
};

describe('mapDiagramTexts', () => {
  it('keeps parity with handleText for every text handle, reading and writing', () => {
    const d = fullDiagram();
    const seen = visited(d);
    for (const [kind, entries] of Object.entries(HANDLES)) {
      const probe = entries?.[0][0] ?? ({ kind } as DiagramHandle);
      expect(isTextHandle(probe), kind).toBe(entries !== null);
      for (const [handle, segment] of entries ?? []) {
        expect(seen.get(segment)?.text, segment).toBe(handleText(d, handle));
        const written = bi(`new ${segment}`, '新');
        expect(handleText(writeAt(d, segment, written), handle), segment).toBe(written);
        expect(handleText(setHandleText(d, handle, written), handle)).toEqual(
          handleText(writeAt(d, segment, written), handle),
        );
      }
    }
  });

  it('visits every plotted-diagram segment with its kind', () => {
    const kinds = Object.fromEntries([...visited(fullDiagram())].map(([segment, { kind }]) => [segment, kind]));
    expect(kinds).toEqual({
      title: 'diagramTitle',
      'x/title': 'axisTitle', 'y/title': 'axisTitle',
      'x/tick:xt1': 'tickLabel', 'y/tick:yt1': 'tickLabel',
      'curve:c1': 'diagramLabel',
      'point:pt1/label': 'diagramLabel', 'point:pt1/xTick': 'diagramLabel', 'point:pt1/yTick': 'diagramLabel',
      'label:l1': 'diagramLabel', 'arrow:a1': 'diagramLabel', 'span:s1': 'diagramLabel', 'area:ar1': 'diagramLabel',
    });
  });

  it('covers pie, flow and forum text', () => {
    const segments = (id: string) => [...visited(buildFromTemplate(id))].map(([segment, { kind }]) => `${kind} ${segment.replace(/:[^/]+/g, ':*')}`);
    expect(segments('pie')).toContain('diagramLabel pie/slice:*');
    expect(segments('flow')).toEqual(expect.arrayContaining([
      'flowNode flow/node:*', 'diagramLabel flow/arrow:*/label', 'diagramLabel flow/arrow:*/below',
    ]));
    expect(segments('forum')).toEqual(expect.arrayContaining(['speaker forum/bubble:*/speaker', 'bubble forum/bubble:*/text']));
  });

  it('keeps identity and never creates an optional field', () => {
    const blank = createBlankDiagram();
    expect(mapDiagramTexts(blank, (_, text) => text)).toBe(blank);
    const d = fullDiagram();
    delete d.curves[0].label;
    delete d.points[0].xTickLabel;
    const touched = mapDiagramTexts(d, (_, text) => ({ ...text }));
    expect('label' in touched.curves[0]).toBe(false);
    expect('xTickLabel' in touched.points[0]).toBe(false);
    expect(touched.curves).toBe(d.curves);
  });
});
