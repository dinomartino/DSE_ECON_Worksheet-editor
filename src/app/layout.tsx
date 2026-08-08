import type { Metadata } from 'next';
import { Newsreader } from 'next/font/google';
import './globals.css';

// The chrome's one display voice (see design.md § Typography): a light editorial
// serif for the screen-level greeting, standing in for the studied reference's
// Martina Plantijn. UI text stays on the system grotesque; the paper never uses it.
const newsreader = Newsreader({
  subsets: ['latin'],
  variable: '--font-display-serif',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'HKDSE Economics Worksheet Generator',
  description:
    'Build bilingual (English / 繁體中文) HKDSE Economics worksheets and export native Microsoft Word documents.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The document language is English, but content is bilingual; individual
    // elements carry their own lang so browsers pick correct CJK fonts.
    <html lang="en" className={`h-full antialiased ${newsreader.variable}`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
