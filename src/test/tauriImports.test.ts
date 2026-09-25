/**
 * Nothing in the web bundle's static graph may reach `@tauri-apps/*` (§ Desktop shell).
 *
 * The web and desktop ship the same `out/`, and a static Tauri import builds green —
 * so this is checked here, where `npm test` (and CI) runs it, as well as by lint:
 *  - no static `import` / `export … from` of `@tauri-apps/*` anywhere in `src/`
 *    (`import type` is erased, so it is allowed);
 *  - `import('@tauri-apps/…')` only in the modules that own desktop behaviour.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..');
const TAURI = /^@tauri-apps\//;
const DYNAMIC_ALLOWED = [/^platform\//, /^desktop\//, /^storage\/fileStore\.ts$/];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|mts|js|jsx|mjs)$/.test(entry.name) ? [path] : [];
  });
}

/** Every Tauri import in one file that breaks the rule, as `file:line kind`. */
function tauriViolations(file: string, text: string): string[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const dynamicAllowed = DYNAMIC_ALLOWED.some((pattern) => pattern.test(file));
  const found: string[] = [];
  const report = (node: ts.Node, kind: string) =>
    found.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1} ${kind}`);
  const named = (specifier: ts.Expression | undefined) =>
    !!specifier && ts.isStringLiteral(specifier) && TAURI.test(specifier.text);

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && named(node.moduleSpecifier)) {
      const clause = node.importClause;
      const typeOnly =
        !!clause &&
        (clause.isTypeOnly ||
          (!clause.name &&
            !!clause.namedBindings &&
            ts.isNamedImports(clause.namedBindings) &&
            clause.namedBindings.elements.length > 0 &&
            clause.namedBindings.elements.every((element) => element.isTypeOnly)));
      if (!typeOnly) report(node, 'static import');
    } else if (ts.isExportDeclaration(node) && named(node.moduleSpecifier) && !node.isTypeOnly) {
      report(node, 'static re-export');
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      named(node.moduleReference.expression) &&
      !node.isTypeOnly
    ) {
      report(node, 'static import');
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      named(node.arguments[0]) &&
      !dynamicAllowed
    ) {
      report(node, 'dynamic import outside src/platform, src/desktop, storage/fileStore');
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe('no static @tauri-apps import reaches the web bundle', () => {
  it('holds for every file under src/', () => {
    const violations = sourceFiles(SRC).flatMap((path) =>
      tauriViolations(relative(SRC, path).split(sep).join('/'), readFileSync(path, 'utf8')),
    );
    expect(violations).toEqual([]);
  });

  it('actually detects what it forbids (so an empty result means something)', () => {
    const probe = [
      "import { getVersion } from '@tauri-apps/api/app';",
      "import '@tauri-apps/plugin-fs';",
      "import * as dialog from '@tauri-apps/plugin-dialog';",
      "export { open } from '@tauri-apps/plugin-dialog';",
      "export * from '@tauri-apps/plugin-opener';",
      "import type { Update } from '@tauri-apps/plugin-updater';",
      "import { type Update as U } from '@tauri-apps/plugin-updater';",
      "export type { Update } from '@tauri-apps/plugin-updater';",
      "type Fs = typeof import('@tauri-apps/plugin-fs');",
      "vi.mock('@tauri-apps/plugin-fs', () => ({}));",
      "// import { x } from '@tauri-apps/api/app';",
      "async function f() { return import('@tauri-apps/api/path'); }",
    ].join('\n');

    expect(tauriViolations('components/Probe.tsx', probe).map((v) => v.split(' ')[0])).toEqual([
      'components/Probe.tsx:1',
      'components/Probe.tsx:2',
      'components/Probe.tsx:3',
      'components/Probe.tsx:4',
      'components/Probe.tsx:5',
      'components/Probe.tsx:12',
    ]);
    // Where desktop code lives, `import()` is the sanctioned route; a static import is not.
    expect(tauriViolations('platform/probe.ts', probe)).toHaveLength(5);
  });
});
