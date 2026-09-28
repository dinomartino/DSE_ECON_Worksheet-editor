import { describe, expect, it } from 'vitest';
import { baseUrl, bool, oneOf, recordOf, text, trueFlag } from './validators';

describe('settings validators', () => {
  it('bool takes booleans only', () => {
    expect(bool(true)).toBe(true);
    expect(bool(false)).toBe(false);
    expect(bool('true')).toBeUndefined();
    expect(bool(1)).toBeUndefined();
  });

  it('oneOf takes listed strings only', () => {
    const pick = oneOf(['a', 'b'] as const);
    expect(pick('a')).toBe('a');
    expect(pick('c')).toBeUndefined();
    expect(pick(undefined)).toBeUndefined();
  });

  it('text checks type, length and pattern', () => {
    const model = text(8, /^[a-z-]+$/);
    expect(model('flash')).toBe('flash');
    expect(model('toolongvalue')).toBeUndefined();
    expect(model('Bad!')).toBeUndefined();
    expect(model(3)).toBeUndefined();
    expect(text(3)('')).toBe('');
  });

  it('baseUrl allows https anywhere and http on localhost only', () => {
    expect(baseUrl('https://api.example.com/v1')).toBe('https://api.example.com/v1');
    expect(baseUrl('http://localhost:11434/v1')).toBe('http://localhost:11434/v1');
    expect(baseUrl('http://127.0.0.1:8080')).toBe('http://127.0.0.1:8080');
    expect(baseUrl('http://[::1]:8080/v1')).toBe('http://[::1]:8080/v1');
    expect(baseUrl('http://api.example.com/v1')).toBeUndefined();
    expect(baseUrl('ftp://localhost')).toBeUndefined();
    expect(baseUrl('javascript:alert(1)')).toBeUndefined();
    expect(baseUrl('not a url')).toBeUndefined();
    expect(baseUrl(42)).toBeUndefined();
  });

  it('baseUrl refuses credentials in the URL', () => {
    expect(baseUrl('https://user:pass@api.example.com')).toBeUndefined();
    expect(baseUrl('https://user@api.example.com')).toBeUndefined();
  });

  it('recordOf keeps valid entries and drops the rest', () => {
    const models = recordOf(['gemini', 'qwen'] as const, text(20));
    expect(models({ gemini: 'x', qwen: 5, other: 'y' })).toEqual({ gemini: 'x' });
    expect(models({})).toEqual({});
    expect(models(null)).toBeUndefined();
    expect(models([])).toBeUndefined();
    expect(models('x')).toBeUndefined();
  });

  it('trueFlag takes true only', () => {
    expect(trueFlag(true)).toBe(true);
    expect(trueFlag(false)).toBeUndefined();
    expect(trueFlag('true')).toBeUndefined();
  });
});
