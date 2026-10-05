/**
 * Not a unit test: wrote the frozen question-bank corpus, once, from the v0.6.0 release.
 *
 * It refuses to run anywhere but a checkout of tag v0.6.0 (commit 39e20ed), so the bytes
 * come from the released build, never from the current one:
 *   git worktree add <dir> v0.6.0   # then copy this file into <dir>/scripts/
 *   EMIT_BANK_V060_CORPUS=1 npx vitest run scripts/emit-bank-v0.6.0-corpus.test.ts
 *
 * Everything goes through v0.6.0's own paths: `copyQuestion` (part roots),
 * `LocalStorageWorksheetStore.save` (both storage halves), `copyToBank`, and
 * `createBankIndex` over `createDocFilesBackend` (INDEX_FORMAT 7 rows, the desktop's
 * per-document files and pack). Only `nanoid` and the clock are pinned, for readable ids.
 * `backwardCompat.test.ts` and `bankCorpus.test.ts` prove the current build keeps it all.
 * Never regenerate these files; a later format gets files of its own.
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { it, vi } from 'vitest';

const ids = vi.hoisted(() => ({ next: 0 }));
vi.mock('nanoid', () => ({ nanoid: () => `v060-${String(++ids.next).padStart(3, '0')}` }));

const TAG_COMMIT = '39e20ed333d20a15779be0de77b1c5e412e0c498';
const OUT = 'src/test/corpus';
const PAPER_ID = 'bank-v060-paper';
const BANK_ID = 'bank-v060-bank';

function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  } as Storage;
}

it('emits the frozen v0.6.0 question-bank corpus', async () => {
  if (process.env.EMIT_BANK_V060_CORPUS !== '1') {
    throw new Error(
      'Refusing to rewrite the frozen bank corpus. It is never regenerated; set ' +
        'EMIT_BANK_V060_CORPUS=1 only in a checkout of tag v0.6.0.',
    );
  }
  const head = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  const version = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;
  if (head !== TAG_COMMIT || version !== '0.6.0') {
    throw new Error(`Must run at tag v0.6.0 (${TAG_COMMIT}); this checkout is ${head} (${version}).`);
  }

  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-04T08:00:00.000Z'));
  const storage = fakeStorage();
  vi.stubGlobal('window', { localStorage: storage });

  const { createMcqQuestion, createParagraphBlock, createPart, createStructuredQuestion, createSubPart, createWorksheet } =
    await import('@/model/factories');
  const { copyQuestion } = await import('@/model/lineage');
  const { bi } = await import('@/model/text');
  const { LocalStorageWorksheetStore } = await import('@/storage');
  const { copyToBank, createBank } = await import('@/library/bankDocs');
  const { createBankIndex } = await import('@/library/bankIndex');
  const { createDocFilesBackend, INDEX_FORMAT, STORED_INDEX_FORMAT } = await import('@/library/bankBackend');
  if (INDEX_FORMAT !== 7) throw new Error(`Expected INDEX_FORMAT 7, got ${INDEX_FORMAT}.`);
  const store = new LocalStorageWorksheetStore();

  // An MCQ tagged at question level (its only list).
  const mcq = createMcqQuestion();
  mcq.blocks = [createParagraphBlock(bi('A price ceiling set below the equilibrium price leads to', '價格上限低於均衡價格會導致'))];
  mcq.options.forEach((option, i) => {
    option.text = bi(['a shortage', 'a surplus', 'no change', 'a higher price'][i], ['短缺', '過剩', '沒有改變', '價格上升'][i]);
  });
  mcq.tags = ['C.intervention', 'mock 2026'];
  mcq.tagsAt = '2026-10-04T08:00:00.000Z';

  // Tagged per part: part lists, a sub-part's own list, free tags only on the question.
  const original = createStructuredQuestion();
  original.blocks = [createParagraphBlock(bi('The government sets a price ceiling on rice.', '政府為米設定價格上限。'))];
  const partA = createPart();
  partA.blocks = [createParagraphBlock(bi('Explain the effect on quantity demanded.', '解釋對需求量的影響。'))];
  partA.marks = 2;
  partA.answer = bi('Quantity demanded rises.', '需求量上升。');
  partA.tags = ['C.ped', 'C.ped::Explain PED'];
  const partB = createPart();
  partB.blocks = [createParagraphBlock(bi('With reference to the ceiling:', '參考價格上限：'))];
  partB.tags = ['C.intervention'];
  const subI = createSubPart();
  subI.blocks = [createParagraphBlock(bi('Draw the shortage.', '繪圖顯示短缺。'))];
  const subII = createSubPart();
  subII.blocks = [createParagraphBlock(bi('Is the outcome efficient?', '結果是否有效率？'))];
  subII.marks = 3;
  subII.tags = ['E.efficiency'];
  partB.subParts = [subI, subII];
  original.parts = [partA, partB];
  original.tags = ['mock 2026'];
  original.tagsAt = '2026-10-04T08:00:00.000Z';
  // The paper holds a copy taken from an earlier paper: lineage, and a rootId on every
  // part and sub-part, through v0.6.0's own copy.
  const tagged = copyQuestion(original, 'bank-v060-earlier-paper');

  // Develop's legacy shape: a topic on the whole of a question with parts.
  const legacy = createStructuredQuestion();
  legacy.blocks = [createParagraphBlock(bi('A bumper harvest of apples.', '蘋果大豐收。'))];
  legacy.parts[0].blocks = [createParagraphBlock(bi('Draw the effect on the market.', '繪圖顯示對市場的影響。'))];
  legacy.tags = ['C.equilibrium', 'mock 2026'];

  const paper = {
    ...createWorksheet(),
    id: PAPER_ID,
    name: 'S5 Price controls quiz',
    title: bi('S5 Economics: Price controls', '中五經濟：價格管制'),
    classes: ['5A', '5B'],
    satOn: '2026-10-02',
  };
  paper.questions = [mcq, tagged, legacy];
  paper.flow = [...paper.flow, ...paper.questions.map((q) => ({ type: 'question' as const, id: q.id }))];
  await store.save(paper);

  vi.setSystemTime(new Date('2026-10-04T09:00:00.000Z'));
  await store.save({ ...createBank('S5 bank'), id: BANK_ID });
  vi.setSystemTime(new Date('2026-10-04T09:30:00.000Z'));
  // The copy pair: the bank's copy shares every part root with the paper's question.
  const copied = await copyToBank([mcq, tagged], PAPER_ID, BANK_ID, { store, openDocId: PAPER_ID });
  if (copied.copied !== 2) throw new Error(`Expected two copies, got ${copied.copied}.`);

  // The bank index, as the desktop persists it: one file per document plus the pack.
  const files = new Map<string, string>();
  const cache = new Map<string, string>();
  const port = (name: string) => ({
    read: async () => cache.get(name),
    write: async (text: string) => void cache.set(name, text),
    remove: async () => void cache.delete(name),
  });
  const docFiles = {
    ids: async () => [...files.keys()],
    read: async (id: string) => files.get(id),
    write: async (id: string, text: string) => void files.set(id, text),
    remove: async (id: string) => void files.delete(id),
    clear: async () => files.clear(),
  };
  const ports = { pack: port('pack'), journal: port('journal') };
  const index = createBankIndex(store, () => Promise.resolve(), { backend: createDocFilesBackend(docFiles, undefined, ports) });
  await index.refresh();
  await index.settled();
  // A fresh launch reads every file and writes the pack.
  await createDocFilesBackend(docFiles, undefined, ports).load();
  for (let i = 0; i < 20 && !cache.has('pack'); i++) await new Promise((resolve) => setImmediate(resolve));
  if (!cache.has('pack')) throw new Error('The pack was not written.');

  const raw = (key: string) => {
    const value = storage.getItem(key);
    if (value === null) throw new Error(`Nothing stored under ${key}.`);
    return value;
  };
  writeFileSync(`${OUT}/bank-v0.6.0-paper.json`, `${raw(`econ-worksheet:${PAPER_ID}`)}\n`);
  writeFileSync(`${OUT}/bank-v0.6.0-bank.json`, `${raw(`econ-worksheet:${BANK_ID}`)}\n`);
  const stored = {
    writtenBy: `v0.6.0 (${TAG_COMMIT})`,
    storedIndexFormat: STORED_INDEX_FORMAT,
    'econ-worksheet-index': JSON.parse(raw('econ-worksheet-index')),
    'library/docs': Object.fromEntries([...files].sort(([a], [b]) => a.localeCompare(b)).map(([id, text]) => [id, JSON.parse(text)])),
    'library/pack.json': JSON.parse(cache.get('pack')!),
  };
  writeFileSync(`${OUT}/bank-v0.6.0-index.json`, `${JSON.stringify(stored, null, 2)}\n`);
});
