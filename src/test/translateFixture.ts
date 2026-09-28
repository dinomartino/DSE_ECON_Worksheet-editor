import { createDiagramBlock, createWorksheet } from '@/model/factories';
import type { Diagram } from '@/model/diagram';
import { createBlankDiagram } from '@/model/diagramTemplates';
import type { MarkScheme } from '@/model/markSchemeTypes';
import { bi } from '@/model/text';
import type {
  BiText,
  ContentBlock,
  DiagramBlock,
  McqQuestion,
  StructuredQuestion,
  TableBlock,
  Worksheet,
} from '@/model/types';
import { TINY_PNG } from './fixtures';

/**
 * The kitchen sink: one of every text a worksheet can hold — every block, both question
 * types, every band field, the cover, every layout element and every kind of diagram
 * text — each with both sides filled and a fixed id, so a test can address any slot.
 * `textWalk.census.test.ts` proves the walker reaches all of them.
 */

const t = (en: string, zh: string): BiText => bi(en, zh);

function table(id: string, withCaption = true): TableBlock {
  return {
    kind: 'table',
    id,
    ...(withCaption ? { caption: t('Table 1', '表一'), captionPlacement: 'above' as const } : {}),
    rows: [
      {
        id: `${id}-r1`,
        cells: [
          { id: `${id}-c1`, text: t('Price ($)', '價格（元）') },
          {
            id: `${id}-c2`,
            text: t('Quantity', '數量'),
            image: { src: TINY_PNG, widthPx: 10, heightPx: 10, altText: t('A photo', '一張相片') },
          },
        ],
      },
      {
        id: `${id}-r2`,
        cells: [
          { id: `${id}-c3`, text: t('10', '10'), colSpan: 2 },
          { id: `${id}-c4`, text: t('hidden', '隱藏'), covered: true },
        ],
      },
    ],
  };
}

/** Every text a plotted diagram can carry, each on its own element. */
export function fullDiagram(): Diagram {
  const blank = createBlankDiagram();
  return {
    ...blank,
    title: t('Figure 1', '圖一'),
    x: { ...blank.x, title: t('Quantity', '數量'), ticks: [{ id: 'xt1', at: 0.5, label: t('Q₀', 'Q₀') }] },
    y: { ...blank.y, title: t('Price', '價格'), ticks: [{ id: 'yt1', at: 0.5, label: t('P₀', 'P₀') }] },
    curves: [{ id: 'c1', points: [{ x: 0.1, y: 0.9 }, { x: 0.9, y: 0.1 }], shape: 'straight', label: t('D', 'D') }],
    points: [
      {
        id: 'pt1', at: { x: 0.5, y: 0.5 }, label: t('E', 'E'),
        xTickLabel: t('Q₁', 'Q₁'), yTickLabel: t('P₁', 'P₁'),
      },
    ],
    labels: [{ id: 'l1', at: { x: 0.7, y: 0.7 }, text: t('Surplus', '盈餘') }],
    arrows: [{ id: 'a1', from: { x: 0.2, y: 0.2 }, to: { x: 0.3, y: 0.3 }, label: t('shift', '移動') }],
    spans: [{ id: 's1', from: { x: 0.1, y: 0.1 }, to: { x: 0.4, y: 0.1 }, style: 'bracket', label: t('Tax', '稅') }],
    areas: [
      {
        id: 'ar1', vertices: [{ x: 0, y: 0 }, { x: 0.2, y: 0 }, { x: 0, y: 0.2 }],
        label: t('Consumer surplus', '消費者盈餘'),
      },
    ],
  };
}

function diagram(id: string, value: Diagram = fullDiagram()): DiagramBlock {
  return { kind: 'diagram', id, diagram: value, widthPx: 400, heightPx: 335, altText: t('A diagram', '一幅圖') };
}

function templateDiagram(id: string, templateId: string): DiagramBlock {
  return { ...createDiagramBlock(templateId), id };
}

function scheme(id: string): MarkScheme {
  return {
    routes: [
      {
        id: `${id}-route`,
        groups: [
          {
            id: `${id}-group`,
            points: [
              {
                id: `${id}-point`,
                text: t('Demand falls', '需求下降'),
                marks: 1,
                alternatives: [t('Demand decreases', '需求減少')],
              },
            ],
          },
        ],
      },
    ],
    levels: [{ id: `${id}-level`, min: 1, max: 2, descriptor: t('Some analysis', '部分分析') }],
    ec: { max: 1, descriptors: [{ id: `${id}-ec`, marks: 1, text: t('Clear', '清晰') }] },
  };
}

const paragraph = (id: string, en: string, zh: string): ContentBlock => ({ kind: 'paragraph', id, text: t(en, zh) });

export function kitchenSinkMcq(): McqQuestion {
  return {
    id: 'mcq1',
    type: 'mcq',
    blocks: [
      paragraph('mcq1-stem', 'Which is correct?', '以下哪項正確？'),
      table('mcq1-table'),
      {
        kind: 'image', id: 'mcq1-img', src: TINY_PNG, widthPx: 10, heightPx: 10,
        caption: t('A market', '一個市場'), altText: t('Stalls', '攤檔'),
      },
    ],
    marks: 1,
    statements: [t('Price rises', '價格上升'), t('Output falls', '產量下降')],
    options: [
      { id: 'o1', text: t('(1) only', '只有(1)'), rationale: t('Too narrow', '太狹窄') },
      { id: 'o2', text: t('(2) only', '只有(2)'), blocks: [templateDiagram('o2-fig', 'supply-demand')] },
      { id: 'o3', text: t('Both', '兩者皆是') },
      { id: 'o4', text: t('Neither', '兩者皆不是') },
    ],
    answerIndex: 2,
    explanation: t('Both follow.', '兩者皆成立。'),
    provenance: t('Modelled on DSE 2023', '仿照 2023 年文憑試'),
  };
}

export function kitchenSinkStructured(): StructuredQuestion {
  return {
    id: 'sq1',
    type: 'structured',
    blocks: [
      paragraph('sq1-stem', 'Study the sources.', '細閱以下資料。'),
      {
        kind: 'source', id: 'sq1-src', label: t('Source A: Housing', '資料甲：房屋'),
        blocks: [paragraph('sq1-src-p', 'Rents rose.', '租金上升。'), table('sq1-src-table', false)],
        footnote: t('* Waiting time', '* 輪候時間'),
      },
      { kind: 'figureRow', id: 'sq1-row', figure: diagram('sq1-row-fig'), table: table('sq1-row-table', false) },
    ],
    // Printed only without parts, so unprinted here.
    answerGraph: { lines: 8, xTitle: t('Quantity', '數量'), yTitle: t('Price', '價格') },
    answerDiagram: diagram('sq1-ans'),
    parts: [
      {
        id: 'sq1-a',
        blocksBefore: [paragraph('sq1-a-before', 'Now suppose a tax.', '現假設徵稅。')],
        blocks: [paragraph('sq1-a-p', 'Explain.', '解釋。')],
        answer: t('Because demand falls.', '因為需求下降。'),
        scheme: scheme('sq1-a'),
        answerGraph: { lines: 6, xTitle: t('Q', 'Q'), yTitle: t('P', 'P') },
        answerDiagram: templateDiagram('sq1-a-ans', 'supply-demand'),
        subParts: [
          {
            id: 'sq1-a-i',
            blocks: [paragraph('sq1-a-i-p', 'Draw it.', '繪圖。')],
            answer: t('See the figure.', '見圖。'),
            scheme: scheme('sq1-a-i'),
            answerGraph: { lines: 6, xTitle: t('Output', '產量') },
            answerDiagram: templateDiagram('sq1-a-i-ans', 'supply-demand'),
          },
        ],
      },
    ],
  };
}

/** A question with no parts: its own answer figures print. */
export function kitchenSinkEssay(): StructuredQuestion {
  return {
    id: 'sq2',
    type: 'structured',
    blocks: [paragraph('sq2-stem', 'Discuss.', '試討論。'), templateDiagram('sq2-pie', 'pie')],
    parts: [],
    answerGraph: { lines: 8, xTitle: t('Time', '時間'), yTitle: t('Income', '收入') },
    answerDiagram: templateDiagram('sq2-ans', 'flow'),
  };
}

export function buildTranslateFixture(): Worksheet {
  const line = (id: string, en: string, zh: string) => ({ id, text: t(en, zh) });
  return {
    ...createWorksheet(),
    id: 'kitchen-sink',
    title: t('Kitchen sink', '雜項'),
    instructions: t('Answer ALL questions.', '回答全部問題。'),
    cover: {
      cornerLines: [line('cv-corner', 'PAPER 2', '試卷二')],
      headLines: [line('cv-head', 'Economics', '經濟')],
      instructionsHeading: t('INSTRUCTIONS', '考生須知'),
      instructions: [line('cv-ins', 'Write in ink.', '用墨水筆作答。')],
      panelNote: t('Stick your label here', '請在此貼上電腦條碼'),
      panelFieldLabel: t('Candidate number', '考生編號'),
      footLines: [line('cv-foot', 'Not to be taken away', '不可攜離試場')],
      footNote: t('© School', '© 學校'),
    },
    bands: [
      {
        id: 'mast',
        zones: {
          left: [{ kind: 'text', id: 'f-text', text: t('Mock exam', '模擬試') }],
          center: [
            { kind: 'totalMarks', id: 'f-total', prefix: t('Full marks: ', '總分：'), suffix: t(' marks', '分') },
            // A pre-migration field: only the deprecated `label`.
            { kind: 'fillIn', id: 'f-fill', label: t('Name:', '姓名：') },
          ],
          right: [{ kind: 'pageNumber', id: 'f-page', prefix: t('Page ', '第') }],
        },
      },
    ],
    header: {
      enabled: true,
      bands: [{ id: 'hd', zones: { left: [{ kind: 'text', id: 'f-hd', text: t('Economics', '經濟') }], center: [], right: [] } }],
      firstPage: {
        bands: [{ id: 'hd1', zones: { left: [], center: [{ kind: 'text', id: 'f-hd1', text: t('Page one', '第一頁') }], right: [] } }],
      },
    },
    footer: {
      enabled: false,
      bands: [{ id: 'ft', zones: { left: [], center: [], right: [{ kind: 'text', id: 'f-ft', text: t('Footer', '頁尾') }] } }],
      firstPage: {
        bands: [{ id: 'ft1', zones: { left: [{ kind: 'text', id: 'f-ft1', text: t('First footer', '首頁頁尾') }], center: [], right: [] } }],
      },
    },
    layout: [
      { kind: 'section', id: 'L-sec', text: t('Section A', '甲部') },
      { kind: 'partHeader', id: 'L-part', text: t('Part A', '甲部分') },
      { kind: 'heading', id: 'L-head', text: t('Heading', '標題') },
      { kind: 'questionCount', id: 'L-count', prefix: t('There are ', '本卷共有'), suffix: t(' questions.', '題。') },
      { kind: 'text', id: 'L-note', text: t('Read carefully.', '細閱。') },
      {
        kind: 'stimulus', id: 'L-stim', prefix: t('Study the figure for Questions ', '細閱下圖，回答第'),
        blocks: [paragraph('L-stim-p', 'A forum.', '一個論壇。'), templateDiagram('L-stim-forum', 'forum')],
      },
      {
        kind: 'labelList', id: 'L-list',
        rows: [{ id: 'L-row', label: t('First choice:', '首選：'), value: t('A movie', '看電影') }],
      },
      { kind: 'divider', id: 'L-rule' },
    ],
    questions: [kitchenSinkMcq(), kitchenSinkStructured(), kitchenSinkEssay()],
    flow: [
      { type: 'layout', id: 'L-sec' },
      { type: 'layout', id: 'L-part' },
      { type: 'layout', id: 'L-count' },
      { type: 'question', id: 'mcq1' },
      { type: 'layout', id: 'L-head' },
      { type: 'layout', id: 'L-stim' },
      { type: 'question', id: 'sq1' },
      { type: 'layout', id: 'L-note' },
      { type: 'layout', id: 'L-list' },
      { type: 'question', id: 'sq2' },
      { type: 'layout', id: 'L-rule' },
    ],
    pageFurniture: { frame: true, marginNote: t('Do not write in the margin', '請勿在邊界內書寫') },
  };
}
