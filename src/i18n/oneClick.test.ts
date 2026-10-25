import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { registeredCatalogues, type MessageEntry } from './catalogue';

/**
 * One click types (k-0200): a question, part or option opens where it is clicked, so an
 * interface string that still tells the teacher to double-click is wrong. This guard reads
 * every catalogue entry (both sides) and every string literal and JSX text in `src/` outside
 * the catalogues, and fails on "double-click", "double click", 雙擊 or 按兩下 — unless the
 * action really is still a double-click, which `STILL_DOUBLE_CLICK` names with its reason.
 *
 * Not read: comments, tests, the release history (`whatsNew/changelog.generated.ts`, which
 * describes what older versions did) and the glossary (`i18n/terms.ts`, the term itself).
 */

const DOUBLE_CLICK = /double[\s\-‐‑]*click|雙擊|双击|按兩下/i;

/** `catalogue file:key` → why that action still takes a double-click. */
const STILL_DOUBLE_CLICK: Record<string, string> = {
  'components/editor/DocumentSettings.messages.ts:dragHint':
    'the header and footer are furniture: Word and Preview.tsx RegionWake wake them on a double-click',
  'components/preview/messages.ts:doubleClickSuffix':
    'the title of RegionWake, the double-click that steps into the header or footer',
  'components/preview/BandEditor.messages.ts:addText':
    'a header or footer field is twoStep (its chip drags between zones): a click selects, a double-click types',
  'components/preview/messages.ts:selectImageOpen':
    'a diagram on the page opens its drawing canvas on a double-click (ResizableBlock onOpen)',
  'components/editor/diagramEditing.messages.ts:hintEmpty':
    'the flow chart canvas adds a stage on a double-click of the empty box (FlowCanvas onDoubleClick)',
  'components/editor/diagramEditing.messages.ts:hintSelect':
    'the flow chart canvas retypes a box on a double-click (FlowCanvas onDoubleClick)',
  'components/editor/diagramEditing.messages.ts:emptyPost':
    'the flow chart canvas adds a stage on a double-click of the empty box (FlowCanvas onDoubleClick)',
  'components/editor/diagramEditing.messages.ts:helpPre':
    'the flow chart canvas retypes a box on a double-click (FlowCanvas onDoubleClick)',
  'components/editor/diagramEditing.messages.ts:toolCurveHint':
    'the drawing canvas retypes a label on a double-click (DiagramCanvas onDoubleClick)',
  'components/editor/diagramEditing.messages.ts:curveNote':
    'the drawing canvas puts a kink in a line on a double-click (DiagramCanvas onDoubleClick)',
};

const SRC = path.resolve(__dirname, '..');
const rel = (f: string) => path.relative(SRC, f);
const CATALOGUE = /(^|\.)messages\.ts$/;
const NOT_READ = new Set([path.join('whatsNew', 'changelog.generated.ts'), path.join('i18n', 'terms.ts')]);

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const files = walk(SRC);

/** Every text an entry can show: a function entry is called with sample arguments. */
function textsOf(entry: MessageEntry): string[] {
  return (['en', 'zh'] as const).flatMap((side) => {
    const value = entry[side] as unknown;
    if (typeof value === 'string') return [value];
    if (typeof value !== 'function') return [];
    const fn = value as (...args: unknown[]) => unknown;
    return ['Sample', 2, 1, true, false].flatMap((sample) => {
      try {
        const out = fn(...Array.from({ length: fn.length }, () => sample));
        return typeof out === 'string' ? [out] : [];
      } catch {
        return [];
      }
    });
  });
}

/** `file:key` of every catalogue entry that mentions a double-click. */
const mentions = new Map<string, string>();
for (const file of files.filter((f) => CATALOGUE.test(path.basename(f)))) {
  const before = registeredCatalogues().length;
  await import(/* @vite-ignore */ file);
  for (const catalogue of registeredCatalogues().slice(before)) {
    for (const [key, entry] of Object.entries(catalogue)) {
      const hit = textsOf(entry).find((text) => DOUBLE_CLICK.test(text));
      if (hit) mentions.set(`${rel(file)}:${key}`, hit);
    }
  }
}

/** String literals, template text and JSX text that mention a double-click — never comments. */
export function hardCodedIn(source: string, fileName = 'x.tsx'): { line: number; text: string }[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: { line: number; text: string }[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isJsxText(node)
    ) {
      if (DOUBLE_CLICK.test(node.text)) {
        found.push({ line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, text: node.text.trim() });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

describe('one click types: no interface text asks for a double-click', () => {
  it('reads the catalogues', () => {
    expect(mentions.size).toBeGreaterThan(0);
  });

  it('no catalogue entry says double-click unless the action still is one', () => {
    const wrong = [...mentions].filter(([id]) => !(id in STILL_DOUBLE_CLICK)).map(([id, text]) => `${id}: ${text}`);
    expect(wrong, 'say "Click to type" — or, if it truly is a double-click, add it to STILL_DOUBLE_CLICK').toEqual([]);
  });

  it('every exemption still mentions a double-click (else drop it from the list)', () => {
    expect(Object.keys(STILL_DOUBLE_CLICK).filter((id) => !mentions.has(id))).toEqual([]);
  });

  it('no hard-coded string or JSX text says double-click', () => {
    const wrong = files
      .filter((f) => !CATALOGUE.test(path.basename(f)) && !NOT_READ.has(rel(f)))
      .flatMap((f) => hardCodedIn(readFileSync(f, 'utf8'), f).map((hit) => `${rel(f)}:${hit.line} ${hit.text}`));
    expect(wrong, 'interface text belongs in a messages.ts catalogue, and one click types').toEqual([]);
  });
});

describe('the guard itself', () => {
  it('catches each spelling, in both languages', () => {
    for (const text of ['Double-click to add', 'double click here', 'Double‑click', 'doubleclick', '雙擊以編輯', '按兩下以加入英文']) {
      expect(DOUBLE_CLICK.test(text), text).toBe(true);
    }
    for (const text of ['Click to type', '按一下即可輸入', 'Click twice? No.']) {
      expect(DOUBLE_CLICK.test(text), text).toBe(false);
    }
  });

  it('reads strings and JSX text but not comments', () => {
    const src = [
      '// a double-click here is a comment',
      '/* 按兩下 also a comment */',
      'const a = "Double-click to edit";',
      'const b = (n: string) => `${n} (double click)`;',
      'const c = <span title="ok">{/* double-click */}按兩下以加入</span>;',
      'const d = onDoubleClick;',
    ].join('\n');
    expect(hardCodedIn(src).map((hit) => hit.line)).toEqual([3, 4, 5]);
  });
});
