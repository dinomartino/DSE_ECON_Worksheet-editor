import { describe, expect, it } from 'vitest';
import type { MentorAccount } from '@/ai/mentor';
import type { MentorSession, MentorState } from './mentorAccount';
import { BUY_POLL_MS, BUY_WATCH_MS, FOCUS_GAP_MS, LIGHT_MS, createMentorLive } from './mentorLive';

/** The credits kept current without a reload (k-0524): timers, focus, the purchase watch. */

function harness(opts: { signedIn?: boolean; inUse?: boolean; credits?: number } = {}) {
  let now = 0;
  let visible = true;
  let inUse = opts.inUse ?? true;
  let serverCredits = opts.credits ?? 100;
  let timers: Array<{ at: number; run: () => void; id: number }> = [];
  let nextId = 1;
  const wakes = new Set<() => void>();
  const settingsListeners = new Set<() => void>();
  const listeners = new Set<() => void>();
  let reads = 0;
  let inflight = 0;
  let maxInflight = 0;
  const account = (credits: number) => ({ credits, status: 'on', buyUrl: '', pricingUrl: '' }) as MentorAccount;
  let state: MentorState = opts.signedIn === false ? { kind: 'signedOut' } : { kind: 'signedIn', account: account(serverCredits), loading: false };
  const set = (next: MentorState) => {
    state = next;
    for (const l of [...listeners]) l();
  };
  let pending: Promise<void> | null = null;
  const session = {
    subscribe: (l: () => void) => (listeners.add(l), () => listeners.delete(l)),
    current: () => state,
    refresh() {
      if (pending) return pending;
      reads++;
      inflight++;
      maxInflight = Math.max(maxInflight, inflight);
      pending = Promise.resolve().then(() => {
        inflight--;
        pending = null;
        if (state.kind === 'signedIn') set({ kind: 'signedIn', account: account(serverCredits), loading: false });
      });
      return pending;
    },
  } as unknown as MentorSession;
  const live = createMentorLive({
    session,
    inUse: () => inUse,
    visible: () => visible,
    now: () => now,
    setTimer: (run, ms) => {
      const id = nextId++;
      timers.push({ at: now + ms, run, id });
      return id;
    },
    clearTimer: (id) => void (timers = timers.filter((t) => t.id !== id)),
    onWake: (run) => (wakes.add(run), () => wakes.delete(run)),
    onSettings: (run) => (settingsListeners.add(run), () => settingsListeners.delete(run)),
  });
  const flush = () => new Promise((r) => setTimeout(r, 0));
  /** Moves the clock, firing timers as they come due. */
  const advance = async (ms: number) => {
    const end = now + ms;
    for (;;) {
      const due = timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      now = due.at;
      timers = timers.filter((t) => t !== due);
      due.run();
      await flush();
    }
    now = end;
  };
  return {
    live,
    advance,
    flush,
    reads: () => reads,
    maxInflight: () => maxInflight,
    wake: async () => {
      for (const w of [...wakes]) w();
      await flush();
    },
    setVisible: (v: boolean) => (visible = v),
    setInUse: (v: boolean) => {
      inUse = v;
      for (const l of [...settingsListeners]) l();
    },
    setServer: (n: number) => (serverCredits = n),
    signOut: () => set({ kind: 'signedOut' }),
    credits: () => (state.kind === 'signedIn' ? state.account?.credits : undefined),
    timers: () => timers.length,
  };
}

describe('live credits', () => {
  it('a light read every minute while visible, none while hidden', async () => {
    const h = harness();
    h.live.start();
    await h.advance(LIGHT_MS * 3);
    expect(h.reads()).toBe(3);
    h.setVisible(false);
    await h.wake();
    await h.advance(LIGHT_MS * 5);
    expect(h.reads()).toBe(3);
    h.setVisible(true);
    await h.wake();
    expect(h.reads()).toBe(4);
  });

  it('focus reads at once, but not twice within the gap', async () => {
    const h = harness();
    h.live.start();
    await h.wake();
    await h.wake();
    expect(h.reads()).toBe(1);
    await h.advance(FOCUS_GAP_MS);
    await h.wake();
    expect(h.reads()).toBe(2);
    expect(h.maxInflight()).toBe(1);
  });

  it('nothing while signed out or on an own key, and it stops at sign-out', async () => {
    const out = harness({ signedIn: false });
    out.live.start();
    await out.wake();
    await out.advance(LIGHT_MS * 3);
    expect(out.reads()).toBe(0);

    const own = harness({ inUse: false });
    own.live.start();
    await own.advance(LIGHT_MS * 2);
    expect(own.reads()).toBe(0);
    own.setInUse(true);
    await own.advance(LIGHT_MS);
    expect(own.reads()).toBe(1);

    const h = harness();
    h.live.start();
    h.signOut();
    await h.advance(LIGHT_MS * 3);
    expect(h.reads()).toBe(0);
    expect(h.timers()).toBe(0);
  });

  it('after Buy credits: every 5 s until the balance moves, then back to the minute', async () => {
    const h = harness({ credits: 100 });
    h.live.start();
    h.live.watchPurchase();
    await h.advance(BUY_POLL_MS * 3);
    expect(h.reads()).toBe(3);
    expect(h.live.watching()).toBe(true);
    h.setServer(4270);
    await h.advance(BUY_POLL_MS);
    expect(h.credits()).toBe(4270);
    expect(h.live.watching()).toBe(false);
    await h.advance(LIGHT_MS - 1);
    expect(h.reads()).toBe(4);
  });

  it('the purchase watch gives up after 3 minutes', async () => {
    const h = harness();
    h.live.start();
    h.live.watchPurchase();
    await h.advance(BUY_WATCH_MS + BUY_POLL_MS);
    expect(h.live.watching()).toBe(false);
    const reads = h.reads();
    expect(reads).toBeGreaterThanOrEqual(BUY_WATCH_MS / BUY_POLL_MS);
    expect(reads).toBeLessThanOrEqual(BUY_WATCH_MS / BUY_POLL_MS + 1);
    await h.advance(BUY_POLL_MS * 4);
    expect(h.reads()).toBe(reads);
  });

  it('stop ends every timer', async () => {
    const h = harness();
    const stop = h.live.start();
    stop();
    await h.advance(LIGHT_MS * 3);
    expect(h.reads()).toBe(0);
  });
});
