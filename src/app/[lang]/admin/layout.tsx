import { AdminMenu } from '@/components/admin/admin-menu'

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { lang: string }
}) {
  const resolvedParams = await Promise.resolve(params)
  return (
    <div className="flex min-h-screen">
      <AdminMenu lang={resolvedParams.lang} />
      <main className="flex-1 p-8">
        {children}
      </main>
    </div>
  )
} 