import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import JSZip from 'jszip';
import { chromium } from 'playwright-core';

/**
 * Interface themes (Settings → Appearance) in a real browser.
 *
 *   node scripts/theme-verify.mjs [--part=paper,baseline,gallery] [--port=3000] [--base-port=3001]
 *                                 [--themes=light,sepia] [--out=/tmp/theme-verify]
 *
 *  - paper: the worksheet is never themed. For two saved papers (diagrams, MC, structured,
 *    tables), each theme's sheets (editing chrome stripped, as print strips it), `.docx` and
 *    print PDF (rasterised) must equal Classic's: pixel for pixel, byte for byte (the `.docx`
 *    minus its creation time).
 *  - baseline: the default look is unchanged. Classic, Dark and System (OS light and dark) on
 *    `--port` against a build without themes on `--base-port`, screen by screen, pixel for pixel.
 *  - showcase (not run by default): each theme's screens at 1440×900, 2× density, EN and 中文.
 *  - gallery: every theme at 1440×900, 1180×820 and 820×1180, English and 中文 interface:
 *    start screen, editor, a text being edited (format bar), ⌘K, Setup, Export and Settings →
 *    Appearance; each screen's visible chrome text is measured against what it sits on. Every
 *    label of a new theme must clear WCAG AA; Classic and Dark (the default look, which must
 *    not change) are held only to not getting worse.
 *
 * Needs Chrome and poppler (pdftoppm). Expects dev servers already running.
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const PORT = opt('port', '3000');
const BASE_PORT = opt('base-port', '');
const OUT = opt('out', '/tmp/theme-verify');
const PARTS = opt('part', 'paper,baseline,gallery').split(',');
const APP_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const appearance = readFileSync(new URL('../src/settings/appearance.ts', import.meta.url), 'utf8');
const ALL_THEMES = [...appearance.matchAll(/\{ id: '([a-z-]+)', scheme: '(light|dark)' \}/g)].map((m) => m[1]);
const THEMES = opt('themes', ALL_THEMES.join(',')).split(',');

const FIXTURES = ['option-layout-mix.json', 'table-justify-mix.json'].map((file, i) => {
  const doc = JSON.parse(readFileSync(new URL(`../test-fixtures/manual/${file}`, import.meta.url), 'utf8'));
  // The manual fixtures share ids; each gets its own here, or one would overwrite the other.
  doc.id = `theme-verify-${i + 1}`;
  return { name: file.replace('.json', ''), text: JSON.stringify(doc), id: doc.id, title: doc.title.en.map((r) => r.text).join(''), updatedAt: doc.updatedAt };
});

const STILL =
  'nextjs-portal{display:none!important}' +
  '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important;caret-color:transparent!important}';
const VIEWPORTS = { mac: { width: 1440, height: 900 }, ipadLandscape: { width: 1180, height: 820 }, ipadPortrait: { width: 820, height: 1180 } };
const WORDS = {
  en: { setup: 'Setup', export: /^Export…/, appearance: 'Appearance', dismissHint: 'Dismiss hint', exportDocx: /^Export \.docx/ },
  zh: { setup: '頁面設定', export: /^匯出…/, appearance: '外觀', dismissHint: '關閉提示' },
};

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `  ${detail}`}`);
  if (!ok) failures += 1;
};

const browser = await chromium.launch({ channel: 'chrome' });

/** Pixel equality of two PNG files, decoded by Chrome. */
const comparer = await browser.newPage();
async function samePixels(a, b) {
  return comparer.evaluate(
    async ([x, y]) => {
      const load = (b64) =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = `data:image/png;base64,${b64}`;
        });
      const [ia, ib] = await Promise.all([load(x), load(y)]);
      if (ia.width !== ib.width || ia.height !== ib.height) return { same: false, detail: `${ia.width}×${ia.height} vs ${ib.width}×${ib.height}` };
      const data = (img) => {
        const c = new OffscreenCanvas(img.width, img.height);
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, img.width, img.height).data;
      };
      const [da, db] = [data(ia), data(ib)];
      let diff = 0;
      let worst = 0;
      let box = null;
      for (let i = 0; i < da.length; i += 4) {
        if (da[i] !== db[i] || da[i + 1] !== db[i + 1] || da[i + 2] !== db[i + 2] || da[i + 3] !== db[i + 3]) {
          diff += 1;
          worst = Math.max(worst, ...[0, 1, 2, 3].map((k) => Math.abs(da[i + k] - db[i + k])));
          const p = i / 4;
          const px = p % ia.width;
          const py = Math.floor(p / ia.width);
          box = box ? [Math.min(box[0], px), Math.min(box[1], py), Math.max(box[2], px), Math.max(box[3], py)] : [px, py, px, py];
        }
      }
      // Chrome's raster is not bit-stable run to run: a handful of pixels one level apart (an
      // anti-aliased corner) come and go on identical pages. Counted as noise, and said so.
      const noise = diff > 0 && diff <= 16 && worst <= 1;
      return {
        same: diff === 0 || noise,
        noise,
        detail: diff ? `${diff} px differ by up to ${worst} in [${box.join(',')}]` : '',
      };
    },
    [readFileSync(a).toString('base64'), readFileSync(b).toString('base64')],
  );
}

/** A context with both fixtures saved, the interface in `ui`, and a stored theme (or none). */
async function newContext({ port = PORT, theme, ui = 'en', viewport = VIEWPORTS.mac, scale = 1, os = 'light' }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: scale, colorScheme: os, reducedMotion: 'reduce', acceptDownloads: true });
  // Still frames: no dev-server badge, no animation or caret caught mid-way.
  await context.addInitScript((css) => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = css;
      document.head.append(style);
    });
  }, STILL);
  await context.addInitScript(
    ([version, language, themeId, index, docs]) => {
      if (window.sessionStorage.getItem('seeded')) return;
      window.sessionStorage.setItem('seeded', '1');
      window.localStorage.clear();
      window.localStorage.setItem('econ-worksheet-last-seen-version', version);
      window.localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: language, paper: 'en' }));
      if (themeId) window.localStorage.setItem('econgen.settings.appearance', JSON.stringify({ v: 1, theme: themeId }));
      window.localStorage.setItem('econ-worksheet-index', index);
      for (const [key, body] of docs) window.localStorage.setItem(key, body);
      delete window.showSaveFilePicker;
    },
    [
      APP_VERSION,
      ui === 'zh' ? 'zh-HK' : 'en',
      theme ?? null,
      JSON.stringify(FIXTURES.map((f) => ({ id: f.id, title: f.title, updatedAt: f.updatedAt }))),
      FIXTURES.map((f) => [`econ-worksheet:${f.id}`, f.text]),
    ],
  );
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.goto(`http://localhost:${port}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  return { context, page };
}

async function openFixture(page, fixture) {
  await page.getByRole('button', { name: new RegExp(fixture.title) }).first().click();
  await page.locator('#print-root .paper.paper-shadow').first().waitFor({ timeout: 30_000 });
  // Quiet until the sheets stop moving (fonts, pictures, the paginator's passes).
  let last = '';
  for (let i = 0; i < 30; i += 1) {
    await page.waitForTimeout(400);
    const now = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#print-root .paper.paper-shadow'))
        .map((s) => `${s.offsetHeight}:${s.querySelectorAll('[data-question-id]').length}`)
        .join('|'),
    );
    if (now === last) break;
    last = now;
  }
}

const closeAll = async (page) => {
  for (let i = 0; i < 3; i += 1) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
  }
};

// ── paper ───────────────────────────────────────────────────────────────────────────────
async function paperPart() {
  for (const fixture of FIXTURES) {
    const dir = `${OUT}/paper/${fixture.name}`;
    mkdirSync(dir, { recursive: true });
    const record = {};
    for (const theme of THEMES) {
      const { context, page } = await newContext({ theme, viewport: { width: 1440, height: 2200 } });
      await openFixture(page, fixture);
      // Editing chrome on the page is the interface (themed, print-hidden): strip it as print does.
      // Scoped to #print-root: the measuring probe is data-print-hide too.
      await page.addStyleTag({ content: '#print-root [data-print-hide]{display:none !important}' });
      await page.mouse.move(2, 2);
      await page.waitForTimeout(400);
      const count = await page.locator('#print-root .paper.paper-shadow').count();
      const sheets = [];
      for (let i = 0; i < count; i += 1) {
        const clip = await page.locator('#print-root .paper.paper-shadow').nth(i).evaluate((el) => {
          el.scrollIntoView({ block: 'start' });
          // Inset 2px: the sheet's rounded corners show the desk (the canvas, themed) behind them.
          const r = el.getBoundingClientRect();
          return { x: r.x + 2, y: r.y + 2, width: r.width - 4, height: r.height - 4 };
        });
        await page.waitForTimeout(150);
        const path = `${dir}/${theme}-sheet${i + 1}.png`;
        await page.screenshot({ path, clip });
        sheets.push(path);
      }

      // The .docx, through the Export dialog as a teacher would.
      await page.getByRole('button', { name: WORDS.en.export }).first().click();
      const dialog = page.getByRole('dialog');
      await dialog.getByText('.docx', { exact: true }).click();
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 90_000 }),
        dialog.getByRole('button', { name: WORDS.en.exportDocx }).click(),
      ]);
      const docx = `${dir}/${theme}.docx`;
      await download.saveAs(docx);
      await closeAll(page);

      // The print PDF (the @media print path), rasterised.
      const pdf = `${dir}/${theme}.pdf`;
      await page.pdf({ path: pdf, format: 'A4', printBackground: true, preferCSSPageSize: true });
      spawnSync('pdftoppm', ['-r', '80', '-png', pdf, `${dir}/${theme}-print`]);
      const prints = readdirSync(dir)
        .filter((f) => f.startsWith(`${theme}-print`) && f.endsWith('.png'))
        .sort()
        .map((f) => `${dir}/${f}`);
      record[theme] = { sheets, docx, prints, errors: page.errors };
      await context.close();
    }

    const classic = record.light ?? record[THEMES[0]];
    const reference = record.light ? 'light' : THEMES[0];
    const docxEntries = async (path) => {
      const zip = await JSZip.loadAsync(readFileSync(path));
      const out = {};
      for (const name of Object.keys(zip.files).sort()) {
        if (zip.files[name].dir) continue;
        let body = await zip.file(name).async('string');
        // The only thing that may differ between two exports of one document: when.
        if (name === 'docProps/core.xml') body = body.replace(/<dcterms:(created|modified)[^>]*>[^<]*<\/dcterms:\1>/g, '');
        out[name] = body;
      }
      return out;
    };
    const reference_docx = await docxEntries(classic.docx);
    for (const theme of THEMES) {
      const r = record[theme];
      check(`[${fixture.name}] ${theme}: no page errors`, r.errors.length === 0, r.errors.join(' | '));
      if (theme === reference) {
        check(`[${fixture.name}] ${theme}: ${r.sheets.length} sheets, ${r.prints.length} printed pages`, r.sheets.length > 0 && r.prints.length > 0);
        continue;
      }
      check(`[${fixture.name}] ${theme}: as many sheets as ${reference}`, r.sheets.length === classic.sheets.length, `${r.sheets.length} vs ${classic.sheets.length}`);
      for (let i = 0; i < Math.min(r.sheets.length, classic.sheets.length); i += 1) {
        const { same, noise, detail } = await samePixels(r.sheets[i], classic.sheets[i]);
        check(`[${fixture.name}] ${theme}: sheet ${i + 1} pixel-identical to ${reference}${noise ? ` (raster noise: ${detail})` : ''}`, same, detail);
      }
      const entries = await docxEntries(r.docx);
      const differ = [...new Set([...Object.keys(entries), ...Object.keys(reference_docx)])].filter((k) => entries[k] !== reference_docx[k]);
      check(`[${fixture.name}] ${theme}: .docx identical to ${reference} (${Object.keys(entries).length} parts)`, differ.length === 0, differ.join(', '));
      check(`[${fixture.name}] ${theme}: as many printed pages as ${reference}`, r.prints.length === classic.prints.length, `${r.prints.length} vs ${classic.prints.length}`);
      for (let i = 0; i < Math.min(r.prints.length, classic.prints.length); i += 1) {
        const { same, noise, detail } = await samePixels(r.prints[i], classic.prints[i]);
        check(`[${fixture.name}] ${theme}: printed page ${i + 1} pixel-identical to ${reference}${noise ? ` (raster noise: ${detail})` : ''}`, same, detail);
      }
    }
  }
}

// ── screens shared by baseline and gallery ──────────────────────────────────────────────
/** Visible chrome text under AA against what it sits on, as `{ text, ratio, need, colours }`. */
const auditText = (page) =>
  page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const paint = (stack) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 1, 1);
      for (const [colour, alpha] of stack) {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = colour;
        ctx.fillRect(0, 0, 1, 1);
      }
      ctx.globalAlpha = 1;
      return Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3));
    };
    const alphaOf = (colour) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = colour;
      ctx.fillRect(0, 0, 1, 1);
      return ctx.getImageData(0, 0, 1, 1).data[3] / 255;
    };
    const lum = ([r, g, b]) => {
      const f = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ratio = (a, b) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    const out = [];
    const seen = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const text = node.textContent.trim();
      const el = node.parentElement;
      if (!text || !el || seen.has(el)) continue;
      seen.add(el);
      if (el.closest('.paper, [aria-hidden="true"], [disabled], [aria-disabled="true"], [inert], svg')) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
      // What is actually painted at the text: skip text covered by something else.
      const hit = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, r.left + Math.min(4, r.width / 2))), Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2)));
      if (!hit || !(el.contains(hit) || hit.contains(el))) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility !== 'visible') continue;
      let opacity = 1;
      const stack = [];
      let unknown = false;
      for (let a = el; a; a = a.parentElement) {
        const s = getComputedStyle(a);
        opacity *= Number(s.opacity);
        if (s.backgroundImage !== 'none') {
          unknown = true;
          break;
        }
        const alpha = alphaOf(s.backgroundColor);
        if (alpha > 0) stack.unshift([s.backgroundColor, 1]);
        if (alpha >= 1) break;
      }
      if (unknown || opacity < 0.4) continue;
      const back = paint(stack);
      const front = paint([...stack, [cs.color, opacity]]);
      const size = parseFloat(cs.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
      const need = large ? 3 : 4.5;
      const value = ratio(front, back);
      if (value < need) {
        const hex = (c) => `#${c.map((x) => x.toString(16).padStart(2, '0')).join('')}`;
        out.push({ text: text.slice(0, 40), ratio: Number(value.toFixed(2)), need, colours: `${hex(front)} on ${hex(back)}` });
      }
    }
    return out;
  });

/** Walks the screens, screenshotting each as `<prefix>-<screen>.png`; returns { screen: path }. */
async function screens(page, prefix, ui, { appearancePane = true, audit = false } = {}) {
  const w = WORDS[ui];
  const shots = {};
  const audits = {};
  const shot = async (name) => {
    await page.mouse.move(2, 2);
    await page.waitForTimeout(350);
    shots[name] = `${prefix}-${name}.png`;
    await page.screenshot({ path: shots[name] });
    if (audit) audits[name] = await auditText(page);
  };
  await shot('start');
  await openFixture(page, FIXTURES[0]);
  await page.waitForTimeout(600);
  // The "Click any text to type" hint comes and goes on a timer; put it away so every run agrees.
  const hint = page.getByRole('button', { name: w.dismissHint });
  if (await hint.count()) await hint.first().click().catch(() => {});
  await shot('editor');

  // A text being edited: the format bar over the page.
  const field = page.locator('#print-root [data-field-key^="blockText:"][data-field-side="en"]').first();
  if (await field.count()) {
    await field.scrollIntoViewIfNeeded();
    const box = await field.boundingBox();
    if (box) {
      await page.mouse.click(box.x + Math.min(30, box.width / 2), box.y + box.height / 2);
      await page.waitForTimeout(500);
      shots.editing = `${prefix}-editing.png`;
      await page.screenshot({ path: shots.editing });
      if (audit) audits.editing = await auditText(page);
    }
  }
  await closeAll(page);
  await page.mouse.click(5, Math.floor((page.viewportSize()?.height ?? 900) / 2));
  await closeAll(page);

  await page.keyboard.press('Control+k');
  await page.waitForTimeout(300);
  await shot('palette');
  await closeAll(page);

  await page.getByRole('button', { name: w.setup, exact: true }).first().click();
  await page.waitForTimeout(500);
  await shot('setup');
  await closeAll(page);

  await page.getByRole('button', { name: w.export }).first().click();
  await page.waitForTimeout(600);
  await shot('export');
  await closeAll(page);

  if (appearancePane) {
    await page.keyboard.press('Control+,');
    await page.waitForTimeout(400);
    await page.getByRole('dialog').getByRole('tab', { name: new RegExp(`^${w.appearance}`) }).first().click();
    await page.waitForTimeout(600);
    await shot('appearance');
    await closeAll(page);
  }
  return { shots, audits };
}

// ── baseline ────────────────────────────────────────────────────────────────────────────
async function baselinePart() {
  if (!BASE_PORT) {
    console.log('baseline: skipped (no --base-port)');
    return;
  }
  const dir = `${OUT}/baseline`;
  mkdirSync(dir, { recursive: true });
  const cases = [
    { label: 'Classic', theme: 'light', os: 'light' },
    { label: 'Dark', theme: 'dark', os: 'light' },
    { label: 'System, OS light', theme: undefined, os: 'light' },
    { label: 'System, OS dark', theme: undefined, os: 'dark' },
  ];
  for (const ui of ['en', 'zh']) {
    for (const c of cases) {
      const slug = `${c.label.replace(/[^a-z]+/gi, '-').toLowerCase()}-${ui}`;
      const runs = {};
      for (const [which, port] of [['now', PORT], ['before', BASE_PORT]]) {
        const { context, page } = await newContext({ port, theme: c.theme, ui, os: c.os });
        // The Appearance pane is new by design; everything else must be as it was.
        runs[which] = (await screens(page, `${dir}/${slug}-${which}`, ui, { appearancePane: false })).shots;
        await context.close();
      }
      for (const screen of Object.keys(runs.before)) {
        const { same, noise, detail } = await samePixels(runs.now[screen], runs.before[screen]);
        check(`[baseline ${ui}] ${c.label}: ${screen} pixel-identical to the build without themes${noise ? ` (raster noise: ${detail})` : ''}`, same, detail);
      }
    }
  }
}

// ── gallery ─────────────────────────────────────────────────────────────────────────────
async function galleryPart() {
  const dir = `${OUT}/gallery`;
  mkdirSync(dir, { recursive: true });
  const report = {};
  const key = (f) => `${f.text}|${f.colours.split(' on ')[1]}`;
  for (const ui of ['en', 'zh']) {
    for (const [vp, viewport] of Object.entries(VIEWPORTS)) {
      const classic = {};
      for (const theme of ['light', ...THEMES.filter((t) => t !== 'light')]) {
        const { context, page } = await newContext({ theme, ui, viewport });
        const { audits } = await screens(page, `${dir}/${theme}-${vp}-${ui}`, ui, { audit: true });
        check(`[gallery ${ui} ${vp}] ${theme}: no page errors`, page.errors.length === 0, page.errors.join(' | '));
        for (const [screen, found] of Object.entries(audits)) {
          if (theme === 'light') {
            classic[screen] = new Set(found.map((f) => f.text));
            continue;
          }
          // Classic's and Dark's own shortfalls are the default look (reported by
          // theme-contrast.mjs); every other theme must clear AA outright.
          const fresh = theme === 'dark' ? found.filter((f) => !classic[screen]?.has(f.text)) : found;
          (report[theme] ??= []).push(...fresh.map((f) => ({ ui, vp, screen, ...f })));
        }
        if (theme === 'light') report.light = Object.entries(audits).flatMap(([screen, found]) => found.map((f) => ({ ui, vp, screen, ...f })));
        await context.close();
      }
    }
  }
  writeFileSync(`${OUT}/gallery-audit.json`, JSON.stringify(report, null, 2));
  for (const theme of THEMES) {
    const found = report[theme] ?? [];
    const unique = [...new Map(found.map((f) => [key(f), f])).values()];
    if (theme === 'light') {
      console.log(`info  [gallery] Classic: ${unique.length} labels under AA in the default look (see gallery-audit.json)`);
      continue;
    }
    check(
      theme === 'dark' ? `[gallery] dark: no label falls under AA that Classic draws legibly` : `[gallery] ${theme}: every visible label clears WCAG AA`,
      unique.length === 0,
      unique.slice(0, 8).map((f) => `"${f.text}" ${f.ratio}:1 ${f.colours} (${f.screen} ${f.ui})`).join('; '),
    );
  }
}

// ── showcase: each theme at MacBook size and 2× density, for people to look at ─────────
async function showcasePart() {
  for (const theme of THEMES) {
    const dir = `${OUT}/showcase/${theme}`;
    mkdirSync(dir, { recursive: true });
    for (const ui of ['en', 'zh']) {
      const { context, page } = await newContext({ theme, ui, scale: 2 });
      await screens(page, `${dir}/${ui}`, ui);
      check(`[showcase ${ui}] ${theme}: no page errors`, page.errors.length === 0, page.errors.join(' | '));
      await context.close();
    }
  }
}

if (PARTS.includes('paper')) await paperPart();
if (PARTS.includes('baseline')) await baselinePart();
if (PARTS.includes('gallery')) await galleryPart();
if (PARTS.includes('showcase')) await showcasePart();
await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
if (existsSync(OUT)) console.log(`output: ${OUT}`);
process.exit(failures ? 1 : 0);
