import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import './globals.css';
import { shareMetadata } from '@/lib/sharing/metadata';
import { previewForRoute } from '@/lib/sharing/previews';
import { ThemeProvider } from '@/hooks/use-theme';
import { ThemedToaster } from '@/components/themed-toaster';
import {
  DEFAULT_MODE,
  DEFAULT_THEME,
  MODE_STORAGE_KEY,
  MODES,
  STORAGE_KEY,
  THEME_IDS,
} from '@/lib/themes';

const geistSans = localFont({
  src: '../../node_modules/next/dist/next-devtools/server/font/geist-latin-ext.woff2',
  variable: '--font-geist-sans',
  display: 'swap',
  fallback: ['Arial', 'Helvetica', 'sans-serif'],
});

const geistMono = localFont({
  src: '../../node_modules/next/dist/next-devtools/server/font/geist-mono-latin-ext.woff2',
  variable: '--font-geist-mono',
  display: 'swap',
  fallback: ['Consolas', 'monospace'],
});

export const metadata: Metadata = {
  ...shareMetadata({ ...previewForRoute('/'), index: false }),
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || 'https://jpmassagem.pt'
  ),
  manifest: '/manifest.webmanifest',
  applicationName: 'JP Massagem',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'JP Massagem',
  },
  title: {
    default: 'JP Massagem',
    template: '%s | JP Massagem',
  },
  description: previewForRoute('/').description,
  robots: {
    index: false,
    follow: false,
  },
  icons: {
    icon: [
      {
        url: '/icons/jp-massagem-32-v1.png',
        sizes: '32x32',
        type: 'image/png',
      },
      {
        url: '/icons/jp-massagem-64-v1.png',
        sizes: '64x64',
        type: 'image/png',
      },
    ],
    apple: [
      {
        url: '/icons/jp-massagem-180-v1.png',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  },
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: '#020617',
  colorScheme: 'dark light',
};

// Inline boot script — runs before React hydrates so the user's
// chosen accent (data-theme) AND mode (data-mode) are on the <html>
// element before first paint. Without this every page load flashes
// the server-rendered defaults for a frame before the React tree
// mounts and applies the picked values.
//
// Kept dependency-free (no imports, no JSX) — must be a string the
// browser can run as a single <script>. Knowledge of valid ids is
// sourced from the THEME_IDS / MODES constants so adding one doesn't
// silently break the boot path.
const THEME_BOOT_SCRIPT = `
(function(){
  var d = document.documentElement;
  try {
    var THEME_KEY = ${JSON.stringify(STORAGE_KEY)};
    var THEME_DEFAULT = ${JSON.stringify(DEFAULT_THEME)};
    var THEMES = ${JSON.stringify(THEME_IDS)};
    var savedTheme = localStorage.getItem(THEME_KEY);
    d.dataset.theme = THEMES.indexOf(savedTheme) !== -1 ? savedTheme : THEME_DEFAULT;

    var MODE_KEY = ${JSON.stringify(MODE_STORAGE_KEY)};
    var MODE_DEFAULT = ${JSON.stringify(DEFAULT_MODE)};
    var MODES = ${JSON.stringify(MODES)};
    var savedMode = localStorage.getItem(MODE_KEY);
    var modePreference = MODES.indexOf(savedMode) !== -1 ? savedMode : MODE_DEFAULT;
    var systemDark = false;
    try {
      systemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch (_mq) {}
    d.dataset.mode = modePreference === 'system' ? (systemDark ? 'dark' : 'light') : modePreference;
  } catch (_e) {
    d.dataset.theme = ${JSON.stringify(DEFAULT_THEME)};
    d.dataset.mode = ${JSON.stringify(DEFAULT_MODE)};
  }
})();
`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      data-theme={DEFAULT_THEME}
      data-mode={DEFAULT_MODE}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // The `theme-boot` script below rewrites `data-theme` and
      // `data-mode` on <html> from localStorage before React hydrates,
      // so for any non-default choice the client DOM intentionally
      // differs from the server-rendered defaults. suppressHydration-
      // Warning silences the expected mismatch — it only applies to
      // this element's own attributes, so genuine mismatches in
      // children still surface.
      suppressHydrationWarning
    >
      <head>
        <script
          id="theme-boot"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }}
        />
      </head>
      <body className="bg-background text-foreground min-h-full font-sans">
        <NextIntlClientProvider messages={messages} locale={locale}>
          <ThemeProvider>
            {children}
            <ThemedToaster />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
