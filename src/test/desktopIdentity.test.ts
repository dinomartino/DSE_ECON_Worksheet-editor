/**
 * The desktop app's identity (§ Desktop shell, Names). The identifier keys every installed
 * copy's data, keychain entries and updates; the executable name is what the Windows
 * installer looks for; the NSIS hook removes the pre-0.6.0 "Econ Worksheet" install.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const TAURI = join(__dirname, '..', '..', 'src-tauri');
const conf = JSON.parse(readFileSync(join(TAURI, 'tauri.conf.json'), 'utf8'));

describe('desktop identity', () => {
  it('keeps the identifier every installed copy stores its data under', () => {
    expect(conf.identifier).toBe('hk.econworksheet.desktop');
  });

  it('keeps AI keys under the same keychain service', () => {
    const secrets = readFileSync(join(TAURI, 'src', 'secrets.rs'), 'utf8');
    expect(secrets).toContain(`const SERVICE: &str = "${conf.identifier}";`);
  });

  it('keeps the executable name every release has shipped', () => {
    expect(conf.mainBinaryName).toBe('econ-worksheet');
  });

  it('removes the old Windows install when the product name differs from it', () => {
    expect(conf.productName).toBe('Econ Studio');
    const hooks = conf.bundle.windows.nsis.installerHooks;
    expect(existsSync(join(TAURI, hooks))).toBe(true);
    const nsh = readFileSync(join(TAURI, hooks), 'utf8');
    expect(nsh).toContain('!macro NSIS_HOOK_POSTINSTALL');
    expect(nsh).toContain('Uninstall\\Econ Worksheet"');
    expect(conf.bundle.windows.nsis.installMode).toBe('currentUser');
  });
});
