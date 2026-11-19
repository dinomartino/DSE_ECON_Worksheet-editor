import { normalizeRuns, runLines } from '@/model/text';
import { cssFontFamilies } from '@/model/fonts';
import type { InlineRun, RichText, RunFormat } from '@/model/types';
import { TAB_ATTR } from './tabLayout';

/**
 * The bridge between a `RichText` and the contenteditable: runs render as themselves
 * (never the marker string), so offsets are plain-text offsets, attributes read back
 * losslessly, and there is no second representation to drift. Every run is one
 * element with a `data-run` index — reading back is a walk, not a parse.
 */

/** Marks the element that owns one run, so the reader can recover its attributes. */
export const RUN_ATTR = 'data-run';

/**
 * The line after a trailing hard break, while the field is open (k-0468).
 *
 * The model stores "words\n" as the words and a blank line under them, and the page and
 * Word print that line. In a contenteditable it has no content, and Chrome and WebKit
 * place no caret after a field's final break: the caret snapped back onto the words, so
 * the blank line could be seen but never reached, and Backspace there deleted a letter
 * instead. A zero-width space after the break gives the line something to hold the
 * caret, in a span of its own so the reader knows it is not text (`readRuns`, offsets).
 * Inline and zero-width, it sits on the very line the paragraph's filler or marks label
 * already holds open, so opening the field moves nothing.
 */
export const CARET_LINE_ATTR = 'data-caret-line';
const CARET_LINE_MARK = '\u200b';

/** The caret line `paintRuns` puts after a trailing break (§ `CARET_LINE_ATTR`). */
function caretLineNode(): HTMLElement {
  const line = document.createElement('span');
  line.setAttribute(CARET_LINE_ATTR, '');
  line.textContent = CARET_LINE_MARK;
  return line;
}

const inCaretLine = (node: Node): boolean => Boolean(node.parentElement?.closest(`[${CARET_LINE_ATTR}]`));

/** A text node's characters that are text: the caret line's zero-width space is not. */
function textOf(node: Node): string {
  const text = node.nodeValue ?? '';
  return inCaretLine(node) ? text.split(CARET_LINE_MARK).join('') : text;
}

/** The DOM offset in text node `node` of its `count`-th text character (§ `textOf`). */
function domOffset(node: Node, count: number): number {
  if (!inCaretLine(node)) return count;
  const text = node.nodeValue ?? '';
  let seen = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (seen === count) return index;
    if (text[index] !== CARET_LINE_MARK) seen += 1;
  }
  return text.length;
}

/**
 * The DOM for a field's runs: one element per run (`runToNode`), and the caret line when
 * the text ends in a hard break, so that line can be typed on and deleted (k-0468).
 */
export function paintRuns(runs: RichText): Node[] {
  const nodes: Node[] = runs.map(runToNode);
  if (runs.length > 0 && runs[runs.length - 1].text.endsWith('\n')) nodes.push(caretLineNode());
  return nodes;
}

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
  if (run.fonts) style.fontFamily = `${cssFontFamilies(run.fonts)}, serif`;
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
    line.split('\t').forEach((piece, pieceIndex) => {
      if (pieceIndex > 0) fragment.appendChild(tabNode());
      if (piece) fragment.appendChild(document.createTextNode(piece));
    });
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
 * A typed tab while editing: the `\t` itself in a `[data-tab]` span that `layoutTabs`
 * sizes, as on the idle page. Not editable, so the caret steps over it as one character
 * and typing never lands inside the gap; its text still reads back as the tab.
 */
function tabNode(): HTMLElement {
  const tab = document.createElement('span');
  tab.setAttribute(TAB_ATTR, '');
  tab.contentEditable = 'false';
  tab.textContent = '\t';
  return tab;
}

/** The tab span a node sits in, if any. */
function tabOf(node: Node): HTMLElement | null {
  return (node.parentElement?.closest(`[${TAB_ATTR}]`) as HTMLElement | null) ?? null;
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
  /** The field ends on the caret line: the break before it is the one the line opens. */
  let endsOnCaretLine = false;

  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let node: Node | null = walker.currentNode;
  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement;
      if (element.tagName === 'BR') {
        out.push({ ...lastAttrs, text: '\n' });
        endsOnCaretLine = false;
      }
      continue;
    }
    const raw = node.nodeValue ?? '';
    if (!raw) continue;
    endsOnCaretLine = inCaretLine(node) && raw.endsWith(CARET_LINE_MARK);
    const text = textOf(node);
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

  /*
   * A final break with nothing after it is the browser's, not the teacher's: Chrome draws
   * no line after a field's last break, so when the last line empties (Shift+Enter at the
   * end, the last word of a line deleted) it writes a placeholder break to hold the caret,
   * and typing on leaves that placeholder at the end. Read as text, it saved a blank line
   * nobody typed and nobody could delete (k-0468). The field reads as it looks: a break the
   * teacher typed at the end is followed by the caret line (`paintRuns`) or by the
   * browser's placeholder, so the one break that shows no line is dropped.
   */
  return endsOnCaretLine ? normalizeRuns(out) : withoutPlaceholderBreak(normalizeRuns(out));
}

/**
 * The text a field shows when its DOM ends in a break with nothing after it (§ `readRuns`):
 * that break draws no line, so it is the browser's placeholder and is not text. One break
 * only, the last: "words\n\n" shows one blank line, the break before the placeholder.
 */
export function withoutPlaceholderBreak(runs: RichText): RichText {
  const last = runs[runs.length - 1];
  if (!last || !last.text.endsWith('\n')) return runs;
  const text = last.text.slice(0, -1);
  return text ? [...runs.slice(0, -1), { ...last, text }] : runs.slice(0, -1);
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
      : inCaretLine(container)
        ? (container.nodeValue ?? '').slice(0, offset).split(CARET_LINE_MARK).join('').length
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
    total += textOf(node).length;
  }
  // `container` is the host itself (or is not in it): the walk already counted nothing
  // that precedes it, so the in-subtree count is the whole answer.
  return container === host ? within : total;
}

/**
 * The plain-text offset nearest a viewport point, or undefined when the point is not
 * over this field's text.
 *
 * How a click that opens an editor lands its caret where it was aimed instead of at the
 * end of the text. The browser owns the hard part — which character a pixel is nearest,
 * across wrapped lines, bidi and per-run fonts — and `offsetOf` converts its answer into
 * the model's coordinate space.
 *
 * Two spellings of one API: `caretPositionFromPoint` is the standard, `caretRangeFromPoint`
 * WebKit's older equivalent. A browser with neither returns undefined and the caller keeps
 * its previous behaviour.
 */
export function offsetAtPoint(
  host: HTMLElement,
  point: { x: number; y: number },
): number | undefined {
  const doc = host.ownerDocument as Document & {
    caretPositionFromPoint?: (
      x: number,
      y: number,
    ) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };

  let container: Node | undefined;
  let offset: number | undefined;

  if (typeof doc.caretPositionFromPoint === 'function') {
    const position = doc.caretPositionFromPoint(point.x, point.y);
    if (position) {
      container = position.offsetNode;
      offset = position.offset;
    }
  } else if (typeof doc.caretRangeFromPoint === 'function') {
    const range = doc.caretRangeFromPoint(point.x, point.y);
    if (range) {
      container = range.startContainer;
      offset = range.startOffset;
    }
  }

  if (!container || offset === undefined) return undefined;
  // A point in the paragraph's margin resolves to a node outside this field; the caller
  // falls back rather than reporting a position that belongs to other text.
  if (!host.contains(container)) return undefined;
  return offsetOf(host, container, offset);
}

/** Characters a node contributes, counting a `<br>` as one newline. */
function textLengthOf(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) return textOf(node).length;
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
  let afterBreak: { node: Node; offset: number } | undefined;
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let node: Node | null = walker.currentNode;
  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement;
      if (element.tagName === 'BR') {
        // Straight after an earlier break, with no text between: the blank line it opened.
        if (afterBreak) return afterBreak;
        // A caret *after* a break belongs at the start of the next text node, which the
        // next iteration supplies; landing it on the <br>'s parent would place it before.
        seen += 1;
        // With no text after it (a trailing break, or another break next), the place after
        // the <br> itself: the blank line it opens, which is how a trailing blank line is
        // reached and deleted (k-0468).
        if (target === seen) {
          const parent = element.parentNode!;
          afterBreak = { node: parent, offset: (Array.prototype.indexOf.call(parent.childNodes, element) as number) + 1 };
        }
      }
      continue;
    }
    const length = textOf(node).length;
    const tab = tabOf(node);
    if (tab) {
      // Never inside a tab: the caret goes beside it, in its parent.
      const parent = tab.parentNode!;
      const index = Array.prototype.indexOf.call(parent.childNodes, tab) as number;
      if (target <= seen) return { node: parent, offset: index };
      seen += length;
      last = { node: parent, offset: index + 1 };
      if (target <= seen) return last;
      continue;
    }
    if (target <= seen + length) return { node, offset: domOffset(node, Math.max(0, target - seen)) };
    seen += length;
    last = { node, offset: domOffset(node, length) };
  }
  return afterBreak ?? last ?? { node: host, offset: 0 };
}
