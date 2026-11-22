'use client';

import { Fragment, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { insights, type SectionLine } from '@/coverage/insights';
import { gaps, marksText, percent, type CoverageReport, type KeyPointRow, type TopicRow, type UnitRow } from '@/coverage/report';
import type { CoverageResult } from '@/coverage/result';
import { bandWord, confWord, nameIn, reportText } from '@/coverage/reportText';
import { BANDS, type Band } from '@/coverage/types';
import { PAPER_SIZES, twipsToPt } from '@/model/page';
import type { PaperSize } from '@/model/types';
import type { PdfPage } from '@/platform';
import { lookupCode } from '@/syllabus';

/**
 * The coverage report as printed sheets (k-0489, redesigned in v2 after the layout of
 * HKEAA's examination reports): a summary page first — key figures, a few plain
 * sentences, the skills the marks go to, every section's coverage as a bar — then the gaps
 * with what to add next, each topic's key points in a roomy table, and the per-question
 * mapping as an appendix. All in the paper's language (`reportText`), on the paper's size,
 * one sans face throughout (Latin first, then the platform's Traditional Chinese face, so
 * no tofu on Mac, Windows or Linux), running header and page numbers.
 *
 * It goes out through the engine's print of `#print-root` (`printJob.tsx`), the path every
 * PDF of this app takes: no second renderer. The report is a list of blocks measured once
 * off screen, then packed into sheets: a table that runs on repeats its header, a heading
 * never ends a sheet, a few sections start on a fresh one.
 */

const TWIPS_PER_PX = 15;
const MARGIN = { top: 70, side: 60, bottom: 68 };
const HEADER_FROM_TOP = 30;
const FOOTER_FROM_BOTTOM = 30;

/** The palette: print-safe, readable in greyscale (bars are dark on a light track). */
const C = {
  ink: '#1b2230',
  muted: '#566072',
  faint: '#8b94a3',
  rule: '#dde2e8',
  track: '#e6eaf0',
  accent: '#1e5d8a',
  accentSoft: '#edf3f8',
  panel: '#f5f7f9',
  warnBg: '#fdf6ea',
  warnRule: '#efd5a6',
  warnInk: '#7a4800',
};
const SKILL: Record<Band, string> = { know: '#a9cbe3', apply: '#4a8bbd', evaluate: '#1b4a6e' };

export function reportPageBox(size: PaperSize, pages: number): PdfPage {
  const { width, height } = PAPER_SIZES[size] ?? PAPER_SIZES.A4;
  return { widthPt: twipsToPt(width), heightPt: twipsToPt(height), landscape: false, pages };
}

type Table = 'papers' | 'sections' | 'keyPoints' | 'units';

interface Block {
  key: string;
  node: ReactNode;
  /** A row of this table: the table's header goes first on every sheet it starts. */
  table?: Table;
  /** A heading: moved to the next sheet rather than left at the foot of this one. */
  keepWithNext?: boolean;
  /** Starts a fresh sheet (a major section). */
  breakBefore?: boolean;
  /** Starts a fresh sheet unless at least this share of one is still free (a major section that should not start in a corner). */
  breakUnless?: number;
}

type Placed = { block: number } | { head: Table };

/**
 * Sheets from measured heights: in order, a new sheet when the next block (with its table's
 * header, and for a heading the block after it) does not fit, or when it starts a major
 * section (always, or when too little of the sheet is left). A block taller than a sheet
 * goes alone. Pure, for the tests.
 */
export function packBlocks(
  blocks: ReadonlyArray<Pick<Block, 'keepWithNext' | 'breakBefore' | 'breakUnless'> & { table?: string }>,
  heights: readonly number[],
  heads: Readonly<Record<string, number>>,
  room: number,
): Array<Array<{ block: number } | { head: string }>> {
  const pages: Array<Array<{ block: number } | { head: string }>> = [];
  let page: Array<{ block: number } | { head: string }> = [];
  let used = 0;
  let open: string | undefined;
  const headOf = (table: string | undefined) => (table ? (heads[table] ?? 0) : 0);
  blocks.forEach((b, i) => {
    let need = heights[i] + (b.table && open !== b.table ? headOf(b.table) : 0);
    if (b.keepWithNext && i + 1 < blocks.length) need += heights[i + 1] + headOf(blocks[i + 1].table);
    const cornered = b.breakUnless !== undefined && room - used < b.breakUnless * room;
    if (page.length > 0 && (b.breakBefore || cornered || used + need > room)) {
      pages.push(page);
      page = [];
      used = 0;
      open = undefined;
    }
    if (b.table && open !== b.table) {
      page.push({ head: b.table });
      used += headOf(b.table);
    }
    page.push({ block: i });
    used += heights[i];
    open = b.table;
  });
  if (page.length > 0) pages.push(page);
  return pages;
}

const GRID = {
  papers: 'minmax(0,1fr) 64px 56px 200px',
  sections: '30px minmax(0,1fr) 170px 64px',
  keyPoints: 'minmax(0,1fr) 150px 44px 118px',
  units: '64px 50px minmax(0,1fr)',
  picks: 'minmax(0,1fr) 84px minmax(0,1fr)',
};

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
      const headHeights = Object.fromEntries((Object.keys(heads) as Table[]).map((table) => [table, h(`[data-head="${table}"]`)]));
      setPacked({ blocks, pages: packBlocks(blocks, heights, headHeights, room) as Placed[][] });
    };
    const ready = typeof document !== 'undefined' && document.fonts ? document.fonts.ready : Promise.resolve();
    void ready.then(() => requestAnimationFrame(measure));
    return () => {
      live = false;
    };
  }, [blocks, heads, room]);

  const t = reportText(coverage.language);
  const lang = coverage.language === 'zh' ? 'zh-HK' : 'en';
  const sheetStyle: CSSProperties = {
    width: sheet.width,
    height: sheet.height,
    padding: `${MARGIN.top}px ${MARGIN.side}px ${MARGIN.bottom}px`,
    color: C.ink,
  };
  const edge: CSSProperties = { left: MARGIN.side, right: MARGIN.side, color: C.faint, fontSize: '7.5pt' };

  return (
    <div lang={lang}>
      {!pages && (
        <div ref={probe} aria-hidden data-print-hide style={{ position: 'fixed', left: -100000, top: 0, visibility: 'hidden' }}>
          <div className="paper coverage-sheet" style={{ width: contentWidth }}>
            {(Object.keys(heads) as Table[]).map((table) => (
              <div key={table} data-head={table}>
                {heads[table]}
              </div>
            ))}
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
                {p > 0 && (
                  <div
                    className="absolute flex justify-between gap-4"
                    style={{ ...edge, top: HEADER_FROM_TOP, paddingBottom: 5, borderBottom: `0.5pt solid ${C.rule}` }}
                  >
                    <span className="truncate">{t.runningHead(coverage.title)}</span>
                    <span className="shrink-0">
                      {t.brand} · {t.reportTitle}
                    </span>
                  </div>
                )}
                {items.map((item) =>
                  'head' in item ? (
                    <Fragment key={`head-${item.head}`}>{heads[item.head]}</Fragment>
                  ) : (
                    <Fragment key={blocks[item.block].key}>{blocks[item.block].node}</Fragment>
                  ),
                )}
                <div className="absolute flex justify-between gap-4" style={{ ...edge, bottom: FOOTER_FROM_BOTTOM }}>
                  <span className="truncate">
                    {t.checked} {t.date(new Date(coverage.at))} · {t.footNote}
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

/* ── Pieces ─────────────────────────────────────────────────────────────── */

const share = (hit: number, of: number) => percent(of ? hit / of : null);

function Bar({ value, height = 7, width }: { value: number; height?: number; width?: number | string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div style={{ width: width ?? '100%', height, borderRadius: height / 2, background: C.track, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', borderRadius: height / 2, background: C.accent }} />
    </div>
  );
}

function H2({ children, hint, top = 18 }: { children: ReactNode; hint?: string; top?: number }) {
  return (
    <div style={{ paddingTop: top, paddingBottom: 8 }}>
      <h2 style={{ fontSize: '12.5pt', fontWeight: 700, color: C.ink, paddingBottom: 4, borderBottom: `1pt solid ${C.accent}` }}>{children}</h2>
      {hint && <p style={{ paddingTop: 5, fontSize: '8.5pt', color: C.muted }}>{hint}</p>}
    </div>
  );
}

function H3({ children, color = C.ink }: { children: ReactNode; color?: string }) {
  return <h3 style={{ fontSize: '10pt', fontWeight: 700, color, paddingTop: 10, paddingBottom: 4 }}>{children}</h3>;
}

function Badge({ code, muted }: { code: string; muted?: boolean }) {
  return (
    <span
      style={{
        display: 'inline-block',
        minWidth: 22,
        padding: '1px 4px',
        borderRadius: 4,
        background: muted ? C.panel : C.accentSoft,
        color: muted ? C.faint : C.accent,
        fontWeight: 700,
        fontSize: '8pt',
        textAlign: 'center',
      }}
    >
      {code}
    </span>
  );
}

/** The table heads, one per kind, repeated on each sheet a table runs onto. */
function tableHeads(coverage: CoverageResult): Record<Table, ReactNode> {
  const t = reportText(coverage.language);
  // A heading wraps between words only (the sheet's `overflow-wrap: break-word` would split "Evaluate").
  const head = (columns: string): CSSProperties => ({
    display: 'grid',
    gridTemplateColumns: columns,
    overflowWrap: 'normal',
    fontSize: '7.5pt',
    fontWeight: 600,
    color: C.muted,
    textTransform: coverage.language === 'en' ? 'uppercase' : undefined,
    letterSpacing: coverage.language === 'en' ? '0.04em' : undefined,
    borderBottom: `0.75pt solid ${C.faint}`,
  });
  const cell: CSSProperties = { padding: '4px 6px' };
  const right: CSSProperties = { ...cell, textAlign: 'right' };
  return {
    papers: (
      <div style={head(GRID.papers)}>
        <div style={cell}>{t.colPaper}</div>
        <div style={right}>{t.colQuestions}</div>
        <div style={right}>{t.colMarks}</div>
        <div style={cell}>{t.colTested}</div>
      </div>
    ),
    sections: (
      <div style={head(GRID.sections)}>
        <div style={cell} />
        <div style={cell}>{t.colSection}</div>
        <div style={cell}>{t.colTested}</div>
        <div style={right}>{t.colShare}</div>
      </div>
    ),
    keyPoints: (
      <div style={head(GRID.keyPoints)}>
        <div style={{ ...cell, paddingLeft: 0 }}>{t.colKeyPoint}</div>
        <div style={cell}>{t.colTestedIn}</div>
        <div style={right}>{t.colMarks}</div>
        <div style={cell}>{t.colSkills}</div>
      </div>
    ),
    units: (
      <div style={head(GRID.units)}>
        <div style={{ ...cell, paddingLeft: 0 }}>{t.colQuestion}</div>
        <div style={right}>{t.colMarks}</div>
        <div style={{ display: 'grid', gridTemplateColumns: GRID.picks }}>
          <div style={cell}>{t.colTests}</div>
          <div style={cell}>{t.colSkill}</div>
          <div style={cell}>{t.colNote}</div>
        </div>
      </div>
    ),
  };
}

/* ── The blocks, in reading order ────────────────────────────────────────── */

function reportBlocks(coverage: CoverageResult): Block[] {
  const t = reportText(coverage.language);
  const name = nameIn(coverage.language);
  const report = coverage.report;
  const facts = insights(report);
  const out: Block[] = [];
  const heading = (key: string, text: string, opts: { hint?: string; breakUnless?: number; top?: number } = {}) =>
    out.push({ key, keepWithNext: true, breakUnless: opts.breakUnless, node: <H2 hint={opts.hint} top={opts.top}>{text}</H2> });

  // 1. Title and what was checked.
  const scope =
    coverage.scope === 'set'
      ? t.scopeSet((coverage.papers ?? []).map((p) => t.paper(p.paper)).join(t.paperJoin))
      : coverage.scope === 'part'
        ? t.scopePart(report.questions)
        : t.scopePaper;
  const meta: Array<[string, string]> = [
    [t.checked, t.date(new Date(coverage.at))],
    [t.scope, scope],
    [t.colQuestions, t.analysed(report.analysed, report.questions)],
    [t.syllabusLabel, t.syllabus],
  ];
  out.push({
    key: 'cover',
    node: (
      <div style={{ paddingBottom: 6 }}>
        <div
          style={{
            fontSize: '8pt',
            fontWeight: 700,
            color: C.accent,
            letterSpacing: coverage.language === 'en' ? '0.08em' : '0.04em',
            textTransform: coverage.language === 'en' ? 'uppercase' : undefined,
          }}
        >
          {t.brand} · {t.reportTitle}
        </div>
        <h1 style={{ fontSize: '21pt', fontWeight: 700, lineHeight: 1.2, paddingTop: 6, paddingBottom: 12 }}>{coverage.title}</h1>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto minmax(0,1fr) auto minmax(0,1fr)',
            columnGap: 12,
            rowGap: 4,
            padding: '10px 0',
            borderTop: `0.75pt solid ${C.rule}`,
            borderBottom: `0.75pt solid ${C.rule}`,
            fontSize: '9pt',
          }}
        >
          {meta.map(([label, value]) => (
            <Fragment key={label}>
              <span style={{ color: C.muted }}>{label}</span>
              <span>{value}</span>
            </Fragment>
          ))}
        </div>
        <p style={{ paddingTop: 8, fontSize: '8pt', color: C.muted }}>{t.disclaimer}</p>
      </div>
    ),
  });

  // 2. Key figures.
  heading('h-figures', t.keyFigures, { top: 12 });
  out.push({ key: 'figures', node: <Figures report={report} language={coverage.language} /> });

  // 3. At a glance: a few plain sentences, then the skills the marks go to.
  heading('h-glance', t.atAGlance);
  out.push({ key: 'glance', node: <Glance coverage={coverage} /> });
  if (facts.skills) out.push({ key: 'skills', node: <Skills skills={facts.skills} language={coverage.language} /> });

  // 4. A whole set: each paper.
  if (coverage.papers && coverage.papers.length > 0) {
    heading('h-papers', t.byPaper);
    for (const p of coverage.papers) {
      const r = p.report;
      const { hit, of } = r.breadth.keyPoints;
      out.push({
        key: `paper-${p.paper}`,
        table: 'papers',
        node: (
          <div style={{ display: 'grid', gridTemplateColumns: GRID.papers, alignItems: 'center', borderBottom: `0.5pt solid ${C.rule}`, fontSize: '9pt' }}>
            <div style={{ padding: '6px' }}>
              <span style={{ fontWeight: 600 }}>{t.paper(p.paper)}</span>
              {p.title && <span style={{ color: C.muted }}> · {p.title}</span>}
            </div>
            <div style={{ padding: '6px', textAlign: 'right' }} className="tabular-nums">
              {r.analysed}
            </div>
            <div style={{ padding: '6px', textAlign: 'right' }} className="tabular-nums">
              {marksText(r.marks.total)}
            </div>
            <div style={{ padding: '6px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Bar value={of ? hit / of : 0} width={80} />
              <span className="tabular-nums" style={{ whiteSpace: 'nowrap' }}>
                {share(hit, of)} <span style={{ color: C.muted }}>({t.ofN(String(hit), String(of))})</span>
              </span>
            </div>
          </div>
        ),
      });
    }
  }

  // 5. Every section as a bar.
  heading('h-sections', t.bySection, { hint: t.bySectionHint });
  for (const line of facts.sections) out.push({ key: `section-${line.topic.code}`, table: 'sections', node: <SectionRow line={line} language={coverage.language} /> });

  // 6. Gaps and suggestions: one tinted panel over several blocks.
  heading('h-gaps', t.gapsTitle);
  const missing = gaps(report);
  const panel = (key: string, node: ReactNode, edge: 'top' | 'middle' | 'bottom' | 'only') =>
    out.push({
      key,
      node: (
        <div
          style={{
            background: C.warnBg,
            borderLeft: `0.75pt solid ${C.warnRule}`,
            borderRight: `0.75pt solid ${C.warnRule}`,
            borderTop: edge === 'top' || edge === 'only' ? `0.75pt solid ${C.warnRule}` : undefined,
            borderBottom: edge === 'bottom' || edge === 'only' ? `0.75pt solid ${C.warnRule}` : undefined,
            borderRadius: edge === 'only' ? 8 : edge === 'top' ? '8px 8px 0 0' : edge === 'bottom' ? '0 0 8px 8px' : 0,
            padding: `${edge === 'top' || edge === 'only' ? 12 : 2}px 14px ${edge === 'bottom' || edge === 'only' ? 12 : 2}px`,
          }}
        >
          {node}
        </div>
      ),
    });
  const notes = [
    report.elective.counted ? t.electiveCounted(report.elective.counted === 'EL1' ? t.electivePart1 : t.electivePart2) : t.electiveNone,
    report.marks.untagged > 0 ? t.untagged(marksText(report.marks.untagged)) : '',
    report.missing > 0 ? t.notAnalysed(report.missing) : '',
    facts.lowConfidence >= 0.25 ? t.checkLow(percent(facts.lowConfidence)) : '',
  ].filter(Boolean);
  if (missing.length === 0) {
    panel('gaps-none', <p style={{ fontSize: '10pt', fontWeight: 600, color: C.warnInk }}>{t.gapsNone}</p>, 'only');
  } else {
    panel(
      'gaps-lead',
      <div>
        <p style={{ fontSize: '10.5pt', fontWeight: 700, color: C.warnInk }}>{t.gapsLead(facts.gapCount)}</p>
        {facts.untested.length > 0 && (
          <div style={{ paddingTop: 8 }}>
            <div style={{ fontSize: '8.5pt', fontWeight: 600, color: C.warnInk, paddingBottom: 4 }}>{t.untestedSections}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {facts.untested.map((s) => (
                <span key={s.topic.code} style={{ background: '#fff', border: `0.75pt solid ${C.warnRule}`, borderRadius: 10, padding: '1px 8px', fontSize: '8.5pt' }}>
                  {s.topic.code} {name(s.topic)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>,
      'top',
    );
    panel(
      'gaps-biggest',
      <div style={{ paddingTop: 8 }}>
        <div style={{ fontSize: '9.5pt', fontWeight: 700, color: C.warnInk }}>{t.biggestGaps}</div>
        <p style={{ fontSize: '8.5pt', color: C.muted, paddingBottom: 4 }}>{t.biggestGapsHint}</p>
        <ol style={{ margin: 0, padding: 0, listStyle: 'none', fontSize: '9pt' }}>
          {facts.biggestGaps.map(({ topic, keyPoint }, i) => (
            <li key={keyPoint.code} style={{ display: 'grid', gridTemplateColumns: '18px minmax(0,1fr)', paddingBottom: 3 }}>
              <span className="tabular-nums" style={{ fontWeight: 700, color: C.warnInk }}>{i + 1}.</span>
              <span>
              <span style={{ fontWeight: 600 }}>{name(keyPoint)}</span>
              <span style={{ color: C.muted }}>
                {' '}
                · {topic.code} {name(topic)} · {t.aboutHours(marksText(keyPoint.hours))}
              </span>
              </span>
            </li>
          ))}
        </ol>
      </div>,
      'middle',
    );
    panel('gaps-all', <div style={{ paddingTop: 8, fontSize: '9.5pt', fontWeight: 700, color: C.warnInk }}>{t.allGaps}</div>, 'middle');
    missing.forEach(({ topic, keyPoints }, i) =>
      panel(
        `gap-${topic.code}`,
        <div style={{ paddingTop: 4, paddingBottom: 2, fontSize: '8.5pt' }}>
          <span style={{ fontWeight: 600 }}>
            {topic.code} {name(topic)}
          </span>
          <span style={{ color: C.muted }}> · {t.keyPointsOf(topic.keyPoints.length - keyPoints.length, topic.keyPoints.length)}</span>
          <div style={{ color: C.ink, paddingLeft: 10 }}>{keyPoints.map((keyPoint) => name(keyPoint)).join(t.pointsJoin)}</div>
        </div>,
        i === missing.length - 1 && notes.length === 0 ? 'bottom' : 'middle',
      ),
    );
  }
  if (notes.length > 0 && missing.length > 0) {
    panel(
      'gaps-notes',
      <div style={{ paddingTop: 8, fontSize: '8.5pt', color: C.muted }}>
        <span style={{ fontWeight: 600, color: C.warnInk }}>{t.notes}: </span>
        {notes.join(' ')}
      </div>,
      'bottom',
    );
  } else if (notes.length > 0) {
    out.push({ key: 'notes', node: <p style={{ paddingTop: 8, fontSize: '8.5pt', color: C.muted }}>{notes.join(' ')}</p> });
  }

  // 7. Topic by topic.
  heading('h-topics', t.topicByTopic, { hint: t.topicByTopicHint, breakUnless: 0.4, top: 24 });
  for (const topic of report.topics) {
    out.push({ key: `topic-${topic.code}`, keepWithNext: true, node: <TopicHead topic={topic} language={coverage.language} /> });
    for (const keyPoint of topic.keyPoints) {
      out.push({ key: `kp-${keyPoint.code}`, table: 'keyPoints', node: <KeyPointLine keyPoint={keyPoint} muted={!topic.counted} language={coverage.language} /> });
    }
  }

  // 8. Appendix: question by question (a whole set by paper).
  heading('h-units', t.appendix, { hint: t.appendixHint, breakUnless: 0.4, top: 24 });
  const papers = [...new Set(report.units.map((u) => u.where.paper))];
  for (const paper of papers) {
    if (paper !== undefined) out.push({ key: `units-paper-${paper}`, keepWithNext: true, node: <H3 color={C.accent}>{t.paper(paper)}</H3> });
    for (const unit of report.units.filter((u) => u.where.paper === paper)) {
      out.push({ key: `unit-${unit.where.paper ?? 0}-${unit.where.at}`, table: 'units', node: <UnitLine unit={unit} language={coverage.language} /> });
    }
  }

  out.push({ key: 'denominators', node: <p style={{ paddingTop: 14, fontSize: '7.5pt', color: C.faint }}>{t.denominators}</p> });
  return out;
}

function Figures({ report, language }: { report: CoverageReport; language: CoverageResult['language'] }) {
  const t = reportText(language);
  const { keyPoints, points, hours } = report.breadth;
  const tagged = report.confidence.high + report.confidence.medium + report.confidence.low;
  const conf = (n: number) => percent(tagged ? n / tagged : null);
  const small = [
    { label: t.hours, value: share(hours.hit, hours.of), detail: t.hoursOf(marksText(hours.hit), String(hours.of)), bar: hours.of ? hours.hit / hours.of : 0 },
    { label: t.points, value: share(points.hit, points.of), detail: t.ofN(String(points.hit), String(points.of)), bar: points.of ? points.hit / points.of : 0 },
    { label: t.marks, value: marksText(report.marks.total), detail: '', bar: null },
  ];
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr 1fr 1fr', gap: 10 }}>
        <div style={{ background: C.accentSoft, borderRadius: 8, padding: '12px 14px' }}>
          <div style={{ fontSize: '8.5pt', color: C.muted }}>{t.keyPoints}</div>
          <div className="tabular-nums" style={{ fontSize: '28pt', fontWeight: 700, lineHeight: 1.1, color: C.accent }}>
            {share(keyPoints.hit, keyPoints.of)}
          </div>
          <div style={{ fontSize: '9pt', paddingBottom: 7 }}>{t.headline(keyPoints.hit, keyPoints.of)}</div>
          <Bar value={keyPoints.of ? keyPoints.hit / keyPoints.of : 0} height={8} />
        </div>
        {small.map((f) => (
          <div key={f.label} style={{ border: `0.75pt solid ${C.rule}`, borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: '8pt', color: C.muted, minHeight: '2.4em' }}>{f.label}</div>
            <div className="tabular-nums" style={{ fontSize: '17pt', fontWeight: 700, lineHeight: 1.15 }}>
              {f.value}
            </div>
            {f.detail && <div style={{ fontSize: '8pt', color: C.muted, paddingBottom: 5 }}>{f.detail}</div>}
            {f.bar !== null && <Bar value={f.bar} height={5} />}
          </div>
        ))}
      </div>
      <div style={{ paddingTop: 6, fontSize: '8pt', color: C.muted }}>
        {t.confidence(conf(report.confidence.high), conf(report.confidence.medium), conf(report.confidence.low))}
      </div>
    </div>
  );
}

function Glance({ coverage }: { coverage: CoverageResult }) {
  const t = reportText(coverage.language);
  const name = nameIn(coverage.language);
  const report = coverage.report;
  const facts = insights(report);
  const { hit, of } = report.breadth.keyPoints;
  const subject = coverage.scope === 'set' ? t.subjectSet : coverage.scope === 'part' ? t.subjectPart : t.subjectPaper;
  const counted = report.elective.counted;
  const parts = counted ? t.partsWith(counted === 'EL1' ? t.electivePart1 : t.electivePart2) : t.partsCompulsory;
  const list = (lines: SectionLine[]) => lines.map((s) => t.sectionCount(s.topic.code, name(s.topic), s.hit, s.of)).join(t.paperJoin);
  const sentences = [
    t.glanceCoverage(subject, hit, of, share(hit, of), parts),
    facts.best.length > 0 ? t.glanceBest(list(facts.best)) : '',
    facts.untested.length > 0 ? t.glanceUntested(facts.untested.map((s) => `${s.topic.code} ${name(s.topic)}`).join(t.paperJoin)) : t.glanceAllSections,
    facts.topSkill && facts.skills ? t.glanceSkill(bandWord(t, facts.topSkill), percent(facts.skills[facts.topSkill])) : '',
  ].filter(Boolean);
  return (
    <p style={{ background: C.panel, borderRadius: 8, padding: '11px 14px', fontSize: '10pt', lineHeight: 1.65 }}>
      {sentences.join(coverage.language === 'zh' ? '' : ' ')}
    </p>
  );
}

function Skills({ skills, language }: { skills: Record<Band, number>; language: CoverageResult['language'] }) {
  const t = reportText(language);
  return (
    <div style={{ paddingTop: 12 }}>
      <div style={{ fontSize: '9pt', fontWeight: 700, paddingBottom: 6 }}>{t.skillsTitle}</div>
      <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', background: C.track }}>
        {BANDS.map((band) => (skills[band] > 0 ? <div key={band} style={{ width: `${skills[band] * 100}%`, background: SKILL[band] }} /> : null))}
      </div>
      <div style={{ display: 'flex', gap: 18, paddingTop: 6, fontSize: '8.5pt' }}>
        {BANDS.map((band) => (
          <span key={band} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: SKILL[band], display: 'inline-block' }} />
            {bandWord(t, band)} <span className="tabular-nums" style={{ fontWeight: 600 }}>{percent(skills[band])}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function SectionRow({ line, language }: { line: SectionLine; language: CoverageResult['language'] }) {
  const t = reportText(language);
  const { topic, hit, of } = line;
  const muted = !topic.counted;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: GRID.sections,
        alignItems: 'center',
        borderBottom: `0.5pt solid ${C.rule}`,
        fontSize: '9pt',
        color: muted ? C.faint : C.ink,
      }}
    >
      <div style={{ padding: '5px 0' }}>
        <Badge code={topic.code} muted={muted} />
      </div>
      <div style={{ padding: '5px 6px' }}>
        {nameIn(language)(topic)}
        {muted && <span style={{ fontSize: '8pt' }}> · {t.notCounted}</span>}
      </div>
      <div style={{ padding: '5px 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Bar value={line.share} width={96} />
        <span className="tabular-nums" style={{ fontWeight: hit === 0 && !muted ? 700 : 500, color: hit === 0 && !muted ? C.warnInk : undefined }}>
          {hit} / {of}
        </span>
      </div>
      <div className="tabular-nums" style={{ padding: '5px 6px', textAlign: 'right' }}>
        {topic.marks > 0 ? percent(topic.marksShare) : '–'}
      </div>
    </div>
  );
}

function TopicHead({ topic, language }: { topic: TopicRow; language: CoverageResult['language'] }) {
  const t = reportText(language);
  const hit = topic.keyPoints.filter((keyPoint) => keyPoint.hit).length;
  const muted = !topic.counted;
  return (
    <div style={{ paddingTop: 14, paddingBottom: 4, display: 'flex', alignItems: 'baseline', gap: 8, color: muted ? C.faint : C.ink }}>
      <Badge code={topic.code} muted={muted} />
      <span style={{ fontSize: '10.5pt', fontWeight: 700 }}>{nameIn(language)(topic)}</span>
      <span style={{ marginLeft: 'auto', fontSize: '8.5pt', color: C.muted }} className="tabular-nums">
        {muted ? t.notCounted : t.keyPointsOf(hit, topic.keyPoints.length)}
        {topic.marks > 0 && ` · ${t.unitMarks(marksText(topic.marks))} (${percent(topic.marksShare)})`}
      </span>
    </div>
  );
}

function KeyPointLine({ keyPoint, muted, language }: { keyPoint: KeyPointRow; muted: boolean; language: CoverageResult['language'] }) {
  const t = reportText(language);
  const name = nameIn(language);
  const dim = muted || !keyPoint.hit;
  const skills = BANDS.filter((band) => keyPoint.bands[band] > 0).map((band) => `${bandWord(t, band)} ${marksText(keyPoint.bands[band])}`);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: GRID.keyPoints, borderBottom: `0.5pt solid ${C.rule}`, fontSize: '9pt', color: dim ? C.faint : C.ink }}>
      <div style={{ padding: '5px 6px 5px 0' }}>
        {name(keyPoint)}
        {keyPoint.points.length > 0 && (
          <div style={{ fontSize: '7.5pt', color: C.muted, paddingTop: 1 }}>{t.pointsLine(keyPoint.points.map(name).join(t.pointsJoin))}</div>
        )}
      </div>
      <div style={{ padding: '5px 6px' }}>{keyPoint.hit ? keyPoint.where.map((w) => t.where(w)).join(t.listJoin) : <span style={{ fontStyle: language === 'en' ? 'italic' : undefined }}>{t.notTested}</span>}</div>
      <div className="tabular-nums" style={{ padding: '5px 6px', textAlign: 'right' }}>
        {keyPoint.marks > 0 ? marksText(keyPoint.marks) : ''}
      </div>
      <div style={{ padding: '5px 6px', fontSize: '8pt', color: C.muted }}>{skills.join(t.listJoin)}</div>
    </div>
  );
}

function UnitLine({ unit, language }: { unit: UnitRow; language: CoverageResult['language'] }) {
  const t = reportText(language);
  const name = nameIn(language);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: GRID.units, borderBottom: `0.5pt solid ${C.rule}`, fontSize: '8.5pt' }}>
      <div style={{ padding: '5px 6px 5px 0', fontWeight: 700 }}>{t.where({ at: unit.where.at })}</div>
      <div className="tabular-nums" style={{ padding: '5px 6px', textAlign: 'right' }}>
        {marksText(unit.marks)}
      </div>
      <div>
        {!unit.ok && <div style={{ padding: '5px 6px', color: C.warnInk }}>{t.unitFailed}</div>}
        {unit.ok && unit.picks.length === 0 && <div style={{ padding: '5px 6px', color: C.muted }}>{t.unitNone}</div>}
        {unit.picks.map((pick) => {
          const hit = lookupCode(pick.code);
          const label = hit ? `${name(hit.keyPoint)}${hit.point && hit.point.en !== hit.keyPoint.en ? ` · ${name(hit.point)}` : ''}` : pick.code;
          return (
            <div key={pick.code} style={{ display: 'grid', gridTemplateColumns: GRID.picks }}>
              <div style={{ padding: '5px 6px' }}>
                <span style={{ fontWeight: pick.main ? 600 : 400 }}>
                  {hit ? `${hit.topic.code} · ` : ''}
                  {label}
                </span>
                <span style={{ color: C.faint }}> ({pick.main ? t.main : t.also})</span>
              </div>
              <div style={{ padding: '5px 6px', color: C.muted, overflowWrap: 'normal' }}>
                {bandWord(t, pick.band)}
                <div style={{ fontSize: '7.5pt', color: C.faint }}>{t.sure(confWord(t, pick.conf))}</div>
              </div>
              <div style={{ padding: '5px 6px', color: C.muted }}>{pick.why}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
