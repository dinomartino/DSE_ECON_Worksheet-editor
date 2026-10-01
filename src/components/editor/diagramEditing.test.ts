import { describe, expect, it } from 'vitest';
import { REVENUE_PRESETS } from '@/model/diagramAreas';
import { ROLE_NAMES, SHADE_PRESETS, presetStatus } from '@/model/diagramPresets';
import { DIAGRAM_TEMPLATES, createBlankDiagram } from '@/model/diagramTemplates';
import { AREA_PALETTE } from '@/render/diagram';
import { modelText, modelTextZh } from './diagramEditing.messages';

describe('model strings the diagram editors translate', () => {
  it('has Chinese for every preset, role, revenue and colour name', () => {
    const names = [
      ...SHADE_PRESETS.map((p) => p.name),
      ...SHADE_PRESETS.flatMap((p) => p.roles.flatMap((r) => (r.name ? [r.name] : []))),
      ...Object.values(ROLE_NAMES),
      ...REVENUE_PRESETS.map((p) => p.name),
      ...Object.values(AREA_PALETTE).map((c) => c.name),
    ];
    expect(names.filter((n) => !(n in modelTextZh))).toEqual([]);
  });

  it('has Chinese for every reason a preset cannot be drawn on the templates', () => {
    const missing = new Set<string>();
    for (const diagram of [createBlankDiagram(), ...DIAGRAM_TEMPLATES.map((t) => t.build())]) {
      for (const preset of SHADE_PRESETS) {
        const why = presetStatus(diagram, preset).why;
        if (why && !(why in modelTextZh)) missing.add(why);
      }
    }
    expect([...missing]).toEqual([]);
  });

  it('leaves English and unknown strings as given', () => {
    expect(modelText('Quota rent', 'en')).toBe('Quota rent');
    expect(modelText('Something new', 'zh')).toBe('Something new');
    expect(modelText('Quota rent', 'zh')).toBe('配額租金');
  });
});
