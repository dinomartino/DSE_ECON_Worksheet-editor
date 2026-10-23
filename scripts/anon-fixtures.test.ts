/**
 * Not a unit test: writes the documents `scripts/anon-verify.mjs` opens in a real Chrome to
 * prove an anonymised copy (`src/feedback/anonymise.ts`) lays out as its original does.
 *
 * The committed reference documents (the frozen corpora, the acceptance, mark scheme and
 * kitchen-sink fixtures, the LQ mock preset), plus any `.worksheet.json` under the
 * gitignored `real_life_reference/` (a real teacher's paper, when this machine has one).
 *
 *   ANON_DIR=/tmp/anon-verify [ANON_REFERENCE=<folder>] npx vitest run scripts/anon-fixtures.test.ts
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import v1Corpus from '@/test/corpus/v1-published.json';
import v2Corpus from '@/test/corpus/v2-published.json';
import { noisePng, seededRandom } from '@/feedback/anonymise';
import { createImageBlock, createStructuredQuestion, createTableBlock } from '@/model/factories';
import { migrate } from '@/model/migrations';
import { createWorksheetFrom } from '@/model/newWorksheet';
import { bi } from '@/model/text';
import type { Worksheet } from '@/model/types';
import { stringifyWorksheet } from '@/storage/document';
import { buildAcceptanceWorksheet } from '@/test/fixtures';
import { buildMarkSchemeWorksheet } from '@/test/markSchemeFixture';
import { buildTranslateFixture } from '@/test/translateFixture';

/** Pictures at their printed sizes: a photo, a tall scan, a picture in a table cell. */
function pictureDocument(): Worksheet {
  const png = (width: number, height: number) =>
    `data:image/png;base64,${Buffer.from(noisePng(width, height, width * height, seededRandom(width))).toString('base64')}`;
  const worksheet = createWorksheetFrom({ documentType: 'classroom', title: 'Pictures' });
  const table = createTableBlock(2, 2);
  table.rows[0].cells[0] = {
    ...table.rows[0].cells[0],
    text: bi('Harbour', '海港'),
    image: { src: png(240, 180), widthPx: 120, heightPx: 90, altText: bi('Harbour', '海港') },
  };
  const question = createStructuredQuestion();
  question.blocks = [
    ...question.blocks,
    createImageBlock(png(600, 400), 450, 300),
    createImageBlock(png(400, 900), 200, 450),
    table,
  ];
  return { ...worksheet, questions: [...worksheet.questions, question], flow: [] };
}

const OUT = `${process.env.ANON_DIR ?? '/tmp/anon-verify'}/docs`;
const REFERENCE = process.env.ANON_REFERENCE ?? 'real_life_reference';

it('emits the anonymiser verification documents', () => {
  mkdirSync(OUT, { recursive: true });
  const docs: Array<[string, Worksheet]> = [
    ['v1-corpus', migrate(structuredClone(v1Corpus))],
    ['v2-corpus', migrate(structuredClone(v2Corpus))],
    ['acceptance', buildAcceptanceWorksheet()],
    ['mark-scheme', buildMarkSchemeWorksheet()],
    ['kitchen-sink', buildTranslateFixture()],
    ['lq-mock', createWorksheetFrom({ documentType: 'lqMock', title: 'LQ mock' })],
    ['pictures', pictureDocument()],
  ];
  if (existsSync(REFERENCE)) {
    for (const file of readdirSync(REFERENCE).filter((name) => name.endsWith('.worksheet.json'))) {
      docs.push([`ref-${file.replace(/\.worksheet\.json$/, '')}`, migrate(JSON.parse(readFileSync(`${REFERENCE}/${file}`, 'utf8')))]);
    }
  }
  for (const [name, worksheet] of docs) {
    // Its own id and a title the start screen can find.
    writeFileSync(`${OUT}/${name}.worksheet.json`, stringifyWorksheet({ ...worksheet, id: `anon-${name}`, name: `Anon ${name}` }));
  }
  writeFileSync(`${OUT}/list.json`, JSON.stringify(docs.map(([name]) => name)));
  console.log(`${docs.length} documents -> ${OUT}`);
});
