import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pastedQuestions, pastedRuns } from './pasteRuns';
import { replaceRichTextRangeWithRuns, rt } from '@/model/text';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const textOf = (runs: { text: string }[]) => runs.map((run) => run.text).join('');

describe('pastedRuns: what a paste puts in a text', () => {
  it('keeps bold, italic, underline and sub/superscript from Word or a web page', () => {
    const html =
      '<p class=MsoNormal><span style="font-family:Arial;color:red;font-size:18pt">Price </span>' +
      '<b>rises</b> <i>sharply</i>, <u>not</u> P<sub>1</sub> or Q<sup>2</sup></p>';
    expect(pastedRuns({ html, text: 'Price rises sharply, not P1 or Q2' })).toEqual([
      { text: 'Price ' },
      { text: 'rises', bold: true },
      { text: ' ' },
      { text: 'sharply', italic: true },
      { text: ', ' },
      { text: 'not', underline: true },
      { text: ' P' },
      { text: '1', vertAlign: 'subscript' },
      { text: ' or Q' },
      { text: '2', vertAlign: 'superscript' },
    ]);
  });

  it('drops fonts, sizes, colours and highlight: none of them reaches a run', () => {
    const html =
      '<p><span style="font-family:\'Comic Sans MS\';font-size:20pt;color:#ff0000;background:yellow;mso-highlight:yellow">Demand</span></p>';
    const runs = pastedRuns({ html, text: 'Demand' });
    expect(runs).toEqual([{ text: 'Demand' }]);
  });

  it("keeps Word's tabs, its list numbers, and one line per paragraph", () => {
    const runs = pastedRuns({ html: fixture('11-html-word-msolist.html'), text: 'x' });
    const text = textOf(runs);
    expect(text).toContain('1.\tWhich of the following would cause a movement along the demand curve for taxi rides?');
    expect(text).toContain('\nA.\ta rise in the price of petrol\n');
    // Bold in Word stays bold.
    expect(runs.find((run) => run.text.includes('a rise in taxi fares'))?.bold).toBe(true);
  });

  it('a table row arrives as its cells with a tab between', () => {
    const html = '<table><tr><td>Good</td><td><b>Price</b></td></tr><tr><td>Rice</td><td>$12</td></tr></table>';
    expect(textOf(pastedRuns({ html, text: 'Good\tPrice\nRice\t$12' }))).toBe('Good\tPrice\nRice\t$12');
  });

  it('plain text alone stays plain, with Windows line ends and the last one tidied', () => {
    expect(pastedRuns({ text: 'one\r\ntwo\r\n' })).toEqual([{ text: 'one\ntwo' }]);
    expect(pastedRuns({ text: '' })).toEqual([]);
  });

  it('falls back to the plain text when the HTML carries much less of it', () => {
    expect(pastedRuns({ html: '<p><b>a</b></p>', text: 'a long sentence the HTML lost' })).toEqual([
      { text: 'a long sentence the HTML lost' },
    ]);
  });
});

describe('Merge formatting: the caret gives the rest', () => {
  it('pasted words take the size and colour at the caret, and add their own bold', () => {
    const field = rt('Price is ', { fontSize: 14, color: '0000FF' });
    const next = replaceRichTextRangeWithRuns(field, 9, 9, [{ text: 'very ' }, { text: 'high', bold: true }]);
    expect(next).toEqual([
      { text: 'Price is very ', fontSize: 14, color: '0000FF' },
      { text: 'high', fontSize: 14, color: '0000FF', bold: true },
    ]);
  });

  it('replaces a selection, keeping the text around it', () => {
    const next = replaceRichTextRangeWithRuns(rt('the old word here'), 4, 12, [{ text: 'new', italic: true }]);
    expect(next).toEqual([{ text: 'the ' }, { text: 'new', italic: true }, { text: ' here' }]);
  });
});

describe('pastedQuestions: when to offer "Make these into questions"', () => {
  it('numbered MC questions from Word are offered', () => {
    const batch = pastedQuestions({ text: fixture('01-word-plain-mc.txt') });
    expect(batch?.builds.length).toBeGreaterThanOrEqual(3);
    expect(batch?.builds.every((build) => build.typeId === 'mcq')).toBe(true);
  });

  it("Word's numbered list HTML is offered too", () => {
    expect(pastedQuestions({ html: fixture('11-html-word-msolist.html'), text: '' })?.builds.length).toBeGreaterThan(0);
  });

  it('one structured question with parts is offered', () => {
    const text = '1.\tThe government sets a price ceiling on rice.\n(a)\tExplain why a shortage results. (2 marks)\n(b)\tSuggest one policy. (2 marks)';
    expect(pastedQuestions({ text })?.builds).toHaveLength(1);
  });

  it('ordinary prose, a sentence or an empty paste is not', () => {
    expect(pastedQuestions({ text: 'The price of rice rose in 2024 because of a poor harvest.' })).toBeUndefined();
    expect(pastedQuestions({ text: 'Demand fell.\nSupply rose.\nPrice fell.' })).toBeUndefined();
    expect(pastedQuestions({ text: '' })).toBeUndefined();
  });
});
