import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const FLAG = 'NEXT_PUBLIC_RELEASE_BUILD';
const original = process.env[FLAG];

afterEach(() => {
  if (original === undefined) delete process.env[FLAG];
  else process.env[FLAG] = original;
  vi.resetModules();
});

/** The constant as a build with this value of the flag would carry it (Next inlines it when it builds). */
async function releaseBuildWith(value: string | undefined): Promise<boolean> {
  if (value === undefined) delete process.env[FLAG];
  else process.env[FLAG] = value;
  vi.resetModules();
  return (await import('./buildChannel')).RELEASE_BUILD;
}

describe('which build this is', () => {
  it('is a release build only when the flag is exactly 1', async () => {
    expect(await releaseBuildWith('1')).toBe(true);
    for (const value of [undefined, '', '0', 'true', 'release', ' 1']) {
      expect(await releaseBuildWith(value), `flag ${JSON.stringify(value)}`).toBe(false);
    }
  });

  it('is a develop build when nothing sets the flag, as in `npm test`, `npm run dev` and a build on develop', async () => {
    expect(original, 'the flag is set in this shell: unset it to run the tests as a develop build').toBeUndefined();
    expect(await releaseBuildWith(undefined)).toBe(false);
  });
});

describe('who sets the flag', () => {
  const read = (file: string) => readFileSync(join(__dirname, '../..', file), 'utf8');

  it('the Release workflow does, on the build the tag makes, and no other workflow or script does', () => {
    const release = read('.github/workflows/release.yml');
    expect(release).toMatch(/^\s+NEXT_PUBLIC_RELEASE_BUILD: '1'\s*$/m);
    // The tag is what makes it a release: the flag sits in the workflow that only a `v*` tag runs.
    expect(release).toMatch(/tags: \['v\*'\]/);
    for (const file of ['.github/workflows/ci.yml', '.github/workflows/desktop-preview.yml', 'package.json', 'src-tauri/tauri.conf.json', 'next.config.ts']) {
      expect(read(file), `${file} must not set the flag: it would make every build a release build`).not.toContain(FLAG);
    }
  });

  it('the app reads it in one place', () => {
    const readers = (readdirSync(join(__dirname, '..'), { recursive: true }) as string[])
      .filter((file) => /\.(ts|tsx)$/.test(file) && !/\.test\.tsx?$/.test(file))
      .filter((file) => readFileSync(join(__dirname, '..', file), 'utf8').includes(FLAG))
      .map((file) => file.split('\\').join('/'));
    expect(readers).toEqual(['platform/buildChannel.ts']);
  });
});
