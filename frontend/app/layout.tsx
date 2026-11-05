import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";

// Initializes the Appwrite client and pings once when the app starts.
import "@/lib/appwrite";

// Expose the loaded family as a CSS variable so the Tailwind `font-sans`
// token resolves to the actual next/font face instead of the literal name
// "Inter", which next/font never registers (it emits `__Inter_<hash>`).
const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'MyFees · Fees Manager',
  description: 'Students, fee structures, receipts, and WhatsApp announcements in one calm workspace.',
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
      { url: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  manifest: '/site.webmanifest',
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
    <html lang="en" className={cn("font-sans", inter.variable)}>
      <head>
        <Script
          async
          src="https://www.googletagmanager.com/gtm.js?id=GTM-K37R3X56"
          strategy="afterInteractive"
        />
        <Script id="gtm-datalayer" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
          `}
        </Script>
      </head>
      <body className="min-h-svh bg-background text-foreground">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
