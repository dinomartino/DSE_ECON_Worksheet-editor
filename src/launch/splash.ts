/**
 * The launch splash: the app's mark draws itself (axes, demand, supply, the point where
 * they meet), then travels to the start screen's toolbar mark.
 *
 * It lives in the static HTML (`layout.tsx`), so its first frame paints before React
 * hydrates. `splash.css` draws it with keyframes; `SPLASH_BOOT_SCRIPT`, inline in <head>,
 * decides whether it plays and runs the hand-off, so neither waits for React. The overlay
 * is chrome: it never reaches the IR, the .docx or print, and is removed when it ends.
 */

export type SplashMode = 'play' | 'reduce' | 'skip';

export interface SplashInput {
  /** `location.search`: `?nosplash` skips, `?splash=1` plays under automation (filming). */
  search: string;
  /** `navigator.webdriver`: Playwright scripts load the app and click at once. */
  webdriver: boolean;
  /** Has it played in this session? May throw (blocked storage), which means no. */
  seen: () => boolean;
  reducedMotion: boolean;
}

/** Once per session; a desktop cold start is a new session. Serialised into the boot script. */
export function splashMode(input: SplashInput): SplashMode {
  const query = new URLSearchParams(input.search);
  if (query.has('nosplash')) return 'skip';
  if (query.get('splash') !== '1') {
    if (input.webdriver) return 'skip';
    let seen = false;
    try {
      seen = input.seen();
    } catch {
      seen = false;
    }
    if (seen) return 'skip';
  }
  return input.reducedMotion ? 'reduce' : 'play';
}

/** The static overlay. Tile colours are the icon's own (`src/app/icon.svg`), in every theme. */
export const SPLASH_HTML = `<div id="launch-splash" aria-hidden="true" data-print-hide><div class="ls-bg"></div><div class="ls-lockup"><div class="ls-mark"><svg viewBox="0 0 512 512" focusable="false"><rect width="512" height="512" rx="114" fill="#3A342E"/><g opacity="0.34" fill="none" stroke="#FCFAF6" stroke-width="20" stroke-linecap="round"><path class="ls-axis ls-axis-v" d="M118 394V106"/><path class="ls-axis ls-axis-h" d="M118 394H406"/></g><g fill="none" stroke="#FCFAF6" stroke-width="30" stroke-linecap="round"><path class="ls-curve ls-demand" d="M150 150L362 362"/><path class="ls-curve ls-supply" d="M150 362L362 150"/></g><circle class="ls-ripple" cx="256" cy="256" r="100" fill="none" stroke="#1E7FD4" opacity="0"/><circle class="ls-knock" cx="256" cy="256" r="46" fill="#3A342E"/><circle class="ls-dot" cx="256" cy="256" r="30" fill="#1E7FD4"/></svg></div><div class="ls-word"><div class="ls-en">Econ Studio</div><div class="ls-zh" lang="zh-HK">經濟備課室</div></div></div></div>`;

/**
 * Runs inline in <head>, after the theme boot script. Self-contained: it is serialised
 * with `toString()`, so it may use nothing from this module but its argument.
 */
function bootSplash(decide: typeof splashMode): void {
  const KEY = 'econ-studio-launch-played';
  const HOLD = 260; // the finished mark rests before it travels
  const FLIGHT = 450;
  const EASE = 'cubic-bezier(.65,0,.35,1)';
  const root = document.documentElement;
  const mode = decide({
    search: location.search,
    webdriver: navigator.webdriver === true,
    seen: () => sessionStorage.getItem(KEY) === '1',
    reducedMotion: !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  });
  if (mode === 'skip') return;
  try {
    sessionStorage.setItem(KEY, '1');
  } catch {}
  root.setAttribute('data-splash', mode);

  let started = false;
  const overlay = () => document.getElementById('launch-splash');
  const onEnd = (e: AnimationEvent) => {
    if (e.animationName === (mode === 'play' ? 'ls-ripple-fade' : 'ls-fade')) handOff();
  };
  // Any key skips; the skip keystroke itself is spent, but a shortcut still reaches the app.
  const onKey = (e: KeyboardEvent) => {
    if (!e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      e.stopPropagation();
    }
    handOff();
  };
  const onPointer = (e: Event) => {
    const el = overlay();
    if (el && el.contains(e.target as Node)) handOff();
  };
  document.addEventListener('animationend', onEnd, true);
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('pointerdown', onPointer, true);
  const safety = setTimeout(handOff, 6000);

  function handOff() {
    if (started) return;
    started = true;
    clearTimeout(safety);
    document.removeEventListener('animationend', onEnd, true);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('pointerdown', onPointer, true);
    const el = overlay();
    if (!el) return finish();
    el.classList.add('ls-end'); // every keyframe jumps to its end state
    el.style.pointerEvents = 'none';
    setTimeout(() => whenAppReady(travel), HOLD);
  }

  // The start screen mounts after hydration, which may land before or after this point.
  function whenAppReady(next: () => void) {
    if (!document.querySelector('[data-app-booting]')) return next();
    const observer = new MutationObserver(() => {
      if (document.querySelector('[data-app-booting]')) return;
      observer.disconnect();
      clearTimeout(cap);
      next();
    });
    const cap = setTimeout(() => {
      observer.disconnect();
      next();
    }, 6000);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // The toolbar mark, if it is really on screen and nothing covers it.
  function landing(): Element | null {
    const target = document.querySelector('[data-launch-target]');
    const box = target && (target.querySelector('svg') || target).getBoundingClientRect();
    if (!target || !box || box.width === 0) return null;
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return null;
    const hit = document.elementFromPoint(x, y);
    return hit && target.contains(hit) ? target.querySelector('svg') || target : null;
  }

  function travel() {
    const el = overlay();
    if (!el) return finish();
    const to = mode === 'play' && typeof el.animate === 'function' ? landing() : null;
    const mark = el.querySelector<HTMLElement>('.ls-mark');
    if (!to || !mark) {
      const fade = el.animate ? el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' }) : null;
      return fade ? void fade.finished.then(finish, finish) : finish();
    }
    const a = mark.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    mark.style.transformOrigin = '0 0';
    const move = mark.animate(
      [
        { transform: 'none' },
        { transform: `translate(${b.left - a.left}px, ${b.top - a.top}px) scale(${b.width / a.width})` },
      ],
      { duration: FLIGHT, easing: EASE, fill: 'forwards' },
    );
    // The toolbar mark takes the theme's ink, so the icon cross-fades into it, never snaps.
    mark.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, delay: FLIGHT - 100, fill: 'forwards' });
    el.querySelector('.ls-bg')?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FLIGHT, easing: EASE, fill: 'forwards' });
    el.querySelector('.ls-word')?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FLIGHT / 2, fill: 'forwards' });
    move.finished.then(() => setTimeout(finish, 100), finish);
  }

  function finish() {
    overlay()?.remove();
    root.removeAttribute('data-splash');
  }
}

export const SPLASH_BOOT_SCRIPT = `(${bootSplash.toString()})(${splashMode.toString()})`;
