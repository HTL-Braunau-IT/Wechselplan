'use client'

import { useCallback, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { apiFetch, apiSend, errorMessageOf } from '@/lib/api-client'
import type { Class, Teacher } from '@/types/types'

/** Which of the two roles an assignment targets. */
export type AssignmentField = 'head' | 'lead'

/** Stable pending-key so each class/role picker can show its own spinner. */
export const pendingKeyOf = (classId: number, field: AssignmentField) => `${classId}:${field}`

const classesKey = (schoolYearId: number | undefined) => ['classes', schoolYearId ?? null] as const

const teachersKey = ['teachers'] as const

/** Active classes for the selected year (or all classes when none is set). */
export function useClasses(schoolYearId: number | undefined) {
  const { t } = useTranslation()
  return useQuery({
    queryKey: classesKey(schoolYearId),
    queryFn: () =>
      apiFetch<Class[]>(
        schoolYearId != null ? `/api/classes?schoolYearId=${schoolYearId}` : '/api/classes',
        { errorMessage: t('classSettings.error.load') },
      ),
    staleTime: 30_000,
  })
}

/** All teachers, keyed the same as {@link useCachedData} so the cache is shared. */
export function useTeachers() {
  const { t } = useTranslation()
  return useQuery({
    queryKey: teachersKey,
    queryFn: () =>
      apiFetch<Teacher[]>('/api/teachers', { errorMessage: t('classSettings.error.load') }),
    staleTime: 30_000,
  })
}

interface UpdateVars {
  classId: number
  field: AssignmentField
  teacherId: number | null
}

/**
 * Assigns a Klassenvorstand/Klassenleiter to a class. Optimistically writes the
 * new id into the cached list so the picker updates instantly, reconciles with
 * the server response on success, and rolls back on failure. `pendingKeys`
 * tracks in-flight updates per class/role so several rows can update at once.
 */
export function useUpdateAssignment(schoolYearId: number | undefined) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [pendingKeys, setPendingKeys] = useState<ReadonlySet<string>>(() => new Set())

  const mutation = useMutation({
    mutationFn: ({ classId, field, teacherId }: UpdateVars) =>
      apiSend<Class>(
        `/api/classes/${classId}`,
        'PATCH',
        { [field === 'head' ? 'classHeadId' : 'classLeadId']: teacherId },
        { errorMessage: t('classSettings.error.update') },
      ),
    onMutate: vars => {
      const key = pendingKeyOf(vars.classId, vars.field)
      setPendingKeys(prev => new Set(prev).add(key))

      const qKey = classesKey(schoolYearId)
      const previous = queryClient.getQueryData<Class[]>(qKey)
      const field = vars.field === 'head' ? 'classHeadId' : 'classLeadId'
      queryClient.setQueryData<Class[]>(qKey, old =>
        old?.map(c => (c.id === vars.classId ? { ...c, [field]: vars.teacherId } : c)),
      )
      return { previous }
    },
    onError: (error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(classesKey(schoolYearId), context.previous)
      }
      toast.error(errorMessageOf(error, t('classSettings.error.update')))
    },
    onSuccess: updated => {
      queryClient.setQueryData<Class[]>(classesKey(schoolYearId), old =>
        old?.map(c => (c.id === updated.id ? updated : c)),
      )
      toast.success(t('classSettings.success'))
    },
    onSettled: (_data, _error, vars) => {
      const key = pendingKeyOf(vars.classId, vars.field)
      setPendingKeys(prev => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    },
  })

  const update = useCallback(
    (classId: number, field: AssignmentField, teacherId: number | null) => {
      const key = pendingKeyOf(classId, field)
      if (pendingKeys.has(key)) return // ignore repeat clicks on the same picker
      mutation.mutate({ classId, field, teacherId })
    },
    [mutation, pendingKeys],
  )

  return { update, pendingKeys }
}
