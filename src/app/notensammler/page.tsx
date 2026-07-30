'use client'

import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle, ClipboardList, Info, UserRound, Users, UsersRound } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useUnsavedWarning } from '@/hooks/use-unsaved-warning'
import { captureFrontendError } from '@/lib/frontend-error'
import { truncateSubject } from '@/lib/subject-utils'
import type { Semester } from '@/lib/grades'
import type { Period, SemesterView, SortDirection, SortField, Teacher } from './_lib/types'
import { useNotensammlerData } from './_hooks/use-notensammler-data'
import { useGradeEditing } from './_hooks/use-grade-editing'
import { useSokrates } from './_hooks/use-sokrates'
import { useTransferFlow } from './_hooks/use-transfer-flow'
import { useLfView } from './_hooks/use-lf-view'
import { usePdfDownload } from './_hooks/use-pdf-download'
import { ClassPicker } from './_components/class-picker'
import { ClassToolbar } from './_components/class-toolbar'
import { PeriodTabs } from './_components/period-tabs'
import { MyProgress } from './_components/my-progress'
import { GradeTable } from './_components/grade-table'
import { SokratesPanel } from './_components/sokrates-panel'
import { TransferDialogs } from './_components/transfer-dialogs'
import { NmCredentialsDialog } from './_components/nm-credentials-dialog'
import { LfViewDialog } from './_components/lf-view-dialog'
import { DeleteTeacherDialog } from './_components/delete-teacher-dialog'

/**
 * Notensammler — grade collection for teachers.
 *
 * Pick a class, enter marks per teacher for both semesters, and transfer the
 * result to Notenmanagement. Data loading, grade editing, the transfer wizard
 * and the LF read-back each live in their own hook; this file wires them to
 * the presentational components.
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

  // Null until the teacher picks: the grid opens on the semester the school is
  // actually in, rather than on a double-width both-semesters view.
  const [semesterChoice, setSemesterChoice] = useState<SemesterView | null>(null)
  const semesterView: SemesterView = semesterChoice ?? currentSemester ?? 'both'

  const [sortField, setSortField] = useState<SortField>('lastName')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [periodTab, setPeriodTab] = useState<Period>('AM')
  const [teacherToDelete, setTeacherToDelete] = useState<Teacher | null>(null)
  const [deleting, setDeleting] = useState(false)

  const sokrates = useSokrates({ classId: classData?.id, schoolYearId, setError })
  const { refresh: refreshSokrates } = sokrates

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

  /** With separate AM/PM subjects the grid shows one period at a time. */
  const tablePeriod: Period | undefined = classData?.hasSeparateAmPmSubjects ? periodTab : undefined

  /**
   * The teachers whose columns are actually on screen. Scoping to these is what
   * makes "missing" mean missing *here*: with separate AM/PM subjects the check
   * used to span both periods, so every student in the morning list was flagged
   * — and re-sorted to the top — because the afternoon subject was still empty.
   */
  const visibleTeachers = useMemo(() => {
    if (!classData) return []
    if (tablePeriod === 'AM') return classData.amTeachers
    if (tablePeriod === 'PM') return classData.pmTeachers
    return [...classData.amTeachers, ...classData.pmTeachers]
  }, [classData, tablePeriod])

  /** Any visible teacher still missing a mark for this student in the active semester. */
  const hasMissingInCurrentSemester = useCallback(
    (studentId: number): boolean => {
      if (currentSemester === null) return false
      return visibleTeachers.some(
        teacher => getGrade(studentId, teacher.id, currentSemester) === null,
      )
    },
    [currentSemester, visibleTeachers, getGrade],
  )

  // Students missing a mark float to the top so teachers see their gaps first.
  const sortedStudents = useMemo(() => {
    if (!classData) return []
    return [...classData.students]
      .filter(student => student.groupId !== null && student.groupId !== undefined)
      .sort((a, b) => {
        if (currentSemester != null) {
          const aMissing = hasMissingInCurrentSemester(a.id) ? 0 : 1
          const bMissing = hasMissingInCurrentSemester(b.id) ? 0 : 1
          if (aMissing !== bMissing) return aMissing - bMissing
        }

        const direction = sortDirection === 'asc' ? 1 : -1

        if (sortField === 'groupId') {
          // Ungrouped students sort last regardless of direction.
          const groupCompare =
            a.groupId === null && b.groupId === null
              ? 0
              : a.groupId === null
                ? 1
                : b.groupId === null
                  ? -1
                  : a.groupId - b.groupId
          if (groupCompare !== 0) return direction * groupCompare
        }

        const lastNameCompare = a.lastName.localeCompare(b.lastName)
        if (lastNameCompare !== 0) return direction * lastNameCompare
        return direction * a.firstName.localeCompare(b.firstName)
      })
  }, [classData, sortField, sortDirection, currentSemester, hasMissingInCurrentSemester])

  /**
   * The AM/PM tab ticks report the signed-in teacher's own progress, matching
   * the class chips. They used to report whether *every* teacher of the period
   * was done, so the same badge meant two different things on one screen.
   */
  const periodCompletion = useMemo(() => {
    const none = { amFirst: null, amSecond: null, pmFirst: null, pmSecond: null }
    if (!classData?.hasSeparateAmPmSubjects || currentTeacherId == null) return none

    const mine = (teachers: Teacher[], semester: Semester): boolean | null => {
      if (!teachers.some(teacher => teacher.id === currentTeacherId)) return null
      if (sortedStudents.length === 0) return null
      return sortedStudents.every(
        student => grades[student.id]?.[currentTeacherId]?.[semester] != null,
      )
    }

    return {
      amFirst: mine(classData.amTeachers, 'first'),
      amSecond: mine(classData.amTeachers, 'second'),
      pmFirst: mine(classData.pmTeachers, 'first'),
      pmSecond: mine(classData.pmTeachers, 'second'),
    }
  }, [classData, currentTeacherId, sortedStudents, grades])

  /** The semester the progress bar reports on — the one in view, or the live one. */
  const progressSemester: Semester =
    semesterView === 'both' ? (currentSemester ?? 'first') : semesterView

  const myProgress = useMemo(() => {
    if (currentTeacherId == null) return null
    const teaches = visibleTeachers.some(teacher => teacher.id === currentTeacherId)
    if (!teaches) return null
    const entered = sortedStudents.filter(
      student => grades[student.id]?.[currentTeacherId]?.[progressSemester] != null,
    ).length
    return { entered, total: sortedStudents.length }
  }, [currentTeacherId, visibleTeachers, sortedStudents, grades, progressSemester])

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

  const subjectLabel = classData?.hasSeparateAmPmSubjects
    ? null
    : classData?.subjectName
      ? truncateSubject(classData.subjectName)
      : null

  const semesterLabel = (semester: Semester) =>
    semester === 'first'
      ? t('notensammler.firstSemester', '1. Semester')
      : t('notensammler.secondSemester', '2. Semester')

  return (
    <TooltipProvider delayDuration={200}>
      <PageContainer size="wide" className="space-y-6">
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
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => setError(null)}
              >
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
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => setNotice(null)}
              >
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
          <Card>
            <CardHeader className="gap-4">
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
                <h2 className="truncate text-xl font-semibold tracking-tight">{classData.name}</h2>
                {subjectLabel && <Badge variant="secondary">{subjectLabel}</Badge>}
                {classData.classLead && (
                  <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
                    <UserRound className="h-3.5 w-3.5" />
                    {t('notensammler.classLead', 'Klassenleitung')}: {classData.classLead}
                  </span>
                )}
                <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
                  <Users className="h-3.5 w-3.5" />
                  {t('notensammler.studentCount', '{{count}} Schüler', {
                    count: sortedStudents.length,
                  })}
                </span>
              </div>

              <ClassToolbar
                classData={classData}
                currentSemester={currentSemester}
                semesterView={semesterView}
                onSemesterViewChange={setSemesterChoice}
                sortField={sortField}
                sortDirection={sortDirection}
                onSortChange={(field, direction) => {
                  setSortField(field)
                  setSortDirection(direction)
                }}
                saveState={saveState}
                savingAll={savingAll}
                onSaveAll={() => void saveAllGrades()}
                downloadingPdf={downloadingPdf}
                onDownloadPdf={() => void downloadClassPdf()}
                downloadingAllPdf={downloadingAllPdf}
                onDownloadAllPdf={() => void downloadAllClassesPdf()}
                canDownloadAllPdf={teacherClasses.length > 0}
                onOpenTransfer={transfer.open}
                onViewLf={lfView.open}
              />
            </CardHeader>

            <CardContent className="space-y-4">
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

              {classData.hasSeparateAmPmSubjects && (
                <PeriodTabs
                  value={periodTab}
                  onValueChange={setPeriodTab}
                  subjectNameAm={classData.subjectNameAm}
                  subjectNamePm={classData.subjectNamePm}
                  showCompletion={currentTeacherTeachesClass}
                  completion={periodCompletion}
                />
              )}

              {myProgress && (
                <MyProgress
                  entered={myProgress.entered}
                  total={myProgress.total}
                  semesterLabel={semesterLabel(progressSemester)}
                />
              )}

              {ungroupedStudentCount > 0 && (
                <p className="text-muted-foreground flex items-center gap-2 text-sm">
                  <UsersRound className="h-4 w-4 shrink-0" />
                  {t(
                    'notensammler.ungroupedHint',
                    '{{count}} Schüler ohne Gruppe werden nicht angezeigt — sie nehmen an keinem Turnus teil.',
                    { count: ungroupedStudentCount },
                  )}
                </p>
              )}

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
              )}
            </CardContent>
          </Card>
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
