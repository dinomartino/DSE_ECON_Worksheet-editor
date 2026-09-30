import type { Metadata } from 'next';
import { Newsreader } from 'next/font/google';
import { THEME_BOOT_SCRIPT } from '@/settings/appearance';
import { SPLASH_BOOT_SCRIPT, SPLASH_HTML } from '@/launch/splash';
import './globals.css';
import '@/launch/splash.css';

// The chrome's one display voice (see design/icons/design.md § Typography): a light editorial
// serif for the screen-level greeting, standing in for the studied reference's
// Martina Plantijn. UI text stays on the system grotesque; the paper never uses it.
const newsreader = Newsreader({
  subsets: ['latin'],
  variable: '--font-display-serif',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Econ Studio 經濟備課室',
  description: 'Worksheets, papers and notes for HKDSE Economics teachers.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The document language is English, but content is bilingual; individual
    // elements carry their own lang so browsers pick correct CJK fonts. `data-theme` is
    // set by the boot script before hydration, hence suppressHydrationWarning.
    <html lang="en" className={`h-full antialiased ${newsreader.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: SPLASH_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full">
        {children}
        {/* The launch splash, static so it paints before hydration. React owns only this
            host: the boot script removes what is inside it when the splash ends. */}
        <div suppressHydrationWarning dangerouslySetInnerHTML={{ __html: SPLASH_HTML }} />
      </body>
    </html>
  );
}
