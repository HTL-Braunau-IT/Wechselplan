import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { captureFrontendError } from '@/lib/frontend-error'
import type { ClassItem } from '../_lib/types'

type AutoSelect = { classId: number | null; groupId: number | null }

/** Today as YYYY-MM-DD in the browser's timezone. */
function todayLocalYmd(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/**
 * The teacher's classes plus the initial class/group selection.
 *
 * Selection comes from the URL when present (a link from the teacher
 * overview), otherwise from `/api/noten/auto-select`, which resolves the
 * rotation for right now so the page opens on the group actually being taught.
 *
 * That inference used to be duplicated here: the page refetched the whole
 * schedule payload and re-walked turns, weeks and rotations in the browser,
 * keyed on `session.user.name` — a display name since the move to Entra, not
 * the username the endpoint matches on. The server already does this from the
 * session's object id, so it is asked instead of re-implemented.
 */
export function useNotenClasses(schoolYearId: number | null) {
  const searchParams = useSearchParams()

  const [classes, setClasses] = useState<ClassItem[]>([])
  const [loadingClasses, setLoadingClasses] = useState(true)
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null)
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null)
  /** What the rotation says is on right now, so the picker can mark it. */
  const [currentSlot, setCurrentSlot] = useState<AutoSelect>({ classId: null, groupId: null })

  // Guards a race: an in-flight auto-select must not overwrite a newer choice.
  const selectedClassIdRef = useRef<number | null>(null)
  selectedClassIdRef.current = selectedClassId
  const initialSelectionRef = useRef(false)

  useEffect(() => {
    if (!schoolYearId) return
    let cancelled = false
    void (async () => {
      setLoadingClasses(true)
      try {
        const res = await fetch(`/api/noten/teacher-classes?schoolYearId=${schoolYearId}`)
        if (!res.ok || cancelled) return
        const data = (await res.json()) as { classes?: ClassItem[] }
        if (!cancelled) setClasses(data.classes ?? [])
      } catch (err) {
        captureFrontendError(err, { location: 'noten', type: 'load-teacher-classes' })
      } finally {
        if (!cancelled) setLoadingClasses(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [schoolYearId])

  // One initial selection per mount: an explicit ?classId, else the rotation.
  useEffect(() => {
    if (initialSelectionRef.current || classes.length === 0 || !schoolYearId) return
    initialSelectionRef.current = true

    const first = classes[0]
    const applyFallback = () => {
      if (selectedClassIdRef.current != null || !first) return
      setSelectedClassId(first.id)
      setSelectedGroupId(first.groupIds[0] ?? null)
    }

    const classIdParam = Number(searchParams.get('classId'))
    const urlClass = Number.isFinite(classIdParam)
      ? classes.find(cls => cls.id === classIdParam)
      : undefined

    if (urlClass) {
      const groupIdParam = Number(searchParams.get('groupId'))
      setSelectedClassId(urlClass.id)
      setSelectedGroupId(
        Number.isFinite(groupIdParam) && urlClass.groupIds.includes(groupIdParam)
          ? groupIdParam
          : (urlClass.groupIds[0] ?? null),
      )
      return
    }

    let cancelled = false
    void (async () => {
      try {
        const now = new Date()
        const period = now.getHours() < 12 ? 'AM' : 'PM'
        const res = await fetch(
          `/api/noten/auto-select?schoolYearId=${schoolYearId}&date=${todayLocalYmd(now)}&period=${period}`,
        )
        if (!res.ok) return applyFallback()
        const data = (await res.json()) as AutoSelect
        if (cancelled) return

        const match = classes.find(cls => cls.id === data.classId)
        if (!match) return applyFallback()
        const groupId =
          data.groupId != null && match.groupIds.includes(data.groupId)
            ? data.groupId
            : (match.groupIds[0] ?? null)
        setCurrentSlot({ classId: match.id, groupId })
        if (selectedClassIdRef.current != null) return
        setSelectedClassId(match.id)
        setSelectedGroupId(groupId)
      } catch (err) {
        captureFrontendError(err, { location: 'noten', type: 'auto-select' })
        if (!cancelled) applyFallback()
      }
    })()

    return () => {
      cancelled = true
    }
  }, [classes, schoolYearId, searchParams])

  /** Switch class, then ask the server which group is on right now. */
  const selectClass = useCallback(
    (classId: number) => {
      const cls = classes.find(c => c.id === classId)
      selectedClassIdRef.current = classId
      setSelectedClassId(classId)
      setSelectedGroupId(cls?.groupIds[0] ?? null)
      if (!schoolYearId || !cls) return

      void (async () => {
        try {
          const now = new Date()
          const res = await fetch(
            `/api/noten/auto-select?schoolYearId=${schoolYearId}&classId=${classId}&date=${todayLocalYmd(now)}`,
          )
          if (!res.ok) return
          const data = (await res.json()) as AutoSelect
          const groupId =
            data.groupId != null && cls.groupIds.includes(data.groupId)
              ? data.groupId
              : (cls.groupIds[0] ?? null)
          // Only apply if the user has not moved on to another class.
          if (selectedClassIdRef.current === classId) setSelectedGroupId(groupId)
        } catch (err) {
          captureFrontendError(err, { location: 'noten', type: 'auto-select-class' })
        }
      })()
    },
    [classes, schoolYearId],
  )

  return {
    classes,
    loadingClasses,
    selectedClassId,
    setSelectedClassId,
    selectedGroupId,
    setSelectedGroupId,
    currentSlot,
    selectClass,
  }
}
