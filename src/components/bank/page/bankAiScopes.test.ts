import { describe, expect, it } from 'vitest';
import { row } from '@/library/testKit';
import { bankScopes, bankVerbRows, sendsLine } from './bankAiScopes';

describe('the bank ✦ menu', () => {
  const english = row({ rootId: 'e', languages: ['en'], missing: ['zh'], missingTeacher: ['zh'], tags: ['C.ped'] });
  const both = row({ rootId: 'b', languages: ['en', 'zh'], tags: ['C'] });
  const answers = row({ rootId: 'a', languages: ['en', 'zh'], missingTeacher: ['zh'], tags: ['J.trade'] });
  const untagged = row({ rootId: 'u', languages: ['en', 'zh'], tags: ['S5'] });

  it('offers only scopes holding something, the question on screen first', () => {
    expect(bankScopes(english, [], [english]).map((s) => s.label)).toEqual(['This question']);
    expect(bankScopes(english, [both, answers], [english, both, answers]).map((s) => s.label)).toEqual([
      'This question',
      'Your list · 2',
      'All 3 shown',
    ]);
  });

  it('counts questions per verb; a verb with none is not offered', () => {
    const rows = [english, both, answers];
    const counts = (teacher: boolean) => Object.fromEntries(bankVerbRows(rows, teacher).map((v) => [v.id, v.rows.length]));
    expect(counts(false)).toEqual({ 'fill.zh': 1, terms: 2 });
    // Teacher text counts: the question whose answers lack 中文 joins the fill.
    expect(counts(true)).toEqual({ 'fill.zh': 2, terms: 2 });
    // One question with topics also offers Suggest topics again (below).
    expect(bankVerbRows([both], false).map((v) => v.id)).toEqual(['terms', 'tag.again']);
  });

  it('Tag topics (k-0560): the untagged among them, the tagged counted as left alone', () => {
    const [tag] = bankVerbRows([english, untagged], false, 'en', ['tag', 'tag.again']);
    expect(tag).toMatchObject({ id: 'tag', needsKey: true });
    expect(tag.rows.map((r) => r.rootId)).toEqual(['u']);
    expect(tag.note).toContain('1 already tagged is left as it is.');
    expect(tag.estimate?.feature).toBe('tag');
  });

  it('one tagged question: Suggest topics again (the teacher asking); several tagged: nothing', () => {
    expect(bankVerbRows([english], false, 'en', ['tag', 'tag.again']).map((v) => v.id)).toEqual(['tag.again']);
    expect(bankVerbRows([english, both], false, 'en', ['tag', 'tag.again'])).toEqual([]);
  });

  it('the "All untagged" scope, last, only when some are', () => {
    expect(bankScopes(english, [], [english, both], 'en', [untagged]).map((s) => s.label)).toEqual(['This question', 'All 2 shown', 'All untagged · 1']);
    expect(bankScopes(english, [], [english], 'en', []).map((s) => s.key)).toEqual(['question']);
  });

  it('says what a fill sends where, in the editor’s words', () => {
    expect(sendsLine(12, 'Google Gemini')).toBe('Sends 12 questions to Google Gemini with your key');
    expect(sendsLine(1, 'DeepSeek')).toBe('Sends 1 question to DeepSeek with your key');
  });
});
