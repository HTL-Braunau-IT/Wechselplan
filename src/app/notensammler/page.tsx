'use client'

import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { captureFrontendError } from '@/lib/frontend-error'
import { truncateSubject } from '@/lib/subject-utils'
import type { Semester } from '@/lib/grades'
import type { Period, SortDirection, SortField, Teacher } from './_lib/types'
import { useNotensammlerData } from './_hooks/use-notensammler-data'
import { useGradeEditing } from './_hooks/use-grade-editing'
import { useTransferFlow } from './_hooks/use-transfer-flow'
import { useLfView } from './_hooks/use-lf-view'
import { usePdfDownload } from './_hooks/use-pdf-download'
import { NotensammlerToolbar } from './_components/notensammler-toolbar'
import { ClassTabBar } from './_components/class-tab-bar'
import { PeriodTabs } from './_components/period-tabs'
import { GradeTable } from './_components/grade-table'
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
    loading,
    error,
    setError,
    schoolYearId,
    currentSemester,
  } = useNotensammlerData()

  const [showFirstSemester, setShowFirstSemester] = useState(true)
  const [showSecondSemester, setShowSecondSemester] = useState(true)
  const [sortField, setSortField] = useState<SortField>('lastName')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [periodTab, setPeriodTab] = useState<Period>('AM')
  const [teacherToDelete, setTeacherToDelete] = useState<Teacher | null>(null)
  const [deleting, setDeleting] = useState(false)

  const {
    saving,
    savingAll,
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
    refreshTeacherClasses,
  })

  const transfer = useTransferFlow({ classData, schoolYearId, setError, refreshClassData })
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

  /** Any teacher still missing a mark for this student in the active semester. */
  const hasMissingInCurrentSemester = useCallback(
    (studentId: number): boolean => {
      if (currentSemester === null || !classData) return false
      const allTeachers = [...classData.amTeachers, ...classData.pmTeachers]
      return allTeachers.some(teacher => getGrade(studentId, teacher.id, currentSemester) === null)
    },
    [currentSemester, classData, getGrade],
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

  /** With separate AM/PM subjects the grid shows one period at a time. */
  const tablePeriod: Period | undefined = classData?.hasSeparateAmPmSubjects ? periodTab : undefined

  const periodCompletion = useMemo(() => {
    if (!classData?.hasSeparateAmPmSubjects || sortedStudents.length === 0) {
      return { amFirst: false, amSecond: false, pmFirst: false, pmSecond: false }
    }
    const allEntered = (teachers: Teacher[], semester: Semester) =>
      teachers.length === 0 ||
      sortedStudents.every(student =>
        teachers.every(teacher => grades[student.id]?.[teacher.id]?.[semester] != null),
      )
    return {
      amFirst: allEntered(classData.amTeachers, 'first'),
      amSecond: allEntered(classData.amTeachers, 'second'),
      pmFirst: allEntered(classData.pmTeachers, 'first'),
      pmSecond: allEntered(classData.pmTeachers, 'second'),
    }
  }, [classData, sortedStudents, grades])

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
    } catch (e) {
      captureFrontendError(e, { location: 'notensammler', type: 'delete-teacher-grades' })
      setError(e instanceof Error ? e.message : 'Failed to delete grades')
    } finally {
      setDeleting(false)
    }
  }, [teacherToDelete, classData, schoolYearId, setError, setGrades])

  const cardTitle = classData
    ? classData.hasSeparateAmPmSubjects
      ? classData.name
      : classData.subjectName
        ? `${classData.name} - ${truncateSubject(classData.subjectName)}`
        : classData.name
    : ''

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

        <NotensammlerToolbar
          classes={classes}
          selectedClassId={selectedClassId}
          onClassChange={handleClassChange}
          classData={classData}
          currentSemester={currentSemester}
          showFirstSemester={showFirstSemester}
          setShowFirstSemester={setShowFirstSemester}
          showSecondSemester={showSecondSemester}
          setShowSecondSemester={setShowSecondSemester}
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

        <ClassTabBar
          teacherClasses={teacherClasses}
          selectedClassId={selectedClassId}
          onSelect={handleClassChange}
        />
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
              {cardTitle}
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
              <Select value={sortField} onValueChange={value => setSortField(value as SortField)}>
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
                onValueChange={value => setSortDirection(value as SortDirection)}
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
              <PeriodTabs
                value={periodTab}
                onValueChange={setPeriodTab}
                subjectNameAm={classData.subjectNameAm}
                subjectNamePm={classData.subjectNamePm}
                showCompletion={currentTeacherTeachesClass}
                completion={periodCompletion}
              />
            )}

            <GradeTable
              classData={classData}
              students={sortedStudents}
              finalGrades={finalGrades}
              currentTeacherId={currentTeacherId}
              currentTeacherTeachesClass={currentTeacherTeachesClass}
              currentSemester={currentSemester}
              showFirstSemester={showFirstSemester}
              showSecondSemester={showSecondSemester}
              tablePeriod={tablePeriod}
              getGrade={getGrade}
              getFinalGradeDisplay={getFinalGradeDisplay}
              calculateAverage={calculateAverage}
              hasMissingInCurrentSemester={hasMissingInCurrentSemester}
              onGradeChange={handleGradeChange}
              onFinalGradeChange={handleFinalGradeChange}
              onConductWishChange={handleConductWishChange}
              onDeleteTeacher={setTeacherToDelete}
            />

            {saving && (
              <div className="text-muted-foreground mt-4 text-sm">
                {t('notensammler.saving', 'Speichere...')}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <TransferDialogs {...transfer} error={error} />

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
    </div>
  )
}
