/**
 * Inline SVG icons.
 *
 * The UI previously drew its icons as literal characters — `⠿` for the drag grip,
 * `↑`/`↓` for reorder, `¶`/`≡`/`⤓` for layout kinds. Text glyphs are the wrong tool:
 * they render at a different weight in every font, they inherit text antialiasing so
 * they look muddy next to real UI, and several of them (`⠿` is Braille) are read aloud
 * by screen readers as their Unicode name. These are stroke icons on a 24px grid in
 * the Lucide idiom, sized by `em` so they scale with the button that holds them.
 *
 * Every icon is `aria-hidden`: the accessible name always comes from the button's
 * `label`, never from the glyph, so an icon can change without renaming a control.
 */

interface IconProps {
  /** Size in px. Defaults to 16, the size that pairs with 12-13px UI text. */
  size?: number;
  className?: string;
}

function Svg({ size = 16, className = '', children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
    >
      {children}
    </svg>
  );
}

export function GripIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="9" cy="6" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="6" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="18" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="18" r="1.1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function ChevronUpIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m18 15-6-6-6 6" />
    </Svg>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m6 9 6 6 6-6" />
    </Svg>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m9 18 6-6-6-6" />
    </Svg>
  );
}

export function UndoIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
    </Svg>
  );
}

export function RedoIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H10a6 6 0 0 0 0 12h3" />
    </Svg>
  );
}

export function MoreIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.3" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function MinusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 12h14" />
    </Svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </Svg>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7 10 5 5 5-5M12 15V3" />
    </Svg>
  );
}

export function PdfIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 9V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v5" />
      <path d="M6 18H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-1" />
      <path d="M7 15h10v6H7z" />
    </Svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    </Svg>
  );
}

/* ---- Question types ---------------------------------------------------- */

export function McqIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="5" cy="7" r="2" />
      <circle cx="5" cy="17" r="2" fill="currentColor" />
      <path d="M11 7h9M11 17h9" />
    </Svg>
  );
}

export function StructuredIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 5h16M4 10h10M8 15h12M8 20h8" />
    </Svg>
  );
}

/* ---- Layout element kinds ---------------------------------------------- */

export function HeadingIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 4v16M18 4v16M6 12h12" />
    </Svg>
  );
}

export function TextIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 6h16M4 12h16M4 18h10" />
    </Svg>
  );
}

export function SpacerIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 4v16M8 8l4-4 4 4M8 16l4 4 4-4" />
    </Svg>
  );
}

export function DividerIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 12h18" />
      <path d="M6 6h12M6 18h12" opacity="0.35" />
    </Svg>
  );
}

export function PageBreakIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 8V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v3M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
      <path d="M2 12h4M10 12h4M18 12h4" />
    </Svg>
  );
}

export function AnswerLinesIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 8h16M4 13h16M4 18h10" opacity="0.9" />
    </Svg>
  );
}

export function PartHeaderIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="4" width="18" height="6" rx="1.5" />
      <path d="M4 15h16M4 20h11" />
    </Svg>
  );
}

export function LabelListIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 6h5M4 12h5M4 18h5" />
      <path d="M13 6h7M13 12h7M13 18h7" opacity="0.5" />
    </Svg>
  );
}

export function SectionIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18" />
    </Svg>
  );
}

export function ImageIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="m21 16-5-5-5 5-2-2-6 6" />
    </Svg>
  );
}

export function DiagramIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 4v16h16" />
      <path d="M7 15 12 9l3 3 3-5" />
    </Svg>
  );
}

export function TableIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <path d="M3 10h18M3 15h18M10 4v16" />
    </Svg>
  );
}

/** Maps a `LayoutElement['kind']` to its icon, so rows and menus agree. */
export const LAYOUT_ICON = {
  heading: HeadingIcon,
  text: TextIcon,
  spacer: SpacerIcon,
  divider: DividerIcon,
  pageBreak: PageBreakIcon,
  answerLines: AnswerLinesIcon,
  partHeader: PartHeaderIcon,
  labelList: LabelListIcon,
} as const;
