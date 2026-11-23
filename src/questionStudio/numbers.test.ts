import { describe, expect, it } from 'vitest';
import { checkNumbers, chineseQuantities, englishQuantities } from './numbers';

const pair = (en: string, zh: string) => ({ en, zh });

describe('quantities', () => {
  it('reads units: 5 billion is 5e9, 50億 is 5e9, 5億 is 5e8', () => {
    expect(englishQuantities('HK$5 billion')[0].value).toBe(5e9);
    expect(chineseQuantities('50億元')[0].value).toBe(5e9);
    expect(chineseQuantities('5億元')[0].value).toBe(5e8);
  });
  it('reads 1.5 million as 150萬 and 百分之 as a percent', () => {
    expect(englishQuantities('1.5 million')[0].value).toBe(1.5e6);
    expect(chineseQuantities('150萬')[0].value).toBe(1.5e6);
    expect(chineseQuantities('百分之二十五 and 百分之25')[0]).toMatchObject({ value: 25, percent: true });
  });
  it('drops thousands separators and bare single digits', () => {
    expect(englishQuantities('1,200 and 7')).toHaveLength(1);
    expect(englishQuantities('1,200')[0].value).toBe(1200);
  });
});

describe('checkNumbers', () => {
  it('agrees when every number matches, units read out', () => {
    expect(checkNumbers([pair('Prices rose 20% from $12 to $15; revenue was HK$2 million.', '價格上升 20%，由 $12 升至 $15；收入為港幣 200萬元。')])).toBeNull();
  });
  it('catches the tenfold slip: 5 billion written as 5億', () => {
    const r = checkNumbers([pair('Exports were HK$5 billion.', '出口總值為港幣 5億元。')]);
    expect(r?.enOnly).toEqual(['5 billion']);
    expect(r?.zhOnly).toEqual(['5億']);
  });
  it('catches a number only one side has, and a changed number', () => {
    expect(checkNumbers([pair('It fell by 15%.', '下跌 12%。')])).toMatchObject({ enOnly: ['15%'], zhOnly: ['12%'] });
    expect(checkNumbers([pair('A 30% tax on 400 units.', '對 400 單位徵收稅項。')])?.enOnly).toEqual(['30%']);
  });
  it('compares field by field and skips a field with one side empty', () => {
    expect(checkNumbers([pair('Only English 45', ''), pair('', '只有中文 45')])).toBeNull();
    expect(checkNumbers([pair('Option 12', '選項 12'), pair('Option 30', '選項 13')])).not.toBeNull();
  });
  it('ignores statement labels and bold marks', () => {
    expect(checkNumbers([pair('**NOT** (1) and (2) only', '**並非** 只有(1)及(2)')])).toBeNull();
  });
  it('compares decimals as numbers: 2.50 equals 2.5', () => {
    expect(checkNumbers([pair('The ratio is 2.50.', '比率為 2.5。')])).toBeNull();
  });
});
