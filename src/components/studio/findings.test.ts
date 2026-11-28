import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveMessages } from '@/i18n/catalogue';
import type { Finding } from '@/questionStudio/types';
import { KNOWN_FINDINGS, findingText } from './findings';
import { STUDIO_FINDING_MESSAGES } from './findings.messages';

const ENGINE = path.resolve(__dirname, '../../questionStudio');
const en = resolveMessages(STUDIO_FINDING_MESSAGES, 'en');
const zh = resolveMessages(STUDIO_FINDING_MESSAGES, 'zh-HK');

/** One of each finding the engine reports, with the values it gives it. */
const SAMPLES: Finding[] = [
  { id: 'shape.stemEmpty', params: { side: 'zh' } },
  { id: 'shape.optionCount', params: { count: 3 } },
  { id: 'shape.optionEmpty', params: { side: 'en' } },
  { id: 'shape.optionsSame', params: { side: 'zh' } },
  { id: 'shape.keyRange' },
  { id: 'shape.statementEmpty', params: { side: 'en' } },
  { id: 'shape.statementCount', params: { count: 5 } },
  { id: 'shape.notCombination', params: { side: 'zh' } },
  { id: 'shape.narrates', params: { side: 'en', words: 'dashed lines' } },
  { id: 'shape.figureFailed' },
  { id: 'shape.figuresSame', params: { a: 'A', b: 'B' } },
  { id: 'shape.figureSet', params: { problem: 'optionsAll' } },
  { id: 'copy.wordsOnly', params: { percent: 63, with: 'paper' } },
  { id: 'key.differs', params: { solver: 'C', key: 'B' } },
  { id: 'key.ambiguous' },
  { id: 'key.edited' },
  { id: 'check.edited' },
  { id: 'topic.off', params: { tests: 'the effect of fiscal policy on output and price', conceptEn: 'the structure of a tax', conceptZh: '稅制結構' } },
  { id: 'topic.notChecked' },
  { id: 'numbers.differ', params: { en: '5 billion', zh: '' } },
  { id: 'terms.note', params: { text: 'Term fixed: deadweight loss → 無謂損失' } },
  { id: 'syllabus.limited', params: { term: 'Giffen goods', code: 'C.individual-demand' } },
  { id: 'lint.keyLongest' },
  { id: 'lint.uneven' },
  { id: 'lint.allNone' },
  { id: 'lint.negativeStem' },
  { id: 'lint.shapeAsked', params: { asked: 'combination', got: 'plain' } },
  { id: 'lint.keySpread', params: { letter: 'B', count: 4, of: 5 } },
  { id: 'copy.close', params: { percent: 41, with: 'bank', verbatim: 0 } },
  { id: 'copy.close', params: { percent: 100, with: 'mine', verbatim: 1 } },
  { id: 'copy.reference', params: { percent: 62 } },
  { id: 'run.fewer', params: { asked: 5, got: 3 } },
  { id: 'run.stopped' },
  { id: 'run.keyNotChecked', params: { message: 'Gemini took too long to answer.' } },
  { id: 'run.referenceShape', params: { pictures: 4, optionPictures: 0, optionTables: 0 } },
  { id: 'run.figureNotRedrawn' },
  { id: 'shape.referenceForm', params: { pictures: 0, optionPictures: 1, optionTables: 0 } },
];

describe('the words for what the checks found', () => {
  it('cover every code the engine reports', () => {
    const emitted = new Set<string>();
    for (const file of readdirSync(ENGINE).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'fixtures.ts')) {
      for (const match of readFileSync(path.join(ENGINE, file), 'utf8').matchAll(/\bid: '([a-z]+\.[a-zA-Z]+)'/g)) emitted.add(match[1]);
    }
    expect([...emitted].filter((id) => !KNOWN_FINDINGS.includes(id)).sort()).toEqual([]);
    expect(KNOWN_FINDINGS.filter((id) => !emitted.has(id)).sort()).toEqual([]);
    expect(new Set(SAMPLES.map((s) => s.id))).toEqual(new Set(KNOWN_FINDINGS));
  });

  it('read as a sentence in both languages, with every value in place', () => {
    for (const finding of SAMPLES) {
      for (const [lang, m] of [['en', en], ['zh', zh]] as const) {
        const text = findingText(finding, m);
        expect(text.length, `${finding.id} ${lang}`).toBeGreaterThan(8);
        expect(text, `${finding.id} ${lang}`).not.toMatch(/undefined|NaN|\[object|\{|\}/);
      }
    }
    expect(findingText({ id: 'key.differs', params: { solver: 'C', key: 'B' } }, en)).toContain('chose C');
    expect(findingText({ id: 'key.differs', params: { solver: 'C', key: 'B' } }, zh)).toContain('選了 C');
    expect(findingText({ id: 'copy.close', params: { percent: 41, with: 'bank', verbatim: 0 } }, en)).toBe(
      'Too close to a past paper question: 41% of its wording is shared. Do not use it as it is: change the wording, or write another.',
    );
    expect(findingText({ id: 'copy.close', params: { percent: 100, with: 'mine', verbatim: 1 } }, zh)).toContain('你的一條題目');
    expect(findingText({ id: 'shape.optionEmpty', params: { side: 'zh' } }, en)).toBe('An option is empty in 中文.');
  });

  it('an unknown code reads as itself, never as nothing', () => {
    expect(findingText({ id: 'future.thing' }, en)).toBe('A check reported “future.thing”.');
  });
});
