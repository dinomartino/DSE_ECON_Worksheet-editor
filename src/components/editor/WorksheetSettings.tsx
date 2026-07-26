'use client';

import { FONT_PRESETS } from '@/model/factories';
import { emptyBiText, plain } from '@/model/text';
import { useWorksheetStore } from '@/store/worksheetStore';
import { Collapsible } from '@/components/ui/Collapsible';
import { BiTextField } from './BiTextField';

/**
 * Worksheet-level fields — title, instructions, fonts, section headings.
 *
 * These are edited roughly once per worksheet, so they live in a collapsed
 * disclosure rather than permanently occupying the top third of the sidebar as
 * they did before.
 */
export function WorksheetSettings() {
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const updateWorksheet = useWorksheetStore((s) => s.updateWorksheet);
  const updateSection = useWorksheetStore((s) => s.updateSection);

  const fontIndex = FONT_PRESETS.findIndex(
    (preset) =>
      preset.latin === worksheet.fonts.latin && preset.eastAsia === worksheet.fonts.eastAsia,
  );

  const title = plain(worksheet.title.en) || plain(worksheet.title.zh) || 'Untitled worksheet';

  return (
    <Collapsible title={`Worksheet · ${title}`}>
      <div className="space-y-3">
        <BiTextField
          label="Title"
          value={worksheet.title}
          rows={1}
          onChange={(next) => updateWorksheet({ title: next })}
        />
        <BiTextField
          label="Instructions"
          value={worksheet.instructions ?? emptyBiText()}
          rows={2}
          onChange={(instructions) => updateWorksheet({ instructions })}
        />

        <label className="flex items-center gap-2 text-xs text-ink-muted ">
          Fonts
          <select
            className="min-w-0 flex-1 rounded-md border border-line bg-surface px-1.5 py-1 text-xs "
            value={fontIndex >= 0 ? fontIndex : ''}
            onChange={(event) => {
              const preset = FONT_PRESETS[Number(event.target.value)];
              if (preset) {
                updateWorksheet({ fonts: { latin: preset.latin, eastAsia: preset.eastAsia } });
              }
            }}
          >
            {fontIndex < 0 && <option value="">Custom</option>}
            {FONT_PRESETS.map((preset, index) => (
              <option key={preset.label} value={index}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>

        <div className="space-y-2 border-t border-line pt-2 ">
          {worksheet.sections.map((section, index) => (
            <BiTextField
              key={section.id}
              label={`Section ${index + 1} heading`}
              value={section.heading ?? emptyBiText()}
              rows={1}
              onChange={(heading) => updateSection(section.id, { heading })}
            />
          ))}
        </div>
      </div>
    </Collapsible>
  );
}
