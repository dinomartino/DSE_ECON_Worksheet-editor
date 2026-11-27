/**
 * The flow figures (k-0588) and the published-document promise, both ways, against files
 * the released builds themselves wrote and read (`scripts/flow-release-corpus.test.ts`,
 * run inside each release's own checkout):
 *
 * - **Old → new.** `flow-<tag>.json` is a worksheet of flow charts saved by v0.8.7, v0.9.1,
 *   v0.10.0 and v0.10.1. It opens here editable, keeps every word, re-saves byte for byte,
 *   and draws as that release drew it (`flow-<tag>-drawn.json`) — except the one thing
 *   changed on purpose: two arrows joining the same two boxes now run side by side
 *   instead of on top of each other.
 * - **New → old.** `flow-<tag>-reads-v4.json` records what each release did with
 *   `v4-flow-figures.json` (dashed arrows, loops, the grid, the key; written by this
 *   build): it opens, read-only under the "newer version" bar (so it can never be saved
 *   back without them), with every word kept and drawn.
 *
 * These files are frozen. Never regenerate them to make a test pass.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { isNewerThanBuild, migrate } from '@/model/migrations';
import { parseWorksheet, stringifyWorksheet } from '@/storage/document';
import { diagramSize, diagramSvg, flowChartLayout } from '@/render/diagram';
import { renderWorksheet } from '@/render/worksheet';
import type { Diagram } from '@/model/diagram';
import type { DiagramBlock, Worksheet } from '@/model/types';
import { dse2014q10, dse2021q23, dse2024q6, dse2026q5 } from '@/test/flowFixtures';

const RELEASES = ['v0.8.7', 'v0.9.1', 'v0.10.0', 'v0.10.1'] as const;
const read = (file: string) => readFileSync(`src/test/corpus/${file}`, 'utf8');

/** Every `{ text }` run with words, so "opens" cannot mean "opens empty". */
function words(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(words);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.text === 'string') return record.text.trim() ? [record.text] : [];
    return Object.values(record).flatMap(words);
  }
  return [];
}

const figure = (worksheet: Worksheet, questionId: string): DiagramBlock =>
  worksheet.questions.find((q) => q.id === questionId)!.blocks.find((b) => b.kind === 'diagram') as DiagramBlock;

const draw = (diagram: Diagram, language: 'en' | 'zh') => {
  const size = diagramSize(diagram, 460, language);
  return { ...size, svg: diagramSvg(diagram, { ...size, language }) };
};

describe.each(RELEASES)('flow charts saved by %s', (tag) => {
  const raw = read(`flow-${tag}.json`);
  const drawn = JSON.parse(read(`flow-${tag}-drawn.json`)).drawn as Record<
    string,
    Record<'en' | 'zh', { widthPx: number; heightPx: number; svg: string }>
  >;

  it('open editable here, with nothing unrecognised and every word', () => {
    const worksheet = migrate(JSON.parse(raw));
    expect(isNewerThanBuild(worksheet)).toBe(false);
    expect(worksheet.__unknown).toBeUndefined();
    expect(words(worksheet)).toEqual(words(JSON.parse(raw)));
    expect(Object.keys(drawn)).toEqual(['template', 'chain2021', 'ring', 'stagesInARow']);
  });

  it('round-trip byte for byte, still at the version that release wrote', () => {
    expect(stringifyWorksheet(parseWorksheet(raw))).toBe(raw.trimEnd());
  });

  it('draw as that release drew them: the template, the 2021 value-added chain, the ring', () => {
    const worksheet = migrate(JSON.parse(raw));
    for (const name of ['template', 'chain2021', 'ring']) {
      const diagram = figure(worksheet, `q-${name}`).diagram;
      for (const language of ['en', 'zh'] as const) {
        expect(draw(diagram, language), `${name} ${language}`).toEqual(drawn[name][language]);
      }
    }
  });

  it('draw a pair of opposite arrows side by side now, the boxes and words unchanged', () => {
    const diagram = figure(migrate(JSON.parse(raw)), 'q-stagesInARow').diagram;
    for (const language of ['en', 'zh'] as const) {
      const before = drawn.stagesInARow[language].svg;
      const after = draw(diagram, language).svg;
      expect(after).not.toBe(before);
      // The boxes keep their size and place across; the words over a pair now clear both
      // shafts, so the figure grows by at most the pair's spread (6 px a side).
      const boxes = (svg: string) =>
        (svg.match(/<rect x="[^"]*" y="[^"]*" width="[^"]*" height="[^"]*"/g) ?? []).map((r) =>
          r.replace(/ y="[^"]*"/, ''),
        );
      expect(boxes(after)).toEqual(boxes(before));
      expect(boxes(after)).toHaveLength(3);
      const height = (svg: string) => Number(svg.match(/height="([\d.]+)"/)![1]);
      expect(height(after) - height(before)).toBeGreaterThanOrEqual(0);
      expect(height(after) - height(before)).toBeLessThanOrEqual(12);
      const texts = (svg: string) => (svg.match(/<text[^>]*>.*?<\/text>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, ''));
      expect(texts(after)).toEqual(texts(before));
      // That release laid each pair on one line; this build 12 px apart.
      const layout = flowChartLayout(diagram, diagram.flow!, language);
      const y = (id: string) => layout.arrows.find((a) => a.arrow.id === id)!.y1;
      expect(Math.abs(y('ps') - y('sp'))).toBeCloseTo(12, 5);
      expect(Math.abs(y('st') - y('ts'))).toBeCloseTo(12, 5);
    }
  });
});

describe('the v4 flow figures corpus (written by this build)', () => {
  const raw = read('v4-flow-figures.json');

  it('opens editable here, with nothing unrecognised, and is written at 4', () => {
    const worksheet = migrate(JSON.parse(raw));
    expect(JSON.parse(raw).schemaVersion).toBe(4);
    expect(isNewerThanBuild(worksheet)).toBe(false);
    expect(worksheet.__unknown).toBeUndefined();
    expect(stringifyWorksheet(parseWorksheet(raw))).toBe(raw.trimEnd());
  });

  it('keeps each HKDSE figure exactly', () => {
    const worksheet = migrate(JSON.parse(raw));
    expect(figure(worksheet, 'q-circular').diagram.flow).toEqual(dse2026q5().flow);
    expect(figure(worksheet, 'q-stages').diagram.flow).toEqual(dse2014q10().flow);
    expect(figure(worksheet, 'q-households').diagram.flow).toEqual(dse2024q6().flow);
    expect(figure(worksheet, 'q-chain').diagram.flow).toEqual(dse2021q23().flow);
  });

  it('prints in English, Chinese and both', () => {
    const worksheet = migrate(JSON.parse(raw));
    for (const language of ['en', 'zh', 'bilingual'] as const) {
      expect(() => renderWorksheet(worksheet, { language, version: 'student' })).not.toThrow();
    }
  });
});

describe.each(RELEASES)('%s opening a v4 flow file (recorded in that release)', (tag) => {
  const record = JSON.parse(read(`flow-${tag}-reads-v4.json`));

  it('opens it, read-only, every word kept, the page printing', () => {
    expect(record.tag).toBe(tag);
    expect(record.opens).toBe(true);
    expect(record.storedVersion).toBe(4);
    expect(record.loadedVersion).toBe(4);
    expect(record.readOnly).toBe(true);
    expect(record.textLoaded).toBe(record.textInFile);
    expect(record.pageError).toBeNull();
  });

  it('keeps the fields it does not know on the chart, and draws every word of every figure', () => {
    expect(record.figures.map((f: { keptFields: unknown }) => f.keptFields)).toEqual([
      { layout: null, key: true, dashed: 2, routed: 4 },
      { layout: 'grid', key: false, dashed: 0, routed: 0 },
      { layout: 'grid', key: false, dashed: 0, routed: 0 },
      { layout: null, key: false, dashed: 0, routed: 0 },
    ]);
    // The key is the one thing an older build has no way to draw: its words are missing,
    // and only its words (the read-only bar asks the teacher to update).
    expect(record.figures.map((f: { wordsMissingFromDrawing: string[] }) => f.wordsMissingFromDrawing)).toEqual([
      ['Money flow', '貨幣流程', 'Real flow', '實質流程'],
      [],
      [],
      [],
    ]);
  });
});
