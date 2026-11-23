/**
 * Is this a release build: the one the Release workflow makes for a `v*` tag, the app
 * teachers install. Every other build is a develop build: `npm run dev`, `npm run build` on
 * develop or in CI, a desktop preview (`docs/DESKTOP-PREVIEW.md`). A feature that is built
 * and on `develop` but not shipped yet asks this and hides itself in a release build (the
 * Question studio: `questionStudio/trial.ts`).
 *
 * A build-time constant: when Next builds with the flag set it replaces the reference with
 * its value (a release's bundle holds `true`, checked in the built `out/`); in any other build
 * there is nothing to replace and the browser's `process.env` is empty, so it reads `false`.
 * Only `.github/workflows/release.yml` sets it, to exactly `1`; anything else, or nothing, is
 * a develop build (`buildChannel.test.ts` pins both halves). The reference must stay spelled
 * `process.env.NEXT_PUBLIC_RELEASE_BUILD`: Next replaces that form only.
 */
export const RELEASE_BUILD: boolean = process.env.NEXT_PUBLIC_RELEASE_BUILD === '1';
