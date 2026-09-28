import type { EditTarget } from '@/render/ir';
import { getQuestionType } from '@/registry';
import { applyBandFieldSide } from './bandSegments';
import type { CoverPage } from './coverTypes';
import { mapDiagramTexts } from './diagramText';
import { resolveFlow } from './flow';
import type { MarkScheme } from './markSchemeTypes';
import { computeNumbering } from './numbering';
import { isSymbolOnly } from './symbols';
import {
  mapSame,
  missingSide,
  patch,
  type Side,
  type SlotGroup,
  type SlotKind,
  type SlotMeta,
  type SlotRole,
  type TextSlot,
  type TextVisitor,
  type TextWalker,
} from './textSlots';
import type {
  AnswerGraph,
  Band,
  BandField,
  BiText,
  ContentBlock,
  DiagramBlock,
  HeaderFooter,
  ImageBlock,
  LayoutElement,
  OutputMode,
  Question,
  TableBlock,
  Worksheet,
} from './types';

/**
 * The one identity-preserving walk over every BiText in a worksheet, in print order.
 * Collection, the untranslated count, scoping, Check terms and apply all go through it,
 * so they cannot disagree. A visit that changes nothing returns the same `Worksheet`.
 */

export interface WalkOptions {
  /** Called only for a DiagramBlock whose `diagram` object changed; returns the block to store. */
  onDiagramChanged?: (before: DiagramBlock, after: DiagramBlock) => DiagramBlock;
  /** Leave questions out (the toolbar counts them per question, cached). */
  skipQuestions?: boolean;
}

interface BlockOpts {
  role?: SlotRole;
  paragraphKind?: SlotKind;
}

/** Where a walker stands: its path, and what every slot below it inherits. */
interface Place {
  path: string;
  group: SlotGroup;
  questionId?: string;
  flowId?: string;
  blockIds: readonly string[];
  diagramPath?: string;
  label?: string;
  unprinted?: true;
}

interface Run {
  visit: TextVisitor;
  opts: WalkOptions;
  /** Paths handed out so far; a repeat gets "#2", "#3" (Duplicate keeps block ids). */
  claimed: Map<string, number>;
}

const isBiText = (value: unknown): value is BiText =>
  typeof value === 'object' && value !== null &&
  Array.isArray((value as BiText).en) && Array.isArray((value as BiText).zh);

/** A list that may be absent (or malformed in an old file) maps to itself. */
const each = <T>(items: T[] | undefined, fn: (item: T) => T): T[] | undefined =>
  Array.isArray(items) ? mapSame(items, fn) : items;

const DIAGRAM_LABELS: Partial<Record<SlotKind, string>> = {
  diagramTitle: 'figure title',
  axisTitle: 'axis title',
  tickLabel: 'tick label',
  diagramLabel: 'label',
  flowNode: 'box',
  bubble: 'speech bubble',
  speaker: 'speaker',
};

class Walk implements TextWalker {
  constructor(
    private readonly run: Run,
    private readonly at: Place,
  ) {}

  private claim(segment: string): string {
    const base = this.at.path ? `${this.at.path}/${segment}` : segment;
    const seen = this.run.claimed.get(base) ?? 0;
    this.run.claimed.set(base, seen + 1);
    return seen === 0 ? base : `${base}#${seen + 1}`;
  }

  private emit(path: string, text: BiText, meta: SlotMeta): BiText {
    if (!isBiText(text)) return text;
    const { group, questionId, flowId, blockIds, diagramPath, unprinted } = this.at;
    const { label: own, ...rest } = meta;
    const label = [this.at.label, own].filter(Boolean).join(' · ');
    const slot: TextSlot = { ...rest, path, text, group, blockIds };
    if (label) slot.label = label;
    if (unprinted) slot.unprinted = true;
    if (questionId !== undefined) slot.questionId = questionId;
    if (flowId !== undefined) slot.flowId = flowId;
    if (diagramPath !== undefined) slot.diagramPath = diagramPath;
    return this.run.visit(slot);
  }

  /** A child walker at `segment`; a label replaces the parent's, a block id is appended. */
  child(segment: string, extra: { label?: string; blockId?: string; diagram?: true } = {}): Walk {
    const path = this.claim(segment);
    return new Walk(this.run, {
      ...this.at,
      path,
      label: extra.label ?? this.at.label,
      blockIds: extra.blockId === undefined ? this.at.blockIds : [...this.at.blockIds, extra.blockId],
      diagramPath: extra.diagram ? path : this.at.diagramPath,
    });
  }

  /** The slot at this walker's own path (a paragraph, a table cell). */
  here(text: BiText, meta: SlotMeta): BiText {
    return this.emit(this.at.path, text, meta);
  }

  text(segment: string, text: BiText, meta: SlotMeta): BiText {
    return this.emit(this.claim(segment), text, meta);
  }

  optional(segment: string, text: BiText | undefined, meta: SlotMeta): BiText | undefined {
    return text === undefined ? text : this.text(segment, text, meta);
  }

  list(segment: string, texts: BiText[] | undefined, meta: (index: number) => SlotMeta): BiText[] | undefined {
    if (!Array.isArray(texts)) return texts;
    const w = this.child(segment);
    return mapSame(texts, (text, index) => w.text(String(index), text, meta(index)));
  }

  blocks(segment: string, blocks: ContentBlock[], opts?: BlockOpts): ContentBlock[] {
    if (!Array.isArray(blocks)) return blocks;
    const w = this.child(segment);
    return mapSame(blocks, (block) => w.block(`b:${block.id}`, block, opts));
  }

  optionalBlocks(segment: string, blocks: ContentBlock[] | undefined, opts?: BlockOpts): ContentBlock[] | undefined {
    return blocks === undefined ? blocks : this.blocks(segment, blocks, opts);
  }

  scope(segment: string, label?: string): TextWalker {
    return this.child(segment, { label });
  }

  unprinted(): Walk {
    return new Walk(this.run, { ...this.at, unprinted: true });
  }

  /** One content block at `segment` (`b:<id>`, or `figure`/`table` inside a figure row). */
  block(segment: string, block: ContentBlock, opts: BlockOpts = {}): ContentBlock {
    const role = opts.role ?? 'print';
    switch (block.kind) {
      case 'paragraph': {
        const w = this.child(segment, { blockId: block.id });
        const target: EditTarget = { kind: 'blockText', blockId: block.id };
        return patch(block, { text: w.here(block.text, { kind: opts.paragraphKind ?? 'paragraph', role, target }) });
      }
      case 'table':
        return this.table(segment, block, role);
      case 'image':
        return this.image(segment, block, role);
      case 'diagram':
        return this.diagramBlock(segment, block, role) ?? block;
      case 'source': {
        const w = this.child(segment, { blockId: block.id });
        return patch(block, {
          label: w.optional('label', block.label, {
            kind: 'sourceLabel', role, target: { kind: 'sourceLabel', blockId: block.id },
          }),
          blocks: w.blocks('blocks', block.blocks, { role }),
          footnote: w.optional('footnote', block.footnote, {
            kind: 'sourceFootnote', role, target: { kind: 'sourceFootnote', blockId: block.id },
          }),
        });
      }
      case 'figureRow': {
        const w = this.child(segment, { blockId: block.id });
        return patch(block, {
          figure: block.figure && (w.block('figure', block.figure, { role }) as ImageBlock | DiagramBlock),
          table: block.table && w.table('table', block.table, role),
        });
      }
      default:
        // A block kind from a newer build: carried through untouched.
        return block;
    }
  }

  private caption(w: Walk, caption: BiText | undefined, blockId: string, role: SlotRole) {
    return w.optional('caption', caption, { kind: 'caption', role, target: { kind: 'blockCaption', blockId } });
  }

  private table(segment: string, block: TableBlock, role: SlotRole): TableBlock {
    const w = this.child(segment, { blockId: block.id });
    const above = block.captionPlacement === 'above';
    const captionFirst = above ? this.caption(w, block.caption, block.id, role) : undefined;
    const rows = each(block.rows, (row) => {
      const rw = w.child(`row:${row.id}`);
      return patch(row, {
        cells: each(row.cells, (cell) => {
          // A cell covered by a merge never prints.
          const cw = cell.covered ? rw.child(`cell:${cell.id}`).unprinted() : rw.child(`cell:${cell.id}`);
          const target: EditTarget = { kind: 'tableCell', blockId: block.id, cellId: cell.id };
          return patch(cell, {
            text: cw.here(cell.text, { kind: 'tableCell', role, target }),
            image: cell.image && patch(cell.image, {
              altText: cw.text('alt', cell.image.altText, { kind: 'altText', role: 'meta', label: 'alt text' }),
            }),
          });
        }),
      });
    });
    const caption = above ? captionFirst : this.caption(w, block.caption, block.id, role);
    return patch(block, { caption, rows });
  }

  private image(segment: string, block: ImageBlock, role: SlotRole): ImageBlock {
    const w = this.child(segment, { blockId: block.id });
    return patch(block, {
      caption: this.caption(w, block.caption, block.id, role),
      altText: w.text('alt', block.altText, { kind: 'altText', role: 'meta', label: 'alt text' }),
    });
  }

  diagramBlock(segment: string, block: DiagramBlock | undefined, role: SlotRole): DiagramBlock | undefined {
    if (!block) return block;
    const w = this.child(segment, { blockId: block.id, diagram: true });
    const d = w.child('d');
    const diagram = block.diagram && mapDiagramTexts(block.diagram, (seg, text, kind) =>
      d.text(seg, text, { kind, role, fallsBack: true, label: DIAGRAM_LABELS[kind] }),
    );
    const altText = w.text('alt', block.altText, { kind: 'altText', role: 'meta', label: 'alt text' });
    const next = patch(block, { diagram, altText });
    const changed = this.run.opts.onDiagramChanged;
    return changed && diagram !== block.diagram ? changed(block, next) : next;
  }

  scheme(segment: string, scheme: MarkScheme | undefined): MarkScheme | undefined {
    if (!scheme) return scheme;
    const w = this.child(segment);
    const teacher = (kind: SlotKind, label?: string): SlotMeta => ({ kind, role: 'teacher', label });
    return patch(scheme, {
      routes: each(scheme.routes, (route) => {
        const rw = w.child(`route:${route.id}`);
        return patch(route, {
          groups: each(route.groups, (group) => {
            const gw = rw.child(`group:${group.id}`);
            return patch(group, {
              points: each(group.points, (point) => {
                const pw = gw.child(`point:${point.id}`);
                return patch(point, {
                  text: pw.here(point.text, teacher('schemePoint')),
                  alternatives: pw.list('alt', point.alternatives, (i) =>
                    teacher('schemePoint', `alternative ${i + 1}`),
                  ),
                });
              }),
            });
          }),
        });
      }),
      levels: each(scheme.levels, (level) =>
        patch(level, { descriptor: w.text(`level:${level.id}`, level.descriptor, teacher('schemeLevel')) }),
      ),
      ec: scheme.ec && patch(scheme.ec, {
        descriptors: each(scheme.ec.descriptors, (row) =>
          patch(row, { text: w.text(`ec/descriptor:${row.id}`, row.text, teacher('schemeEc')) }),
        ),
      }),
    });
  }

  answerGraph(segment: string, graph: AnswerGraph | undefined, role: SlotRole): AnswerGraph | undefined {
    if (!graph) return graph;
    const w = this.child(segment);
    // Blank axes fall back to the other side, like diagram text (`render/answerGraph.ts`).
    return patch(graph, {
      yTitle: w.optional('y/title', graph.yTitle, { kind: 'axisTitle', role, fallsBack: true, label: 'y-axis title' }),
      xTitle: w.optional('x/title', graph.xTitle, { kind: 'axisTitle', role, fallsBack: true, label: 'x-axis title' }),
    });
  }
}

// ---- the document around the questions ----

type CoverList = 'cornerLines' | 'headLines' | 'instructions' | 'footLines';
type CoverField = 'instructionsHeading' | 'panelNote' | 'panelFieldLabel' | 'footNote';

function mapCover(w: Walk, cover: CoverPage): CoverPage {
  const lines = (name: CoverList) => {
    const list = cover[name];
    if (!Array.isArray(list)) return list;
    const lw = w.child(name);
    return mapSame(list, (line) =>
      patch(line, {
        text: lw.text(`line:${line.id}`, line.text, {
          kind: 'coverLine', role: 'print', target: { kind: 'coverLine', lineId: line.id },
        }),
      }),
    );
  };
  const field = (name: CoverField) =>
    w.optional(name, cover[name], { kind: 'coverField', role: 'print', target: { kind: 'coverField', field: name } });
  // Print order: corner, head, the instructions block, the panel, the foot.
  return patch(cover, {
    cornerLines: lines('cornerLines'),
    headLines: lines('headLines'),
    instructionsHeading: field('instructionsHeading'),
    instructions: lines('instructions'),
    panelNote: field('panelNote'),
    panelFieldLabel: field('panelFieldLabel'),
    footLines: lines('footLines'),
    footNote: field('footNote'),
  });
}

/**
 * A band field's authored wording. A stored `prefix` — or, without one, the deprecated
 * `label` that `bandFieldSideText` still reads — is a slot; a changed side is written
 * through `applyBandFieldSide`, which drops `label`. An absent side is never created.
 */
function mapBandField(w: Walk, field: BandField): BandField {
  const target = (side: 'prefix' | 'suffix'): EditTarget => ({ kind: 'bandField', fieldId: field.id, side });
  if (field.kind === 'text') {
    return patch(field, { text: w.text('text', field.text, { kind: 'bandText', role: 'print', target: target('prefix') }) });
  }
  if (field.kind !== 'totalMarks' && field.kind !== 'fillIn' && field.kind !== 'pageNumber') return field;
  const prefix = field.prefix ?? (field as { label?: BiText }).label;
  const nextPrefix = w.optional('prefix', prefix, {
    kind: 'wording', role: 'print', aroundValue: 'before', target: target('prefix'),
  });
  const nextSuffix = w.optional('suffix', field.suffix, {
    kind: 'wording', role: 'print', aroundValue: 'after', target: target('suffix'),
  });
  let next: BandField = field;
  if (nextPrefix !== prefix && nextPrefix) next = applyBandFieldSide(next, 'prefix', nextPrefix);
  if (nextSuffix !== field.suffix && nextSuffix) next = applyBandFieldSide(next, 'suffix', nextSuffix);
  return next;
}

function mapBands(w: Walk, name: string, bands: Band[] | undefined): Band[] | undefined {
  if (!Array.isArray(bands)) return bands;
  const lw = w.child(name);
  return mapSame(bands, (band) => {
    const bw = lw.child(`band:${band.id}`);
    const zone = (key: 'left' | 'center' | 'right') => {
      const fields = band.zones?.[key];
      if (!Array.isArray(fields)) return fields;
      const zw = bw.child(key);
      return mapSame(fields, (field) => mapBandField(zw.child(`f:${field.id}`), field));
    };
    return patch(band, {
      zones: band.zones && patch(band.zones, { left: zone('left'), center: zone('center'), right: zone('right') }),
    });
  });
}

/** A disabled header or footer keeps its rows, unprinted. */
function mapHeaderFooter(w: Walk, name: string, part: HeaderFooter | undefined): HeaderFooter | undefined {
  if (!part) return part;
  const hw = part.enabled ? w : w.unprinted();
  return patch(part, {
    bands: mapBands(hw, name, part.bands),
    firstPage: part.firstPage && patch(part.firstPage, { bands: mapBands(hw, `${name}1`, part.firstPage.bands) as Band[] }),
  });
}

const LAYOUT_NAMES: Partial<Record<LayoutElement['kind'], string>> = {
  heading: 'Heading',
  text: 'Note',
  partHeader: 'Part header',
  section: 'Section heading',
  questionCount: 'Question count',
  stimulus: 'Shared stimulus',
  labelList: 'Label list',
};

/**
 * A layout element's text. The questionCount and stimulus wording is authored text around
 * a derived number; an absent side prints the default and is not a slot.
 */
function mapLayout(w: Walk, element: LayoutElement): LayoutElement {
  const print = (kind: SlotKind): SlotMeta => ({ kind, role: 'print', target: { kind: 'layoutText', elementId: element.id } });
  const wording = (aroundValue: 'before' | 'after', label: string): SlotMeta => ({ kind: 'wording', role: 'print', aroundValue, label });
  switch (element.kind) {
    case 'heading':
      return patch(element, { text: w.text('text', element.text, print('heading')) });
    case 'text':
      return patch(element, { text: w.text('text', element.text, print('paragraph')) });
    case 'partHeader':
      return patch(element, { text: w.text('text', element.text, print('partHeader')) });
    case 'section':
      return patch(element, { text: w.text('text', element.text, print('sectionHeading')) });
    case 'questionCount':
      return patch(element, {
        prefix: w.optional('prefix', element.prefix, wording('before', 'printed before the number of questions')),
        suffix: w.optional('suffix', element.suffix, wording('after', 'printed after the number of questions')),
      });
    case 'stimulus':
      return patch(element, {
        prefix: w.optional('prefix', element.prefix, wording('before', 'printed before the question range')),
        suffix: w.optional('suffix', element.suffix, wording('after', 'printed after the question range')),
        blocks: w.blocks('blocks', element.blocks),
      });
    case 'labelList':
      return patch(element, {
        rows: each(element.rows, (row) => {
          const rw = w.child(`row:${row.id}`);
          const cell = (column: 'label' | 'value'): SlotMeta => ({
            kind: 'labelListCell', role: 'print',
            target: { kind: 'labelListCell', elementId: element.id, rowId: row.id, column },
          });
          return patch(row, { label: rw.text('label', row.label, cell('label')), value: rw.text('value', row.value, cell('value')) });
        }),
      });
    default:
      return element;
  }
}

function questionWalker(run: Run, question: Question, number: number | undefined): Walk {
  const group: SlotGroup = { kind: 'question', id: question.id, label: number ? `Question ${number}` : 'Question' };
  return new Walk(run, { path: '', group, questionId: question.id, flowId: question.id, blockIds: [] }).child(`q:${question.id}`);
}

/** A question of an unknown type (a newer build's) is skipped untouched. */
function mapQuestion(run: Run, question: Question, number: number | undefined): Question {
  const definition = typeof question.type === 'string' ? getQuestionType(question.type) : undefined;
  return definition ? definition.mapTexts(question, questionWalker(run, question, number)) : question;
}

/** Questions and layout elements interleaved in flow order, each list rebuilt only if touched. */
function mapFlow(run: Run, ws: Worksheet): Pick<Worksheet, 'questions' | 'layout'> {
  const skip = run.opts.skipQuestions;
  const numbers = new Map(skip ? [] : computeNumbering(ws).questions.map((entry) => [entry.question, entry.number]));
  const next = new Map<Question | LayoutElement, Question | LayoutElement>();
  const question = (q: Question) => {
    if (next.has(q)) return;
    next.set(q, skip ? q : mapQuestion(run, q, numbers.get(q)));
  };
  const layout = (element: LayoutElement) => {
    if (next.has(element)) return;
    const name = LAYOUT_NAMES[element.kind];
    const group: SlotGroup = { kind: 'layout', id: element.id, label: name ? `Page · ${name}` : 'Page' };
    const w = new Walk(run, { path: '', group, flowId: element.id, blockIds: [] }).child(`l:${element.id}`);
    next.set(element, mapLayout(w, element));
  };
  for (const item of resolveFlow(ws)) {
    if (item.type === 'question') question(item.question);
    else layout(item.element);
  }
  // Anything the flow could not place (a repeated layout id) is still walked, last.
  ws.questions.forEach(question);
  (ws.layout ?? []).forEach(layout);
  return {
    questions: mapSame(ws.questions, (q) => next.get(q) as Question),
    layout: each(ws.layout, (element) => next.get(element) as LayoutElement) as LayoutElement[],
  };
}

// ---- the walk ----

const TITLE_GROUP: SlotGroup = { kind: 'document', label: 'Title & instructions' };
const COVER_GROUP: SlotGroup = { kind: 'cover', label: 'Cover' };
const BANDS_GROUP: SlotGroup = { kind: 'bands', label: 'Header & footer' };
const FURNITURE_GROUP: SlotGroup = { kind: 'document', label: 'Page furniture' };

/**
 * Visit every BiText in print order: title and instructions, cover, bands (masthead,
 * header, page-1 header, footer, page-1 footer), the flow, the margin note. Never
 * visited: `name`, `__unknown`, pre-v1 shapes and questions of an unknown type.
 */
export function mapWorksheetTexts(ws: Worksheet, visit: TextVisitor, opts: WalkOptions = {}): Worksheet {
  const run: Run = { visit, opts, claimed: new Map() };
  const root = (group: SlotGroup) => new Walk(run, { path: '', group, blockIds: [] });

  const doc = root(TITLE_GROUP);
  const title = doc.text('title', ws.title, { kind: 'title', role: 'print', target: { kind: 'worksheetTitle' } });
  const instructions = doc.optional('instructions', ws.instructions, {
    kind: 'instructions', role: 'print', target: { kind: 'worksheetInstructions' },
  });
  const cover = ws.cover && mapCover(root(COVER_GROUP).child('cover'), ws.cover);
  const bandsWalk = root(BANDS_GROUP);
  const bands = mapBands(bandsWalk, 'bands', ws.bands);
  const header = mapHeaderFooter(bandsWalk, 'header', ws.header);
  const footer = mapHeaderFooter(bandsWalk, 'footer', ws.footer);
  const { questions, layout } = mapFlow(run, ws);
  const furniture = ws.pageFurniture && patch(ws.pageFurniture, {
    marginNote: root(FURNITURE_GROUP).optional('furniture/marginNote', ws.pageFurniture.marginNote, {
      kind: 'marginNote', role: 'print',
    }),
  });
  return patch(ws, { title, instructions, cover, bands, header, footer, questions, layout, pageFurniture: furniture });
}

const recordInto = (slots: TextSlot[]): TextVisitor => (slot) => {
  slots.push(slot);
  return slot.text;
};

/** Every slot in printed order (identity visitor that records). */
export function collectTexts(ws: Worksheet): TextSlot[] {
  const slots: TextSlot[] = [];
  mapWorksheetTexts(ws, recordInto(slots));
  return slots;
}

/** One question's slots, walked on its own (paths as in the document, barring a repeated id). */
export function questionTexts(question: Question): TextSlot[] {
  const slots: TextSlot[] = [];
  mapQuestion({ visit: recordInto(slots), opts: {}, claimed: new Map() }, question, undefined);
  return slots;
}

/** Deep equality of plain data; an `undefined` key reads as absent. */
function sameData(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) if (!sameData(left[key], right[key])) return false;
  return true;
}

/** All slots whose `target` deep-equals `target` (≥2 when Duplicate shared block ids). */
export function slotsForTarget(ws: Worksheet, target: EditTarget): TextSlot[] {
  return collectTexts(ws).filter((slot) => slot.target !== undefined && sameData(slot.target, target));
}

/** Missing one side that this edition prints, and not a symbol-only text that prints fine. */
export function needsTranslation(slot: TextSlot, mode: Pick<OutputMode, 'language' | 'version'>): boolean {
  const missing = missingSide(slot.text);
  if (!missing) return false;
  if (slot.unprinted) return false;
  if (slot.role === 'meta') return false;
  if (slot.role === 'teacher' && mode.version !== 'teacher') return false;
  // This edition does not print the missing side.
  if (mode.language !== 'bilingual' && mode.language !== missing) return false;
  const present = missing === 'zh' ? slot.text.en : slot.text.zh;
  // Diagram text falls back to the other side; EN+中 prints both sides anyway.
  if (isSymbolOnly(present) && (slot.fallsBack || mode.language === 'bilingual')) return false;
  return true;
}

export function countUntranslated(ws: Worksheet, mode: Pick<OutputMode, 'language' | 'version'>): number {
  return collectTexts(ws).filter((slot) => needsTranslation(slot, mode)).length;
}

/** BiTextField's tag and fill button: the missing side, or null when both/neither are
 *  present or the present side is symbol-only (a copy would print twice in EN+中). */
export function fieldNeedsFill(text: BiText): Side | null {
  const missing = missingSide(text);
  if (!missing) return null;
  return isSymbolOnly(missing === 'zh' ? text.en : text.zh) ? null : missing;
}

