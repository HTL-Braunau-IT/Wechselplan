'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { useTranslation } from 'react-i18next'
import { captureFrontendError } from '@/lib/frontend-error'

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
	students: Student[]
	teachers: Teacher[]
}

interface GradesData {
	[studentId: number]: {
		[teacherId: number]: {
			first: number | null
			second: number | null
		}
	}
}

const ALLOWED_GRADES = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]

/**
 * Notensammler page - Grade collection interface for teachers.
 * 
 * Allows selecting a class and entering grades for students across two semesters.
 * Grades are auto-saved with debounce, and averages are calculated automatically.
 */
export default function NotensammlerPage() {
	const { t } = useTranslation()
	const [classes, setClasses] = useState<Array<{ id: number; name: string }>>([])
	const [selectedClassId, setSelectedClassId] = useState<string>('')
	const [classData, setClassData] = useState<Class | null>(null)
	const [grades, setGrades] = useState<GradesData>({})
	const [loading, setLoading] = useState(false)
	const [saving, setSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)

	// Debounce timer for auto-save
	const saveTimerRef = useRef<NodeJS.Timeout | null>(null)

	// Fetch all classes on mount
	useEffect(() => {
		const fetchClasses = async () => {
			try {
				const response = await fetch('/api/classes')
				if (!response.ok) throw new Error('Failed to fetch classes')
				const data = await response.json() as Array<{ id: number; name: string }>
				setClasses(data)
			} catch (e) {
				captureFrontendError(e, {
					location: 'notensammler',
					type: 'fetch-classes'
				})
				setError(e instanceof Error ? e.message : 'Failed to load classes')
			}
		}
		void fetchClasses()
	}, [])

	// Cleanup timer on unmount
	useEffect(() => {
		return () => {
			if (saveTimerRef.current) {
				clearTimeout(saveTimerRef.current)
			}
		}
	}, [])

	// Fetch class data and grades when class is selected
	useEffect(() => {
		if (!selectedClassId) {
			setClassData(null)
			setGrades({})
			return
		}

		const fetchClassData = async () => {
			try {
				setLoading(true)
				setError(null)

				const [classResponse, gradesResponse] = await Promise.all([
					fetch(`/api/notensammler/class/${selectedClassId}`),
					fetch(`/api/notensammler/grades?classId=${selectedClassId}`)
				])

				if (!classResponse.ok) throw new Error('Failed to fetch class data')
				if (!gradesResponse.ok) throw new Error('Failed to fetch grades')

				const classDataResult = await classResponse.json() as Class
				const gradesResult = await gradesResponse.json() as GradesData

				setClassData(classDataResult)
				setGrades(gradesResult)
			} catch (e) {
				captureFrontendError(e, {
					location: 'notensammler',
					type: 'fetch-class-data'
				})
				setError(e instanceof Error ? e.message : 'Failed to load class data')
			} finally {
				setLoading(false)
			}
		}

		void fetchClassData()
	}, [selectedClassId])

	// Save grade function
	const saveGrade = useCallback(async (
		studentId: number,
		teacherId: number,
		semester: 'first' | 'second',
		grade: number | null
	) => {
		if (!classData) return

		try {
			setSaving(true)

			const response = await fetch('/api/notensammler/grades', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					studentId,
					teacherId,
					classId: classData.id,
					semester,
					grade
				})
			})

			if (!response.ok) {
				const errorData = await response.json()
				throw new Error(errorData.error || 'Failed to save grade')
			}

			// Update local state
			setGrades(prev => {
				const newGrades = { ...prev }
				if (!newGrades[studentId]) {
					newGrades[studentId] = {}
				}
				if (!newGrades[studentId][teacherId]) {
					newGrades[studentId][teacherId] = { first: null, second: null }
				}
				newGrades[studentId][teacherId][semester] = grade
				return newGrades
			})
		} catch (e) {
			captureFrontendError(e, {
				location: 'notensammler',
				type: 'save-grade'
			})
			console.error('Failed to save grade:', e)
		} finally {
			setSaving(false)
		}
	}, [classData])


	// Handle grade input change
	const handleGradeChange = useCallback((
		studentId: number,
		teacherId: number,
		semester: 'first' | 'second',
		value: string
	) => {
		// Update local state immediately for responsive UI
		setGrades(prev => {
			const newGrades = { ...prev }
			if (!newGrades[studentId]) {
				newGrades[studentId] = {}
			}
			if (!newGrades[studentId][teacherId]) {
				newGrades[studentId][teacherId] = { first: null, second: null }
			}

			// Parse and validate grade
			if (value === '' || value === null || value === undefined) {
				newGrades[studentId][teacherId][semester] = null
			} else {
				const gradeNum = parseFloat(value)
				if (!isNaN(gradeNum) && ALLOWED_GRADES.includes(gradeNum)) {
					newGrades[studentId][teacherId][semester] = gradeNum
				} else {
					// Invalid grade, don't update
					return prev
				}
			}

			return newGrades
		})

		// Debounce save
		const gradeValue = value === '' ? null : parseFloat(value)
		if (gradeValue === null || (!isNaN(gradeValue) && ALLOWED_GRADES.includes(gradeValue))) {
			// Clear existing timer
			if (saveTimerRef.current) {
				clearTimeout(saveTimerRef.current)
			}

			// Set new timer
			saveTimerRef.current = setTimeout(() => {
				void saveGrade(studentId, teacherId, semester, gradeValue)
				saveTimerRef.current = null
			}, 500)
		}
	}, [saveGrade, saveTimerRef])

	// Calculate average for a student in a semester
	const calculateAverage = useCallback((studentId: number, semester: 'first' | 'second'): number | null => {
		if (!classData) return null

		const studentGrades = grades[studentId]
		if (!studentGrades) return null

		const gradeValues: number[] = []
		for (const teacherId in studentGrades) {
			const teacherGrades = studentGrades[parseInt(teacherId)]
			if (teacherGrades) {
				const grade = teacherGrades[semester]
				if (grade !== null && grade !== undefined) {
					gradeValues.push(grade)
				}
			}
		}

		if (gradeValues.length === 0) return null

		const sum = gradeValues.reduce((acc, val) => acc + val, 0)
		return Math.round((sum / gradeValues.length) * 10) / 10 // Round to 1 decimal place
	}, [grades, classData])

	// Get grade value
	const getGrade = useCallback((studentId: number, teacherId: number, semester: 'first' | 'second'): number | null => {
		return grades[studentId]?.[teacherId]?.[semester] ?? null
	}, [grades])

	// Sorted students with sequential IDs
	const sortedStudents = useMemo(() => {
		if (!classData) return []
		return [...classData.students].sort((a, b) => {
			const lastNameCompare = a.lastName.localeCompare(b.lastName)
			if (lastNameCompare !== 0) return lastNameCompare
			return a.firstName.localeCompare(b.firstName)
		})
	}, [classData])

	if (error) {
		return (
			<div className="container mx-auto p-8">
				<div className="text-center text-red-500">{error}</div>
			</div>
		)
	}

	return (
		<div className="container mx-auto p-4">
			<div className="mb-8">
				<h1 className="text-3xl font-bold mb-4">{t('notensammler.title', 'Notensammler')}</h1>
				<div className="mb-4">
					<label className="block text-sm font-medium mb-2">
						{t('notensammler.selectClass', 'Klasse auswählen')}
					</label>
					<Select value={selectedClassId} onValueChange={setSelectedClassId}>
						<SelectTrigger className="w-[300px]">
							<SelectValue placeholder={t('notensammler.selectClassPlaceholder', 'Bitte Klasse auswählen...')} />
						</SelectTrigger>
						<SelectContent>
							{classes.map((cls) => (
								<SelectItem key={cls.id} value={cls.id.toString()}>
									{cls.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>

			{loading && (
				<div className="flex items-center justify-center min-h-[200px]">
					<Spinner size="lg" />
				</div>
			)}

			{classData && !loading && (
				<Card>
					<CardHeader>
						<CardTitle>{classData.name}</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="overflow-x-auto">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead className="sticky left-0 bg-background z-10">{t('notensammler.id', 'ID')}</TableHead>
										<TableHead className="sticky left-[60px] bg-background z-10">{t('notensammler.group', 'Gruppe')}</TableHead>
										{classData.teachers.map((teacher) => (
											<TableHead key={`first-${teacher.id}`}>
												{teacher.firstName} {teacher.lastName}
											</TableHead>
										))}
										<TableHead className="bg-muted">{t('notensammler.average', 'Durchschnitt')} ({t('notensammler.firstSemester', '1. Semester')})</TableHead>
										{classData.teachers.map((teacher) => (
											<TableHead key={`second-${teacher.id}`}>
												{teacher.firstName} {teacher.lastName}
											</TableHead>
										))}
										<TableHead className="bg-muted">{t('notensammler.average', 'Durchschnitt')} ({t('notensammler.secondSemester', '2. Semester')})</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{sortedStudents.map((student, index) => {
										const firstAvg = calculateAverage(student.id, 'first')
										const secondAvg = calculateAverage(student.id, 'second')
										return (
											<TableRow key={student.id}>
												<TableCell className="sticky left-0 bg-background z-10 font-medium">
													{index + 1}
												</TableCell>
												<TableCell className="sticky left-[60px] bg-background z-10">
													{student.groupId ?? '-'}
												</TableCell>
												{/* First semester teacher columns */}
												{classData.teachers.map((teacher) => {
													const grade = getGrade(student.id, teacher.id, 'first')
													return (
														<TableCell key={`first-${student.id}-${teacher.id}`}>
															<Input
																type="number"
																min="1"
																max="5"
																step="0.5"
																value={grade ?? ''}
																onChange={(e) => handleGradeChange(student.id, teacher.id, 'first', e.target.value)}
																className="w-20"
															/>
														</TableCell>
													)
												})}
												{/* First semester average */}
												<TableCell className="bg-muted font-medium">
													{firstAvg !== null ? firstAvg.toFixed(1) : '-'}
												</TableCell>
												{/* Second semester teacher columns */}
												{classData.teachers.map((teacher) => {
													const grade = getGrade(student.id, teacher.id, 'second')
													return (
														<TableCell key={`second-${student.id}-${teacher.id}`}>
															<Input
																type="number"
																min="1"
																max="5"
																step="0.5"
																value={grade ?? ''}
																onChange={(e) => handleGradeChange(student.id, teacher.id, 'second', e.target.value)}
																className="w-20"
															/>
														</TableCell>
													)
												})}
												{/* Second semester average */}
												<TableCell className="bg-muted font-medium">
													{secondAvg !== null ? secondAvg.toFixed(1) : '-'}
												</TableCell>
											</TableRow>
										)
									})}
								</TableBody>
							</Table>
						</div>
						{saving && (
							<div className="mt-4 text-sm text-muted-foreground">
								{t('notensammler.saving', 'Speichere...')}
							</div>
						)}
					</CardContent>
				</Card>
			)}
		</div>
	)
}

