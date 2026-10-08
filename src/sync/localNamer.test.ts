import { afterEach, describe, expect, it, vi } from 'vitest';
import { appSettings } from '@/settings/store';
import { SYNC_SETTINGS } from '@/settings/sync';
import { computerName, defaultComputerName, localNamer } from './localNamer';

const AT = new Date(2026, 9, 5, 14, 32);

describe('localNamer', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('names a conflict copy with the computer and that version’s own time, in English', () => {
    const namer = localNamer(() => 'Home Mac', () => 'en');
    expect(namer.conflictCopy('Mock', AT)).toBe('Mock (Home Mac, 5 Oct 14:32)');
    expect(namer.conflictCopy('Mock', new Date(2026, 0, 9, 8, 5))).toBe('Mock (Home Mac, 9 Jan 08:05)');
    expect(namer.providerCopy('Mock')).toBe('Mock (from another computer / 來自另一部電腦)');
  });

  it('and in Hong Kong Chinese', () => {
    const namer = localNamer(() => 'Home Mac', () => 'zh-HK');
    expect(namer.conflictCopy('測驗', AT)).toBe('測驗（Home Mac，10月5日 14:32）');
    // One name in both languages, so two computers make the same copy.
    expect(namer.providerCopy('測驗')).toBe('測驗 (from another computer / 來自另一部電腦)');
  });

  it('follows the interface language at the moment a copy is made, the default name too', () => {
    let lang: 'en' | 'zh-HK' = 'en';
    vi.stubGlobal('navigator', { platform: 'Win32', userAgent: 'Mozilla/5.0 (Windows NT 10.0)' });
    const namer = localNamer(defaultComputerName, () => lang);
    expect(namer.conflictCopy('Mock', AT)).toBe('Mock (Windows PC, 5 Oct 14:32)');
    lang = 'zh-HK';
    expect(namer.conflictCopy('Mock', AT)).toBe('Mock（Windows 電腦，10月5日 14:32）');
  });

  it('defaults the computer name from the platform', () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' });
    expect(defaultComputerName('en')).toBe('Mac');
    vi.stubGlobal('navigator', { platform: 'Linux x86_64', userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' });
    expect(defaultComputerName('en')).toBe('Computer');
    expect(defaultComputerName('zh-HK')).toBe('電腦');
  });
});

describe('computerName', () => {
  afterEach(() => {
    appSettings.reset(SYNC_SETTINGS);
    vi.unstubAllGlobals();
  });

  it('is the name the teacher gave this computer, else the platform default', () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel', userAgent: 'Mozilla/5.0 (Macintosh)' });
    expect(computerName('en')).toBe('Mac');
    appSettings.write(SYNC_SETTINGS, { computerName: '  Home   Mac ' });
    expect(computerName('en')).toBe('Home Mac');
    expect(localNamer(computerName, () => 'en').conflictCopy('Mock', AT)).toBe('Mock (Home Mac, 5 Oct 14:32)');
    appSettings.write(SYNC_SETTINGS, { computerName: '   ' });
    expect(computerName('zh-HK')).toBe('Mac');
  });

  it('a stored value too long or not text reads as the default', () => {
    vi.stubGlobal('navigator', { platform: 'Win32', userAgent: 'Windows' });
    appSettings.write(SYNC_SETTINGS, { computerName: 'x'.repeat(41) });
    expect(computerName('en')).toBe('Windows PC');
  });
});
