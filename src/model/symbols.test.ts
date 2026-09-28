import { describe, expect, it } from 'vitest';
import { isSymbolOnly } from './symbols';
import { rt } from './text';
import type { RichText } from './types';

describe('isSymbolOnly', () => {
  const symbols: Array<[string, RichText]> = [
    ['E₀', rt('E₀')],
    ['a vertAlign S₁', [{ text: 'S' }, { text: '1', vertAlign: 'subscript' }]],
    ['AD', rt('AD')],
    ['D₀ → D₁', rt('D₀ → D₁')],
    ['$14 000', rt('$14 000')],
    ['2025-26', rt('2025-26')],
    ['(%)', rt('(%)')],
    ['MC = MR', rt('MC = MR')],
    ['P*', rt('P*')],
    ['Qd', rt('Qd')],
    ['SRAS', rt('SRAS')],
    ['ΔQ', rt('ΔQ')],
    ['HK$500', rt('HK$500')],
    ['AS', rt('AS')],
    ['A', rt('A')],
    ['Pw', rt('Pw')],
  ];
  it.each(symbols)('%s is symbol-only', (_, runs) => {
    expect(isSymbolOnly(runs)).toBe(true);
  });

  const words: Array<[string, RichText]> = [
    ['Tax', rt('Tax')],
    ['Price ($)', rt('Price ($)')],
    ['Good X', rt('Good X')],
    ['Qty', rt('Qty')],
    ['價格', rt('價格')],
    ['S₁ 供應', rt('S₁ 供應')],
    ['END OF PAPER', rt('END OF PAPER')],
    ['PAPER 2', rt('PAPER 2')],
    ['ECON', rt('ECON')],
    ['TOTAL', rt('TOTAL')],
    ['ONE', rt('ONE')],
    ['No', rt('No')],
    ['OR', rt('OR')],
    ['or', rt('or')],
    ['e.g.', rt('e.g.')],
    ['blank', []],
    ['whitespace', rt('  \n')],
  ];
  it.each(words)('%s is not', (_, runs) => {
    expect(isSymbolOnly(runs)).toBe(false);
  });
});
