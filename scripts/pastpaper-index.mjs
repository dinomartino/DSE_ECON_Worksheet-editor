#!/usr/bin/env node
/**
 * Adds the search index to a Past paper bank pack (k-0444), for trying and testing the
 * editor against a local export before the real export writes it itself.
 *
 *   node scripts/pastpaper-index.mjs <pack dir> <out dir>
 *
 * Reads `<pack>/manifest.json` and every `topics/<id>.json`, writes `<out>/manifest.json`
 * with a `search` block and copies the topic files unchanged (their fingerprints stand).
 * The format is the one in docs/design/pastpaper-bank.md § "The search index"; this file is
 * its reference implementation. No bank data is in this repo: run it on a pack outside it.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const SOURCE_TAG = /^(CE|AL|DSE)(\d{4}|SP|PP)\/P(\d+)\/Q(\d+)$/;

const plain = (runs) => (Array.isArray(runs) ? runs.map((run) => (typeof run?.text === 'string' ? run.text : '')).join('') : '');
const side = (bi, lang) => (bi && typeof bi === 'object' ? plain(bi[lang]) : '');

/** The words of some blocks, in reading order; pictures counted. */
function blockWords(blocks, lang, out) {
  for (const block of Array.isArray(blocks) ? blocks : []) {
    if (!block || typeof block !== 'object') continue;
    if (block.kind === 'paragraph') out.words.push(side(block.text, lang));
    else if (block.kind === 'table') {
      if (block.caption) out.words.push(side(block.caption, lang));
      for (const row of block.rows ?? []) {
        for (const cell of row.cells ?? []) {
          if (cell.covered) continue;
          out.words.push(side(cell.text, lang));
          if (cell.image && lang === 'en') out.pictures += 1;
        }
      }
    } else if (block.kind === 'image' || block.kind === 'diagram') {
      if (lang === 'en') out.pictures += 1;
      if (block.caption) out.words.push(side(block.caption, lang));
    } else if (block.kind === 'figureRow') {
      blockWords([block.figure, block.table], lang, out);
    } else if (block.kind === 'source') {
      if (block.label) out.words.push(side(block.label, lang));
      blockWords(block.blocks, lang, out);
      if (block.footnote) out.words.push(side(block.footnote, lang));
    }
  }
}

const tidy = (words) => words.join(' ').replace(/\s+/g, ' ').trim();

/** Which stimulus serves which question: the next `span` (default 2) questions after it, up to the next stimulus. */
function stimuliServing(doc) {
  const layout = new Map((doc.layout ?? []).map((element) => [element.id, element]));
  const served = new Map();
  let open;
  for (const item of doc.flow ?? []) {
    if (item.type === 'layout') {
      const element = layout.get(item.id);
      if (element?.kind === 'stimulus') open = { element, left: Math.max(1, element.span ?? 2) };
      continue;
    }
    if (item.type !== 'question') continue;
    if (open && open.left > 0) {
      served.set(item.id, open.element);
      open.left -= 1;
    }
  }
  return served;
}

export function searchRows(topicId, doc) {
  const serving = stimuliServing(doc);
  const rows = [];
  for (const question of doc.questions ?? []) {
    const source = (question.tags ?? []).find((tag) => typeof tag === 'string' && SOURCE_TAG.test(tag));
    if (!source) continue;
    const row = { topic: topicId, source };
    let pictures = 0;
    for (const lang of ['en', 'zh']) {
      const out = { words: [], pictures: 0 };
      const stimulus = serving.get(question.id);
      if (stimulus) blockWords(stimulus.blocks, lang, out);
      blockWords(question.blocks, lang, out);
      for (const statement of question.statements ?? []) out.words.push(side(statement, lang));
      for (const option of question.options ?? []) {
        out.words.push(side(option.text, lang));
        blockWords(option.blocks, lang, out);
      }
      row[lang] = tidy(out.words);
      if (lang === 'en') pictures = out.pictures;
    }
    if (pictures > 0) row.pictures = pictures;
    rows.push(row);
  }
  return rows;
}

function main() {
  const [packDir, outDir] = process.argv.slice(2);
  if (!packDir || !outDir) {
    console.error('usage: node scripts/pastpaper-index.mjs <pack dir> <out dir>');
    process.exit(2);
  }
  const manifest = JSON.parse(readFileSync(join(packDir, 'manifest.json'), 'utf8'));
  const questions = [];
  for (const topic of manifest.topics) {
    const doc = JSON.parse(readFileSync(join(packDir, topic.file), 'utf8'));
    questions.push(...searchRows(topic.id, doc));
    mkdirSync(dirname(join(outDir, topic.file)), { recursive: true });
    copyFileSync(join(packDir, topic.file), join(outDir, topic.file));
  }
  const out = { ...manifest, search: { version: 1, questions } };
  const text = JSON.stringify(out);
  writeFileSync(join(outDir, 'manifest.json'), text);
  const bytes = Buffer.byteLength(text);
  console.log(`${questions.length} questions indexed; manifest ${(bytes / 1e6).toFixed(2)} MB`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
