import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { captureFrontendError } from '@/lib/frontend-error'
import type { SearchByDateMatch, SearchByNameMatch, Student } from '../_lib/types'

type Params = {
  schoolYearId: number | null
  /** Called when a name match should pull the grid to another class/group. */
  onNavigate: (match: SearchByNameMatch) => void
}

/**
 * Search across the teacher's groups, by student name or by date.
 *
 * A name search jumps the grid to that student's class and group and highlights
 * the row; a date search lists every class/group taught that day.
 */
export function useNotenSearch({ schoolYearId, onNavigate }: Params) {
  const { t } = useTranslation('common')

  const [searchText, setSearchText] = useState('')
  const [searchDate, setSearchDate] = useState('')
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [nameMatches, setNameMatches] = useState<SearchByNameMatch[]>([])
  const [activeNameMatchIndex, setActiveNameMatchIndex] = useState(0)
  const [highlightedStudentId, setHighlightedStudentId] = useState<number | null>(null)
  const [focusDateYmd, setFocusDateYmd] = useState<string | null>(null)
  const [dateMatches, setDateMatches] = useState<SearchByDateMatch[]>([])
  const [studentsByGroup, setStudentsByGroup] = useState<Record<string, Student[]>>({})

  const studentRowRefs = useRef<Record<number, HTMLTableRowElement | null>>({})
  // A slow date search must not overwrite the results of a later one.
  const dateTokenRef = useRef(0)

  const gotoNameMatch = useCallback(
    (match: SearchByNameMatch) => {
      setFocusDateYmd(null)
      setHighlightedStudentId(match.studentId)
      setMessage(null)
      onNavigate(match)
    },
    [onNavigate],
  )

  const performNameSearch = useCallback(async () => {
    const query = searchText.trim()
    if (!query || !schoolYearId) return

    setDateMatches([])
    setStudentsByGroup({})

    try {
      const res = await fetch(
        `/api/noten/search?schoolYearId=${schoolYearId}&nameQuery=${encodeURIComponent(query)}`,
      )
      if (!res.ok) throw new Error('Search failed')

      const data = (await res.json()) as { byName?: SearchByNameMatch[] }
      const matches = data.byName ?? []
      setNameMatches(matches)
      setActiveNameMatchIndex(0)

      if (matches.length === 0) {
        setHighlightedStudentId(null)
        setMessage(
          t('noten.searchNoNameResult', { defaultValue: 'Kein passender Schüler gefunden.' }),
        )
        return
      }
      gotoNameMatch(matches[0]!)
      // The result is the grid itself; keeping the popover open covers it.
      setOpen(false)
    } catch (err) {
      captureFrontendError(err, { location: 'noten', type: 'search-by-name' })
      setMessage(t('noten.searchError', { defaultValue: 'Suche fehlgeschlagen.' }))
    }
  }, [searchText, schoolYearId, t, gotoNameMatch])

  const gotoNextNameMatch = useCallback(() => {
    if (nameMatches.length === 0) return
    const nextIndex = (activeNameMatchIndex + 1) % nameMatches.length
    setActiveNameMatchIndex(nextIndex)
    gotoNameMatch(nameMatches[nextIndex]!)
  }, [nameMatches, activeNameMatchIndex, gotoNameMatch])

  const performDateSearch = useCallback(async () => {
    if (!searchDate || !schoolYearId) return
    const token = ++dateTokenRef.current

    setNameMatches([])
    setHighlightedStudentId(null)

    try {
      const res = await fetch(
        `/api/noten/search?schoolYearId=${schoolYearId}&dateQuery=${encodeURIComponent(searchDate)}`,
      )
      if (!res.ok) throw new Error('Search failed')

      const data = (await res.json()) as { byDate?: SearchByDateMatch[] }
      if (dateTokenRef.current !== token) return
      const matches = data.byDate ?? []
      setDateMatches(matches)
      setFocusDateYmd(searchDate)

      if (matches.length === 0) {
        setMessage(
          t('noten.searchNoDateResult', {
            defaultValue: 'An diesem Datum wurden keine Gruppen gefunden.',
          }),
        )
        setStudentsByGroup({})
        return
      }

      setMessage(null)
      setOpen(false)

      const entries = await Promise.all(
        matches.map(async match => {
          const key = `${match.classId}-${match.groupId}`
          const studentsRes = await fetch(
            `/api/noten/students?classId=${match.classId}&groupId=${match.groupId}&schoolYearId=${schoolYearId}`,
          )
          if (!studentsRes.ok) return [key, [] as Student[]] as const
          const studentsData = (await studentsRes.json()) as { students?: Student[] }
          return [key, studentsData.students ?? []] as const
        }),
      )
      if (dateTokenRef.current !== token) return
      setStudentsByGroup(Object.fromEntries(entries) as Record<string, Student[]>)
    } catch (err) {
      captureFrontendError(err, { location: 'noten', type: 'search-by-date' })
      if (dateTokenRef.current === token) {
        setMessage(t('noten.searchError', { defaultValue: 'Suche fehlgeschlagen.' }))
      }
    }
  }, [searchDate, schoolYearId, t])

  /** Drop the name result chip and the row highlight it points at. */
  const clearNameSearch = useCallback(() => {
    setNameMatches([])
    setActiveNameMatchIndex(0)
    setHighlightedStudentId(null)
    setSearchText('')
    setMessage(null)
  }, [])

  const clearDateSearch = useCallback(() => {
    dateTokenRef.current += 1
    setDateMatches([])
    setStudentsByGroup({})
    setFocusDateYmd(null)
    setMessage(null)
  }, [])

  // Bring the highlighted row into view once the grid has re-rendered for it.
  useEffect(() => {
    if (!highlightedStudentId) return
    studentRowRefs.current[highlightedStudentId]?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      inline: 'nearest',
    })
  }, [highlightedStudentId])

  const activeNameMatch = nameMatches[activeNameMatchIndex] ?? null

  return {
    searchText,
    setSearchText,
    searchDate,
    setSearchDate,
    open,
    setOpen,
    message,
    nameMatches,
    activeNameMatch,
    activeNameMatchIndex,
    highlightedStudentId,
    focusDateYmd,
    dateMatches,
    studentsByGroup,
    studentRowRefs,
    performNameSearch,
    gotoNextNameMatch,
    performDateSearch,
    clearNameSearch,
    clearDateSearch,
  }
}
