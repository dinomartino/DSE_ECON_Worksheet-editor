import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { ZONES, createBand, createFillInField, createTextField, type ZoneName } from '@/model/bands';
import { createPageNumberField } from '@/model/page';
import { bi } from '@/model/text';
import type { Band, Worksheet } from '@/model/types';
import { renderWorksheet } from '@/render/worksheet';
import { createWorksheet } from '@/model/factories';
import { exportDocxBuffer } from '@/export/docx';
import { BandEditor } from './BandEditor';
import { bandTabPlan, resolveTab, type BandRowKind } from './bandRow';
import { NodeView } from './Preview';

/**
 * A band row is laid out as the Word paragraph it exports as (§ Bands and zones): inline
 * zones, with a spacer per `w:tab` sized the way Word resolves it. jsdom has no layout, so
 * this pins the parts that need none: the tab plan agrees with the exporter, the tab
 * arithmetic agrees with Word (as LibreOffice renders it), and every surface uses the frame.
 */
const noop = () => {};
const editor = (bands: Band[], kind: BandRowKind = 'masthead') =>
  renderToStaticMarkup(
    <BandEditor
      bands={bands}
      kind={kind}
      language="en"
      totalMarks={10}
      onMove={noop}
      onEditField={noop}
      onRemoveField={noop}
      onAddField={noop}
    />,
  );

const skeleton = (xml: string) =>
  xml
    .replace(/<w:tab w:val="(\w+)" w:pos="\d+"\/>/g, '[$1]')
    .replace(/<w:tab\/>/g, '⇥')
    .replace(/<\/w:p>/g, '¶')
    .replace(/<[^>]+>/g, '')
    .split('¶')
    .map((line) => line.trim())
    .filter(Boolean);

async function exported(worksheet: Worksheet, part: RegExp): Promise<string[]> {
  const zip = await JSZip.loadAsync(await exportDocxBuffer(worksheet, { language: 'en', version: 'student' }));
  const names = Object.keys(zip.files).filter((name) => part.test(name)).sort();
  return (await Promise.all(names.map((name) => zip.file(name)!.async('string')))).flatMap(skeleton);
}

/** Every non-empty choice of printing zones. */
const COMBINATIONS = Array.from({ length: 7 }, (_, n) =>
  Object.fromEntries(ZONES.map((zone, bit) => [zone, Boolean((n + 1) & (1 << bit))])) as Record<ZoneName, boolean>,
);
const TEXT: Record<ZoneName, string> = { left: 'Lt', center: 'Ct', right: 'Rt' };

/** What the page's plan says the paragraph is, in the skeleton's spelling. */
function planned(occupied: Record<ZoneName, boolean>, kind: BandRowKind): string {
  const plan = bandTabPlan(occupied, kind);
  return (
    plan.stops.map((stop) => `[${stop.align}]`).join('') +
    ZONES.filter((zone) => occupied[zone]).map((zone) => '⇥'.repeat(plan.tabsBefore[zone]) + TEXT[zone]).join('')
  );
}

const rowOf = (occupied: Record<ZoneName, boolean>) =>
  createBand(
    Object.fromEntries(
      ZONES.map((zone) => [zone, occupied[zone] ? [createTextField(bi(TEXT[zone], ''))] : []]),
    ),
  );

describe('band tab plan', () => {
  it('is the paragraph the .docx writes for a header row', async () => {
    for (const occupied of COMBINATIONS) {
      const worksheet = createWorksheet();
      worksheet.header = { enabled: true, bands: [rowOf(occupied)] };
      expect(await exported(worksheet, /^word\/header\d*\.xml$/)).toContain(planned(occupied, 'header'));
    }
  });

  it('is the paragraph the .docx writes for a masthead row', async () => {
    for (const occupied of COMBINATIONS) {
      const worksheet = createWorksheet();
      worksheet.bands = [rowOf(occupied)];
      expect(await exported(worksheet, /^word\/document\.xml$/)).toContain(planned(occupied, 'masthead'));
    }
  });
});

describe('resolveTab', () => {
  // Measured off LibreOffice's render of the same paragraphs (W = 451.3pt, stops at
  // 225.65 centre and 451.3 right): the start of the text after the tab.
  const W = 451.3;
  const both = [
    { align: 'center' as const, at: 0.5 },
    { align: 'right' as const, at: 1 },
  ];
  it('centres on the centre stop, unless the text before it is in the way', () => {
    expect(resolveTab(165.4, W, both, 21.9)).toBeCloseTo(214.7, 1);
    expect(resolveTab(165.4, W, both, 180.3)).toBeCloseTo(165.4, 1);
  });
  it('takes the first stop past the text, whichever zone it was meant for', () => {
    // A left zone past the middle sends the centre text to the right stop.
    expect(resolveTab(266.1, W, both, 53.1)).toBeCloseTo(398.2, 1);
  });
  it('right-aligns what fits on the line; nothing is left past the last stop', () => {
    expect(resolveTab(410.5, W, both, 32)).toBeCloseTo(419.3, 1);
    expect(resolveTab(451.3, W, both, 10)).toBeUndefined();
  });
});

describe('band row frame', () => {
  it('is the frame of the editor, the idle header and the IR masthead', () => {
    const band = createBand({
      left: [createTextField(bi('DBS Economics G11 Enhancement Class (2025-26) Assessment 1', ''))],
      right: [createTextField(bi('P.1', ''))],
    });
    expect(editor([band])).toContain('data-band-row=""');
    expect(editor([band])).toMatch(/data-band-stops="\[[^"]*right[^"]*\]"/);

    const worksheet = createWorksheet();
    worksheet.bands = [band];
    const [node] = renderWorksheet(worksheet, { language: 'en', version: 'student' }).bands;
    expect(node).toMatchObject({ kind: 'columns', band: true });
    const html = renderToStaticMarkup(<NodeView node={node} language="en" />);
    expect(html).toContain('data-band-row=""');
    expect(html.match(/data-band-tab=""/g)).toHaveLength(1);

    // `ReadOnlyBandRow` (idle header and footer, and what they print) is not exported.
    const preview = readFileSync('src/components/preview/Preview.tsx', 'utf8');
    const readOnly = preview.slice(preview.indexOf('function ReadOnlyBandRow('));
    expect(readOnly.slice(0, readOnly.indexOf('\n}\n'))).toContain('<BandRowFrame');
  });

  it('sets header and footer text at the body size the .docx gives them', () => {
    // Exported in `Normal`: the document's body size, not 9pt.
    const preview = readFileSync('src/components/preview/Preview.tsx', 'utf8');
    const band = preview.slice(preview.indexOf('export function HeaderFooterBand('));
    expect(band.slice(0, band.indexOf('\n}\n'))).not.toMatch(/text-xs/);
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
  });

  it('shows an empty affix’s + only on hover, positioned, and never in print', () => {
    const html = editor([createBand({ right: [createPageNumberField('pDot')] })], 'header');
    const wrappers = html.match(/<span data-affix-plus="(prefix|suffix)"[^>]*>/g) ?? [];
    expect(wrappers).toHaveLength(2);
    for (const wrapper of wrappers) {
      expect(wrapper).toContain('absolute');
      expect(wrapper).toContain('opacity-0');
      expect(wrapper).toContain('group-hover/field:opacity-100');
    }
    expect(html).toMatch(/data-print-hide="true"[^>]*>\+</);
  });
});
