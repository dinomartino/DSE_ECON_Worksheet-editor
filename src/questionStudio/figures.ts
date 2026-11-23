import type { ImagePart } from '@/ai/types';
import { flattenBlocks } from '@/model/edits';
import { DEFAULT_FONTS } from '@/model/factories';
import type { ContentBlock, McqQuestion } from '@/model/types';
import type { SourceQuestion } from './types';

/**
 * The pictures of a question to write like (k-0514): its images as stored, and its diagrams
 * drawn to a PNG, in reading order (the shared passage's, the stem's, then each option's).
 * Today's studio sent words only and told the model "a figure is not shown"; the engine now
 * attaches these to the request when the provider reads pictures (`supportsImages`).
 *
 * Bounded, so a request stays small and quick: at most `MAX_FIGURES_PER_EXAMPLE` pictures per
 * question and `MAX_FIGURE_BYTES` each. A picture that cannot be read (an asset id the library
 * keeps elsewhere, an unsupported format, a diagram where there is no canvas) is skipped, never
 * an error: the example then goes with `figureNotShown`.
 */

export const MAX_FIGURES_PER_EXAMPLE = 3;
/** Total base64 characters per picture (about 1.5 MB of image). */
export const MAX_FIGURE_BYTES = 2_000_000;

const IMAGE_URL = /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

const usable = (dataUrl: string | undefined): dataUrl is string => Boolean(dataUrl) && dataUrl!.length <= MAX_FIGURE_BYTES && IMAGE_URL.test(dataUrl!);

/** Rasterises one diagram block, in the browser; undefined anywhere else or on any failure. */
async function drawn(block: Extract<ContentBlock, { kind: 'diagram' }>): Promise<string | undefined> {
  try {
    const { rasterizeDiagram } = await import('@/export/diagramImage');
    // A diagram goes with both languages' words where it has them: the model reads the English labels first.
    const url = await rasterizeDiagram(block, { ...DEFAULT_FONTS }, 'en');
    return usable(url) ? url : undefined;
  } catch {
    return undefined;
  }
}

/** The pictures in these blocks, in order. */
export async function figuresOfBlocks(blocks: readonly ContentBlock[]): Promise<ImagePart[]> {
  const out: ImagePart[] = [];
  for (const block of flattenBlocks([...blocks])) {
    if (out.length >= MAX_FIGURES_PER_EXAMPLE) break;
    if (block.kind === 'image') {
      if (usable(block.src)) out.push({ dataUrl: block.src });
    } else if (block.kind === 'diagram') {
      const url = await drawn(block);
      if (url) out.push({ dataUrl: url });
    }
  }
  return out;
}

/** The blocks of a question and of the passage printed before it that hold a picture or a diagram, in reading order. */
export function figureBlocksOf(question: McqQuestion, passage?: readonly ContentBlock[]): ContentBlock[] {
  const all = [...(passage ?? []), ...question.blocks, ...question.options.flatMap((o) => o.blocks ?? [])];
  return flattenBlocks(all).filter((block) => block.kind === 'image' || block.kind === 'diagram');
}

/** The pictures of a question and of the passage printed before it. */
export function figuresOfQuestion(question: McqQuestion, passage?: readonly ContentBlock[]): Promise<ImagePart[]> {
  return figuresOfBlocks(figureBlocksOf(question, passage));
}

/**
 * Examples with their pictures read: each one that carries `figureBlocks` and has no
 * `figures` yet gets them (an example whose pictures cannot be read keeps `figures: []`).
 * Never rejects; the blocks are dropped once read.
 */
export async function withFigures(examples: readonly SourceQuestion[]): Promise<SourceQuestion[]> {
  return Promise.all(
    examples.map(async (example) => {
      if (example.figures || !example.figureBlocks?.length) return example;
      const { figureBlocks, ...rest } = example;
      return { ...rest, figures: await figuresOfBlocks(figureBlocks) };
    }),
  );
}
