'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslation } from 'next-i18next'
import { Combobox } from '@headlessui/react'

interface Student {
	id: number
	firstName: string
	lastName: string
	class: string
}

interface Teacher {
	id: number
	firstName: string
	lastName: string
	subjects: string[]
}

interface Group {
	id: number
	students: Student[]
}

interface TeacherAssignment {
	groupId: number
	teacherId: number
	subject: string
	learningContent: string
	room: string
}

interface GroupAssignment {
	groupId: number
	students: Student[]
}

interface AssignmentsResponse {
	assignments: GroupAssignment[]
}

function TeacherCombobox({ 
	value, 
	onChange, 
	teachers 
}: { 
	value: number, 
	onChange: (value: number) => void, 
	teachers: Teacher[] 
}) {
	const { t } = useTranslation('schedule')
	const [query, setQuery] = useState('')

	const filteredTeachers = query === ''
		? teachers
		: teachers.filter((teacher) =>
			`${teacher.lastName}, ${teacher.firstName}`
				.toLowerCase()
				.includes(query.toLowerCase())
		)

	return (
		<Combobox value={value} onChange={onChange}>
			<div className="relative">
				<Combobox.Button className="w-full flex justify-between items-center border rounded px-2 py-1 text-left">
					<Combobox.Input
						className="w-full border-none focus:ring-0 p-0"
						onChange={(event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
						displayValue={(teacherId: number) => {
							const teacher = teachers.find(t => t.id === teacherId)
							return teacher ? `${teacher.lastName}, ${teacher.firstName}` : ''
						}}
						placeholder={t('selectTeacher')}
					/>
					<svg className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
						<path fillRule="evenodd" d="M10 3a1 1 0 01.707.293l3 3a1 1 0 01-1.414 1.414L10 5.414 7.707 7.707a1 1 0 01-1.414-1.414l3-3A1 1 0 0110 3zm-3.707 9.293a1 1 0 011.414 0L10 14.586l2.293-2.293a1 1 0 011.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
					</svg>
				</Combobox.Button>
				<Combobox.Options className="fixed z-50 mt-1 max-h-[300px] w-[300px] overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
					{filteredTeachers.length === 0 && query !== '' ? (
						<div className="relative cursor-default select-none py-2 px-4 text-gray-700">
							{t('noTeachersFound')}
						</div>
					) : (
						filteredTeachers.map((teacher) => (
							<Combobox.Option
								key={teacher.id}
								value={teacher.id}
								className={({ active }: { active: boolean }) =>
									`relative cursor-default select-none py-2 pl-4 pr-4 ${
										active ? 'bg-blue-600 text-white' : 'text-gray-900'
									}`
								}
							>
								{teacher.lastName}, {teacher.firstName}
							</Combobox.Option>
						))
					)}
				</Combobox.Options>
			</div>
		</Combobox>
	)
}

export default function TeacherAssignmentPage() {
	const router = useRouter()
	const searchParams = useSearchParams()
	const { t } = useTranslation('schedule')
	const selectedClass = searchParams.get('class')

	const [teachers, setTeachers] = useState<Teacher[]>([])
	const [groups, setGroups] = useState<Group[]>([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState('')
	const [amAssignments, setAmAssignments] = useState<TeacherAssignment[]>([])
	const [pmAssignments, setPmAssignments] = useState<TeacherAssignment[]>([])

	useEffect(() => {
		async function fetchData() {
			if (!selectedClass) return

			setLoading(true)
			try {
				// Fetch teachers
				const teachersRes = await fetch('/api/teachers')
				if (!teachersRes.ok) throw new Error('Failed to fetch teachers')
				const teachersData = await teachersRes.json() as Teacher[]
				setTeachers(teachersData)

				// Fetch groups
				const groupsRes = await fetch(`/api/schedule/assignments?class=${selectedClass}`)
				if (!groupsRes.ok) throw new Error('Failed to fetch groups')
				const groupsData = await groupsRes.json() as AssignmentsResponse
				setGroups(groupsData.assignments.map(assignment => ({
					id: assignment.groupId,
					students: assignment.students
				})))

				// Initialize assignments
				const initialAssignments = groupsData.assignments.map(assignment => ({
					groupId: assignment.groupId,
					teacherId: 0,
					subject: '',
					learningContent: '',
					room: ''
				}))
				setAmAssignments(initialAssignments)
				setPmAssignments(initialAssignments)
			} catch (error) {
				console.error('Error:', error)
				setError('Fehler beim Laden der Daten.')
			} finally {
				setLoading(false)
			}
		}
		void fetchData()
	}, [selectedClass])

	function handleAssignmentChange(
		period: 'am' | 'pm',
		groupId: number,
		field: keyof TeacherAssignment,
		value: string | number
	) {
		const setAssignments = period === 'am' ? setAmAssignments : setPmAssignments
		setAssignments(current => 
			current.map(assignment => 
				assignment.groupId === groupId
					? { ...assignment, [field]: value }
					: assignment
			)
		)
	}

	async function handleNext() {
		try {
			// Filter out assignments with no teacher selected
			const validAmAssignments = amAssignments.filter(a => a.teacherId !== 0)
			const validPmAssignments = pmAssignments.filter(a => a.teacherId !== 0)

			const response = await fetch('/api/schedule/teacher-assignments', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					class: selectedClass,
					amAssignments: validAmAssignments,
					pmAssignments: validPmAssignments
				}),
			})

			if (!response.ok) {
				const errorData = await response.json()
				throw new Error(errorData.message || 'Failed to save teacher assignments')
			}

			router.push(`/schedule/create/final?class=${selectedClass}`)
		} catch (error) {
			console.error('Error:', error)
			setError(error instanceof Error ? error.message : 'Fehler beim Speichern der Lehrerzuweisungen.')
		}
	}

	if (loading) return <div className="p-4">{t('loading')}</div>
	if (error) return <div className="p-4 text-red-500">{error}</div>
	if (!selectedClass) return <div className="p-4">{t('noClassSelected')}</div>

	return (
		<div className="min-h-screen bg-gray-50 p-4">
			<div className="max-w-7xl mx-auto">
				<h1 className="text-2xl font-bold mb-6">
					{t('teacherAssignment')} - {selectedClass}
				</h1>

				<div className="space-y-8">
					{/* AM Assignments */}
					<div>
						<h2 className="text-xl font-semibold mb-4">{t('morningAssignments')}</h2>
						<div className="bg-white rounded-lg shadow">
							<table className="min-w-full divide-y divide-gray-200">
								<thead className="bg-gray-50">
									<tr>
										<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
											{t('group')}
										</th>
										<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
											{t('teacher')}
										</th>
										<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
											{t('subject')}
										</th>
										<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
											{t('learningContent')}
										</th>
										<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
											{t('room')}
										</th>
									</tr>
								</thead>
								<tbody className="bg-white divide-y divide-gray-200">
									{groups.map((group) => {
										const assignment = amAssignments.find(a => a.groupId === group.id)
										return (
											<tr key={group.id}>
												<td className="px-6 py-4 whitespace-nowrap">
													{t('group')} {group.id}
												</td>
												<td className="px-6 py-4 whitespace-nowrap">
													<TeacherCombobox
														value={assignment?.teacherId ?? 0}
														onChange={(teacherId) => handleAssignmentChange('am', group.id, 'teacherId', teacherId)}
														teachers={teachers}
													/>
												</td>
												<td className="px-6 py-4 whitespace-nowrap">
													<input
														type="text"
														value={assignment?.subject ?? ''}
														onChange={(e) => handleAssignmentChange('am', group.id, 'subject', e.target.value)}
														className="border rounded px-2 py-1"
														placeholder={t('enterSubject')}
													/>
												</td>
												<td className="px-6 py-4 whitespace-nowrap">
													<input
														type="text"
														value={assignment?.learningContent ?? ''}
														onChange={(e) => handleAssignmentChange('am', group.id, 'learningContent', e.target.value)}
														className="border rounded px-2 py-1"
														placeholder={t('enterLearningContent')}
													/>
												</td>
												<td className="px-6 py-4 whitespace-nowrap">
													<input
														type="text"
														value={assignment?.room ?? ''}
														onChange={(e) => handleAssignmentChange('am', group.id, 'room', e.target.value)}
														className="border rounded px-2 py-1"
														placeholder={t('enterRoom')}
													/>
												</td>
											</tr>
										)
									})}
								</tbody>
							</table>
						</div>
					</div>

					{/* PM Assignments */}
					<div>
						<h2 className="text-xl font-semibold mb-4">{t('afternoonAssignments')}</h2>
						<div className="bg-white rounded-lg shadow">
							<table className="min-w-full divide-y divide-gray-200">
								<thead className="bg-gray-50">
									<tr>
										<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
											{t('group')}
										</th>
										<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
											{t('teacher')}
										</th>
										<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
											{t('subject')}
										</th>
										<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
											{t('learningContent')}
										</th>
										<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
											{t('room')}
										</th>
									</tr>
								</thead>
								<tbody className="bg-white divide-y divide-gray-200">
									{groups.map((group) => {
										const assignment = pmAssignments.find(a => a.groupId === group.id)
										return (
											<tr key={group.id}>
												<td className="px-6 py-4 whitespace-nowrap">
													{t('group')} {group.id}
												</td>
												<td className="px-6 py-4 whitespace-nowrap">
													<TeacherCombobox
														value={assignment?.teacherId ?? 0}
														onChange={(teacherId) => handleAssignmentChange('pm', group.id, 'teacherId', teacherId)}
														teachers={teachers}
													/>
												</td>
												<td className="px-6 py-4 whitespace-nowrap">
													<input
														type="text"
														value={assignment?.subject ?? ''}
														onChange={(e) => handleAssignmentChange('pm', group.id, 'subject', e.target.value)}
														className="border rounded px-2 py-1"
														placeholder={t('enterSubject')}
													/>
												</td>
												<td className="px-6 py-4 whitespace-nowrap">
													<input
														type="text"
														value={assignment?.learningContent ?? ''}
														onChange={(e) => handleAssignmentChange('pm', group.id, 'learningContent', e.target.value)}
														className="border rounded px-2 py-1"
														placeholder={t('enterLearningContent')}
													/>
												</td>
												<td className="px-6 py-4 whitespace-nowrap">
													<input
														type="text"
														value={assignment?.room ?? ''}
														onChange={(e) => handleAssignmentChange('pm', group.id, 'room', e.target.value)}
														className="border rounded px-2 py-1"
														placeholder={t('enterRoom')}
													/>
												</td>
											</tr>
										)
									})}
								</tbody>
							</table>
						</div>
					</div>

					<div className="flex justify-end">
						<button
							onClick={handleNext}
							className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 transition"
						>
							{t('next')}
						</button>
					</div>
				</div>
			</div>
		</div>
	)
} 