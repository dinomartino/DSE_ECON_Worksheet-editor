import { afterEach, describe, expect, it } from 'vitest';
import { appSettings } from '@/settings/store';
import { STUDIO_OPTIONS, autoReferencesOn } from './options';

afterEach(() => appSettings.reset(STUDIO_OPTIONS));

describe('the studio’s one option', () => {
  it('adds real questions by default, and stays where it was put', () => {
    expect(autoReferencesOn()).toBe(true);
    appSettings.write(STUDIO_OPTIONS, { autoReferences: false });
    expect(autoReferencesOn()).toBe(false);
    appSettings.reset(STUDIO_OPTIONS);
    expect(autoReferencesOn()).toBe(true);
  });
});
