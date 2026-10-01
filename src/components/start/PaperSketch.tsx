import type { ReactNode } from 'react';
import type { DocumentType } from '@/model/newWorksheet';

/*
 * The four pages, sketched: the empty desk's cards and the new-worksheet gallery draw
 * the same ones. Paper colours are literal hex (the paper is paper in either
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
export function PaperSketch({ type }: { type: DocumentType }) {
  return (
    <svg aria-hidden focusable="false" viewBox="0 0 120 170" className="block h-auto w-full">
      <rect width={120} height={170} fill={PAPER} />
      {SKETCHES[type]}
    </svg>
  );
}
