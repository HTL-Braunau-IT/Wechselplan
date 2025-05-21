'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

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

export default function ScheduleClassSelectPage() {
	const params = useParams<{ lang: string }>()
	const router = useRouter()
	const lang = params?.lang || 'de'

	const [classes, setClasses] = useState<string[]>([])
	const [selectedClass, setSelectedClass] = useState('')
	const [students, setStudents] = useState<Student[]>([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState('')
	const [numberOfGroups, setNumberOfGroups] = useState(2)
	const [groups, setGroups] = useState<Group[]>([])

	useEffect(() => {
		async function fetchClasses() {
			try {
				const res = await fetch('/api/classes')
				if (!res.ok) throw new Error('Failed to fetch classes')
				const data = await res.json()
				setClasses(data)
			} catch (err) {
				setError('Fehler beim Laden der Klassen.')
			} finally {
				setLoading(false)
			}
		}
		fetchClasses()
	}, [])

	useEffect(() => {
		async function fetchStudents() {
			if (!selectedClass) return
			
			setLoading(true)
			try {
				const res = await fetch(`/api/students?class=${selectedClass}`)
				if (!res.ok) throw new Error('Failed to fetch students')
				const data = await res.json()
				setStudents(data)
			} catch (err) {
				setError('Fehler beim Laden der Schüler.')
			} finally {
				setLoading(false)
			}
		}
		fetchStudents()
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
		router.push(`/${lang}/schedule/create/subjects?class=${selectedClass}`)
	}

	return (
		<div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
			<div className="bg-white rounded shadow p-8 w-full max-w-4xl">
				<h1 className="text-2xl font-bold mb-6 text-center">Klasse auswählen</h1>
				{loading && !selectedClass ? (
					<p>Lade Klassen...</p>
				) : error ? (
					<p className="text-red-500">{error}</p>
				) : (
					<div className="space-y-6">
						<form onSubmit={e => { e.preventDefault(); handleNext() }} className="mb-8">
							<label htmlFor="class-select" className="block mb-2 font-medium">Klasse</label>
							<select
								id="class-select"
								value={selectedClass}
								onChange={handleSelect}
								className="w-full border rounded px-3 py-2 mb-4"
								required
							>
								<option value="" disabled>Bitte wählen...</option>
								{classes.map(cls => (
									<option key={cls} value={cls}>{cls}</option>
								))}
							</select>
							<button
								type="submit"
								disabled={!selectedClass}
								className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition"
							>
								Weiter
							</button>
						</form>

						{selectedClass && (
							<div>
								<div className="flex justify-between items-center mb-4">
									<h2 className="text-xl font-semibold">Schüler der Klasse {selectedClass}</h2>
									<div className="flex items-center gap-2">
										<label htmlFor="group-size" className="text-sm font-medium">
											Anzahl Gruppen:
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
									<p>Lade Schüler...</p>
								) : (
									<div className={`grid gap-4 ${
										numberOfGroups === 2 
											? 'grid-cols-2 justify-items-center' 
											: numberOfGroups === 3 
												? 'grid-cols-2 justify-items-center [&>*:last-child]:col-span-2 [&>*:last-child]:max-w-md [&>*:last-child]:mx-auto' 
												: 'grid-cols-2 justify-items-center'
									}`}>
										{groups.map((group) => (
											<div key={group.id} className="border rounded-lg p-4 w-[300px]">
												<h3 className="font-semibold mb-2">Gruppe {group.id}</h3>
												<div className="space-y-2">
													{group.students.map((student) => (
														<div
															key={student.id}
															className="text-sm p-2 bg-gray-50 rounded"
														>
															{student.lastName}, {student.firstName}
														</div>
													))}
												</div>
											</div>
										))}
									</div>
								)}
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	)
} 