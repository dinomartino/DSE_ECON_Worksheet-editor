import { describe, it, expect } from 'vitest';
import { exportDocxBuffer } from './index';
import { createWorksheet, createMcqQuestion } from '@/model/factories';
import { bi } from '@/model/text';
import { renderWorksheet } from '@/render/worksheet';
import type { McqQuestion, TableBlock, Worksheet } from '@/model/types';
import JSZip from 'jszip';

/**
 * A boxed stimulus: a frame with no rules inside it.
 *
 * DSE 2021 P1 boxes a stimulus four times, and Q21 is the shape a uniform grid cannot
 * express — three numbered proposals inside one frame with no rule between them. Q30 is
 * the other half: a frame holding an extract *and* a photograph.
 */

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function withTable(table: TableBlock): Worksheet {
  const question = createMcqQuestion() as McqQuestion;
  question.blocks = [table];
  const base = createWorksheet();
  return { ...base, questions: [question], flow: [{ type: 'question', id: question.id }] };
}

/** Q21's shape: three proposals, one frame, no inner rules. */
function proposals(borders: TableBlock['borders']): Worksheet {
  return withTable({
    kind: 'table',
    id: 'box',
    borders,
    rows: [1, 2, 3].map((n) => ({
      id: `r${n}`,
      cells: [
        { id: `a${n}`, text: bi(`Proposal (${n}):`, '') },
        { id: `b${n}`, text: bi(`the ${n}th proposal`, '') },
      ],
    })),
  });
}

const MODE = { language: 'en', version: 'student' } as const;

async function documentXml(worksheet: Worksheet): Promise<string> {
  const buffer = await exportDocxBuffer(worksheet, MODE, new Map());
  const zip = await JSZip.loadAsync(buffer);
  return zip.file('word/document.xml')!.async('string');
}

describe('a boxed stimulus', () => {
  it('rules its frame and suppresses the rules inside', async () => {
    const xml = await documentXml(proposals('box'));
    const borders = xml.match(/<w:tblBorders>[\s\S]*?<\/w:tblBorders>/)![0];

    // The frame stays.
    for (const side of ['top', 'left', 'bottom', 'right']) {
      expect(borders).toContain(`<w:${side} w:val="single"`);
    }
    // The inner rules are explicitly *none*, not merely absent: Word inherits an
    // unstated border from the table style, so omitting them draws the grid the box
    // exists to suppress.
    expect(borders).toContain('<w:insideH w:val="none"');
    expect(borders).toContain('<w:insideV w:val="none"');
  });

  it('leaves an ordinary table byte-identical', async () => {
    const stored = await documentXml(proposals('all'));
    const unstored = await documentXml(proposals(undefined));
    expect(unstored).toBe(stored);
    expect(unstored).toContain('<w:insideH w:val="single"');
  });

  it('embeds a picture that lives inside a cell', async () => {
    const worksheet = withTable({
      kind: 'table',
      id: 'extract',
      borders: 'box',
      rows: [
        {
          id: 'r1',
          cells: [
            {
              id: 'c1',
              text: bi('In 2018, KFC Canada launched the Bitcoin Bucket.', ''),
              image: { src: PNG, widthPx: 180, heightPx: 180, altText: bi('Bitcoin Bucket', '') },
            },
          ],
        },
      ],
    });

    const buffer = await exportDocxBuffer(worksheet, MODE, new Map());
    const zip = await JSZip.loadAsync(buffer);
    const xml = await zip.file('word/document.xml')!.async('string');
    const rels = await zip.file('word/_rels/document.xml.rels')!.async('string');

    // The picture is emitted...
    expect(xml).toContain('<w:drawing>');
    // ...inside the cell, after its text.
    const cell = xml.match(/<w:tc>[\s\S]*?<\/w:tc>/)![0];
    expect(cell).toContain('Bitcoin Bucket');
    expect(cell).toContain('<w:drawing>');

    // ...and every relationship it names resolves. A dangling `r:embed` is not a missing
    // picture — Word reports it as a repair error on the whole file.
    const embeds = [...xml.matchAll(/r:embed="(rId\d+)"/g)].map((m) => m[1]);
    expect(embeds.length).toBeGreaterThan(0);
    for (const relId of embeds) expect(rels).toContain(`Id="${relId}"`);

    // The image part itself is in the package.
    expect(Object.keys(zip.files).some((name) => name.startsWith('word/media/'))).toBe(true);
  });

  it('resolves borders once, in the IR', () => {
    const nodes = renderWorksheet(proposals(undefined), MODE).questions[0].nodes;
    const table = nodes.find((node) => node.kind === 'table')!;
    // Always resolved, so no backend has to decide what "unstored" means.
    expect(table.borders).toBe('all');
  });
});
