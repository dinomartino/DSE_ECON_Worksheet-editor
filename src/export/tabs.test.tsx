import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildDocxParts } from './docx';
import { run, richTextRuns } from './docx/runs';
import { tabsElement } from './docx/body';
import { buildSettingsXml } from './docx/package';
import { formatCss, richHtml } from './clipboard';
import { createParagraphBlock, createWorksheet } from '@/model/factories';
import { bi } from '@/model/text';
import { NodeView } from '@/components/preview/Preview';
import type { TextNode } from '@/render/ir';
import type { OutputMode, TabStop, Worksheet } from '@/model/types';

/**
 * A typed tab and a paragraph's tab stops reach every backend (docs/Tabs vs Word.md):
 * the `.docx` as Word's own elements, the clipboard as Word's HTML, the page as a
 * `[data-tab]` gap that `layoutTabs` sizes.
 */
const FONTS = { latin: 'Times New Roman', eastAsia: 'PMingLiU' };
const EN: OutputMode = { language: 'en', version: 'student' };

const withStem = (text: string, tabStops?: TabStop[]): Worksheet => {
  const worksheet = createWorksheet();
  const block = createParagraphBlock(bi(text, ''));
  if (tabStops) block.format = { tabStops };
  worksheet.questions = [
    { id: 'q', type: 'structured', blocks: [block], parts: [], marks: 4 } as Worksheet['questions'][number],
  ];
  return worksheet;
};

describe('.docx', () => {
  it('writes a typed tab as <w:tab/> in its own run', () => {
    const xml = run('Name:\tClass:', FONTS);
    expect(xml).toContain('<w:t xml:space="preserve">Name:</w:t></w:r><w:r>');
    expect(xml).toMatch(/<w:r><w:rPr>.*?<\/w:rPr><w:tab\/><\/w:r>/);
    expect(xml).not.toContain('\t');
  });

  it('keeps an underlined tab underlined, so a blank rules its gap', () => {
    expect(richTextRuns([{ text: 'Name:' }, { text: '\t', underline: true }], FONTS)).toMatch(
      /<w:u w:val="single"\/><\/w:rPr><w:tab\/>/,
    );
  });

  it('writes a tab between line breaks and leaves a tab-free run as it was', () => {
    expect(run('a\n\tb', FONTS)).toMatch(/<w:br\/><\/w:r><w:r>.*<w:tab\/><\/w:r><w:r>.*>b</);
    expect(run('plain', FONTS)).toBe(
      '<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="PMingLiU" w:cs="Times New Roman"/></w:rPr><w:t xml:space="preserve">plain</w:t></w:r>',
    );
  });

  it('writes the stops as one w:tabs, a layout stop winning its position', () => {
    const format = { tabStops: [{ pos: 9026, align: 'right' as const, leader: 'underscore' as const }, { pos: 2000, align: 'decimal' as const }] };
    expect(tabsElement(format)).toBe(
      '<w:tabs><w:tab w:val="decimal" w:pos="2000"/><w:tab w:val="right" w:leader="underscore" w:pos="9026"/></w:tabs>',
    );
    expect(tabsElement(format, [{ pos: 9026, align: 'right' }])).toBe(
      '<w:tabs><w:tab w:val="decimal" w:pos="2000"/><w:tab w:val="right" w:pos="9026"/></w:tabs>',
    );
    expect(tabsElement(undefined)).toBe('');
  });

  it('puts a paragraph’s stops in its pPr and its tabs in its runs', () => {
    const { documentXml } = buildDocxParts(withStem('Name:\tClass:', [{ pos: 4000, align: 'left', leader: 'dot' }]), EN);
    // Beside the marks' right stop at the margin, in one element.
    expect(documentXml).toContain(
      '<w:tabs><w:tab w:val="left" w:leader="dot" w:pos="4000"/><w:tab w:val="right" w:pos="9026"/></w:tabs>',
    );
    expect(documentXml).toMatch(/Name:<\/w:t><\/w:r><w:r>(<w:rPr>.*?<\/w:rPr>)?<w:tab\/><\/w:r>/);
  });

  it('writes the default grid the page lays tabs on', () => {
    expect(buildSettingsXml()).toContain('<w:defaultTabStop w:val="720"/>');
  });
});

describe('clipboard', () => {
  it('pastes a tab as Word’s mso-tab-count span', () => {
    expect(richHtml(bi('Name:\tClass:', ''), 'en')).toBe(
      "Name:<span style='mso-tab-count:1'>&#9;</span>Class:",
    );
  });

  it('carries the stops as Word’s tab-stops', () => {
    expect(
      formatCss({ tabStops: [{ pos: 1440, align: 'left' }, { pos: 9020, align: 'right', leader: 'dot' }] }),
    ).toBe('tab-stops:72pt right dotted 451pt;');
  });
});

describe('the page', () => {
  const node: TextNode = {
    kind: 'text',
    style: 'Question Stem',
    text: bi('Name:\tClass:', ''),
    format: { tabStops: [{ pos: 4000, align: 'left' }] },
  } as TextNode;

  it('draws each tab as a gap span inside a paragraph that names its stops', () => {
    const html = renderToStaticMarkup(<NodeView node={node} language="en" />);
    expect(html).toContain('data-tab-host=""');
    expect(html).toContain(`data-tab-stops="${JSON.stringify(node.format!.tabStops).replace(/"/g, '&quot;')}"`);
    expect(html).toMatch(/Name:<span data-tab="">\t<\/span>Class:/);
  });

  it('renders text without a tab exactly as before', () => {
    const html = renderToStaticMarkup(<NodeView node={{ ...node, text: bi('Plain', '') }} language="en" />);
    expect(html).not.toContain('data-tab=');
    expect(html).toContain('<span>Plain</span>');
  });

  it('lets the marks move down alone after a tab, as they sit behind a tab of their own in Word', () => {
    const marked = { ...node, format: undefined, marks: 3 } as TextNode;
    expect(renderToStaticMarkup(<NodeView node={marked} language="en" />)).toContain('<wbr/>');
    // Without a typed tab the label still wraps with the last word, as it always did.
    const plainMarks = { ...marked, text: bi('Plain', '') } as TextNode;
    expect(renderToStaticMarkup(<NodeView node={plainMarks} language="en" />)).not.toContain('<wbr/>');
  });

  it('keeps every question and element at the margin, its hover box reaching into it', () => {
    // A padded box without the matching negative margin set the text 4px in from the
    // margin: a stop at the margin ended its text short, and every line wrapped narrower.
    const preview = readFileSync('src/components/preview/Preview.tsx', 'utf8');
    expect(preview.match(/relative -mx-1 cursor-pointer rounded-\[3px\] px-1 /g)).toHaveLength(2);
  });

  it('measures from the margin: every sheet and probe is a tab origin', () => {
    const preview = readFileSync('src/components/preview/Preview.tsx', 'utf8');
    // Two sheets (cover, body), the measuring probe, and a source panel (a cell in Word).
    expect(preview.match(/data-tab-origin=""/g)).toHaveLength(4);
  });

  it('Tab types a tab in a text paragraph, and walks cells in a table', () => {
    const inline = readFileSync('src/components/preview/InlineEditable.tsx', 'utf8');
    expect(inline).toContain("tabInserts={onTab ? undefined : (host) => host.closest('[data-tab-host]') !== null}");
  });
});
