"use client";

import { lazy, Suspense, useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { Dialog } from "@/components/ui/Dialog";
import { useMessages } from "@/i18n/language";
import {
  setStudioTrial,
  studioDefaultOn,
  useStudioTrial,
} from "@/questionStudio/trial";
import { AI_SECTION_MESSAGES } from "./messages";

/** The kit loads when it is opened: Settings stays light (the studio engine and the banks come with it). */
const TrialView = lazy(() => import("@/components/studio/TrialView").then((mod) => ({ default: mod.TrialView })));

/**
 * Settings → AI → "Question studio trial" (k-0516): the trial kit used to be the studio's
 * second tab; it lives here now, so the studio screen is only about writing. The kit is three
 * columns (briefs, drafts, report), too wide for the settings dialog, so it opens in a large
 * dialog of its own over Settings. Shown only while the studio trial is on.
 */
/** `on` overrides the stored switch (tests; server rendering reads the default). */
export function TrialKitBlock({ on: forced }: { on?: boolean }) {
  const stored = useStudioTrial();
  const on = forced ?? stored;
  const [open, setOpen] = useState(false);
  if (!on) return null;
  return (
    <TrialKitBlockView
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      // Only where the studio is opt-in (a release build): in a develop build it is part of the
      // app, and the desktop app has no address bar to bring it back once hidden.
      onTurnOff={studioDefaultOn() ? undefined : () => setStudioTrial(false)}
    />
  );
}

export function TrialKitBlockView({
  open,
  onOpen,
  onClose,
  onTurnOff,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onTurnOff?: () => void;
}) {
  const m = useMessages(AI_SECTION_MESSAGES);
  return (
    <section
      className="space-y-2 border-t border-line pt-4"
      data-studio-trial-block
    >
      <h3 className="text-[13px] font-semibold text-ink">{m.trialTitle}</h3>
      <p className="text-xs leading-relaxed text-ink-muted">{m.trialBody}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={onOpen} data-studio-trial-open>
          {m.trialOpen}
        </Button>
        {onTurnOff && (
          <button
            type="button"
            onClick={onTurnOff}
            data-studio-trial-off
            className="cursor-pointer text-xs font-medium text-accent-ink hover:underline"
          >
            {m.trialOff}
          </button>
        )}
      </div>
      {open && <TrialDialog onClose={onClose} />}
    </section>
  );
}

/** The kit in a large dialog over Settings. Esc closes only this one, not Settings behind it. */
function TrialDialog({ onClose }: { onClose: () => void }) {
  const m = useMessages(AI_SECTION_MESSAGES);
  useEffect(() => {
    // Both dialogs listen on `window`; a capture listener runs first and keeps Settings open.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return;
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);
  return (
    <Dialog
      title={m.trialTitle}
      onClose={onClose}
      size="large"
    >
      <Suspense fallback={null}>
        <TrialView />
      </Suspense>
    </Dialog>
  );
}
