import type { Metadata } from 'next';
import './globals.css';

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
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
