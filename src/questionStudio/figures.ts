import type { ImagePart } from '@/ai/types';
import { flattenBlocks } from '@/model/edits';
import { DEFAULT_FONTS } from '@/model/factories';
import { plain } from '@/model/text';
import type { Side } from '@/model/textSlots';
import type { BiText, ContentBlock, ImageBlock, McqQuestion, TableBlock } from '@/model/types';
import type { CompositeCell } from './composite';
import type { SourceQuestion } from './types';

/**
 * The pictures of a question to write like (k-0514): its images as stored, the pictures held
 * in table cells (a printed grid of diagrams "(1)"–"(4)", HKDSE 2023 Paper 1 Q36; k-0544), and
 * its diagrams drawn to a PNG, in reading order (the shared passage's, the stem's, then each
 * option's). The engine attaches these to the request when the provider reads pictures
 * (`supportsImages`), each with where it sits (`figureAt`: "stem (1)", "option A").
 *
 * Bounded, so a request stays small and quick: at most `MAX_FIGURES_PER_EXAMPLE` pictures per
 * question (the bank's largest is five: a stem picture and one per option) and
 * `MAX_FIGURE_BYTES` each. A picture that cannot be read (an asset id the library keeps
 * elsewhere, an unsupported format, a diagram where there is no canvas) is skipped, never an
 * error: the example then says some of its pictures are not shown.
 */

export const MAX_FIGURES_PER_EXAMPLE = 5;
/** Total base64 characters per picture (about 1.5 MB of image). */
export const MAX_FIGURE_BYTES = 2_000_000;

const IMAGE_URL = /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

const usable = (dataUrl: string | undefined): dataUrl is string => Boolean(dataUrl) && dataUrl!.length <= MAX_FIGURE_BYTES && IMAGE_URL.test(dataUrl!);

/** Rasterises one diagram block, in the browser; undefined anywhere else or on any failure. */
async function drawn(block: Extract<ContentBlock, { kind: 'diagram' }>, lang: Side): Promise<string | undefined> {
  try {
    const { rasterizeDiagram } = await import('@/export/diagramImage');
    // A diagram is drawn in the paper's language: the English labels unless the paper prints only Chinese.
    const url = await rasterizeDiagram(block, { ...DEFAULT_FONTS }, lang);
    return usable(url) ? url : undefined;
  } catch {
    return undefined;
  }
}

/** The picture of an image block in this language: the Chinese one (`srcZh`) for 'zh' when there is one. */
const imageSrc = (block: ImageBlock, lang: Side): string => (lang === 'zh' && block.srcZh ? block.srcZh : block.src);

/** The pictures in these blocks, in order, at most `MAX_FIGURES_PER_EXAMPLE` (one by one: no sets drawn together). */
export async function figuresOfBlocks(blocks: readonly ContentBlock[], lang: Side = 'en'): Promise<ImagePart[]> {
  return (await placedFigures(blocks, undefined, lang)).map((f) => f.image);
}

/**
 * A picture's place in a set printed together (k-0544): a cell of a stem table holding several
 * pictures, or one option of a set where every option is a picture. `row`/`col` as printed
 * (rows and columns without a picture left out), `label` "(1)" or "A".
 */
export interface FigureCell {
  group: string;
  row: number;
  col: number;
  label: string;
}

/** Draws a set as one picture; undefined = cannot (no canvas), and the set goes one by one. */
export type Composer = (cells: readonly CompositeCell[]) => Promise<string | undefined>;

const browserComposer: Composer = async (cells) => {
  try {
    return await (await import('./composite')).drawComposite(cells, MAX_FIGURE_BYTES);
  } catch {
    return undefined;
  }
};

/** Where a set drawn as one picture sits: "stem (1), (2), (3), (4) in one picture, as printed". */
function setPlace(places: readonly string[], cells: readonly FigureCell[]): string {
  const where = places[0].startsWith('option') ? 'options' : places[0].replace(/ \(.*$|,.*$/, '');
  const labels = cells.map((c) => c.label).filter(Boolean);
  return `${where} ${labels.join(', ')} in one picture, as printed, each under its label`.replace(/\s+/g, ' ');
}

/**
 * The pictures in these blocks with where each sits (`places`, same order; absent = "figure").
 * A set printed together (`grid`) goes as one picture drawn by `compose` (a browser canvas), so
 * the model sees it as the student does and reads one picture instead of four; when it cannot
 * be drawn, its pictures go one by one.
 */
export async function placedFigures(
  blocks: readonly ContentBlock[],
  places: readonly string[] | undefined,
  lang: Side = 'en',
  grid?: readonly (FigureCell | null)[],
  compose: Composer = browserComposer,
): Promise<Array<{ image: ImagePart; at: string }>> {
  // Every picture first (an unreadable one is null), then the sets.
  const read: Array<string | undefined> = [];
  for (const block of blocks) {
    if (block.kind === 'image') {
      const src = imageSrc(block, lang);
      read.push(usable(src) ? src : undefined);
    } else if (block.kind === 'diagram') read.push(await drawn(block, lang));
    else read.push(undefined);
  }
  const out: Array<{ image: ImagePart; at: string }> = [];
  const done = new Set<string>();
  for (const [index] of blocks.entries()) {
    if (out.length >= MAX_FIGURES_PER_EXAMPLE) break;
    const cell = grid?.[index];
    if (cell && done.has(cell.group)) continue;
    if (cell) {
      done.add(cell.group);
      const members = blocks.map((_, i) => i).filter((i) => grid?.[i]?.group === cell.group && read[i]);
      if (members.length >= 2) {
        const url = await compose(members.map((i) => ({ dataUrl: read[i]!, label: grid![i]!.label, row: grid![i]!.row, col: grid![i]!.col })));
        if (url && usable(url)) {
          out.push({ image: { dataUrl: url }, at: setPlace(members.map((i) => places?.[i] ?? 'figure'), members.map((i) => grid![i]!)) });
          continue;
        }
      }
      for (const i of members) if (out.length < MAX_FIGURES_PER_EXAMPLE) out.push({ image: { dataUrl: read[i]! }, at: places?.[i] ?? 'figure' });
      continue;
    }
    if (read[index]) out.push({ image: { dataUrl: read[index]! }, at: places?.[index] ?? 'figure' });
  }
  return out;
}

/** A table cell's short label ("(1)", "A", "Country X"), or '' when its words are long or absent. */
function cellLabel(text: BiText): string {
  const words = (plain(text.en).trim() || plain(text.zh).trim()).replace(/\s+/g, ' ');
  return words.length > 0 && words.length <= 24 ? words : '';
}

type Placed = { block: ContentBlock; at: string; cell?: FigureCell };

/**
 * A table's cell pictures as image blocks (the cell's id), with where each sits: "stem (1)" or
 * "stem, table row 1 column 2"; two or more make a set, placed as printed.
 */
function cellPictures(table: TableBlock, where: string): Placed[] {
  const out: Placed[] = [];
  const rows: number[] = [];
  const cols: number[] = [];
  table.rows.forEach((row, r) =>
    row.cells.forEach((cell, c) => {
      if (!cell.image || cell.covered) return;
      if (!rows.includes(r)) rows.push(r);
      if (!cols.includes(c)) cols.push(c);
    }),
  );
  cols.sort((a, b) => a - b);
  table.rows.forEach((row, r) =>
    row.cells.forEach((cell, c) => {
      if (!cell.image || cell.covered) return;
      const label = cellLabel(cell.text);
      out.push({
        block: { kind: 'image', id: cell.id, src: cell.image.src, ...(cell.image.srcZh ? { srcZh: cell.image.srcZh } : {}), widthPx: cell.image.widthPx, heightPx: cell.image.heightPx, altText: cell.image.altText },
        at: label ? `${where} ${label}` : `${where}, table row ${r + 1} column ${c + 1}`,
        cell: { group: table.id, row: rows.indexOf(r), col: cols.indexOf(c), label },
      });
    }),
  );
  return out.length >= 2 ? out : out.map(({ block, at }) => ({ block, at }));
}

/** The picture-holding blocks of some content, flattened, with where each sits; a cell picture becomes an image block. */
function placedBlocks(blocks: readonly ContentBlock[], where: string): Placed[] {
  const out: Placed[] = [];
  const inGrid = new Set<string>();
  for (const block of flattenBlocks([...blocks])) {
    if (inGrid.has(block.id)) continue;
    if (block.kind === 'figureGrid') {
      // A stem's figure grid (k-0545) is a set, placed as printed, each by its label.
      const columns = Math.min(4, Math.max(1, block.columns ?? 2));
      block.cells.forEach((cell, i) => {
        inGrid.add(cell.figure.id);
        const label = cellLabel(cell.label);
        out.push({
          block: cell.figure,
          at: label ? `${where} ${label}` : `${where}, figure ${i + 1}`,
          ...(block.cells.length >= 2 ? { cell: { group: block.id, row: Math.floor(i / columns), col: i % columns, label } } : {}),
        });
      });
    } else if (block.kind === 'image' || block.kind === 'diagram') out.push({ block, at: where });
    else if (block.kind === 'table') out.push(...cellPictures(block, where));
  }
  return out;
}

const LETTERS = 'ABCDEFGH';

/**
 * The figures of a question and of the passage printed before it, in reading order, with
 * where each sits: "passage", "stem", "stem (1)" (a picture in a table cell, by its label),
 * "option A"; and, for a set printed together (a grid in a table, a picture under every
 * option), its place in the set.
 */
export function placedFigureBlocks(question: McqQuestion, passage?: readonly ContentBlock[]): Placed[] {
  const options = question.options.map((o, i) => placedBlocks(o.blocks ?? [], `option ${LETTERS[i] ?? i + 1}`));
  // Options that are each one picture make a set, two to a row as the paper prints them.
  const pictured = options.filter((list) => list.length === 1 && !list[0].cell);
  const optionSet = pictured.length >= 2 && pictured.length === options.filter((list) => list.length > 0).length;
  return [
    ...placedBlocks(passage ?? [], 'passage'),
    ...placedBlocks(question.blocks, 'stem'),
    ...options.flatMap((list, i) =>
      optionSet && list.length === 1 ? [{ ...list[0], cell: { group: 'options', row: Math.floor(i / 2), col: i % 2, label: LETTERS[i] ?? String(i + 1) } }] : list,
    ),
  ];
}

/** The blocks of a question and of the passage printed before it that hold a picture or a diagram, in reading order (a cell picture as an image block). */
export function figureBlocksOf(question: McqQuestion, passage?: readonly ContentBlock[]): ContentBlock[] {
  return placedFigureBlocks(question, passage).map((p) => p.block);
}

/** The pictures of a question and of the passage printed before it. */
export function figuresOfQuestion(question: McqQuestion, passage?: readonly ContentBlock[], lang: Side = 'en'): Promise<ImagePart[]> {
  return figuresOfBlocks(figureBlocksOf(question, passage), lang);
}

/** The language a paper's pictures are read in: Chinese only when the paper prints only Chinese. */
export const figureLang = (sides: readonly Side[]): Side => (sides.length > 0 && !sides.includes('en') ? 'zh' : 'en');

/**
 * Examples with their pictures read in `lang`: each one that carries `figureBlocks` and has no
 * `figures` in that language yet gets them, with `figureAt` (an example whose pictures cannot
 * be read keeps `figures: []`). Never rejects; the blocks are kept (the figure generator reads
 * a diagram as words).
 */
export async function withFigures(examples: readonly SourceQuestion[], lang: Side = 'en', compose: Composer = browserComposer): Promise<SourceQuestion[]> {
  return Promise.all(
    examples.map(async (example) => {
      if (!example.figureBlocks?.length) return example;
      if (example.figures && (example.figuresLang ?? 'en') === lang) return example;
      // The blocks stay: a diagram is also the reference `generateDiagram` reads in words.
      const placed = await placedFigures(example.figureBlocks, example.figurePlaces, lang, example.figureGrid, compose);
      return { ...example, figures: placed.map((p) => p.image), figureAt: placed.map((p) => p.at), figuresLang: lang };
    }),
  );
}
