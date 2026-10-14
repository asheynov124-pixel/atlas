import type { Metadata, Viewport } from 'next';
import { Archivo, Newsreader, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { RegisterSW } from '@/components/RegisterSW';

const archivo = Archivo({ subsets: ['latin'], axes: ['wdth'], variable: '--font-archivo', display: 'swap' });
const newsreader = Newsreader({ subsets: ['latin'], axes: ['opsz'], style: ['normal', 'italic'], variable: '--font-newsreader', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'MODUS', template: '%s · MODUS' },
  description: 'Serial murder in America, graded by evidence',
  applicationName: 'MODUS',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'MODUS', statusBarStyle: 'black' },
};
export const viewport: Viewport = { themeColor: '#14161A', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${newsreader.variable} ${mono.variable}`}>
      <body>{children}<RegisterSW /></body>
    </html>
  );
}
