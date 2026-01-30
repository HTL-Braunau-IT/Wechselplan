import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions, hasRole } from '@/lib/auth'
import { captureError } from '@/lib/sentry'

/**
 * Handles GET requests to export all grades from all classes as a CSV file.
 *
 * Returns a CSV file with columns: className, studentUsername, studentFirstName, studentLastName, teacherUsername, teacherFirstName, teacherLastName, semester, grade
 *
 * @returns A CSV file response or an error message.
 */
export async function GET() {
	try {
		const session = await getServerSession(authOptions)
		if (!session?.user?.name) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
		}
		
		// Check if user has admin or teacher role (either from session or database)
		const isAdmin = session.user?.role === 'admin' || await hasRole(session.user.name, 'admin')
		const isTeacher = session.user?.role === 'teacher' || await hasRole(session.user.name, 'teacher')
		if (!isAdmin && !isTeacher) {
			return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
		}

		// Fetch all grades with related data
		const grades = await prisma.grade.findMany({
			include: {
				student: {
					select: {
						username: true,
						firstName: true,
						lastName: true
					}
				},
				teacher: {
					select: {
						username: true,
						firstName: true,
						lastName: true
					}
				},
				class: {
					select: {
						name: true
					}
				}
			},
			orderBy: [
				{ class: { name: 'asc' } },
				{ student: { lastName: 'asc' } },
				{ student: { firstName: 'asc' } },
				{ teacher: { lastName: 'asc' } },
				{ semester: 'asc' }
			]
		})

		// Build CSV content
		const headers = [
			'className',
			'studentUsername',
			'studentFirstName',
			'studentLastName',
			'teacherUsername',
			'teacherFirstName',
			'teacherLastName',
			'semester',
			'grade'
		]

		const rows = grades.map((grade) => {
			return [
				grade.class.name,
				grade.student.username,
				grade.student.firstName,
				grade.student.lastName,
				grade.teacher.username,
				grade.teacher.firstName,
				grade.teacher.lastName,
				grade.semester,
				grade.grade?.toString() ?? ''
			]
		})

		// Escape CSV values (handle commas, quotes, newlines)
		const escapeCsvValue = (value: string): string => {
			if (value.includes(',') || value.includes('"') || value.includes('\n')) {
				return `"${value.replace(/"/g, '""')}"`
			}
			return value
		}

		const csvContent = [
			headers.map(escapeCsvValue).join(','),
			...rows.map((row) => row.map(escapeCsvValue).join(','))
		].join('\n')

		// Return CSV file
		return new NextResponse(csvContent, {
			headers: {
				'Content-Type': 'text/csv; charset=utf-8',
				'Content-Disposition': `attachment; filename="grades_export_${new Date().toISOString().split('T')[0]}.csv"`
			}
		})
	} catch (error) {
		captureError(error, {
			location: 'api/admin/grades/export',
			type: 'export-grades'
		})
		return NextResponse.json(
			{ error: 'Failed to export grades' },
			{ status: 500 }
		)
	}
}

