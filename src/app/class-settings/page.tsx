'use client'

import { useMemo, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { AlertCircle, School, Search, UserCheck, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { useSchoolYear } from '@/contexts/school-year-context'
import { ClassAssignmentRow } from './_components/class-assignment-row'
import { useClasses, useTeachers, useUpdateAssignment } from './_hooks/use-class-settings'

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon
  label: string
  value: string
}) {
  return (
    <div className="border-border/60 bg-card flex items-center gap-3 rounded-xl border p-4">
      <span className="bg-muted text-muted-foreground flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-2xl leading-none font-semibold">{value}</p>
        <p className="text-muted-foreground mt-1 truncate text-xs">{label}</p>
      </div>
    </div>
  )
}

function RowSkeleton() {
  return (
    <div className="border-border/60 bg-card flex flex-col gap-4 rounded-xl border p-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:w-[32rem]">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    </div>
  )
}

/**
 * Assigns a Klassenvorstand (class head) and Klassenleiter (class lead) to each
 * class. Admin-only (see nav-items / the admin-gated PATCH): the assignment
 * decides who may lock a class's grades after the Sokrates transfer.
 */
export default function ClassSettingsPage() {
  const { t } = useTranslation()
  const { selectedYear } = useSchoolYear()
  const schoolYearId = selectedYear?.id

  const classesQuery = useClasses(schoolYearId)
  const teachersQuery = useTeachers()
  const { update, pendingKeys } = useUpdateAssignment(schoolYearId)

  const [search, setSearch] = useState('')
  const [onlyIncomplete, setOnlyIncomplete] = useState(false)

  const classes = useMemo(() => classesQuery.data ?? [], [classesQuery.data])
  const teachers = teachersQuery.data ?? []

  const stats = useMemo(() => {
    const headCount = classes.filter(c => c.classHeadId != null).length
    const leadCount = classes.filter(c => c.classLeadId != null).length
    return { total: classes.length, headCount, leadCount }
  }, [classes])

  const filteredClasses = useMemo(() => {
    const q = search.trim().toLowerCase()
    return classes.filter(c => {
      if (q && !c.name.toLowerCase().includes(q)) return false
      if (onlyIncomplete && c.classHeadId != null && c.classLeadId != null) return false
      return true
    })
  }, [classes, search, onlyIncomplete])

  const isLoading = classesQuery.isLoading || teachersQuery.isLoading
  const isError = classesQuery.isError || teachersQuery.isError

  return (
    <PageContainer>
      <div className="space-y-6">
        <PageHeader
          icon={School}
          title={t('classSettings.title')}
          description={t('classSettings.description')}
        />

        {isError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{t('classSettings.error.load')}</AlertTitle>
            <AlertDescription>{t('classSettings.error.loadHint')}</AlertDescription>
          </Alert>
        ) : isLoading ? (
          <div className="space-y-3">
            <RowSkeleton />
            <RowSkeleton />
            <RowSkeleton />
          </div>
        ) : classes.length === 0 ? (
          <EmptyState
            icon={School}
            title={t('classSettings.empty.title')}
            description={t('classSettings.empty.description')}
          />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard
                icon={Users}
                label={t('classSettings.stats.total')}
                value={String(stats.total)}
              />
              <StatCard
                icon={UserCheck}
                label={t('classSettings.classHead')}
                value={`${stats.headCount}/${stats.total}`}
              />
              <StatCard
                icon={UserCheck}
                label={t('classSettings.classLead')}
                value={`${stats.leadCount}/${stats.total}`}
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative sm:w-72">
                <Search className="text-muted-foreground pointer-events-none absolute top-2.5 left-2.5 h-4 w-4" />
                <Input
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder={t('classSettings.searchPlaceholder')}
                  className="pl-8"
                  aria-label={t('classSettings.searchPlaceholder')}
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="only-incomplete"
                  checked={onlyIncomplete}
                  onCheckedChange={setOnlyIncomplete}
                />
                <Label htmlFor="only-incomplete" className="text-sm font-normal">
                  {t('classSettings.onlyIncomplete')}
                </Label>
              </div>
            </div>

            {filteredClasses.length === 0 ? (
              <EmptyState
                icon={Search}
                title={t('classSettings.noResults.title')}
                description={t('classSettings.noResults.description')}
              />
            ) : (
              <div className="space-y-3">
                {filteredClasses.map(cls => (
                  <ClassAssignmentRow
                    key={cls.id}
                    cls={cls}
                    teachers={teachers}
                    pendingKeys={pendingKeys}
                    onUpdate={update}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </PageContainer>
  )
}
