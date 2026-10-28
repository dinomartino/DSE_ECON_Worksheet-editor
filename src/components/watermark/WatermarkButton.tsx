'use client';

import { Button } from '@/components/ui';
import { Menu, type MenuItem } from '@/components/ui/Menu';
import { ChevronDownIcon, WatermarkIcon } from '@/components/ui/icons';
import { useMessages } from '@/i18n/language';
import { watermarkOf, withPaperWatermark, withWatermarkPicture } from '@/model/watermark';
import { openWatermarkLibrary } from './WatermarkThumb';
import { useWorksheetStore } from '@/store/worksheetStore';
import { requestSetup } from '@/components/editor/editorRequests';
import type { SavedWatermark } from '@/settings/watermarks';
import { useWatermarkLibrary } from './useWatermarkLibrary';
import { WATERMARK_MESSAGES } from './watermark.messages';

/**
 * The toolbar's watermark control (k-0242): one click puts the watermark on the paper, or
 * takes it off; the arrow beside it picks another saved one. A paper with none yet gets the
 * last used (`defaultWatermark`); with nothing saved, the click opens Settings → Watermarks.
 * Each change is one undo step (`updateWorksheet`).
 */
export function WatermarkButton({ disabled = false }: { disabled?: boolean }) {
  const m = useMessages(WATERMARK_MESSAGES);
  const mark = useWorksheetStore((s) => watermarkOf(s.worksheet));
  const updateWorksheet = useWorksheetStore((s) => s.updateWorksheet);
  const { library, lastUsed, markUsed } = useWatermarkLibrary();
  const on = Boolean(mark?.on);

  const apply = (entry: SavedWatermark) => {
    updateWorksheet({ watermark: withWatermarkPicture(mark, entry) });
    markUsed(entry.id);
  };

  const click = () => {
    if (mark) updateWorksheet({ watermark: withPaperWatermark(mark, !mark.on) });
    else if (lastUsed) apply(lastUsed);
    else openWatermarkLibrary();
  };

  const title = on
    ? m.turnOff
    : mark
      ? m.turnOn
      : lastUsed
        ? m.turnOnNamed(lastUsed.name || m.untitled)
        : m.addFirst;

  const items: MenuItem[] = [
    ...[...library].reverse().map((entry) => ({
      label: entry.name || m.untitled,
      hint: mark?.libraryId === entry.id && on ? '✓' : undefined,
      icon: (
        // eslint-disable-next-line @next/next/no-img-element -- a stored data: URL
        <img alt="" src={entry.src} className="h-4 w-4 rounded-sm border border-line bg-[#ffffff] object-contain" />
      ),
      onSelect: () => apply(entry),
    })),
    ...(on && mark
      ? [{ label: m.noneOnPaper, separated: library.length > 0, onSelect: () => updateWorksheet({ watermark: withPaperWatermark(mark, false) }) }]
      : []),
    ...(mark ? [{ label: m.adjust, separated: true, onSelect: () => requestSetup('page', m.heading) }] : []),
    {
      label: library.length > 0 ? m.manage : m.addNew,
      separated: !mark,
      onSelect: openWatermarkLibrary,
    },
  ];

  return (
    <span className="flex shrink-0 items-center" data-testid="watermark-button">
      <Button
        variant="subtle"
        onClick={click}
        disabled={disabled}
        aria-pressed={on}
        aria-label={m.button}
        title={title}
        className={on ? 'text-accent' : ''}
      >
        <WatermarkIcon size={15} />
        <span className="hidden xl:inline">{m.button}</span>
      </Button>
      {!disabled && (
        <Menu label={m.choose} align="left" items={items} trigger={<ChevronDownIcon size={13} />} />
      )}
    </span>
  );
}
