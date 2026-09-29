import { describe, expect, it, vi } from 'vitest';
import { patternOptions, stepActive, type PatternOption } from './patternOptions';
import { commitPatternOption } from './PatternPicker';

const NAMES = ['Calculate PED from a change in TR', 'Identify elastic or inelastic', 'Graph'];
const label = (option: PatternOption) => (option.kind === 'clear' ? 'No 題型' : option.kind === 'new' ? `New:${option.name}` : option.name);

describe('the 題型 picker list', () => {
  it('highlights an existing match before New, so Enter on a partly typed name picks it', () => {
    const { options, active } = patternOptions(NAMES, 'calc');
    expect(options.map(label)).toEqual(['Calculate PED from a change in TR', 'New:calc']);
    expect(active).toBe(0);
  });

  it('puts a prefix before a part, keeping list order within each', () => {
    const { options, active } = patternOptions(['Explain elastic demand', 'Elastic or not', 'Inelastic cases'], 'elastic');
    expect(options.map(label)).toEqual(['Elastic or not', 'Explain elastic demand', 'Inelastic cases', 'New:elastic']);
    expect(active).toBe(0);
  });

  it('resolves a name that differs only by case, spacing or punctuation: no New row', () => {
    const { options, active } = patternOptions(NAMES, 'identify elastic, or inelastic');
    expect(options.map(label)).toEqual(['Identify elastic or inelastic']);
    expect(active).toBe(0);
  });

  it('starts on New when nothing matches, and warns when a name is close', () => {
    const plain = patternOptions(NAMES, 'Explain factors');
    expect(plain.options.map(label)).toEqual(['New:Explain factors']);
    expect(plain.active).toBe(0);

    const close = patternOptions(NAMES, 'Graphs of PED');
    expect(close.options.map(label)).toEqual(['Graph', 'New:Graphs of PED']);
    expect(close.active).toBe(1);
    expect(close.options[1]).toMatchObject({ kind: 'new', close: ['Graph'] });
  });

  it('with nothing typed lists every name, highlights the current one, and offers No 題型 in bulk', () => {
    expect(patternOptions(NAMES, '  ').active).toBe(-1);
    expect(patternOptions(NAMES, '', { value: 'graph' }).active).toBe(2);
    const bulk = patternOptions(NAMES, '', { clearable: true, value: null });
    expect(bulk.options.map(label)).toEqual(['No 題型', ...NAMES]);
    expect(bulk.active).toBe(0);
  });

  it('moves the highlight with the arrows, wrapping', () => {
    expect(stepActive(-1, 1, 3)).toBe(0);
    expect(stepActive(-1, -1, 3)).toBe(2);
    expect(stepActive(2, 1, 3)).toBe(0);
    expect(stepActive(0, -1, 3)).toBe(2);
    expect(stepActive(0, 1, 0)).toBe(-1);
  });
});

describe('picking in the 題型 picker', () => {
  it('registers a new name at once, before any dialog saves or is cancelled', () => {
    const register = vi.fn(() => Promise.resolve({ patterns: [] }));
    expect(commitPatternOption({ kind: 'new', name: 'Explain factors', close: [] }, 'C.ped', 'mcq', register)).toEqual([
      'Explain factors',
      true,
    ]);
    expect(register).toHaveBeenCalledWith([{ topic: 'C.ped', typeId: 'mcq', name: 'Explain factors' }]);
  });

  it('registers nothing for an existing name or No 題型', () => {
    const register = vi.fn(() => Promise.resolve({ patterns: [] }));
    expect(commitPatternOption({ kind: 'name', name: 'Graph' }, 'C.ped', 'mcq', register)).toEqual(['Graph', false]);
    expect(commitPatternOption({ kind: 'clear' }, 'C.ped', undefined, register)).toEqual([null, false]);
    expect(register).not.toHaveBeenCalled();
  });
});
