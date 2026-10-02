import type { ReactNode } from 'react';
import type { AnswerKeyPreset } from '@/model/types';

/*
 * Each answer-key style as a sketch of its first page, in the start screen's
 * `PaperSketch` language (A4 proportions, the paper in literal hex in either theme).
 * The one accent is the key's answers, the app mark's own blue.
 */
const PAPER = '#ffffff';
const HEAD = '#948d80';
const TEXT = '#dcd7cd';
const RULE = '#c9c3b7';
const ACCENT = '#2d6fc6';

function Bar({ x, y, w, h = 2.4, fill = TEXT }: { x: number; y: number; w: number; h?: number; fill?: string }) {
  return <rect x={x} y={y} width={w} height={h} rx={h / 2} fill={fill} />;
}

/** Five pairs to a row, two rows: the Classic grid. */
function Grid({ y }: { y: number }) {
  return (
    <>
      <rect x={12} y={y} width={96} height={16} fill="none" stroke={RULE} strokeWidth={0.7} />
      <line x1={12} x2={108} y1={y + 8} y2={y + 8} stroke={RULE} strokeWidth={0.6} />
      {Array.from({ length: 9 }, (_, i) => (
        <line key={i} x1={12 + (i + 1) * 9.6} x2={12 + (i + 1) * 9.6} y1={y} y2={y + 16} stroke={RULE} strokeWidth={0.6} />
      ))}
      {[0, 1].map((row) =>
        [0, 1, 2, 3, 4].map((pair) => (
          <rect key={`${row}-${pair}`} x={12 + pair * 19.2 + 12.2} y={y + row * 8 + 2.8} width={4.4} height={2.4} rx={1.2} fill={ACCENT} />
        )),
      )}
    </>
  );
}

/** Question No. | Key in two pairs, ruled in fives: the HKEAA table. */
function KeyTable({ y }: { y: number }) {
  const x = 24;
  const w = 72;
  return (
    <>
      <rect x={x} y={y} width={w} height={34} fill="none" stroke={RULE} strokeWidth={0.7} />
      <line x1={x} x2={x + w} y1={y + 6} y2={y + 6} stroke={RULE} strokeWidth={0.7} />
      <line x1={x} x2={x + w} y1={y + 20} y2={y + 20} stroke={RULE} strokeWidth={0.6} />
      {[1, 2, 3].map((i) => (
        <line key={i} x1={x + i * 18} x2={x + i * 18} y1={y} y2={y + 34} stroke={RULE} strokeWidth={i === 2 ? 0.9 : 0.6} />
      ))}
      {[0, 2].map((col) => (
        <g key={col}>
          <Bar x={x + col * 18 + 3} y={y + 1.9} w={12} h={2} fill={HEAD} />
          <Bar x={x + (col + 1) * 18 + 5} y={y + 1.9} w={8} h={2} fill={HEAD} />
        </g>
      ))}
      {[8.5, 12.5, 16.5, 22.5, 26.5, 30.5].map((row) =>
        [0, 2].map((col) => (
          <g key={`${row}-${col}`}>
            <Bar x={x + col * 18 + 6} y={y + row - 1} w={6} h={2} />
            <rect x={x + (col + 1) * 18 + 7.5} y={y + row - 1} width={3} height={2} rx={1} fill={ACCENT} />
          </g>
        )),
      )}
    </>
  );
}

/** A question's answer lines with marks at their ends (Classic) or in a column (HKEAA). */
function Answers({ y, column }: { y: number; column?: boolean }) {
  const end = column ? 88 : 104;
  const lines = [
    { x: 12, w: 26, head: true },
    { x: 18, w: 8, head: true },
    { x: 26, w: end - 26 - (column ? 0 : 10), mark: true },
    { x: 26, w: end - 40 - (column ? 0 : 10) },
    { x: 26, w: end - 30 - (column ? 0 : 10), mark: true },
    { x: 18, w: 8, head: true },
    { x: 26, w: end - 34 - (column ? 0 : 10), mark: true },
    { x: 26, w: end - 28 - (column ? 0 : 10), mark: true },
  ];
  return (
    <>
      {lines.map((line, i) => (
        <g key={i}>
          <Bar x={line.x} y={y + i * 6.5} w={line.w} fill={line.head ? HEAD : TEXT} />
          {line.mark && <Bar x={column ? 99 : 101} y={y + i * 6.5} w={6} fill={ACCENT} />}
        </g>
      ))}
      {column && <line x1={93} x2={93} y1={y - 2} y2={y + lines.length * 6.5} stroke={TEXT} strokeWidth={0.5} strokeDasharray="1 1.5" />}
    </>
  );
}

const SKETCHES: Record<AnswerKeyPreset, ReactNode> = {
  classic: (
    <>
      <Bar x={26} y={12} w={68} h={5} fill={HEAD} />
      <Grid y={28} />
      <Bar x={12} y={52} w={30} h={2.4} fill={HEAD} />
      <Bar x={18} y={58.5} w={60} />
      <Bar x={18} y={65} w={50} />
      <Answers y={80} />
      <Answers y={136} />
    </>
  ),
  hkeaa: (
    <>
      <Bar x={26} y={10} w={68} h={5} fill={HEAD} />
      <Bar x={12} y={20} w={96} h={1.8} />
      <Bar x={12} y={24} w={70} h={1.8} />
      <KeyTable y={31} />
      <Bar x={96} y={72} w={12} h={2} fill={HEAD} />
      <Answers y={80} column />
      <Answers y={136} column />
    </>
  ),
};

/** One answer-key style as a sketch of its first page. */
export function AnswerKeySketch({ preset }: { preset: AnswerKeyPreset }) {
  return (
    <svg aria-hidden focusable="false" viewBox="0 0 120 170" className="block h-auto w-full">
      <rect width={120} height={170} fill={PAPER} />
      {SKETCHES[preset]}
    </svg>
  );
}
