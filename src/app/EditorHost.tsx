'use client';

import dynamic from 'next/dynamic';

/**
 * Client-only host for the editor.
 *
 * The editor's initial state is a blank worksheet built by the factories, whose ids
 * come from `nanoid()` — so the server and the client each generate a *different*
 * document, React reports a hydration mismatch and then discards the server tree and
 * re-renders the entire editor. Seeding those ids to make the two agree would be the
 * wrong fix: this page has nothing worth server-rendering. It reads the last
 * worksheet from localStorage on mount, builds its .docx in the browser, and prints
 * its PDF through the browser's own engine.
 *
 * `ssr: false` therefore states the truth about the page rather than papering over a
 * symptom. It skips prerendering, not the static export target — no server runtime is
 * introduced, so the Vercel static deploy is unaffected.
 *
 * `ssr: false` is only legal from a Client Component in the App Router, which is why
 * this thin wrapper exists rather than the call living in `page.tsx`.
 */
const EditorApp = dynamic(
  () => import('@/components/EditorApp').then((m) => m.EditorApp),
  { ssr: false },
);

export function EditorHost() {
  return <EditorApp />;
}
