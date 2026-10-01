'use client';

import { Button } from '@/components/ui';
import { ArchiveIcon, FolderOpenIcon } from '@/components/ui/icons';
import type { DocumentType } from '@/model/newWorksheet';
import { useMessages, useUiLanguage } from '@/i18n/language';
import { PaperSketch } from './PaperSketch';
import { WELCOME_MESSAGES } from './screen.messages';
import { kindText, START_KINDS } from './startKinds';

/**
 * The desk before anything is saved: a welcome, and the four kinds of paper drawn as
 * the page each one prints, since a first-time teacher knows a Question-Answer Book by
 * its shape sooner than by its name. Each card opens the same new-worksheet form as the
 * panel's New worksheet button, with its type chosen; the file routes below bring existing
 * work in (the panel drops its own "Open a file…" while this shows). Nothing is added to
 * the teacher's list on their behalf.
 */
export function WelcomeDesk({
  onCreate,
  onOpenFile,
  onRestore,
  restoring = false,
}: {
  onCreate: (type: DocumentType) => void;
  onOpenFile: () => void;
  onRestore: () => void;
  restoring?: boolean;
}) {
  const m = useMessages(WELCOME_MESSAGES);
  const lang = useUiLanguage();
  return (
    <section
      aria-labelledby="welcome-heading"
      className="zone-light mt-4 animate-slide-up-in rounded-xl border border-line bg-surface px-6 pb-6 pt-7 xl:px-9 xl:pb-7 xl:pt-9"
    >
      <h2
        id="welcome-heading"
        className="font-display text-balance text-[26px] font-normal leading-[1.15] tracking-[-0.01em] text-ink xl:text-[30px]"
      >
        {m.welcome}
        <span lang="zh-HK" className="ml-3 align-[3px] text-[15px] tracking-normal text-ink-subtle xl:text-[16px]">
          {m.welcomeZh}
        </span>
      </h2>
      <p className="mt-2 max-w-2xl text-pretty text-[13px] leading-relaxed text-ink-muted">
        {m.lead}
      </p>

      <ul className="mt-6 grid grid-cols-4 gap-3 xl:gap-5">
        {START_KINDS.map((kind, index) => {
          const words = kindText(kind.type, lang);
          return (
          <li
            key={kind.type}
            className="min-w-0 animate-slide-up-in"
            style={{ animationDelay: `${60 + index * 30}ms` }}
          >
            <button
              type="button"
              onClick={() => onCreate(kind.type)}
              className="group block w-full cursor-pointer rounded-lg text-left focus-visible:outline-none"
            >
              {/* Hover is colour only: the tile tints and the accent ring fades in. */}
              <span className="flex justify-center rounded-lg bg-surface-sunken px-[16%] py-4 transition-colors duration-150 ease-out-soft group-hover:bg-surface-hover group-focus-visible:ring-2 group-focus-visible:ring-inset group-focus-visible:ring-accent xl:py-5">
                <span className="relative block w-full max-w-[128px] transition-transform duration-[180ms] ease-out-soft group-active:scale-[0.985] group-active:duration-100">
                  <span className="block overflow-hidden rounded-[2px] shadow-[0_1px_2px_rgba(0,0,0,0.16),0_4px_12px_rgba(0,0,0,0.12)] ring-1 ring-black/5">
                    <PaperSketch type={kind.type} />
                  </span>
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 rounded-[2px] opacity-0 ring-2 ring-accent transition-opacity duration-[180ms] ease-out-soft group-hover:opacity-100"
                  />
                </span>
              </span>
              <span className="mt-2.5 block text-[13px] font-medium leading-snug text-ink transition-colors duration-150 ease-out-soft group-hover:text-accent-ink">
                {words.title}
              </span>
              {words.bilingual && (
                <span lang="zh-HK" className="mt-0.5 block text-[11.5px] leading-snug text-ink-subtle">
                  {kind.titleZh}
                </span>
              )}
              {/* The card says what the paper is for: nothing else on this screen does yet. */}
              <span className="mt-1 block text-pretty text-[11px] leading-snug text-ink-muted">{words.caption}</span>
            </button>
          </li>
          );
        })}
      </ul>

      {/* Existing work: a file from another machine, or a whole backup. */}
      <div className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line pt-4">
        <span className="mr-1 text-[12px] text-ink-muted">{m.haveWorksheets}</span>
        <Button variant="subtle" size="sm" onClick={onOpenFile}>
          <FolderOpenIcon size={14} />
          {m.openFile}
        </Button>
        <Button variant="subtle" size="sm" onClick={onRestore} disabled={restoring}>
          <ArchiveIcon size={14} />
          {restoring ? m.restoring : m.restoreBackup}
        </Button>
        <span className="basis-full text-[11px] text-ink-subtle xl:ml-auto xl:basis-auto">
          {m.orDrop}
        </span>
      </div>
    </section>
  );
}
