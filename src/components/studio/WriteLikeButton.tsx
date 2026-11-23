'use client';

import { useMessages } from '@/i18n/language';
import { QUESTION_STUDIO_MESSAGES } from './messages';

/** "✦ Write like this" on a bank question: opens the Question studio with it as the example. */
export function WriteLikeButton({ onClick, className = '' }: { onClick: () => void; className?: string }) {
  const m = useMessages(QUESTION_STUDIO_MESSAGES);
  return (
    <button
      type="button"
      title={m.writeLikeTitle}
      data-write-like
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`shrink-0 cursor-pointer rounded-md border border-line bg-surface px-2 py-0.5 text-[11.5px] font-medium text-ink-muted transition-colors duration-150 ease-out-soft hover:border-line-strong hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${className}`}
    >
      {m.writeLike}
    </button>
  );
}
