'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch, apiSend } from '@/lib/api-client'

/**
 * React Query bindings for the generic admin CRUD endpoint.
 *
 * Every admin tab used to hand-roll the same useState/useEffect/fetch quartet.
 * Beyond the duplication that meant no shared cache: applying a directory sync
 * refreshed the tab that triggered it while every other mounted tab kept
 * showing stale rows. Going through one query key fixes that.
 */

export type AdminModelRow = Record<string, unknown>

export const adminModelKey = (model: string, schoolYearId?: number) =>
  ['admin-data', model, schoolYearId ?? null] as const

function endpoint(model: string, schoolYearId?: number): string {
  const params = new URLSearchParams({ model })
  if (schoolYearId != null) params.set('schoolYearId', String(schoolYearId))
  return `/api/admin/data?${params.toString()}`
}

export interface UseAdminModelOptions {
  schoolYearId?: number
  /**
   * Read from somewhere other than the generic CRUD endpoint. Students use
   * this: /api/admin/data ignores schoolYearId for that model, so a
   * year-scoped view has to go through /api/students/all instead. Writes still
   * go to /api/admin/data, and the cache key is shared either way.
   */
  listUrl?: string
}

export function useAdminModel(model: string, options: UseAdminModelOptions | number = {}) {
  const { schoolYearId, listUrl } =
    typeof options === 'number' ? { schoolYearId: options, listUrl: undefined } : options

  return useQuery({
    queryKey: adminModelKey(model, schoolYearId),
    queryFn: () =>
      apiFetch<AdminModelRow[]>(listUrl ?? endpoint(model, schoolYearId), {
        cache: 'no-store',
        errorMessage: `${model} konnte nicht geladen werden`,
      }),
    staleTime: 30_000,
  })
}

export function useAdminModelMutations(model: string, schoolYearId?: number) {
  const queryClient = useQueryClient()
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: adminModelKey(model, schoolYearId) })

  const create = useMutation({
    mutationFn: (data: AdminModelRow) =>
      apiSend<AdminModelRow>(endpoint(model), 'POST', data, {
        errorMessage: `${model} konnte nicht erstellt werden`,
      }),
    onSuccess: invalidate,
  })

  const update = useMutation({
    mutationFn: (data: AdminModelRow) =>
      apiSend<AdminModelRow>(endpoint(model), 'PUT', data, {
        errorMessage: `${model} konnte nicht aktualisiert werden`,
      }),
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: (id: number) =>
      apiSend<void>(`${endpoint(model)}&id=${id}`, 'DELETE', undefined, {
        errorMessage: `${model} konnte nicht gelöscht werden`,
      }),
    onSuccess: invalidate,
  })

  const removeAll = useMutation({
    mutationFn: () =>
      apiSend<{ deleted?: Record<string, number> }>(
        `${endpoint(model)}&bulk=true`,
        'DELETE',
        undefined,
        { errorMessage: `${model} konnte nicht gelöscht werden` },
      ),
    onSuccess: invalidate,
  })

  return {
    create: (data: AdminModelRow) => create.mutateAsync(data),
    update: (data: AdminModelRow) => update.mutateAsync(data),
    remove: (id: number) => remove.mutateAsync(id),
    removeAll: () => removeAll.mutateAsync(),
    invalidate,
    isMutating: create.isPending || update.isPending || remove.isPending || removeAll.isPending,
  }
}
