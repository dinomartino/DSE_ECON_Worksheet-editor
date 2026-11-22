'use client';

import { Fragment, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { gaps, marksText, percent, type CoverageReport, type KeyPointRow, type TopicRow } from '@/coverage/report';
import type { CoverageResult } from '@/coverage/result';
import { bandWord, confWord, nameIn, reportText } from '@/coverage/reportText';
import { BANDS } from '@/coverage/types';
import { PAPER_SIZES, twipsToPt } from '@/model/page';
import type { PaperSize } from '@/model/types';
import type { PdfPage } from '@/platform';
import { lookupCode } from '@/syllabus';

/**
 * The coverage report as printed sheets (k-0489, "Download report (PDF)"): what the dialog
 * shows, laid out on real pages in the paper's language, for the engine's print of
 * `#print-root` (`printJob.tsx`) — the same path every PDF of this app takes. No second PDF
 * renderer: the browser writes the bytes, `savePdf` on the desktop.
 *
 * The report is a list of blocks (a heading, a table row, one question) measured once off
 * screen, then packed into sheets of the page size: a table that runs on repeats its header,
 * a heading never ends a page. Portrait, the first paper's page size.
 */

const TWIPS_PER_PX = 15;
const MARGIN = { top: 56, side: 60, bottom: 64 };
const FOOTER_FROM_BOTTOM = 28;

export function reportPageBox(size: PaperSize, pages: number): PdfPage {
  const { width, height } = PAPER_SIZES[size] ?? PAPER_SIZES.A4;
  return { widthPt: twipsToPt(width), heightPt: twipsToPt(height), landscape: false, pages };
}

interface Block {
  key: string;
  node: ReactNode;
  /** A row of this table: the table's header goes first on every sheet it starts. */
  table?: 'papers' | 'topics';
  /** A heading: moved to the next sheet rather than left at the foot of this one. */
  keepWithNext?: boolean;
}

type Placed = { block: number } | { head: 'papers' | 'topics' };

/**
 * Sheets from measured heights: in order, a new sheet when the next block (with its table's
 * header, and for a heading the block after it) does not fit. A block taller than a sheet
 * goes alone. Pure, for the tests.
 */
export function packBlocks(
  blocks: ReadonlyArray<Pick<Block, 'table' | 'keepWithNext'>>,
  heights: readonly number[],
  heads: Readonly<Record<'papers' | 'topics', number>>,
  room: number,
): Placed[][] {
  const pages: Placed[][] = [];
  let page: Placed[] = [];
  let used = 0;
  let open: Block['table'];
  const cost = (i: number, fresh: boolean) => {
    const b = blocks[i];
    return heights[i] + (b.table && (fresh || open !== b.table) ? heads[b.table] : 0);
  };
  blocks.forEach((b, i) => {
    let need = cost(i, false);
    if (b.keepWithNext && i + 1 < blocks.length) need += heights[i + 1] + (blocks[i + 1].table ? heads[blocks[i + 1].table!] : 0);
    if (page.length > 0 && used + need > room) {
      pages.push(page);
      page = [];
      used = 0;
      open = undefined;
    }
    if (b.table && open !== b.table) {
      page.push({ head: b.table });
      used += heads[b.table];
    }
    page.push({ block: i });
    used += heights[i];
    open = b.table;
  });
  if (page.length > 0) pages.push(page);
  return pages;
}

const GRID_TOPICS = 'minmax(0,1fr) 40px 40px 52px 40px 48px 48px 104px';
const GRID_PAPERS = 'minmax(0,1fr) 68px 52px 92px 92px';

export function CoverageReportSheets({ coverage }: { coverage: CoverageResult }) {
  const blocks = useMemo(() => reportBlocks(coverage), [coverage]);
  const heads = useMemo(() => tableHeads(coverage), [coverage]);
  const { width, height } = PAPER_SIZES[coverage.pageSize] ?? PAPER_SIZES.A4;
  const sheet = { width: width / TWIPS_PER_PX, height: height / TWIPS_PER_PX };
  const contentWidth = sheet.width - 2 * MARGIN.side;
  const room = sheet.height - MARGIN.top - MARGIN.bottom;

  const probe = useRef<HTMLDivElement>(null);
  // The sheets of the blocks they were packed for; other blocks (a rebuilt report) measure again.
  const [packed, setPacked] = useState<{ blocks: Block[]; pages: Placed[][] } | null>(null);
  const pages = packed?.blocks === blocks ? packed.pages : null;

  // Measured once fonts are in; a Chinese face arriving late would re-wrap every line.
  useLayoutEffect(() => {
    let live = true;
    const measure = () => {
      const root = probe.current;
      if (!live || !root) return;
      const h = (selector: string) => (root.querySelector(selector) as HTMLElement | null)?.getBoundingClientRect().height ?? 0;
      const heights = blocks.map((_, i) => h(`[data-block="${i}"]`));
      setPacked({ blocks, pages: packBlocks(blocks, heights, { papers: h('[data-head="papers"]'), topics: h('[data-head="topics"]') }, room) });
    };
    const ready = typeof document !== 'undefined' && document.fonts ? document.fonts.ready : Promise.resolve();
    void ready.then(() => requestAnimationFrame(measure));
    return () => {
      live = false;
    };
  }, [blocks, room]);

  const t = reportText(coverage.language);
  const lang = coverage.language === 'zh' ? 'zh-HK' : 'en';
  const sheetStyle = {
    width: sheet.width,
    height: sheet.height,
    padding: `${MARGIN.top}px ${MARGIN.side}px ${MARGIN.bottom}px`,
  };

  return (
    <div lang={lang}>
      {!pages && (
        <div ref={probe} aria-hidden data-print-hide style={{ position: 'fixed', left: -100000, top: 0, visibility: 'hidden' }}>
          <div className="paper coverage-sheet" style={{ width: contentWidth }}>
            <div data-head="papers">{heads.papers}</div>
            <div data-head="topics">{heads.topics}</div>
            {blocks.map((b, i) => (
              <div key={b.key} data-block={i}>
                {b.node}
              </div>
            ))}
          </div>
        </div>
      )}
      {pages && (
        <div id="print-root" className="flex flex-col items-center gap-6">
          {pages.map((items, p) => (
            <div key={p} data-page-index={p}>
              <div className="paper paper-shadow coverage-sheet relative box-border overflow-hidden" style={sheetStyle}>
                {items.map((item) =>
                  'head' in item ? (
                    <Fragment key={`head-${item.head}`}>{heads[item.head]}</Fragment>
                  ) : (
                    <Fragment key={blocks[item.block].key}>{blocks[item.block].node}</Fragment>
                  ),
                )}
                <div
                  className="absolute flex justify-between text-[8pt] text-[#666]"
                  style={{ left: MARGIN.side, right: MARGIN.side, bottom: FOOTER_FROM_BOTTOM }}
                >
                  <span className="truncate pr-4">
                    {coverage.title} · {t.reportTitle}
                  </span>
                  <span className="shrink-0 tabular-nums">{t.page(p + 1, pages.length)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function tableHeads(coverage: CoverageResult): Record<'papers' | 'topics', ReactNode> {
  const t = reportText(coverage.language);
  const cell = 'px-1.5 py-1 text-right';
  // A heading wraps between words only (the sheet's `overflow-wrap: break-word` would split "Evaluate").
  const head = { gridTemplateColumns: GRID_PAPERS, overflowWrap: 'normal' as const };
  return {
    papers: (
      <div className="grid border-b border-[#999] bg-[#f1f1f1] text-[8pt] font-semibold text-[#444]" style={head}>
        <div className="px-1.5 py-1">{t.colPaper}</div>
        <div className={cell}>{t.colQuestions}</div>
        <div className={cell}>{t.colMarks}</div>
        <div className={cell}>{t.keyPoints}</div>
        <div className={cell}>{t.hours}</div>
      </div>
    ),
    topics: (
      <div className="grid border-b border-[#999] bg-[#f1f1f1] text-[8pt] font-semibold text-[#444]" style={{ ...head, gridTemplateColumns: GRID_TOPICS }}>
        <div className="px-1.5 py-1">{t.colTopic}</div>
        <div className={cell}>{t.colKnow}</div>
        <div className={cell}>{t.colApply}</div>
        <div className={cell}>{t.colEvaluate}</div>
        <div className={cell}>{t.colMarks}</div>
        <div className={cell}>{t.colShare}</div>
        <div className={cell}>{t.colHours}</div>
        <div className="px-1.5 py-1">{t.colWhere}</div>
      </div>
    ),
  };
}

const share = (hit: number, of: number) => percent(of ? hit / of : null);
const cellMarks = (marks: number) => (marks > 0 ? marksText(marks) : '');

/** Every block of the report, in reading order. */
function reportBlocks(coverage: CoverageResult): Block[] {
  const t = reportText(coverage.language);
  const name = nameIn(coverage.language);
  const report = coverage.report;
  const date = new Date(coverage.at);
  const out: Block[] = [];
  const heading = (key: string, text: string) =>
    out.push({ key, keepWithNext: true, node: <h2 className="pb-1.5 pt-4 text-[11.5pt] font-semibold">{text}</h2> });

  const scope =
    coverage.scope === 'set'
      ? t.scopeSet((coverage.papers ?? []).map((p) => t.paper(p.paper)).join(t.paperJoin))
      : coverage.scope === 'part'
        ? t.scopePart(report.questions)
        : t.scopePaper;
  out.push({
    key: 'title',
    node: (
      <div className="pb-3">
        <div className="text-[9pt] font-medium uppercase tracking-wide text-[#666]">{t.reportTitle}</div>
        <h1 className="pt-0.5 text-[17pt] font-semibold leading-tight">{coverage.title}</h1>
        <div className="grid grid-cols-[auto_1fr] gap-x-3 pt-2 text-[9pt] text-[#333]">
          <span className="text-[#666]">{t.checked}</span>
          <span>{t.date(date)}</span>
          <span className="text-[#666]">{t.scope}</span>
          <span>
            {scope} · {t.analysed(report.analysed, report.questions)}
          </span>
        </div>
        <div className="pt-1 text-[9pt] text-[#333]">{t.syllabus}</div>
        <p className="pt-1.5 text-[8.5pt] text-[#666]">{t.disclaimer}</p>
      </div>
    ),
  });

  out.push({ key: 'tiles', node: <Tiles report={report} language={coverage.language} /> });

  const notes = [
    report.elective.counted
      ? t.electiveCounted(report.elective.counted === 'EL1' ? t.electivePart1 : t.electivePart2)
      : t.electiveNone,
    report.marks.untagged > 0 ? t.untagged(marksText(report.marks.untagged)) : '',
    report.missing > 0 ? t.notAnalysed(report.missing) : '',
  ].filter(Boolean);
  out.push({ key: 'notes', node: <p className="pt-2 text-[9pt] text-[#333]">{notes.join(' ')}</p> });

  if (coverage.papers && coverage.papers.length > 0) {
    heading('h-papers', t.byPaper);
    for (const p of coverage.papers) {
      const r = p.report;
      out.push({
        key: `paper-${p.paper}`,
        table: 'papers',
        node: (
          <div className="grid border-b border-[#ddd] text-[9pt]" style={{ gridTemplateColumns: GRID_PAPERS }}>
            <div className="px-1.5 py-1">
              <span className="font-medium">{t.paper(p.paper)}</span>
              {p.title && <span className="text-[#666]"> · {p.title}</span>}
            </div>
            <div className="px-1.5 py-1 text-right tabular-nums">{r.analysed}</div>
            <div className="px-1.5 py-1 text-right tabular-nums">{marksText(r.marks.total)}</div>
            <div className="px-1.5 py-1 text-right tabular-nums">{share(r.breadth.keyPoints.hit, r.breadth.keyPoints.of)}</div>
            <div className="px-1.5 py-1 text-right tabular-nums">{share(r.breadth.hours.hit, r.breadth.hours.of)}</div>
          </div>
        ),
      });
    }
  }

  heading('h-topics', t.byTopic);
  for (const topic of report.topics) {
    out.push({ key: `topic-${topic.code}`, table: 'topics', node: <TopicRowView topic={topic} language={coverage.language} /> });
    for (const keyPoint of topic.keyPoints) {
      out.push({
        key: `kp-${keyPoint.code}`,
        table: 'topics',
        node: <KeyPointRowView keyPoint={keyPoint} muted={!topic.counted} language={coverage.language} />,
      });
    }
  }

  heading('h-gaps', t.gaps);
  const missing = gaps(report);
  if (missing.length === 0) out.push({ key: 'gaps-none', node: <p className="text-[9pt]">{t.gapsNone}</p> });
  for (const { topic, keyPoints } of missing) {
    out.push({
      key: `gap-${topic.code}`,
      node: (
        <div className="pb-1.5 text-[9pt]">
          <span className="font-medium">
            {topic.code} {name(topic)}
          </span>
          <span className="text-[#666]"> · {t.keyPointsOf(topic.keyPoints.length - keyPoints.length, topic.keyPoints.length)}</span>
          <ul className="list-disc pl-5 text-[#333]">
            {keyPoints.map((keyPoint) => (
              <li key={keyPoint.code}>{name(keyPoint)}</li>
            ))}
          </ul>
        </div>
      ),
    });
  }

  heading('h-units', t.byQuestion);
  for (const unit of report.units) {
    out.push({
      key: `unit-${unit.where.paper ?? 0}-${unit.where.at}`,
      node: (
        <div className="break-inside-avoid border-b border-[#eee] py-1 text-[9pt]">
          <span className="font-medium">{t.where(unit.where)}</span>
          <span className="text-[#666]"> · {t.unitMarks(marksText(unit.marks))}</span>
          {!unit.ok && <span className="text-[#a35200]"> · {t.unitFailed}</span>}
          {unit.ok && unit.picks.length === 0 && <span className="text-[#666]"> · {t.unitNone}</span>}
          {unit.picks.map((pick) => {
            const hit = lookupCode(pick.code);
            const label = hit ? `${name(hit.keyPoint)}${hit.point && hit.point.en !== hit.keyPoint.en ? ` · ${name(hit.point)}` : ''}` : pick.code;
            return (
              <div key={pick.code} className="pl-3 text-[#333]">
                {label}{' '}
                <span className="text-[#666]">
                  ({pick.main ? t.main : t.also}, {bandWord(t, pick.band)}, {confWord(t, pick.conf)})
                </span>
                {pick.why && <span> — {pick.why}</span>}
              </div>
            );
          })}
        </div>
      ),
    });
  }

  out.push({ key: 'denominators', node: <p className="pt-3 text-[8pt] text-[#666]">{t.denominators}</p> });
  return out;
}

function Tiles({ report, language }: { report: CoverageReport; language: CoverageResult['language'] }) {
  const t = reportText(language);
  const { keyPoints, points, hours } = report.breadth;
  const tagged = report.confidence.high + report.confidence.medium + report.confidence.low;
  const conf = (n: number) => percent(tagged ? n / tagged : null);
  const tiles = [
    { label: t.keyPoints, value: share(keyPoints.hit, keyPoints.of), detail: t.ofN(String(keyPoints.hit), String(keyPoints.of)) },
    { label: t.hours, value: share(hours.hit, hours.of), detail: t.hoursOf(marksText(hours.hit), String(hours.of)) },
    { label: t.points, value: share(points.hit, points.of), detail: t.ofN(String(points.hit), String(points.of)) },
    { label: t.marks, value: marksText(report.marks.total), detail: '' },
  ];
  return (
    <div>
      <div className="grid grid-cols-4 gap-2">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded border border-[#ccc] px-2.5 py-1.5">
            <div className="text-[8pt] text-[#555]">{tile.label}</div>
            <div className="text-[16pt] font-semibold tabular-nums leading-tight">{tile.value}</div>
            {tile.detail && <div className="text-[8pt] tabular-nums text-[#666]">{tile.detail}</div>}
          </div>
        ))}
      </div>
      <div className="pt-1.5 text-[8.5pt] text-[#555]">
        {t.confidence(conf(report.confidence.high), conf(report.confidence.medium), conf(report.confidence.low))}
      </div>
    </div>
  );
}

function TopicRowView({ topic, language }: { topic: TopicRow; language: CoverageResult['language'] }) {
  const t = reportText(language);
  const hit = topic.keyPoints.filter((keyPoint) => keyPoint.hit).length;
  return (
    <div
      className={`grid border-b border-[#ccc] bg-[#f7f7f7] text-[9pt] font-semibold ${topic.counted ? '' : 'text-[#888]'}`}
      style={{ gridTemplateColumns: GRID_TOPICS }}
    >
      <div className="px-1.5 py-1">
        <span className="pr-1 tabular-nums text-[#666]">{topic.code}</span>
        {nameIn(language)(topic)}
        <span className="pl-1.5 text-[8pt] font-normal text-[#666]">
          {topic.counted ? t.keyPointsOf(hit, topic.keyPoints.length) : t.notCounted}
        </span>
      </div>
      {BANDS.map((band) => (
        <div key={band} className="px-1.5 py-1 text-right tabular-nums">
          {cellMarks(topic.bands[band])}
        </div>
      ))}
      <div className="px-1.5 py-1 text-right tabular-nums">{cellMarks(topic.marks)}</div>
      <div className="px-1.5 py-1 text-right tabular-nums">{topic.marks > 0 ? percent(topic.marksShare) : ''}</div>
      <div className="px-1.5 py-1 text-right tabular-nums">{percent(topic.hoursShare)}</div>
      <div />
    </div>
  );
}

function KeyPointRowView({ keyPoint, muted, language }: { keyPoint: KeyPointRow; muted: boolean; language: CoverageResult['language'] }) {
  const t = reportText(language);
  const name = nameIn(language);
  const dim = muted || !keyPoint.hit;
  return (
    <div className={`grid border-b border-[#e6e6e6] text-[8.5pt] ${dim ? 'text-[#999]' : ''}`} style={{ gridTemplateColumns: GRID_TOPICS }}>
      <div className="py-0.5 pl-5 pr-1.5">
        {name(keyPoint)}
        {keyPoint.points.length > 0 && <div className="text-[7.5pt] text-[#666]">{t.pointsLine(keyPoint.points.map(name).join(t.pointsJoin))}</div>}
      </div>
      {BANDS.map((band) => (
        <div key={band} className="px-1.5 py-0.5 text-right tabular-nums">
          {cellMarks(keyPoint.bands[band])}
        </div>
      ))}
      <div className="px-1.5 py-0.5 text-right tabular-nums">{cellMarks(keyPoint.marks)}</div>
      <div />
      <div />
      <div className="px-1.5 py-0.5 text-[8pt]">{keyPoint.hit ? keyPoint.where.map((w) => t.where(w)).join(t.listJoin) : t.notTested}</div>
    </div>
  );
}
