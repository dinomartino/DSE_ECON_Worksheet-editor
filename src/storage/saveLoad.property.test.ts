import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { holds } from '@/test/property';
import { TINY_PNG, withFlow } from '@/test/fixtures';
import v1Published from '@/test/corpus/v1-published.json';
import v1Mcq from '@/test/corpus/v1-mcq.json';
import v2Published from '@/test/corpus/v2-published.json';
import v2Optional from '@/test/corpus/v2-optional-sections.json';
import v3Chart from '@/test/corpus/v3-chart.json';
import v3Stakeholder from '@/test/corpus/v3-stakeholder.json';
import v4AnswerBlocks from '@/test/corpus/v4-answer-blocks.json';
import v4FigureGrid from '@/test/corpus/v4-figure-grid.json';
import v4FlowFigures from '@/test/corpus/v4-flow-figures.json';
import flow087 from '@/test/corpus/flow-v0.8.7.json';
import flow091 from '@/test/corpus/flow-v0.9.1.json';
import flow0100 from '@/test/corpus/flow-v0.10.0.json';
import flow0101 from '@/test/corpus/flow-v0.10.1.json';
import bankPaper from '@/test/corpus/bank-v0.6.0-paper.json';
import bankBank from '@/test/corpus/bank-v0.6.0-bank.json';
import { createDiagramBlock, createImageBlock, createWorksheet } from '@/model/factories';
import type { MarkScheme } from '@/model/markSchemeTypes';
import { CURRENT_SCHEMA_VERSION, isNewerThanBuild } from '@/model/migrations';
import type {
  AnswerKeyPreset,
  BiText,
  ContentBlock,
  InlineRun,
  McqQuestion,
  Question,
  QuestionPart,
  StructuredQuestion,
  Worksheet,
} from '@/model/types';
import { parseWorksheet, stringifyWorksheet } from './document';

/**
 * Property tests for save → load (k-0607): `parseWorksheet(stringifyWorksheet(doc))` is the
 * path every save and every open takes. The promise (AGENTS.md, SYSTEM_ARCHITECTURE.md §
 * Schema evolution): a document comes back as it was saved; saving what was opened writes
 * the same bytes; a file from an older build opens with its content, whichever older
 * version it says it is; a file from a newer build opens (read-only) and keeps what this
 * build cannot read.
 */

// ---------------------------------------------------------------- generators

const char = fc.constantFrom('a', 'Q', '1', ' ', '.', '"', '\\', '\n', '\t', '需', '求', '價', '格', '％', '😀', '⁄');
const word = fc.string({ unit: char, minLength: 1, maxLength: 8 });

const run: fc.Arbitrary<InlineRun> = fc.record(
  {
    text: word,
    bold: fc.constant(true),
    italic: fc.constant(true),
    underline: fc.constant(true),
    vertAlign: fc.constantFrom('superscript', 'subscript'),
    fontSize: fc.integer({ min: 8, max: 20 }),
    color: fc.constantFrom('C00000', '1F4E79'),
  },
  { requiredKeys: ['text'] },
);

/** Bilingual text: either side may be empty (a paper written in one language). */
const biText: fc.Arbitrary<BiText> = fc.record({
  en: fc.array(run, { maxLength: 3 }),
  zh: fc.array(run, { maxLength: 3 }),
});

/** The templates a teacher reaches for most; each call builds a fresh, fully-formed diagram. */
const TEMPLATES = ['blank', 'supply-demand', 'demand-shift', 'price-ceiling', 'per-unit-tax', 'ad-as', 'ppc', 'lorenz', 'bar-chart'];
const diagram = fc.constantFrom(...TEMPLATES).map((template) => createDiagramBlock(template));

const paragraph = biText.map((text): ContentBlock => ({ kind: 'paragraph', id: '', text }));
const image = fc.record({ w: fc.integer({ min: 20, max: 600 }), h: fc.integer({ min: 20, max: 400 }), alt: biText }).map(
  ({ w, h, alt }): ContentBlock => ({ ...createImageBlock(TINY_PNG, w, h), altText: alt }),
);
const table = fc
  .record({ cols: fc.integer({ min: 1, max: 4 }), rows: fc.array(fc.array(biText, { minLength: 4, maxLength: 4 }), { minLength: 1, maxLength: 3 }), caption: fc.option(biText, { nil: undefined }) })
  .map(({ cols, rows, caption }): ContentBlock => ({
    kind: 'table',
    id: '',
    rows: rows.map((cells) => ({ id: '', cells: cells.slice(0, cols).map((text) => ({ id: '', text })) })),
    ...(caption ? { caption } : {}),
  }));

const block: fc.Arbitrary<ContentBlock> = fc.oneof(
  { weight: 4, arbitrary: paragraph },
  { weight: 2, arbitrary: table },
  { weight: 1, arbitrary: image },
  { weight: 2, arbitrary: diagram },
);
const blocks = fc.array(block, { maxLength: 3 });

/** A marking scheme, its points sometimes holding their own figures (k-0595). */
const scheme: fc.Arbitrary<MarkScheme> = fc.record(
  {
    routes: fc.array(
      fc.record({
        id: fc.constant(''),
        groups: fc.array(
          fc.record(
            {
              id: fc.constant(''),
              heading: biText,
              each: fc.integer({ min: 1, max: 3 }),
              take: fc.integer({ min: 1, max: 4 }),
              max: fc.integer({ min: 0, max: 8 }),
              points: fc.array(
                fc.record(
                  {
                    id: fc.constant(''),
                    text: biText,
                    marks: fc.integer({ min: 0, max: 4 }),
                    alternatives: fc.array(biText, { minLength: 1, maxLength: 2 }),
                    blocks: fc.array(fc.oneof(diagram, table, paragraph), { minLength: 1, maxLength: 2 }),
                  },
                  { requiredKeys: ['id', 'text'] },
                ),
                { maxLength: 4 },
              ),
            },
            { requiredKeys: ['id', 'points'] },
          ),
          { minLength: 1, maxLength: 2 },
        ),
      }),
      { minLength: 1, maxLength: 2 },
    ),
    levels: fc.array(fc.record({ id: fc.constant(''), min: fc.integer({ min: 1, max: 4 }), max: fc.integer({ min: 2, max: 8 }), descriptor: biText }), { minLength: 1, maxLength: 3 }),
    ec: fc.record({ max: fc.constant(2), descriptors: fc.array(fc.record({ id: fc.constant(''), marks: fc.integer({ min: 1, max: 2 }), text: biText }), { maxLength: 2 }) }),
    display: fc.constant('paragraph' as const),
    contentMax: fc.integer({ min: 0, max: 12 }),
  },
  { requiredKeys: ['routes'] },
);

/**
 * A model answer in the shape the editor keeps it in memory (`withAnswerBlocks`): text and
 * at most one diagram in the old fields, or `answerBlocks` holding more than a lone diagram.
 */
const answerFields = fc.oneof(
  fc.record({ answer: biText, answerDiagram: diagram }, { requiredKeys: [] }),
  fc
    .tuple(fc.option(biText, { nil: undefined }), fc.array(block, { minLength: 1, maxLength: 3 }))
    .filter(([, list]) => !(list.length === 1 && list[0].kind === 'diagram'))
    .map(([answer, answerBlocks]) => ({ ...(answer ? { answer } : {}), answerBlocks })),
);

const leaf = fc.record(
  {
    blocks,
    marks: fc.integer({ min: 0, max: 12 }),
    scheme,
    answerSpace: fc.integer({ min: 0, max: 20 }),
    tags: fc.array(fc.constantFrom('C', 'C.ped', 'E', 'my tag'), { maxLength: 2 }),
  },
  { requiredKeys: ['blocks'] },
);

const part: fc.Arbitrary<QuestionPart> = fc
  .tuple(leaf, answerFields, fc.option(fc.array(fc.tuple(leaf, answerFields).map(([l, a]) => ({ ...l, ...a, id: '' })), { minLength: 1, maxLength: 2 }), { nil: undefined }))
  .map(([l, a, subParts]) => ({ ...l, ...a, id: '', ...(subParts ? { subParts } : {}) }));

const structured: fc.Arbitrary<Question> = fc
  .record({ blocks, parts: fc.array(part, { maxLength: 3 }), showTotalMarks: fc.boolean(), keepOnOnePage: fc.constant(true as const) }, { requiredKeys: ['blocks', 'parts'] })
  .map((q): StructuredQuestion => ({ ...q, id: '', type: 'structured' }));

const mcq: fc.Arbitrary<Question> = fc
  .record(
    {
      blocks,
      statements: fc.array(biText, { minLength: 1, maxLength: 4 }),
      options: fc.array(fc.record({ id: fc.constant(''), text: biText, rationale: biText }, { requiredKeys: ['id', 'text'] }), { minLength: 2, maxLength: 4 }),
      answerIndex: fc.integer({ min: 0, max: 3 }),
      explanation: biText,
      optionLayout: fc.constantFrom('stacked', 'inline', 'columns2'),
    },
    { requiredKeys: ['blocks', 'options', 'answerIndex'] },
  )
  .map((q): McqQuestion => ({ ...q, id: '', type: 'mcq', marks: 1, answerIndex: q.answerIndex % q.options.length }));

/**
 * Every id unique, as the editor makes them (a duplicate is repaired on open, `dedupeIds`,
 * which would rightly change the document). A diagram's own ids are its business and are
 * already unique: each one is freshly built.
 */
function withUniqueIds<T>(value: T): T {
  let next = 0;
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== 'object') return node;
    return Object.fromEntries(
      Object.entries(node).map(([key, child]) => {
        if (key === 'id' && typeof child === 'string') return [key, `k${next++}`];
        if (key === 'diagram') return [key, child];
        return [key, walk(child)];
      }),
    );
  };
  return walk(value) as T;
}

const settings = fc.record(
  {
    title: biText,
    name: word,
    baseFontSize: fc.integer({ min: 9, max: 14 }),
    justifyText: fc.boolean(),
    lineSpacing: fc.constantFrom(1, 1.5, 2),
    showQuestionSources: fc.boolean(),
    examGapLines: fc.integer({ min: 0, max: 4 }),
    answerKeyLayout: fc.record({ preset: fc.constantFrom<AnswerKeyPreset>('classic', 'hkeaa', 'suggested', 'detailed') }),
  },
  { requiredKeys: [] },
);

const worksheet: fc.Arbitrary<Worksheet> = fc
  .record({ questions: fc.array(fc.oneof(mcq, structured), { maxLength: 4 }), settings })
  .map(({ questions, settings: extra }) => withFlow({ ...createWorksheet(), ...extra }, withUniqueIds(questions)));

/** What a saved file looks like on disk. */
const fileOf = (doc: Worksheet) => JSON.parse(stringifyWorksheet(doc)) as Record<string, unknown>;

/** A JSON value a newer build might store under a key this build has never heard of. */
const futureValue = fc.jsonValue({ maxDepth: 2 }).filter((value) => !Object.is(value, -0));
const futureKeys = fc.dictionary(
  fc.constantFrom('futureFeature', 'studioNotes', 'x-sync', 'lessonPlan'),
  futureValue,
  { minKeys: 1, maxKeys: 3 },
);

// ---------------------------------------------------------------- properties

describe('save → load (property)', { timeout: 60_000 }, () => {
  it('a document comes back exactly as it was saved', () => {
    holds(
      fc.property(worksheet, (doc) => {
        expect(parseWorksheet(stringifyWorksheet(doc))).toEqual(doc);
      }),
      60,
    );
  });

  it('saving what was opened writes the same bytes', () => {
    holds(
      fc.property(worksheet, (doc) => {
        const saved = stringifyWorksheet(doc);
        expect(stringifyWorksheet(parseWorksheet(saved))).toBe(saved);
      }),
      60,
    );
  });

  it('a file says a version this build reads, and a point figure anywhere marks it 4 (k-0595)', () => {
    holds(
      fc.property(worksheet, (doc) => {
        const file = fileOf(doc);
        const version = file.schemaVersion as number;
        expect(version).toBeGreaterThanOrEqual(1);
        expect(version).toBeLessThanOrEqual(CURRENT_SCHEMA_VERSION);
        expect(isNewerThanBuild(parseWorksheet(JSON.stringify(file)))).toBe(false);
        const hasPointFigure = doc.questions.some(
          (q) =>
            q.type === 'structured' &&
            q.parts.some((p) =>
              [p, ...(p.subParts ?? [])].some((leafOf) =>
                (leafOf.scheme?.routes ?? []).some((r) => r.groups.some((g) => g.points.some((pt) => (pt.blocks ?? []).length > 0))),
              ),
            ),
        );
        if (hasPointFigure) expect(version).toBe(4);
      }),
      60,
    );
  });

  it('a file opens the same whichever older version it says it was written at', () => {
    holds(
      fc.property(worksheet, fc.nat(), (doc, pick) => {
        const file = fileOf(doc);
        const written = file.schemaVersion as number;
        const loaded = parseWorksheet(JSON.stringify(file));
        // Any version from the one it needs up to this build's, or none at all (= 1).
        const labels: Array<number | undefined> = [];
        for (let v = written; v <= CURRENT_SCHEMA_VERSION; v += 1) labels.push(v);
        if (written === 1) labels.push(undefined);
        const label = labels[pick % labels.length];
        const { schemaVersion: _drop, ...rest } = file;
        void _drop;
        const relabelled = label === undefined ? rest : { ...rest, schemaVersion: label };
        expect(parseWorksheet(JSON.stringify(relabelled))).toEqual(loaded);
      }),
      60,
    );
  });

  it('a newer build’s file opens read-only and keeps what this build cannot read', () => {
    holds(
      fc.property(worksheet, futureKeys, fc.integer({ min: 1, max: 5 }), (doc, extra, ahead) => {
        const file = { ...fileOf(doc), ...extra, schemaVersion: CURRENT_SCHEMA_VERSION + ahead };
        const loaded = parseWorksheet(JSON.stringify(file));
        expect(isNewerThanBuild(loaded)).toBe(true);
        expect(loaded.questions).toEqual(doc.questions);
        expect(JSON.parse(stringifyWorksheet(loaded))).toEqual(file);
      }),
      60,
    );
  });
});

/**
 * The frozen files older builds wrote (`src/test/corpus`, never regenerated). Each must open
 * whatever version it is relabelled to between its own and this build's, keep a newer
 * build's extra keys, and reach a fixed point after one open.
 */
const CORPUS: Array<[string, Record<string, unknown>]> = Object.entries({
  v1Published,
  v1Mcq,
  v2Published,
  v2Optional,
  v3Chart,
  v3Stakeholder,
  v4AnswerBlocks,
  v4FigureGrid,
  v4FlowFigures,
  flow087,
  flow091,
  flow0100,
  flow0101,
  bankPaper,
  bankBank,
}) as Array<[string, Record<string, unknown>]>;

describe('older files (property over the frozen corpus)', { timeout: 60_000 }, () => {
  it('open with their content, at every version label from their own to this build’s, and settle after one open', () => {
    holds(
      fc.property(fc.constantFrom(...CORPUS), fc.nat(), ([name, file], pick) => {
        const own = typeof file.schemaVersion === 'number' ? file.schemaVersion : 1;
        const label = own + (pick % (CURRENT_SCHEMA_VERSION - own + 1));
        const opened = parseWorksheet(JSON.stringify(file));
        const relabelled = parseWorksheet(JSON.stringify({ ...file, schemaVersion: label }));
        expect(relabelled, name).toEqual(opened);
        expect((opened.questions ?? []).length, name).toBe(((file.questions as unknown[]) ?? []).length);
        const resaved = stringifyWorksheet(opened);
        expect(stringifyWorksheet(parseWorksheet(resaved)), name).toBe(resaved);
      }),
      60,
    );
  });

  it('keep a newer build’s unknown keys through open and save', () => {
    holds(
      fc.property(fc.constantFrom(...CORPUS), futureKeys, ([name, file], extra) => {
        const opened = parseWorksheet(JSON.stringify({ ...file, ...extra }));
        const saved = JSON.parse(stringifyWorksheet(opened)) as Record<string, unknown>;
        for (const [key, value] of Object.entries(extra)) expect(saved[key], `${name}.${key}`).toEqual(value);
      }),
      60,
    );
  });
});
