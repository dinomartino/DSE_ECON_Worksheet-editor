import { describe, expect, it } from 'vitest';
import { previewFigure } from '@/import';
import { createImageBlock } from '@/model/factories';
import type { StructuredQuestion } from '@/model/types';
import type { RenderNode } from '@/render/ir';
import { carriedFiles, checkPlaces, imagePin, isHeic, pasteInput, pinsOn, readPaste, review, withPin, withoutPin } from './pasteSession';
import { materialize, previewBase, previewItems } from './previewDoc';

/** Invented paper; the picture is a made-up data URL. */
const PAPER = ['1.\tStudy the market for tea.', 'Figure 1', 'a)\tExplain the shift.', '2.\tWhat is GDP?'].join('\n');
const PICTURE = 'data:image/png;base64,iVBORw0KGgoFAKE';

const block = () => ({ ...createImageBlock(PICTURE, 420, 315), naturalWidthPx: 1600, naturalHeightPx: 1200 });

const figuresIn = (nodes: readonly RenderNode[]): Array<ReturnType<typeof previewFigure>> =>
  nodes.flatMap((n) => (n.kind === 'source' ? figuresIn(n.nodes) : n.kind === 'image' ? [previewFigure(n.blockId)] : []));

/** A clipboard as the browser hands it over: a screenshot is a file item, a dragged file is in `files`. */
const clip = (opts: { files?: File[]; items?: Array<{ kind: string; type: string; file?: File }> }) =>
  ({
    files: (opts.files ?? []) as unknown as FileList,
    items: (opts.items ?? []).map((i) => ({ kind: i.kind, type: i.type, getAsFile: () => i.file ?? null })) as unknown as DataTransferItemList,
  }) as const;

describe('pictures in the review', () => {
  it('reads a pasted screenshot or a dropped file, and nothing from a text paste', () => {
    const png = new File([new Uint8Array([137, 80, 78, 71])], 'shot.png', { type: 'image/png' });
    expect(carriedFiles(clip({ items: [{ kind: 'string', type: 'text/plain' }, { kind: 'file', type: 'image/png', file: png }] }))).toEqual({ images: [png], others: [] });
    expect(carriedFiles(clip({ files: [png], items: [{ kind: 'file', type: 'image/png', file: png }] }))).toEqual({ images: [png], others: [] });
    // A PDF is no picture, but is kept to explain why nothing was added.
    const pdf = new File(['x'], 'a.pdf', { type: 'application/pdf' });
    expect(carriedFiles(clip({ files: [pdf, png] }))).toEqual({ images: [png], others: [pdf] });
    // An iPhone photo or a TIFF with no type from the system still counts as a picture, by its name.
    const heic = new File(['x'], 'IMG_0001.HEIC', { type: '' });
    const tiff = new File(['x'], 'scan.tiff', { type: 'image/tiff' });
    expect(carriedFiles(clip({ files: [heic, tiff] }))).toEqual({ images: [heic, tiff], others: [] });
    expect([heic, new File(['x'], 'a.heic', { type: 'image/heic' }), tiff, png].map(isHeic)).toEqual([true, true, false, false]);
    // A text paste carries no picture, and still reaches the engine as before.
    const text = clip({ items: [{ kind: 'string', type: 'text/plain' }, { kind: 'string', type: 'text/html' }] });
    expect(carriedFiles(text)).toEqual({ images: [], others: [] });
    expect(pasteInput({ getData: (t: string) => (t === 'text/plain' ? '1.\tWhy?' : '') })).toEqual({ plain: '1.\tWhy?' });
  });

  it('a pasted picture becomes a pin, shows in the preview, and inserts as the block imageBlockFromFile made', () => {
    const read = readPaste({ plain: PAPER });
    const first = review(read, [], 'auto');
    const pin = imagePin(0, block(), 'pic1');
    const pins = withPin([], pin, first.analysis);
    const after = review(read, pins, 'auto');
    const [q] = after.batch.builds.map(materialize) as StructuredQuestion[];
    expect(q.blocks[1]).toMatchObject({ kind: 'image', src: PICTURE, widthPx: 420, heightPx: 315, naturalWidthPx: 1600, naturalHeightPx: 1200 });
    const items = previewItems(previewBase(), after.analysis, after.preview, new Map());
    expect(figuresIn(items[0].nodes)).toContainEqual({ pin: 'pic1' });
    expect(pinsOn(pins, 0)).toEqual([pin]);
    // ⌘Z takes the last fix back; the × removes that one picture.
    expect(review(read, pins.slice(0, -1), 'auto').batch.builds.map(materialize).some((x) => JSON.stringify(x).includes(PICTURE))).toBe(false);
    expect(withoutPin(pins, pin)).toEqual([]);
  });

  it('two pictures on one line are both kept', () => {
    const { analysis } = review(readPaste({ plain: PAPER }), [], 'auto');
    const pins = withPin(withPin([], imagePin(0, block(), 'a'), analysis), imagePin(0, block(), 'b'), analysis);
    expect(pins.map((p) => (p.kind === 'image' ? p.id : ''))).toEqual(['a', 'b']);
  });

  it('a caption with no picture shows a slot and counts to check until filled or dismissed', () => {
    const read = readPaste({ plain: PAPER });
    const first = review(read, [], 'auto');
    const slot = (r: typeof first) => figuresIn(previewItems(previewBase(), r.analysis, r.preview, new Map())[0].nodes);
    expect(slot(first)).toEqual([{ slot: 1 }]);
    expect(checkPlaces(first.analysis).check.flatMap((p) => p.flags.map((f) => f.kind))).toContain('figureMissing');
    // Never inserted.
    expect(JSON.stringify(first.batch.builds.map(materialize))).not.toContain('pi-slot');

    const filled = review(read, [imagePin(1, block(), 'f')], 'auto');
    expect(slot(filled)).toEqual([{ pin: 'f' }]);
    const dismissed = review(read, withPin([], { kind: 'noPicture', line: 1 }, first.analysis), 'auto');
    expect(slot(dismissed)).toEqual([]);
    for (const r of [filled, dismissed]) expect(checkPlaces(r.analysis).check.flatMap((p) => p.flags.map((f) => f.kind))).not.toContain('figureMissing');
  });

  it('a picture lost in a Word paste shows a slot where it was', () => {
    const html = '<p>1. Study the market.</p><p><img src="file:///C:/Users/x/clip_image002.png" width="300" height="200"></p><p>(a) Explain.</p>';
    const read = readPaste({ html });
    const lost = read.lines.find((l) => l.image)!.i;
    const r = review(read, [], 'auto');
    expect(figuresIn(previewItems(previewBase(), r.analysis, r.preview, new Map())[0].nodes)).toEqual([{ slot: lost }]);
    expect(checkPlaces(r.analysis).check.flatMap((p) => p.flags.map((f) => f.kind))).toContain('imageLost');
  });
});
