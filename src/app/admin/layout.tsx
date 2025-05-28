'use client'

import { AdminMenu } from '@/components/admin/admin-menu'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen bg-background">
      <AdminMenu />
      <div className="flex-1 p-4 space-y-8">
        {children}
      </div>
    </div>
  )
} 