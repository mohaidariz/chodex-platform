import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Chodex — AI Document Assistant Platform',
  description:
    'Turn your documents into an intelligent assistant. Answer customer questions, learn from conversations, and send automated emails.',
  keywords: ['AI assistant', 'document assistant', 'chatbot', 'SaaS', 'Chodex'],
  openGraph: {
    title: 'Chodex — AI Document Assistant',
    description: 'Turn your documents into an intelligent assistant.',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased bg-slate-50 text-slate-900">
        {children}
      </body>
    </html>
  )
}
