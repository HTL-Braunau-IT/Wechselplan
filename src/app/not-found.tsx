import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <h1 className="mb-4 text-4xl font-bold">404 - Page Not Found</h1>
      <p className="mb-8 text-lg">The page you are looking for does not exist.</p>
      <Link
        href="/"
        className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 transition-colors"
      >
        Return Home
      </Link>
    </div>
  )
}
