/**
 * Does this interface text use the interface font (k-0568)? A browser check for the verify
 * scripts: every visible element with words of its own under `scope` must compute the same
 * `font-family` as `<body>` (the theme's `--ui-font`).
 *
 * Paper content inside the scope is left alone: a subtree that sets its own face (`.paper`,
 * `.font-serif`, an inline `font-family`) *inside* the scope is the question as it prints. A
 * paper face *around* the scope is the bug this catches: chrome drawn on the page (the AI
 * draft's header and buttons) inherited the paper's Times New Roman / PMingLiU. `kbd`,
 * `code` and `.font-mono` are monospace on purpose.
 *
 *   import { uiFontProblems } from './ui-font-kit.mjs';
 *   const bad = await uiFontProblems(page, '[data-ai-ghost-head]');   // [] when all is well
 */
export async function uiFontProblems(page, scope) {
  return page.evaluate((sel) => {
    const ui = getComputedStyle(document.body).fontFamily;
    const problems = [];
    const roots = [...document.querySelectorAll(sel)];
    for (const root of roots) {
      const els = [root, ...root.querySelectorAll('*')];
      for (const el of els) {
        if (!el.getClientRects().length) continue;
        const own = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim()).join(' ');
        if (!own) continue;
        if (el.closest('kbd, code, .font-mono')) continue;
        const face = el.closest('.paper, .font-serif, [style*="font-family"]');
        if (face && face !== root && root.contains(face)) continue;
        const font = getComputedStyle(el).fontFamily;
        if (font !== ui) problems.push(`"${own.slice(0, 30)}" in ${el.tagName.toLowerCase()}: ${font.slice(0, 60)}`);
      }
    }
    return roots.length ? problems : [`nothing matches ${sel}`];
  }, scope);
}
