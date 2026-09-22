import type { NextConfig } from 'next';

// Static export. The app is browser-only by design (see CLAUDE.md): no server runtime,
// no API routes, everything renders client-side. `out/` is both what Vercel serves and
// what Tauri bundles as `frontendDist`, so the two targets stay byte-identical.
const nextConfig: NextConfig = {
  output: 'export',
  // next/image has no optimiser without a server; the app ships its own <img> paths.
  images: { unoptimized: true },
};

export default nextConfig;
