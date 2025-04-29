import type { Metadata } from 'next'
import './globals.css'
import Script from 'next/script'

export const metadata: Metadata = {
  title: 'Reddit Opportunity Engine',
  description: 'Discover untapped business opportunities by analyzing Reddit communities and engagement patterns',
  generator: 'Next.js',
  keywords: ['reddit', 'business opportunities', 'subreddit analysis', 'product research', 'market research', 'social media insights'],
  authors: [{ name: 'Reddit Opportunity Engine' }],
  openGraph: {
    title: 'Reddit Opportunity Engine',
    description: 'Discover untapped business opportunities by analyzing Reddit communities and engagement patterns',
    url: 'https://reddit-opportunity-engine.com',
    siteName: 'Reddit Opportunity Engine',
    images: [
      {
        url: '/og-image.png', 
        width: 1200,
        height: 630,
        alt: 'Reddit Opportunity Engine'
      }
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Reddit Opportunity Engine',
    description: 'Discover untapped business opportunities by analyzing Reddit communities and engagement patterns',
    images: ['/og-image.png'],
  },
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon-16x16.png',
    apple: '/apple-touch-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🚀</text></svg>" />
      </head>
      <body>
        {children}
        <Script
          id="json-ld"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              "name": "Reddit Opportunity Engine",
              "url": "https://reddit-opportunity-engine.com",
              "description": "Discover untapped business opportunities by analyzing Reddit communities and engagement patterns",
              "applicationCategory": "BusinessApplication",
              "operatingSystem": "Web",
              "offers": {
                "@type": "Offer",
                "price": "0.00",
                "priceCurrency": "USD"
              },
              "creator": {
                "@type": "Organization",
                "name": "Reddit Opportunity Engine",
                "url": "https://reddit-opportunity-engine.com"
              },
              "potentialAction": {
                "@type": "UseAction",
                "target": "https://reddit-opportunity-engine.com"
              }
            })
          }}
        />
      </body>
    </html>
  )
}
