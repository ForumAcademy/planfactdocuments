import type { Metadata, Viewport } from 'next';
import { Toaster } from 'sonner';
import './globals.css';

export const metadata: Metadata = {
  title: 'Статус форумы',
  description: 'Планирование и контроль подготовки деловых форумов',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0F2A5C',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="min-h-screen font-sans">
        {children}
        <Toaster position="bottom-right" richColors closeButton duration={2500} />
      </body>
    </html>
  );
}
