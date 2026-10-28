'use client';

import { useAppDialogs } from '@/store/appDialogs';
import type { SavedWatermark } from '@/settings/watermarks';

/** Settings → Watermarks, where pictures and text are added (k-0242). */
export const openWatermarkLibrary = () => useAppDialogs.getState().openSettings({ section: 'watermarks' });

/** The picture on a white sheet, as it will sit behind a page (faint, as printed). */
export function WatermarkThumb({ entry, className = '' }: { entry: Pick<SavedWatermark, 'src'>; className?: string }) {
  return (
    <span className={`flex items-center justify-center overflow-hidden rounded-md border border-line bg-[#ffffff] ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a stored data: URL */}
      <img alt="" src={entry.src} className="max-h-[80%] max-w-[80%] object-contain opacity-60" draggable={false} />
    </span>
  );
}
