import { AdminMenu } from '@/components/admin/admin-menu'

export default function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { lang: string }
}) {
  return (
    <div className="flex min-h-screen">
      <AdminMenu lang={params.lang} />
      <main className="flex-1 p-8">
        {children}
      </main>
    </div>
  )
} 