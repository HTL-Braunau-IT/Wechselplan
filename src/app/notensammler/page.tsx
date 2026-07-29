'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useTranslation } from 'react-i18next'
import { useSession } from 'next-auth/react'
import { useSearchParams, useRouter } from 'next/navigation'
import { captureFrontendError } from '@/lib/frontend-error'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CheckCircle2, X, ChevronDownIcon, CheckIcon } from 'lucide-react'
import { getStoredToken, storeToken, clearToken } from '@/lib/notenmanagement-token'
import { normalizeUsername } from '@/lib/username'
import { useSchoolYear } from '@/contexts/school-year-context'
import { StudentPhoto } from '@/components/student-photo'
import { truncateSubject } from '@/lib/subject-utils'

interface Student {
  id: number
  firstName: string
  lastName: string
  groupId: number | null
}

interface Teacher {
  id: number
  firstName: string
  lastName: string
}

interface Class {
  id: number
  name: string
  description: string | null
  subjectName?: string
  hasSeparateAmPmSubjects?: boolean
  subjectNameAm?: string
  subjectNamePm?: string
  classLead?: string | null
  students: Student[]
  amTeachers: Teacher[]
  pmTeachers: Teacher[]
  transferStatus?: {
    first: { transferred: boolean; lfId: string | null }
    second: { transferred: boolean; lfId: string | null }
  }
}

type GradesData = Record<
  number,
  Record<
    number,
    {
      first: number | null
      second: number | null
    }
  >
>

type FinalGradesData = Record<
  number,
  {
    first: number | null
    second: number | null
    conductWishFirst: string | null
    conductWishSecond: string | null
  }
>

// Betragensnote (Wunsch) dropdown options (first is the default when nothing is stored)
const CONDUCT_NOTE_WISH_OPTIONS = [
  'Sehr zufriedenstellend',
  'Zufriedenstellend',
  'Wenig Zufriedenstellend',
  'Nicht zufriedenstellend',
] as const

const CONDUCT_NOTE_WISH_DEFAULT = CONDUCT_NOTE_WISH_OPTIONS[0]
// Sentinel for "clear" option (Radix Select does not allow value="")
const CONDUCT_NOTE_WISH_NONE = '__none__'

/** Normalize grades object to use numeric keys (API returns string keys from JSON). */
function normalizeGradesKeys(data: Record<string, unknown> | GradesData): GradesData {
  const result: GradesData = {}
  for (const studentKey of Object.keys(data)) {
    const studentId = Number(studentKey)
    if (Number.isNaN(studentId)) continue
    const byStudent = data[studentKey as keyof typeof data]
    if (byStudent == null || typeof byStudent !== 'object') continue
    const teacherMap = byStudent as Record<string, unknown>
    result[studentId] = {} as Record<number, { first: number | null; second: number | null }>
    for (const teacherKey of Object.keys(teacherMap)) {
      const teacherId = Number(teacherKey)
      if (Number.isNaN(teacherId)) continue
      const cell = teacherMap[teacherKey] as
        | { first?: number | null; second?: number | null }
        | undefined
      if (cell == null || typeof cell !== 'object') continue
      result[studentId][teacherId] = {
        first: cell.first ?? null,
        second: cell.second ?? null,
      }
    }
  }
  return result
}

const ALLOWED_GRADES = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7]

// Endnote: integer only (no .5)
const ALLOWED_FINAL_GRADES = [1, 2, 3, 4, 5, 6, 7]

// Special grade values
const NICHT_BEURTEILT = 6
const GESTUNDEN = 7

// Helper functions to convert between numeric values and display text
const getGradeDisplayText = (grade: number | null): string => {
  if (grade === null) return ''
  if (grade === NICHT_BEURTEILT) return 'nicht beurteilt'
  if (grade === GESTUNDEN) return 'gestunden'
  return grade.toString()
}

const parseGradeInput = (value: string): number | null => {
  if (value === '' || value === null || value === undefined) return null

  // Check for text inputs
  const lowerValue = value.toLowerCase().trim()
  if (lowerValue === 'nicht beurteilt' || lowerValue === 'nb') return NICHT_BEURTEILT
  if (lowerValue === 'gestunden' || lowerValue === 'gs') return GESTUNDEN

  // Parse numeric value
  const gradeNum = parseFloat(value)
  if (!isNaN(gradeNum) && ALLOWED_GRADES.includes(gradeNum)) {
    return gradeNum
  }

  return null
}

const parseFinalGradeInput = (value: string): number | null => {
  if (value === '' || value === null || value === undefined) return null
  const lowerValue = value.toLowerCase().trim()
  if (lowerValue === 'nicht beurteilt' || lowerValue === 'nb') return NICHT_BEURTEILT
  if (lowerValue === 'gestunden' || lowerValue === 'gs') return GESTUNDEN
  const gradeNum = parseInt(value, 10)
  if (!isNaN(gradeNum) && ALLOWED_FINAL_GRADES.includes(gradeNum)) {
    return gradeNum
  }
  return null
}

// Check if a grade should be included in average calculations
const isGradeIncludedInAverage = (grade: number | null): boolean => {
  if (grade === null) return false
  // Exclude special values 6 and 7 from averages
  if (grade === NICHT_BEURTEILT || grade === GESTUNDEN) return false
  // Include only regular grades 1-5 (and their .5 increments)
  return grade >= 1 && grade <= 5
}

type Semester = 'first' | 'second'

type PreviewStudent = {
  studentId: number
  firstName: string
  lastName: string
  avg: number | null
  note: 1 | 2 | 3 | 4 | 5 | null
  matched: boolean
  matrikelnummer: number | null
  hasNbOrGestunden?: boolean
  /** When note is null: display "Nicht beurteilt" or "Gestundet" */
  nullNoteLabel?: 'Nicht beurteilt' | 'Gestundet'
}

/** Editable note in preview: 1-5 or "Nicht beurteilt" / "Gestundet" (both sent as Note: null with Kommentar) */
type EditableNote = 1 | 2 | 3 | 4 | 5 | 'Nicht beurteilt' | 'Gestundet'

type NmStudentWithoutGradeOrMatch = {
  Matrikelnummer: number
  Student_ID?: string
  Nachname: string
  Vorname: string
  Klasse?: string
  EMailAdresse1?: string
  EMailAdresse2?: string
}

type TransferPreviewResponse = {
  classId: number
  className: string
  subjectName: string
  subjectTruncated: string
  semester: Semester
  teacherCount: number
  students: PreviewStudent[]
  transferStatus?: {
    first: { transferred: boolean; lfId: string | null }
    second: { transferred: boolean; lfId: string | null }
  }
  counts: {
    totalStudents: number
    completeStudents: number
    matchedCompleteStudents: number
    unmatchedCompleteStudents: number
  }
  nmStudentsWithoutGradeOrMatch?: NmStudentWithoutGradeOrMatch[]
  token?: string
  tokenExpiresIn?: number
}

type TransferResultResponse = {
  success: boolean
  lfId: string
  confirmation: unknown
  sentCount: number
  skipped: {
    completeStudents: number
    unmatchedOrMissingNote: number
  }
}

/**
 * Grade Input Component - Allows direct typing and dropdown selection
 */
function GradeInput({
  value,
  onChange,
  className,
  compact,
}: {
  value: number | null
  onChange: (value: string) => void
  className?: string
  compact?: boolean
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Update input value when external value changes
  useEffect(() => {
    setInputValue(getGradeDisplayText(value))
  }, [value])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current)
      }
    }
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setInputValue(newValue)
    setIsOpen(true)

    // Clear any existing close timeout
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }

    // Immediately process valid input (no Enter needed)
    const parsed = parseGradeInput(newValue)
    if (parsed !== null || newValue === '') {
      onChange(newValue)

      // If a valid grade was entered, auto-close dropdown after 500ms
      if (parsed !== null) {
        closeTimeoutRef.current = setTimeout(() => {
          setIsOpen(false)
          closeTimeoutRef.current = null
        }, 500)
      }
    }
  }

  const handleOptionSelect = (optionValue: string) => {
    // Clear any existing timeout
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }

    setInputValue(
      optionValue === '6' ? 'nicht beurteilt' : optionValue === '7' ? 'gestunden' : optionValue,
    )
    onChange(optionValue)
    setIsOpen(false)
    inputRef.current?.blur()
  }

  const handleBlur = () => {
    // Delay closing to allow clicking on options
    setTimeout(() => setIsOpen(false), 150)
  }

  const handleFocus = () => {
    setIsOpen(true)
  }

  const gradeOptions = [
    { value: '6', label: 'nicht beurteilt' },
    { value: '7', label: 'gestunden' },
    { value: '1', label: '1' },
    { value: '1.5', label: '1.5' },
    { value: '2', label: '2' },
    { value: '2.5', label: '2.5' },
    { value: '3', label: '3' },
    { value: '3.5', label: '3.5' },
    { value: '4', label: '4' },
    { value: '4.5', label: '4.5' },
    { value: '5', label: '5' },
  ]

  return (
    <div className={`relative ${className ?? ''}`}>
      <div className="relative">
        <Input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder="-"
          className={compact ? 'h-7 w-16 pr-7 text-sm' : 'h-8 w-32 pr-8'}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={`absolute top-0 right-0 h-full hover:bg-transparent ${compact ? 'px-1' : 'px-2'} py-0`}
          onClick={() => {
            setIsOpen(!isOpen)
            inputRef.current?.focus()
          }}
        >
          <ChevronDownIcon className={compact ? 'h-3 w-3' : 'h-4 w-4'} />
        </Button>
      </div>

      {isOpen && (
        <div
          className={`bg-popover border-border absolute z-50 mt-1 max-h-60 overflow-auto rounded-md border shadow-lg ${compact ? 'w-36' : 'w-full'}`}
        >
          <div className="p-1">
            {gradeOptions.map(option => (
              <button
                key={option.value}
                type="button"
                className={`hover:bg-accent hover:text-accent-foreground flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm ${
                  value !== null && value.toString() === option.value
                    ? 'bg-accent text-accent-foreground'
                    : ''
                }`}
                onClick={() => handleOptionSelect(option.value)}
              >
                <span>{option.label}</span>
                {value !== null && value.toString() === option.value && (
                  <CheckIcon className="h-4 w-4" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Final Grade (Endnote) Input - Integer grades only (1-5, 6 = nicht beurteilt, 7 = gestundet)
 */
function FinalGradeInput({
  value,
  onChange,
  className,
  compact,
}: {
  value: number | null
  onChange: (value: string) => void
  className?: string
  compact?: boolean
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    setInputValue(getGradeDisplayText(value))
  }, [value])

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current)
      }
    }
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setInputValue(newValue)
    setIsOpen(true)
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
    const parsed = parseFinalGradeInput(newValue)
    if (parsed !== null || newValue === '') {
      onChange(newValue)
      if (parsed !== null) {
        closeTimeoutRef.current = setTimeout(() => {
          setIsOpen(false)
          closeTimeoutRef.current = null
        }, 500)
      }
    }
  }

  const handleOptionSelect = (optionValue: string) => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
    setInputValue(
      optionValue === '6' ? 'nicht beurteilt' : optionValue === '7' ? 'gestunden' : optionValue,
    )
    onChange(optionValue)
    setIsOpen(false)
    inputRef.current?.blur()
  }

  const handleBlur = () => {
    setTimeout(() => setIsOpen(false), 150)
  }

  const handleFocus = () => {
    setIsOpen(true)
  }

  const finalGradeOptions = [
    { value: '6', label: 'nicht beurteilt' },
    { value: '7', label: 'gestunden' },
    { value: '1', label: '1' },
    { value: '2', label: '2' },
    { value: '3', label: '3' },
    { value: '4', label: '4' },
    { value: '5', label: '5' },
  ]

  return (
    <div className={`relative ${className ?? ''}`}>
      <div className="relative">
        <Input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder="-"
          className={compact ? 'h-7 w-16 pr-7 text-sm' : 'h-8 w-32 pr-8'}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={`absolute top-0 right-0 h-full hover:bg-transparent ${compact ? 'px-1' : 'px-2'} py-0`}
          onClick={() => {
            setIsOpen(!isOpen)
            inputRef.current?.focus()
          }}
        >
          <ChevronDownIcon className={compact ? 'h-3 w-3' : 'h-4 w-4'} />
        </Button>
      </div>
      {isOpen && (
        <div
          className={`bg-popover border-border absolute z-50 mt-1 max-h-60 overflow-auto rounded-md border shadow-lg ${compact ? 'w-36' : 'w-full'}`}
        >
          <div className="p-1">
            {finalGradeOptions.map(option => (
              <button
                key={option.value}
                type="button"
                className={`hover:bg-accent hover:text-accent-foreground flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm ${
                  value !== null && value.toString() === option.value
                    ? 'bg-accent text-accent-foreground'
                    : ''
                }`}
                onClick={() => handleOptionSelect(option.value)}
              >
                <span>{option.label}</span>
                {value !== null && value.toString() === option.value && (
                  <CheckIcon className="h-4 w-4" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Notensammler page - Grade collection interface for teachers.
 *
 * Allows selecting a class and entering grades for students across two semesters.
 * Grades are auto-saved with debounce, and averages are calculated automatically.
 */
export default function NotensammlerPage() {
  const { t } = useTranslation()
  const { data: session } = useSession()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [classes, setClasses] = useState<Array<{ id: number; name: string }>>([])
  const [selectedClassId, setSelectedClassId] = useState<string>('')
  const [classData, setClassData] = useState<Class | null>(null)
  const [grades, setGrades] = useState<GradesData>({})
  const [finalGrades, setFinalGrades] = useState<FinalGradesData>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showFirstSemester, setShowFirstSemester] = useState(true)
  const [showSecondSemester, setShowSecondSemester] = useState(true)
  const [currentTeacherId, setCurrentTeacherId] = useState<number | null>(null)
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [downloadingAllPdf, setDownloadingAllPdf] = useState(false)
  const [savingAll, setSavingAll] = useState(false)

  // Sorting state
  const [sortField, setSortField] = useState<'lastName' | 'groupId'>('lastName')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  // When class has separate AM/PM subjects, which period tab is active
  const [periodTab, setPeriodTab] = useState<'AM' | 'PM'>('AM')

  // Notenmanagement transfer flow state
  const [showPasswordDialog, setShowPasswordDialog] = useState(false)
  const [showSemesterDialog, setShowSemesterDialog] = useState(false)
  const [showPreviewDialog, setShowPreviewDialog] = useState(false)
  const [showResultDialog, setShowResultDialog] = useState(false)
  const [transferUsername, setTransferUsername] = useState('')
  const [transferPassword, setTransferPassword] = useState('')
  const [transferSemester, setTransferSemester] = useState<Semester | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [transferLoading, setTransferLoading] = useState(false)
  const [previewData, setPreviewData] = useState<TransferPreviewResponse | null>(null)
  const [editedNotes, setEditedNotes] = useState<Record<number, EditableNote>>({})
  const [editedNotesNmOnly, setEditedNotesNmOnly] = useState<
    Record<number, 1 | 2 | 3 | 4 | 5 | null>
  >({})
  const [transferResult, setTransferResult] = useState<TransferResultResponse | null>(null)

  // LF view state
  const [showLfViewPasswordDialog, setShowLfViewPasswordDialog] = useState(false)
  const [showLfViewDialog, setShowLfViewDialog] = useState(false)
  const [lfViewUsername, setLfViewUsername] = useState('')
  const [lfViewPassword, setLfViewPassword] = useState('')
  const [lfViewLoading, setLfViewLoading] = useState(false)
  const [lfViewData, setLfViewData] = useState<Array<{
    Matrikelnummer: number
    Nachname: string
    Vorname: string
    Note: number
    Punkte: number
    Kommentar: string
  }> | null>(null)
  const [selectedLfId, setSelectedLfId] = useState<string | null>(null)

  // Delete teacher grades state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [teacherToDelete, setTeacherToDelete] = useState<Teacher | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Teacher's classes for tab bar (with per-semester completion)
  const [teacherClasses, setTeacherClasses] = useState<
    Array<{
      id: number
      name: string
      allGradesEnteredFirst: boolean
      allGradesEnteredSecond: boolean
    }>
  >([])

  // Debounce timer for auto-save
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null)
  const saveFinalGradeTimerRef = useRef<NodeJS.Timeout | null>(null)
  const saveConductWishTimerRef = useRef<NodeJS.Timeout | null>(null)

  const { selectedYear, currentSemester } = useSchoolYear()
  const schoolYearId = selectedYear?.id

  // When school year changes, clear class selection so we show the new year's class list
  const prevSchoolYearIdRef = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (prevSchoolYearIdRef.current !== undefined && prevSchoolYearIdRef.current !== schoolYearId) {
      setSelectedClassId('')
    }
    prevSchoolYearIdRef.current = schoolYearId
  }, [schoolYearId])

  // Fetch all classes on mount (filtered by selected school year)
  useEffect(() => {
    if (schoolYearId == null) return
    const fetchClasses = async () => {
      try {
        const response = await fetch(`/api/classes?schoolYearId=${schoolYearId}`, {
          cache: 'no-store',
        })
        if (!response.ok) throw new Error('Failed to fetch classes')
        const data = (await response.json()) as Array<{ id: number; name: string }>
        setClasses(data)
      } catch (e) {
        captureFrontendError(e, {
          location: 'notensammler',
          type: 'fetch-classes',
        })
        setError(e instanceof Error ? e.message : 'Failed to load classes')
      }
    }
    void fetchClasses()
  }, [schoolYearId])

  // Preselect class from query parameter when classes are loaded
  useEffect(() => {
    const classNameParam = searchParams.get('class')
    if (classNameParam && classes.length > 0 && !selectedClassId) {
      // Find class by name (case-insensitive match)
      const matchingClass = classes.find(
        cls => cls.name.toLowerCase() === classNameParam.toLowerCase(),
      )
      if (matchingClass) {
        setSelectedClassId(matchingClass.id.toString())
      } else {
        // Class not found - show error message
        setError(t('notensammler.classNotFound', `Klasse "${classNameParam}" nicht gefunden.`))
      }
    }
  }, [classes, searchParams, selectedClassId, t])

  // Handle class selection and sync URL
  const handleClassChange = useCallback(
    (classId: string) => {
      setSelectedClassId(classId)
      // Update URL query parameter
      const params = new URLSearchParams(searchParams.toString())
      if (classId) {
        const selectedClass = classes.find(cls => cls.id.toString() === classId)
        if (selectedClass) {
          params.set('class', selectedClass.name)
        }
      } else {
        params.delete('class')
      }
      router.replace(`/notensammler?${params.toString()}`, { scroll: false })
    },
    [classes, router, searchParams],
  )

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      if (saveFinalGradeTimerRef.current) clearTimeout(saveFinalGradeTimerRef.current)
      if (saveConductWishTimerRef.current) clearTimeout(saveConductWishTimerRef.current)
    }
  }, [])

  // Fetch current teacher ID
  useEffect(() => {
    const fetchCurrentTeacher = async () => {
      if (!session?.user?.name) {
        setCurrentTeacherId(null)
        return
      }

      try {
        const teacherResponse = await fetch(
          `/api/teachers/by-username?username=${session.user.name}`,
        )
        if (teacherResponse.ok) {
          const teacher = (await teacherResponse.json()) as { id: number } | null
          setCurrentTeacherId(teacher?.id ?? null)
        } else {
          setCurrentTeacherId(null)
        }
      } catch (e) {
        console.error('Failed to fetch current teacher:', e)
        setCurrentTeacherId(null)
      }
    }

    void fetchCurrentTeacher()
  }, [session?.user?.name])

  // Fetch teacher's classes (for tab bar with per-semester completion)
  useEffect(() => {
    if (!session?.user?.name || schoolYearId == null) {
      setTeacherClasses([])
      return
    }
    const fetchTeacherClasses = async () => {
      try {
        const response = await fetch(
          `/api/notensammler/teacher-classes?schoolYearId=${schoolYearId}`,
          { cache: 'no-store' },
        )
        if (!response.ok) return
        const data = (await response.json()) as {
          classes: Array<{
            id: number
            name: string
            allGradesEnteredFirst: boolean
            allGradesEnteredSecond: boolean
          }>
        }
        setTeacherClasses(data.classes ?? [])
      } catch (e) {
        captureFrontendError(e, { location: 'notensammler', type: 'fetch-teacher-classes' })
        setTeacherClasses([])
      }
    }
    void fetchTeacherClasses()
  }, [session?.user?.name, schoolYearId])

  // Fetch class data and grades when class is selected
  useEffect(() => {
    if (!selectedClassId || schoolYearId == null) {
      setClassData(null)
      setGrades({})
      setFinalGrades({})
      return
    }

    const fetchClassData = async () => {
      try {
        setLoading(true)
        setError(null)

        const [classResponse, gradesResponse] = await Promise.all([
          fetch(`/api/notensammler/class/${selectedClassId}?schoolYearId=${schoolYearId}`, {
            cache: 'no-store',
          }),
          fetch(
            `/api/notensammler/grades?classId=${selectedClassId}&schoolYearId=${schoolYearId}`,
            { cache: 'no-store' },
          ),
        ])

        if (!classResponse.ok) throw new Error('Failed to fetch class data')
        if (!gradesResponse.ok) throw new Error('Failed to fetch grades')

        const classDataResult = (await classResponse.json()) as Class
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
        // Normalize finalGrades so every entry has conductWishFirst/Second (for backwards compatibility)
        const finalGradesResult: FinalGradesData = {}
        for (const studentKey of Object.keys(rawFinal)) {
          const studentId = Number(studentKey)
          if (Number.isNaN(studentId)) continue
          const entry = rawFinal[studentId as keyof typeof rawFinal]
          if (!entry) continue
          finalGradesResult[studentId] = {
            first: entry.first ?? null,
            second: entry.second ?? null,
            conductWishFirst: entry.conductWishFirst ?? null,
            conductWishSecond: entry.conductWishSecond ?? null,
          }
        }

        setClassData(classDataResult)
        setGrades(normalizeGradesKeys(gradesResult))
        setFinalGrades(finalGradesResult)
      } catch (e) {
        captureFrontendError(e, {
          location: 'notensammler',
          type: 'fetch-class-data',
        })
        setError(e instanceof Error ? e.message : 'Failed to load class data')
      } finally {
        setLoading(false)
      }
    }

    void fetchClassData()
  }, [selectedClassId, schoolYearId])

  // Save grade function
  const saveGrade = useCallback(
    async (
      studentId: number,
      teacherId: number,
      semester: 'first' | 'second',
      grade: number | null,
      silent = false, // If true, don't update saving state (for bulk saves)
    ) => {
      if (!classData) return

      try {
        if (!silent) {
          setSaving(true)
        }

        const response = await fetch('/api/notensammler/grades', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            studentId,
            teacherId,
            classId: classData.id,
            semester,
            grade,
            ...(schoolYearId != null && { schoolYearId }),
          }),
        })

        if (!response.ok) {
          const errorData = (await response.json()) as { error?: string }
          throw new Error(errorData.error ?? 'Failed to save grade')
        }

        // Update local state only if not in bulk save mode
        if (!silent) {
          setGrades(prev => {
            const newGrades = { ...prev }
            newGrades[studentId] ??= {}
            newGrades[studentId][teacherId] ??= { first: null, second: null }
            newGrades[studentId][teacherId][semester] = grade
            return newGrades
          })
        }
      } catch (e) {
        captureFrontendError(e, {
          location: 'notensammler',
          type: 'save-grade',
        })
        console.error('Failed to save grade:', e)
        throw e // Re-throw for bulk save error handling
      } finally {
        if (!silent) {
          setSaving(false)
        }
      }
    },
    [classData],
  )

  // Handle grade input change
  const handleGradeChange = useCallback(
    (studentId: number, teacherId: number, semester: 'first' | 'second', value: string) => {
      // Parse grade using helper function
      const gradeValue = parseGradeInput(value)

      // Update local state immediately for responsive UI
      setGrades(prev => {
        const newGrades = { ...prev }
        newGrades[studentId] ??= {}
        newGrades[studentId][teacherId] ??= { first: null, second: null }
        newGrades[studentId][teacherId][semester] = gradeValue
        return newGrades
      })

      // Debounce save
      if (gradeValue !== null || value === '') {
        // Clear existing timer
        if (saveTimerRef.current) {
          clearTimeout(saveTimerRef.current)
        }

        // Store previous value for rollback on error
        const previousValue = grades[studentId]?.[teacherId]?.[semester] ?? null

        // Set new timer
        saveTimerRef.current = setTimeout(() => {
          void (async () => {
            try {
              await saveGrade(studentId, teacherId, semester, gradeValue)
            } catch (error) {
              // Revert optimistic update on error
              console.error('Failed to save grade, reverting:', error)
              setGrades(prev => {
                const newGrades = { ...prev }
                newGrades[studentId] ??= {}
                newGrades[studentId][teacherId] ??= { first: null, second: null }
                newGrades[studentId][teacherId][semester] = previousValue
                return newGrades
              })
              setError('Failed to save grade. Please try again.')
            } finally {
              saveTimerRef.current = null
            }
          })()
        }, 500)
      }
    },
    [saveGrade, saveTimerRef, grades],
  )

  // Calculate average for a student in a semester, optionally only for one period (AM/PM).
  // Returns: number (average), "nicht beurteilt", "gestunden", or null
  const calculateAverage = useCallback(
    (
      studentId: number,
      semester: 'first' | 'second',
      period?: 'AM' | 'PM',
    ): number | string | null => {
      if (!classData) return null

      const studentGrades = grades[studentId]
      if (!studentGrades) return null

      const teacherIdsForPeriod =
        period === 'AM'
          ? new Set(classData.amTeachers.map(t => t.id))
          : period === 'PM'
            ? new Set(classData.pmTeachers.map(t => t.id))
            : null

      const considerTeacher = (teacherId: number): boolean =>
        teacherIdsForPeriod === null || teacherIdsForPeriod.has(teacherId)

      // First check if any grade is "nicht beurteilt" (6) or "gestunden" (7)
      for (const teacherId in studentGrades) {
        const tid = parseInt(teacherId)
        if (!considerTeacher(tid)) continue
        const teacherGrades = studentGrades[tid]
        if (teacherGrades) {
          const grade = teacherGrades[semester]
          if (grade === NICHT_BEURTEILT) return 'nicht beurteilt'
          if (grade === GESTUNDEN) return 'gestunden'
        }
      }

      // If no special grades, calculate normal average
      const gradeValues: number[] = []
      for (const teacherId in studentGrades) {
        const tid = parseInt(teacherId)
        if (!considerTeacher(tid)) continue
        const teacherGrades = studentGrades[tid]
        if (teacherGrades) {
          const grade = teacherGrades[semester]
          if (grade !== null && grade !== undefined && isGradeIncludedInAverage(grade)) {
            gradeValues.push(grade)
          }
        }
      }

      if (gradeValues.length === 0) return null
      const sum = gradeValues.reduce((acc, val) => acc + val, 0)
      return Math.round((sum / gradeValues.length) * 10) / 10
    },
    [grades, classData],
  )

  // Get grade value (grades keys are normalized to numbers when loaded from API)
  const getGrade = useCallback(
    (studentId: number, teacherId: number, semester: 'first' | 'second'): number | null => {
      return grades[studentId]?.[teacherId]?.[semester] ?? null
    },
    [grades],
  )

  // Display value for Endnote: saved value or pre-populate from average (nicht beurteilt/gestunden)
  const getFinalGradeDisplay = useCallback(
    (studentId: number, semester: 'first' | 'second'): number | null => {
      const saved = finalGrades[studentId]?.[semester]
      if (saved != null) return saved
      const avg = calculateAverage(studentId, semester)
      if (avg === 'nicht beurteilt') return NICHT_BEURTEILT
      if (avg === 'gestunden') return GESTUNDEN
      return null
    },
    [finalGrades, calculateAverage],
  )

  // Save final grade function (optionally with Betragensnote Wunsch)
  const saveFinalGrade = useCallback(
    async (
      studentId: number,
      semester: 'first' | 'second',
      grade: number | null,
      silent = false,
      conductNoteWish?: string | null,
    ) => {
      if (!classData) return
      try {
        if (!silent) setSaving(true)
        const body: {
          studentId: number
          classId: number
          semester: 'first' | 'second'
          grade: number | null
          schoolYearId?: number
          conductNoteWish?: string | null
        } = {
          studentId,
          classId: classData.id,
          semester,
          grade,
        }
        if (schoolYearId != null) body.schoolYearId = schoolYearId
        if (conductNoteWish !== undefined)
          body.conductNoteWish = conductNoteWish === '' ? null : conductNoteWish
        const response = await fetch('/api/notensammler/final-grades', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!response.ok) {
          const errorData = (await response.json()) as { error?: string }
          throw new Error(errorData.error ?? 'Failed to save final grade')
        }
        if (!silent) {
          setFinalGrades(prev => {
            const next = { ...prev }
            next[studentId] ??= {
              first: null,
              second: null,
              conductWishFirst: null,
              conductWishSecond: null,
            }
            next[studentId]![semester] = grade
            if (conductNoteWish !== undefined) {
              if (semester === 'first')
                next[studentId]!.conductWishFirst = conductNoteWish === '' ? null : conductNoteWish
              else
                next[studentId]!.conductWishSecond = conductNoteWish === '' ? null : conductNoteWish
            }
            return next
          })
        }
      } catch (e) {
        captureFrontendError(e, { location: 'notensammler', type: 'save-final-grade' })
        throw e
      } finally {
        if (!silent) setSaving(false)
      }
    },
    [classData, schoolYearId],
  )

  // Handle final grade input change
  const handleFinalGradeChange = useCallback(
    (studentId: number, semester: 'first' | 'second', value: string) => {
      const gradeValue = parseFinalGradeInput(value)
      setFinalGrades(prev => {
        const next = { ...prev }
        next[studentId] ??= {
          first: null,
          second: null,
          conductWishFirst: null,
          conductWishSecond: null,
        }
        next[studentId]![semester] = gradeValue
        return next
      })
      if (gradeValue !== null || value === '') {
        if (saveFinalGradeTimerRef.current) {
          clearTimeout(saveFinalGradeTimerRef.current)
          saveFinalGradeTimerRef.current = null
        }
        const previousValue = finalGrades[studentId]?.[semester] ?? null
        const conductWish =
          semester === 'first'
            ? (finalGrades[studentId]?.conductWishFirst ?? null)
            : (finalGrades[studentId]?.conductWishSecond ?? null)
        saveFinalGradeTimerRef.current = setTimeout(() => {
          void (async () => {
            try {
              await saveFinalGrade(studentId, semester, gradeValue, false, conductWish)
            } catch {
              setFinalGrades(prev => {
                const next = { ...prev }
                next[studentId] ??= {
                  first: null,
                  second: null,
                  conductWishFirst: null,
                  conductWishSecond: null,
                }
                next[studentId]![semester] = previousValue
                return next
              })
              setError('Failed to save final grade. Please try again.')
            } finally {
              saveFinalGradeTimerRef.current = null
            }
          })()
        }, 500)
      }
    },
    [saveFinalGrade, finalGrades],
  )

  // Handle Betragensnote (Wunsch) dropdown change
  const handleConductWishChange = useCallback(
    (studentId: number, semester: 'first' | 'second', value: string) => {
      // Store sentinel in state for "-" so Select shows it; send null to API
      const conductValue = value === '' || value === CONDUCT_NOTE_WISH_NONE ? null : value
      const stateValue = value === '' ? null : value
      setFinalGrades(prev => {
        const next = { ...prev }
        next[studentId] ??= {
          first: null,
          second: null,
          conductWishFirst: null,
          conductWishSecond: null,
        }
        if (semester === 'first') next[studentId]!.conductWishFirst = stateValue
        else next[studentId]!.conductWishSecond = stateValue
        return next
      })
      if (saveConductWishTimerRef.current) {
        clearTimeout(saveConductWishTimerRef.current)
        saveConductWishTimerRef.current = null
      }
      const previousConduct =
        semester === 'first'
          ? (finalGrades[studentId]?.conductWishFirst ?? null)
          : (finalGrades[studentId]?.conductWishSecond ?? null)
      const gradeToSend = getFinalGradeDisplay(studentId, semester)
      saveConductWishTimerRef.current = setTimeout(() => {
        void (async () => {
          try {
            await saveFinalGrade(studentId, semester, gradeToSend, false, conductValue)
          } catch {
            setFinalGrades(prev => {
              const next = { ...prev }
              next[studentId] ??= {
                first: null,
                second: null,
                conductWishFirst: null,
                conductWishSecond: null,
              }
              if (semester === 'first') next[studentId]!.conductWishFirst = previousConduct
              else next[studentId]!.conductWishSecond = previousConduct
              return next
            })
            setError('Failed to save Betragensnote (Wunsch). Please try again.')
          } finally {
            saveConductWishTimerRef.current = null
          }
        })()
      }, 500)
    },
    [saveFinalGrade, finalGrades, getFinalGradeDisplay],
  )

  // Current teacher highlight: which column gets bg-primary/10 (no longer used for missing logic).
  const currentTeacherTeachesClass =
    classData != null &&
    currentTeacherId != null &&
    (classData.amTeachers.some(t => t.id === currentTeacherId) ||
      classData.pmTeachers.some(t => t.id === currentTeacherId))

  const currentTeacherIdInClass: number | null =
    currentTeacherTeachesClass && classData != null && currentTeacherId != null
      ? ((
          classData.amTeachers.find(t => t.id === currentTeacherId) ??
          classData.pmTeachers.find(t => t.id === currentTeacherId)
        )?.id ?? null)
      : null

  // Missing in current semester only (any teacher). Used for row highlight and sort.
  const hasMissingInCurrentSemester = useCallback(
    (studentId: number): boolean => {
      if (currentSemester === null || !classData) return false
      const allTeachers = [...classData.amTeachers, ...classData.pmTeachers]
      if (currentSemester === 'first') {
        return allTeachers.some(t => getGrade(studentId, t.id, 'first') === null)
      }
      return allTeachers.some(t => getGrade(studentId, t.id, 'second') === null)
    },
    [currentSemester, classData, getGrade],
  )

  // Sorted students: when currentSemester is set, students with missing grade in that semester first; then name/group sort.
  const sortedStudents = useMemo(() => {
    if (!classData) return []
    const students = [...classData.students]
      .filter(student => student.groupId !== null && student.groupId !== undefined)
      .sort((a, b) => {
        // Primary (only when currentSemester set): missing in current semester first
        if (currentSemester != null) {
          const aMissing = hasMissingInCurrentSemester(a.id) ? 0 : 1
          const bMissing = hasMissingInCurrentSemester(b.id) ? 0 : 1
          if (aMissing !== bMissing) return aMissing - bMissing
        }

        let primaryCompare = 0
        if (sortField === 'lastName') {
          primaryCompare = a.lastName.localeCompare(b.lastName)
          if (primaryCompare !== 0) {
            return sortDirection === 'asc' ? primaryCompare : -primaryCompare
          }
          const firstNameCompare = a.firstName.localeCompare(b.firstName)
          return sortDirection === 'asc' ? firstNameCompare : -firstNameCompare
        } else {
          if (a.groupId === null && b.groupId === null) {
            primaryCompare = 0
          } else if (a.groupId === null) {
            primaryCompare = 1
          } else if (b.groupId === null) {
            primaryCompare = -1
          } else {
            primaryCompare = a.groupId - b.groupId
          }
          if (primaryCompare !== 0) {
            return sortDirection === 'asc' ? primaryCompare : -primaryCompare
          }
          const lastNameCompare = a.lastName.localeCompare(b.lastName)
          if (lastNameCompare !== 0) {
            return sortDirection === 'asc' ? lastNameCompare : -lastNameCompare
          }
          const firstNameCompare = a.firstName.localeCompare(b.firstName)
          return sortDirection === 'asc' ? firstNameCompare : -firstNameCompare
        }
      })
    return students
  }, [classData, sortField, sortDirection, currentSemester, hasMissingInCurrentSemester])

  // When class has separate AM/PM subjects, table shows only the active period; otherwise both
  const tablePeriod: 'AM' | 'PM' | undefined = classData?.hasSeparateAmPmSubjects
    ? periodTab
    : undefined

  // Per-period grade completion (for AM/PM tabs: check/cross like class tabs)
  const periodCompletion = useMemo(() => {
    if (!classData?.hasSeparateAmPmSubjects || !sortedStudents.length) {
      return { amFirst: false, amSecond: false, pmFirst: false, pmSecond: false }
    }
    const allEntered = (teachers: Teacher[], semester: 'first' | 'second') =>
      teachers.length === 0 ||
      sortedStudents.every(s => teachers.every(t => grades[s.id]?.[t.id]?.[semester] != null))
    return {
      amFirst: allEntered(classData.amTeachers, 'first'),
      amSecond: allEntered(classData.amTeachers, 'second'),
      pmFirst: allEntered(classData.pmTeachers, 'first'),
      pmSecond: allEntered(classData.pmTeachers, 'second'),
    }
  }, [classData, sortedStudents, grades])

  // Save all grades function
  const saveAllGrades = useCallback(async () => {
    if (!classData || !selectedClassId) return

    try {
      setSavingAll(true)
      setError(null)

      // Clear any pending debounce timers
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
      if (saveFinalGradeTimerRef.current) {
        clearTimeout(saveFinalGradeTimerRef.current)
        saveFinalGradeTimerRef.current = null
      }
      if (saveConductWishTimerRef.current) {
        clearTimeout(saveConductWishTimerRef.current)
        saveConductWishTimerRef.current = null
      }

      // Build batch payloads (one request for grades, one for final grades)
      const gradesPayload: Array<{
        studentId: number
        teacherId: number
        semester: 'first' | 'second'
        grade: number | null
      }> = []
      for (const studentId in grades) {
        const studentGrades = grades[parseInt(studentId)]
        if (!studentGrades) continue
        for (const teacherId in studentGrades) {
          const teacherGrades = studentGrades[parseInt(teacherId)]
          if (!teacherGrades) continue
          gradesPayload.push(
            {
              studentId: parseInt(studentId),
              teacherId: parseInt(teacherId),
              semester: 'first',
              grade: teacherGrades.first ?? null,
            },
            {
              studentId: parseInt(studentId),
              teacherId: parseInt(teacherId),
              semester: 'second',
              grade: teacherGrades.second ?? null,
            },
          )
        }
      }

      const finalGradesPayload: Array<{
        studentId: number
        semester: 'first' | 'second'
        grade: number | null
        conductNoteWish: string | null
      }> = []
      for (const studentId in grades) {
        const sid = parseInt(studentId)
        const firstVal = getFinalGradeDisplay(sid, 'first')
        const secondVal = getFinalGradeDisplay(sid, 'second')
        const conductFirst = finalGrades[sid]?.conductWishFirst ?? null
        const conductSecond = finalGrades[sid]?.conductWishSecond ?? null
        const conductFirstForApi =
          conductFirst === CONDUCT_NOTE_WISH_NONE || conductFirst === '' ? null : conductFirst
        const conductSecondForApi =
          conductSecond === CONDUCT_NOTE_WISH_NONE || conductSecond === '' ? null : conductSecond
        if (firstVal != null || conductFirst != null) {
          finalGradesPayload.push({
            studentId: sid,
            semester: 'first',
            grade: firstVal ?? null,
            conductNoteWish: conductFirstForApi,
          })
        }
        if (secondVal != null || conductSecond != null) {
          finalGradesPayload.push({
            studentId: sid,
            semester: 'second',
            grade: secondVal ?? null,
            conductNoteWish: conductSecondForApi,
          })
        }
      }

      const batchBody = {
        classId: classData.id,
        ...(schoolYearId != null && { schoolYearId }),
      }
      const [gradesRes, finalGradesRes] = await Promise.all([
        gradesPayload.length > 0
          ? fetch('/api/notensammler/grades/batch', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...batchBody, grades: gradesPayload }),
            })
          : Promise.resolve(
              new Response(JSON.stringify({ success: true, count: 0 }), { status: 200 }),
            ),
        finalGradesPayload.length > 0
          ? fetch('/api/notensammler/final-grades/batch', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...batchBody, finalGrades: finalGradesPayload }),
            })
          : Promise.resolve(
              new Response(JSON.stringify({ success: true, count: 0 }), { status: 200 }),
            ),
      ])

      if (!gradesRes.ok) {
        const err = (await gradesRes.json()) as { error?: string }
        throw new Error(err.error ?? 'Failed to save grades')
      }
      if (!finalGradesRes.ok) {
        const err = (await finalGradesRes.json()) as { error?: string }
        throw new Error(err.error ?? 'Failed to save final grades')
      }

      // Refetch teacher classes so tab icons (1. Sem / 2. Sem check/cross) update
      try {
        const tcRes =
          schoolYearId != null
            ? await fetch(`/api/notensammler/teacher-classes?schoolYearId=${schoolYearId}`)
            : await fetch('/api/notensammler/teacher-classes')
        if (tcRes.ok) {
          const tcData = (await tcRes.json()) as {
            classes: Array<{
              id: number
              name: string
              allGradesEnteredFirst: boolean
              allGradesEnteredSecond: boolean
            }>
          }
          setTeacherClasses(tcData.classes ?? [])
        }
      } catch {
        // Non-fatal: tab icons may be stale until next load
      }
    } catch (e) {
      captureFrontendError(e, {
        location: 'notensammler',
        type: 'save-all-grades',
      })
      setError(e instanceof Error ? e.message : 'Failed to save all grades')
    } finally {
      setSavingAll(false)
    }
  }, [classData, selectedClassId, grades, finalGrades, getFinalGradeDisplay, schoolYearId])

  // Handle PDF download
  const handleDownloadPDF = useCallback(async () => {
    if (!selectedClassId || !classData) return

    try {
      setDownloadingPdf(true)
      const url =
        schoolYearId != null
          ? `/api/notensammler/pdf?classId=${selectedClassId}&schoolYearId=${schoolYearId}`
          : `/api/notensammler/pdf?classId=${selectedClassId}`
      const response = await fetch(url)

      if (!response.ok) {
        throw new Error('Failed to generate PDF')
      }

      const blob = await response.blob()
      const blobUrl = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      const today = new Date().toLocaleDateString('de-DE')
      a.download = `notensammler-${classData.name}-${today}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(blobUrl)
      document.body.removeChild(a)
    } catch (e) {
      captureFrontendError(e, {
        location: 'notensammler',
        type: 'download-pdf',
      })
      setError(e instanceof Error ? e.message : 'Failed to download PDF')
    } finally {
      setDownloadingPdf(false)
    }
  }, [selectedClassId, classData, schoolYearId])

  // Handle PDF download for all teacher's classes
  const handleDownloadAllClassesPDF = useCallback(async () => {
    try {
      setDownloadingAllPdf(true)
      const url =
        schoolYearId != null
          ? `/api/notensammler/pdf/all?schoolYearId=${schoolYearId}`
          : '/api/notensammler/pdf/all'
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error('Failed to generate PDF')
      }
      const blob = await response.blob()
      const blobUrl = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      const today = new Date().toLocaleDateString('de-DE')
      a.download = `notensammler-alle-klassen-${today}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(blobUrl)
      document.body.removeChild(a)
    } catch (e) {
      captureFrontendError(e, {
        location: 'notensammler',
        type: 'download-all-pdf',
      })
      setError(e instanceof Error ? e.message : 'Failed to download PDF')
    } finally {
      setDownloadingAllPdf(false)
    }
  }, [schoolYearId])

  // Delete all grades for a teacher
  const deleteTeacherGrades = useCallback(async () => {
    if (!teacherToDelete || !classData || !selectedClassId) return

    try {
      setDeleting(true)
      setError(null)

      const q = schoolYearId != null ? `&schoolYearId=${schoolYearId}` : ''
      const response = await fetch(
        `/api/notensammler/grades?teacherId=${teacherToDelete.id}&classId=${classData.id}${q}`,
        {
          method: 'DELETE',
        },
      )

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string }
        throw new Error(errorData.error ?? 'Failed to delete grades')
      }

      // Update local state to remove deleted teacher's grades
      setGrades(prev => {
        const newGrades = { ...prev }
        for (const studentId in newGrades) {
          const studentGrades = newGrades[parseInt(studentId)]
          if (studentGrades?.[teacherToDelete.id]) {
            delete studentGrades[teacherToDelete.id]
            // Remove student entry if no teachers left
            if (Object.keys(studentGrades).length === 0) {
              delete newGrades[parseInt(studentId)]
            }
          }
        }
        return newGrades
      })

      // Close dialog and reset state
      setShowDeleteDialog(false)
      setTeacherToDelete(null)
    } catch (e) {
      captureFrontendError(e, {
        location: 'notensammler',
        type: 'delete-teacher-grades',
      })
      setError(e instanceof Error ? e.message : 'Failed to delete grades')
    } finally {
      setDeleting(false)
    }
  }, [teacherToDelete, classData, selectedClassId])

  const openTransferFlow = useCallback(() => {
    if (!classData || !selectedClassId) return
    setTransferResult(null)
    setPreviewData(null)
    setEditedNotes({})
    setEditedNotesNmOnly({})
    setTransferSemester(null)
    setTransferUsername(session?.user?.name ?? '')
    setTransferPassword('')
    setShowPasswordDialog(true)
  }, [classData, selectedClassId, session?.user?.name])

  const fetchTransferPreview = useCallback(
    async (semester: Semester) => {
      if (!classData) return

      try {
        setPreviewLoading(true)
        setError(null)

        // Check for stored token first (compare normalized usernames)
        const storedToken = getStoredToken()
        const useStoredToken =
          storedToken &&
          normalizeUsername(storedToken.username) === normalizeUsername(transferUsername)

        const res = await fetch('/api/notensammler/transfer/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            classId: classData.id,
            semester,
            ...(schoolYearId != null && { schoolYearId }),
            username: normalizeUsername(transferUsername) || transferUsername,
            ...(useStoredToken ? { token: storedToken.token } : { password: transferPassword }),
          }),
        })

        const data = (await res.json()) as
          | { error?: string; token?: string; tokenExpiresIn?: number }
          | TransferPreviewResponse
        if (!res.ok) {
          // If token was invalid, clear it and retry with password
          if (useStoredToken) {
            clearToken()
            // Retry with password if available
            if (transferPassword) {
              const retryRes = await fetch('/api/notensammler/transfer/preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  classId: classData.id,
                  semester,
                  ...(schoolYearId != null && { schoolYearId }),
                  username: normalizeUsername(transferUsername) || transferUsername,
                  password: transferPassword,
                }),
              })
              const retryData = (await retryRes.json()) as
                | { error?: string; token?: string; tokenExpiresIn?: number }
                | TransferPreviewResponse
              if (!retryRes.ok) {
                throw new Error(
                  (retryData as { error?: string }).error ?? 'Failed to build preview',
                )
              }
              // Store new token if provided
              if (
                'token' in retryData &&
                retryData.token &&
                'tokenExpiresIn' in retryData &&
                retryData.tokenExpiresIn
              ) {
                storeToken(retryData.token, retryData.tokenExpiresIn, transferUsername)
              }
              const preview = retryData as TransferPreviewResponse
              setPreviewData(preview)
              setEditedNotes(
                Object.fromEntries(
                  preview.students.map(s => [
                    s.studentId,
                    s.note ?? s.nullNoteLabel ?? 'Nicht beurteilt',
                  ]),
                ),
              )
              setShowPreviewDialog(true)
              return
            }
          }
          throw new Error((data as { error?: string }).error ?? 'Failed to build preview')
        }

        // Store new token if provided
        if ('token' in data && data.token && 'tokenExpiresIn' in data && data.tokenExpiresIn) {
          storeToken(data.token, data.tokenExpiresIn, transferUsername)
        }

        const preview = data as TransferPreviewResponse
        setPreviewData(preview)
        setEditedNotes(
          Object.fromEntries(
            preview.students.map(s => [
              s.studentId,
              s.note ?? s.nullNoteLabel ?? 'Nicht beurteilt',
            ]),
          ),
        )
        setShowPreviewDialog(true)
      } catch (e) {
        captureFrontendError(e, { location: 'notensammler', type: 'notenmanagement-preview' })
        setError(e instanceof Error ? e.message : 'Failed to build transfer preview')
      } finally {
        setPreviewLoading(false)
      }
    },
    [classData, transferPassword],
  )

  const submitTransfer = useCallback(async () => {
    if (!classData || !previewData || !transferSemester) return
    try {
      setTransferLoading(true)
      setError(null)

      const notesPayload = Object.entries(editedNotes).map(([studentId, n]) => ({
        studentId: parseInt(studentId),
        note: typeof n === 'number' ? n : null,
        nullNoteReason: n === 'Nicht beurteilt' || n === 'Gestundet' ? n : undefined,
      }))

      const notesByMatrikelnummer = (previewData.nmStudentsWithoutGradeOrMatch ?? []).map(nm => ({
        matrikelnummer: nm.Matrikelnummer,
        note: editedNotesNmOnly[nm.Matrikelnummer] ?? null,
      }))

      // Check for stored token first (compare normalized usernames)
      const storedToken = getStoredToken()
      const useStoredToken =
        storedToken &&
        normalizeUsername(storedToken.username) === normalizeUsername(transferUsername)

      const res = await fetch('/api/notensammler/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classId: classData.id,
          semester: transferSemester,
          ...(schoolYearId != null && { schoolYearId }),
          username: normalizeUsername(transferUsername) || transferUsername,
          ...(useStoredToken ? { token: storedToken.token } : { password: transferPassword }),
          notes: notesPayload,
          notesByMatrikelnummer,
        }),
      })

      const data = (await res.json()) as
        | { error?: string; details?: unknown; token?: string; tokenExpiresIn?: number }
        | TransferResultResponse
      if (!res.ok) {
        // If token was invalid, clear it and retry with password
        if (useStoredToken && transferPassword) {
          clearToken()
          const retryRes = await fetch('/api/notensammler/transfer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              classId: classData.id,
              semester: transferSemester,
              ...(schoolYearId != null && { schoolYearId }),
              username: normalizeUsername(transferUsername) || transferUsername,
              password: transferPassword,
              notes: notesPayload,
              notesByMatrikelnummer,
            }),
          })
          const retryData = (await retryRes.json()) as
            | { error?: string; details?: unknown; token?: string; tokenExpiresIn?: number }
            | TransferResultResponse
          if (!retryRes.ok) {
            const details = (retryData as { details?: unknown }).details
            const msg = (retryData as { error?: string }).error ?? 'Transfer failed'
            throw new Error(details ? `${msg}\n${JSON.stringify(details, null, 2)}` : msg)
          }
          // Store new token if provided
          if (
            'token' in retryData &&
            retryData.token &&
            'tokenExpiresIn' in retryData &&
            retryData.tokenExpiresIn
          ) {
            storeToken(retryData.token, retryData.tokenExpiresIn, transferUsername)
          }
          setTransferResult(retryData as TransferResultResponse)
          setShowPreviewDialog(false)
          setShowResultDialog(true)
          return
        }
        const details = (data as { details?: unknown }).details
        const msg = (data as { error?: string }).error ?? 'Transfer failed'
        throw new Error(details ? `${msg}\n${JSON.stringify(details, null, 2)}` : msg)
      }

      // Store new token if provided
      if ('token' in data && data.token && 'tokenExpiresIn' in data && data.tokenExpiresIn) {
        storeToken(data.token, data.tokenExpiresIn, transferUsername)
      }

      setTransferResult(data as TransferResultResponse)
      setShowPreviewDialog(false)
      setShowResultDialog(true)

      // Refetch class data to update transfer status
      if (selectedClassId && schoolYearId != null) {
        try {
          const classRes = await fetch(
            `/api/notensammler/class/${selectedClassId}?schoolYearId=${schoolYearId}`,
          )
          if (classRes.ok) {
            const updatedClassData = (await classRes.json()) as Class
            setClassData(updatedClassData)
          }
        } catch (e) {
          console.error('Failed to refresh class data:', e)
        }
      }
    } catch (e) {
      captureFrontendError(e, { location: 'notensammler', type: 'notenmanagement-transfer' })
      setError(e instanceof Error ? e.message : 'Failed to transfer')
      setTransferResult(null)
      setShowResultDialog(true)
    } finally {
      setTransferLoading(false)
    }
  }, [classData, editedNotes, editedNotesNmOnly, previewData, transferPassword, transferSemester])

  // Helper to fetch LF data with token
  const fetchLfDataWithToken = useCallback(
    async (token: string, username: string, lfId: string) => {
      try {
        setLfViewLoading(true)
        setError(null)

        const res = await fetch('/api/notensammler/transfer/view', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lfId,
            username,
            token,
          }),
        })

        const data = (await res.json()) as {
          error?: string
          details?: unknown
          success?: boolean
          notes?: unknown
          token?: string
          tokenExpiresIn?: number
        }
        if (!res.ok) {
          // If token was invalid, clear it and show password dialog
          clearToken()
          setShowLfViewPasswordDialog(true)
          return
        }

        // Store new token if provided
        if (data.token && data.tokenExpiresIn) {
          storeToken(data.token, data.tokenExpiresIn, username)
        }

        if (data.success && Array.isArray(data.notes)) {
          setLfViewData(
            data.notes as Array<{
              Matrikelnummer: number
              Nachname: string
              Vorname: string
              Note: number
              Punkte: number
              Kommentar: string
            }>,
          )
          setShowLfViewDialog(true)
        } else {
          throw new Error('Invalid response format')
        }
      } catch (e) {
        captureFrontendError(e, {
          location: 'notensammler',
          type: 'fetch-lf-data',
        })
        setError(e instanceof Error ? e.message : 'Failed to fetch LF data')
      } finally {
        setLfViewLoading(false)
      }
    },
    [],
  )

  // Open LF view flow
  const openLfView = useCallback(
    (lfId: string) => {
      setSelectedLfId(lfId)
      const defaultUsername = normalizeUsername(session?.user?.name ?? '')
      setLfViewUsername(defaultUsername)
      setLfViewPassword('')
      setLfViewData(null)

      // Check if we have a valid token for the default username (compare normalized)
      const storedToken = getStoredToken()
      if (storedToken && normalizeUsername(storedToken.username) === defaultUsername) {
        // Use stored token directly
        void fetchLfDataWithToken(storedToken.token, defaultUsername, lfId)
      } else {
        // Show password dialog
        setShowLfViewPasswordDialog(true)
      }
    },
    [session?.user?.name, fetchLfDataWithToken],
  )

  // Fetch LF data from Notenmanagement
  const fetchLfData = useCallback(async () => {
    if (!selectedLfId || !lfViewPassword) return

    try {
      setLfViewLoading(true)
      setError(null)

      const res = await fetch('/api/notensammler/transfer/view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lfId: selectedLfId,
          username: normalizeUsername(lfViewUsername) || lfViewUsername,
          password: lfViewPassword,
        }),
      })

      const data = (await res.json()) as {
        error?: string
        details?: unknown
        success?: boolean
        notes?: unknown
        token?: string
        tokenExpiresIn?: number
      }
      if (!res.ok) {
        const details = (data as { details?: unknown }).details
        const msg = (data as { error?: string }).error ?? 'Failed to fetch LF data'
        throw new Error(details ? `${msg}\n${JSON.stringify(details, null, 2)}` : msg)
      }

      // Store new token if provided
      if (data.token && data.tokenExpiresIn) {
        storeToken(data.token, data.tokenExpiresIn, lfViewUsername)
      }

      if (data.success && Array.isArray(data.notes)) {
        setLfViewData(
          data.notes as Array<{
            Matrikelnummer: number
            Nachname: string
            Vorname: string
            Note: number
            Punkte: number
            Kommentar: string
          }>,
        )
        setShowLfViewPasswordDialog(false)
        setShowLfViewDialog(true)
      } else {
        throw new Error('Invalid response format')
      }
    } catch (e) {
      captureFrontendError(e, {
        location: 'notensammler',
        type: 'fetch-lf-data',
      })
      setError(e instanceof Error ? e.message : 'Failed to fetch LF data')
    } finally {
      setLfViewLoading(false)
    }
  }, [selectedLfId, lfViewPassword, lfViewUsername])

  return (
    <div className="container mx-auto p-4">
      <div className="mb-8">
        <h1 className="mb-4 text-3xl font-bold">{t('notensammler.title', 'Notensammler')}</h1>
        {error && (
          <div className="border-destructive/30 bg-destructive/10 text-destructive mb-4 flex items-start justify-between gap-4 rounded-md border p-3">
            <div className="whitespace-pre-line">{error}</div>
            <Button variant="outline" onClick={() => setError(null)}>
              {t('common.close', 'Schließen')}
            </Button>
          </div>
        )}
        <div className="mb-4">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label className="mb-2 block text-sm font-medium">
                {t('notensammler.selectClass', 'Klasse auswählen')}
              </label>
              <Select value={selectedClassId} onValueChange={handleClassChange}>
                <SelectTrigger className="w-[300px]">
                  <SelectValue
                    placeholder={t(
                      'notensammler.selectClassPlaceholder',
                      'Bitte Klasse auswählen...',
                    )}
                  />
                </SelectTrigger>
                <SelectContent>
                  {classes.map(cls => (
                    <SelectItem key={cls.id} value={cls.id.toString()}>
                      {cls.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="secondary"
              onClick={handleDownloadAllClassesPDF}
              disabled={downloadingAllPdf || teacherClasses.length === 0}
              className="self-end"
              title={t(
                'notensammler.tooltipAllClassesPdf',
                'Lädt eine Datei mit allen eigenen Noten herunter.',
              )}
            >
              {downloadingAllPdf ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  {t('notensammler.downloadingAllClassesPdf', 'PDF wird erstellt...')}
                </>
              ) : (
                t('notensammler.downloadAllClassesPdf', 'Notenliste alle eigenen Klassen als PDF')
              )}
            </Button>
          </div>
          <div className="bg-muted/50 mt-3 rounded-md border px-3 py-2.5">
            <p className="text-muted-foreground mb-1.5 text-sm font-medium">
              {t('notensammler.infoTitle', 'Hinweise')}
            </p>
            <div className="text-muted-foreground space-y-1 text-sm">
              {(
                t(
                  'notensammler.infoText',
                  'Betragensnote: Hier kann jeder Lehrer seinen Wunsch eintragen.\nNotenliste alle Klassen als PDF: Lädt eine Datei mit allen eigenen Noten herunter.\nPDF Herunterladen: Lädt die gesamte Notenliste der ausgewählten Klasse herunter.\nAn Notenmanagement übertragen: Überträgt die Noten an das Notenmanagement.',
                ) as string
              )
                .split('\n')
                .filter(Boolean)
                .map((line, i) => {
                  const idx = line.indexOf(': ')
                  const label = idx >= 0 ? line.slice(0, idx) : line
                  const desc = idx >= 0 ? line.slice(idx + 2) : ''
                  return (
                    <p key={i}>
                      <strong className="text-foreground font-semibold">{label}</strong>
                      {desc ? `: ${desc}` : ''}
                    </p>
                  )
                })}
            </div>
          </div>
        </div>
        {teacherClasses.length > 0 && (
          <Tabs
            value={
              teacherClasses.some(c => c.id.toString() === selectedClassId) ? selectedClassId : ''
            }
            onValueChange={handleClassChange}
            className="mb-4"
          >
            <TabsList className="text-foreground flex h-auto flex-wrap gap-2 bg-transparent p-0">
              {teacherClasses.map(cls => (
                <TabsTrigger
                  key={cls.id}
                  value={cls.id.toString()}
                  className="group hover:bg-muted/80 data-[state=active]:ring-primary flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium shadow-sm transition-all data-[state=active]:shadow-md data-[state=active]:ring-2 data-[state=active]:ring-inset"
                >
                  <span className="font-semibold">{cls.name}</span>
                  <span className="flex items-center gap-2 text-xs font-normal opacity-90">
                    <span className="bg-background/60 flex items-center gap-1 rounded-md px-2 py-0.5">
                      {t('notensammler.firstSemesterShort', '1. Sem')}
                      {cls.allGradesEnteredFirst ? (
                        <CheckCircle2
                          className="h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-400"
                          aria-hidden
                        />
                      ) : (
                        <X className="text-destructive h-3.5 w-3.5 shrink-0" aria-hidden />
                      )}
                    </span>
                    <span className="bg-background/60 flex items-center gap-1 rounded-md px-2 py-0.5">
                      {t('notensammler.secondSemesterShort', '2. Sem')}
                      {cls.allGradesEnteredSecond ? (
                        <CheckCircle2
                          className="h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-400"
                          aria-hidden
                        />
                      ) : (
                        <X className="text-destructive h-3.5 w-3.5 shrink-0" aria-hidden />
                      )}
                    </span>
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}
        {classData && (
          <div className="mb-4 flex items-center gap-6">
            {currentSemester != null && (
              <span className="text-muted-foreground text-sm">
                {t('notensammler.currentSemester', 'Aktuell')}:{' '}
                {currentSemester === 'first'
                  ? t('notensammler.firstSemester', '1. Semester')
                  : t('notensammler.secondSemester', '2. Semester')}
              </span>
            )}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="show-first-semester"
                checked={showFirstSemester}
                onCheckedChange={checked => setShowFirstSemester(checked === true)}
              />
              <Label
                htmlFor="show-first-semester"
                className="flex cursor-pointer items-center gap-2"
              >
                {t('notensammler.showFirstSemester', '1. Semester anzeigen')}
                {classData.transferStatus?.first.transferred && (
                  <Badge
                    variant="outline"
                    className="hover:bg-accent cursor-pointer text-xs"
                    onClick={e => {
                      e.stopPropagation()
                      if (classData.transferStatus?.first.lfId) {
                        openLfView(classData.transferStatus.first.lfId)
                      }
                    }}
                  >
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    {t('notensammler.transferred', 'Übertragen')}
                    {classData.transferStatus.first.lfId && (
                      <span className="text-muted-foreground ml-1">
                        (LF: {classData.transferStatus.first.lfId})
                      </span>
                    )}
                  </Badge>
                )}
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="show-second-semester"
                checked={showSecondSemester}
                onCheckedChange={checked => setShowSecondSemester(checked === true)}
              />
              <Label
                htmlFor="show-second-semester"
                className="flex cursor-pointer items-center gap-2"
              >
                {t('notensammler.showSecondSemester', '2. Semester anzeigen')}
                {classData.transferStatus?.second.transferred && (
                  <Badge
                    variant="outline"
                    className="hover:bg-accent cursor-pointer text-xs"
                    onClick={e => {
                      e.stopPropagation()
                      if (classData.transferStatus?.second.lfId) {
                        openLfView(classData.transferStatus.second.lfId)
                      }
                    }}
                  >
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    {t('notensammler.transferred', 'Übertragen')}
                    {classData.transferStatus.second.lfId && (
                      <span className="text-muted-foreground ml-1">
                        (LF: {classData.transferStatus.second.lfId})
                      </span>
                    )}
                  </Badge>
                )}
              </Label>
            </div>
            <Button onClick={saveAllGrades} disabled={savingAll || !selectedClassId}>
              {savingAll ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  {t('notensammler.savingAll', 'Speichere...')}
                </>
              ) : (
                t('notensammler.saveAll', 'Alle speichern')
              )}
            </Button>
            <Button
              onClick={handleDownloadPDF}
              disabled={downloadingPdf || !selectedClassId}
              title={t(
                'notensammler.tooltipDownloadPdf',
                'Lädt die gesamte Notenliste der ausgewählten Klasse herunter.',
              )}
            >
              {downloadingPdf ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  {t('notensammler.downloadingPdf', 'PDF wird erstellt...')}
                </>
              ) : (
                t('notensammler.downloadPdf', 'PDF herunterladen')
              )}
            </Button>
            <Button
              variant="secondary"
              onClick={openTransferFlow}
              disabled={!selectedClassId}
              title={t(
                'notensammler.tooltipTransfer',
                'Überträgt die Noten an das Notenmanagement.',
              )}
            >
              {t('notensammler.transferToNotenmanagement', 'An Notenmanagement übertragen')}
            </Button>
          </div>
        )}
      </div>

      {loading && (
        <div className="flex min-h-[200px] items-center justify-center">
          <Spinner size="lg" />
        </div>
      )}

      {classData && !loading && (
        <Card>
          <CardHeader>
            <CardTitle>
              {classData.hasSeparateAmPmSubjects
                ? classData.name
                : classData.subjectName
                  ? `${classData.name} - ${truncateSubject(classData.subjectName)}`
                  : classData.name}
              {classData.classLead && (
                <>
                  {' · '}
                  {t('notensammler.classLead', 'Klassenleitung')}: {classData.classLead}
                </>
              )}
            </CardTitle>
            <div className="mt-2 flex items-center gap-2">
              <label className="text-sm font-medium">
                {t('notensammler.sortBy', 'Sortieren nach')}:
              </label>
              <Select
                value={sortField}
                onValueChange={value => setSortField(value as 'lastName' | 'groupId')}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lastName">
                    {t('notensammler.sortByLastName', 'Nachname')}
                  </SelectItem>
                  <SelectItem value="groupId">
                    {t('notensammler.sortByGroup', 'Gruppennummer')}
                  </SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={sortDirection}
                onValueChange={value => setSortDirection(value as 'asc' | 'desc')}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">
                    {t('notensammler.sortAscending', 'Aufsteigend')}
                  </SelectItem>
                  <SelectItem value="desc">
                    {t('notensammler.sortDescending', 'Absteigend')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {classData.hasSeparateAmPmSubjects && (
              <Tabs value={periodTab} onValueChange={v => setPeriodTab(v as 'AM' | 'PM')}>
                <TabsList className="text-foreground mb-2 flex h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
                  <TabsTrigger
                    value="AM"
                    className="group hover:bg-muted/60 data-[state=active]:border-primary data-[state=active]:bg-muted/60 flex items-center gap-3 rounded-lg border-2 border-transparent px-4 py-2.5 text-sm font-medium transition-all data-[state=active]:shadow-none"
                  >
                    <span className="font-semibold">
                      {t('notensammler.vormittag', 'Vormittag')} –{' '}
                      {classData.subjectNameAm ? truncateSubject(classData.subjectNameAm) : ''}
                    </span>
                    {currentTeacherTeachesClass && (
                      <span className="flex items-center gap-2 text-xs font-normal opacity-90">
                        <span className="bg-muted/80 flex items-center gap-1 rounded-md px-2 py-0.5">
                          {t('notensammler.firstSemesterShort', '1. Sem')}
                          {periodCompletion.amFirst ? (
                            <CheckCircle2
                              className="h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-400"
                              aria-hidden
                            />
                          ) : (
                            <X className="text-destructive h-3.5 w-3.5 shrink-0" aria-hidden />
                          )}
                        </span>
                        <span className="bg-muted/80 flex items-center gap-1 rounded-md px-2 py-0.5">
                          {t('notensammler.secondSemesterShort', '2. Sem')}
                          {periodCompletion.amSecond ? (
                            <CheckCircle2
                              className="h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-400"
                              aria-hidden
                            />
                          ) : (
                            <X className="text-destructive h-3.5 w-3.5 shrink-0" aria-hidden />
                          )}
                        </span>
                      </span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger
                    value="PM"
                    className="group hover:bg-muted/60 data-[state=active]:border-primary data-[state=active]:bg-muted/60 flex items-center gap-3 rounded-lg border-2 border-transparent px-4 py-2.5 text-sm font-medium transition-all data-[state=active]:shadow-none"
                  >
                    <span className="font-semibold">
                      {t('notensammler.nachmittag', 'Nachmittag')} –{' '}
                      {classData.subjectNamePm ? truncateSubject(classData.subjectNamePm) : ''}
                    </span>
                    {currentTeacherTeachesClass && (
                      <span className="flex items-center gap-2 text-xs font-normal opacity-90">
                        <span className="bg-muted/80 flex items-center gap-1 rounded-md px-2 py-0.5">
                          {t('notensammler.firstSemesterShort', '1. Sem')}
                          {periodCompletion.pmFirst ? (
                            <CheckCircle2
                              className="h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-400"
                              aria-hidden
                            />
                          ) : (
                            <X className="text-destructive h-3.5 w-3.5 shrink-0" aria-hidden />
                          )}
                        </span>
                        <span className="bg-muted/80 flex items-center gap-1 rounded-md px-2 py-0.5">
                          {t('notensammler.secondSemesterShort', '2. Sem')}
                          {periodCompletion.pmSecond ? (
                            <CheckCircle2
                              className="h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-400"
                              aria-hidden
                            />
                          ) : (
                            <X className="text-destructive h-3.5 w-3.5 shrink-0" aria-hidden />
                          )}
                        </span>
                      </span>
                    )}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            )}
            <div className="overflow-x-auto">
              <Table className="border-collapse">
                <TableHeader>
                  {/* Period labels row */}
                  <TableRow>
                    <TableHead
                      rowSpan={2}
                      className="bg-background sticky left-0 z-10 w-10 min-w-10 p-1 text-center"
                    >
                      <span className="text-sm whitespace-nowrap [text-orientation:mixed] [writing-mode:vertical-rl]">
                        {t('notensammler.id', 'ID')}
                      </span>
                    </TableHead>
                    <TableHead
                      rowSpan={2}
                      className="bg-background sticky left-10 z-10 w-10 min-w-10 p-1 text-center"
                    >
                      <span className="text-sm whitespace-nowrap [text-orientation:mixed] [writing-mode:vertical-rl]">
                        {t('notensammler.group', 'Gruppe')}
                      </span>
                    </TableHead>
                    <TableHead
                      rowSpan={2}
                      className="bg-background sticky left-[5rem] z-10 w-[200px]"
                    >
                      {t('notensammler.student', 'Schüler')}
                    </TableHead>
                    {/* First Semester - Period labels (AM only when tablePeriod is AM or unset; PM only when PM or unset) */}
                    {showFirstSemester &&
                      (!tablePeriod || tablePeriod === 'AM') &&
                      classData.amTeachers.length > 0 && (
                        <TableHead
                          colSpan={classData.amTeachers.length}
                          className="border-b text-center"
                        >
                          {t('notensammler.vormittag', 'Vormittag')}
                        </TableHead>
                      )}
                    {/* Separator between AM and PM (only in combined view) */}
                    {showFirstSemester &&
                      !tablePeriod &&
                      classData.amTeachers.length > 0 &&
                      classData.pmTeachers.length > 0 && (
                        <TableHead
                          rowSpan={2}
                          className="border-muted-foreground/30 w-1 border-l-2 p-0"
                        ></TableHead>
                      )}
                    {showFirstSemester &&
                      (!tablePeriod || tablePeriod === 'PM') &&
                      classData.pmTeachers.length > 0 && (
                        <TableHead
                          colSpan={classData.pmTeachers.length}
                          className="border-b text-center"
                        >
                          {t('notensammler.nachmittag', 'Nachmittag')}
                        </TableHead>
                      )}
                    <TableHead rowSpan={2} className="bg-muted w-14 min-w-14 p-1 text-center">
                      <span className="text-sm whitespace-nowrap [text-orientation:mixed] [writing-mode:vertical-rl]">
                        {t('notensammler.average', 'Durchschnitt')} (
                        {t('notensammler.firstSemester', '1. Semester')})
                      </span>
                    </TableHead>
                    <TableHead rowSpan={2} className="bg-primary/10 w-14 min-w-14 p-1 text-center">
                      <span className="text-sm whitespace-nowrap [text-orientation:mixed] [writing-mode:vertical-rl]">
                        {t('notensammler.endnoteFirstSemester', 'Endnote (1. Semester)')}
                      </span>
                    </TableHead>
                    <TableHead
                      rowSpan={2}
                      className="bg-primary/5 border-muted-foreground/60 w-[105px] max-w-[105px] min-w-[90px] border-r-4 p-1 text-center"
                    >
                      <span className="text-sm whitespace-nowrap [text-orientation:mixed] [writing-mode:vertical-rl]">
                        {t('notensammler.conductNoteWish', 'Betragensnote (Wunsch)')}
                      </span>
                    </TableHead>
                    {/* Second Semester - Period labels */}
                    {showSecondSemester &&
                      (!tablePeriod || tablePeriod === 'AM') &&
                      classData.amTeachers.length > 0 && (
                        <TableHead
                          colSpan={classData.amTeachers.length}
                          className="border-b text-center"
                        >
                          {t('notensammler.vormittag', 'Vormittag')}
                        </TableHead>
                      )}
                    {showSecondSemester &&
                      !tablePeriod &&
                      classData.amTeachers.length > 0 &&
                      classData.pmTeachers.length > 0 && (
                        <TableHead
                          rowSpan={2}
                          className="border-muted-foreground/30 w-1 border-l-2 p-0"
                        ></TableHead>
                      )}
                    {showSecondSemester &&
                      (!tablePeriod || tablePeriod === 'PM') &&
                      classData.pmTeachers.length > 0 && (
                        <TableHead
                          colSpan={classData.pmTeachers.length}
                          className="border-b text-center"
                        >
                          {t('notensammler.nachmittag', 'Nachmittag')}
                        </TableHead>
                      )}
                    <TableHead rowSpan={2} className="bg-muted w-14 min-w-14 p-1 text-center">
                      <span className="text-sm whitespace-nowrap [text-orientation:mixed] [writing-mode:vertical-rl]">
                        {t('notensammler.average', 'Durchschnitt')} (
                        {t('notensammler.secondSemester', '2. Semester')})
                      </span>
                    </TableHead>
                    <TableHead rowSpan={2} className="bg-primary/10 w-14 min-w-14 p-1 text-center">
                      <span className="text-sm whitespace-nowrap [text-orientation:mixed] [writing-mode:vertical-rl]">
                        {t('notensammler.endnoteSecondSemester', 'Endnote (2. Semester)')}
                      </span>
                    </TableHead>
                    <TableHead
                      rowSpan={2}
                      className="bg-primary/5 w-[105px] max-w-[105px] min-w-[90px] p-1 text-center"
                    >
                      <span className="text-sm whitespace-nowrap [text-orientation:mixed] [writing-mode:vertical-rl]">
                        {t('notensammler.conductNoteWish', 'Betragensnote (Wunsch)')}
                      </span>
                    </TableHead>
                  </TableRow>
                  {/* Teacher names row */}
                  <TableRow>
                    {/* First Semester - AM Teachers */}
                    {showFirstSemester &&
                      (!tablePeriod || tablePeriod === 'AM') &&
                      classData.amTeachers.map(teacher => (
                        <TableHead
                          key={`first-am-${teacher.id}`}
                          className={`w-16 min-w-16 p-1 text-center ${currentTeacherId === teacher.id ? 'bg-primary/20 font-semibold' : ''}`}
                        >
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-sm whitespace-nowrap [text-orientation:mixed] [writing-mode:vertical-rl]">
                              {teacher.firstName} {teacher.lastName}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="hover:bg-destructive/10 hover:text-destructive h-4 w-4 opacity-60 hover:opacity-100"
                              onClick={e => {
                                e.stopPropagation()
                                setTeacherToDelete(teacher)
                                setShowDeleteDialog(true)
                              }}
                              title={t(
                                'notensammler.deleteTeacherGrades',
                                'Alle Noten für diesen Lehrer löschen',
                              )}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableHead>
                      ))}
                    {/* First Semester - PM Teachers */}
                    {showFirstSemester &&
                      (!tablePeriod || tablePeriod === 'PM') &&
                      classData.pmTeachers.map(teacher => (
                        <TableHead
                          key={`first-pm-${teacher.id}`}
                          className={`w-16 min-w-16 p-1 text-center ${currentTeacherId === teacher.id ? 'bg-primary/20 font-semibold' : ''}`}
                        >
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-sm whitespace-nowrap [text-orientation:mixed] [writing-mode:vertical-rl]">
                              {teacher.firstName} {teacher.lastName}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="hover:bg-destructive/10 hover:text-destructive h-4 w-4 opacity-60 hover:opacity-100"
                              onClick={e => {
                                e.stopPropagation()
                                setTeacherToDelete(teacher)
                                setShowDeleteDialog(true)
                              }}
                              title={t(
                                'notensammler.deleteTeacherGrades',
                                'Alle Noten für diesen Lehrer löschen',
                              )}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableHead>
                      ))}
                    {/* Second Semester - AM Teachers */}
                    {showSecondSemester &&
                      (!tablePeriod || tablePeriod === 'AM') &&
                      classData.amTeachers.map(teacher => (
                        <TableHead
                          key={`second-am-${teacher.id}`}
                          className={`w-16 min-w-16 p-1 text-center ${currentTeacherId === teacher.id ? 'bg-primary/20 font-semibold' : ''}`}
                        >
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-sm whitespace-nowrap [text-orientation:mixed] [writing-mode:vertical-rl]">
                              {teacher.firstName} {teacher.lastName}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="hover:bg-destructive/10 hover:text-destructive h-4 w-4 opacity-60 hover:opacity-100"
                              onClick={e => {
                                e.stopPropagation()
                                setTeacherToDelete(teacher)
                                setShowDeleteDialog(true)
                              }}
                              title={t(
                                'notensammler.deleteTeacherGrades',
                                'Alle Noten für diesen Lehrer löschen',
                              )}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableHead>
                      ))}
                    {/* Second Semester - PM Teachers */}
                    {showSecondSemester &&
                      (!tablePeriod || tablePeriod === 'PM') &&
                      classData.pmTeachers.map(teacher => (
                        <TableHead
                          key={`second-pm-${teacher.id}`}
                          className={`w-16 min-w-16 p-1 text-center ${currentTeacherId === teacher.id ? 'bg-primary/20 font-semibold' : ''}`}
                        >
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-sm whitespace-nowrap [text-orientation:mixed] [writing-mode:vertical-rl]">
                              {teacher.firstName} {teacher.lastName}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="hover:bg-destructive/10 hover:text-destructive h-4 w-4 opacity-60 hover:opacity-100"
                              onClick={e => {
                                e.stopPropagation()
                                setTeacherToDelete(teacher)
                                setShowDeleteDialog(true)
                              }}
                              title={t(
                                'notensammler.deleteTeacherGrades',
                                'Alle Noten für diesen Lehrer löschen',
                              )}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableHead>
                      ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedStudents.map((student, index) => {
                    const firstAvg = calculateAverage(student.id, 'first', tablePeriod)
                    const secondAvg = calculateAverage(student.id, 'second', tablePeriod)
                    // Only highlight missing grades when the logged-in user is a teacher in this class
                    const missingFirstBlock =
                      currentTeacherTeachesClass &&
                      currentSemester === 'first' &&
                      hasMissingInCurrentSemester(student.id)
                    const missingSecondBlock =
                      currentTeacherTeachesClass &&
                      currentSemester === 'second' &&
                      hasMissingInCurrentSemester(student.id)
                    const missingCellClass = 'bg-red-50 dark:bg-red-950/20'
                    return (
                      <TableRow key={student.id}>
                        <TableCell className="bg-background sticky left-0 z-10 w-10 min-w-10 p-1 text-center font-medium">
                          {index + 1}
                        </TableCell>
                        <TableCell className="bg-background sticky left-10 z-10 w-10 min-w-10 p-1 text-center">
                          {student.groupId ?? '-'}
                        </TableCell>
                        <TableCell className="bg-background sticky left-[5rem] z-10 w-[200px] max-w-[200px] font-medium">
                          <StudentPhoto
                            studentId={student.id}
                            firstName={student.firstName}
                            lastName={student.lastName}
                            size={32}
                            nameFormat="lastFirst"
                          />
                        </TableCell>
                        {/* First semester - AM teacher columns */}
                        {showFirstSemester &&
                          (!tablePeriod || tablePeriod === 'AM') &&
                          classData.amTeachers.map(teacher => {
                            const grade = getGrade(student.id, teacher.id, 'first')
                            const isCurrentTeacher = currentTeacherId === teacher.id
                            return (
                              <TableCell
                                key={`first-am-${student.id}-${teacher.id}`}
                                className={`w-16 min-w-16 p-1 ${isCurrentTeacher ? 'bg-primary/10' : ''} ${missingFirstBlock ? missingCellClass : ''}`}
                              >
                                <GradeInput
                                  compact
                                  value={grade}
                                  onChange={value =>
                                    handleGradeChange(student.id, teacher.id, 'first', value)
                                  }
                                />
                              </TableCell>
                            )
                          })}
                        {/* Separator between AM and PM */}
                        {showFirstSemester &&
                          !tablePeriod &&
                          classData.amTeachers.length > 0 &&
                          classData.pmTeachers.length > 0 && (
                            <TableCell
                              className={`border-muted-foreground/30 border-l-2 p-0 ${missingFirstBlock ? missingCellClass : ''}`}
                            ></TableCell>
                          )}
                        {/* First semester - PM teacher columns */}
                        {showFirstSemester &&
                          (!tablePeriod || tablePeriod === 'PM') &&
                          classData.pmTeachers.map(teacher => {
                            const grade = getGrade(student.id, teacher.id, 'first')
                            const isCurrentTeacher = currentTeacherId === teacher.id
                            return (
                              <TableCell
                                key={`first-pm-${student.id}-${teacher.id}`}
                                className={`w-16 min-w-16 p-1 ${isCurrentTeacher ? 'bg-primary/10' : ''} ${missingFirstBlock ? missingCellClass : ''}`}
                              >
                                <GradeInput
                                  compact
                                  value={grade}
                                  onChange={value =>
                                    handleGradeChange(student.id, teacher.id, 'first', value)
                                  }
                                />
                              </TableCell>
                            )
                          })}
                        {/* First semester average */}
                        <TableCell
                          className={`w-14 min-w-14 p-1 text-center font-medium ${missingFirstBlock ? missingCellClass : 'bg-muted'}`}
                        >
                          {firstAvg === null
                            ? '-'
                            : typeof firstAvg === 'string'
                              ? firstAvg
                              : firstAvg.toFixed(1)}
                        </TableCell>
                        {/* First semester Endnote */}
                        <TableCell
                          className={`bg-primary/10 w-14 min-w-14 p-1 ${missingFirstBlock ? missingCellClass : ''}`}
                          title={
                            getFinalGradeDisplay(student.id, 'first') != null
                              ? getGradeDisplayText(getFinalGradeDisplay(student.id, 'first')!)
                              : '-'
                          }
                        >
                          <FinalGradeInput
                            compact
                            value={getFinalGradeDisplay(student.id, 'first')}
                            onChange={value => handleFinalGradeChange(student.id, 'first', value)}
                          />
                        </TableCell>
                        {/* First semester Betragensnote (Wunsch) */}
                        <TableCell
                          className={`bg-primary/5 border-muted-foreground/60 w-[105px] max-w-[105px] min-w-[90px] border-r-4 p-1 ${missingFirstBlock ? missingCellClass : ''}`}
                          title={
                            (finalGrades[student.id]?.conductWishFirst ??
                              CONDUCT_NOTE_WISH_DEFAULT) === CONDUCT_NOTE_WISH_NONE
                              ? '-'
                              : (finalGrades[student.id]?.conductWishFirst ??
                                CONDUCT_NOTE_WISH_DEFAULT)
                          }
                        >
                          <Select
                            value={
                              finalGrades[student.id]?.conductWishFirst ?? CONDUCT_NOTE_WISH_DEFAULT
                            }
                            onValueChange={value =>
                              handleConductWishChange(student.id, 'first', value)
                            }
                          >
                            <SelectTrigger className="h-8 w-full max-w-full min-w-0 truncate text-sm">
                              <SelectValue placeholder="-" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={CONDUCT_NOTE_WISH_NONE}>-</SelectItem>
                              {CONDUCT_NOTE_WISH_OPTIONS.map(opt => (
                                <SelectItem key={opt} value={opt}>
                                  {opt}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        {/* Second semester - AM teacher columns */}
                        {showSecondSemester &&
                          (!tablePeriod || tablePeriod === 'AM') &&
                          classData.amTeachers.map(teacher => {
                            const grade = getGrade(student.id, teacher.id, 'second')
                            const isCurrentTeacher = currentTeacherId === teacher.id
                            return (
                              <TableCell
                                key={`second-am-${student.id}-${teacher.id}`}
                                className={`w-16 min-w-16 p-1 ${isCurrentTeacher ? 'bg-primary/10' : ''} ${missingSecondBlock ? missingCellClass : ''}`}
                              >
                                <GradeInput
                                  compact
                                  value={grade}
                                  onChange={value =>
                                    handleGradeChange(student.id, teacher.id, 'second', value)
                                  }
                                />
                              </TableCell>
                            )
                          })}
                        {/* Separator between AM and PM */}
                        {showSecondSemester &&
                          !tablePeriod &&
                          classData.amTeachers.length > 0 &&
                          classData.pmTeachers.length > 0 && (
                            <TableCell
                              className={`border-muted-foreground/30 border-l-2 p-0 ${missingSecondBlock ? missingCellClass : ''}`}
                            ></TableCell>
                          )}
                        {/* Second semester - PM teacher columns */}
                        {showSecondSemester &&
                          (!tablePeriod || tablePeriod === 'PM') &&
                          classData.pmTeachers.map(teacher => {
                            const grade = getGrade(student.id, teacher.id, 'second')
                            const isCurrentTeacher = currentTeacherId === teacher.id
                            return (
                              <TableCell
                                key={`second-pm-${student.id}-${teacher.id}`}
                                className={`w-16 min-w-16 p-1 ${isCurrentTeacher ? 'bg-primary/10' : ''} ${missingSecondBlock ? missingCellClass : ''}`}
                              >
                                <GradeInput
                                  compact
                                  value={grade}
                                  onChange={value =>
                                    handleGradeChange(student.id, teacher.id, 'second', value)
                                  }
                                />
                              </TableCell>
                            )
                          })}
                        {/* Second semester average */}
                        <TableCell
                          className={`w-14 min-w-14 p-1 text-center font-medium ${missingSecondBlock ? missingCellClass : 'bg-muted'}`}
                        >
                          {secondAvg === null
                            ? '-'
                            : typeof secondAvg === 'string'
                              ? secondAvg
                              : secondAvg.toFixed(1)}
                        </TableCell>
                        {/* Second semester Endnote */}
                        <TableCell
                          className={`bg-primary/10 w-14 min-w-14 p-1 ${missingSecondBlock ? missingCellClass : ''}`}
                          title={
                            getFinalGradeDisplay(student.id, 'second') != null
                              ? getGradeDisplayText(getFinalGradeDisplay(student.id, 'second')!)
                              : '-'
                          }
                        >
                          <FinalGradeInput
                            compact
                            value={getFinalGradeDisplay(student.id, 'second')}
                            onChange={value => handleFinalGradeChange(student.id, 'second', value)}
                          />
                        </TableCell>
                        {/* Second semester Betragensnote (Wunsch) */}
                        <TableCell
                          className={`bg-primary/5 w-[105px] max-w-[105px] min-w-[90px] p-1 ${missingSecondBlock ? missingCellClass : ''}`}
                          title={
                            (finalGrades[student.id]?.conductWishSecond ??
                              CONDUCT_NOTE_WISH_DEFAULT) === CONDUCT_NOTE_WISH_NONE
                              ? '-'
                              : (finalGrades[student.id]?.conductWishSecond ??
                                CONDUCT_NOTE_WISH_DEFAULT)
                          }
                        >
                          <Select
                            value={
                              finalGrades[student.id]?.conductWishSecond ??
                              CONDUCT_NOTE_WISH_DEFAULT
                            }
                            onValueChange={value =>
                              handleConductWishChange(student.id, 'second', value)
                            }
                          >
                            <SelectTrigger className="h-8 w-full max-w-full min-w-0 truncate text-sm">
                              <SelectValue placeholder="-" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={CONDUCT_NOTE_WISH_NONE}>-</SelectItem>
                              {CONDUCT_NOTE_WISH_OPTIONS.map(opt => (
                                <SelectItem key={opt} value={opt}>
                                  {opt}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
            {saving && (
              <div className="text-muted-foreground mt-4 text-sm">
                {t('notensammler.saving', 'Speichere...')}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Password dialog */}
      <Dialog open={showPasswordDialog} onOpenChange={open => setShowPasswordDialog(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('notensammler.nmPasswordTitle', 'Notenmanagement Anmeldung')}
            </DialogTitle>
            <DialogDescription>
              {t(
                'notensammler.nmPasswordDesc',
                'Bitte gib deine Anmeldedaten für Notenmanagement ein.',
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              type="text"
              value={transferUsername}
              onChange={e => setTransferUsername(e.target.value)}
              placeholder={t('notensammler.username', 'Benutzername')}
              autoComplete="username"
            />
            <Input
              type="password"
              value={transferPassword}
              onChange={e => setTransferPassword(e.target.value)}
              placeholder={t('notensammler.password', 'Passwort')}
              autoComplete="current-password"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPasswordDialog(false)}>
              {t('common.cancel', 'Abbrechen')}
            </Button>
            <Button
              onClick={() => {
                setShowPasswordDialog(false)
                setShowSemesterDialog(true)
              }}
              disabled={!transferUsername || !transferPassword}
            >
              {t('common.continue', 'Weiter')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Semester dialog */}
      <Dialog open={showSemesterDialog} onOpenChange={open => setShowSemesterDialog(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('notensammler.nmSemesterTitle', 'Semester auswählen')}</DialogTitle>
            <DialogDescription>
              {t('notensammler.nmSemesterDesc', 'Welches Semester möchtest du übertragen?')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSemesterDialog(false)}>
              {t('common.cancel', 'Abbrechen')}
            </Button>
            <Button
              onClick={() => {
                setTransferSemester('first')
                setShowSemesterDialog(false)
                void fetchTransferPreview('first')
              }}
              disabled={previewLoading}
            >
              {previewLoading ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  {t('notensammler.loading', 'Lade...')}
                </>
              ) : (
                t('notensammler.firstSemester', '1. Semester')
              )}
            </Button>
            <Button
              onClick={() => {
                setTransferSemester('second')
                setShowSemesterDialog(false)
                void fetchTransferPreview('second')
              }}
              disabled={previewLoading}
            >
              {previewLoading ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  {t('notensammler.loading', 'Lade...')}
                </>
              ) : (
                t('notensammler.secondSemester', '2. Semester')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview dialog */}
      <Dialog open={showPreviewDialog} onOpenChange={open => setShowPreviewDialog(open)}>
        <DialogContent className="max-h-[80vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {t('notensammler.nmPreviewTitle', 'Vorschau: Übertragung an Notenmanagement')}
            </DialogTitle>
            {previewData && (
              <DialogDescription className="whitespace-pre-line">
                {t('notensammler.nmPreviewMeta', 'Klasse')}: {previewData.className} ·{' '}
                {t('notensammler.subject', 'Fach')}: {previewData.subjectTruncated} ·{' '}
                {t('notensammler.teachers', 'Lehrer')}: {previewData.teacherCount}
                {previewData.counts.unmatchedCompleteStudents > 0
                  ? `\n${t('notensammler.nmUnmatchedWarning', 'Unmatched Schüler werden nicht übertragen.')}`
                  : ''}
              </DialogDescription>
            )}
          </DialogHeader>

          {previewLoading && (
            <div className="flex items-center justify-center py-8">
              <Spinner size="lg" />
            </div>
          )}

          {previewData && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('notensammler.student', 'Schüler')}</TableHead>
                    <TableHead className="w-32">{t('notensammler.grade', 'Note')}</TableHead>
                    <TableHead className="w-40">
                      {t('notensammler.matrikelnummer', 'Matrikelnummer')}
                    </TableHead>
                    <TableHead className="w-28">{t('notensammler.match', 'Match')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewData.students.map(s => {
                    const noteValue: EditableNote =
                      editedNotes[s.studentId] ?? s.note ?? s.nullNoteLabel ?? 'Nicht beurteilt'
                    return (
                      <TableRow key={s.studentId}>
                        <TableCell>
                          {s.lastName}, {s.firstName}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={typeof noteValue === 'number' ? String(noteValue) : noteValue}
                            onValueChange={v => {
                              const n: EditableNote =
                                v === 'Nicht beurteilt' || v === 'Gestundet'
                                  ? v
                                  : (parseInt(v, 10) as 1 | 2 | 3 | 4 | 5)
                              setEditedNotes(prev => ({ ...prev, [s.studentId]: n }))
                            }}
                          >
                            <SelectTrigger className="w-40">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">1</SelectItem>
                              <SelectItem value="2">2</SelectItem>
                              <SelectItem value="3">3</SelectItem>
                              <SelectItem value="4">4</SelectItem>
                              <SelectItem value="5">5</SelectItem>
                              <SelectItem value="Nicht beurteilt">Nicht beurteilt</SelectItem>
                              <SelectItem value="Gestundet">Gestundet</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>{s.matrikelnummer ?? '-'}</TableCell>
                        <TableCell>
                          {s.matched ? (
                            <span className="font-medium text-green-600">✓</span>
                          ) : (
                            <span className="font-medium text-red-600">✗</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {previewData?.nmStudentsWithoutGradeOrMatch &&
            previewData.nmStudentsWithoutGradeOrMatch.length > 0 && (
              <div className="mt-6">
                <h3 className="mb-2 text-sm font-semibold">
                  {t(
                    'notensammler.nmStudentsWithoutGradeOrMatch',
                    'Schüler in Notenmanagement ohne Zuordnung oder Note',
                  )}
                </h3>
                <div className="max-h-48 overflow-y-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-24">
                          {t('notensammler.matrikelnummer', 'Matr.')}
                        </TableHead>
                        <TableHead>{t('notensammler.lastName', 'Nachname')}</TableHead>
                        <TableHead>{t('notensammler.firstName', 'Vorname')}</TableHead>
                        <TableHead className="w-24">{t('notensammler.class', 'Klasse')}</TableHead>
                        <TableHead className="w-32">{t('notensammler.grade', 'Note')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewData.nmStudentsWithoutGradeOrMatch.map(nm => {
                        const noteValue = editedNotesNmOnly[nm.Matrikelnummer] ?? null
                        return (
                          <TableRow key={nm.Matrikelnummer}>
                            <TableCell className="font-mono text-xs">{nm.Matrikelnummer}</TableCell>
                            <TableCell>{nm.Nachname}</TableCell>
                            <TableCell>{nm.Vorname}</TableCell>
                            <TableCell>{nm.Klasse ?? '-'}</TableCell>
                            <TableCell>
                              <Select
                                value={noteValue === null ? 'keine' : String(noteValue)}
                                onValueChange={v => {
                                  const n =
                                    v === 'keine' ? null : (parseInt(v, 10) as 1 | 2 | 3 | 4 | 5)
                                  setEditedNotesNmOnly(prev => ({
                                    ...prev,
                                    [nm.Matrikelnummer]: n,
                                  }))
                                }}
                              >
                                <SelectTrigger className="w-32">
                                  <SelectValue
                                    placeholder={t('notensammler.keineNote', 'Keine Note')}
                                  />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="keine">
                                    {t('notensammler.keineNote', 'Keine Note')}
                                  </SelectItem>
                                  <SelectItem value="1">1</SelectItem>
                                  <SelectItem value="2">2</SelectItem>
                                  <SelectItem value="3">3</SelectItem>
                                  <SelectItem value="4">4</SelectItem>
                                  <SelectItem value="5">5</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreviewDialog(false)}>
              {t('common.cancel', 'Abbrechen')}
            </Button>
            <Button
              onClick={() => void submitTransfer()}
              disabled={transferLoading || !previewData}
            >
              {transferLoading ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  {t('notensammler.transferring', 'Übertrage...')}
                </>
              ) : previewData?.transferStatus &&
                ((previewData.semester === 'first' &&
                  previewData.transferStatus.first.transferred) ||
                  (previewData.semester === 'second' &&
                    previewData.transferStatus.second.transferred)) ? (
                t('notensammler.updateTransfer', 'Aktualisieren')
              ) : (
                t('notensammler.transferNow', 'Jetzt übertragen')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Result dialog */}
      <Dialog
        open={showResultDialog}
        onOpenChange={open => {
          setShowResultDialog(open)
          if (!open) {
            setTransferPassword('')
            setTransferSemester(null)
            setPreviewData(null)
            setEditedNotes({})
          }
        }}
      >
        <DialogContent className="max-h-[80vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {transferResult?.success
                ? t('notensammler.nmSuccessTitle', 'Übertragung erfolgreich')
                : t('notensammler.nmErrorTitle', 'Übertragung fehlgeschlagen')}
            </DialogTitle>
            <DialogDescription className="whitespace-pre-line">
              {transferResult?.success && transferResult
                ? `${t('notensammler.nmLfId', 'LF_ID')}: ${transferResult.lfId}\n${t('notensammler.nmSent', 'Übertragen')}: ${transferResult.sentCount}`
                : (error ?? t('notensammler.nmUnknownError', 'Unbekannter Fehler'))}
            </DialogDescription>
          </DialogHeader>

          {transferResult?.success && !!transferResult.confirmation && (
            <div className="bg-muted rounded-md border p-4">
              <h3 className="mb-3 text-sm font-semibold">
                {t('notensammler.nmConfirmation', 'Übertragene Noten')}
              </h3>
              {Array.isArray(transferResult.confirmation) &&
              transferResult.confirmation.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-20">
                          {t('notensammler.matrikelnummer', 'Matr.')}
                        </TableHead>
                        <TableHead>{t('notensammler.lastName', 'Nachname')}</TableHead>
                        <TableHead>{t('notensammler.firstName', 'Vorname')}</TableHead>
                        <TableHead className="w-16 text-center">
                          {t('notensammler.note', 'Note')}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(
                        transferResult.confirmation as Array<{
                          Matrikelnummer: number
                          Nachname: string
                          Vorname: string
                          Note: number | null
                          Punkte: number
                          Kommentar: string
                        }>
                      ).map((student, idx) => {
                        const noteDisplay =
                          student.Note != null
                            ? String(student.Note)
                            : student.Kommentar === 'Nicht beurteilt' ||
                                student.Kommentar === 'Gestundet'
                              ? student.Kommentar
                              : t('notensammler.keineNote', 'Keine Note')
                        return (
                          <TableRow key={student.Matrikelnummer ?? idx}>
                            <TableCell className="font-mono text-xs">
                              {student.Matrikelnummer}
                            </TableCell>
                            <TableCell>{student.Nachname}</TableCell>
                            <TableCell>{student.Vorname}</TableCell>
                            <TableCell className="text-center font-semibold">
                              {noteDisplay}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-muted-foreground text-sm">
                  <pre className="whitespace-pre-wrap">
                    {JSON.stringify(transferResult.confirmation, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setShowResultDialog(false)}>
              {t('common.close', 'Schließen')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* LF View Password Dialog */}
      <Dialog
        open={showLfViewPasswordDialog}
        onOpenChange={open => setShowLfViewPasswordDialog(open)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('notensammler.nmPasswordTitle', 'Notenmanagement Anmeldung')}
            </DialogTitle>
            <DialogDescription>
              {t(
                'notensammler.nmPasswordDesc',
                'Bitte gib deine Anmeldedaten für Notenmanagement ein.',
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              type="text"
              value={lfViewUsername}
              onChange={e => setLfViewUsername(e.target.value)}
              placeholder={t('notensammler.username', 'Benutzername')}
              autoComplete="username"
            />
            <Input
              type="password"
              value={lfViewPassword}
              onChange={e => setLfViewPassword(e.target.value)}
              placeholder={t('notensammler.password', 'Passwort')}
              autoComplete="current-password"
              onKeyDown={e => {
                if (e.key === 'Enter' && lfViewUsername && lfViewPassword && !lfViewLoading) {
                  void fetchLfData()
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLfViewPasswordDialog(false)}>
              {t('common.cancel', 'Abbrechen')}
            </Button>
            <Button
              onClick={() => void fetchLfData()}
              disabled={!lfViewUsername || !lfViewPassword || lfViewLoading}
            >
              {lfViewLoading ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  {t('notensammler.loading', 'Lade...')}
                </>
              ) : (
                t('common.continue', 'Weiter')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* LF View Dialog */}
      <Dialog open={showLfViewDialog} onOpenChange={open => setShowLfViewDialog(open)}>
        <DialogContent className="max-h-[80vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {t('notensammler.lfViewTitle', 'LF Daten')} {selectedLfId && `(LF: ${selectedLfId})`}
            </DialogTitle>
            <DialogDescription>
              {t('notensammler.lfViewDesc', 'Übertragene Noten aus Notenmanagement')}
            </DialogDescription>
          </DialogHeader>

          {lfViewData && Array.isArray(lfViewData) && lfViewData.length > 0 ? (
            <div className="bg-muted rounded-md border p-4">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">
                        {t('notensammler.matrikelnummer', 'Matr.')}
                      </TableHead>
                      <TableHead>{t('notensammler.lastName', 'Nachname')}</TableHead>
                      <TableHead>{t('notensammler.firstName', 'Vorname')}</TableHead>
                      <TableHead className="w-16 text-center">
                        {t('notensammler.note', 'Note')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lfViewData.map((student, idx) => (
                      <TableRow key={student.Matrikelnummer ?? idx}>
                        <TableCell className="font-mono text-xs">
                          {student.Matrikelnummer}
                        </TableCell>
                        <TableCell>{student.Nachname}</TableCell>
                        <TableCell>{student.Vorname}</TableCell>
                        <TableCell className="text-center font-semibold">{student.Note}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : (
            <div className="text-muted-foreground text-sm">
              {t('notensammler.noData', 'Keine Daten verfügbar')}
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setShowLfViewDialog(false)}>
              {t('common.close', 'Schließen')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Teacher Grades Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('notensammler.deleteTeacherGradesTitle', 'Noten löschen')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {teacherToDelete && (
                <>
                  {t(
                    'notensammler.deleteTeacherGradesConfirm',
                    'Möchtest du wirklich alle Noten für',
                  )}{' '}
                  <strong>
                    {teacherToDelete.firstName} {teacherToDelete.lastName}
                  </strong>{' '}
                  {t('notensammler.deleteTeacherGradesConfirm2', 'löschen?')}
                  <br />
                  <br />
                  {t(
                    'notensammler.deleteTeacherGradesWarning',
                    'Diese Aktion kann nicht rückgängig gemacht werden. Alle Noten für diesen Lehrer in dieser Klasse werden dauerhaft gelöscht.',
                  )}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {t('common.cancel', 'Abbrechen')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void deleteTeacherGrades()}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  {t('notensammler.deleting', 'Lösche...')}
                </>
              ) : (
                t('notensammler.delete', 'Löschen')
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
