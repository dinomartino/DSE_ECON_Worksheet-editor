'use client';

import { Fragment, useMemo, useState } from 'react';
import type { CoverageReport, ElectiveChoice, ElectiveCode, KeyPointRow, TopicRow } from '@/coverage/report';
import { marksText, percent } from '@/coverage/report';
import { BANDS, type Band, type Confidence } from '@/coverage/types';
import { useMessages, useUiLanguage } from '@/i18n/language';
import { lookupCode } from '@/syllabus';
import { Button, Segmented } from '@/components/ui';
import { Dialog } from '@/components/ui/Dialog';
import { COVERAGE_MESSAGES } from './coverageReport.messages';

/**
 * The syllabus coverage report (k-0317): headline numbers with their denominators named,
 * the C13 grid (topic → key point × band, marks, % of marks, % of lesson hours) with the
 * untested key points greyed, and what the AI said per part. Read-only, teacher-facing,
 * never printed (a dialog, outside `#print-root`).
 */
export function CoverageReportDialog({
  report: first,
  rebuild,
  onClose,
}: {
  report: CoverageReport;
  rebuild(choice: ElectiveChoice): CoverageReport;
  onClose(): void;
}) {
  const m = useMessages(COVERAGE_MESSAGES);
  const zh = useUiLanguage() !== 'en';
  const [choice, setChoice] = useState<ElectiveChoice>('auto');
  const report = useMemo(() => (choice === 'auto' ? first : rebuild(choice)), [choice, first, rebuild]);
  const name = (row: { en: string; zh: string }) => (zh ? row.zh : row.en);
  const { keyPoints, points, hours } = report.breadth;
  const share = (hit: number, of: number) => percent(of ? hit / of : null);
  const conf = (c: Confidence) => {
    const tagged = report.confidence.high + report.confidence.medium + report.confidence.low;
    return percent(tagged ? report.confidence[c] / tagged : null);
  };
  const electiveName = (code: ElectiveCode) => (code === 'EL1' ? m.electivePart1 : m.electivePart2);
  const bandLabel: Record<Band, string> = { know: m.colKnow, apply: m.colApply, evaluate: m.colEvaluate };

  return (
    <Dialog title={m.title} description={m.description(report.questions)} size="large" onClose={onClose}
      footer={<Button variant="primary" onClick={onClose}>{m.close}</Button>}
    >
      <div className="space-y-4 px-5 pb-5 pt-4 text-[13px] text-ink" data-print-hide>
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
                  {topic.keyPoints.map((kp) => <KeyPointLine key={kp.code} kp={kp} name={name(kp)} pointNames={kp.points.map(name)} muted={!topic.counted} />)}
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
              <li key={unit.where} className="text-[12px]">
                <span className="font-medium">{m.questionWhere(unit.where)}</span>
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
  const hit = topic.keyPoints.filter((kp) => kp.hit).length;
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

function KeyPointLine({ kp, name, pointNames, muted }: { kp: KeyPointRow; name: string; pointNames: string[]; muted: boolean }) {
  const m = useMessages(COVERAGE_MESSAGES);
  const dim = muted || !kp.hit;
  const where = kp.hit ? kp.where.map((w) => m.questionWhere(w)).join(m.listJoin) : m.notTested;
  return (
    <tr className={`border-t border-line/60 align-top ${dim ? 'text-ink-subtle' : ''}`}>
      <td className="py-1 pl-8 pr-3">
        {name}
        {pointNames.length > 0 && <div className="text-[11px] text-ink-subtle">{m.pointsLine(pointNames.join(m.pointsJoin))}</div>}
        <div className="text-[11px] lg:hidden">{where}</div>
      </td>
      {BANDS.map((band) => <td key={band} className="hidden px-2 py-1 text-right tabular-nums md:table-cell">{cell(kp.bands[band])}</td>)}
      <td className="px-2 py-1 text-right tabular-nums">{cell(kp.marks)}</td>
      <td />
      <td className="hidden sm:table-cell" />
      <td className="hidden px-3 py-1 text-[11.5px] lg:table-cell">{where}</td>
    </tr>
  );
}

/** Marks in a grid cell: blank for none, so the eye finds what is there. */
const cell = (marks: number) => (marks > 0 ? marksText(marks) : '');
