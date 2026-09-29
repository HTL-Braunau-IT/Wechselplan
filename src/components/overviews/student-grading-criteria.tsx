'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ChevronRight, ClipboardCheck } from 'lucide-react'
import { useSchoolYear } from '@/contexts/school-year-context'
import { apiFetch } from '@/lib/api-client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { TeacherPhoto } from '@/components/teacher-photo'
import { CriteriaDocument } from '@/components/grading-criteria/criteria-document'
import type { StudentGradingCriteria as Entry } from '@/types/grading-criteria'

/**
 * The student's home-page list of Beurteilungskriterien: one row per teacher in
 * their Wechselplan who has published criteria, opening the full sheet in a
 * dialog. Which template a row shows (class override or the teacher's default)
 * is decided server-side by GET /api/me/grading-criteria.
 */
export function StudentGradingCriteria() {
  const { t } = useTranslation()
  const { selectedYear } = useSchoolYear()
  const schoolYearId = selectedYear?.id
  const [open, setOpen] = useState<Entry | null>(null)

  const { data, isLoading, isError } = useQuery<Entry[]>({
    queryKey: ['me', 'grading-criteria', schoolYearId ?? null],
    queryFn: () =>
      apiFetch<Entry[]>(
        `/api/me/grading-criteria${schoolYearId != null ? `?schoolYearId=${schoolYearId}` : ''}`,
      ),
    staleTime: 1000 * 60 * 5,
  })

  // Quietly absent while loading or on error: the rest of the overview matters more.
  if (isLoading || isError || !data) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ClipboardCheck className="h-5 w-5" />
          {t('gradingCriteria.student.title')}
        </CardTitle>
        <CardDescription>{t('gradingCriteria.student.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-muted-foreground text-sm italic">
            {t('gradingCriteria.student.none')}
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {data.map(entry => (
              <li key={entry.teacherId}>
                <button
                  type="button"
                  onClick={() => setOpen(entry)}
                  className="hover:bg-muted/60 focus-visible:ring-ring flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
                >
                  <TeacherPhoto
                    teacherId={entry.teacherId}
                    firstName={entry.teacherFirstName}
                    lastName={entry.teacherLastName}
                    size={36}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {entry.teacherFirstName} {entry.teacherLastName}
                    </span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {entry.subjects.join(', ') || entry.criteria.title}
                    </span>
                  </span>
                  <span className="text-primary flex shrink-0 items-center text-xs font-medium">
                    {t('gradingCriteria.student.view')}
                    <ChevronRight className="h-4 w-4" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={open != null} onOpenChange={o => !o && setOpen(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="sr-only">{open?.criteria.title}</DialogTitle>
            <DialogDescription className="sr-only">{open?.criteria.teacherName}</DialogDescription>
          </DialogHeader>
          {open ? (
            <CriteriaDocument
              title={open.criteria.title}
              subtitle={open.criteria.subtitle ?? open.criteria.teacherName}
              content={open.criteria.content}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  )
}
