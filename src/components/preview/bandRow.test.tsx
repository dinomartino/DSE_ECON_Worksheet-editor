import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { createBand, createFillInField, createTextField } from '@/model/bands';
import { bi } from '@/model/text';
import type { Band } from '@/model/types';
import { renderWorksheet } from '@/render/worksheet';
import { createWorksheet } from '@/model/factories';
import { BandEditor } from './BandEditor';
import { BAND_ROW_CLASS, BAND_ZONE_CLASS, fitBandRow } from './bandRow';
import { NodeView } from './Preview';

/**
 * A band row lays out like the Word tab-stop paragraph it exports as (§ Bands and zones).
 * It used to give each zone a fixed third, so a header Word prints on one line wrapped
 * onto three on the page and in the PDF. jsdom has no layout, so this pins the contract:
 * every band surface uses the one frame, and the frame's layout switch decides correctly.
 */
const noop = () => {};
const editor = (bands: Band[]) =>
  renderToStaticMarkup(
    <BandEditor
      bands={bands}
      language="en"
      totalMarks={10}
      onMove={noop}
      onEditField={noop}
      onRemoveField={noop}
      onAddField={noop}
    />,
  );

describe('band row frame', () => {
  it('sizes zones by their text: centred unless pushed, wrapping only on overflow', () => {
    // The sides are at least as wide as their text and share what is left equally, so the
    // centre sits on the middle stop until a long side pushes it, as in Word.
    expect(BAND_ROW_CLASS).toContain('grid-cols-[minmax(max-content,1fr)_auto_minmax(max-content,1fr)]');
    // Only a row whose zones cannot share the line falls back to tracks that wrap.
    expect(BAND_ROW_CLASS).toContain('data-[band-overflow]:grid-cols-[auto_auto_auto]');
    // No zone is a fixed third any more.
    expect(Object.values(BAND_ZONE_CLASS).join(' ')).not.toMatch(/flex-1|basis|w-1\/3/);
  });

  it('is the frame of the editor, the idle header and the IR masthead', () => {
    const band = createBand({
      left: [createTextField(bi('DBS Economics G11 Enhancement Class (2025-26) Assessment 1', ''))],
    });
    expect(editor([band])).toContain(`data-band-row="" class="${BAND_ROW_CLASS}`);

    const worksheet = createWorksheet();
    worksheet.bands = [band];
    const [node] = renderWorksheet(worksheet, { language: 'en', version: 'student' }).bands;
    expect(node).toMatchObject({ kind: 'columns', band: true });
    expect(renderToStaticMarkup(<NodeView node={node} language="en" />)).toContain(
      `data-band-row="" class="${BAND_ROW_CLASS}`,
    );

    // `ReadOnlyBandRow` (idle header and footer, and what they print) is not exported.
    const preview = readFileSync('src/components/preview/Preview.tsx', 'utf8');
    const readOnly = preview.slice(preview.indexOf('function ReadOnlyBandRow('));
    expect(readOnly.slice(0, readOnly.indexOf('\n}\n'))).toContain('<BandRowFrame>');
  });

  it('prints fields sharing a zone one space apart, like the .docx', () => {
    const band = createBand({ right: [createTextField(bi('R1', '')), createTextField(bi('R2', ''))] });
    const worksheet = createWorksheet();
    worksheet.bands = [band];
    const [node] = renderWorksheet(worksheet, { language: 'en', version: 'student' }).bands;
    expect(renderToStaticMarkup(<NodeView node={node} language="en" />)).toMatch(/R1<\/span><\/span> <span[^>]*><span>R2/);
  });

  it('keeps an empty zone’s + from taking width the printed row does not give it', () => {
    const html = editor([createBand({ left: [createFillInField(bi('Name:', ''))] })]);
    const plus = html.match(/<button[^>]*aria-label="[^"]*(center|centre)[^"]*"[^>]*>/i)?.[0] ?? '';
    expect(plus).toContain('absolute');
    // A row with nothing in it keeps its + in the flow: it is all there is to click.
    const empty = editor([createBand()]).match(/<button[^>]*aria-label="[^"]*(center|centre)[^"]*"[^>]*>/i)?.[0] ?? '';
    expect(empty).not.toContain('absolute');
  });
});

describe('fitBandRow', () => {
  const zone = (right: number, position = 'static') => ({
    getBoundingClientRect: () => ({ right }),
    position,
  });
  const row = (zones: ReturnType<typeof zone>[]) => {
    const attrs = new Set<string>();
    return {
      attrs,
      children: zones,
      getBoundingClientRect: () => ({ right: 600 }),
      setAttribute: (name: string) => attrs.add(name),
      removeAttribute: (name: string) => attrs.delete(name),
    };
  };
  afterEach(() => vi.unstubAllGlobals());

  it('keeps the one-line layout while every zone ends inside the row', () => {
    vi.stubGlobal('getComputedStyle', (el: { position: string }) => ({ position: el.position }));
    const r = row([zone(200), zone(400), zone(600)]);
    r.attrs.add('data-band-overflow');
    fitBandRow(r as unknown as HTMLElement);
    expect(r.attrs.has('data-band-overflow')).toBe(false);
  });

  it('wraps once a zone runs past the row, ignoring positioned editing chrome', () => {
    vi.stubGlobal('getComputedStyle', (el: { position: string }) => ({ position: el.position }));
    const over = row([zone(300), zone(450), zone(720)]);
    fitBandRow(over as unknown as HTMLElement);
    expect(over.attrs.has('data-band-overflow')).toBe(true);

    // The remove-row ✕ hangs in the margin; it is not the row's text overflowing.
    const chrome = row([zone(200), zone(400), zone(600), zone(900, 'absolute')]);
    fitBandRow(chrome as unknown as HTMLElement);
    expect(chrome.attrs.has('data-band-overflow')).toBe(false);
  });
});
