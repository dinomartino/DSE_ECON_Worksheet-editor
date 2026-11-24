/**
 * Which DSEcon Mentor the hosted AI talks to (k-0519): its app API, its pricing and Account
 * pages, and the only host whose links the app opens all follow one origin.
 *
 * Production (`https://dseconmentor.com`) unless a develop build is made with
 * `NEXT_PUBLIC_MENTOR_ORIGIN` set, e.g. to a Vercel Preview of Mentor for a test with Stripe's
 * test mode. A build-time constant only: Next writes the value into the bundle when it builds,
 * and nothing in the app (no setting, no stored value, no URL) can change it afterwards.
 * A release build always uses production: the Release workflow sets the variable to empty on
 * its build step, and `next.config.ts` refuses to build a release with it set. A value that is
 * not a bare `https://host` (or `http://localhost:port` for Mentor's dev server) stops the
 * build there too.
 *
 * Imports nothing: `next.config.ts` loads this file to check the value.
 */

export const MENTOR_PRODUCTION_ORIGIN = 'https://dseconmentor.com';
const PRODUCTION_HOSTS = ['dseconmentor.com', 'www.dseconmentor.com'];
const LOCAL_HOSTS = ['localhost', '127.0.0.1'];

export type MentorOriginCheck = { ok: true; origin: string } | { ok: false; error: string };

/** The origin a `NEXT_PUBLIC_MENTOR_ORIGIN` value names, or why it can't be used. Empty: production. */
export function checkMentorOrigin(raw: string | undefined): MentorOriginCheck {
  const text = (raw ?? '').trim();
  if (!text) return { ok: true, origin: MENTOR_PRODUCTION_ORIGIN };
  let u: URL;
  try {
    u = new URL(text);
  } catch {
    return { ok: false, error: `"${text}" is not a URL; use e.g. https://my-preview.vercel.app` };
  }
  if (u.username || u.password) return { ok: false, error: 'no user name or password in the origin' };
  if ((u.pathname !== '/' && u.pathname !== '') || u.search || u.hash || /[?#]$/.test(text)) {
    return { ok: false, error: `just the origin, no path, query or #: ${u.origin}` };
  }
  const local = LOCAL_HOSTS.includes(u.hostname);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) {
    return { ok: false, error: 'https only (http only for localhost or 127.0.0.1)' };
  }
  return { ok: true, origin: u.origin };
}

/** The origin a build uses: production when unset, else the checked value. */
export function resolveMentorOrigin(raw: string | undefined): string {
  const check = checkMentorOrigin(raw);
  // next.config.ts stops a build with a bad value, so this only guards a test or a stray import.
  if (!check.ok) throw new Error(`NEXT_PUBLIC_MENTOR_ORIGIN: ${check.error}`);
  return check.origin;
}

/** Everything the app derives from one origin. */
export function mentorEndpoints(origin: string) {
  const production = origin === MENTOR_PRODUCTION_ORIGIN;
  return {
    origin,
    production,
    /** The app API root; the relay is `${api}/ai` (`Outbox/k-0518/CONTRACT.md`). */
    api: `${origin}/api/app/v1`,
    pricingUrl: `${origin}/pricing#ai-credits`,
    buyUrl: `${origin}/account#ai-credits`,
    /** Hosts (with port) whose https links the app opens: production's two, else only that one. */
    hosts: new Set(production ? PRODUCTION_HOSTS : [new URL(origin).host]),
    /** Shown on the account card when not production, so a test build is never taken for the real one. */
    label: new URL(origin).host,
  };
}

/** The reference must stay spelled `process.env.NEXT_PUBLIC_MENTOR_ORIGIN`: Next replaces that form only. */
export const MENTOR = mentorEndpoints(resolveMentorOrigin(process.env.NEXT_PUBLIC_MENTOR_ORIGIN));
