'use client';
// Contract-step stub; the bar agent owns and fills this file.

import type { ReviewItem } from '@/assist/types';

/** One reviewed item in the bar: where, notes, and its one-click action. */
export function ItemCard({ item }: { item: ReviewItem }) {
  return (
    <div className="text-[13px] text-ink">
      <div className="font-medium">{item.where}</div>
      {item.notes.map((note) => (
        <div key={note} className="text-ink-muted">{note}</div>
      ))}
    </div>
  );
}
