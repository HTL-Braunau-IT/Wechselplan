import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useTranslation } from 'react-i18next'
import { captureFrontendError } from '@/lib/frontend-error'
import { useSchoolYear } from '@/contexts/school-year-context'
import { useCurrentTeacher } from '@/hooks/use-current-teacher'
import { normalizeGradesKeys, type GradesData } from '@/lib/grades'
import type { ClassData, FinalGradesData, TeacherClassSummary } from '../_lib/types'

type ClassOption = { id: number; name: string }

/**
 * Loads everything the Notensammler page reads: the class list, the selected
 * class with its grades, the current teacher, and the teacher's own classes for
 * the tab bar. Owns class selection and keeps it mirrored in the URL.
 */
export function useNotensammlerData() {
  const { t } = useTranslation()
  const { data: session } = useSession()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { selectedYear, currentSemester } = useSchoolYear()
  const schoolYearId = selectedYear?.id
  const { teacher: currentTeacher } = useCurrentTeacher()

  const [classes, setClasses] = useState<ClassOption[]>([])
  const [selectedClassId, setSelectedClassId] = useState<string>('')
  const [classData, setClassData] = useState<ClassData | null>(null)
  const [grades, setGrades] = useState<GradesData>({})
  const [finalGrades, setFinalGrades] = useState<FinalGradesData>({})
  const [teacherClasses, setTeacherClasses] = useState<TeacherClassSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const currentTeacherId = currentTeacher?.id ?? null

  // Changing school year invalidates the current selection: the new year has
  // its own class list.
  const prevSchoolYearIdRef = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (prevSchoolYearIdRef.current !== undefined && prevSchoolYearIdRef.current !== schoolYearId) {
      setSelectedClassId('')
    }
    prevSchoolYearIdRef.current = schoolYearId
  }, [schoolYearId])

  useEffect(() => {
    if (schoolYearId == null) return
    const controller = new AbortController()
    const fetchClasses = async () => {
      try {
        const response = await fetch(`/api/classes?schoolYearId=${schoolYearId}`, {
          cache: 'no-store',
          signal: controller.signal,
        })
        if (!response.ok) throw new Error('Failed to fetch classes')
        setClasses((await response.json()) as ClassOption[])
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
        captureFrontendError(e, { location: 'notensammler', type: 'fetch-classes' })
        setError(e instanceof Error ? e.message : 'Failed to load classes')
      }
    }
    void fetchClasses()
    return () => controller.abort()
  }, [schoolYearId])

  // Deep link support: ?class=1AHELS preselects that class once the list lands.
  // Only ever applied once — otherwise clearing the selection by hand would be
  // undone by this effect on the very next render.
  const deepLinkAppliedRef = useRef(false)
  useEffect(() => {
    if (deepLinkAppliedRef.current) return
    const classNameParam = searchParams.get('class')
    if (!classNameParam || classes.length === 0 || selectedClassId) return

    deepLinkAppliedRef.current = true
    const matchingClass = classes.find(
      cls => cls.name.toLowerCase() === classNameParam.toLowerCase(),
    )
    if (matchingClass) {
      setSelectedClassId(matchingClass.id.toString())
    } else {
      setError(
        t('notensammler.classNotFound', 'Klasse "{{name}}" nicht gefunden.', {
          name: classNameParam,
        }),
      )
    }
  }, [classes, searchParams, selectedClassId, t])

  const handleClassChange = useCallback(
    (classId: string) => {
      setSelectedClassId(classId)
      const params = new URLSearchParams(searchParams.toString())
      const selectedClass = classes.find(cls => cls.id.toString() === classId)
      if (classId && selectedClass) {
        params.set('class', selectedClass.name)
      } else {
        params.delete('class')
      }
      router.replace(`/notensammler?${params.toString()}`, { scroll: false })
    },
    [classes, router, searchParams],
  )

  const refreshTeacherClasses = useCallback(async () => {
    if (!session?.user || schoolYearId == null) {
      setTeacherClasses([])
      return
    }
    try {
      const response = await fetch(
        `/api/notensammler/teacher-classes?schoolYearId=${schoolYearId}`,
        { cache: 'no-store' },
      )
      if (!response.ok) return
      const data = (await response.json()) as { classes: TeacherClassSummary[] }
      setTeacherClasses(data.classes ?? [])
    } catch (e) {
      captureFrontendError(e, { location: 'notensammler', type: 'fetch-teacher-classes' })
      setTeacherClasses([])
    }
  }, [session?.user, schoolYearId])

  useEffect(() => {
    void refreshTeacherClasses()
  }, [refreshTeacherClasses])

  // Every class load is stamped with a token. A response that arrives after the
  // user has already switched class carries a stale token and is dropped —
  // without this, a slow request for the class you left overwrites the one you
  // are looking at.
  const loadTokenRef = useRef(0)

  const refreshClassData = useCallback(async () => {
    if (!selectedClassId || schoolYearId == null) return
    const token = ++loadTokenRef.current
    try {
      const classRes = await fetch(
        `/api/notensammler/class/${selectedClassId}?schoolYearId=${schoolYearId}`,
        { cache: 'no-store' },
      )
      if (classRes.ok && loadTokenRef.current === token) {
        setClassData((await classRes.json()) as ClassData)
      }
    } catch (e) {
      captureFrontendError(e, { location: 'notensammler', type: 'refresh-class-data' })
    }
  }, [selectedClassId, schoolYearId])

  useEffect(() => {
    if (!selectedClassId || schoolYearId == null) {
      loadTokenRef.current++
      setClassData(null)
      setGrades({})
      setFinalGrades({})
      setLoading(false)
      return
    }

    const token = ++loadTokenRef.current
    const controller = new AbortController()

    const fetchClassData = async () => {
      try {
        setLoading(true)
        setError(null)

        const [classResponse, gradesResponse] = await Promise.all([
          fetch(`/api/notensammler/class/${selectedClassId}?schoolYearId=${schoolYearId}`, {
            cache: 'no-store',
            signal: controller.signal,
          }),
          fetch(
            `/api/notensammler/grades?classId=${selectedClassId}&schoolYearId=${schoolYearId}`,
            { cache: 'no-store', signal: controller.signal },
          ),
        ])

        if (!classResponse.ok) throw new Error('Failed to fetch class data')
        if (!gradesResponse.ok) throw new Error('Failed to fetch grades')

        const classDataResult = (await classResponse.json()) as ClassData
        const gradesPayload = (await gradesResponse.json()) as {
          grades: GradesData
          finalGrades: Record<
            number,
            {
              first?: number | null
              second?: number | null
              conductWishFirst?: string | null
              conductWishSecond?: string | null
            }
          >
        }
        const gradesResult =
          gradesPayload.grades ?? (gradesPayload as unknown as Record<string, unknown>)
        const rawFinal = gradesPayload.finalGrades ?? {}

        // Older rows predate the Betragensnote fields; normalise so the UI
        // can read them unconditionally.
        const finalGradesResult: FinalGradesData = {}
        for (const studentKey of Object.keys(rawFinal)) {
          const studentId = Number(studentKey)
          if (Number.isNaN(studentId)) continue
          const entry = rawFinal[studentId]
          if (!entry) continue
          finalGradesResult[studentId] = {
            first: entry.first ?? null,
            second: entry.second ?? null,
            conductWishFirst: entry.conductWishFirst ?? null,
            conductWishSecond: entry.conductWishSecond ?? null,
          }
        }

        if (loadTokenRef.current !== token) return
        setClassData(classDataResult)
        setGrades(normalizeGradesKeys(gradesResult))
        setFinalGrades(finalGradesResult)
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
        captureFrontendError(e, { location: 'notensammler', type: 'fetch-class-data' })
        if (loadTokenRef.current === token) {
          setError(e instanceof Error ? e.message : 'Failed to load class data')
        }
      } finally {
        if (loadTokenRef.current === token) setLoading(false)
      }
    }

    void fetchClassData()
    return () => controller.abort()
  }, [selectedClassId, schoolYearId])

  /**
   * Students the grid deliberately leaves out: without a group they take part
   * in no rotation, so there is nothing to grade. They used to disappear with
   * no explanation, which reads as missing data.
   */
  const ungroupedStudentCount = useMemo(
    () => (classData?.students ?? []).filter(student => student.groupId == null).length,
    [classData],
  )

  return {
    classes,
    selectedClassId,
    handleClassChange,
    classData,
    setClassData,
    grades,
    setGrades,
    finalGrades,
    setFinalGrades,
    teacherClasses,
    refreshTeacherClasses,
    refreshClassData,
    currentTeacher,
    currentTeacherId,
    ungroupedStudentCount,
    loading,
    error,
    setError,
    notice,
    setNotice,
    schoolYearId,
    currentSemester,
  }
}
