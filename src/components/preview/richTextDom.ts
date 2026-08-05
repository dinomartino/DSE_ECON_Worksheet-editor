import { normalizeRuns, runLines } from '@/model/text';
import type { InlineRun, RichText, RunFormat } from '@/model/types';

/**
 * The bridge between a `RichText` and the contenteditable: runs render as themselves
 * (never the marker string), so offsets are plain-text offsets, attributes read back
 * losslessly, and there is no second representation to drift. Every run is one
 * element with a `data-run` index — reading back is a walk, not a parse.
 */

/** Marks the element that owns one run, so the reader can recover its attributes. */
export const RUN_ATTR = 'data-run';

/**
 * The inline CSS one run renders with.
 *
 * Bold/italic/underline are *also* expressed as real `<strong>`/`<em>`/`<u>` elements by
 * `runToElement`, because the browser's own `execCommand`-free editing and a screen
 * reader both read semantics rather than CSS. The style here carries what has no
 * element: size, colour and the font pair.
 */
export function runStyle(run: RunFormat): React.CSSProperties {
  const style: React.CSSProperties = {};
  if (run.fontSize !== undefined) style.fontSize = `${run.fontSize}pt`;
  if (run.color) style.color = `#${run.color}`;
  if (run.fonts) style.fontFamily = `'${run.fonts.latin}', '${run.fonts.eastAsia}', serif`;
  return style;
}

/**
 * Read the attributes a rendered run element was built from.
 *
 * Taken from a serialized `data-run-attrs` payload rather than re-derived from the
 * element's tag and computed style. Round-tripping through CSS would quantise a font
 * size to pixels and a colour to `rgb()`, so an 11pt run that was never touched would
 * come back as `14.6667px` and export as a *different* run — the untouched-document
 * guarantee depends on reading back exactly what was written.
 */
function attrsOf(element: HTMLElement): RunFormat {
  const raw = element.getAttribute('data-run-attrs');
  if (!raw) return {};
  try {
    return JSON.parse(raw) as RunFormat;
  } catch {
    return {};
  }
}

/**
 * Serialize a run's attributes for the DOM, so `attrsOf` can read them back verbatim.
 *
 * Keys are sorted so an unchanged run produces an unchanged attribute string, which
 * keeps React from re-creating the node under a live caret.
 */
export function attrsPayload(run: InlineRun): string {
  const { text: _text, ...attrs } = run;
  const keys = Object.keys(attrs).sort();
  if (keys.length === 0) return '';
  const ordered: Record<string, unknown> = {};
  for (const key of keys) ordered[key] = (attrs as Record<string, unknown>)[key];
  return JSON.stringify(ordered);
}

/**
 * Build the DOM for one run: real nodes, not React elements (React reconciling into a
 * browser-mutated contenteditable destroys the caret). Semantic elements carry
 * emphasis, inline style the rest; `data-run-attrs` lets `readRuns` recover exact
 * attributes (computed CSS would quantise 11pt to 14.6667px). A hard break is a real
 * `<br>` that reads back as `\n`.
 */
export function runToNode(run: InlineRun, index: number): HTMLElement {
  const holder = document.createElement('span');
  holder.setAttribute(RUN_ATTR, String(index));
  const attrs = attrsPayload(run);
  if (attrs) holder.setAttribute('data-run-attrs', attrs);
  Object.assign(holder.style, runStyle(run) as Record<string, string>);

  const wrap = (tag: string, child: Node): HTMLElement => {
    const element = document.createElement(tag);
    element.appendChild(child);
    return element;
  };

  const fragment = document.createDocumentFragment();
  runLines(run.text).forEach((line, lineIndex) => {
    if (lineIndex > 0) fragment.appendChild(document.createElement('br'));
    if (line) fragment.appendChild(document.createTextNode(line));
  });

  let content: Node = fragment;
  if (run.bold) content = wrap('strong', content);
  if (run.italic) content = wrap('em', content);
  if (run.underline) content = wrap('u', content);
  if (run.vertAlign === 'superscript') content = wrap('sup', content);
  if (run.vertAlign === 'subscript') content = wrap('sub', content);

  holder.appendChild(content);
  return holder;
}

/**
 * Do two rich texts carry identical runs?
 *
 * Used to tell a real model change from the field's own echo: the browser types a
 * character, the runs are read back and sent to the store, and the store hands the same
 * value down again. Repainting on that echo re-inserts the whole string beside the one
 * the browser just typed, which is what turned "Based" into "BasedBaseBasBaB".
 */
export function sameRuns(a: RichText, b: RichText): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (run, index) => run.text === b[index].text && attrsPayload(run) === attrsPayload(b[index]),
  );
}

/**
 * Read the runs currently in an editable host.
 *
 * Walks text nodes in document order and attributes each to its nearest ancestor
 * carrying `data-run`. Text with no such ancestor — anything the browser created on its
 * own, which is what a paste or an IME commit produces — inherits from the run element
 * immediately before it, so typed characters join the phrase they were typed into
 * rather than resetting to unformatted.
 *
 * Hard line breaks arrive as literal `\n` **characters**, not `<br>` elements, because
 * the field is `white-space: pre-wrap` — so Shift+Enter round-trips into exactly the
 * newline the model already stores (§ newline is run text) with no conversion. A `<br>`
 * is still read as `\n` for the paths that paint one (the idle preview, a paste).
 */
/**
 * Emphasis the *browser* put between a text node and its run element (Cmd+B wraps the
 * selection in its own `<b>` inside the run span, untouched `data-run-attrs`). The
 * tags between text and owner are read and *add* to the run's attributes; walking up
 * to the owner catches `<b><i>text</i></b>`.
 */
function nativeEmphasis(node: Node, owner: HTMLElement | null): RunFormat {
  const found: RunFormat = {};
  let current = node.parentElement;
  while (current && current !== owner) {
    switch (current.tagName) {
      case 'B':
      case 'STRONG':
        found.bold = true;
        break;
      case 'I':
      case 'EM':
        found.italic = true;
        break;
      case 'U':
        found.underline = true;
        break;
    }
    current = current.parentElement;
  }
  return found;
}

export function readRuns(host: HTMLElement): RichText {
  const out: RichText = [];
  let lastAttrs: RunFormat = {};

  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let node: Node | null = walker.currentNode;
  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement;
      if (element.tagName === 'BR') out.push({ ...lastAttrs, text: '\n' });
      continue;
    }
    const text = node.nodeValue ?? '';
    if (!text) continue;
    const owner = (node.parentElement?.closest(`[${RUN_ATTR}]`) ?? null) as HTMLElement | null;
    // No owner means the browser inserted this text outside any run element; it belongs
    // to whatever was being typed into, which is the previous run's formatting.
    const base = owner ? attrsOf(owner) : lastAttrs;
    // The run's stored attributes first, so a native `<b>` adds bold to a phrase that
    // already carries a size and a colour instead of replacing them.
    const attrs = { ...base, ...nativeEmphasis(node, owner) };
    if (owner) lastAttrs = attrs;
    out.push({ ...attrs, text });
  }

  return normalizeRuns(out);
}

/**
 * The plain-text offset of a DOM position inside `host`.
 *
 * Counts the characters of every text node before the position, and one `\n` per `<br>`,
 * so the number it returns indexes the same string `plain()` produces — which is the
 * coordinate space the model, the toolbar and `applyRunFormat` all already use.
 */
export function offsetOf(host: HTMLElement, container: Node, offset: number): number {
  // A position given as (element, n) means "before the element's n-th child". Resolve it
  // to a character count of its own subtree, then add everything preceding the element.
  const within =
    container.nodeType === Node.ELEMENT_NODE
      ? Array.from(container.childNodes)
          .slice(0, offset)
          .reduce((total, child) => total + textLengthOf(child), 0)
      : offset;

  let total = 0;
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let node: Node | null = walker.currentNode;
  while ((node = walker.nextNode())) {
    if (node === container) return total + within;
    if (node.nodeType === Node.ELEMENT_NODE) {
      if ((node as HTMLElement).tagName === 'BR') total += 1;
      continue;
    }
    total += (node.nodeValue ?? '').length;
  }
  // `container` is the host itself (or is not in it): the walk already counted nothing
  // that precedes it, so the in-subtree count is the whole answer.
  return container === host ? within : total;
}

/** Characters a node contributes, counting a `<br>` as one newline. */
function textLengthOf(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) return (node.nodeValue ?? '').length;
  if (node.nodeType !== Node.ELEMENT_NODE) return 0;
  const element = node as HTMLElement;
  if (element.tagName === 'BR') return 1;
  let total = 0;
  for (const child of Array.from(element.childNodes)) total += textLengthOf(child);
  return total;
}

/** The current selection as plain-text offsets, or undefined when it is not inside `host`. */
export function selectionOffsets(
  host: HTMLElement,
): { start: number; end: number } | undefined {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return undefined;
  const range = selection.getRangeAt(0);
  if (!host.contains(range.startContainer) || !host.contains(range.endContainer)) {
    return undefined;
  }
  const start = offsetOf(host, range.startContainer, range.startOffset);
  const end = offsetOf(host, range.endContainer, range.endOffset);
  return { start: Math.min(start, end), end: Math.max(start, end) };
}

/**
 * Put the caret (or a range) at plain-text offsets inside `host`.
 *
 * Needed after every commit: React re-renders the runs from the model, which replaces
 * the DOM nodes the caret was anchored in, and a caret with no node falls back to the
 * start of the field — so typing a character would send the caret home on every
 * keystroke without this.
 */
export function setSelectionOffsets(host: HTMLElement, start: number, end = start): void {
  const from = locate(host, start);
  const to = end === start ? from : locate(host, end);
  if (!from || !to) return;
  const range = document.createRange();
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/** Find the text node and in-node offset holding plain-text offset `target`. */
function locate(host: HTMLElement, target: number): { node: Node; offset: number } | undefined {
  let seen = 0;
  let last: { node: Node; offset: number } | undefined;
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let node: Node | null = walker.currentNode;
  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      if ((node as HTMLElement).tagName === 'BR') {
        // A caret *after* a break belongs at the start of the next text node, which the
        // next iteration supplies; landing it on the <br>'s parent would place it before.
        seen += 1;
      }
      continue;
    }
    const length = (node.nodeValue ?? '').length;
    if (target <= seen + length) return { node, offset: Math.max(0, target - seen) };
    seen += length;
    last = { node, offset: length };
  }
  return last ?? { node: host, offset: 0 };
}
