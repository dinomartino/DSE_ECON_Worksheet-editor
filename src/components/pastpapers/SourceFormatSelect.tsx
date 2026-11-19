'use client';

import { useMessages } from '@/i18n/language';
import type { QuestionSourceFormat } from '@/model/types';
import { QUESTION_SOURCE_FORMATS } from '@/render/questionSource';
import { PAST_PAPER_MESSAGES } from './messages';

const LABEL_KEY = {
  full: 'sourceFormatFull',
  short: 'sourceFormatShort',
  shortRoman: 'sourceFormatShortRoman',
} as const satisfies Record<QuestionSourceFormat, keyof typeof PAST_PAPER_MESSAGES>;

/**
 * How each question's source prints (user u-z6ft): full "(HKDSE 2019 Paper 1 Q12)", short
 * "(DSE2019/P1/Q12)" or short with a Roman paper "(DSE2019/I/Q12)". One picker for the bank's
 * tray, the editor's Past papers tab and Setup → Page, each option showing its own label.
 */
export function SourceFormatSelect({
  value,
  onChange,
  disabled = false,
  className = '',
}: {
  value: QuestionSourceFormat;
  onChange: (format: QuestionSourceFormat) => void;
  disabled?: boolean;
  className?: string;
}) {
  const m = useMessages(PAST_PAPER_MESSAGES);
  return (
    <label className={`flex min-w-0 items-center ${className}`} data-pastpaper-source-format>
      <span className="sr-only">{m.sourceFormat}</span>
      <select
        value={value}
        disabled={disabled}
        title={m.sourceFormat}
        onChange={(event) => {
          const next = QUESTION_SOURCE_FORMATS.find((format) => format === event.target.value);
          if (next) onChange(next);
        }}
        className="h-8 min-w-0 max-w-full cursor-pointer rounded-lg border border-line bg-surface px-2 text-[12.5px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-default disabled:opacity-50"
      >
        {QUESTION_SOURCE_FORMATS.map((format) => (
          <option key={format} value={format}>
            {m[LABEL_KEY[format]]}
          </option>
        ))}
      </select>
    </label>
  );
}
