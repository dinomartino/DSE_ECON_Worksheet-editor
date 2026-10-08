import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createAnswerGraph } from '@/model/answerGraph';
import { defaultDiagramAltText } from '@/model/diagramTemplates';
import { altTextAfterTemplateSwap, createAnswerDiagram } from '@/model/factories';
import { bi, plain } from '@/model/text';
import { AnswerDiagramRow } from './AnswerDiagramRow';
import { AnswerGraphFields } from './AnswerGraphFields';

const noop = () => {};

describe('model answer diagram row', () => {
  it('offers the alt text and title a stem diagram has', () => {
    const block = createAnswerDiagram();
    const markup = renderToStaticMarkup(<AnswerDiagramRow block={block} onChange={noop} onRemove={noop} />);
    expect(markup).toContain('aria-label="Alt text (English)"');
    expect(markup).toContain('aria-label="Title (English)"');
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
