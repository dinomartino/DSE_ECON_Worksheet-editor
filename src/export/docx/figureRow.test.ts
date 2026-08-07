import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { exportDocxBuffer } from '.';
import {
  createFigureRowBlock,
  createImageBlock,
  createMcqQuestion,
  createTableBlock,
  createWorksheet,
} from '@/model/factories';
import { bi } from '@/model/text';
import type { OutputMode, Worksheet } from '@/model/types';
import { worksheetClipboardHtml } from '@/export/clipboard';
import { withFlow, TINY_PNG } from '@/test/fixtures';

/**
 * The figure row in the .docx: a borderless two-cell layout table with the real
 * table **nested** inside one cell — the only OOXML that puts a bordered table
 * beside a picture without floating it out of the measured flow.
 */

const MODE: OutputMode = { language: 'en', version: 'student' };

function buildWorksheet(): Worksheet {
  const worksheet = withFlow(createWorksheet(), [createMcqQuestion()]);
  const table = createTableBlock(3, 2);
  table.rows[0].cells[0].text = bi('Ele.me', '餓了麼');
  worksheet.questions[0].blocks.push(
    createFigureRowBlock(createImageBlock(TINY_PNG, 200, 150), table),
  );
  return worksheet;
}

async function documentXml(worksheet: Worksheet): Promise<string> {
  const zip = await JSZip.loadAsync(await exportDocxBuffer(worksheet, MODE));
  return zip.file('word/document.xml')!.async('string');
}

describe('the figure row exports as a nested layout table', () => {
  it('nests the real table inside a cell, and every cell ends in a paragraph', async () => {
    const xml = await documentXml(buildWorksheet());

    // A <w:tbl> inside a <w:tc> is the nesting; Word additionally requires the cell
    // to close with a paragraph after the nested table, or it repairs the file.
    expect(xml).toMatch(/<w:tc>(?:(?!<\/w:tc>)[\s\S])*<w:tbl>/);
    expect(xml).toMatch(
      /<\/w:tbl>(?:(?!<w:tbl)(?!<\/w:tc>)[\s\S])*<w:p[ >](?:(?!<\/w:tc>)[\s\S])*<\/w:tc>/,
    );
    // The nested table still prints its content.
    expect(xml).toContain('Ele.me');
  });

  it('draws no border of its own — all six spelled none, never omitted', async () => {
    const xml = await documentXml(buildWorksheet());
    const outer = xml.slice(xml.indexOf('<w:tbl>'), xml.indexOf('<w:tblGrid>'));
    for (const side of ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']) {
      expect(outer).toContain(`<w:${side} w:val="none"`);
    }
  });

  it('centres both cells vertically, as the reference sits them', async () => {
    const xml = await documentXml(buildWorksheet());
    expect((xml.match(/<w:vAlign w:val="center"\/>/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('collects the figure image, so no r:embed dangles', async () => {
    const zip = await JSZip.loadAsync(await exportDocxBuffer(buildWorksheet(), MODE));
    const media = Object.keys(zip.files).filter((name) => name.startsWith('word/media/'));
    expect(media.length).toBeGreaterThan(0);
    const xml = await zip.file('word/document.xml')!.async('string');
    const rels = await zip.file('word/_rels/document.xml.rels')!.async('string');
    for (const embed of xml.match(/r:embed="([^"]+)"/g) ?? []) {
      const relId = embed.slice('r:embed="'.length, -1);
      expect(rels).toContain(`Id="${relId}"`);
    }
  });

  it('pastes as a borderless two-cell HTML table', () => {
    const html = worksheetClipboardHtml(buildWorksheet(), MODE);
    expect(html).toContain('vertical-align:middle');
    expect(html).toContain('<img src="data:image/png');
    expect(html).toContain('Ele.me');
  });
});
