import { describe, expect, it } from 'vitest';
import { SUPPORT_URL } from './links';

describe('the support link', () => {
  it('is one plain https URL that openExternal accepts', () => {
    expect(SUPPORT_URL).toBe('https://buymeacoffee.com/dseconmentor');
  });
});
