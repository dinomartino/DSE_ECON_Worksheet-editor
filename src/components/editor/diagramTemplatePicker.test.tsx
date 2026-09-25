import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DIAGRAM_TEMPLATES, DIAGRAM_TEMPLATE_GROUPS } from '@/model/diagramTemplates';
import { plain } from '@/model/text';
import { DiagramTemplateCards } from './DiagramTemplatePicker';

describe('DiagramTemplateCards', () => {
  const html = renderToStaticMarkup(<DiagramTemplateCards currentId="tariff" onPick={() => {}} />);

  it('lists every group under its heading, in order', () => {
    const order = DIAGRAM_TEMPLATE_GROUPS.map((g) => html.indexOf(`data-template-group="${g.id}"`));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    for (const g of DIAGRAM_TEMPLATE_GROUPS) expect(html).toContain(plain(g.name.en).replace('&', '&amp;'));
  });

  it('shows one card per template and rings the current one', () => {
    expect((html.match(/aria-pressed=/g) ?? []).length).toBe(DIAGRAM_TEMPLATES.length);
    expect((html.match(/aria-pressed="true"/g) ?? []).length).toBe(1);
  });
});
