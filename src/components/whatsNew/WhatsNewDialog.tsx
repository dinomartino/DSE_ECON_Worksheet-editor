'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import pkg from '../../../package.json';
import { Button, Pill } from '@/components/ui';
import { Dialog } from '@/components/ui/Dialog';
import { ChevronRightIcon } from '@/components/ui/icons';
import { currentVersion } from '@/desktop/updater';
import { openExternal } from '@/platform';
import {
  findRelease,
  hasEntries,
  UNRELEASED,
  type Changelog,
  type ChangelogProse,
  type ChangelogSection,
} from '@/whatsNew/changelog';
import { inlineTokens, isOpenableLink, type InlineToken } from '@/whatsNew/inline';
import { CHANGELOG, formatReleaseDate, SHOW_UNRELEASED } from '@/whatsNew/notes';
import { decideWhatsNew, readLastSeen, writeLastSeen } from '@/whatsNew/seen';

/**
 * "What's new", read from the CHANGELOG.md bundled into this build.
 *
 * With `version`, the notes for that one release — shown once after an update — with a
 * way on to the rest. Without it, every release: the running one open, older ones
 * folded. Pass a stable `onClose`: `Dialog` re-focuses its panel when it changes.
 */
export function WhatsNewDialog({
  version,
  onClose,
  changelog = CHANGELOG,
  current = pkg.version,
  showUnreleased = SHOW_UNRELEASED,
}: {
  version?: string;
  onClose: () => void;
  changelog?: Changelog;
  /** The running version, marked in the list. */
  current?: string;
  showUnreleased?: boolean;
}) {
  const [all, setAll] = useState(false);
  const featured = version && !all ? findRelease(changelog, version) : undefined;

  if (featured) {
    const date = formatReleaseDate(featured.date);
    return (
      <Dialog
        title={`What’s new in ${featured.version}`}
        description={date ? `Released ${date}` : undefined}
        width={560}
        onClose={onClose}
        footer={
          <>
            <Button variant="subtle" className="mr-auto" onClick={() => setAll(true)}>
              See all releases
            </Button>
            <Button variant="primary" onClick={onClose}>
              Got it
            </Button>
          </>
        }
      >
        <div className="px-5 py-5">
          <SectionNotes section={featured} />
        </div>
      </Dialog>
    );
  }

  const sections: ChangelogSection[] = [
    ...(showUnreleased && hasEntries(changelog.unreleased) ? [changelog.unreleased] : []),
    ...changelog.releases.filter(hasEntries),
  ];
  const openVersion =
    sections.find((s) => s.version === current)?.version ?? changelog.releases[0]?.version;

  return (
    <Dialog
      title="What’s new"
      description={`You have version ${current}. Every release, newest first.`}
      width={560}
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="divide-y divide-line px-5">
        {sections.length === 0 && (
          <p className="py-5 text-[13px] text-ink-muted">No release notes in this build.</p>
        )}
        {sections.map((section) => (
          <Fold
            key={section.version}
            open={section === changelog.unreleased || section.version === openVersion}
            summary={<SectionTitle section={section} current={current} />}
          >
            <SectionNotes section={section} />
          </Fold>
        ))}
        {changelog.earlier.map((prose) => (
          <Fold key={prose.heading} summary={<ProseTitle prose={prose} />}>
            <div className="space-y-2 text-[13px] leading-relaxed text-ink-muted">
              {prose.paragraphs.map((p) => (
                <p key={p}>
                  <Inline tokens={inlineTokens(p)} />
                </p>
              ))}
            </div>
          </Fold>
        ))}
      </div>
    </Dialog>
  );
}

/**
 * The once-per-update pop-up, for the start screen. Decides once per launch, after the
 * document list has loaded (someone with saved work and no record is updating, not new).
 * Every way of closing it records the version as seen.
 */
let decidedThisLaunch = false;

export function WhatsNewOnLaunch({ ready, returningUser }: { ready: boolean; returningUser: boolean }) {
  const [version, setVersion] = useState<string | undefined>();

  useEffect(() => {
    if (!ready || decidedThisLaunch) return;
    decidedThisLaunch = true;
    let live = true;
    void (async () => {
      const running = (await currentVersion()) ?? pkg.version;
      const decision = decideWhatsNew(running, readLastSeen(), CHANGELOG, returningUser);
      if (decision.kind === 'record') writeLastSeen(decision.version);
      if (decision.kind === 'show' && live) setVersion(decision.version);
    })();
    return () => {
      live = false;
    };
  }, [ready, returningUser]);

  const close = useCallback(() => {
    if (version) writeLastSeen(version);
    setVersion(undefined);
  }, [version]);

  if (!version) return null;
  return <WhatsNewDialog version={version} current={version} onClose={close} />;
}

/** Test seam: let the next mount decide again. */
export function resetWhatsNewLaunchForTest(): void {
  decidedThisLaunch = false;
}

function Fold({
  open,
  summary,
  children,
}: {
  open?: boolean;
  summary: ReactNode;
  children: ReactNode;
}) {
  return (
    <details open={open} className="group py-4">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon
          size={14}
          className="shrink-0 text-ink-subtle transition-[rotate] duration-200 ease-out-soft group-open:rotate-90"
        />
        {summary}
      </summary>
      {/* Replays on every open: a closed <details> does not render its body. */}
      <div className="mt-3 animate-slide-down-in pl-[22px]">{children}</div>
    </details>
  );
}

function SectionTitle({ section, current }: { section: ChangelogSection; current: string }) {
  const unreleased = section.version === UNRELEASED;
  const date = formatReleaseDate(section.date);
  return (
    <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className="text-[14px] font-semibold text-ink tabular-nums">
        {unreleased ? 'Unreleased' : section.version}
      </span>
      {date && <span className="text-[12px] text-ink-subtle">{date}</span>}
      {section.version === current && <Pill tone="accent">Your version</Pill>}
      {unreleased && <Pill tone="warn">Dev build only</Pill>}
      <span className="ml-auto text-[11px] text-ink-subtle group-open:hidden">
        {countLine(section)}
      </span>
    </span>
  );
}

function ProseTitle({ prose }: { prose: ChangelogProse }) {
  return <span className="text-[14px] font-semibold text-ink">{prose.heading}</span>;
}

/** "8 added · 2 changed" — what a folded release holds. */
function countLine(section: ChangelogSection): string {
  return section.groups.map((g) => `${g.items.length} ${g.title.toLowerCase()}`).join(' · ');
}

/** One release: its groups, each a heading and a bullet list. */
export function SectionNotes({ section }: { section: ChangelogSection }) {
  return (
    <div className="space-y-4">
      {section.groups.map((group) => (
        <section key={group.title}>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-subtle">
            {group.title}
          </h3>
          <ul className="mt-1.5 list-disc space-y-1.5 pl-4 text-[13px] leading-relaxed text-ink-muted marker:text-line-strong">
            {group.items.map((item) => (
              <li key={item}>
                <Inline tokens={inlineTokens(item)} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Inline({ tokens }: { tokens: InlineToken[] }) {
  return (
    <>
      {tokens.map((token, index) => {
        switch (token.kind) {
          case 'text':
            return <span key={index}>{token.text}</span>;
          case 'code':
            return (
              <code
                key={index}
                className="rounded bg-surface-sunken px-1 py-px font-mono text-[12px] text-ink"
              >
                {token.text}
              </code>
            );
          case 'bold':
            return (
              <strong key={index} className="font-semibold text-ink">
                <Inline tokens={token.children} />
              </strong>
            );
          case 'link':
            return isOpenableLink(token.href) ? (
              <a
                key={index}
                href={token.href}
                onClick={(event) => {
                  event.preventDefault();
                  void openExternal(token.href).catch(() => undefined);
                }}
                className="font-medium text-accent-ink underline decoration-line-strong underline-offset-4 hover:decoration-accent"
              >
                <Inline tokens={token.children} />
              </a>
            ) : (
              <Inline key={index} tokens={token.children} />
            );
        }
      })}
    </>
  );
}
