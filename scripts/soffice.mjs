import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * LibreOffice for the harnesses' Word leg, with Chinese that actually renders.
 *
 * soffice loads only its own bundled fonts, so every CJK glyph drops out of the PDF and
 * a zh/bilingual page count is not real. The fix is a private profile whose `user/fonts`
 * holds the system's CJK faces; it is created on first use and reused after.
 */

export const SOFFICE = '/Applications/LibreOffice.app/Contents/MacOS/soffice';

/** Where the profile lives unless `--lo-profile=<dir>` says otherwise. */
export const DEFAULT_LO_PROFILE = join(tmpdir(), 'econ-lo-profile');

/** System CJK faces, first hit wins per name. */
const CJK_FONT_DIRS = ['/System/Library/Fonts', '/Library/Fonts'];
const CJK_FONT = /^(STHeiti.*\.ttc|Songti\.ttc|PingFang\.ttc)$/i;

function findCjkFonts() {
  const found = new Map();
  for (const dir of CJK_FONT_DIRS) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (CJK_FONT.test(name) && !found.has(name)) found.set(name, join(dir, name));
    }
  }
  return [...found.values()];
}

/** Creates (or tops up) the profile; returns its absolute path. */
export function ensureLoProfile(dir = DEFAULT_LO_PROFILE) {
  const profile = resolve(dir);
  const fontDir = join(profile, 'user', 'fonts');
  mkdirSync(fontDir, { recursive: true });
  const fonts = findCjkFonts();
  if (fonts.length === 0) {
    console.log('warning: no system CJK font found; Chinese will drop out of the Word leg');
  }
  for (const font of fonts) {
    const dest = join(fontDir, basename(font));
    if (!existsSync(dest)) copyFileSync(font, dest);
  }
  return profile;
}

/** `docx` → PDF in `outDir`, under `profile`. Exits the process on failure. */
export function convertToPdf(docx, outDir, profile) {
  const res = spawnSync(
    SOFFICE,
    [
      `-env:UserInstallation=${pathToFileURL(profile).href}`,
      '--headless',
      '--convert-to',
      'pdf',
      '--outdir',
      outDir,
      docx,
    ],
    { stdio: 'pipe', encoding: 'utf8' },
  );
  if (res.status !== 0) {
    console.error(`FAILED: soffice ${docx}\n${res.stdout}\n${res.stderr}`);
    process.exit(1);
  }
}
