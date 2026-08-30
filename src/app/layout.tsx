import type { Metadata, Viewport } from 'next';
import './globals.css';
import { FirebaseClientProvider } from '@/firebase';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: 'Hablame Perrito Plus - Gestión Inteligente',
  description: 'Sistema profesional de inventario y POS móvil para Hablame Perrito Plus.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#1F262E',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased bg-background text-foreground min-h-screen" suppressHydrationWarning>
        <FirebaseClientProvider>
          <AuthGuard>
            {children}
          </AuthGuard>
          <Toaster />
        </FirebaseClientProvider>
      </body>
    </html>
  );
}
