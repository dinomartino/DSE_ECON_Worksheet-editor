import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createGraph } from '@/model/graph';
import { bi } from '@/model/text';
import { dataUrlToBlob, graphClipboardHtml } from '@/export/graphImage';
import { BiTextField } from '@/components/editor/BiTextField';
import { FieldScopeContext } from '@/components/editor/fieldScope';
import { graphCount, graphSaveLabel, isGraphTemplate, searchGraphs } from './graphList';

describe('the Graphs library', () => {
  const graphs = [
    { ...createGraph('supply-demand'), name: 'Rice tariff' },
    { ...createGraph('supply-demand'), name: 'Wine quota' },
  ];

  it('searches names by every word, case-blind', () => {
    expect(searchGraphs(graphs, 'rice').map((g) => g.name)).toEqual(['Rice tariff']);
    expect(searchGraphs(graphs, 'TARIFF rice').map((g) => g.name)).toEqual(['Rice tariff']);
    expect(searchGraphs(graphs, '  ')).toHaveLength(2);
    expect(searchGraphs(graphs, 'tax')).toEqual([]);
  });

  it('counts in words', () => {
    expect(graphCount(1)).toBe('1 graph');
    expect(graphCount(6)).toBe('6 graphs');
  });

  it('offers only the templates the drawing canvas edits', () => {
    expect(isGraphTemplate('supply-demand')).toBe(true);
    expect(isGraphTemplate('blank')).toBe(true);
    for (const id of ['pie', 'flow', 'forum']) expect(isGraphTemplate(id)).toBe(false);
  });

  it('says what the autosave did, without a dash', () => {
    for (const state of ['saved', 'saving', 'failed', 'readOnly'] as const) {
      const { word, detail } = graphSaveLabel(state);
      expect(`${word} ${detail}`).not.toMatch(/[—–]/);
    }
  });
});

describe('copying a graph', () => {
  it('pastes at print size: the HTML names the printed width and height', () => {
    const graph = createGraph('supply-demand');
    graph.block.altText = bi('S & "D"', '供求');
    const html = graphClipboardHtml(graph, 'data:image/png;base64,AAAA');
    expect(html).toContain(`width="${graph.block.widthPx}"`);
    expect(html).toContain(`height="${graph.block.heightPx}"`);
    expect(html).toContain('alt="S &amp; &quot;D&quot;"');
    expect(html.startsWith('<img src="data:image/png;base64,AAAA"')).toBe(true);
  });

  it('turns a data URL back into its bytes and type', async () => {
    const blob = dataUrlToBlob('data:image/png;base64,iVBORw0K');
    expect(blob.type).toBe('image/png');
    expect([...new Uint8Array(await blob.arrayBuffer())].slice(0, 4)).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });
});

describe('a field outside the worksheet', () => {
  it('shows the side a saved graph draws in, not the open worksheet’s', () => {
    const html = renderToStaticMarkup(
      <FieldScopeContext.Provider value={{ language: 'zh', readOnly: false }}>
        <BiTextField label="Title" value={bi('Rice', '白米')} onChange={() => undefined} />
      </FieldScopeContext.Provider>,
    );
    expect(html).toContain('lang="zh-HK"');
    expect(html).not.toContain('lang="en"');
  });
});
