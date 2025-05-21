'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { DndContext, DragOverlay, MouseSensor, TouchSensor, useSensor, useSensors, useDroppable, useDraggable } from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'

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

const translations = {
	en: {
		schedule: {
			selectClass: 'Select Class',
			loadingClasses: 'Loading classes...',
			loadingStudents: 'Loading students...',
			class: 'Class',
			pleaseSelect: 'Please select...',
			next: 'Next',
			studentsOfClass: 'Students of class {{class}}',
			numberOfGroups: 'Number of Groups',
			group: 'Group'
		}
	},
	de: {
		schedule: {
			selectClass: 'Klasse auswählen',
			loadingClasses: 'Lade Klassen...',
			loadingStudents: 'Lade Schüler...',
			class: 'Klasse',
			pleaseSelect: 'Bitte wählen...',
			next: 'Weiter',
			studentsOfClass: 'Schüler der Klasse {{class}}',
			numberOfGroups: 'Anzahl Gruppen',
			group: 'Gruppe'
		}
	}
}

function StudentItem({ student, index }: { student: Student, index: number }) {
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
			className="text-sm p-2 bg-gray-50 rounded cursor-move hover:bg-gray-100 transition"
		>
			<span className="text-gray-500 mr-2">{index + 1}.</span>
			{student.lastName}, {student.firstName}
		</div>
	)
}

function GroupContainer({ group, children, lang }: { group: Group, children: React.ReactNode, lang: string }) {
	const { setNodeRef, isOver } = useDroppable({
		id: group.id.toString()
	})

	const t = translations[lang as keyof typeof translations]

	return (
		<div 
			ref={setNodeRef}
			className={`border rounded-lg p-4 w-[300px] transition-colors ${
				isOver ? 'bg-blue-50 border-blue-300' : ''
			}`}
		>
			<h3 className="font-semibold mb-2">{t.schedule.group} {group.id}</h3>
			{children}
		</div>
	)
}

export default function ScheduleClassSelectPage() {
	const params = useParams<{ lang: string }>()
	const router = useRouter()
	const lang = params?.lang || 'de'
	const t = translations[lang as keyof typeof translations]

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

	function handleNext() {
		// Navigate to the next step in schedule creation
		router.push(`/schedule/create/subjects?class=${selectedClass}`)
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
				<h1 className="text-2xl font-bold mb-6 text-center">{t.schedule.selectClass}</h1>
				{loading && !selectedClass ? (
					<p>{t.schedule.loadingClasses}</p>
				) : error ? (
					<p className="text-red-500">{error}</p>
				) : (
					<div className="space-y-6">
						<form onSubmit={e => { e.preventDefault(); handleNext() }} className="mb-8">
							<label htmlFor="class-select" className="block mb-2 font-medium">{t.schedule.class}</label>
							<select
								id="class-select"
								value={selectedClass}
								onChange={handleSelect}
								className="w-full border rounded px-3 py-2 mb-4"
								required
							>
								<option value="" disabled>{t.schedule.pleaseSelect}</option>
								{classes.map(cls => (
									<option key={cls} value={cls}>{cls}</option>
								))}
							</select>
							<button
								type="submit"
								disabled={!selectedClass}
								className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition"
							>
								{t.schedule.next}
							</button>
						</form>

						{selectedClass && (
							<div>
								<div className="flex justify-between items-center mb-4">
									<h2 className="text-xl font-semibold">{t.schedule.studentsOfClass.replace('{{class}}', selectedClass)}</h2>
									<div className="flex items-center gap-2">
										<label htmlFor="group-size" className="text-sm font-medium">
											{t.schedule.numberOfGroups}:
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
									<p>{t.schedule.loadingStudents}</p>
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
												<GroupContainer key={group.id} group={group} lang={lang}>
													<div className="space-y-2">
														{group.students.map((student, index) => (
															<StudentItem 
																key={student.id} 
																student={student} 
																index={index}
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