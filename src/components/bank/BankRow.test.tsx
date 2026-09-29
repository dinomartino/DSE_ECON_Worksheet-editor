import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { row } from '@/library/testKit';
import { createMcqQuestion, createStructuredQuestion } from '@/model/factories';
import { BankRow, missingLanguageLabel, typeLabel, usedLabel, type BankRowProps } from './BankRow';

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
  it('shows the excerpt, the quiet meta line and the action', () => {
    const out = html({ row: base, action: createElement('button', null, 'Insert') });
    expect(out).toContain('Along a straight-line demand curve…');
    expect(out).toContain('MCQ');
    expect(out).toContain('1 mark<');
    expect(out).toContain('C.ped · C.equilibrium');
    expect(out).toContain('Mock 2025 · Q14');
    expect(out).toContain('>Insert</button>');
    expect(out).not.toContain('text-warn-ink');
  });

  it('reads the paper’s language', () => {
    expect(html({ row: base, language: 'zh' })).toContain('沿直線需求曲線…');
  });

  it('dims a question already in the paper and replaces the action', () => {
    const out = html({ row: base, inPaper: { number: 3 }, action: createElement('button', null, 'Insert') });
    expect(out).toContain('In this paper · Q3');
    expect(out).toContain('opacity-55');
    expect(out).not.toContain('>Insert<');
  });

  it('warns in amber when used with the class, and offers versions', () => {
    const use = { docId: 'd', docTitle: '5A Mock', classTag: '5A', docUpdatedAt: '2026-03-10T00:00:00.000Z' };
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
    expect(usedLabel({ docId: 'd', docTitle: 'x', docUpdatedAt: 'nonsense' })).toBe('Used with this class');
  });
});
