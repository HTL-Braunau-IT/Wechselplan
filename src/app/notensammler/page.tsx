'use client'

import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertCircle,
  ArrowRight,
  ClipboardList,
  Download,
  FileText,
  Grid3x3,
  Info,
  Keyboard,
  MoreHorizontal,
  Trash2,
  Upload,
  UserRound,
  Users,
  UsersRound,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Hint } from '@/components/hint'
import { SaveStatus } from '@/components/save-status'
import { useUnsavedWarning } from '@/hooks/use-unsaved-warning'
import { captureFrontendError } from '@/lib/frontend-error'
import { truncateSubject } from '@/lib/subject-utils'
import { cn } from '@/lib/utils'
import type { Semester } from '@/lib/grades'
import type { Period, SemesterView, Teacher } from './_lib/types'
import { useNotensammlerData } from './_hooks/use-notensammler-data'
import { useGradeEditing } from './_hooks/use-grade-editing'
import { useNotenlisteSuggestions } from './_hooks/use-notenliste-suggestions'
import { useSokrates } from './_hooks/use-sokrates'
import { useSokratesChanges } from './_hooks/use-sokrates-changes'
import { useTransferFlow } from './_hooks/use-transfer-flow'
import { useLfView } from './_hooks/use-lf-view'
import { usePdfDownload } from './_hooks/use-pdf-download'
import { ClassPicker } from './_components/class-picker'
import { PeriodTabs } from './_components/period-tabs'
import { EntryRoster } from './_components/entry-roster'
import { GradeTable } from './_components/grade-table'
import { SokratesPanel } from './_components/sokrates-panel'
import { SokratesChangesPanel } from './_components/sokrates-changes-panel'
import { TransferDialogs } from './_components/transfer-dialogs'
import { NmCredentialsDialog } from './_components/nm-credentials-dialog'
import { LfViewDialog } from './_components/lf-view-dialog'
import { DeleteTeacherDialog } from './_components/delete-teacher-dialog'

/**
 * Notensammler — grade collection for teachers.
 *
 * The screen is a focused single-teacher input mode ("Eingabemodus"): pick a
 * class, enter your own Teilnote for one subject one student at a time, and
 * transfer the result to Notenmanagement. The roster splits into students who
 * still owe a mark (Offen) and those already graded (Erledigt); the full
 * all-teachers grid is still available on demand ("Gesamtraster"). Data loading,
 * grade editing, the transfer wizard and the LF read-back each live in their own
 * hook; this file wires them to the presentational components.
 */
export default function NotensammlerPage() {
  const { t } = useTranslation()

  const {
    classes,
    selectedClassId,
    handleClassChange,
    classData,
    grades,
    setGrades,
    finalGrades,
    setFinalGrades,
    teacherClasses,
    refreshTeacherClasses,
    refreshClassData,
    currentTeacherId,
    ungroupedStudentCount,
    loading,
    error,
    setError,
    notice,
    setNotice,
    schoolYearId,
    currentSemester,
  } = useNotensammlerData()

  // Null until the teacher picks: the screen opens on the semester the school is
  // actually in, rather than on a double-width both-semesters view.
  const [semesterChoice, setSemesterChoice] = useState<SemesterView | null>(null)
  const semesterView: SemesterView = semesterChoice ?? currentSemester ?? 'both'

  const [periodTab, setPeriodTab] = useState<Period>('AM')
  const [teacherToDelete, setTeacherToDelete] = useState<Teacher | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [showFullGrid, setShowFullGrid] = useState(false)

  const suggestions = useNotenlisteSuggestions(selectedClassId, schoolYearId)

  const sokrates = useSokrates({ classId: classData?.id, schoolYearId, setError })
  const { refresh: refreshSokrates } = sokrates

  // The "what changed" rundown for the open class. Acknowledging clears the
  // drift rings, so it re-reads the Sokrates status afterwards.
  const sokratesChanges = useSokratesChanges({
    classId: classData?.id,
    schoolYearId,
    setError,
    onAfterAcknowledge: () => void refreshSokrates(),
  })

  const {
    savingAll,
    saveState,
    hasUnsavedWork,
    handleGradeChange,
    getGrade,
    calculateAverage,
    getFinalGradeDisplay,
    handleFinalGradeChange,
    handleConductWishChange,
    saveAllGrades,
  } = useGradeEditing({
    classData,
    schoolYearId,
    grades,
    setGrades,
    finalGrades,
    setFinalGrades,
    setError,
    setNotice,
    refreshTeacherClasses,
    refreshSokrates,
    // When an admin has the override on, grade writes carry the flag so the
    // server lets them through the Sokrates lock too.
    adminOverride: sokrates.isAdmin && sokrates.adminOverride,
  })

  // Marks autosave half a second after they are typed; closing the tab inside
  // that window used to drop them without a word.
  useUnsavedWarning(hasUnsavedWork)

  const transfer = useTransferFlow({
    classData,
    schoolYearId,
    currentSemester,
    setError,
    refreshClassData,
  })
  const lfView = useLfView({ setError })
  const { downloadingPdf, downloadingAllPdf, downloadClassPdf, downloadAllClassesPdf } =
    usePdfDownload({
      selectedClassId,
      className: classData?.name,
      schoolYearId,
      setError,
    })

  const currentTeacherTeachesClass =
    classData != null &&
    currentTeacherId != null &&
    (classData.amTeachers.some(teacher => teacher.id === currentTeacherId) ||
      classData.pmTeachers.some(teacher => teacher.id === currentTeacherId))

  /** With separate AM/PM subjects the screen shows one period at a time. */
  const tablePeriod: Period | undefined = classData?.hasSeparateAmPmSubjects ? periodTab : undefined

  /** The signed-in teacher's own Teacher record, for "my column" actions. */
  const myTeacher = useMemo<Teacher | null>(() => {
    if (!classData || currentTeacherId == null) return null
    return (
      [...classData.amTeachers, ...classData.pmTeachers].find(
        teacher => teacher.id === currentTeacherId,
      ) ?? null
    )
  }, [classData, currentTeacherId])

  const visibleTeachers = useMemo(() => {
    if (!classData) return []
    if (tablePeriod === 'AM') return classData.amTeachers
    if (tablePeriod === 'PM') return classData.pmTeachers
    return [...classData.amTeachers, ...classData.pmTeachers]
  }, [classData, tablePeriod])

  const hasMissingInCurrentSemester = useCallback(
    (studentId: number): boolean => {
      if (currentSemester === null) return false
      return visibleTeachers.some(
        teacher => getGrade(studentId, teacher.id, currentSemester) === null,
      )
    },
    [currentSemester, visibleTeachers, getGrade],
  )

  // Only grouped students take part in a rotation, so only they are gradeable.
  // Alphabetical; the Offen/Erledigt split is done inside the roster.
  const sortedStudents = useMemo(() => {
    if (!classData) return []
    return [...classData.students]
      .filter(student => student.groupId !== null && student.groupId !== undefined)
      .sort((a, b) => {
        const lastNameCompare = a.lastName.localeCompare(b.lastName)
        if (lastNameCompare !== 0) return lastNameCompare
        return a.firstName.localeCompare(b.firstName)
      })
  }, [classData])

  /** Entry always targets a single semester; "Beide" falls back to the live one. */
  const entrySemester: Semester =
    semesterView === 'both' ? (currentSemester ?? 'first') : semesterView

  const myProgress = useMemo(() => {
    if (currentTeacherId == null) return null
    if (!visibleTeachers.some(teacher => teacher.id === currentTeacherId)) return null
    const entered = sortedStudents.filter(
      student => grades[student.id]?.[currentTeacherId]?.[entrySemester] != null,
    ).length
    return { entered, total: sortedStudents.length }
  }, [currentTeacherId, visibleTeachers, sortedStudents, grades, entrySemester])

  const deleteTeacherGrades = useCallback(async () => {
    if (!teacherToDelete || !classData) return
    try {
      setDeleting(true)
      setError(null)

      const yearParam = schoolYearId != null ? `&schoolYearId=${schoolYearId}` : ''
      const response = await fetch(
        `/api/notensammler/grades?teacherId=${teacherToDelete.id}&classId=${classData.id}${yearParam}`,
        { method: 'DELETE' },
      )
      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string }
        throw new Error(errorData.error ?? 'Failed to delete grades')
      }

      setGrades(prev => {
        const next = { ...prev }
        for (const studentKey of Object.keys(next)) {
          const studentId = Number(studentKey)
          const studentGrades = next[studentId]
          if (studentGrades?.[teacherToDelete.id]) {
            delete studentGrades[teacherToDelete.id]
            if (Object.keys(studentGrades).length === 0) delete next[studentId]
          }
        }
        return next
      })

      setTeacherToDelete(null)
      // The class chips and the Sokrates drift markers both counted those rows.
      await refreshTeacherClasses()
      void refreshSokrates()
    } catch (e) {
      captureFrontendError(e, { location: 'notensammler', type: 'delete-teacher-grades' })
      setError(e instanceof Error ? e.message : 'Failed to delete grades')
    } finally {
      setDeleting(false)
    }
  }, [
    teacherToDelete,
    classData,
    schoolYearId,
    setError,
    setGrades,
    refreshTeacherClasses,
    refreshSokrates,
  ])

  /** Prefill each still-empty Endnote from the rounded semester average. */
  const suggestEndnotenFromAverage = useCallback(() => {
    for (const student of sortedStudents) {
      if (finalGrades[student.id]?.[entrySemester] != null) continue
      const average = calculateAverage(student.id, entrySemester, tablePeriod)
      if (typeof average !== 'number') continue
      handleFinalGradeChange(student.id, entrySemester, String(Math.round(average)))
    }
  }, [
    sortedStudents,
    finalGrades,
    entrySemester,
    calculateAverage,
    tablePeriod,
    handleFinalGradeChange,
  ])

  const subjectLabel = classData?.hasSeparateAmPmSubjects
    ? null
    : classData?.subjectName
      ? truncateSubject(classData.subjectName)
      : null

  const semesterLabel = (semester: Semester) =>
    semester === 'first'
      ? t('notensammler.firstSemester', '1. Semester')
      : t('notensammler.secondSemester', '2. Semester')

  const transferredLfs = (['first', 'second'] as const)
    .map(semester => ({ semester, lfId: classData?.transferStatus?.[semester]?.lfId }))
    .filter((entry): entry is { semester: Semester; lfId: string } => Boolean(entry.lfId))

  const exporting = downloadingPdf || downloadingAllPdf
  const periodLabel =
    tablePeriod === 'PM'
      ? t('notensammler.nachmittag', 'Nachmittag')
      : t('notensammler.vormittag', 'Vormittag')

  const total = myProgress?.total ?? sortedStudents.length
  const entered = myProgress?.entered ?? 0
  const offen = Math.max(0, total - entered)
  const percent = total > 0 ? Math.round((entered / total) * 100) : 0

  return (
    <TooltipProvider delayDuration={200}>
      <PageContainer size="wide" className="space-y-4">
        <PageHeader
          icon={ClipboardList}
          title={t('notensammler.title', 'Notensammler')}
          description={t(
            'notensammler.subtitle',
            'Noten je Lehrer erfassen und an das Notenmanagement übertragen.',
          )}
        />

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-start justify-between gap-4">
              <span className="whitespace-pre-line">{error}</span>
              <Button variant="outline" size="sm" className="shrink-0" onClick={() => setError(null)}>
                {t('common.close', 'Schließen')}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {notice && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="flex items-start justify-between gap-4">
              <span className="whitespace-pre-line">{notice}</span>
              <Button variant="outline" size="sm" className="shrink-0" onClick={() => setNotice(null)}>
                {t('common.close', 'Schließen')}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <ClassPicker
          classes={classes}
          teacherClasses={teacherClasses}
          selectedClassId={selectedClassId}
          onSelect={handleClassChange}
        />

        {loading && (
          <div className="flex min-h-[240px] items-center justify-center">
            <Spinner size="lg" />
          </div>
        )}

        {!loading && !classData && (
          <EmptyState
            icon={ClipboardList}
            title={t('notensammler.noClassSelectedTitle', 'Keine Klasse ausgewählt')}
            description={t(
              'notensammler.noClassSelectedDesc',
              'Wähle oben eine deiner Klassen, um Noten zu erfassen.',
            )}
          />
        )}

        {classData && !loading && (
          <div className="border-border bg-background overflow-hidden rounded-lg border shadow-sm">
            {/* Top bar: the class in view + the finished-list actions. */}
            <div className="border-border bg-card flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-5 py-3">
              <span className="flex items-center gap-2 text-primary">
                <ClipboardList className="h-5 w-5" aria-hidden />
                <span className="text-foreground text-base font-semibold tracking-tight">
                  {classData.name}
                </span>
              </span>
              {subjectLabel && <Badge variant="secondary">{subjectLabel}</Badge>}
              {classData.classLead && (
                <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
                  <UserRound className="h-3.5 w-3.5" />
                  {classData.classLead}
                </span>
              )}
              <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
                <Users className="h-3.5 w-3.5" />
                {t('notensammler.studentCount', '{{count}} Schüler', { count: sortedStudents.length })}
              </span>

              <span className="ml-auto flex items-center gap-2">
                <SaveStatus state={saveState} />
                <Hint
                  label={t(
                    'notensammler.tooltipTransfer',
                    'Überträgt die Noten an das Notenmanagement.',
                  )}
                >
                  <Button variant="secondary" size="sm" onClick={transfer.open}>
                    <Upload className="mr-2 h-4 w-4" />
                    {t('notensammler.transferShort', 'Übertragen')}
                  </Button>
                </Hint>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label={t('notensammler.moreActions', 'Weitere Aktionen')}
                    >
                      {exporting ? (
                        <Spinner size="sm" />
                      ) : (
                        <MoreHorizontal className="h-4 w-4" />
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-72">
                    <DropdownMenuItem onSelect={() => void saveAllGrades()} disabled={savingAll}>
                      <Download className="mr-2 h-4 w-4" />
                      {t('notensammler.saveAll', 'Alle speichern')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void downloadClassPdf()} disabled={exporting}>
                      <FileText className="mr-2 h-4 w-4" />
                      {t('notensammler.downloadPdfItem', 'Notenliste dieser Klasse')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => void downloadAllClassesPdf()}
                      disabled={exporting || teacherClasses.length === 0}
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      {t('notensammler.downloadAllPdfItem', 'Notenliste aller eigenen Klassen')}
                    </DropdownMenuItem>
                    {transferredLfs.length > 0 && (
                      <>
                        <DropdownMenuSeparator />
                        {transferredLfs.map(({ semester, lfId }) => (
                          <DropdownMenuItem key={semester} onSelect={() => lfView.open(lfId)}>
                            <Upload className="mr-2 h-4 w-4" />
                            {t('notensammler.viewLf', 'Übertragene Noten ansehen')} ({semesterLabel(
                              semester,
                            )})
                          </DropdownMenuItem>
                        ))}
                      </>
                    )}
                    {myTeacher && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => setTeacherToDelete(myTeacher)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {t('notensammler.deleteMyGrades', 'Meine Noten für diese Klasse löschen')}
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </span>
            </div>

            {/* Subject + semester bar. */}
            <div className="border-border bg-card flex flex-wrap items-center gap-x-4 gap-y-3 border-b px-5 py-2.5">
              {classData.hasSeparateAmPmSubjects && (
                <PeriodTabs
                  value={periodTab}
                  onValueChange={setPeriodTab}
                  subjectNameAm={classData.subjectNameAm}
                  subjectNamePm={classData.subjectNamePm}
                  showCompletion={false}
                  completion={{ amFirst: null, amSecond: null, pmFirst: null, pmSecond: null }}
                />
              )}

              <Tabs
                value={semesterView}
                onValueChange={value => setSemesterChoice(value as SemesterView)}
                className="ml-auto"
              >
                <TabsList>
                  {(['first', 'second'] as const).map(semester => (
                    <TabsTrigger key={semester} value={semester}>
                      {semester === 'first'
                        ? t('notensammler.firstSemesterShort', '1. Sem')
                        : t('notensammler.secondSemesterShort', '2. Sem')}
                      {currentSemester === semester && (
                        <span
                          role="img"
                          aria-label={t('notensammler.currentSemesterLabel', 'Aktuelles Semester')}
                          className="bg-primary ml-1.5 h-1.5 w-1.5 rounded-full"
                        />
                      )}
                    </TabsTrigger>
                  ))}
                  <TabsTrigger value="both">{t('notensammler.bothSemesters', 'Beide')}</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* Sokrates status + drift, unchanged behaviour. */}
            {(sokrates.status.first.marked ||
              sokrates.status.second.marked ||
              sokrates.canManage ||
              sokratesChanges.changes.length > 0) && (
              <div className="border-border space-y-3 border-b px-5 py-3">
                <SokratesPanel
                  status={sokrates.status}
                  canManage={sokrates.canManage}
                  isAdmin={sokrates.isAdmin}
                  adminOverride={sokrates.adminOverride}
                  onToggleAdminOverride={() => sokrates.setAdminOverride(prev => !prev)}
                  busy={sokrates.busy}
                  onMark={semester => void sokrates.mark(semester)}
                  onUnmark={semester => void sokrates.unmark(semester)}
                  onSetLockAll={(semester, locked) => void sokrates.setLockAll(semester, locked)}
                />
                <SokratesChangesPanel
                  changes={sokratesChanges.changes}
                  canAcknowledge={sokratesChanges.canAcknowledge}
                  busy={sokratesChanges.busy}
                  onAcknowledge={() => void sokratesChanges.acknowledge()}
                />
              </div>
            )}

            {/* Summary bar: what's left, and how to fly through it. */}
            {myProgress && (
              <div className="border-border bg-card flex flex-wrap items-center gap-x-6 gap-y-3 border-b px-5 py-4">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <span className="flex flex-wrap items-baseline gap-2">
                    <span className="text-2xl font-semibold tracking-tight tabular-nums">
                      {t('notensammler.progressMissing', '{{count}} offen', { count: offen })}
                    </span>
                    <span className="text-muted-foreground text-sm">
                      {t('notensammler.summaryOf', 'von {{total}}', { total })} · {classData.name}
                      {subjectLabel ? ` · ${subjectLabel}` : ''} · {semesterLabel(entrySemester)}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2.5">
                    <span className="bg-muted block h-1.5 w-56 overflow-hidden rounded-full">
                      <span
                        className={cn(
                          'block h-full rounded-full',
                          offen === 0 ? 'bg-success' : 'bg-primary',
                        )}
                        style={{ width: `${percent}%` }}
                      />
                    </span>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {t('notensammler.enteredCount', '{{entered}} von {{total}} eingetragen', {
                        entered,
                        total,
                      })}
                      {myTeacher && (
                        <>
                          {' · '}
                          {t('notensammler.yourColumn', 'deine Spalte')}: {myTeacher.lastName}
                          {classData.hasSeparateAmPmSubjects ? `, ${periodLabel}` : ''}
                        </>
                      )}
                    </span>
                  </span>
                </div>

                {currentTeacherTeachesClass && (
                  <span className="bg-muted/40 border-border text-muted-foreground ml-auto flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs">
                    <Keyboard className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span>
                      <strong className="text-foreground font-semibold">1–5</strong>{' '}
                      {t('notensammler.hintType', 'tippen')} ·{' '}
                      <strong className="text-foreground font-semibold">Tab</strong>{' '}
                      {t('notensammler.hintTab', 'Vorschlag übernehmen')} ·{' '}
                      <strong className="text-foreground font-semibold">Enter</strong>{' '}
                      {t('notensammler.hintEnter', 'nächster offener Schüler')}
                    </span>
                  </span>
                )}
              </div>
            )}

            {ungroupedStudentCount > 0 && (
              <p className="text-muted-foreground border-border flex items-center gap-2 border-b px-5 py-2.5 text-xs">
                <UsersRound className="h-3.5 w-3.5 shrink-0" />
                {t(
                  'notensammler.ungroupedHint',
                  '{{count}} Schüler ohne Gruppe werden nicht angezeigt — sie nehmen an keinem Turnus teil.',
                  { count: ungroupedStudentCount },
                )}
              </p>
            )}

            <div className="p-4">
              {sortedStudents.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title={t('notensammler.noStudentsTitle', 'Keine Schüler in dieser Klasse')}
                  description={t(
                    'notensammler.noStudentsDesc',
                    'Für dieses Schuljahr sind keine Schüler mit Gruppe zugeordnet.',
                  )}
                />
              ) : (
                <EntryRoster
                  classData={classData}
                  students={sortedStudents}
                  finalGrades={finalGrades}
                  suggestions={suggestions}
                  myTeacherId={currentTeacherId}
                  currentTeacherTeachesClass={currentTeacherTeachesClass}
                  currentSemester={currentSemester}
                  semesterView={semesterView}
                  tablePeriod={tablePeriod}
                  getGrade={getGrade}
                  getFinalGradeDisplay={getFinalGradeDisplay}
                  calculateAverage={calculateAverage}
                  onGradeChange={handleGradeChange}
                  onFinalGradeChange={handleFinalGradeChange}
                  onConductWishChange={handleConductWishChange}
                  canManageSokrates={sokrates.canManageEffective}
                  isSemesterLocked={sokrates.isSemesterLocked}
                  isCellLocked={sokrates.isCellLocked}
                />
              )}
            </div>

            {/* Footer: context and the two bulk shortcuts. */}
            <div className="border-border bg-background flex flex-wrap items-center gap-x-5 gap-y-3 border-t px-5 py-3">
              <span className="ml-auto flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowFullGrid(true)}>
                  <Grid3x3 className="mr-2 h-4 w-4" />
                  {t('notensammler.openFullGrid', 'Ganzes Raster aller Lehrer öffnen')}
                </Button>
                {currentTeacherTeachesClass && (
                  <Button variant="outline" size="sm" onClick={suggestEndnotenFromAverage}>
                    <ArrowRight className="mr-2 h-4 w-4" />
                    {t('notensammler.suggestEndnoten', 'Endnoten aus Ø vorschlagen')}
                  </Button>
                )}
              </span>
            </div>
          </div>
        )}

        {/* The full all-teachers grid, on demand. */}
        {classData && (
          <Dialog open={showFullGrid} onOpenChange={setShowFullGrid}>
            <DialogContent className="max-w-[95vw] sm:max-w-[95vw]">
              <DialogHeader>
                <DialogTitle>
                  {t('notensammler.fullGridTitle', 'Gesamtraster · {{name}}', {
                    name: classData.name,
                  })}
                </DialogTitle>
              </DialogHeader>
              <GradeTable
                classData={classData}
                students={sortedStudents}
                finalGrades={finalGrades}
                currentTeacherId={currentTeacherId}
                currentTeacherTeachesClass={currentTeacherTeachesClass}
                currentSemester={currentSemester}
                semesterView={semesterView}
                tablePeriod={tablePeriod}
                getGrade={getGrade}
                getFinalGradeDisplay={getFinalGradeDisplay}
                calculateAverage={calculateAverage}
                hasMissingInCurrentSemester={hasMissingInCurrentSemester}
                onGradeChange={handleGradeChange}
                onFinalGradeChange={handleFinalGradeChange}
                onConductWishChange={handleConductWishChange}
                onDeleteTeacher={setTeacherToDelete}
                canManageSokrates={sokrates.canManageEffective}
                isSemesterMarked={semester => sokrates.status[semester].marked}
                isSemesterLocked={sokrates.isSemesterLocked}
                isCellLocked={sokrates.isCellLocked}
                isCellDrifted={sokrates.isCellDrifted}
                onToggleColumnLock={(teacherId, semester, locked) =>
                  void sokrates.setLockTeacher(semester, teacherId, locked)
                }
              />
            </DialogContent>
          </Dialog>
        )}

        <TransferDialogs {...transfer} />

        <NmCredentialsDialog
          open={lfView.showPasswordDialog}
          onOpenChange={lfView.setShowPasswordDialog}
          username={lfView.username}
          onUsernameChange={lfView.setUsername}
          password={lfView.password}
          onPasswordChange={lfView.setPassword}
          onSubmit={lfView.submitPassword}
          loading={lfView.loading}
        />

        <LfViewDialog
          open={lfView.showDataDialog}
          onOpenChange={lfView.setShowDataDialog}
          lfId={lfView.selectedLfId}
          notes={lfView.notes}
        />

        <DeleteTeacherDialog
          open={teacherToDelete !== null}
          onOpenChange={open => !open && setTeacherToDelete(null)}
          teacher={teacherToDelete}
          deleting={deleting}
          onConfirm={() => void deleteTeacherGrades()}
        />
      </PageContainer>
    </TooltipProvider>
  )
}
