import { createDiagramBlock, DEFAULT_DIAGRAM_SIZE, newId } from './factories';
import { getDiagramTemplate } from './diagramTemplates';
import { CURRENT_SCHEMA_VERSION, migrate, writtenSchemaVersion } from './migrations';
import { biTextExcerpt } from './excerpt';
import { plain } from './text';
import { diagramSize } from '@/render/diagram';
import type { DiagramBlock, FontPair, LanguageMode } from './types';

/**
 * A saved graph (Graphs 圖表庫): a `DiagramBlock` outside any worksheet, so every
 * renderer, the canvas and the PNG path work on it unchanged. Never a worksheet: it
 * never enters the worksheet index, the dashboard or the question bank.
 *
 * **Migration reuses the worksheet chain** (`migrateGraph`): the block is wrapped in a
 * minimal worksheet at its own `schemaVersion`, run through `migrate()`, and unwrapped,
 * so a future diagram migration covers saved graphs with no second chain to forget.
 */
export interface SavedGraph {
  id: string;
  /** The filing name; never printed (like `Worksheet.name`). */
  name: string;
  block: DiagramBlock;
  /** Which side(s) its labels draw in. */
  language: LanguageMode;
  fonts: FontPair;
  /** The worksheet schema version: in memory this build's, stored as `writtenSchemaVersion`. */
  schemaVersion: number;
  templateId?: string;
  createdAt: string;
  updatedAt: string;
  /** Top-level fields a newer build wrote, kept through a rewrite. */
  __unknown?: Record<string, unknown>;
}

/** Every top-level field this build reads; anything else rides in `__unknown`. */
export const GRAPH_KNOWN_KEYS = new Set([
  'id',
  'name',
  'block',
  'language',
  'fonts',
  'schemaVersion',
  'templateId',
  'createdAt',
  'updatedAt',
]);

export const DEFAULT_GRAPH_FONTS: FontPair = { latin: 'Times New Roman', eastAsia: 'PMingLiU' };
const LANGUAGES: LanguageMode[] = ['en', 'zh', 'bilingual'];

export class GraphSchemaError extends Error {}

/** The name a new graph starts with: its template's, else "Untitled graph". */
export function defaultGraphName(templateId?: string): string {
  const template = templateId ? getDiagramTemplate(templateId) : undefined;
  return template && templateId !== 'blank' ? plain(template.name.en) : 'Untitled graph';
}

/** A new graph from a diagram template (or blank axes), measured for its language. */
export function createGraph(
  templateId = 'blank',
  language: LanguageMode = 'en',
  now = new Date().toISOString(),
): SavedGraph {
  const block = createDiagramBlock(templateId, DEFAULT_DIAGRAM_SIZE.widthPx);
  return {
    id: newId(),
    name: defaultGraphName(templateId),
    block: { ...block, ...diagramSize(block.diagram, block.widthPx, language) },
    language,
    fonts: { ...DEFAULT_GRAPH_FONTS },
    schemaVersion: CURRENT_SCHEMA_VERSION,
    templateId,
    createdAt: now,
    updatedAt: now,
  };
}

/** Saved by a build newer than this one: opened read-only, never overwritten. */
export function isGraphNewerThanBuild(graph: Pick<SavedGraph, 'schemaVersion'>): boolean {
  return graph.schemaVersion > CURRENT_SCHEMA_VERSION;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

const WRAPPER_QUESTION = 'graph';

/**
 * Any stored graph → a current one. Throws `GraphSchemaError` when it is not a graph.
 * Pure: never mutates its input. A newer graph keeps its `schemaVersion` (read-only).
 */
export function migrateGraph(raw: unknown): SavedGraph {
  if (!isRecord(raw)) throw new GraphSchemaError('Not a saved graph.');
  const block = raw.block;
  if (!isRecord(block) || block.kind !== 'diagram' || !isRecord(block.diagram)) {
    throw new GraphSchemaError('A saved graph has no diagram.');
  }
  if (typeof raw.id !== 'string' || !raw.id) throw new GraphSchemaError('A saved graph has no id.');

  const version = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 1;
  // The block sits where a worksheet keeps a figure: a question's stem.
  let worksheet;
  try {
    worksheet = migrate({
      schemaVersion: version,
      id: raw.id,
      title: { en: [], zh: [] },
      instructions: { en: [], zh: [] },
      questions: [{ id: WRAPPER_QUESTION, type: 'structured', blocks: [block], parts: [] }],
      layout: [],
      flow: [{ type: 'question', id: WRAPPER_QUESTION }],
      ...(isRecord(raw.fonts) ? { fonts: raw.fonts } : {}),
    });
  } catch (cause) {
    throw new GraphSchemaError(cause instanceof Error ? cause.message : 'Unreadable graph.');
  }
  const migrated = worksheet.questions.find((question) => question.id === WRAPPER_QUESTION)?.blocks[0];
  if (!migrated || migrated.kind !== 'diagram') throw new GraphSchemaError('A saved graph lost its diagram.');

  const unknown: Record<string, unknown> = { ...(isRecord(raw.__unknown) ? raw.__unknown : {}) };
  for (const [key, value] of Object.entries(raw)) {
    if (!GRAPH_KNOWN_KEYS.has(key) && key !== '__unknown') unknown[key] = value;
  }
  const now = new Date().toISOString();
  const graph: SavedGraph = {
    id: raw.id,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : 'Untitled graph',
    block: migrated,
    language: LANGUAGES.includes(raw.language as LanguageMode) ? (raw.language as LanguageMode) : 'en',
    fonts: worksheet.fonts ?? { ...DEFAULT_GRAPH_FONTS },
    schemaVersion: worksheet.schemaVersion,
    // Key order as `createGraph` writes it, so an unchanged graph stringifies identically.
    ...(typeof raw.templateId === 'string' ? { templateId: raw.templateId } : {}),
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : typeof raw.createdAt === 'string' ? raw.createdAt : now,
  };
  if (Object.keys(unknown).length > 0) graph.__unknown = unknown;
  return graph;
}

/** What is stored: the graph with a newer build's fields spliced back, at the version its content needs. */
export function serializeGraph(graph: SavedGraph): Record<string, unknown> {
  const { __unknown, ...rest } = graph;
  const out: Record<string, unknown> = { ...(__unknown ?? {}), ...rest };
  out.schemaVersion = writtenSchemaVersion(graph.schemaVersion, out);
  return out;
}

export function parseGraph(json: string): SavedGraph {
  return migrateGraph(JSON.parse(json));
}

export function stringifyGraph(graph: SavedGraph): string {
  return JSON.stringify(serializeGraph(graph), null, 2);
}

/**
 * A copy under a new id, named apart. The geometry keeps its ids: they address things
 * inside this one graph only.
 */
export function duplicateGraph(graph: SavedGraph, id = newId(), now = new Date().toISOString()): SavedGraph {
  return { ...graph, id, name: `${graph.name} (copy)`, createdAt: now, updatedAt: now };
}

/** The graph with its labels in `language`, re-measured (the box follows the labels). */
export function withGraphLanguage(graph: SavedGraph, language: LanguageMode): SavedGraph {
  const { block } = graph;
  return { ...graph, language, block: { ...block, ...diagramSize(block.diagram, block.widthPx, language) } };
}

/**
 * A worksheet's copy of a saved graph: a deep clone under a fresh block id, so nothing
 * links back (later edits to the graph never reach the worksheet). Diagram-internal ids
 * are kept (`lineage.ts`). Re-measured for the worksheet's language at `widthPx`.
 */
export function graphBlockCopy(
  graph: SavedGraph,
  language: LanguageMode,
  widthPx: number = graph.block.widthPx,
  id = newId(),
): DiagramBlock {
  const block = structuredClone(graph.block);
  return { ...block, id, ...diagramSize(block.diagram, widthPx, language) };
}

/** A diagram re-based on a saved graph's geometry: the block keeps its id, width and words. */
export function rebaseOnGraph(block: DiagramBlock, graph: SavedGraph, language: LanguageMode): DiagramBlock {
  const diagram = structuredClone(graph.block.diagram);
  return { ...block, ...diagramSize(diagram, block.widthPx, language), diagram };
}

/** A worksheet diagram as a new saved graph, named from its title (else "Untitled graph"). */
export function graphFromBlock(
  block: DiagramBlock,
  language: LanguageMode,
  fonts: FontPair = DEFAULT_GRAPH_FONTS,
  id = newId(),
  now = new Date().toISOString(),
): SavedGraph {
  const copy = structuredClone(block);
  const name = biTextExcerpt(copy.diagram.title, language).replace(/\s+/g, ' ').trim().slice(0, 120);
  const templateId = copy.diagram.templateId;
  return {
    id,
    name: name || 'Untitled graph',
    block: { ...copy, id: newId(), ...diagramSize(copy.diagram, copy.widthPx, language) },
    language,
    fonts: { ...fonts },
    schemaVersion: CURRENT_SCHEMA_VERSION,
    ...(typeof templateId === 'string' ? { templateId } : {}),
    createdAt: now,
    updatedAt: now,
  };
}

/** A file name from the graph's name: safe on every OS, never empty. */
export function graphFileName(graph: Pick<SavedGraph, 'name'>, extension: string): string {
  const stem = graph.name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80);
  return `${stem || 'Graph'}.${extension}`;
}
