import { describe, expect, it } from 'vitest';
import type { BiText } from '@/model/types';
import { plain } from '@/model/text';
import { DIAGRAM_TEMPLATES } from '@/model/diagramTemplates';
import { AXIS } from '@/model/diagramTemplateKit';
import { AREA_PRESETS, REVENUE_PRESETS } from '@/model/diagramAreas';
import { SHADE_PRESETS } from '@/model/diagramPresets';
import { createWorksheetFrom, type DocumentType } from '@/model/newWorksheet';
import raw from './data/edb-economics-2020.json';
import { createGlossary } from './glossary';
import type { RawGlossary } from './parse';

// The app's own seeded Chinese follows the EDB glossary: no warning on any template,
// preset or sample, and rank 1 everywhere except the documented exceptions below.
const glossary = createGlossary(raw as RawGlossary);

/** Rank-2 forms the seeds keep on purpose (§H.3): the gap short forms 通脹缺口 / 通縮缺口. */
const NOT_PREFERRED_ALLOWED = new Set(['inflationary gap', 'deflationary gap']);

function biTexts(value: unknown, out: Array<{ where: string; text: BiText }>, where: string): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((v, i) => biTexts(v, out, `${where}[${i}]`));
    return;
  }
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.en) && Array.isArray(record.zh)) {
    out.push({ where, text: record as unknown as BiText });
    return;
  }
  for (const [key, v] of Object.entries(record)) biTexts(v, out, `${where}.${key}`);
}

function seeded(): Array<{ where: string; text: BiText }> {
  const out: Array<{ where: string; text: BiText }> = [];
  for (const t of DIAGRAM_TEMPLATES) {
    biTexts({ name: t.name, hint: t.hint }, out, `template ${t.id}`);
    biTexts(t.build(), out, `template ${t.id}.build()`);
  }
  biTexts(AXIS, out, 'AXIS');
  biTexts(AREA_PRESETS, out, 'AREA_PRESETS');
  biTexts(REVENUE_PRESETS, out, 'REVENUE_PRESETS');
  biTexts(SHADE_PRESETS, out, 'SHADE_PRESETS');
  const types: DocumentType[] = ['classroom', 'paper1', 'lqWorksheet', 'lqMock'];
  for (const documentType of types) {
    biTexts(createWorksheetFrom({ documentType, seedSample: true }), out, `newWorksheet ${documentType}`);
  }
  return out;
}

describe('seeded Chinese follows the EDB glossary', () => {
  const texts = seeded();
  const findings = texts.flatMap(({ where, text }) =>
    glossary
      .checkEnToZh(plain(text.en), plain(text.zh))
      .map((c) => ({ where, en: plain(text.en), zh: plain(text.zh), term: c.en, state: c.state, severity: c.severity })),
  );

  it('scans a real number of bilingual strings', () => {
    expect(texts.length).toBeGreaterThan(300);
    expect(findings.length).toBeGreaterThan(100);
  });

  it('raises no warning', () => {
    expect(findings.filter((f) => f.severity === 'warn')).toEqual([]);
  });

  it('uses the preferred rendering outside the documented exceptions', () => {
    const notPreferred = findings.filter((f) => f.state === 'not-preferred' && !NOT_PREFERRED_ALLOWED.has(f.term));
    expect(notPreferred).toEqual([]);
  });
});
