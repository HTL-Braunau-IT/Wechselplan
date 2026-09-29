'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { apiFetch, apiSend, errorMessageOf } from '@/lib/api-client'
import type { GradingCriteriaInput, GradingCriteriaListResponse } from '@/types/grading-criteria'

const key = (schoolYearId?: number) => ['grading-criteria', schoolYearId ?? null] as const

/** The signed-in teacher's templates and this year's classes. */
export function useGradingCriteria(schoolYearId?: number) {
  return useQuery<GradingCriteriaListResponse>({
    queryKey: key(schoolYearId),
    queryFn: () =>
      apiFetch<GradingCriteriaListResponse>(
        `/api/grading-criteria${schoolYearId != null ? `?schoolYearId=${schoolYearId}` : ''}`,
      ),
  })
}

export function useGradingCriteriaMutations() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['grading-criteria'] })

  const save = useMutation({
    mutationFn: ({ id, input }: { id: number | null; input: GradingCriteriaInput }) =>
      id == null
        ? apiSend<{ id: number }>('/api/grading-criteria', 'POST', input)
        : apiSend<{ id: number }>(`/api/grading-criteria/${id}`, 'PUT', input),
    onSuccess: () => {
      toast.success(t('gradingCriteria.editor.saved'))
      return invalidate()
    },
    onError: error => toast.error(errorMessageOf(error, t('gradingCriteria.error.save'))),
  })

  const remove = useMutation({
    mutationFn: (id: number) => apiSend(`/api/grading-criteria/${id}`, 'DELETE'),
    onSuccess: invalidate,
    onError: error => toast.error(errorMessageOf(error, t('gradingCriteria.error.delete'))),
  })

  const share = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      apiSend<{ shareToken: string | null }>(
        `/api/grading-criteria/${id}/share`,
        enabled ? 'POST' : 'DELETE',
      ),
    onSuccess: invalidate,
    onError: error => toast.error(errorMessageOf(error, t('gradingCriteria.error.share'))),
  })

  return { save, remove, share }
}
