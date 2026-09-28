import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Fees Manager',
  description: 'Next.js + Fastify + Postgres fees app',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
