import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { UiLanguageOverride } from '@/i18n/language';
import { TOPICS } from '@/model/topics';
import type { LanguageMode } from '@/model/types';
import type { UiLanguage } from '@/settings/language';
import { PastPaperTopicPicker } from '@/components/pastpapers/PastPaperTopicPicker';
import { filterGroups, groupOf, groupTopics, OTHER_PART, partName, partOf } from './groups';
import { parseManifest, type Manifest, type TopicEntry } from './pack';

/**
 * The Past paper bank's topics under their syllabus part (k-0446, user u-7g1b): the parts and
 * their names come from the editor's own syllabus (`model/topics.ts`); the list only says
 * which topic codes each of its topics covers (`syllabus`, the codes its questions carry).
 */

const entry = (id: string, syllabus: string[] | undefined, questions?: number, title = { en: id, zh: id }): TopicEntry => ({
  id,
  file: `topics/${id}.json`,
  title,
  order: 0,
  ...(syllabus ? { syllabus } : {}),
  ...(questions !== undefined ? { questions } : {}),
});

describe('the list names each topic’s topic codes', () => {
  const read = (syllabus: unknown) => {
    const manifest = parseManifest({ topics: [{ id: 'a', file: 'topics/a.json', syllabus }] }) as Manifest;
    return manifest.topics[0].syllabus;
  };

  it('keeps codes in the tag grammar, once each, in the order given', () => {
    expect(read(['C.ped', 'C.pes', 'C.ped'])).toEqual(['C.ped', 'C.pes']);
    expect(read('G')).toEqual(['G']);
    expect(read(['EL1.new', 'K'])).toEqual(['EL1.new', 'K']);
  });

  it('drops anything else, and the field with it when nothing is left', () => {
    expect(read(['Elasticity', 3, null, 'c.ped'])).toBeUndefined();
    expect(read(undefined)).toBeUndefined();
    expect(read({ code: 'C' })).toBeUndefined();
  });
});

describe('topics by syllabus part', () => {
  it('a topic’s part is the coarse topic of its first code this build knows', () => {
    expect(partOf(entry('elasticity', ['C.ped', 'C.pes']))).toBe('C');
    expect(partOf(entry('adas', ['G']))).toBe('G');
    expect(partOf(entry('later', ['K.new', 'H.money']))).toBe('H');
    expect(partOf(entry('unknown-fine', ['B.not-yet-listed']))).toBe('B');
    expect(partOf(entry('none', undefined))).toBeUndefined();
    expect(partOf(entry('only-later', ['K']))).toBeUndefined();
  });

  it('parts in the guide’s order, topics in the list’s, empty parts left out, the rest last', () => {
    const groups = groupTopics([
      entry('circular-flow', ['A.circular-flow'], 7),
      entry('gdp', ['F.national-income'], 50),
      entry('scarcity', ['A.scarcity'], 20),
      entry('mystery', undefined, 3),
      entry('elasticity', ['C.ped', 'C.pes'], 57),
    ])!;
    expect(groups.map((g) => g.code)).toEqual(['A', 'C', 'F', OTHER_PART]);
    expect(groups[0].topics.map((t) => t.id)).toEqual(['circular-flow', 'scarcity']);
    expect(groups.map((g) => g.questions)).toEqual([27, 57, 50, 3]);
    expect(groups[0].part).toBe(TOPICS[0]);
    expect(groups[3].part).toBeUndefined();
  });

  it('a list that names no part is listed flat, as before k-0446', () => {
    expect(groupTopics([entry('a', undefined), entry('b', ['K'])])).toBeUndefined();
    expect(groupTopics([])).toBeUndefined();
  });

  it('a part counts only topics that say how many; none saying, no count', () => {
    expect(groupTopics([entry('a', ['A'], 4), entry('b', ['A'])])![0].questions).toBe(4);
    expect(groupTopics([entry('a', ['A'])])![0].questions).toBeUndefined();
  });

  it('part names are the syllabus’s, in the question language', () => {
    const [c, other] = groupTopics([entry('elasticity', ['C.ped']), entry('x', undefined)])!;
    expect(partName(c, 'en', 'Other topics')).toBe('Market and Price');
    expect(partName(c, 'zh', '其他課題')).toBe('市場與價格');
    expect(partName(other, 'zh', '其他課題')).toBe('其他課題');
  });

  it('finds the group of a topic', () => {
    const groups = groupTopics([entry('gdp', ['F.national-income']), entry('scarcity', ['A.scarcity'])]);
    expect(groupOf(groups, 'gdp')?.code).toBe('F');
    expect(groupOf(groups, 'nope')).toBeUndefined();
    expect(groupOf(undefined, 'gdp')).toBeUndefined();
  });
});

describe('the topic filter works across parts', () => {
  const groups = groupTopics([
    entry('elasticity', ['C.ped'], 57, { en: 'Elasticity', zh: '彈性' }),
    entry('price-floor', ['C.intervention'], 11, { en: 'Price Floor', zh: '價格下限' }),
    entry('m1-m2-m3', ['H.money-supply'], 37, { en: 'M1/M2/M3', zh: '貨幣供應量(M1/M2/M3)' }),
    entry('function-of-price', ['C.price-functions'], 3, { en: 'Function of Price', zh: '價格的功能' }),
    entry('function-of-money', ['H.money'], 18, { en: 'Function of Money', zh: '貨幣功能' }),
  ])!;
  const ids = (words: string) => filterGroups(groups, words).flatMap((g) => g.topics.map((t) => `${g.code}:${t.id}`));

  it('matches names in either language and ids, keeping each hit under its part', () => {
    expect(ids('function')).toEqual(['C:function-of-price', 'H:function-of-money']);
    expect(ids('下限')).toEqual(['C:price-floor']);
    expect(ids('功能')).toEqual(['C:function-of-price', 'H:function-of-money']);
    expect(ids('M2')).toEqual(['H:m1-m2-m3']);
    expect(filterGroups(groups, 'function').map((g) => g.questions)).toEqual([3, 18]);
    expect(filterGroups(groups, 'money and banking')[0].questions).toBe(55);
  });

  it('a part’s own name keeps all its topics; no words keep everything', () => {
    expect(ids('money and banking')).toEqual(['H:m1-m2-m3', 'H:function-of-money']);
    expect(ids('貨幣與銀行')).toEqual(['H:m1-m2-m3', 'H:function-of-money']);
    expect(ids('  ')).toHaveLength(5);
    expect(ids('nothing like this')).toEqual([]);
  });
});

describe('the picker', () => {
  const topics = [
    entry('scarcity', ['A.scarcity'], 20, { en: 'Scarcity', zh: '稀少性' }),
    entry('elasticity', ['C.ped', 'C.pes'], 57, { en: 'Elasticity', zh: '彈性' }),
    entry('price-floor', ['C.intervention'], 11, { en: 'Price Floor', zh: '價格下限' }),
    entry('gdp', ['F.national-income'], 50, { en: 'GDP', zh: '本地生產總值' }),
  ];
  const render = (ui: UiLanguage, language: LanguageMode, current = topics[1], list = topics) =>
    renderToStaticMarkup(
      createElement(
        UiLanguageOverride.Provider,
        { value: ui },
        createElement(PastPaperTopicPicker, { topics: list, current, active: true, language, onPick: () => {} }),
      ),
    );

  it('groups under the parts, only the open topic’s part open, counts per part and topic', () => {
    const html = render('en', 'en');
    expect(html).toContain('Basic Economic Concepts');
    expect(html).toContain('Market and Price');
    expect(html).toContain('Measurement of Economic Performance');
    expect(html).toContain('>68<'); // C: 57 + 11
    expect(html).toContain('data-pastpaper-topic="elasticity"');
    expect(html).toContain('data-pastpaper-topic="price-floor"');
    expect(html).not.toContain('data-pastpaper-topic="scarcity"');
    expect(html).not.toContain('data-pastpaper-topic="gdp"');
    expect((html.match(/aria-expanded="true"/g) ?? []).length).toBe(1);
  });

  it('names follow the question language; the chrome the interface language', () => {
    const html = render('en', 'zh');
    expect(html).toContain('市場與價格');
    expect(html).toContain('價格下限');
    expect(html).not.toContain('Market and Price');
    expect(html).toContain('Find a topic');
    const zhUi = render('zh-HK', 'en');
    expect(zhUi).toContain('Market and Price');
    expect(zhUi).toContain('搜尋課題');
  });

  it('a list without parts lists every topic flat', () => {
    const flat = topics.map((t) => ({ ...t, syllabus: undefined }));
    const html = render('en', 'en', flat[0], flat);
    for (const t of flat) expect(html).toContain(`data-pastpaper-topic="${t.id}"`);
    expect(html).not.toContain('data-pastpaper-part');
  });
});
