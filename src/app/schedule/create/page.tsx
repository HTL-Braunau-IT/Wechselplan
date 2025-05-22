'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { DndContext, DragOverlay, MouseSensor, TouchSensor, useSensor, useSensors, useDroppable, useDraggable } from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { useTranslation } from 'next-i18next'

interface Student {
	id: number
	firstName: string
	lastName: string
	class: string
}

interface Group {
	id: number
	students: Student[]
}

function StudentItem({ student, index, onRemove }: { student: Student, index: number, onRemove: (studentId: number) => void }) {
	const { attributes, listeners, setNodeRef, transform } = useDraggable({
		id: student.id.toString()
	})

	const style = transform ? {
		transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
	} : undefined

	return (
		<div
			ref={setNodeRef}
			style={style}
			{...listeners}
			{...attributes}
			className="text-sm p-2 bg-gray-50 rounded cursor-move hover:bg-gray-100 transition flex items-center justify-between group"
		>
			<div>
				<span className="text-gray-500 mr-2">{index + 1}.</span>
				{student.lastName}, {student.firstName}
			</div>
			<button
				onClick={(e) => {
					e.stopPropagation()
					onRemove(student.id)
				}}
				className="text-red-500 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity"
				title="Remove student"
			>
				<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
					<path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
				</svg>
			</button>
		</div>
	)
}

function GroupContainer({ group, children }: { group: Group, children: React.ReactNode }) {
	const { t } = useTranslation('schedule')
	const { setNodeRef, isOver } = useDroppable({
		id: group.id.toString()
	})

	return (
		<div 
			ref={setNodeRef}
			className={`border rounded-lg p-4 w-[300px] transition-colors ${
				isOver ? 'bg-blue-50 border-blue-300' : ''
			}`}
		>
			<h3 className="font-semibold mb-2">{t('group')} {group.id}</h3>
			{children}
		</div>
	)
}

export default function ScheduleClassSelectPage() {
	const params = useParams<{ lang: string }>()
	const router = useRouter()
	const { t } = useTranslation('schedule')

	const [classes, setClasses] = useState<string[]>([])
	const [selectedClass, setSelectedClass] = useState('')
	const [students, setStudents] = useState<Student[]>([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState('')
	const [numberOfGroups, setNumberOfGroups] = useState(2)
	const [groups, setGroups] = useState<Group[]>([])
	const [activeStudent, setActiveStudent] = useState<Student | null>(null)

	const sensors = useSensors(
		useSensor(MouseSensor, {
			activationConstraint: {
				distance: 10,
			},
		}),
		useSensor(TouchSensor, {
			activationConstraint: {
				delay: 250,
				tolerance: 5,
			},
		})
	)

	useEffect(() => {
		async function fetchClasses() {
			try {
				const res = await fetch('/api/classes')
				if (!res.ok) throw new Error('Failed to fetch classes')
				const data = await res.json() as string[]
				setClasses(data)
			} catch {
				setError('Fehler beim Laden der Klassen.')
			} finally {
				setLoading(false)
			}
		}
		void fetchClasses()
	}, [])

	useEffect(() => {
		async function fetchStudents() {
			if (!selectedClass) return
			
			setLoading(true)
			try {
				const res = await fetch(`/api/students?class=${selectedClass}`)
				if (!res.ok) throw new Error('Failed to fetch students')
				const data = await res.json() as Student[]
				setStudents(data)
			} catch {
				setError('Fehler beim Laden der Schüler.')
			} finally {
				setLoading(false)
			}
		}
		void fetchStudents()
	}, [selectedClass])

	// Split students into groups whenever students or numberOfGroups changes
	useEffect(() => {
		if (students.length === 0) return

		// Sort students by last name
		const sortedStudents = [...students].sort((a, b) => 
			a.lastName.localeCompare(b.lastName)
		)

		// Calculate students per group
		const studentsPerGroup = Math.ceil(sortedStudents.length / numberOfGroups)

		// Create groups
		const newGroups: Group[] = Array.from({ length: numberOfGroups }, (_, i) => ({
			id: i + 1,
			students: sortedStudents.slice(i * studentsPerGroup, (i + 1) * studentsPerGroup)
		}))

		setGroups(newGroups)
	}, [students, numberOfGroups])

	function handleSelect(e: React.ChangeEvent<HTMLSelectElement>) {
		setSelectedClass(e.target.value)
	}

	function handleGroupSizeChange(e: React.ChangeEvent<HTMLSelectElement>) {
		setNumberOfGroups(Number(e.target.value))
	}

	async function handleNext() {
		try {
			// Get all students that are still in groups
			const activeStudents = groups.flatMap(group => group.students)
			const activeStudentIds = activeStudents.map(student => student.id)

			// Get all students that were removed
			const removedStudents = students.filter(student => !activeStudentIds.includes(student.id))

			// Store the group assignments
			const assignments = groups.map(group => ({
				groupId: group.id,
				studentIds: group.students.map(student => student.id)
			}))

			// Store assignments and handle removed students
			const response = await fetch('/api/schedule/assignments', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					class: selectedClass,
					assignments,
					removedStudentIds: removedStudents.map(student => student.id)
				}),
			})

			if (!response.ok) {
				throw new Error('Failed to store assignments')
			}

			// Navigate to the next step
			router.push(`/schedule/create/subjects?class=${selectedClass}`)
		} catch (error) {
			console.error('Error storing assignments:', error)
			setError('Failed to store assignments. Please try again.')
		}
	}

	function handleDragStart(event: DragStartEvent) {
		const { active } = event
		if (!active?.id) return
		
		const student = students.find(s => s.id === Number(active.id))
		if (student) {
			setActiveStudent(student)
		}
	}

	function handleDragEnd(event: DragEndEvent) {
		const { active, over } = event
		
		if (!over?.id || !active?.id) return

		const studentId = Number(active.id)
		const targetGroupId = Number(over.id)

		setGroups(currentGroups => {
			const newGroups = [...currentGroups]
			
			// Find the source group
			const sourceGroupIndex = newGroups.findIndex(group => 
				group.students.some(student => student.id === studentId)
			)
			
			if (sourceGroupIndex === -1) return currentGroups

			// Find the student
			const student = newGroups[sourceGroupIndex]!.students.find(s => s.id === studentId)
			if (!student) return currentGroups

			// Remove student from source group
			newGroups[sourceGroupIndex]!.students = newGroups[sourceGroupIndex]!.students.filter(
				s => s.id !== studentId
			)

			// Add student to target group
			const targetGroupIndex = newGroups.findIndex(group => group.id === targetGroupId)
			if (targetGroupIndex !== -1) {
				newGroups[targetGroupIndex]!.students.push(student)
				// Sort students in the target group by last name
				newGroups[targetGroupIndex]!.students.sort((a, b) => 
					a.lastName.localeCompare(b.lastName)
				)
			}

			return newGroups
		})

		setActiveStudent(null)
	}

	return (
		<div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
			<div className="bg-white rounded shadow p-8 w-full max-w-4xl">
				<h1 className="text-2xl font-bold mb-6 text-center">{t('selectClass')}</h1>
				{loading && !selectedClass ? (
					<p>{t('loadingClasses')}</p>
				) : error ? (
					<p className="text-red-500">{error}</p>
				) : (
					<div className="space-y-6">
						<form onSubmit={async e => { 
							e.preventDefault()
							await handleNext()
						}} className="mb-8">
							<label htmlFor="class-select" className="block mb-2 font-medium">{t('class')}</label>
							<select
								id="class-select"
								value={selectedClass}
								onChange={handleSelect}
								className="w-full border rounded px-3 py-2 mb-4"
								required
							>
								<option value="" disabled>{t('pleaseSelect')}</option>
								{classes.map(cls => (
									<option key={cls} value={cls}>{cls}</option>
								))}
							</select>
							<button
								type="submit"
								disabled={!selectedClass}
								className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition"
							>
								{t('next')}
							</button>
						</form>

						{selectedClass && (
							<div>
								<div className="flex justify-between items-center mb-4">
									<h2 className="text-xl font-semibold">{t('studentsOfClass', { class: selectedClass })}</h2>
									<div className="flex items-center gap-2">
										<label htmlFor="group-size" className="text-sm font-medium">
											{t('numberOfGroups')}:
										</label>
										<select
											id="group-size"
											value={numberOfGroups}
											onChange={handleGroupSizeChange}
											className="border rounded px-2 py-1"
										>
											<option value="2">2</option>
											<option value="3">3</option>
											<option value="4">4</option>
										</select>
									</div>
								</div>
								{loading ? (
									<p>{t('loadingStudents')}</p>
								) : (
									<DndContext
										sensors={sensors}
										onDragStart={handleDragStart}
										onDragEnd={handleDragEnd}
									>
										<div className={`grid gap-4 ${
											numberOfGroups === 2 
												? 'grid-cols-2 justify-items-center' 
												: numberOfGroups === 3 
													? 'grid-cols-2 justify-items-center [&>*:last-child]:col-span-2 [&>*:last-child]:max-w-md [&>*:last-child]:mx-auto' 
													: 'grid-cols-2 justify-items-center'
										}`}>
											{groups.map((group) => (
												<GroupContainer key={group.id} group={group}>
													<div className="space-y-2">
														{group.students.map((student, index) => (
															<StudentItem 
																key={student.id} 
																student={student} 
																index={index}
																onRemove={(studentId) => {
																	setGroups(currentGroups => {
																		const newGroups = [...currentGroups]
																		const sourceGroupIndex = newGroups.findIndex(group => 
																			group.students.some(s => s.id === studentId)
																		)
																		if (sourceGroupIndex !== -1) {
																			newGroups[sourceGroupIndex]!.students = newGroups[sourceGroupIndex]!.students.filter(
																				s => s.id !== studentId
																			)
																		}
																		return newGroups
																	})
																}}
															/>
														))}
													</div>
												</GroupContainer>
											))}
										</div>
										<DragOverlay>
											{activeStudent ? (
												<div className="text-sm p-2 bg-white border rounded shadow-lg">
													{activeStudent.lastName}, {activeStudent.firstName}
												</div>
											) : null}
										</DragOverlay>
									</DndContext>
								)}
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	)
} 