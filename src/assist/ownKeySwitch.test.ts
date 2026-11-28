import { afterEach, describe, expect, it, vi } from 'vitest';

/** Real value of the switch, past the setup file's mock. */
async function real(): Promise<boolean> {
  return (await vi.importActual<typeof import('@/ai/launch')>('@/ai/launch')).OWN_KEY_AI_ENABLED;
}

describe('own-key AI switch (k-0597)', () => {
  afterEach(() => {
    vi.doUnmock('@/ai/launch');
    vi.resetModules();
  });

  it('is off in the product until the joint launch', async () => {
    expect(await real()).toBe(false);
  });

  describe('with the switch off', () => {
    const off = () => {
      vi.resetModules();
      vi.doMock('@/ai/launch', () => ({ OWN_KEY_AI_ENABLED: false }));
    };

    it('openAi never opens the menu', async () => {
      off();
      const { openAi, useAiMenu } = await import('@/assist/menuStore');
      openAi();
      expect(useAiMenu.getState().open).toBeNull();
    });

    it('every verb counts as paused, so none is listed or started', async () => {
      off();
      const { isPaused } = await import('@/assist/paused');
      expect(isPaused('translate.fill')).toBe(true);
      expect(isPaused('check.import')).toBe(true);
    });

    it('the field Translate / Fill button is not drawn', async () => {
      off();
      const { fillButton } = await import('@/components/translate/fieldFill');
      const button = fillButton({ translate: { kind: 'answer' }, language: 'bilingual', readOnly: false, needs: 'zh', configured: true, modalOpen: false });
      expect(button).toEqual({ show: false });
    });

    it('the Settings AI section is available only for the studio', async () => {
      off();
      const { settingsSections } = await import('@/settings/sections');
      await import('@/components/settings/sections/ai');
      const ids = () => settingsSections({ desktop: true }).map((s) => s.id);
      // The studio is on in a develop build's tests (not a release build), so the door stays.
      expect(ids()).toContain('ai');
    });
  });
});
