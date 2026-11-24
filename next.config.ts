import type { NextConfig } from 'next';
import { checkMentorOrigin } from './src/ai/mentorOrigin';
import { RELEASE_BUILD } from './src/platform/buildChannel';

// Static export. The app is browser-only by design (see AGENTS.md): no server runtime,
// no API routes, everything renders client-side. `out/` is both what Vercel serves and
// what Tauri bundles as `frontendDist`, so the two targets stay byte-identical.

// Which DSEcon Mentor the hosted AI uses (`src/ai/mentorOrigin.ts`): production unless a
// develop build sets NEXT_PUBLIC_MENTOR_ORIGIN. Stop here rather than build an app that
// talks to an address nobody meant, or a release that talks to anything but production.
const mentorOrigin = process.env.NEXT_PUBLIC_MENTOR_ORIGIN?.trim();
if (mentorOrigin) {
  if (RELEASE_BUILD) {
    throw new Error('NEXT_PUBLIC_MENTOR_ORIGIN is set in a release build: a release always uses https://dseconmentor.com. Unset it.');
  }
  const check = checkMentorOrigin(mentorOrigin);
  if (!check.ok) throw new Error(`NEXT_PUBLIC_MENTOR_ORIGIN: ${check.error}`);
  console.warn(`\n  Hosted AI uses the DSEcon Mentor at ${check.origin} (NEXT_PUBLIC_MENTOR_ORIGIN), not production.\n`);
}

const nextConfig: NextConfig = {
  output: 'export',
  // next/image has no optimiser without a server; the app ships its own <img> paths.
  images: { unoptimized: true },
};

export default nextConfig;
