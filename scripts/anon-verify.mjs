import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import JSZip from 'jszip';
import { chromium } from 'playwright-core';

/**
 * The anonymised copy lays out as its original does (k-0180), checked in a real Chrome.
 *
 * For each document `scripts/anon-fixtures.test.ts` writes, in each language:
 *   1. open the original in the editor (Teacher copy) and measure its sheets: which
 *      question starts where, on which sheet;
 *   2. Send feedback → Attach an anonymised copy: measure the preview's sheets the same way
 *      (a document with empty sides in the shown language only gets a note: `hasEmptySides`);
 *   3. Save this copy (the download), reopen that file in the editor, measure it again;
 *   4. export both as `.docx` through the Export dialog and compare `word/document.xml`
 *      with every text replaced by its length: the same paragraphs, runs, lengths and page
 *      breaks;
 *   5. search the saved file for the original's words and picture bytes.
 * Prints a table and exits non-zero on any difference.
 *
 *   node scripts/anon-verify.mjs [--out=/tmp/anon-verify] [--url=http://localhost:3000]
 *                                [--only=<doc name substring>] [--languages=en,bilingual]
 *                                [--reference=real_life_reference]
 *
 * Starts `npm run dev` itself when the URL is not serving. Needs Chrome (`channel: 'chrome'`).
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const OUT = opt('out', process.env.ANON_DIR ?? '/tmp/anon-verify');
const URL_BASE = opt('url', 'http://localhost:3000');
const ONLY = opt('only', '');
const LANGUAGES = opt('languages', 'en,bilingual').split(',');
const APP_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

// The toolbar's language radios and the Export dialog's language titles.
const LANGUAGE_RADIO = { en: 'EN', zh: '中文', bilingual: 'EN+中' };
const LANGUAGE_TITLE = { en: 'English only', zh: '中文 only', bilingual: 'Bilingual' };

const res = spawnSync('npx', ['vitest', 'run', 'scripts/anon-fixtures.test.ts'], {
  stdio: 'inherit',
  env: { ...process.env, ANON_DIR: OUT, ANON_REFERENCE: opt('reference', 'real_life_reference') },
});
if (res.status !== 0) process.exit(res.status ?? 1);
const DOCS = `${OUT}/docs`;
const names = JSON.parse(readFileSync(`${DOCS}/list.json`, 'utf8')).filter((name) => name.includes(ONLY));

const reachable = await fetch(URL_BASE).then((r) => r.ok).catch(() => false);
let devServer;
if (!reachable) {
  console.log(`dev server not running at ${URL_BASE}, starting one`);
  devServer = spawn('npm', ['run', 'dev'], { stdio: 'ignore' });
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline && !(await fetch(URL_BASE).then((r) => r.ok).catch(() => false))) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

/** Every sheet under `root`: each question's id and its top, in CSS px at print size. */
const measure = (page, root) =>
  page.evaluate((selector) => {
    // The visible stack only: a measuring Preview also holds hidden probe sheets.
    const sheets = Array.from(document.querySelector(selector)?.querySelectorAll('[data-sheet-stack] .paper') ?? []);
    return sheets.map((sheet) => {
      const box = sheet.getBoundingClientRect();
      const scale = box.width / sheet.offsetWidth;
      const seen = new Set();
      const out = [];
      for (const el of sheet.querySelectorAll('[data-question-id]')) {
        const id = el.getAttribute('data-question-id');
        if (seen.has(id)) continue;
        seen.add(id);
        out.push({ id, top: Math.round((el.getBoundingClientRect().top - box.top) / scale) });
      }
      return out;
    });
  }, root);

/** Quiet until two measurements a beat apart agree (fonts, pictures, the paginator's passes). */
async function settled(page, root) {
  let last = '';
  for (let i = 0; i < 30; i += 1) {
    await page.waitForTimeout(500);
    const now = JSON.stringify(await measure(page, root));
    if (now === last && now !== '[]') return JSON.parse(now);
    last = now;
  }
  return JSON.parse(last || '[]');
}

/** Page starts: the first question on each sheet. Positions: every question's top. */
function compare(a, b, slack = 2) {
  const problems = [];
  if (a.length !== b.length) problems.push(`${a.length} sheets vs ${b.length}`);
  for (let s = 0; s < Math.min(a.length, b.length); s += 1) {
    const ids = (sheet) => sheet.map((q) => q.id).join(',');
    if (ids(a[s]) !== ids(b[s])) {
      problems.push(`sheet ${s + 1}: [${ids(a[s])}] vs [${ids(b[s])}]`);
      continue;
    }
    for (let q = 0; q < a[s].length; q += 1) {
      const drift = Math.abs(a[s][q].top - b[s][q].top);
      if (drift > slack) problems.push(`sheet ${s + 1} ${a[s][q].id}: top ${a[s][q].top} vs ${b[s][q].top}`);
    }
  }
  return problems;
}

async function openDocument(browser, json, title, language) {
  const worksheet = JSON.parse(json);
  const context = await browser.newContext({ viewport: { width: 1512, height: 1100 }, acceptDownloads: true });
  await context.addInitScript(
    ([indexJson, key, body, version]) => {
      if (window.sessionStorage.getItem('seeded')) return;
      window.sessionStorage.setItem('seeded', '1');
      window.localStorage.setItem('econ-worksheet-index', indexJson);
      window.localStorage.setItem(key, body);
      window.localStorage.setItem('econ-worksheet-last-seen-version', version);
      // A save picker would wait for a person; the download is the same text.
      delete window.showSaveFilePicker;
    },
    [
      JSON.stringify([{ id: worksheet.id, title, updatedAt: worksheet.updatedAt }]),
      `econ-worksheet:${worksheet.id}`,
      json,
      APP_VERSION,
    ],
  );
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log(`PAGE ERR (${title}):`, e.message));
  await page.goto(URL_BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: new RegExp(title) }).first().click();
  await page.locator('#print-root .paper').first().waitFor({ timeout: 30_000 });
  await page.getByRole('radio', { name: LANGUAGE_RADIO[language], exact: true }).first().click();
  await page.getByRole('radio', { name: 'Teacher', exact: true }).first().click();
  return { context, page };
}

async function exportDocx(page, language, path) {
  await page.getByRole('button', { name: /Export…/ }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByText('.docx', { exact: true }).click();
  await dialog.getByRole('radiogroup', { name: 'What to export' }).getByRole('radio', { name: 'Question paper', exact: true }).click();
  await dialog.getByRole('radiogroup', { name: 'Language' }).getByTitle(LANGUAGE_TITLE[language], { exact: true }).click();
  await dialog
    .getByRole('radiogroup', { name: 'Student or teacher copy' })
    .getByRole('radio', { name: 'Teacher', exact: true })
    .click();
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 90_000 }),
    dialog.getByRole('button', { name: /^Export \.docx/ }).click(),
  ]);
  await download.saveAs(path);
  await page.keyboard.press('Escape');
  return readFileSync(path);
}

const decode = (text) =>
  text.replace(/&(amp|lt|gt|quot|apos);/g, (_, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[e]);

/** `word/document.xml` with each text replaced by its length and picture ids blanked. */
async function docxShape(bytes) {
  const xml = await (await JSZip.loadAsync(bytes)).file('word/document.xml').async('string');
  return {
    breaks: (xml.match(/<w:br w:type="page"\/>/g) ?? []).length,
    shape: xml
      .replace(/(<w:t(?: [^>]*)?>)([^<]*)(<\/w:t>)/g, (_, open, text, close) => `${open}${Array.from(decode(text)).length}${close}`)
      .replace(/r:embed="[^"]*"/g, 'r:embed=""')
      .replace(/ (?:name|descr|title)="[^"]*"/g, ''),
  };
}

/** Every string under `text` or `tags` keys: the wording a document carries. */
function wording(document) {
  const out = [];
  const walk = (value, key) => {
    if (typeof value === 'string') {
      if (key === 'text' || key === 'tags') out.push(value);
    } else if (Array.isArray(value)) value.forEach((item) => walk(item, key));
    else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) walk(v, k);
  };
  walk(document);
  return out;
}

/**
 * The original's words or picture bytes found anywhere in the copy. Words of seven letters
 * or more and runs of three Chinese characters or more: shorter ones turn up in random
 * text by chance (the unit test checks every word where it stood).
 */
function leaks(original, saved) {
  const words = new Set(wording(original).flatMap((text) => text.match(/[A-Za-z]{7,}|[\u4e00-\u9fff]{3,}/g) ?? []));
  const copied = wording(JSON.parse(saved)).join('\n');
  const images = (JSON.stringify(original).match(/data:image\/[^"]{90,}/g) ?? []).map((src) => src.slice(30, 90));
  return [...[...words].filter((word) => copied.includes(word)), ...images.filter((bytes) => saved.includes(bytes))];
}

/**
 * A text the shown language leaves empty while the other side has words. The editor draws
 * an "Add English" prompt there, which takes lines; the measure-only page (the preview, and
 * the measurement the `.docx` breaks its pages by) draws nothing. Such a document's preview
 * is compared with the saved file's, not with the editor.
 */
function hasEmptySides(document, language) {
  if (language === 'bilingual') return false;
  const other = language === 'en' ? 'zh' : 'en';
  const text = (runs) => (Array.isArray(runs) ? runs.map((run) => run?.text ?? '').join('') : '');
  let found = false;
  const walk = (value) => {
    if (found || !value || typeof value !== 'object') return;
    if (Array.isArray(value)) return value.forEach(walk);
    if (Array.isArray(value.en) && Array.isArray(value.zh) && !text(value[language]).trim() && text(value[other]).trim()) {
      found = true;
      return;
    }
    Object.values(value).forEach(walk);
  };
  walk(document.questions);
  return found;
}

const browser = await chromium.launch({ channel: 'chrome' });
const rows = [];
let failed = false;
try {
  for (const name of names) {
    for (const language of LANGUAGES) {
      const label = `${name} (${language})`;
      const json = readFileSync(`${DOCS}/${name}.worksheet.json`, 'utf8');
      const dir = `${OUT}/${name}-${language}`;
      mkdirSync(dir, { recursive: true });
      const problems = [];
      try {
        // 1–2. The original, then its copy's preview.
        const original = await openDocument(browser, json, `Anon ${name}`, language);
        const before = await settled(original.page, '#print-root');
        const originalDocx = await docxShape(await exportDocx(original.page, language, `${dir}/original.docx`));
        await original.page.getByRole('button', { name: 'File and export options' }).click();
        await original.page.getByRole('menuitem', { name: /Send feedback/ }).click();
        await original.page.getByRole('button', { name: /Attach an anonymised copy/ }).click();
        await original.page.locator('[data-anonymised-preview] .paper').first().waitFor({ timeout: 60_000 });
        const preview = await settled(original.page, '[data-anonymised-preview]');
        await original.page.screenshot({ path: `${dir}/preview.png` });

        // 3. The saved file, reopened.
        const [download] = await Promise.all([
          original.page.waitForEvent('download', { timeout: 60_000 }),
          original.page.getByRole('button', { name: 'Save this copy', exact: true }).click(),
        ]);
        await download.saveAs(`${dir}/${download.suggestedFilename()}`);
        const saved = readFileSync(`${dir}/${download.suggestedFilename()}`, 'utf8');
        await original.context.close();
        const copy = await openDocument(browser, saved, 'report-', language);
        const after = await settled(copy.page, '#print-root');
        const copyDocx = await docxShape(await exportDocx(copy.page, language, `${dir}/anonymised.docx`));
        await copy.context.close();

        const notes = [];
        if (hasEmptySides(JSON.parse(json), language)) {
          const differs = compare(before, preview).length > 0;
          if (differs) notes.push('empty sides: the editor draws prompts the measured page (preview, .docx) does not');
        } else {
          problems.push(...compare(before, preview).map((p) => `preview: ${p}`));
        }
        problems.push(...compare(before, after).map((p) => `saved: ${p}`));
        if (originalDocx.breaks !== copyDocx.breaks) problems.push(`docx page breaks ${originalDocx.breaks} vs ${copyDocx.breaks}`);
        if (originalDocx.shape !== copyDocx.shape) {
          writeFileSync(`${dir}/original.xml`, originalDocx.shape);
          writeFileSync(`${dir}/anonymised.xml`, copyDocx.shape);
          problems.push('docx document.xml differs beyond its text (see original.xml / anonymised.xml)');
        }
        const leaked = leaks(JSON.parse(json), saved);
        if (leaked.length) problems.push(`leaked: ${leaked.slice(0, 8).join(', ')}`);
        rows.push({ label, sheets: before.length, questions: before.flat().length, breaks: originalDocx.breaks, problems, notes });
      } catch (error) {
        rows.push({ label, problems: [`harness: ${error.message.split('\n')[0]}`] });
      }
    }
  }
} finally {
  await browser.close();
  devServer?.kill();
}

for (const row of rows) {
  const ok = row.problems.length === 0;
  if (!ok) failed = true;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${row.label.padEnd(32)} ${row.sheets ?? '-'} sheets, ${row.questions ?? '-'} questions, ${row.breaks ?? '-'} docx breaks`,
  );
  for (const problem of row.problems.slice(0, 12)) console.log(`        ${problem}`);
  for (const note of row.notes ?? []) console.log(`        note: ${note}`);
}
process.exit(failed ? 1 : 0);
