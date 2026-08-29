import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '../components/theme-provider';

export const metadata: Metadata = {
  title: 'CampusStranger — Meet Real People',
  description: 'Instantly connect with campus strangers anonymously. True zero-knowledge client-side end-to-end encryption.',
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('cs-theme');
                  var isDark = theme === 'dark';
                  if (isDark) {
                    document.documentElement.classList.add('dark');
                  } else {
                    document.documentElement.classList.remove('dark');
                  }
                } catch(e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="antialiased min-h-screen flex flex-col selection:bg-coral-light selection:text-coral-dark dark:selection:bg-coral-dark dark:selection:text-coral-light">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
