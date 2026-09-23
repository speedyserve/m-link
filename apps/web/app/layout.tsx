import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';
import { FloatingAssistant } from '@/components/floating-assistant';

// MSB's own site uses Inter; the Vietnamese subset is required for correct diacritics.
const inter = Inter({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '700'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'M-Link | RM Workspace',
  description: 'Relationship intelligence for modern banking',
  icons: { icon: '/favicon.svg' },
};

export const viewport: Viewport = { themeColor: '#091e42' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" className={inter.variable}>
      <body>
        <Providers>
          {children}
          <FloatingAssistant/>
        </Providers>
      </body>
    </html>
  );
}
