'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui';
import { ArchiveIcon, FolderOpenIcon } from '@/components/ui/icons';
import type { DocumentType } from '@/model/newWorksheet';
import { START_KINDS } from './startKinds';

/**
 * The desk before anything is saved: a welcome, and the four kinds of paper drawn as
 * the page each one prints, since a first-time teacher knows a Question-Answer Book by
 * its shape sooner than by its name. Each card opens the same new-worksheet form as the
 * panel's rows; the file routes below bring existing work in. Nothing is added to the
 * teacher's list on their behalf.
 */
export function WelcomeDesk({
  onCreate,
  onOpenFile,
  onRestore,
  restoring = false,
}: {
  onCreate: (type: DocumentType) => void;
  onOpenFile: () => void;
  onRestore: () => void;
  restoring?: boolean;
}) {
  return (
    <section
      aria-labelledby="welcome-heading"
      className="zone-light mt-4 animate-slide-up-in rounded-xl border border-line bg-surface px-6 pb-6 pt-7 xl:px-9 xl:pb-7 xl:pt-9"
    >
      <h2
        id="welcome-heading"
        className="font-display text-balance text-[26px] font-normal leading-[1.15] tracking-[-0.01em] text-ink xl:text-[30px]"
      >
        Welcome to Econ Studio
        <span lang="zh-HK" className="ml-3 align-[3px] text-[15px] tracking-normal text-ink-subtle xl:text-[16px]">
          歡迎使用經濟備課室
        </span>
      </h2>
      <p className="mt-2 max-w-2xl text-pretty text-[13px] leading-relaxed text-ink-muted">
        Choose the paper you want to print. You name it next, and every other setting starts
        from a default.
      </p>

      <ul className="mt-6 grid grid-cols-4 gap-3 xl:gap-5">
        {START_KINDS.map((kind, index) => (
          <li
            key={kind.type}
            className="min-w-0 animate-slide-up-in"
            style={{ animationDelay: `${60 + index * 30}ms` }}
          >
            <button
              type="button"
              onClick={() => onCreate(kind.type)}
              className="group block w-full cursor-pointer rounded-lg text-left focus-visible:outline-none"
            >
              {/* Hover is colour only: the tile tints and the accent ring fades in. */}
              <span className="flex justify-center rounded-lg bg-surface-sunken px-[16%] py-4 transition-colors duration-150 ease-out-soft group-hover:bg-surface-hover group-focus-visible:ring-2 group-focus-visible:ring-inset group-focus-visible:ring-accent xl:py-5">
                <span className="relative block w-full max-w-[128px] transition-transform duration-[180ms] ease-out-soft group-active:scale-[0.985] group-active:duration-100">
                  <span className="block overflow-hidden rounded-[2px] shadow-[0_1px_2px_rgba(0,0,0,0.16),0_4px_12px_rgba(0,0,0,0.12)] ring-1 ring-black/5">
                    <PaperSketch type={kind.type} />
                  </span>
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 rounded-[2px] opacity-0 ring-2 ring-accent transition-opacity duration-[180ms] ease-out-soft group-hover:opacity-100"
                  />
                </span>
              </span>
              <span className="mt-2.5 block text-[13px] font-medium leading-snug text-ink transition-colors duration-150 ease-out-soft group-hover:text-accent-ink">
                {kind.title}
              </span>
              <span lang="zh-HK" className="mt-0.5 block text-[11.5px] leading-snug text-ink-subtle">
                {kind.titleZh}
              </span>
              {/* From `xl` only: narrower, a card is ~110px and the panel's rows say it already. */}
              <span className="mt-1 hidden text-[11px] leading-snug text-ink-muted xl:block">{kind.caption}</span>
            </button>
          </li>
        ))}
      </ul>

      {/* Existing work: a file from another machine, or a whole backup. */}
      <div className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line pt-4">
        <span className="mr-1 text-[12px] text-ink-muted">Already have worksheets?</span>
        <Button variant="subtle" size="sm" onClick={onOpenFile}>
          <FolderOpenIcon size={14} />
          Open a file…
        </Button>
        <Button variant="subtle" size="sm" onClick={onRestore} disabled={restoring}>
          <ArchiveIcon size={14} />
          {restoring ? 'Restoring…' : 'Restore a backup…'}
        </Button>
        <span className="basis-full text-[11px] text-ink-subtle xl:ml-auto xl:basis-auto">
          Or drop a .json or .zip anywhere here.
        </span>
      </div>
    </section>
  );
}

/*
 * The four pages, sketched. Paper colours are literal hex (the paper is paper in either
 * theme, as the dashboard's thumbnails are); the one accent is the equilibrium point
 * and the chosen MCQ answer, the app mark's own blue.
 */
const PAPER = '#ffffff';
const HEAD = '#948d80';
const TEXT = '#dcd7cd';
const RULE = '#c9c3b7';
const ACCENT = '#2d6fc6';

function Bar({ x, y, w, h = 2.6, fill = TEXT }: { x: number; y: number; w: number; h?: number; fill?: string }) {
  return <rect x={x} y={y} width={w} height={h} rx={h / 2} fill={fill} />;
}

function Dotted({ y, x1 = 20, x2 = 108 }: { y: number; x1?: number; x2?: number }) {
  return (
    <line x1={x1} x2={x2} y1={y} y2={y} stroke={RULE} strokeWidth={0.9} strokeDasharray="0.1 2" strokeLinecap="round" />
  );
}

function Options({ y, pick }: { y: number; pick?: number }) {
  return (
    <>
      {[0, 1, 2, 3].map((i) => {
        const x = i % 2 === 0 ? 20 : 64;
        const oy = y + Math.floor(i / 2) * 6;
        return (
          <g key={i}>
            <circle cx={x + 1.6} cy={oy + 1.3} r={1.7} fill={pick === i ? ACCENT : 'none'} stroke={pick === i ? ACCENT : RULE} strokeWidth={0.8} />
            <Bar x={x + 5} y={oy} w={i % 2 === 0 ? 30 : 26} h={2.4} />
          </g>
        );
      })}
    </>
  );
}

function CandidateBoxes({ x, y }: { x: number; y: number }) {
  return (
    <>
      {Array.from({ length: 7 }, (_, i) => (
        <rect key={i} x={x + i * 6.2} y={y} width={5.2} height={6} fill="none" stroke={RULE} strokeWidth={0.7} />
      ))}
    </>
  );
}

const SKETCHES: Record<DocumentType, ReactNode> = {
  classroom: (
    <>
      <Bar x={30} y={13} w={60} h={5} fill={HEAD} />
      <Bar x={42} y={22} w={36} />
      <Bar x={12} y={32} w={38} h={2} />
      <Bar x={70} y={32} w={38} h={2} />
      <line x1={12} x2={108} y1={38.5} y2={38.5} stroke={TEXT} strokeWidth={0.8} />
      <Bar x={12} y={45} w={5} fill={HEAD} />
      <Bar x={20} y={45} w={86} />
      <Bar x={20} y={51} w={58} />
      <Options y={58} />
      <Bar x={12} y={77} w={5} fill={HEAD} />
      <Bar x={20} y={77} w={80} />
      <Options y={84} pick={2} />
      <Bar x={12} y={103} w={5} fill={HEAD} />
      <Bar x={20} y={103} w={88} />
      <Bar x={20} y={109} w={46} />
      {/* A supply-and-demand sketch: the subject, and the app mark's crossing. */}
      <path d="M21 117v29h36" fill="none" stroke={HEAD} strokeWidth={0.9} />
      <path d="M25 120l28 22M25 142l28-22" fill="none" stroke={HEAD} strokeWidth={1} strokeLinecap="round" />
      <circle cx={39} cy={131} r={2.3} fill={ACCENT} />
      {[121, 129, 137, 145].map((y) => (
        <line key={y} x1={64} x2={108} y1={y} y2={y} stroke={RULE} strokeWidth={0.8} />
      ))}
      <line x1={20} x2={108} y1={154} y2={154} stroke={RULE} strokeWidth={0.8} />
    </>
  ),
  lqWorksheet: (
    <>
      <Bar x={30} y={13} w={60} h={5} fill={HEAD} />
      <Bar x={40} y={22} w={40} />
      <Bar x={12} y={35} w={5} fill={HEAD} />
      <Bar x={20} y={35} w={88} />
      <Bar x={20} y={41} w={82} />
      <Bar x={20} y={47} w={48} />
      <Bar x={94} y={47} w={14} h={2.2} fill={RULE} />
      {[58, 66, 74, 82, 90].map((y) => (
        <Dotted key={y} y={y} />
      ))}
      <Bar x={12} y={102} w={5} fill={HEAD} />
      <Bar x={20} y={102} w={86} />
      <Bar x={20} y={108} w={54} />
      <Bar x={94} y={108} w={14} h={2.2} fill={RULE} />
      {[119, 127, 135, 143, 151, 159].map((y) => (
        <Dotted key={y} y={y} />
      ))}
    </>
  ),
  paper1: (
    <>
      <Bar x={12} y={12} w={22} h={3} fill={HEAD} />
      <Bar x={12} y={18} w={32} h={2.2} />
      <CandidateBoxes x={65} y={12} />
      <Bar x={26} y={36} w={68} h={6} fill={HEAD} />
      <Bar x={41} y={47} w={38} h={5} fill={HEAD} />
      <Bar x={44} y={57} w={32} h={2.4} />
      <rect x={12} y={68} width={96} height={62} rx={1.5} fill="none" stroke={TEXT} strokeWidth={0.8} />
      <Bar x={18} y={74} w={34} h={3} fill={HEAD} />
      {[82, 88.5, 95, 101.5, 108, 114.5, 121].map((y, i) => (
        <Bar key={y} x={18} y={y} w={[84, 78, 82, 70, 80, 64, 74][i]} h={2.2} />
      ))}
      <Bar x={12} y={142} w={40} h={2.4} />
      <Bar x={12} y={148} w={30} h={2.4} />
      {[0, 1, 2, 3].map((i) => (
        <circle key={i} cx={72 + i * 9} cy={146} r={2.6} fill={i === 1 ? ACCENT : 'none'} stroke={i === 1 ? ACCENT : RULE} strokeWidth={0.8} />
      ))}
    </>
  ),
  lqMock: (
    <>
      {/* The booklet's page frame and its staples. */}
      <rect x={7} y={7} width={106} height={156} fill="none" stroke={TEXT} strokeWidth={0.8} />
      <rect x={2.2} y={40} width={1.8} height={11} rx={0.9} fill={HEAD} />
      <rect x={2.2} y={119} width={1.8} height={11} rx={0.9} fill={HEAD} />
      <Bar x={13} y={13} w={22} h={3} fill={HEAD} />
      <Bar x={13} y={19} w={30} h={2.2} />
      <CandidateBoxes x={63} y={13} />
      <Bar x={26} y={33} w={68} h={6} fill={HEAD} />
      <Bar x={41} y={44} w={38} h={5} fill={HEAD} />
      <Bar x={36} y={54} w={48} h={2.4} />
      {[68, 74, 80, 86, 92, 98, 104, 110, 116, 122].map((y, i) => (
        <Bar key={y} x={13} y={y} w={[56, 50, 54, 44, 52, 38, 55, 48, 52, 30][i]} h={2.2} />
      ))}
      {/* The marks table a QAB cover carries. */}
      <rect x={77} y={66} width={30} height={64} fill="none" stroke={RULE} strokeWidth={0.7} />
      <rect x={77} y={66} width={30} height={8} fill="#efebe3" stroke={RULE} strokeWidth={0.7} />
      <line x1={90} x2={90} y1={66} y2={130} stroke={RULE} strokeWidth={0.7} />
      {[82, 90, 98, 106, 114, 122].map((y) => (
        <line key={y} x1={77} x2={107} y1={y} y2={y} stroke={RULE} strokeWidth={0.6} />
      ))}
      <Bar x={13} y={139} w={40} h={3} fill={HEAD} />
      <Bar x={13} y={146} w={86} h={2.2} />
      <Bar x={13} y={152} w={60} h={2.2} />
    </>
  ),
};

/** One kind of paper as a sketch of its first page (A4 proportions). */
function PaperSketch({ type }: { type: DocumentType }) {
  return (
    <svg aria-hidden focusable="false" viewBox="0 0 120 170" className="block h-auto w-full">
      <rect width={120} height={170} fill={PAPER} />
      {SKETCHES[type]}
    </svg>
  );
}
