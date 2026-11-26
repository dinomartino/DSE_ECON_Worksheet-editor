import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { exportDocxBuffer } from '@/export/docx';
import { questionClipboardHtml } from '@/export/clipboard';
import { createImageBlock, createMcqQuestion, createTableBlock, createStructuredQuestion, createWorksheet } from '@/model/factories';
import { bi, plain } from '@/model/text';
import type { ContentBlock, LanguageMode, McqQuestion, Question, StructuredQuestion, Worksheet } from '@/model/types';
import { BLANK_LINE_PT, type RenderNode } from './ir';
import { renderWorksheet } from './worksheet';

/**
 * One blank line above and below a picture inside question text (k-0576, u-twaq / u-wydb;
 * the Mentor site's rule from k-0575).
 *
 * A picture or graph *between* parts of a question's text gets one line of that text's
 * height above and below it — a spent line, like every gap on this fixed-line page, so it
 * is an IR node and the preview, the `.docx`, the PDF, the clipboard and the bank cards all
 * space it the same. Nothing at the very start or end of the text, one line (not two)
 * between two pictures in a row, no second line where the text already has a blank one,
 * nothing for a picture-only option. Decided while rendering: the stored blocks never
 * change.
 */

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const para = (id: string, en: string, zh = ''): ContentBlock => ({ kind: 'paragraph', id, text: bi(en, zh) });
const image = (id: string): ContentBlock => ({ ...createImageBlock(PNG, 200, 100), id });
const diagram = (id: string): ContentBlock => ({
  kind: 'diagram',
  id,
  diagram: { x: { title: bi('Q', '') }, y: { title: bi('P', '') }, curves: [], points: [], labels: [], arrows: [] },
  widthPx: 200,
  heightPx: 150,
  altText: bi('', ''),
});

function sheetOf(question: Question): Worksheet {
  return { ...createWorksheet(), questions: [question], flow: [{ type: 'question', id: question.id }] };
}

function mcq(blocks: ContentBlock[], patch: Partial<McqQuestion> = {}): McqQuestion {
  return { ...(createMcqQuestion() as McqQuestion), blocks, ...patch };
}

function nodesOf(question: Question, language: LanguageMode = 'en'): RenderNode[] {
  return renderWorksheet(sheetOf(question), { language, version: 'student' }).questions[0].nodes;
}

/** The stream as a short reading: `text:<words>`, `gap`, `image`, `diagram`, `option:<letter>`. */
function shape(nodes: RenderNode[]): string[] {
  return nodes.map((node) => {
    if (node.kind === 'spacer') return node.heightPt === BLANK_LINE_PT ? 'gap' : `spacer${node.heightPt}`;
    if (node.kind === 'text') {
      if (node.listRef?.definition === 'option') return `option:${node.listRef.marker}${plain(node.text.en) || plain(node.text.zh) ? '+text' : ''}`;
      return `text:${plain(node.text.en) || plain(node.text.zh)}`;
    }
    return node.kind;
  });
}

/** The stem's part of the stream: everything before the first option line. */
function stemShape(question: McqQuestion, language: LanguageMode = 'en'): string[] {
  const all = shape(nodesOf(question, language));
  const end = all.findIndex((entry) => entry.startsWith('option:') || entry === 'columns' || entry === 'optionRow');
  return end < 0 ? all : all.slice(0, end);
}

describe('a picture inside question text', () => {
  it('takes one blank line above and below it between two paragraphs (DSE 2021 P1 Q23 shape)', () => {
    const question = mcq([
      para('a', 'A production chain of Good X in an economy is shown below.'),
      image('fig'),
      para('b', "The contribution of the above production chain to the economy's GDP at factor cost is"),
    ]);
    expect(stemShape(question)).toEqual([
      'text:A production chain of Good X in an economy is shown below.',
      'gap',
      'image',
      'gap',
      "text:The contribution of the above production chain to the economy's GDP at factor cost is",
      // The stem's own blank line before the options, as before.
      'gap',
    ]);
  });

  it('treats a graph (diagram) the same as a picture', () => {
    expect(stemShape(mcq([para('a', 'Study the diagram.'), diagram('d'), para('b', 'Which is correct?')]))).toEqual([
      'text:Study the diagram.',
      'gap',
      'diagram',
      'gap',
      'text:Which is correct?',
      'gap',
    ]);
  });

  it('adds nothing above a picture that opens the text', () => {
    // The stem's number sits on an empty line of its own; the picture follows it straight.
    expect(stemShape(mcq([image('fig'), para('b', 'Which is correct?')]))).toEqual([
      'text:',
      'image',
      'gap',
      'text:Which is correct?',
      'gap',
    ]);
  });

  it('adds nothing of its own below a picture that ends the text', () => {
    // The one line under it is the stem's ordinary blank before the options, not a second.
    expect(stemShape(mcq([para('a', 'Study the picture.'), image('fig')]))).toEqual([
      'text:Study the picture.',
      'gap',
      'image',
      'gap',
    ]);
  });

  it('puts one line, not two, between two pictures in a row', () => {
    expect(stemShape(mcq([para('a', 'Two pictures:'), image('one'), diagram('two'), para('b', 'Compare them.')]))).toEqual([
      'text:Two pictures:',
      'gap',
      'image',
      'gap',
      'diagram',
      'gap',
      'text:Compare them.',
      'gap',
    ]);
  });

  it('does not double a blank line the text already has (trailing / leading break)', () => {
    expect(stemShape(mcq([para('a', 'Above.\n'), image('fig'), para('b', '\nBelow.')]))).toEqual([
      'text:Above.\n',
      'image',
      'text:\nBelow.',
      'gap',
    ]);
  });

  it('does not double an empty paragraph standing as the blank line', () => {
    expect(stemShape(mcq([para('a', 'Above.'), para('e1', ''), image('fig'), para('e2', ''), para('b', 'Below.')]))).toEqual([
      'text:Above.',
      'text:',
      'image',
      'text:',
      'text:Below.',
      'gap',
    ]);
  });

  it('goes by the language printed: an English-only blank line does not count on the Chinese paper', () => {
    const question = mcq([para('a', 'Above.\n', '上文'), image('fig'), para('b', 'Below.', '下文')]);
    expect(stemShape(question, 'en')).toEqual(['text:Above.\n', 'image', 'gap', 'text:Below.', 'gap']);
    expect(stemShape(question, 'zh')).toEqual(['text:Above.\n', 'gap', 'image', 'gap', 'text:Below.', 'gap']);
  });

  it('keeps the gaps with the picture, so Word does not break between the text and its figure', () => {
    const nodes = nodesOf(mcq([para('a', 'Above.'), image('fig'), para('b', 'Below.')]));
    for (const node of nodes.slice(0, 4)) expect('keepNext' in node && node.keepNext).toBe(true);
  });

  it('leaves a table as it was: one line before, none after', () => {
    const question = mcq([
      para('a', 'The table:'),
      createTableBlock(1, 1),
      para('b', 'Which is correct?'),
    ]);
    expect(stemShape(question)).toEqual(['text:The table:', 'gap', 'table', 'text:Which is correct?', 'gap']);
  });
});

describe('a picture in an option', () => {
  const withOptionBlocks = (texts: [string, string][], layout?: McqQuestion['optionLayout']): McqQuestion => {
    const question = mcq([para('s', 'Which diagram is correct?')]);
    return {
      ...question,
      ...(layout ? { optionLayout: layout } : {}),
      options: question.options.map((option, index) => ({
        ...option,
        text: bi(...(texts[index] ?? ['', ''])),
        blocks: [image(`o${index}`)],
      })),
    };
  };

  it('adds nothing to a picture-only option', () => {
    const nodes = shape(nodesOf(withOptionBlocks([])));
    const options = nodes.slice(nodes.indexOf('option:A.'));
    expect(options).toEqual(['option:A.', 'image', 'option:B.', 'image', 'option:C.', 'image', 'option:D.', 'image']);
  });

  it('spaces the picture under an option that has words of its own', () => {
    const nodes = shape(nodesOf(withOptionBlocks([['Diagram I', ''], ['', ''], ['', ''], ['', '']])));
    const options = nodes.slice(nodes.indexOf('option:A.+text'));
    expect(options).toEqual(['option:A.+text', 'gap', 'image', 'option:B.', 'image', 'option:C.', 'image', 'option:D.', 'image']);
  });

  it('reads the option words in the printed language (a Chinese-only caption)', () => {
    const question = withOptionBlocks([['', '航空運輸服務'], ['', ''], ['', ''], ['', '']]);
    // The stored option has words (on the Chinese side), so read the stream from its letter.
    const after = (stream: string[]) => stream.slice(stream.findIndex((entry) => entry.startsWith('option:A.')) + 1);
    expect(after(shape(nodesOf(question, 'en'))).slice(0, 2)).toEqual(['image', 'option:B.']);
    expect(after(shape(nodesOf(question, 'zh'))).slice(0, 3)).toEqual(['gap', 'image', 'option:B.']);
  });

  it('adds nothing in a figure grid cell of a picture-only option', () => {
    const nodes = nodesOf(withOptionBlocks([], 'columns2'));
    const rows = nodes.filter((node) => node.kind === 'optionRow');
    expect(rows).toHaveLength(2);
    for (const row of rows) for (const cell of row.cells) expect(shape(cell)).toEqual(['columns', 'image']);
  });

  it('spaces a figure grid cell whose option has a caption', () => {
    const nodes = nodesOf(withOptionBlocks([['Thai rice in HK', ''], ['Thai rice in HK', ''], ['Chinese rice', ''], ['Chinese rice', '']], 'columns2'));
    const rows = nodes.filter((node) => node.kind === 'optionRow');
    for (const row of rows) for (const cell of row.cells) expect(shape(cell)).toEqual(['columns', 'gap', 'image']);
  });
});

describe('a picture inside a structured question', () => {
  it('spaces a picture between the lines of a part', () => {
    const question = createStructuredQuestion() as StructuredQuestion;
    question.blocks = [para('s', 'Read the information.')];
    question.parts = [{ ...question.parts[0], blocks: [para('p1', 'Refer to the figure.'), diagram('d'), para('p2', 'Explain.')] }];
    const all = shape(nodesOf(question));
    const at = all.indexOf('diagram');
    expect(all.slice(at - 2, at + 3)).toEqual(['text:Refer to the figure.', 'gap', 'diagram', 'gap', 'text:Explain.']);
  });
});

describe('the stored document is never rewritten', () => {
  it('renders the gap without touching the blocks', () => {
    const question = mcq([para('a', 'Above.'), image('fig'), para('b', 'Below.')]);
    const before = JSON.stringify(question);
    nodesOf(question);
    nodesOf(question, 'zh');
    expect(JSON.stringify(question)).toBe(before);
    expect(question.blocks.map((block) => block.kind)).toEqual(['paragraph', 'image', 'paragraph']);
  });
});

describe('every backend spaces it', () => {
  const question = mcq([para('a', 'Above the figure.'), image('fig'), para('b', 'Below the figure.')]);

  it('the .docx has an empty paragraph each side of the picture', async () => {
    const buffer = await exportDocxBuffer(sheetOf(question), { language: 'en', version: 'student' });
    const xml = await (await JSZip.loadAsync(buffer)).file('word/document.xml')!.async('string');
    const paragraphs = xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? [];
    const at = paragraphs.findIndex((p) => p.includes('<w:drawing'));
    expect(at).toBeGreaterThan(0);
    const words = (p: string) => (p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) ?? []).join('');
    expect(words(paragraphs[at - 1])).toBe('');
    expect(words(paragraphs[at - 2])).toContain('Above the figure.');
    expect(words(paragraphs[at + 1])).toBe('');
    expect(words(paragraphs[at + 2])).toContain('Below the figure.');
  });

  it('the clipboard / bank card copy has a blank line each side of the picture', () => {
    const html = questionClipboardHtml(sheetOf(question), question.id, { language: 'en', version: 'student' }, new Map());
    const body = html.slice(html.indexOf('Above the figure.'), html.indexOf('Below the figure.'));
    const img = body.indexOf('<img');
    expect(img).toBeGreaterThan(0);
    const blanks = (s: string) => (s.match(/<p[^>]*>(?:&nbsp;|\s|<br\s*\/?>)*<\/p>/g) ?? []).length;
    expect(blanks(body.slice(0, img))).toBe(1);
    expect(blanks(body.slice(img))).toBe(1);
  });
});
