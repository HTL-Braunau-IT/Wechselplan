'use client'

import { AdminMenu } from '@/components/admin/admin-menu'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background flex min-h-screen flex-col lg:flex-row">
      <AdminMenu />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  )
}
