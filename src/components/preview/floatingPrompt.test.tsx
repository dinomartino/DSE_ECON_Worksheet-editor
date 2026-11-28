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
    expect(prompt).toContain('title="Click to add 中文"');
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
    expect(html).toContain('Click to add English');
  });

  it('stacks both sides with a break when both have text, with no prompt', () => {
    const html = render(t('Supply', '供求'));
    expect(html).toContain('<br');
    expect(floating(html)).toHaveLength(0);
  });

  it('never floats in a single-language mode or on a read-only page', () => {
    expect(floating(render(t('Supply', ''), 'zh'))).toHaveLength(0);
    expect(render(t('Supply', ''), 'zh')).toContain('Click to add 中文');
    expect(floating(render(t('', '供求'), 'en'))).toHaveLength(0);
    const readOnly = render(t('Supply', ''), 'bilingual', false);
    expect(readOnly).not.toContain('Add 中文');
    expect(readOnly).not.toContain('<br');
  });
});

/**
 * k-0263 (STATUS k-0180 "found, not fixed"): a text that prints nothing in the shown language
 * — a 中文-only stem or option in an English copy — is still a paragraph in Word, its "1." or
 * "A." line. The editor's "Add English" prompt holds that line; the measuring copy the `.docx`
 * breaks and the anonymised preview are taken from has no prompt, and collapsed it to nothing,
 * so the export broke its pages a line per empty text later than the editor. A zero-width
 * space now holds the line there, and never prints. In Chrome: `scripts/anon-verify.mjs`
 * (`test-fixtures/manual/mixed-for-anonymiser.json` in EN: editor, preview and `.docx` agree).
 */

const tEl = (en: string, zh: string): BiText => ({ en: en ? [{ text: en }] : [], zh: zh ? [{ text: zh }] : [] });
const renderEl = (text: BiText, language: LanguageMode, withCtx: boolean, extra: Partial<RenderNode> = {}) => {
  const node = {
    kind: 'text',
    style: 'Question Stem',
    text,
    edit: { kind: 'blockText', blockId: 'b1' },
    listRef: { definition: 'question', level: 0, marker: '1.' },
    ...extra,
  } as RenderNode;
  return renderToStaticMarkup(<NodeView node={node} language={language} ctx={withCtx ? ctx : undefined} />);
};
const FILLER = '​';

describe('a text empty in the shown language', () => {
  it('holds its line on a measuring copy: 中文-only in English, English-only in 中文, both empty', () => {
    expect(renderEl(tEl('', '需求'), 'en', false)).toContain(FILLER);
    expect(renderEl(tEl('Demand', ''), 'zh', false)).toContain(FILLER);
    expect(renderEl(tEl('', ''), 'bilingual', false)).toContain(FILLER);
    expect(renderEl(tEl(' ', ''), 'en', false)).toContain(FILLER);
  });

  it('the filler is aria-hidden and has no words, so nothing prints or is read out', () => {
    const html = renderEl(tEl('', '需求'), 'en', false);
    expect(html).toMatch(/<span aria-hidden="true">​<\/span>/);
    expect(html).not.toContain('Add English');
  });

  it('takes no filler where the editor’s prompt holds the line, or where the text prints', () => {
    const editing = renderEl(tEl('', '需求'), 'en', true);
    expect(editing).not.toContain(FILLER);
    expect(editing).toContain('Click to add English');
    expect(renderEl(tEl('Demand', '需求'), 'en', false)).not.toContain(FILLER);
    expect(renderEl(tEl('Demand', ''), 'bilingual', false)).not.toContain(FILLER);
  });

  it('a marks label holds the line already: no filler beside it', () => {
    expect(renderEl(tEl('', '需求'), 'en', false, { marks: 2 } as Partial<RenderNode>)).not.toContain(FILLER);
  });

  it('a derived paragraph with no field (no prompt) holds its line in the editor too', () => {
    expect(renderEl(tEl('', ''), 'en', true, { edit: undefined } as Partial<RenderNode>)).toContain(FILLER);
  });
});
