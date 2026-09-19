import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-client'
import type { ClassOption, KlassenlisteData } from '../_lib/types'

const withYear = (path: string, schoolYearId: number | undefined) =>
  schoolYearId != null ? `${path}${path.includes('?') ? '&' : '?'}schoolYearId=${schoolYearId}` : path

/** All classes in the selected school year, for the class picker. */
export function useKlassenlisteClasses(schoolYearId: number | undefined) {
  return useQuery({
    queryKey: ['klassenliste', 'classes', schoolYearId],
    queryFn: () =>
      apiFetch<ClassOption[]>(withYear('/api/classes', schoolYearId), {
        cache: 'no-store',
        errorMessage: 'Klassen konnten nicht geladen werden.',
      }),
    enabled: schoolYearId != null,
    staleTime: 5 * 60 * 1000,
  })
}

/** Roster (grouped) for one class, used by the preview and to seed the selection. */
export function useKlassenlisteData(classId: number | null, schoolYearId: number | undefined) {
  return useQuery({
    queryKey: ['klassenliste', 'data', classId, schoolYearId],
    queryFn: () =>
      apiFetch<KlassenlisteData>(
        withYear(`/api/klassenliste/data?classId=${classId}`, schoolYearId),
        { cache: 'no-store', errorMessage: 'Klassenliste konnte nicht geladen werden.' },
      ),
    enabled: classId != null && schoolYearId != null,
    staleTime: 60 * 1000,
  })
}
