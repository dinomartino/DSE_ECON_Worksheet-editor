import type { KeyboardEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { escapeClears } from './escapeClears';

const key = (name: string) => {
  const event = { key: name, preventDefault: vi.fn(), stopPropagation: vi.fn() };
  return event as unknown as KeyboardEvent & typeof event;
};

describe('escapeClears', () => {
  it('clears a field holding text and stops the key there', () => {
    const clear = vi.fn();
    const event = key('Escape');
    expect(escapeClears(event, 'tax', clear)).toBe(true);
    expect(clear).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('lets Esc in an empty field through, to go up a level', () => {
    const clear = vi.fn();
    const event = key('Escape');
    expect(escapeClears(event, '', clear)).toBe(false);
    expect(clear).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
  });

  it('ignores other keys', () => {
    const event = key('a');
    expect(escapeClears(event, 'tax', vi.fn())).toBe(false);
    expect(event.stopPropagation).not.toHaveBeenCalled();
  });
});
