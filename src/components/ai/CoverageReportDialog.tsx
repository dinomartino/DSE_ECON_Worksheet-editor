'use client';

import { Fragment, useMemo, useState } from 'react';
import type { CoverageReport, ElectiveChoice, ElectiveCode, KeyPointRow, TopicRow, Where } from '@/coverage/report';
import { marksText, percent } from '@/coverage/report';
import type { CoverageResult } from '@/coverage/result';
import { nameIn, reportFileName } from '@/coverage/reportText';
import { BANDS, type Band, type Confidence } from '@/coverage/types';
import { useMessages, useUiLanguage } from '@/i18n/language';
import { chooseSavePath, isDesktop, PDF_FILTERS, revealFile, revealLabel } from '@/platform';
import { lookupCode } from '@/syllabus';
import { Button, Segmented } from '@/components/ui';
import { Dialog } from '@/components/ui/Dialog';
import { browserJobDeps, printJobPdf } from '@/components/editor/printJob';
import { COVERAGE_MESSAGES } from './coverageReport.messages';

/**
 * The syllabus coverage report (k-0317): headline numbers with their denominators named,
 * the C13 grid (topic → key point × band, marks, % of marks, % of lesson hours) with the
 * untested key points greyed, and what the AI said per part. Read-only, teacher-facing;
 * the dialog itself is never printed (outside `#print-root`).
 *
 * k-0489: syllabus names and the AI's notes are in the paper's language
 * (`coverage.language`), the chrome in the app's; "Download report (PDF)" prints the report
 * as its own sheets (`CoverageReportSheets`, the print job path), all in the paper's
 * language; a whole set's report shows the set or one paper at a time.
 */
type Status = { kind: 'idle' } | { kind: 'busy' } | { kind: 'saved'; path: string } | { kind: 'note'; text: string };

export function CoverageReportDialog({
  coverage: first,
  rebuild,
  onClose,
}: {
  coverage: CoverageResult;
  rebuild(choice: ElectiveChoice): CoverageResult;
  onClose(): void;
}) {
  const m = useMessages(COVERAGE_MESSAGES);
  const uiZh = useUiLanguage() !== 'en';
  const [choice, setChoice] = useState<ElectiveChoice>('auto');
  const coverage = useMemo(() => (choice === 'auto' ? first : rebuild(choice)), [choice, first, rebuild]);
  const [view, setView] = useState<'set' | number>('set');
  const shownPaper = view === 'set' ? undefined : coverage.papers?.find((p) => p.paper === view);
  const report: CoverageReport = shownPaper?.report ?? coverage.report;
  const name = nameIn(coverage.language);
  const where = (w: Where) => (w.paper !== undefined ? m.paperWhere(w.paper, w.at) : m.questionWhere(w.at));
  const { keyPoints, points, hours } = report.breadth;
  const share = (hit: number, of: number) => percent(of ? hit / of : null);
  const conf = (c: Confidence) => {
    const tagged = report.confidence.high + report.confidence.medium + report.confidence.low;
    return percent(tagged ? report.confidence[c] / tagged : null);
  };
  const electiveName = (code: ElectiveCode) => (code === 'EL1' ? m.electivePart1 : m.electivePart2);
  const bandLabel: Record<Band, string> = { know: m.colKnow, apply: m.colApply, evaluate: m.colEvaluate };
  const desktop = isDesktop();

  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const download = async () => {
    setStatus({ kind: 'busy' });
    try {
      let file: string | undefined;
      if (desktop) {
        file = await chooseSavePath(reportFileName(coverage.title, coverage.language), PDF_FILTERS);
        if (!file) {
          setStatus({ kind: 'idle' });
          return;
        }
      }
      const outcome = await printJobPdf({ kind: 'coverage', coverage, label: m.title }, browserJobDeps(), file);
      if ('saved' in outcome) setStatus({ kind: 'saved', path: outcome.saved });
      else setStatus(outcome.fallback ? { kind: 'note', text: m.savedFallback(outcome.fallback) } : { kind: 'idle' });
    } catch (cause) {
      setStatus({ kind: 'note', text: m.downloadFailed(cause instanceof Error ? cause.message : String(cause)) });
    }
  };
  const savedName = status.kind === 'saved' ? status.path.split(/[\\/]/).pop() ?? status.path : '';

  const footer = (
    <div className="flex w-full flex-wrap items-center justify-end gap-2">
      <div className="mr-auto min-w-0 text-[12px] text-ink-muted" role="status">
        {status.kind === 'busy' && m.downloading}
        {status.kind === 'saved' && (
          <span>
            {m.saved(savedName)}{' '}
            <button type="button" className="text-accent-ink underline underline-offset-2" onClick={() => void revealFile(status.path)}>
              {revealLabel()}
            </button>
          </span>
        )}
        {status.kind === 'note' && <span className="text-warn-ink">{status.text}</span>}
        {status.kind === 'idle' && !desktop && m.downloadWebHint}
      </div>
      <Button onClick={() => void download()} disabled={status.kind === 'busy'}>
        {m.download}
      </Button>
      <Button variant="primary" onClick={onClose}>{m.close}</Button>
    </div>
  );

  return (
    <Dialog title={m.title} description={m.description(report.questions)} size="large" onClose={onClose} footer={footer}>
      <div className="space-y-4 px-5 pb-5 pt-4 text-[13px] text-ink" data-print-hide>
        {coverage.papers && coverage.papers.length > 0 && (
          <Segmented<string>
            label={m.viewPick}
            value={String(view)}
            options={[{ value: 'set', label: m.viewSet }, ...coverage.papers.map((p) => ({ value: String(p.paper), label: m.viewPaper(p.paper) }))]}
            onChange={(value) => setView(value === 'set' ? 'set' : Number(value))}
          />
        )}

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Tile label={m.keyPoints} sub={m.byCount} value={share(keyPoints.hit, keyPoints.of)} detail={m.ofN(String(keyPoints.hit), String(keyPoints.of))} />
          <Tile label={m.hours} sub={m.byHours} value={share(hours.hit, hours.of)} detail={m.hoursOf(marksText(hours.hit), String(hours.of))} />
          <Tile label={m.points} sub={m.detail} value={share(points.hit, points.of)} detail={m.ofN(String(points.hit), String(points.of))} />
          <Tile label={m.marksTile} value={marksText(report.marks.total)} detail={m.confidenceLine(conf('high'), conf('medium'), conf('low'))} />
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-muted">
          {report.elective.found.length === 0 && <span>{m.electiveNone}</span>}
          {report.elective.found.length === 1 && <span>{m.electiveOne(electiveName(report.elective.found[0]))}</span>}
          {report.elective.found.length === 2 && (
            <Segmented<ElectiveCode>
              label={m.electivePick}
              value={report.elective.counted ?? 'EL1'}
              options={[{ value: 'EL1', label: m.electivePart1 }, { value: 'EL2', label: m.electivePart2 }]}
              onChange={setChoice}
            />
          )}
          {report.marks.untagged > 0 && <span>{m.untaggedMarks(marksText(report.marks.untagged))}</span>}
          {report.missing > 0 && <span className="text-warn-ink">{m.notAnalysed(report.missing)}</span>}
        </div>

        {view === 'set' && coverage.papers && coverage.papers.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full border-collapse text-[12.5px]">
              <caption className="sr-only">{m.byPaper}</caption>
              <thead>
                <tr className="whitespace-nowrap border-b border-line bg-surface-sunken text-left text-[11.5px] text-ink-muted">
                  <th className="px-3 py-2 font-medium">{m.colPaper}</th>
                  <th className="px-2 py-2 text-right font-medium">{m.colQuestions}</th>
                  <th className="px-2 py-2 text-right font-medium">{m.colMarks}</th>
                  <th className="px-2 py-2 text-right font-medium">{m.keyPoints}</th>
                  <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">{m.hours}</th>
                </tr>
              </thead>
              <tbody>
                {coverage.papers.map((p) => (
                  <tr key={p.paper} className="border-t border-line/60">
                    <td className="px-3 py-1.5">
                      <button type="button" className="font-medium underline-offset-2 hover:underline" onClick={() => setView(p.paper)}>
                        {m.viewPaper(p.paper)}
                      </button>
                      {p.title && <span className="text-ink-subtle"> · {p.title}</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{p.report.analysed}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{marksText(p.report.marks.total)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{share(p.report.breadth.keyPoints.hit, p.report.breadth.keyPoints.of)}</td>
                    <td className="hidden px-3 py-1.5 text-right tabular-nums sm:table-cell">{share(p.report.breadth.hours.hit, p.report.breadth.hours.of)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full border-collapse text-[12.5px] lg:min-w-[760px]">
            <thead>
              <tr className="whitespace-nowrap border-b border-line bg-surface-sunken text-left text-[11.5px] text-ink-muted">
                <th className="px-3 py-2 font-medium">{m.colTopic}</th>
                {BANDS.map((band) => <th key={band} className="hidden px-2 py-2 text-right font-medium md:table-cell">{bandLabel[band]}</th>)}
                <th className="px-2 py-2 text-right font-medium">{m.colMarks}</th>
                <th className="px-2 py-2 text-right font-medium">{m.colShare}</th>
                <th className="hidden px-2 py-2 text-right font-medium sm:table-cell">{m.colHours}</th>
                <th className="hidden px-3 py-2 font-medium lg:table-cell">{m.colWhere}</th>
              </tr>
            </thead>
            <tbody>
              {report.topics.map((topic) => (
                <Fragment key={topic.code}>
                  <TopicLine topic={topic} name={name(topic)} />
                  {topic.keyPoints.map((keyPoint) => <KeyPointLine key={keyPoint.code} keyPoint={keyPoint} name={name(keyPoint)} pointNames={keyPoint.points.map(name)} muted={!topic.counted} where={where} />)}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        <details className="rounded-lg border border-line px-3 py-2">
          <summary className="cursor-pointer select-none text-[12.5px] font-medium">{m.byQuestion}</summary>
          <p className="mt-1 text-[11.5px] text-ink-subtle">{m.byQuestionHint}</p>
          <ul className="mt-2 space-y-1.5">
            {report.units.map((unit) => (
              <li key={`${unit.where.paper ?? 0}-${unit.where.at}`} className="text-[12px]">
                <span className="font-medium">{where(unit.where)}</span>
                <span className="text-ink-subtle"> · {m.unitMarks(marksText(unit.marks))}</span>
                {!unit.ok && <span className="text-warn-ink"> · {m.unitFailed}</span>}
                {unit.ok && unit.picks.length === 0 && <span className="text-ink-subtle"> · {m.unitNone}</span>}
                {unit.picks.map((pick) => {
                  const hit = lookupCode(pick.code);
                  const label = hit ? `${name(hit.keyPoint)}${hit.point && hit.point.en !== hit.keyPoint.en ? ` · ${name(hit.point)}` : ''}` : pick.code;
                  return (
                    <div key={pick.code} className="ml-3 text-ink-muted">
                      <span className="text-ink">{label}</span>{' '}
                      <span className="text-ink-subtle">
                        ({pick.main ? m.main : m.also}, {bandText(m, pick.band)}, {confText(m, pick.conf)})
                      </span>
                      {pick.why && <span> — {pick.why}</span>}
                    </div>
                  );
                })}
              </li>
            ))}
          </ul>
        </details>

        <p className="text-[11.5px] text-ink-subtle">{m.denominators}</p>
        {(coverage.language === 'zh') !== uiZh && <p className="text-[11.5px] text-ink-subtle">{m.languageNote(coverage.language === 'zh')}</p>}
      </div>
    </Dialog>
  );
}

type M = ReturnType<typeof useMessages<typeof COVERAGE_MESSAGES>>;
const bandText = (m: M, band: Band) => (band === 'know' ? m.bandKnow : band === 'apply' ? m.bandApply : m.bandEvaluate);
const confText = (m: M, conf: Confidence) => (conf === 'high' ? m.confHigh : conf === 'medium' ? m.confMedium : m.confLow);

function Tile({ label, sub, value, detail }: { label: string; sub?: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface-raised px-3 py-2">
      <div className="text-[11.5px] text-ink-muted">
        {label}
        {sub && <span className="text-ink-subtle"> · {sub}</span>}
      </div>
      <div className="text-[22px] font-semibold tabular-nums leading-tight">{value}</div>
      <div className="text-[11.5px] tabular-nums text-ink-subtle">{detail}</div>
    </div>
  );
}

function TopicLine({ topic, name }: { topic: TopicRow; name: string }) {
  const m = useMessages(COVERAGE_MESSAGES);
  const hit = topic.keyPoints.filter((keyPoint) => keyPoint.hit).length;
  return (
    <tr className={`border-t border-line bg-surface-sunken/60 font-medium ${topic.counted ? '' : 'text-ink-subtle'}`}>
      <td className="px-3 py-1.5">
        <span className="mr-1.5 tabular-nums text-ink-muted">{topic.code}</span>
        {name}
        <span className="ml-2 text-[11px] font-normal tabular-nums text-ink-subtle">
          {topic.counted ? m.keyPointsOf(hit, topic.keyPoints.length) : m.notCounted}
        </span>
      </td>
      {BANDS.map((band) => <td key={band} className="hidden px-2 py-1.5 text-right tabular-nums md:table-cell">{cell(topic.bands[band])}</td>)}
      <td className="px-2 py-1.5 text-right tabular-nums">{cell(topic.marks)}</td>
      <td className="px-2 py-1.5 text-right tabular-nums">{topic.marks > 0 ? percent(topic.marksShare) : ''}</td>
      <td className="hidden px-2 py-1.5 text-right tabular-nums sm:table-cell">{percent(topic.hoursShare)}</td>
      <td className="hidden lg:table-cell" />
    </tr>
  );
}

function KeyPointLine({ keyPoint, name, pointNames, muted, where: whereText }: { keyPoint: KeyPointRow; name: string; pointNames: string[]; muted: boolean; where(w: Where): string }) {
  const m = useMessages(COVERAGE_MESSAGES);
  const dim = muted || !keyPoint.hit;
  const where = keyPoint.hit ? keyPoint.where.map(whereText).join(m.listJoin) : m.notTested;
  return (
    <tr className={`border-t border-line/60 align-top ${dim ? 'text-ink-subtle' : ''}`}>
      <td className="py-1 pl-8 pr-3">
        {name}
        {pointNames.length > 0 && <div className="text-[11px] text-ink-subtle">{m.pointsLine(pointNames.join(m.pointsJoin))}</div>}
        <div className="text-[11px] lg:hidden">{where}</div>
      </td>
      {BANDS.map((band) => <td key={band} className="hidden px-2 py-1 text-right tabular-nums md:table-cell">{cell(keyPoint.bands[band])}</td>)}
      <td className="px-2 py-1 text-right tabular-nums">{cell(keyPoint.marks)}</td>
      <td />
      <td className="hidden sm:table-cell" />
      <td className="hidden px-3 py-1 text-[11.5px] lg:table-cell">{where}</td>
    </tr>
  );
}

/** Marks in a grid cell: blank for none, so the eye finds what is there. */
const cell = (marks: number) => (marks > 0 ? marksText(marks) : '');
