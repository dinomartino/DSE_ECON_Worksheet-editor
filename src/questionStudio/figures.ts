import type { ImagePart } from '@/ai/types';
import { flattenBlocks } from '@/model/edits';
import { DEFAULT_FONTS } from '@/model/factories';
import { plain } from '@/model/text';
import type { Side } from '@/model/textSlots';
import type { BiText, ContentBlock, ImageBlock, McqQuestion, TableBlock } from '@/model/types';
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

/** The pictures in these blocks, in order, at most `MAX_FIGURES_PER_EXAMPLE`. */
export async function figuresOfBlocks(blocks: readonly ContentBlock[], lang: Side = 'en'): Promise<ImagePart[]> {
  return (await placedFigures(blocks, undefined, lang)).map((f) => f.image);
}

/** The pictures in these blocks with where each sits (`places`, same order; absent = "figure"). */
export async function placedFigures(blocks: readonly ContentBlock[], places: readonly string[] | undefined, lang: Side = 'en'): Promise<Array<{ image: ImagePart; at: string }>> {
  const out: Array<{ image: ImagePart; at: string }> = [];
  for (const [index, block] of blocks.entries()) {
    if (out.length >= MAX_FIGURES_PER_EXAMPLE) break;
    const at = places?.[index] ?? 'figure';
    if (block.kind === 'image') {
      const src = imageSrc(block, lang);
      if (usable(src)) out.push({ image: { dataUrl: src }, at });
    } else if (block.kind === 'diagram') {
      const url = await drawn(block, lang);
      if (url) out.push({ image: { dataUrl: url }, at });
    }
  }
  return out;
}

/** A table cell's short label ("(1)", "A", "Country X"), or '' when its words are long or absent. */
function cellLabel(text: BiText): string {
  const words = (plain(text.en).trim() || plain(text.zh).trim()).replace(/\s+/g, ' ');
  return words.length > 0 && words.length <= 24 ? words : '';
}

/** A table's cell pictures as image blocks (the cell's id), with where each sits: "stem (1)" or "stem, table row 1 column 2". */
function cellPictures(table: TableBlock, where: string): Array<{ block: ImageBlock; at: string }> {
  const out: Array<{ block: ImageBlock; at: string }> = [];
  table.rows.forEach((row, r) =>
    row.cells.forEach((cell, c) => {
      if (!cell.image || cell.covered) return;
      const label = cellLabel(cell.text);
      out.push({
        block: { kind: 'image', id: cell.id, src: cell.image.src, ...(cell.image.srcZh ? { srcZh: cell.image.srcZh } : {}), widthPx: cell.image.widthPx, heightPx: cell.image.heightPx, altText: cell.image.altText },
        at: label ? `${where} ${label}` : `${where}, table row ${r + 1} column ${c + 1}`,
      });
    }),
  );
  return out;
}

/** The picture-holding blocks of some content, flattened, with where each sits; a cell picture becomes an image block. */
function placedBlocks(blocks: readonly ContentBlock[], where: string): Array<{ block: ContentBlock; at: string }> {
  const out: Array<{ block: ContentBlock; at: string }> = [];
  for (const block of flattenBlocks([...blocks])) {
    if (block.kind === 'image' || block.kind === 'diagram') out.push({ block, at: where });
    else if (block.kind === 'table') out.push(...cellPictures(block, where));
  }
  return out;
}

const LETTERS = 'ABCDEFGH';

/**
 * The figures of a question and of the passage printed before it, in reading order, with
 * where each sits: "passage", "stem", "stem (1)" (a picture in a table cell, by its label),
 * "option A".
 */
export function placedFigureBlocks(question: McqQuestion, passage?: readonly ContentBlock[]): Array<{ block: ContentBlock; at: string }> {
  return [
    ...placedBlocks(passage ?? [], 'passage'),
    ...placedBlocks(question.blocks, 'stem'),
    ...question.options.flatMap((o, i) => placedBlocks(o.blocks ?? [], `option ${LETTERS[i] ?? i + 1}`)),
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
export async function withFigures(examples: readonly SourceQuestion[], lang: Side = 'en'): Promise<SourceQuestion[]> {
  return Promise.all(
    examples.map(async (example) => {
      if (!example.figureBlocks?.length) return example;
      if (example.figures && (example.figuresLang ?? 'en') === lang) return example;
      // The blocks stay: a diagram is also the reference `generateDiagram` reads in words.
      const placed = await placedFigures(example.figureBlocks, example.figurePlaces, lang);
      return { ...example, figures: placed.map((p) => p.image), figureAt: placed.map((p) => p.at), figuresLang: lang };
    }),
  );
}
