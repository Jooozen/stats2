import type { Metadata } from 'next';
import './globals.css';
import Navigation from './Navigation';
import AuthProvider from './AuthProvider';

export const metadata: Metadata = {
  title: 'バスケスタッツ',
  description: 'バスケットボール試合スタッツ記録アプリ',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="bg-gray-900 text-gray-200 min-h-screen pb-16">
        <AuthProvider>
          <main className="max-w-7xl mx-auto">{children}</main>
          <Navigation />
        </AuthProvider>
      </body>
    </html>
  );
}
