import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createAnswerGraph } from '@/model/answerGraph';
import { defaultDiagramAltText } from '@/model/diagramTemplates';
import { altTextAfterTemplateSwap, createAnswerDiagram, createParagraphBlock } from '@/model/factories';
import { bi, plain } from '@/model/text';
import { AnswerGraphFields } from './AnswerGraphFields';
import { BlockEditor } from './BlockEditor';

const noop = () => {};

describe('a model answer’s blocks (u-0c5q)', () => {
  const answer = { label: 'Answer text' };

  it('a model diagram offers the alt text and title a stem diagram has', () => {
    const markup = renderToStaticMarkup(<BlockEditor blocks={[createAnswerDiagram()]} onChange={noop} answer={answer} />);
    expect(markup).toContain('aria-label="Alt text (English)"');
    expect(markup).toContain('aria-label="Title (English)"');
  });

  it('types a paragraph in the panel, offers the stem’s Add row, and no source panel', () => {
    const markup = renderToStaticMarkup(
      <BlockEditor blocks={[createParagraphBlock(bi('Then supply falls.', '然後供應下跌。'))]} onChange={noop} answer={answer} />,
    );
    expect(markup).toContain('aria-label="Answer text (English)"');
    for (const add of ['Add text', 'Add image', 'Add diagram']) expect(markup).toContain(add);
    expect(markup).not.toContain('Source');
    // A stem's paragraph stays an address of text typed on the page.
    const stem = renderToStaticMarkup(
      <BlockEditor blocks={[createParagraphBlock(bi('Then supply falls.', '然後供應下跌。'))]} onChange={noop} />,
    );
    expect(stem).not.toContain('aria-label="Answer text');
    expect(stem).toContain('Source');
  });
});

describe('altTextAfterTemplateSwap', () => {
  it('follows the template while the alt text is its default or empty', () => {
    const fromDefault = altTextAfterTemplateSwap(defaultDiagramAltText('supply-demand'), 'supply-demand', 'ppc');
    expect(fromDefault).toEqual(defaultDiagramAltText('ppc'));
    expect(plain(fromDefault.en)).not.toBe(plain(defaultDiagramAltText('supply-demand').en));
    expect(altTextAfterTemplateSwap(bi('', ''), 'supply-demand', 'ppc')).toEqual(defaultDiagramAltText('ppc'));
  });

  it('keeps words the teacher typed', () => {
    const typed = bi('Price ceiling below equilibrium', '低於均衡的價格上限');
    expect(altTextAfterTemplateSwap(typed, 'supply-demand', 'ppc')).toBe(typed);
  });
});

describe('graph answer space fields', () => {
  it('offers any height 6 to 40 beside the presets', () => {
    const markup = renderToStaticMarkup(
      <AnswerGraphFields graph={{ ...createAnswerGraph(), lines: 31 }} onChange={noop} onRemove={noop} />,
    );
    expect(markup).toMatch(/<input[^>]*data-answer-graph-lines=""[^>]*>/);
    expect(markup).toMatch(/min="6"/);
    expect(markup).toMatch(/max="40"/);
    expect(markup).toMatch(/value="31"/);
  });
});
