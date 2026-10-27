import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";

// Initializes the Appwrite client and pings once when the app starts.
import "@/lib/appwrite";

const inter = Inter({ subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  title: 'MyFees · Fees Manager',
  description: 'Students, fee structures, receipts, and WhatsApp announcements in one calm workspace.',
};

// Lock the page to the device width on phones: no pinch/double-tap zoom and no
// browser auto-zoom when an input is focused, so the layout always fits the screen.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("font-sans", inter.className)}>
      <body className="min-h-svh bg-background text-foreground">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
