/**
 * Not a unit test: run **inside a release's own checkout** (k-0588), to record two things
 * only that release's code can tell us. Each half refuses anywhere but a checkout of a
 * release tag v0.8.7, v0.9.1, v0.10.0 or v0.10.1, so the bytes really are that build's.
 *
 *   git worktree add --detach /tmp/rel v0.10.1 && ln -s <repo>/node_modules /tmp/rel/
 *   cp scripts/flow-release-corpus.test.ts /tmp/rel/scripts/
 *   cp src/test/corpus/v4-flow-figures.json /tmp/rel/src/test/corpus/
 *   (cd /tmp/rel && EMIT_FLOW_RELEASE_CORPUS=1 npx vitest run scripts/flow-release-corpus.test.ts)
 *   cp /tmp/rel/src/test/corpus/flow-v0.10.1*.json src/test/corpus/
 *
 * 1. `flow-<tag>.json`: a worksheet of flow charts as that release saves them — the stock
 *    template, the HKDSE 2021 P1 Q23 value-added chain, and the closest a teacher could
 *    get to a circular flow (a ring of four boxes) and to the stage chart (one row, a pair
 *    of opposite arrows on each link) — and `flow-<tag>-drawn.json`, the SVG that release
 *    draws for each, in English and Chinese. `flowCompat.test.ts` opens the file in this
 *    build and compares the drawing.
 * 2. `flow-<tag>-reads-v4.json`: what that release does with `v4-flow-figures.json` (a
 *    file this build wrote with dashed arrows, loops, the grid and the key): whether it
 *    opens, read-only or not, how much text it keeps, and which words its drawing shows.
 *
 * Self-contained on purpose: it may import only what every one of those releases has.
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { createDiagramBlock, createMcqQuestion, createParagraphBlock, createWorksheet } from '@/model/factories';
import { isNewerThanBuild, migrate, serializeWorksheet } from '@/model/migrations';
import { diagramSize, diagramSvg } from '@/render/diagram';
import { renderWorksheet } from '@/render/worksheet';
import { bi } from '@/model/text';

const RELEASES = ['v0.8.7', 'v0.9.1', 'v0.10.0', 'v0.10.1'];

function releaseTag(): string {
  const tag = execSync('git describe --tags --exact-match HEAD', { encoding: 'utf8' }).trim();
  const dirty = execSync('git status --porcelain --untracked-files=no', { encoding: 'utf8' }).trim();
  if (!RELEASES.includes(tag) || dirty) {
    throw new Error(`Refusing: run at a clean checkout of ${RELEASES.join(', ')} (HEAD is ${tag || 'untagged'}).`);
  }
  return tag;
}

type Json = Record<string, unknown>;
const n = (id: string, en: string, zh: string, col: number, row: number, extra: Json = {}) => ({ id, label: bi(en, zh), col, row, ...extra });
const a = (id: string, from: string | undefined, to: string | undefined, extra: Json = {}) => ({ id, ...(from ? { from } : {}), ...(to ? { to } : {}), ...extra });

/** The flow charts, as plain data every release since v0.8.7 stores. */
const FLOWS: Record<string, { nodes: Json[]; arrows: Json[] }> = {
  chain2021: {
    nodes: [
      n('imp', 'Local importers', '本地進口商', 0, 0),
      n('farm', 'Local farmers', '本地農民', 0, 1),
      n('inv', 'increase in inventory\n$50', '存貨增加\n$50', 0, 2, { boxed: false }),
      n('sup', 'Local supermarkets', '本地超級市場', 1, 0),
      n('con', 'Local consumers', '本地消費者', 2, 0),
      n('tour', 'Foreign tourists', '外國遊客', 2, 1),
    ],
    arrows: [
      a('raw', undefined, 'imp', { label: bi('$200', '$200'), labelBelow: bi('raw materials', '原料') }),
      a('a400', 'imp', 'sup', { label: bi('$400', '$400') }),
      a('a600', 'farm', 'sup', { labelBelow: bi('$600', '$600') }),
      a('a50', 'farm', 'inv'),
      a('a1200', 'sup', 'con', { label: bi('$1 200\n($100 sales tax inclusive)', '$1 200\n（包括 $100 銷售稅）') }),
      a('a500', 'sup', 'tour', { labelBelow: bi('$500', '$500') }),
      a('out', 'tour', undefined, { label: bi('exported', '出口') }),
    ],
  },
  ring: {
    nodes: [
      n('h', 'Households', '住戶', 0, 0),
      n('fm', 'Factor market', '生產要素市場', 1, 0),
      n('pm', 'Product market', '產品市場', 1, 1),
      n('f', 'Firms', '廠商', 2, 0),
    ],
    arrows: [
      a('r1', 'h', 'fm', { label: bi('factor services', '生產要素服務') }),
      a('r2', 'fm', 'f'),
      a('r3', 'f', 'pm', { label: bi('goods', '物品') }),
      a('r4', 'pm', 'h'),
    ],
  },
  stagesInARow: {
    nodes: [n('p', 'Primary', '第一級', 0, 0), n('s', 'Secondary', '第二級', 1, 0), n('t', 'Tertiary', '第三級', 2, 0)],
    arrows: [a('ps', 'p', 's', { label: bi('E', 'E') }), a('sp', 's', 'p'), a('st', 's', 't', { label: bi('F', 'F') }), a('ts', 't', 's')],
  },
};

it('records this release: its own flow charts, and what it does with a v4 flow file', () => {
  if (process.env.EMIT_FLOW_RELEASE_CORPUS !== '1') {
    throw new Error('Refusing to write the frozen release corpus. Set EMIT_FLOW_RELEASE_CORPUS=1 only when deliberately cutting it.');
  }
  const tag = releaseTag();

  // 1. A worksheet as this release saves it, and what it draws.
  const worksheet = createWorksheet() as unknown as Json & { questions: Json[]; flow: Json[] };
  worksheet.id = `flow-${tag}-corpus`;
  worksheet.title = bi('Flow charts', '流程圖');
  const drawn: Json = {};
  const template = createDiagramBlock('flow', 460) as unknown as Json & { diagram: Json };
  const blocks: Array<[string, Json]> = [['template', template], ...Object.entries(FLOWS).map(([name, flow]) => {
    const block = createDiagramBlock('flow', 460) as unknown as Json & { diagram: Json };
    return [name, { ...block, diagram: { ...block.diagram, flow } }] as [string, Json];
  })];
  worksheet.questions = blocks.map(([name, block]) => {
    const q = createMcqQuestion() as unknown as Json;
    const diagram = block.diagram as never;
    const sized = { ...block, id: `${name}-figure`, ...diagramSize(diagram, 460, 'en') };
    q.id = `q-${name}`;
    q.blocks = [{ ...createParagraphBlock(bi(`Refer to the ${name} chart.`, `參閱 ${name} 圖。`)), id: `${name}-stem` }, sized];
    drawn[name] = Object.fromEntries(
      (['en', 'zh'] as const).map((language) => {
        const size = diagramSize(diagram, 460, language);
        return [language, { ...size, svg: diagramSvg(diagram, { ...size, language }) }];
      }),
    );
    return q;
  });
  worksheet.flow = worksheet.questions.map((q) => ({ type: 'question', id: q.id }));
  const doc = serializeWorksheet(worksheet as never) as Json;
  doc.createdAt = '2026-11-27T00:00:00.000Z';
  doc.updatedAt = '2026-11-27T00:00:00.000Z';
  writeFileSync(`src/test/corpus/flow-${tag}.json`, `${JSON.stringify(doc, null, 2)}\n`);
  writeFileSync(`src/test/corpus/flow-${tag}-drawn.json`, `${JSON.stringify({ tag, drawn }, null, 2)}\n`);

  // 2. A file this build wrote with the v4 flow fields, opened by this release.
  const raw = readFileSync('src/test/corpus/v4-flow-figures.json', 'utf8');
  const words = (value: unknown): string[] => {
    if (Array.isArray(value)) return value.flatMap(words);
    if (value && typeof value === 'object') {
      const record = value as Json;
      if (typeof record.text === 'string') return record.text.trim() ? [record.text] : [];
      return Object.values(record).flatMap(words);
    }
    return [];
  };
  let opened: Json;
  try {
    const loaded = migrate(JSON.parse(raw)) as unknown as Json & { questions: Array<Json & { id: string; blocks: Json[] }> };
    const figures = loaded.questions.map((q) => {
      const block = q.blocks.find((b) => b.kind === 'diagram') as Json & { diagram: Json & { flow: Json } };
      const flowWords = [...new Set(words(block.diagram.flow).flatMap((w) => w.split('\n')))];
      const svgs = (['en', 'zh'] as const).map((language) => diagramSvg(block.diagram as never, { ...diagramSize(block.diagram as never, 460, language), language }));
      const svgText = svgs.join(' ');
      return {
        question: q.id,
        // The fields this release does not know, still on the loaded chart in memory.
        keptFields: {
          layout: block.diagram.flow.layout ?? null,
          key: Boolean(block.diagram.flow.key),
          dashed: (block.diagram.flow.arrows as Json[]).filter((x) => x.dashed === true).length,
          routed: (block.diagram.flow.arrows as Json[]).filter((x) => typeof x.route === 'string').length,
        },
        wordsMissingFromDrawing: flowWords.filter((w) => !svgText.includes(w.replace(/&/g, '&amp;'))),
      };
    });
    let pageError: string | null = null;
    try {
      for (const language of ['en', 'zh', 'bilingual'] as const) renderWorksheet(loaded as never, { language, version: 'student' } as never);
    } catch (error) {
      pageError = String(error);
    }
    opened = {
      opens: true,
      storedVersion: JSON.parse(raw).schemaVersion,
      loadedVersion: loaded.schemaVersion,
      readOnly: isNewerThanBuild(loaded as never),
      textInFile: words(JSON.parse(raw)).length,
      textLoaded: words(loaded).length,
      pageError,
      figures,
    };
  } catch (error) {
    opened = { opens: false, error: String(error) };
  }
  writeFileSync(`src/test/corpus/flow-${tag}-reads-v4.json`, `${JSON.stringify({ tag, ...opened }, null, 2)}\n`);
});
