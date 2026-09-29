import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { row } from '@/library/testKit';
import { createMcqQuestion, createStructuredQuestion } from '@/model/factories';
import { BankRow, missingLanguageLabel, typeLabel, sittingLabel, usedLabel, type BankRowProps } from './BankRow';

const html = (props: BankRowProps) => renderToStaticMarkup(createElement(BankRow, props));
const choice = createMcqQuestion().type;
const base = row({
  typeId: choice,
  marks: 1,
  tags: ['C.ped', 'C.equilibrium'],
  docTitle: 'Mock 2025',
  number: 14,
  excerpt: { en: 'Along a straight-line demand curve…', zh: '沿直線需求曲線…' },
  languages: ['en', 'zh'],
});

describe('BankRow', () => {
  it('shows the excerpt and the quiet meta line, with no button of its own', () => {
    const out = html({ row: base });
    expect(out).toContain('Along a straight-line demand curve…');
    expect(out).toContain('MCQ');
    expect(out).toContain('1 mark<');
    expect(out).toContain('C.ped · C.equilibrium');
    expect(out).toContain('Mock 2025 · Q14');
    expect(out).not.toContain('<button');
    expect(out).not.toContain('text-warn-ink');
  });

  it('takes focus and Enter only with a keyboard path, and says what it does', () => {
    expect(html({ row: base })).not.toContain('tabindex');
    const out = html({ row: base, onActivate: () => {}, activateHint: 'Drag onto the page, or press Enter to insert after Q3' });
    expect(out).toContain('tabindex="0"');
    expect(out).toContain('role="group"');
    expect(out).toContain('aria-label="Along a straight-line demand curve…"');
    expect(out).toContain('aria-description="Drag onto the page, or press Enter to insert after Q3"');
  });

  it('runs the keyboard path on Enter or Space on the row itself, not on a control inside it', () => {
    let runs = 0;
    const root = BankRow({ row: base, onActivate: () => (runs += 1) }) as { props: { onKeyDown: (event: unknown) => void } };
    const self = {};
    let prevented = 0;
    const press = (key: string, target: object = self) =>
      root.props.onKeyDown({ key, target, currentTarget: self, preventDefault: () => (prevented += 1) });
    press('Enter');
    press(' ');
    press('a');
    press('Enter', {});
    expect(runs).toBe(2);
    expect(prevented).toBe(2);
  });

  it('reads the paper’s language', () => {
    expect(html({ row: base, language: 'zh' })).toContain('沿直線需求曲線…');
  });

  it('dims a question already in the paper and says where it is', () => {
    const out = html({ row: base, inPaper: { number: 3 } });
    expect(out).toContain('In this paper · Q3');
    expect(out).toContain('opacity-55');
    expect(out).not.toContain('cursor-grab');
  });

  it('warns in amber when used with the class, and offers versions', () => {
    const use = { docId: 'd', docTitle: '5A Mock', classes: ['5A'], usedOn: '2026-03-10' };
    const out = html({ row: base, usedWithClass: use, versions: 3, onVersions: () => {} });
    expect(out).toContain('text-warn-ink');
    expect(out).toContain('Used with 5A · Mar 2026');
    expect(out).toContain('3 versions</button>');
  });

  it('marks the selected row with the accent bar', () => {
    expect(html({ row: base, selected: true })).toContain('scale-y-100 opacity-100');
    expect(html({ row: base })).toContain('scale-y-50 opacity-0');
  });

  it('names a missing language only when the paper prints it', () => {
    const zhOnly = { languages: ['zh' as const] };
    expect(missingLanguageLabel(zhOnly, 'en')).toBe('中文 only');
    expect(missingLanguageLabel(zhOnly, 'bilingual')).toBe('中文 only');
    expect(missingLanguageLabel(zhOnly, 'zh')).toBeUndefined();
    expect(missingLanguageLabel({ languages: ['en'] }, 'zh')).toBe('English only');
    expect(missingLanguageLabel({ languages: [] }, 'zh')).toBeUndefined();
    expect(html({ row: { ...base, languages: ['zh'] } })).toContain('中文 only');
  });

  it('labels types from the registry and an unknown one by its id', () => {
    expect(typeLabel(choice)).toBe('MCQ');
    expect(typeLabel(createStructuredQuestion().type)).toBe('LQ');
    expect(typeLabel('from-a-newer-build')).toBe('From-a-newer-build');
    expect(usedLabel({ docId: 'd', docTitle: 'x', usedOn: 'nonsense' })).toBe('Used with this class');
    expect(usedLabel({ docId: 'd', docTitle: 'x', classes: ['5A', '5B'], usedOn: '2025-11-03' })).toBe('Used with 5A, 5B · Nov 2025');
    expect(sittingLabel({ docId: 'd', docTitle: 'x', classes: ['5A'], usedOn: '2025-11-03' })).toBe('5A · Nov 2025');
    expect(sittingLabel({ docId: 'd', docTitle: 'x', usedOn: '2025-11-03T09:00:00.000Z' })).toBe('No class · Nov 2025');
  });
});
