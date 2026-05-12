import type { Metadata } from 'next'
import './globals.css'
import { Providers } from './providers'
import QueryProvider from '@/providers/query-provider'
import { Toaster } from 'sonner'
import { getServerSessionSafe } from '@/lib/auth'
import { getEnabledFeatures } from '@/lib/entitlements'

export const metadata: Metadata = {
  title: 'Wechselplan',
  description: 'Wechselplan',
  metadataBase: new URL('http://localhost:3000'),
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSessionSafe()
  const features = await getEnabledFeatures()
  const hasBase = features.includes('base')

  if (session?.user && !hasBase) {
    return (
      <html lang="de" suppressHydrationWarning>
        <body>
          <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
            <div
              role="alert"
              className="max-w-md rounded-lg border border-destructive/30 bg-destructive/10 p-8 text-center"
            >
              <h1 className="text-xl font-semibold text-destructive">
                Es ist keine gültige Lizenz vorhanden.
              </h1>
              <p className="mt-3 text-muted-foreground">
                Bitte wenden Sie sich an Ihren Administrator.
              </p>
            </div>
          </div>
        </body>
      </html>
    )
  }

  return (
    <html lang="de" suppressHydrationWarning>
      <body>
        <QueryProvider>
          <Providers>
            {children}
            <Toaster />
          </Providers>
        </QueryProvider>
      </body>
    </html>
  )
}
