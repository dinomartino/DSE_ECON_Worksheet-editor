import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { RenderNode } from '@/render/ir';
import type { BiText, LanguageMode } from '@/model/types';
import { NodeView, type EditContext } from './Preview';

/**
 * k-0263 (STATUS k-0180 "found, not fixed"): a text that prints nothing in the shown language
 * — a 中文-only stem or option in an English copy — is still a paragraph in Word, its "1." or
 * "A." line. The editor's "Add English" prompt holds that line; the measuring copy the `.docx`
 * breaks and the anonymised preview are taken from has no prompt, and collapsed it to nothing,
 * so the export broke its pages a line per empty text later than the editor. A zero-width
 * space now holds the line there, and never prints. In Chrome: `scripts/anon-verify.mjs`
 * (`test-fixtures/manual/mixed-for-anonymiser.json` in EN: editor, preview and `.docx` agree).
 */

const ctx = {
  onEdit: () => {},
  onEditKeepingSelection: () => {},
  onSelectElement: () => {},
  onClearSelection: () => {},
  isSelected: () => false,
} as unknown as EditContext;

const t = (en: string, zh: string): BiText => ({ en: en ? [{ text: en }] : [], zh: zh ? [{ text: zh }] : [] });
const render = (text: BiText, language: LanguageMode, withCtx: boolean, extra: Partial<RenderNode> = {}) => {
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
    expect(render(t('', '需求'), 'en', false)).toContain(FILLER);
    expect(render(t('Demand', ''), 'zh', false)).toContain(FILLER);
    expect(render(t('', ''), 'bilingual', false)).toContain(FILLER);
    expect(render(t(' ', ''), 'en', false)).toContain(FILLER);
  });

  it('the filler is aria-hidden and has no words, so nothing prints or is read out', () => {
    const html = render(t('', '需求'), 'en', false);
    expect(html).toMatch(/<span aria-hidden="true">​<\/span>/);
    expect(html).not.toContain('Add English');
  });

  it('takes no filler where the editor’s prompt holds the line, or where the text prints', () => {
    const editing = render(t('', '需求'), 'en', true);
    expect(editing).not.toContain(FILLER);
    expect(editing).toContain('Click to add English');
    expect(render(t('Demand', '需求'), 'en', false)).not.toContain(FILLER);
    expect(render(t('Demand', ''), 'bilingual', false)).not.toContain(FILLER);
  });

  it('a marks label holds the line already: no filler beside it', () => {
    expect(render(t('', '需求'), 'en', false, { marks: 2 } as Partial<RenderNode>)).not.toContain(FILLER);
  });

  it('a derived paragraph with no field (no prompt) holds its line in the editor too', () => {
    expect(render(t('', ''), 'en', true, { edit: undefined } as Partial<RenderNode>)).toContain(FILLER);
  });
});
