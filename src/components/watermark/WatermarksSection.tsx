'use client';

import { useRef, useState } from 'react';
import { Button, IconButton, Segmented } from '@/components/ui';
import { ImageIcon, PlusIcon, TextIcon, TrashIcon } from '@/components/ui/icons';
import { useMessages } from '@/i18n/language';
import { MAX_SAVED_WATERMARKS, type SavedWatermark } from '@/settings/watermarks';
import {
  WATERMARK_FILE_ACCEPT,
  drawTextWatermark,
  isWatermarkFile,
  prepareWatermarkPicture,
} from './preparePicture';
import { useWatermarkLibrary, type AddResult } from './useWatermarkLibrary';
import { WatermarkThumb } from './WatermarkThumb';
import { WATERMARK_MESSAGES } from './watermark.messages';

/**
 * Settings → Watermarks (k-0242): the saved list. Add a picture (PNG, JPG, SVG) or a line of
 * text, name each, rename, delete, and pick the one the toolbar's button puts on a paper.
 * A paper keeps its own copy (`Worksheet.watermark`), so nothing here changes a paper.
 */
export default function WatermarksSection() {
  const m = useMessages(WATERMARK_MESSAGES);
  const { library, lastUsed, add, rename, remove, markUsed } = useWatermarkLibrary();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();
  const [writing, setWriting] = useState(false);

  const report = (result: AddResult) => {
    if (result.ok) setError(undefined);
    else setError(result.reason === 'full' ? m.full(MAX_SAVED_WATERMARKS) : m.storageFull);
    return result.ok;
  };

  const addFile = async (file: File | undefined) => {
    if (!file) return;
    if (!isWatermarkFile(file)) {
      setError(m.unreadable);
      return;
    }
    try {
      const picture = await prepareWatermarkPicture(file);
      report(add(picture, { name: file.name.replace(/\.[^.]+$/, ''), kind: 'image' }));
    } catch {
      setError(m.unreadable);
    }
  };

  return (
    <div className="space-y-4" data-testid="watermarks-section">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => fileRef.current?.click()} title={m.addPictureHint}>
          <ImageIcon size={15} />
          {m.addPicture}
        </Button>
        <Button onClick={() => setWriting(true)} disabled={writing}>
          <TextIcon size={15} />
          {m.addText}
        </Button>
        <span className="text-[11px] text-ink-muted">{m.addPictureHint}</span>
        <input
          ref={fileRef}
          type="file"
          accept={WATERMARK_FILE_ACCEPT}
          className="hidden"
          data-testid="watermark-file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            void addFile(file);
          }}
        />
      </div>

      {writing && (
        <TextWatermarkForm
          onCancel={() => setWriting(false)}
          onSave={(text, layout) => {
            if (report(add(drawTextWatermark(text, layout), { name: text, kind: 'text', text }))) setWriting(false);
          }}
        />
      )}

      {error && (
        <p role="alert" className="rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink">
          {error}
        </p>
      )}

      {library.length === 0 && !writing ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-xs text-ink-muted">
          {m.emptyLibrary}
        </p>
      ) : (
        <ul className="grid grid-cols-3 gap-3" aria-label={m.sectionLabel}>
          {[...library].reverse().map((entry) => (
            <LibraryCard
              key={entry.id}
              entry={entry}
              isDefault={lastUsed?.id === entry.id}
              onRename={(name) => rename(entry.id, name)}
              onRemove={() => remove(entry.id)}
              onMakeDefault={() => markUsed(entry.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function LibraryCard({
  entry,
  isDefault,
  onRename,
  onRemove,
  onMakeDefault,
}: {
  entry: SavedWatermark;
  isDefault: boolean;
  onRename: (name: string) => void;
  onRemove: () => void;
  onMakeDefault: () => void;
}) {
  const m = useMessages(WATERMARK_MESSAGES);
  const [name, setName] = useState(entry.name);
  const shown = entry.name || m.untitled;
  const commit = () => {
    if (name.trim() !== entry.name) onRename(name);
  };
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-2.5" data-testid="watermark-entry">
      <WatermarkThumb entry={entry} className="aspect-[4/3] w-full" />
      <div className="flex items-center gap-1">
        <input
          aria-label={m.name}
          value={name}
          placeholder={m.untitled}
          onChange={(event) => setName(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
            if (event.key === 'Escape') setName(entry.name);
          }}
          className="h-8 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 text-[13px] font-medium text-ink outline-none transition-colors hover:border-line focus:border-accent focus:ring-2 focus:ring-accent/25"
        />
        <IconButton label={m.removeNamed(shown)} onClick={onRemove}>
          <TrashIcon size={14} />
        </IconButton>
      </div>
      {isDefault ? (
        <span className="px-2 text-[11px] font-medium text-accent">{m.lastUsed}</span>
      ) : (
        <button
          type="button"
          onClick={onMakeDefault}
          className="cursor-pointer self-start rounded-md px-2 text-left text-[11px] text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {m.useAsDefault}
        </button>
      )}
    </li>
  );
}

function TextWatermarkForm({
  onSave,
  onCancel,
}: {
  onSave: (text: string, layout: 'diagonal' | 'horizontal') => void;
  onCancel: () => void;
}) {
  const m = useMessages(WATERMARK_MESSAGES);
  const [text, setText] = useState('');
  const [layout, setLayout] = useState<'diagonal' | 'horizontal'>('diagonal');
  const ready = text.trim().length > 0;
  return (
    <form
      className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) onSave(text.trim(), layout);
      }}
    >
      <input
        aria-label={m.textLabel}
        autoFocus
        value={text}
        maxLength={60}
        placeholder={m.textPlaceholder}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            onCancel();
          }
        }}
        className="h-9 min-w-48 flex-1 rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/25"
      />
      <Segmented
        label={m.direction}
        value={layout}
        onChange={setLayout}
        options={[
          { value: 'diagonal', label: m.diagonal },
          { value: 'horizontal', label: m.horizontal },
        ]}
      />
      <Button type="submit" variant="primary" disabled={!ready}>
        <PlusIcon size={14} />
        {m.create}
      </Button>
      <Button variant="subtle" onClick={onCancel}>
        {m.cancel}
      </Button>
    </form>
  );
}
