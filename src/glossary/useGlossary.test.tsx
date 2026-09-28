import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { loadGlossary } from './load';
import { useGlossary } from './useGlossary';

function Probe() {
  const glossary = useGlossary();
  return createElement('span', null, glossary ? 'loaded' : 'loading');
}

describe('useGlossary', () => {
  it('is null on first render, before the load resolves', () => {
    expect(renderToStaticMarkup(createElement(Probe))).toBe('<span>loading</span>');
  });

  it('loads a glossary without rejecting', async () => {
    const glossary = await loadGlossary();
    expect(Array.isArray(glossary.entries)).toBe(true);
    expect(glossary.checkEnToZh('price level', '物價水平')).toBeInstanceOf(Array);
  });
});
