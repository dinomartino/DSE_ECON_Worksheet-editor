import { openExternal } from '@/platform';
import { MENTOR_BUY_URL } from '@/ai/mentor';
import { AI_SETTINGS } from './aiSettings';
import { mentorSession, type MentorSession } from './mentorAccount';
import { appSettings } from './store';

/**
 * Keeps the credits on screen current without a reload (k-0524), while signed in to DSEcon
 * Mentor with the account in use and the window visible: a read on focus or on becoming
 * visible, a light one every `LIGHT_MS`, and after Buy credits opens, one every `BUY_POLL_MS`
 * for up to `BUY_WATCH_MS` until the balance changes (the payment landed). Never two reads
 * at once (`MentorSession.refresh` shares one); nothing at all while signed out or hidden.
 * Each AI request's receipt updates the credits by itself (`relayOutcome.ts`).
 */

export const LIGHT_MS = 60_000;
export const BUY_POLL_MS = 5_000;
export const BUY_WATCH_MS = 3 * 60_000;
/** Focus and visibility often fire together (and on every alt-tab): one read per this long. */
export const FOCUS_GAP_MS = 3_000;

export interface MentorLiveDeps {
  session: MentorSession;
  /** Settings' provider is the account (an own key needs no balance). */
  inUse(): boolean;
  visible(): boolean;
  now(): number;
  setTimer(run: () => void, ms: number): unknown;
  clearTimer(timer: unknown): void;
  /** Window focus and visibility changes; returns the unsubscribe. */
  onWake(run: () => void): () => void;
  /** Settings changes (provider switched); returns the unsubscribe. */
  onSettings(run: () => void): () => void;
}

export interface MentorLive {
  /** Starts listening; returns stop. */
  start(): () => void;
  /** Buy credits just opened: poll fast until the balance moves, for up to `BUY_WATCH_MS`. */
  watchPurchase(): void;
  /** For tests. */
  watching(): boolean;
}

export function createMentorLive(deps: MentorLiveDeps): MentorLive {
  const { session } = deps;
  let timer: unknown = null;
  let lastRead = -Infinity;
  /** While watching a purchase: the balance before it, and when to give up. */
  let watch: { before: number | null; until: number } | null = null;
  let running = false;

  const active = () => running && session.current().kind === 'signedIn' && deps.inUse() && deps.visible();
  const credits = () => {
    const s = session.current();
    return s.kind === 'signedIn' ? (s.account?.credits ?? null) : null;
  };

  const clear = () => {
    if (timer !== null) deps.clearTimer(timer);
    timer = null;
  };

  /** Ends the purchase watch once the balance moved (or time ran out). */
  const settleWatch = () => {
    if (!watch) return;
    const now = credits();
    if (deps.now() >= watch.until || (watch.before === null ? now !== null : now !== null && now !== watch.before)) watch = null;
  };

  const read = async () => {
    lastRead = deps.now();
    await session.refresh();
    settleWatch();
  };

  function schedule() {
    clear();
    if (session.current().kind !== 'signedIn') watch = null;
    if (!active()) return;
    timer = deps.setTimer(() => {
      timer = null;
      void read().finally(schedule);
    }, watch ? BUY_POLL_MS : LIGHT_MS);
  }

  const wake = () => {
    if (!active()) return schedule();
    if (deps.now() - lastRead < FOCUS_GAP_MS) return;
    clear();
    void read().finally(schedule);
  };

  return {
    start() {
      running = true;
      const offWake = deps.onWake(wake);
      const offSettings = deps.onSettings(schedule);
      const offSession = session.subscribe(() => {
        settleWatch();
        // Signed in or out, or a new number: the timer follows (its own reads re-arm it after).
        if (timer === null || !active()) schedule();
      });
      schedule();
      return () => {
        running = false;
        clear();
        watch = null;
        offWake();
        offSettings();
        offSession();
      };
    },
    watchPurchase() {
      watch = { before: credits(), until: deps.now() + BUY_WATCH_MS };
      schedule();
    },
    watching: () => watch !== null,
  };
}

// ── Live wiring ──────────────────────────────────────────────────────────

let live: MentorLive | null = null;

/** The app's one live refresher (browser only). */
export function mentorLive(): MentorLive {
  if (!live) {
    live = createMentorLive({
      session: mentorSession(),
      inUse: () => appSettings.read(AI_SETTINGS).provider === 'mentor',
      visible: () => typeof document === 'undefined' || document.visibilityState !== 'hidden',
      now: () => Date.now(),
      setTimer: (run, ms) => setTimeout(run, ms),
      clearTimer: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
      onWake(run) {
        window.addEventListener('focus', run);
        document.addEventListener('visibilitychange', run);
        return () => {
          window.removeEventListener('focus', run);
          document.removeEventListener('visibilitychange', run);
        };
      },
      onSettings: (run) => appSettings.subscribe(AI_SETTINGS, run),
    });
  }
  return live;
}

/** Opens Mentor's page to buy credits and watches for the payment to land (k-0524). */
export function openBuyCredits(url?: string | null): void {
  const s = mentorSession().current();
  void openExternal(url || (s.kind === 'signedIn' && s.account?.buyUrl) || MENTOR_BUY_URL);
  mentorLive().watchPurchase();
}
