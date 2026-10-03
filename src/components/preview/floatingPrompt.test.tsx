import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { RenderNode } from '@/render/ir';
import type { BiText, LanguageMode } from '@/model/types';
import { NodeView, type EditContext } from './Preview';

/**
 * The empty side of a bilingual field prints nothing in Word, so its prompt must take no
 * line on the page either: it floats (out of flow, print-hidden) after the other side.
 */
const ctx = {
  onEdit: () => {},
  onEditKeepingSelection: () => {},
  onSelectElement: () => {},
  onClearSelection: () => {},
  isSelected: () => false,
} as unknown as EditContext;

const render = (text: BiText, language: LanguageMode = 'bilingual', withCtx = true) => {
  const node: RenderNode = {
    kind: 'text',
    style: 'Worksheet Title',
    text,
    edit: { kind: 'worksheetTitle' },
  };
  return renderToStaticMarkup(<NodeView node={node} language={language} ctx={withCtx ? ctx : undefined} />);
};
const t = (en: string, zh: string): BiText => ({
  en: en ? [{ text: en }] : [],
  zh: zh ? [{ text: zh }] : [],
});
const floating = (html: string) => html.match(/<span[^>]*data-floating-prompt="true"[^>]*>[^<]*<\/span>/g) ?? [];

describe('a bilingual field with one side empty', () => {
  it('floats the empty side after the text, opening no line', () => {
    const html = render(t('Supply and demand', ''));
    expect(html).not.toContain('<br');
    const [prompt, ...rest] = floating(html);
    expect(rest).toHaveLength(0);
    expect(prompt).toContain('data-print-hide="true"');
    expect(prompt).toMatch(/class="absolute /);
    expect(prompt).toContain('Add 中文');
    expect(prompt).toContain('title="Double-click to add 中文"');
    expect(html.indexOf('Supply and demand')).toBeLessThan(html.indexOf('Add 中文'));
  });

  it('floats English after a Chinese-only field', () => {
    const html = render(t('', '供求'));
    expect(html).not.toContain('<br');
    expect(floating(html).join('')).toContain('Add English');
    expect(html.indexOf('供求')).toBeLessThan(html.indexOf('Add English'));
  });

  it('keeps one in-flow line when both are empty, as Word keeps one empty paragraph', () => {
    const html = render(t('', ''));
    expect(html).not.toContain('<br');
    expect(floating(html)).toHaveLength(1);
    expect(html).toContain('Double-click to add English');
  });

  it('stacks both sides with a break when both have text, with no prompt', () => {
    const html = render(t('Supply', '供求'));
    expect(html).toContain('<br');
    expect(floating(html)).toHaveLength(0);
  });

  it('never floats in a single-language mode or on a read-only page', () => {
    expect(floating(render(t('Supply', ''), 'zh'))).toHaveLength(0);
    expect(render(t('Supply', ''), 'zh')).toContain('Double-click to add 中文');
    expect(floating(render(t('', '供求'), 'en'))).toHaveLength(0);
    const readOnly = render(t('Supply', ''), 'bilingual', false);
    expect(readOnly).not.toContain('Add 中文');
    expect(readOnly).not.toContain('<br');
  });
});
