import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { captureFrontendError } from '@/lib/frontend-error'
import { defaultWeekdayFor, groupIdsOn, type ClassItem } from '../_lib/types'

type AutoSelect = { classId: number | null; groupId: number | null; weekday?: number | null }

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
  /**
   * Groups are per weekday, so a group number only means something together with
   * its day. Only offered as a switch when the teacher teaches the class on more
   * than one day; otherwise it is simply that one day.
   */
  const [selectedWeekday, setSelectedWeekday] = useState<number | null>(null)
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
      const day = defaultWeekdayFor(first)
      setSelectedClassId(first.id)
      setSelectedWeekday(day)
      setSelectedGroupId(groupIdsOn(first, day)[0] ?? null)
    }

    const classIdParam = Number(searchParams.get('classId'))
    const urlClass = Number.isFinite(classIdParam)
      ? classes.find(cls => cls.id === classIdParam)
      : undefined

    if (urlClass) {
      const groupIdParam = Number(searchParams.get('groupId'))
      const weekdayParam = Number(searchParams.get('weekday'))
      const day =
        Number.isInteger(weekdayParam) && urlClass.weekdays?.includes(weekdayParam)
          ? weekdayParam
          : defaultWeekdayFor(urlClass)
      const dayGroups = groupIdsOn(urlClass, day)
      setSelectedClassId(urlClass.id)
      setSelectedWeekday(day)
      setSelectedGroupId(
        Number.isFinite(groupIdParam) && dayGroups.includes(groupIdParam)
          ? groupIdParam
          : (dayGroups[0] ?? null),
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
        if (cancelled) return
        if (!res.ok) return applyFallback()
        const data = (await res.json()) as AutoSelect
        if (cancelled) return

        const match = classes.find(cls => cls.id === data.classId)
        if (!match) return applyFallback()
        const day =
          data.weekday != null && match.weekdays?.includes(data.weekday)
            ? data.weekday
            : defaultWeekdayFor(match)
        const dayGroups = groupIdsOn(match, day)
        const groupId =
          data.groupId != null && dayGroups.includes(data.groupId)
            ? data.groupId
            : (dayGroups[0] ?? null)
        setCurrentSlot({ classId: match.id, groupId, weekday: day })
        if (selectedClassIdRef.current != null) return
        setSelectedClassId(match.id)
        setSelectedWeekday(day)
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

  /**
   * Switch class (and/or weekday), then ask the server which group is on right
   * now for that day. Without a weekday the class's default day is used.
   */
  const selectClass = useCallback(
    (classId: number, weekday?: number | null) => {
      const cls = classes.find(c => c.id === classId)
      const day = weekday !== undefined ? weekday : defaultWeekdayFor(cls)
      selectedClassIdRef.current = classId
      setSelectedClassId(classId)
      setSelectedWeekday(day)
      setSelectedGroupId(groupIdsOn(cls, day)[0] ?? null)
      if (!schoolYearId || !cls) return

      void (async () => {
        try {
          const now = new Date()
          const dayQ = day != null ? `&weekday=${day}` : ''
          const res = await fetch(
            `/api/noten/auto-select?schoolYearId=${schoolYearId}&classId=${classId}&date=${todayLocalYmd(now)}${dayQ}`,
          )
          if (!res.ok) return
          const data = (await res.json()) as AutoSelect
          const dayGroups = groupIdsOn(cls, day)
          const groupId =
            data.groupId != null && dayGroups.includes(data.groupId)
              ? data.groupId
              : (dayGroups[0] ?? null)
          // Only apply if the user has not moved on to another class.
          if (selectedClassIdRef.current === classId) setSelectedGroupId(groupId)
        } catch (err) {
          captureFrontendError(err, { location: 'noten', type: 'auto-select-class' })
        }
      })()
    },
    [classes, schoolYearId],
  )

  /** Switch to another of the teacher's days for the current class. */
  const selectWeekday = useCallback(
    (weekday: number) => {
      if (selectedClassIdRef.current != null) selectClass(selectedClassIdRef.current, weekday)
    },
    [selectClass],
  )

  return {
    classes,
    loadingClasses,
    selectedClassId,
    setSelectedClassId,
    selectedGroupId,
    setSelectedGroupId,
    selectedWeekday,
    setSelectedWeekday,
    currentSlot,
    selectClass,
    selectWeekday,
  }
}
