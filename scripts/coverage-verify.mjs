import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright-core';
import { MOCK_MODEL, startMockServer } from './ai-mock-server.mjs';

/**
 * Check syllabus coverage in a browser (k-0317). Serves the built `out/`, points the
 * Custom provider at the canned mock (`ai-mock-server.mjs` → `coverageReply`), opens a
 * paper of MC and structured questions (one on monopoly: the Elective Part), runs the verb,
 * and checks the report dialog, the bar's Open report, the temporary files (none left in
 * OPFS after the run) and that the document was not changed. Screenshots per width and
 * language land in --out.
 *
 *   npm run build && node scripts/coverage-verify.mjs [--out=/tmp/coverage-verify] [--engines=chromium,webkit]
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const OUT = opt('out', '/tmp/coverage-verify');
const ENGINES = opt('engines', 'chromium,webkit').split(',');
const MOCK_PORT = Number(opt('port', '8797'));
const APP_PORT = Number(opt('app-port', '3427'));
const MOCK_ORIGIN = `http://localhost:${MOCK_PORT}`;
const APP = `http://localhost:${APP_PORT}`;
const ROOT = fileURLToPath(new URL('..', import.meta.url));
mkdirSync(OUT, { recursive: true });
if (!existsSync(join(ROOT, 'out/index.html'))) {
  console.error('out/ is missing: run `npm run build` first.');
  process.exit(1);
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
function startStaticServer(port) {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, APP).pathname);
    const base = join(ROOT, 'out', path);
    const file = [base, `${base}.html`, join(base, 'index.html')].find((p) => p.startsWith(join(ROOT, 'out')) && existsSync(p) && statSync(p).isFile());
    if (!file) return res.writeHead(404).end('not found');
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

// ---- the fixture: the frozen corpus (copied, never written) plus MC questions ----

const corpus = JSON.parse(readFileSync(join(ROOT, 'src/test/corpus/v1-published.json'), 'utf8'));
const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
const runs = (en, zh = '') => ({ en: en ? [{ text: en }] : [], zh: zh ? [{ text: zh }] : [] });
let n = 0;
const mcq = (en, zh, options) => {
  n += 1;
  return {
    id: `cvq${n}`, type: 'mcq', marks: 1, answerIndex: 0,
    blocks: [{ kind: 'paragraph', id: `cvq${n}p`, text: runs(en, zh) }],
    options: options.map((o, i) => ({ id: `cvq${n}o${i}`, text: runs(o) })),
  };
};
const doc = structuredClone(corpus);
doc.id = 'coverage-verify';
doc.title = runs('Coverage verify', '覆蓋測試');
const extra = [
  mcq('A rise in income will increase the demand for a normal good.', '收入上升會增加正常物品的需求。', ['True', 'False', 'Unclear', 'None']),
  mcq('If demand is price elastic, a fall in price raises total revenue.', '若需求富彈性，減價會增加總收益。', ['Yes', 'No', 'Maybe', 'Never']),
  mcq('Which is a function of money?', '下列哪項是貨幣的功能？', ['Medium of exchange', 'Store of goods', 'Barter', 'Tax']),
  mcq('Hong Kong gains from trade through comparative advantage.', '香港透過比較優勢從貿易中得益。', ['A', 'B', 'C', 'D']),
  mcq('A monopolist sets a single price for its product.', '壟斷者為其產品定一個價格。', ['A', 'B', 'C', 'D']),
  mcq('GDP measures the value of final goods produced.', '本地生產總值量度最終物品的價值。', ['A', 'B', 'C', 'D']),
];
doc.questions = [...extra, ...doc.questions];
doc.flow = [...extra.map((q) => ({ type: 'question', id: q.id })), ...doc.flow];
const TITLE = 'Coverage verify';

// k-0489: a Chinese-only paper, and two papers linked as one set.
n = 100;
const zhOnly = [
  mcq('', '收入上升會增加正常物品的需求。', ['正確', '錯誤', '不清楚', '皆非']),
  mcq('', '若需求富彈性，減價會增加總收益。', ['是', '否', '或許', '從不']),
  mcq('', '下列哪項是貨幣的功能？', ['交換媒介', '儲存物品', '以物易物', '稅項']),
  mcq('', '香港透過比較優勢從貿易中得益。', ['甲', '乙', '丙', '丁']),
];
const docZh = { ...structuredClone(doc), id: 'coverage-verify-zh', title: runs('', '覆蓋測試中文卷'), questions: zhOnly, flow: zhOnly.map((q) => ({ type: 'question', id: q.id })) };
delete docZh.cover;
const TITLE_ZH = '覆蓋測試中文卷';
const SET = { id: 'set-coverage-verify', name: 'Verify Mock 2026' };
const setA = { ...structuredClone(doc), id: 'coverage-verify-set-a', title: runs('Verify Mock Paper 1'), paperSet: SET };
const setB = { ...structuredClone(corpus), id: 'coverage-verify-set-b', title: runs('Verify Mock Paper 2'), paperSet: SET };
const row = (d, title) => ({ id: d.id, title, updatedAt: d.updatedAt, questionCount: d.questions.length, ...(d.paperSet ? { set: d.paperSet } : {}) });

// ---- the run ----

const results = [];
async function check(engine, name, fn) {
  try {
    const detail = await fn();
    results.push({ ok: true });
    console.log(`  ok   ${engine} ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (e) {
    results.push({ ok: false });
    console.log(`  FAIL ${engine} ${name} — ${e.message.split('\n')[0]}`);
  }
}
const expect = (cond, message) => {
  if (!cond) throw new Error(message);
};

async function newPage(browser, { width = 1280, height = 800, ui = 'en', touch = false, docs = [[doc, TITLE]], open = TITLE } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch && width < 500 });
  const ai = { v: 1, provider: 'custom', models: { custom: MOCK_MODEL }, baseUrls: { custom: `${MOCK_ORIGIN}/v1` } };
  await context.addInitScript(
    ([index, bodies, version, settings, lang]) => {
      localStorage.setItem('econ-worksheet-index', index);
      for (const [id, body] of bodies) localStorage.setItem(`econ-worksheet:${id}`, body);
      localStorage.setItem('econ-worksheet-last-seen-version', version);
      localStorage.setItem('econgen.settings.ai', settings);
      sessionStorage.setItem('econgen.secret.ai:custom', 'sk-mock-verify-0000');
      if (lang !== 'en') localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: lang, paper: 'en' }));
    },
    [JSON.stringify(docs.map(([d, title]) => row(d, title))), docs.map(([d]) => [d.id, JSON.stringify(d)]), VERSION, JSON.stringify(ai), ui],
  );
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log(`  PAGE ERR: ${e.message}`));
  await page.goto(APP, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: new RegExp(open) }).first().click();
  await page.waitForSelector('#print-root .paper', { timeout: 15_000 });
  await page.waitForTimeout(600);
  return { context, page };
}

const stored = (page) => page.evaluate((id) => localStorage.getItem(`econ-worksheet:${id}`), doc.id);
const opfsLeft = (page) =>
  page.evaluate(async () => {
    if (!navigator.storage?.getDirectory) return 'no-opfs';
    const root = await navigator.storage.getDirectory();
    const probe = await root.getFileHandle('.verify-probe', { create: true });
    const writable = typeof probe.createWritable === 'function';
    await root.removeEntry('.verify-probe');
    if (!writable) return 'memory';
    try {
      const job = await (await root.getDirectoryHandle('scratch')).getDirectoryHandle('coverage');
      const names = [];
      for await (const name of job.keys()) names.push(name);
      return names.length;
    } catch {
      return 'never-created';
    }
  });

async function runCoverage(page, verb = 'check.syllabus') {
  await page.locator('[data-ai-door]').click();
  const menu = page.getByRole('dialog', { name: /AI/ });
  await menu.waitFor({ timeout: 3000 });
  await menu.locator(`[data-verb="${verb}"]`).click();
  await page.getByRole('dialog', { name: /Syllabus coverage|課程覆蓋/ }).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(500);
}

/**
 * Download report (PDF) on the web: the print job's sheets are captured as `window.print`
 * is called (the browser's print sheet cannot be driven), then, in Chromium, written to a
 * real PDF with print media, as "Save as PDF" would. The page is given back after.
 */
async function downloadReport(page, engineName, name) {
  await page.evaluate(() => {
    window.__printed = null;
    window.print = () => {
      const root = document.querySelector('[data-print-job] #print-root');
      window.__printed = { sheets: root ? root.querySelectorAll('[data-page-index] > .paper').length : 0, text: root?.innerText ?? '' };
    };
  });
  await page.getByRole('button', { name: /Download report \(PDF\)|下載報告（PDF）/ }).click();
  await page.waitForFunction(() => window.__printed, null, { timeout: 30_000 });
  const printed = await page.evaluate(() => window.__printed);
  await page.screenshot({ path: `${OUT}/${engineName}-${name}-print-job.png` });
  let pdfPages;
  if (engineName === 'chromium') {
    await page.emulateMedia({ media: 'print' });
    const pdf = await page.pdf({ path: `${OUT}/${name}.pdf`, preferCSSPageSize: true, printBackground: true });
    await page.emulateMedia({ media: 'screen' });
    pdfPages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  }
  await page.mouse.click(5, 5);
  await page.waitForTimeout(300);
  return { ...printed, pdfPages };
}

const mock = await startMockServer(MOCK_PORT);
const app = await startStaticServer(APP_PORT);
for (const engineName of ENGINES) {
  const engine = engineName === 'webkit' ? webkit : chromium;
  const browser = await engine.launch(engineName === 'chromium' ? { channel: 'chrome' } : {});
  try {
    await check(engineName, 'run → report, nothing saved, no temporary files left', async () => {
      const { context, page } = await newPage(browser);
      const before = await stored(page);
      await runCoverage(page);
      const dialog = page.getByRole('dialog', { name: 'Syllabus coverage' });
      const text = await dialog.innerText();
      expect(/Key points tested/.test(text), 'no key-point tile');
      expect(/of 51/.test(text), `elective not counted: ${text.slice(0, 300)}`);
      expect(/Counted with the Compulsory Part: Elective Part 1/.test(text), 'elective line missing');
      expect(/not tested/.test(text), 'no gaps shown');
      await page.screenshot({ path: `${OUT}/${engineName}-1280-en.png` });
      await dialog.getByText('By question').click();
      await page.waitForTimeout(200);
      await page.screenshot({ path: `${OUT}/${engineName}-1280-en-by-question.png` });
      const left = await opfsLeft(page);
      expect(left === 0 || left === 'no-opfs' || left === 'memory', `temporary folders left: ${left}`);
      await page.getByRole('button', { name: 'Close', exact: true }).last().click();
      await page.waitForTimeout(300);
      const bar = page.getByRole('status', { name: 'AI' });
      expect(/Syllabus coverage: \d+ of 51 key points/.test(await bar.innerText()), 'bar summary');
      await bar.getByRole('button', { name: 'Open report' }).click();
      await page.getByRole('dialog', { name: 'Syllabus coverage' }).waitFor();
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      await bar.getByRole('button', { name: 'Done' }).click();
      const after = await stored(page);
      expect(before === after, 'the document changed');
      await context.close();
      return left === 0 ? 'files were in OPFS, folder emptied' : `no writable OPFS here: ${left}`;
    });
    await check(engineName, 'k-0489: an English paper in a 中文 app reads English; Download report (PDF)', async () => {
      const { context, page } = await newPage(browser, { ui: 'zh-HK' });
      await runCoverage(page);
      const dialog = page.getByRole('dialog', { name: /課程覆蓋/ });
      const text = await dialog.innerText();
      expect(text.includes('Basic Economic Concepts') && !text.includes('基本經濟概念'), 'topic names not in the paper language (English)');
      expect(text.includes('課程名稱及 AI 的說明使用試卷的語言（英文）'), 'no language note');
      const printed = await downloadReport(page, engineName, 'report-en');
      expect(printed.sheets >= 2, `sheets: ${printed.sheets}`);
      expect(/Syllabus coverage report/.test(printed.text) && /Coverage verify/.test(printed.text), 'title missing on the sheets');
      expect(/Gaps: key points not tested/.test(printed.text) && /Which questions cover what/.test(printed.text), 'sections missing');
      expect(/Page 1 of \d+/.test(printed.text), 'page numbers missing');
      expect(!/[一-鿿]{3,}/.test(printed.text.replace(/Coverage verify/g, '')), 'Chinese on an English report');
      if (printed.pdfPages !== undefined) expect(printed.pdfPages === printed.sheets, `PDF pages ${printed.pdfPages} ≠ sheets ${printed.sheets}`);
      expect(await page.locator('[data-print-job]').count() === 0, 'the page was not given back');
      await context.close();
      return `${printed.sheets} sheets${printed.pdfPages !== undefined ? `, PDF ${printed.pdfPages} pages` : ''}`;
    });

    await check(engineName, 'k-0489: a Chinese paper in an English app reads Chinese, and so does its PDF', async () => {
      const { context, page } = await newPage(browser, { docs: [[docZh, TITLE_ZH]], open: TITLE_ZH });
      await runCoverage(page);
      const dialog = page.getByRole('dialog', { name: 'Syllabus coverage' });
      const text = await dialog.innerText();
      expect(text.includes('基本經濟概念') && !text.includes('Basic Economic Concepts'), 'topic names not in Chinese');
      expect(text.includes('Key points tested'), 'chrome should stay English');
      expect(/are in Chinese, the paper’s language/.test(text), 'no language note');
      await page.screenshot({ path: `${OUT}/${engineName}-zh-paper-en-app.png` });
      const printed = await downloadReport(page, engineName, 'report-zh');
      expect(/課程覆蓋報告/.test(printed.text) && /覆蓋測試中文卷/.test(printed.text), 'Chinese title missing');
      expect(/缺口：未考核的學習要點/.test(printed.text) && /第 1 頁，共 \d+ 頁/.test(printed.text), 'Chinese sections missing');
      expect(!/Syllabus coverage report|Key points tested/.test(printed.text), 'English on a Chinese report');
      await context.close();
      return `${printed.sheets} sheets`;
    });

    await check(engineName, 'k-0489: Check coverage for the whole set → one report, per paper, PDF', async () => {
      const { context, page } = await newPage(browser, { docs: [[setA, 'Verify Mock Paper 1'], [setB, 'Verify Mock Paper 2']], open: 'Verify Mock Paper 1' });
      await page.getByText(SET.name).first().waitFor({ timeout: 10_000 });
      await page.waitForTimeout(800);
      await runCoverage(page, 'check.syllabus.set');
      const dialog = page.getByRole('dialog', { name: 'Syllabus coverage' });
      const text = await dialog.innerText();
      expect(/Whole set/.test(text) && /Paper 1/.test(text) && /Paper 2/.test(text), 'no set / paper switch');
      expect(/P1 Q\d/.test(text) && /P2 Q\d/.test(text), 'places do not name their paper');
      await page.screenshot({ path: `${OUT}/${engineName}-set.png` });
      await dialog.getByRole('radio', { name: 'Paper 2' }).click().catch(() => dialog.getByText('Paper 2', { exact: true }).first().click());
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT}/${engineName}-set-paper2.png` });
      const bar = page.getByRole('status', { name: 'AI' });
      expect(/Whole set: \d+ of 5[01] key points/.test(await bar.innerText()), 'bar summary');
      const printed = await downloadReport(page, engineName, 'report-set');
      expect(/Verify Mock 2026/.test(printed.text) && /By paper/.test(printed.text) && /Whole set: Paper 1, Paper 2/.test(printed.text), 'set report incomplete');
      await context.close();
      return `${printed.sheets} sheets`;
    });

    for (const [width, height, ui, touch] of [[1180, 820, 'zh-HK', true], [820, 1180, 'en', true], [390, 844, 'zh-HK', true]]) {
      await check(engineName, `report at ${width} (${ui})`, async () => {
        const { context, page } = await newPage(browser, { width, height, ui, touch });
        await runCoverage(page);
        const dialog = page.getByRole('dialog', { name: /Syllabus coverage|課程覆蓋/ });
        const box = await dialog.boundingBox();
        expect(box && box.width <= width + 1, `dialog wider than the window: ${box?.width}`);
        await page.screenshot({ path: `${OUT}/${engineName}-${width}-${ui}.png` });
        await context.close();
      });
    }
  } finally {
    await browser.close();
  }
}
mock.close();
app.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} passed; screenshots in ${OUT}`);
process.exit(failed ? 1 : 0);
