import { describe, expect, it } from 'vitest';
import { row } from '@/library/testKit';
import { bankScopes, bankVerbRows, sendsLine } from './bankAiScopes';

describe('the bank ✦ menu', () => {
  const english = row({ rootId: 'e', languages: ['en'], missing: ['zh'], missingTeacher: ['zh'] });
  const both = row({ rootId: 'b', languages: ['en', 'zh'] });
  const answers = row({ rootId: 'a', languages: ['en', 'zh'], missingTeacher: ['zh'] });

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
    expect(bankVerbRows([both], false).map((v) => v.id)).toEqual(['terms']);
  });

  it('says what a fill sends where, in the editor’s words', () => {
    expect(sendsLine(12, 'Google Gemini')).toBe('Sends 12 questions to Google Gemini with your key');
    expect(sendsLine(1, 'DeepSeek')).toBe('Sends 1 question to DeepSeek with your key');
  });
});
