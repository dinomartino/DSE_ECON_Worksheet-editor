import { describe, expect, it } from 'vitest';
import { termNotes } from '@/assist/termRules';
import type { RichText } from '@/model/types';
import type { TermRow } from '@/translate/types';
import raw from './data/edb-economics-2020.json';
import { DENY } from './deny';
import { createGlossary } from './glossary';
import type { RawGlossary } from './parse';
import type { Glossary, TermPreferences } from './types';

const data = raw as RawGlossary;
const GDP = 'Gross Domestic Product (GDP)';
const REAL_GDP = 'real Gross Domestic Product (GDP)';
const glossary = (prefs: Partial<TermPreferences>) => createGlossary(data, DENY, { choices: {}, related: {}, ...prefs });
const entry = (g: Glossary, key: string) => g.entries.find((e) => e.en === key)!;
const runs = (text: string) => [{ text }] as RichText;

describe('the teacher’s own wording for an EDB term', () => {
  const g = glossary({ own: { [GDP]: ['港產總值'] }, choices: { [GDP]: '港產總值' } });

  it('can be the chosen one: preferred, pinned, checked ok', () => {
    expect(entry(g, GDP)).toMatchObject({ preferred: '港產總值', own: ['港產總值'] });
    expect(g.pin(['GDP rose.'], 'toZh').map((p) => p.line)).toEqual(['GDP → 港產總值']);
    expect(g.checkEnToZh('Gross Domestic Product rose.', '港產總值上升。')[0]).toMatchObject({ state: 'ok', expected: '港產總值', chosen: true });
    // The EDB wordings still pass, as not preferred, with the fix to the teacher's.
    expect(g.checkEnToZh('Gross Domestic Product rose.', '本地生產總值上升。')[0]).toMatchObject({
      state: 'not-preferred',
      fix: { to: '港產總值', kind: 'lowerRank' },
    });
  });

  it('is matched Chinese → English like a listed rendering', () => {
    expect(g.matchZh('港產總值上升').map((h) => h.entryIds)).toEqual([[entry(g, GDP).id]]);
    expect(g.pin(['港產總值上升'], 'toEn')[0].line).toBe(`港產總值 → ${GDP}`);
  });

  it('moves autoFix and follows into related terms, derived and marked', () => {
    const r = glossary({ own: { [GDP]: ['港產總值'] }, choices: { [GDP]: '港產總值' }, related: { [GDP]: true } });
    expect(entry(r, REAL_GDP).choice).toMatchObject({ displays: ['實質港產總值'], derived: ['實質港產總值'], follows: GDP });
    expect(r.autoFix('real GDP', runs('實際本地生產總值')).fixes[0].to).toBe('實質港產總值');
  });

  it('when not chosen, passes as not preferred; on a one-rendering term it becomes choosable', () => {
    const unchosen = glossary({ own: { capital: ['本錢'] } });
    expect(unchosen.checkEnToZh('capital', '本錢')[0]).toMatchObject({ state: 'not-preferred', fix: { to: '資本' } });
    const row = unchosen.terms.find((t) => t.en === 'capital')!;
    expect(row.groups[0].options.map((o) => [o.display, !!o.own])).toEqual([
      ['資本', false],
      ['本錢', true],
    ]);
    expect(glossary({ own: { capital: ['本錢'] }, choices: { capital: '本錢' } }).checkEnToZh('capital', '本錢')[0].state).toBe('ok');
  });

  it('drops an own wording equal to a listed one, on an unknown key, or malformed; deleting the chosen one returns the default', () => {
    const odd = glossary({ own: { [GDP]: ['本地生產總值', '', 42, 'a/b', '港產總值'], 'no such term': ['甲'], capital: 'x' } as never });
    expect(odd.preferences.own).toEqual({ [GDP]: ['港產總值'] });
    const deleted = glossary({ own: {}, choices: { [GDP]: '港產總值' } });
    expect(deleted.preferences.choices).toEqual({});
    expect(entry(deleted, GDP).preferred).toBe('本地生產總值');
  });
});

describe('a term the EDB glossary does not have', () => {
  const g = glossary({
    terms: {
      t1: { en: 'carbon tax', zh: ['碳稅', '碳排放稅'] },
      t2: { en: 'Environmental, Social and Governance', abbreviation: 'ESG', zh: ['環境、社會及管治'] },
    },
  });
  const carbon = () => entry(g, 'carbon tax');

  it('is an entry after the EDB ones, marked as the teacher’s', () => {
    expect(carbon()).toMatchObject({ id: 1350, preferred: '碳稅', custom: { id: 't1' }, raw: '' });
    expect(g.terms.at(-2)).toMatchObject({ en: 'carbon tax', custom: { id: 't1' } });
    expect(g.entries.slice(0, 1350).every((e) => !e.custom)).toBe(true);
  });

  it('works English → Chinese: pinned, checked, its other renderings not preferred', () => {
    expect(g.pin(['A carbon tax raises costs.'], 'toZh').map((p) => p.line)).toContain('carbon tax → 碳稅');
    const [ok] = g.checkEnToZh('A carbon tax raises costs.', '碳稅提高成本。');
    expect(ok).toMatchObject({ state: 'ok', custom: true, en: 'carbon tax' });
    expect(g.checkEnToZh('carbon taxes', '碳排放稅')[0]).toMatchObject({ state: 'not-preferred', fix: { to: '碳稅' } });
    const missing = g.checkEnToZh('carbon tax', '甚麼都沒有')[0];
    expect(missing.state).toBe('missing');
    // Check terms labels it the teacher's, never EDB's.
    expect(termNotes({ path: 'p', zh: runs('甚麼都沒有') } as unknown as TermRow, missing)).toEqual(['carbon tax (yours: 碳稅)']);
  });

  it('works Chinese → English, and its abbreviation matches case-sensitively, plural too', () => {
    expect(g.pin(['碳稅提高成本'], 'toEn')[0].line).toBe('碳稅 → carbon tax');
    expect(g.checkZhToEn('碳稅提高成本', 'A carbon tax raises costs.')[0]).toMatchObject({ state: 'ok', en: 'carbon tax' });
    const esg = entry(g, 'Environmental, Social and Governance').id;
    expect(g.matchEn('ESG funds').map((h) => [h.entryId, h.viaAbbreviation])).toEqual([[esg, true]]);
    expect(g.matchEn('two ESGs').map((h) => h.entryId)).toEqual([esg]);
    expect(g.matchEn('esg funds')).toEqual([]);
    expect(g.checkEnToZh('ESG matters.', 'ESG 很重要。')[0].state).toBe('ok-abbr');
  });

  it('beats an EDB term inside it: longest match wins both ways', () => {
    const d = glossary({ terms: { t: { en: 'digital GDP', zh: ['數碼本地生產總值'] } } });
    const digital = entry(d, 'digital GDP').id;
    expect(d.matchEn('Digital GDP grew.').map((h) => h.entryId)).toEqual([digital]);
    expect(d.matchEnAll('Digital GDP grew.').map((h) => h.entryId).sort()).toEqual([entry(d, GDP).id, digital].sort());
    // One result, for the outer term; the EDB rendering inside it is not a conflict.
    expect(d.checkEnToZh('Digital GDP grew.', '數碼本地生產總值上升。').map((c) => [c.en, c.state])).toEqual([['digital GDP', 'ok']]);
    expect(d.matchZh('數碼本地生產總值').map((h) => h.entryIds)).toEqual([[digital]]);
    // Plain GDP still finds the EDB term.
    expect(d.checkEnToZh('GDP grew.', '本地生產總值上升。')[0]).toMatchObject({ en: GDP, state: 'ok' });
  });

  it('is refused when it names an EDB term, or repeats an earlier term; a bad row goes alone', () => {
    const r = glossary({
      terms: {
        a: { en: 'Gross Domestic Products', zh: ['甲'] },
        b: { en: 'green bond', zh: ['綠色債券'] },
        c: { en: 'Green Bond', zh: ['綠債'] },
        d: { en: 'carbon credit', abbreviation: 'GDP', zh: ['碳信用'] },
        e: { en: 'no chinese', zh: [] },
        f: 'garbage',
        g: { en: 'blue economy', zh: ['藍色經濟'] },
      },
    } as never);
    expect(Object.keys(r.preferences.terms ?? {})).toEqual(['b', 'g']);
    expect(r.edbKeyFor('gross domestic product')).toBe(GDP);
    expect(r.edbKeyFor('carbon tax')).toBeUndefined();
  });
});
