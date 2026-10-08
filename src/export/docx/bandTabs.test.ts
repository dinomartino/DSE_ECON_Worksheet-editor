import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { createBand, createTextField } from '@/model/bands';
import { createWorksheet } from '@/model/factories';
import { bi } from '@/model/text';
import type { Band, BandZones, Worksheet } from '@/model/types';
import { exportDocxBuffer } from './index';

/**
 * A band row is one Word paragraph with tab stops, and the page lays it out the way Word
 * does (§ Bands and zones), so the stops and tabs must say what the page shows. Rows are
 * reduced to `[stops]text⇥text` here: what Word lays out, without the run formatting.
 */
const t = (text: string) => createTextField(bi(text, ''));
const row = (zones: Partial<Record<keyof BandZones, string[]>>): Band =>
  createBand({
    left: (zones.left ?? []).map(t),
    center: (zones.center ?? []).map(t),
    right: (zones.right ?? []).map(t),
  });

const skeleton = (xml: string) =>
  xml
    .replace(/<w:tab w:val="(\w+)" w:pos="\d+"\/>/g, '[$1]')
    .replace(/<w:tab\/>/g, '⇥')
    .replace(/<\/w:p>/g, '¶')
    .replace(/<[^>]+>/g, '')
    .split('¶')
    .map((line) => line.trim());

async function paragraphs(worksheet: Worksheet, part: RegExp): Promise<string[]> {
  const zip = await JSZip.loadAsync(await exportDocxBuffer(worksheet, { language: 'en', version: 'student' }));
  const names = Object.keys(zip.files).filter((name) => part.test(name)).sort();
  const xml = await Promise.all(names.map((name) => zip.file(name)!.async('string')));
  return xml.flatMap(skeleton);
}

describe('masthead band rows in the .docx', () => {
  const masthead = async (...bands: Band[]) => {
    const worksheet = createWorksheet();
    worksheet.bands = bands;
    return paragraphs(worksheet, /^word\/document\.xml$/);
  };

  it('tabs to the zone a row starts in, rather than printing it at the margin', async () => {
    const lines = await masthead(
      row({ center: ['Title'] }),
      row({ center: ['Assessment 1'], right: ['Name:'] }),
      row({ right: ['Right only'] }),
    );
    expect(lines).toContain('[center]⇥Title');
    expect(lines).toContain('[center][right]⇥Assessment 1⇥Name:');
    expect(lines).toContain('[right]⇥Right only');
  });

  it('writes a row starting on the left exactly as before', async () => {
    const lines = await masthead(
      row({ left: ['L'], right: ['R'] }),
      row({ left: ['L'], center: ['C'], right: ['R'] }),
      row({ left: ['Full marks'] }),
    );
    expect(lines).toContain('[right]L⇥R');
    expect(lines).toContain('[center][right]L⇥C⇥R');
    expect(lines).toContain('Full marks');
  });

  it('prints fields sharing a zone one space apart, on one stop', async () => {
    expect(await masthead(row({ left: ['Two', 'fields'], right: ['R1', 'R2'] }))).toContain(
      '[right]Two fields⇥R1 R2',
    );
  });
});

describe('header band rows in the .docx', () => {
  const header = async (...bands: Band[]) => {
    const worksheet = createWorksheet();
    worksheet.header = { enabled: true, rule: false, showOnFirstPage: true, bands };
    return paragraphs(worksheet, /^word\/header\d*\.xml$/);
  };

  it('reaches the right zone of a left + right row with one tab and no centre stop', async () => {
    // With a centre stop it took two tabs, and once the left text passed the middle the
    // first jumped to the right stop and the second off the line.
    expect(await header(row({ left: ['A long school name and paper'], right: ['Name:'] }))).toContain(
      '[right]A long school name and paper⇥Name:',
    );
  });

  it('keeps the centre stop wherever a centre or right-only row needs it', async () => {
    const lines = await header(
      row({ center: ['C'], right: ['R'] }),
      row({ right: ['R'] }),
      row({ left: ['L'], center: ['C'] }),
    );
    expect(lines).toContain('[center][right]⇥C⇥R');
    expect(lines).toContain('[center][right]⇥⇥R');
    expect(lines).toContain('[center][right]L⇥C');
  });

  it('prints fields sharing a zone one space apart', async () => {
    expect(await header(row({ center: ['Paper 1 2025-2026', 'P.5'] }))).toContain(
      '[center][right]⇥Paper 1 2025-2026 P.5',
    );
  });
});
