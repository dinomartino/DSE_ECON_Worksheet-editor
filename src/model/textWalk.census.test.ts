import { describe, expect, it } from 'vitest';
import v1Corpus from '@/test/corpus/v1-published.json';
import { buildAcceptanceWorksheet } from '@/test/fixtures';
import { buildMarkSchemeWorksheet } from '@/test/markSchemeFixture';
import { buildTranslateFixture } from '@/test/translateFixture';
import { assessmentTitleBlock, HEADER_FOOTER_PRESETS } from './bands';
import { guessRoles, planPreset, SHADE_PRESETS } from './diagramPresets';
import { DIAGRAM_TEMPLATES } from './diagramTemplates';
import { createDiagramBlock, createStructuredQuestion, createWorksheet } from './factories';
import { migrate } from './migrations';
import { createWorksheetFrom, type DocumentType } from './newWorksheet';
import { bi } from './text';
import { collectTexts } from './textWalk';
import type { BiText, DiagramBlock, Worksheet } from './types';

/**
 * The walker's coverage, proved structurally: every `{en: [], zh: []}` object anywhere in
 * a document must be one of its slots. A field the walker (or a type's `mapTexts`) misses
 * is invisible to translation and to the untranslated count — this is where it shows.
 */

const NEVER_VISITED = new Set(['__unknown', 'name']);

function structuralTexts(value: unknown, found = new Set<BiText>()): Set<BiText> {
  if (Array.isArray(value)) {
    for (const entry of value) structuralTexts(entry, found);
  } else if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.en) && Array.isArray(record.zh)) {
      found.add(record as unknown as BiText);
      return found;
    }
    for (const [key, entry] of Object.entries(record)) {
      if (!NEVER_VISITED.has(key)) structuralTexts(entry, found);
    }
  }
  return found;
}

/** One block per diagram template, and one per shade preset on the first template it fits. */
function diagramGallery(): Worksheet {
  const blocks: DiagramBlock[] = DIAGRAM_TEMPLATES.map((template) => createDiagramBlock(template.id));
  let id = 0;
  const mint = () => `preset-${(id += 1)}`;
  for (const preset of SHADE_PRESETS) {
    for (const block of blocks.slice(0, DIAGRAM_TEMPLATES.length)) {
      const plan = planPreset(block.diagram, preset, guessRoles(block.diagram, preset), mint);
      if (!('areas' in plan)) continue;
      blocks.push({ ...block, id: mint(), diagram: { ...block.diagram, areas: [...(block.diagram.areas ?? []), ...plan.areas] } });
      break;
    }
  }
  const question = { ...createStructuredQuestion(), blocks };
  return { ...createWorksheet(), questions: [question], flow: [] };
}

function presetDocuments(): Array<[string, Worksheet]> {
  const types: DocumentType[] = ['classroom', 'paper1', 'lqWorksheet', 'lqMock'];
  const docs: Array<[string, Worksheet]> = types.map((type) => [`preset ${type}`, createWorksheetFrom({ documentType: type })]);
  docs.push(['classroom with a cover', createWorksheetFrom({ cover: 'mcq', title: 'Mock', titleZh: '模擬' })]);
  const withBands = createWorksheet();
  withBands.bands = assessmentTitleBlock(bi('Economics', '經濟'), bi('Test 1', '測驗一'));
  for (const preset of HEADER_FOOTER_PRESETS) {
    const part = preset.edge === 'header' ? withBands.header! : withBands.footer!;
    part.bands = [...part.bands, ...preset.build()];
  }
  docs.push(['header and footer presets', withBands]);
  return docs;
}

function censusDocuments(): Array<[string, Worksheet]> {
  return [
    ['v1 corpus', migrate(structuredClone(v1Corpus))],
    ['acceptance fixture', buildAcceptanceWorksheet()],
    ['mark scheme fixture', buildMarkSchemeWorksheet()],
    ['kitchen sink', buildTranslateFixture()],
    ['diagram templates and presets', diagramGallery()],
    ...presetDocuments(),
  ];
}

describe('text walk census', () => {
  it.each(censusDocuments())('every {en, zh} in the %s is a slot, and nothing else is', (_, ws) => {
    const slots = collectTexts(ws);
    const walked = new Set(slots.map((slot) => slot.text));
    const structural = structuralTexts(ws);
    expect(structural.size).toBeGreaterThan(0);
    const missed = [...structural].filter((text) => !walked.has(text));
    const extra = [...walked].filter((text) => !structural.has(text));
    expect(missed, 'BiTexts the walker never visits').toEqual([]);
    expect(extra, 'slots that are not stored BiTexts').toEqual([]);
    expect(new Set(slots.map((slot) => slot.path)).size, 'paths are unique').toBe(slots.length);
  });

  it('the gallery carries every template and some preset areas', () => {
    expect(diagramGallery().questions[0].blocks.length).toBeGreaterThan(DIAGRAM_TEMPLATES.length);
  });

  it('the kitchen sink holds every slot kind the walker knows', () => {
    const kinds = new Set(collectTexts(buildTranslateFixture()).map((slot) => slot.kind));
    expect([...kinds].sort()).toEqual(
      [
        'title', 'instructions', 'heading', 'sectionHeading', 'partHeader',
        'stem', 'part', 'paragraph', 'statement', 'option',
        'answer', 'explanation', 'rationale', 'provenance',
        'schemePoint', 'schemeLevel', 'schemeEc',
        'tableCell', 'caption', 'sourceLabel', 'sourceFootnote', 'altText', 'labelListCell',
        'diagramTitle', 'axisTitle', 'tickLabel', 'diagramLabel', 'flowNode', 'bubble', 'speaker',
        'coverLine', 'coverField', 'bandText', 'wording', 'marginNote',
      ].sort(),
    );
  });
});
