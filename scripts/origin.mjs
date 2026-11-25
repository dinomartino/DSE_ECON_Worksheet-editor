#!/usr/bin/env node
/**
 * Print where an exported file came from (k-0558): the hidden origin metadata Econ Studio
 * writes into every `.docx`, `.xlsx` and desktop PDF — app, version, export date and the
 * worksheet's random id. Reads the file only; changes nothing.
 *
 *   node scripts/origin.mjs <file.docx|file.pdf|file.xlsx> [more files…]
 *   node scripts/origin.mjs --json <file>      machine-readable
 *
 * Exit code 0 when every file carries an origin, 1 when one does not, 2 on a bad call.
 * How to read the same fields without this script: docs/RECIPES.md § Check where an
 * exported file came from.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';

const KEYS = ['DSEconApp', 'DSEconVersion', 'DSEconExported', 'DSEconDocId'];

const unescape = (text) =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
const tag = (xml, name) => {
  const match = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`).exec(xml ?? '');
  return match ? unescape(match[1]) : undefined;
};

/** `.docx` / `.xlsx`: docProps/app.xml, core.xml and custom.xml. */
async function readOoxml(bytes) {
  const zip = await JSZip.loadAsync(bytes);
  const part = async (name) => zip.file(name)?.async('string');
  const [app, core, custom] = await Promise.all([
    part('docProps/app.xml'),
    part('docProps/core.xml'),
    part('docProps/custom.xml'),
  ]);
  const properties = {};
  for (const match of (custom ?? '').matchAll(/<property\b[^>]*\bname="([^"]+)"[^>]*>\s*<vt:\w+>([\s\S]*?)<\/vt:\w+>/g)) {
    properties[unescape(match[1])] = unescape(match[2]);
  }
  return {
    standard: {
      Application: tag(app, 'Application'),
      AppVersion: tag(app, 'AppVersion'),
      Created: tag(core, 'dcterms:created'),
      Modified: tag(core, 'dcterms:modified'),
    },
    origin: properties,
  };
}

/** PDF: the Info dictionary (custom keys included) and the XMP packet, through pdf.js. */
async function readPdf(bytes) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    useSystemFonts: false,
    verbosity: 0,
  });
  const document = await task.promise;
  try {
    const { info, metadata } = await document.getMetadata();
    // pdf.js 6 hands the non-standard Info keys over as a Map; older versions as an object.
    const custom = info?.Custom instanceof Map ? Object.fromEntries(info.Custom) : (info?.Custom ?? {});
    const xmp = metadata?.getRaw?.() ?? '';
    const fromXmp = (key) => tag(xmp, `dsecon:${key}`);
    const origin = {};
    for (const key of KEYS) {
      const value = custom[key] ?? fromXmp(key);
      if (value !== undefined) origin[key] = String(value);
    }
    return {
      standard: {
        Producer: info?.Producer,
        Creator: info?.Creator,
        CreationDate: info?.CreationDate,
        Title: info?.Title,
        'XMP pdf:Producer': tag(xmp, 'pdf:Producer'),
        'XMP xmpMM:DocumentID': tag(xmp, 'xmpMM:DocumentID'),
        Pages: document.numPages,
      },
      origin,
    };
  } finally {
    await task.destroy();
  }
}

async function inspect(file) {
  const bytes = await readFile(file);
  const head = bytes.subarray(0, 5).toString('latin1');
  if (head === '%PDF-') return readPdf(bytes);
  if (head.startsWith('PK')) return readOoxml(bytes);
  throw new Error('Not a PDF, .docx or .xlsx file');
}

const args = process.argv.slice(2);
const json = args.includes('--json');
const files = args.filter((arg) => arg !== '--json');
if (files.length === 0) {
  console.error('Usage: node scripts/origin.mjs [--json] <file.docx|file.pdf|file.xlsx> […]');
  process.exit(2);
}

let missing = false;
const results = [];
for (const file of files) {
  try {
    const result = await inspect(file);
    const found = Boolean(result.origin.DSEconApp);
    if (!found) missing = true;
    results.push({ file, found, ...result });
  } catch (error) {
    missing = true;
    results.push({ file, found: false, error: error instanceof Error ? error.message : String(error) });
  }
}

if (json) {
  console.log(JSON.stringify(results, null, 2));
} else {
  for (const result of results) {
    console.log(path.basename(result.file));
    if (result.error) {
      console.log(`  could not read: ${result.error}`);
      continue;
    }
    console.log(result.found ? '  Made by Econ Studio (origin metadata found)' : '  No Econ Studio origin metadata');
    for (const key of KEYS) console.log(`  ${key.padEnd(16)} ${result.origin[key] ?? '—'}`);
    for (const [key, value] of Object.entries(result.standard)) {
      if (value !== undefined && value !== '') console.log(`  ${key.padEnd(16)} ${value}`);
    }
    console.log('');
  }
}
process.exit(missing ? 1 : 0);
