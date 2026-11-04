import type { Metadata, Viewport } from 'next';
import { DM_Sans, Roboto_Mono, Varela_Round } from 'next/font/google';
import './globals.css';
import '../styles/analysis-embedded.css';
import '../styles/chord-grid.css';
import { Providers } from './providers';
import ClientErrorBoundary from '@/components/common/ClientErrorBoundary';
import AuthSessionProvider from '@/components/auth/AuthSessionProvider';
import ServiceWorkerRegistration from '@/components/layout/ServiceWorkerRegistration';
import { InstallPromptCapture } from '@/components/layout/InstallPrompt';
import ServerStatusBanner from '@/components/layout/ServerStatusBanner';
import AppFooter from '@/components/layout/AppFooter';
import MobileTabBar from '@/components/layout/MobileTabBar';
import PerformanceMonitor from '@/components/layout/PerformanceMonitor';
import CriticalPerformanceOptimizer from '@/components/layout/CriticalPerformanceOptimizer';
import DesktopPerformanceOptimizer from '@/components/layout/DesktopPerformanceOptimizer';
import CriticalCSS from '@/components/layout/CriticalCSS';
import CorsErrorSuppression from '@/components/layout/CorsErrorSuppression';
import DevIndicatorHider from '@/components/layout/DevIndicatorHider';
import { getFrontendBaseUrl } from '@/config/serverBackend';

// Configure Google Fonts
const robotoMono = Roboto_Mono({
  subsets: ['latin'],
  variable: '--font-roboto-mono',
  display: 'swap',
});

// Reference-inspired primary sans (closest supported match to Google Sans)
const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-brand-sans',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

// Previous chord-label font family used across beat grids, guitar chord labels, and lyrics chords
const varelaRound = Varela_Round({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-varela-round',
  display: 'swap',
});



export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#020617' },
  ],
};

// Define metadata for the application
export const metadata: Metadata = {
  metadataBase: new URL(getFrontendBaseUrl()),
  title: {
    default: 'ChordMini - Chord Recognition and Beat Tracking with LLM',
    template: '%s | ChordMini'
  },
  description: 'Advanced music analysis platform with AI-powered chord recognition, beat detection, and synchronized lyrics. Analyze YouTube videos and audio files to discover chord progressions, beats, and musical structure.',
  keywords: [
    'chord recognition',
    'music analysis',
    'beat detection',
    'chord progression',
    'music theory',
    'audio analysis',
    'YouTube music',
    'chord charts',
    'music AI',
    'song analysis',
    'chord detection',
    'music transcription'
  ],
  authors: [
    {
      name: 'lamvu0607',
      url: 'https://github.com/lamvu0607-creator'
    }
  ],
  creator: 'lamvu0607',
  publisher: 'ChordMini',
  category: 'Music Technology',
  classification: 'Open Source Software',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  // PNG icons: iOS and Android home screens do not reliably use WebP icons.
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32', type: 'image/x-icon' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  manifest: '/site.webmanifest',
  applicationName: 'ChordMini',
  // Opened from the home screen, iOS shows the app without Safari's bars.
  appleWebApp: {
    capable: true,
    title: 'ChordMini',
    statusBarStyle: 'default',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://chordmini.me',
    siteName: 'ChordMini',
    title: 'ChordMini - Chord Recognition and Beat Tracking with LLM',
    description: 'Advanced music analysis platform with AI-powered chord recognition, beat detection, and synchronized lyrics.',
    images: [
      {
        url: '/chordMiniLogo.webp',
        width: 1200,
        height: 630,
        alt: 'ChordMini - Music Analysis Platform',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ChordMini - Chord Recognition and Beat Tracking with LLM',
    description: 'Advanced music analysis platform with AI-powered chord recognition, beat detection, and synchronized lyrics.',
    images: ['/chordMiniLogo.webp'],
  },
  verification: {
    google: 'google-site-verification-code', // To be replaced with actual verification code
  },
  alternates: {
    canonical: 'https://chordmini.me',
  },
};

// Root layout component that wraps all pages
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${robotoMono.variable} ${dmSans.variable} ${varelaRound.variable}`} suppressHydrationWarning>
      <head>
        {/* Blocking script: apply dark class BEFORE first paint to prevent theme flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t!=='light'){document.documentElement.classList.add('dark')}}catch(e){}if(document.body){document.body.classList.add('theme-ready')}else{document.addEventListener('DOMContentLoaded',function(){document.body.classList.add('theme-ready')},{once:true})}})()`
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var noisyLog=/^\\[Fast Refresh\\]|^\\[HMR\\]\\s+connected|^\\[BEAT_DRIFT_DEBUG\\]/;var ol=console.log;console.log=function(){var s=Array.prototype.join.call(arguments,' ');if(noisyLog.test(s))return;ol.apply(console,arguments)}}catch(e){}})()`
          }}
        />
        {/* Critical CSS inlined for performance - eliminates render blocking */}
        <style dangerouslySetInnerHTML={{
          __html: `
            /* Critical above-the-fold styles */
            html { font-family: var(--font-brand-sans), ui-sans-serif, system-ui, sans-serif; }
            body { margin: 0; padding: 0; background: #f8fafc; visibility: hidden; }
            body.theme-ready { visibility: visible; }
            .dark body { background: #1e252e; }
            /* Fallback: ensure page is visible if JS fails or takes too long */
            @media (scripting: none) { body { visibility: visible; } }
            .hero-container { min-height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; }
            .critical-layout { contain: layout style paint; will-change: auto; transform: translateZ(0); }
            /* Prevent layout shifts */
            img[data-lcp-image] { width: 100%; height: auto; object-fit: cover; }
            /* Font display optimization */
            @font-face { font-display: swap; }
            /* Navigation critical styles */
            nav[data-chordmini-navigation="true"] {
              position: fixed;
              inset-inline: 0;
              top: 0;
              z-index: 100;
              background: transparent;
              backdrop-filter: none;
              -webkit-backdrop-filter: none;
              border: 0;
              box-shadow: none;
            }
            .dark nav[data-chordmini-navigation="true"] { background: transparent; }
            /* Hero section optimization */
            .hero-section { min-height: calc(100vh - 80px); display: flex; align-items: start; justify-content: center; }
            /* Button base styles */
            button { cursor: pointer; transition: all 0.2s ease; }
            /* Image optimization */
            img { max-width: 100%; height: auto; }
          `
        }} />

        <meta name="description" content="Recognize chords from audio using AI" />

        {/* Icons, the manifest and the iOS home screen tags come from `metadata` above. */}

        {/* Removed global image preloads: let Next/Image with priority handle above-the-fold assets on the pages that use them to avoid preload-not-used warnings. */}

        {/* DNS prefetch for external services */}
        <link rel="dns-prefetch" href="//youtube.com" />
        <link rel="dns-prefetch" href="//googleapis.com" />
        <link rel="dns-prefetch" href="//vercel.app" />

        {/* Critical CSS for above-the-fold content */}
        <CriticalCSS />
      </head>
      <body className="font-sans min-h-screen flex flex-col" suppressHydrationWarning>
        <Providers>
          <AuthSessionProvider>
            <ClientErrorBoundary>
              <CriticalPerformanceOptimizer />
              <DesktopPerformanceOptimizer />
              <ServiceWorkerRegistration />
              <InstallPromptCapture />
              <ServerStatusBanner />
              {process.env.NODE_ENV === 'development' ? <PerformanceMonitor /> : null}
              <CorsErrorSuppression />
              {process.env.NODE_ENV === 'development' ? <DevIndicatorHider /> : null}
              <main className="flex-1">
                {children}
              </main>
              <AppFooter />
              <MobileTabBar />
            </ClientErrorBoundary>
          </AuthSessionProvider>
        </Providers>
      </body>
    </html>
  );
}
