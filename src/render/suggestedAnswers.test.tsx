import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildAnswerKeyDocxParts } from '@/export/docx';
import { answerKeyFileName } from '@/export/docx/fileNames';
import { answerKeyClipboardHtml, answerKeyPlainText } from '@/export/clipboard';
import { ANSWER_KEY_FIXED, type AnswerKeySetting } from '@/model/answerKeyLayout';
import { bi, plain } from '@/model/text';
import type { AnswerKeyLayout, LanguageMode, McKeyLayout, Worksheet } from '@/model/types';
import { AnswerKeyPreview } from '@/components/preview/AnswerKeyPreview';
import { buildLeakWorksheet, LEAK_SENTINELS } from '@/test/suggestedAnswersFixture';
import { buildMarkSchemeWorksheet } from '@/test/markSchemeFixture';
import { buildAnswerLayerWorksheet } from '@/test/answerLayerFixture';
import { createAnswerDiagram } from '@/model/factories';
import { ANSWER_KEY_WORDING, answerKeyTitle, answerKeyView, KEY_LAYOUT_WORDING, renderAnswerKey, renderCombinedAnswerKey } from './answerKey';
import { MARK_SCHEME_WORDING } from './markScheme';
import type { ColumnsNode, RenderNode, TextNode } from './ir';

/*
 * Suggested answers 參考答案 is handed to students. Nothing a marker alone reads may reach
 * it: the marking notation, levels, EC, the legend and disclaimer, the Marks head, the
 * version map, source notes, a second OR route, and option reasons unless switched on.
 * Proved over every allowed switch combination, in the IR and in what every backend
 * writes: every `.docx` part, the clipboard's HTML and text, and the preview's DOM.
 */

const LANGUAGES: LanguageMode[] = ['en', 'zh', 'bilingual'];
const MC_LAYOUTS: McKeyLayout[] = ['grid', 'hkeaaTable', 'list', 'rationaleTable'];
/** The switches Suggested answers leaves to the teacher. */
const OPEN: AnswerKeySetting[] = (
  [
    'showStems',
    'showMcStems',
    'showExplanations',
    'showRationales',
    'showPartMarks',
    'schemeAsPoints',
    'questionTotals',
    'sectionTotals',
    'paperTotal',
  ] as AnswerKeySetting[]
).filter((key) => !ANSWER_KEY_FIXED.suggested.includes(key));
/** Stored values for what the preset fixes: a hand-edited or stale file. Always ignored. */
const HOSTILE = { lqLayout: 'marksColumn', showLegend: true, showDisclaimer: true, showSources: true } as const;

/** Every combination of the open switches, each MC layout, with and without a subtitle. */
function combinations(): AnswerKeyLayout[] {
  const out: AnswerKeyLayout[] = [];
  for (let mask = 0; mask < 1 << OPEN.length; mask += 1) {
    for (const mcLayout of MC_LAYOUTS) {
      const switches = Object.fromEntries(OPEN.map((key, bit) => [key, Boolean(mask & (1 << bit))]));
      out.push({
        preset: 'suggested',
        mcLayout,
        ...switches,
        ...HOSTILE,
        ...(mask % 2 === 0 ? { subtitle: bi('SUBTITLE-OK', '副題') } : {}),
      } as AnswerKeyLayout);
    }
  }
  return out;
}

const sides = (pair: { en: { text: string }[]; zh: { text: string }[] }) => [plain(pair.en), plain(pair.zh)];

/** Marker-only text, as plain strings; `withReasons` = option reasons switched on. */
function forbiddenStrings(withReasons: boolean): string[] {
  const w = MARK_SCHEME_WORDING;
  return [
    ...Object.values(LEAK_SENTINELS).flat(),
    ...(withReasons ? [] : ['RATIONALE-OPTION', '選項分析']),
    ...[w.any(2), w.each, w.firstOnly(2), w.at(1), w.max(2), w.max(1), w.levels, w.ec].flatMap(sides),
    'Level 1:',
    '第1級：',
    ...[KEY_LAYOUT_WORDING.disclaimer, KEY_LAYOUT_WORDING.legendHeading, KEY_LAYOUT_WORDING.orRoute].flatMap(sides),
    ...KEY_LAYOUT_WORDING.legend.flatMap((entry) => sides(entry.meaning)),
    ...[ANSWER_KEY_WORDING.versionMap, ANSWER_KEY_WORDING.versionMapHint].flatMap((t) => [t.en, t.zh]),
    'Source:',
    '出處',
    '分數',
  ];
}

/** Marker notation as patterns: `n@`, `max`, the OR word and its 或, the Marks head. */
const FORBIDDEN_PATTERNS = [/\d\s*@/, /\bmax\b/i, /最高\d+分/, /\bOR\b/, /或/, /\bMarks\b/];

const FORBIDDEN = { true: forbiddenStrings(true), false: forbiddenStrings(false) };
const SENTINELS: string[] = Object.values(LEAK_SENTINELS).flat();
/** Texts already proven clean, per reasons switch: many combinations write identical parts. */
const PROVEN = { true: new Set<string>(), false: new Set<string>() };

/** `where` is a thunk: building ~40k labels that only a failure reads is a hot path. */
function expectClean(text: string, withReasons: boolean, where: () => string): void {
  const proven = PROVEN[`${withReasons}`];
  if (proven.has(text)) return;
  for (const word of FORBIDDEN[`${withReasons}`]) {
    if (text.includes(word)) throw new Error(`${where()}: found "${word}"`);
  }
  for (const pattern of FORBIDDEN_PATTERNS) {
    const hit = pattern.exec(text);
    if (hit) throw new Error(`${where()}: found ${pattern} at "…${text.slice(Math.max(0, hit.index - 40), hit.index + 20)}…"`);
  }
  proven.add(text);
}

/** No sentinel anywhere in the raw string, attributes and fields included. */
function expectNoSentinel(raw: string, where: () => string): void {
  for (const word of SENTINELS) {
    if (raw.includes(word)) throw new Error(`${where()}: found "${word}" in the raw part`);
  }
}

/** The exhaustive sweeps below take ~1–2 s alone, several times that on a loaded `npm test`. */
const SWEEP_TIMEOUT = 60_000;

/** Every string the IR carries (text, trails, cells, segments): its "text" values. */
const irText = (nodes: RenderNode[]) =>
  [...JSON.stringify(nodes).matchAll(/"text":"((?:[^"\\]|\\.)*)"/g)].map((match) => JSON.parse(`"${match[1]}"`)).join('\n');

/** The words of OOXML: every `w:t`, and core.xml's title. */
const xmlText = (xml: string) =>
  [...xml.matchAll(/<(?:w:t|dc:title)(?:\s[^>]*)?>([^<]*)<\//g)].map((match) => match[1]).join('\n');

const decode = (html: string) =>
  html
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

const withLayout = (worksheet: Worksheet, layout: AnswerKeyLayout): Worksheet => ({ ...worksheet, answerKeyLayout: layout });

describe('Suggested answers never carries marker-only text', () => {
  const plainPaper = buildLeakWorksheet();
  const versioned: Worksheet = { ...buildLeakWorksheet(), versions: { count: 2, seed: 7 } };

  it('the fixture is a fair test: the marker key prints every sentinel', () => {
    const marker = renderAnswerKey(withLayout(plainPaper, { preset: 'detailed', showSources: true }), 'bilingual');
    const text = irText(marker);
    for (const word of Object.values(LEAK_SENTINELS).flat()) expect(text, word).toContain(word);
    expect(irText(renderAnswerKey(withLayout(plainPaper, { preset: 'hkeaa' }), 'en'))).toMatch(/\d@/);
  });

  it('in the IR and the clipboard, for every allowed switch combination', () => {
    const layouts = combinations();
    expect(layouts.length).toBe((1 << OPEN.length) * MC_LAYOUTS.length);
    for (const worksheet of [plainPaper, versioned]) {
      for (const layout of layouts) {
        const document = withLayout(worksheet, layout);
        for (const language of LANGUAGES) {
          const where = () => `${JSON.stringify(layout)} ${language}${worksheet.versions ? ' versions' : ''}`;
          const reasons = layout.showRationales === true;
          expectClean(irText(renderAnswerKey(document, language)), reasons, () => `IR ${where()}`);
          expectClean(decode(answerKeyClipboardHtml(document, language)), reasons, () => `clipboard HTML ${where()}`);
          expectClean(answerKeyPlainText(document, language), reasons, () => `clipboard text ${where()}`);
        }
      }
    }
  }, SWEEP_TIMEOUT);

  it('in every part of the .docx: body, header, footer, styles, core.xml', () => {
    // The `.docx` is written from the IR proved exhaustively above; here every third
    // combination (stride 3 against 4 MC layouts and 2⁹ switch sets reaches every value
    // of every switch, both ways) in all three languages, on both papers.
    for (const worksheet of [plainPaper, versioned]) {
      for (const layout of combinations().filter((_, index) => index % 3 === 0)) {
        for (const language of LANGUAGES) {
          const parts = buildAnswerKeyDocxParts(withLayout(worksheet, layout), language);
          const where = () => `.docx ${JSON.stringify(layout)} ${language}`;
          const reasons = layout.showRationales === true;
          const xml = [
            parts.documentXml,
            parts.headerFooter.header ?? '',
            parts.headerFooter.footer ?? '',
            parts.stylesXml,
            parts.numberingXml,
            parts.fontTableXml,
            parts.coreXml,
          ];
          for (const part of xml) {
            expectClean(xmlText(part), reasons, where);
            // Nothing hides in an attribute or a field either.
            expectNoSentinel(part, where);
          }
          // No running "Marks" head at all, and no paragraph in the marking-scheme style.
          if (parts.headerFooter.header !== undefined) throw new Error(`${where()}: has a header`);
          if (parts.documentXml.includes('w:val="MarkingScheme"')) throw new Error(`${where()}: MarkingScheme style`);
        }
      }
    }
  }, SWEEP_TIMEOUT);

  it('in the preview DOM (sheets and measuring probe), editable and read-only', () => {
    for (const layout of combinations().filter((_, index) => index % 7 === 0)) {
      for (const language of LANGUAGES) {
        for (const onEdit of [() => {}, undefined]) {
          const markup = renderToStaticMarkup(
            <AnswerKeyPreview worksheet={withLayout(plainPaper, layout)} language={language} onEdit={onEdit} />,
          );
          const where = () => `preview ${JSON.stringify(layout)} ${language}`;
          expectClean(decode(markup), layout.showRationales === true, where);
          if (markup.includes('data-band-box="header"')) throw new Error(`${where()}: has a header band`);
        }
      }
    }
  }, SWEEP_TIMEOUT);

  it('prints what a student may see', () => {
    const document = withLayout(plainPaper, { preset: 'suggested', showRationales: true, showMcStems: true });
    const text = irText(renderAnswerKey(document, 'en'));
    for (const word of [
      'Mock — Suggested answers',
      'MC-STEM-OK',
      'EXPLANATION-OK',
      'RATIONALE-OPTION-A',
      'LQ-STEM-OK',
      'PART-A-OK',
      'ANSWER-A-OK',
      'ALTERNATIVE-OK',
      'POINT-FOUR-OK',
      'ESSAY-POINT-OK',
    ]) {
      expect(text).toContain(word);
    }
    expect(plain(answerKeyTitle(document).zh)).toBe('模擬試 — 參考答案');
  });
});

describe('Suggested answers: the switches', () => {
  const paper = buildLeakWorksheet();
  const nodes = (layout: AnswerKeyLayout, language: LanguageMode = 'en') =>
    renderAnswerKey({ ...paper, answerKeyLayout: { preset: 'suggested', ...layout } }, language);
  const bullets = (list: RenderNode[]) =>
    list.filter((node): node is ColumnsNode => node.kind === 'columns' && plain(node.cells[0].text.en) === '•');

  it('marking points print as plain bullets, the first route only, typed where they print', () => {
    const points = bullets(nodes({}));
    expect(points.map((node) => plain(node.cells[1].text.en))).toEqual([
      'POINT-ONE-OK / ALTERNATIVE-OK',
      'POINT-TWO-OK',
      'POINT-THREE-OK',
      'POINT-FOUR-OK',
      'ESSAY-POINT-OK',
    ]);
    // A point with alternatives edits each wording alone; a plain point is one field.
    expect(points[0].cells[1].segments?.en.map((s) => ('edit' in s ? s.edit.kind : 'runs'))).toEqual([
      'schemePoint',
      'runs',
      'schemeAlternative',
    ]);
    expect(points[1].cells[1].edit?.kind).toBe('schemePoint');
    // Off: no bullets at all; the answer text stays.
    expect(bullets(nodes({ schemeAsPoints: false }))).toHaveLength(0);
    expect(irText(nodes({ schemeAsPoints: false }))).toContain('ANSWER-A-OK');
  });

  it('part marks print as the paper prints them, and switch off', () => {
    const marked = (list: RenderNode[]) =>
      list.filter((node): node is TextNode => node.kind === 'text' && node.marks !== undefined).map((node) => node.marks);
    expect(marked(nodes({}))).toEqual([3, 8]);
    expect(marked(nodes({ showPartMarks: false }))).toEqual([]);
  });

  it('question wording is on by default; MC wording prints the MC answers as a list', () => {
    expect(irText(nodes({}))).toContain('PART-A-OK');
    expect(irText(nodes({}))).not.toContain('MC-STEM-OK');
    expect(irText(nodes({ showStems: false }))).not.toContain('PART-A-OK');
    const listed = irText(nodes({ showMcStems: true }));
    expect(listed).toContain('MC-STEM-OK');
    expect(listed).toContain('Answer: B');
    expect(nodes({ showMcStems: true }).some((node) => node.kind === 'table')).toBe(false);
  });

  it('with versions on: a key per version, no version map', () => {
    const text = irText(renderAnswerKey({ ...paper, versions: { count: 2, seed: 3 }, answerKeyLayout: { preset: 'suggested' } }, 'en'));
    expect(text).toContain('Version A');
    expect(text).toContain('Version B');
    expect(text).not.toContain('Version map');
  });

  it('model answer diagrams and answer layers print as in the marker key, layer drawn', () => {
    const worksheet = buildAnswerLayerWorksheet();
    const question = worksheet.questions[0] as Extract<Worksheet['questions'][number], { type: 'structured' }>;
    question.parts[0].answerDiagram = createAnswerDiagram('supply-demand');
    const diagrams = (layout?: AnswerKeyLayout) =>
      renderAnswerKey({ ...worksheet, answerKeyLayout: layout }, 'en').filter((node) => node.kind === 'diagram');
    const suggested = diagrams({ preset: 'suggested' });
    expect(suggested.length).toBe(2);
    expect(suggested).toEqual(diagrams());
    expect(suggested.some((node) => node.kind === 'diagram' && node.answers)).toBe(true);
  });

  it('a combined key keeps each document’s own preset', () => {
    const suggested = withLayout(buildLeakWorksheet(), { preset: 'suggested' });
    const hkeaa = withLayout(buildMarkSchemeWorksheet(), { preset: 'hkeaa' });
    const nodes = renderCombinedAnswerKey([suggested, hkeaa], 'en');
    const split = nodes.findIndex((node) => node.kind === 'pageBreak');
    expectClean(irText(nodes.slice(0, split)), false, () => 'combined, suggested part');
    expect(irText(nodes.slice(split))).toMatch(/\d@|max: \d/);
    expect(irText(nodes)).toContain('Mock — Suggested answers');
  });

  it('is named Suggested answers / 參考答案 in its file name', () => {
    const suggested = withLayout(buildLeakWorksheet(), { preset: 'suggested' });
    suggested.name = 'Mock';
    expect(answerKeyFileName(suggested, 'en')).toBe('Mock (Suggested answers) (EN).docx');
    expect(answerKeyFileName(suggested, 'zh')).toBe('Mock (參考答案) (ZH).docx');
    expect(answerKeyFileName(suggested, 'bilingual')).toBe('Mock (Suggested answers 參考答案) (Bilingual).docx');
    // Any marker key in the file: it is an answer key.
    expect(answerKeyFileName(suggested, 'en', [buildMarkSchemeWorksheet()])).toMatch(/\(Answer key\) \(EN\)\.docx$/);
    expect(answerKeyFileName({ ...suggested, answerKeyLayout: undefined }, 'en')).toBe('Mock (Answer key) (EN).docx');
  });

  it('the view’s nodes are the export’s', () => {
    const document = withLayout(paper, { preset: 'suggested' });
    expect(answerKeyView(document, 'bilingual').nodes).toEqual(renderAnswerKey(document, 'bilingual'));
  });
});
