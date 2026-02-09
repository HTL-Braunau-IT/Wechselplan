import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parse } from 'csv-parse/sync'
import { getServerSession } from 'next-auth'
import { authOptions, hasRole } from '@/lib/auth'
import { captureError } from '@/lib/sentry'
import { normalizeUsername } from '@/lib/username'

const ALLOWED_GRADES = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7]

interface ImportRequest {
	data: string // CSV data
}

/**
 * Handles POST requests to import grades from a CSV file.
 *
 * Expects CSV with columns: className, studentUsername, teacherUsername, semester, grade
 * Optional columns: studentFirstName, studentLastName, teacherFirstName, teacherLastName (for validation)
 *
 * @returns A JSON response with import statistics or an error message.
 */
export async function POST(request: Request) {
	const rawBody = await request.text()
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

		const body = JSON.parse(rawBody) as ImportRequest & { schoolYearId?: number }
		const { data, schoolYearId: bodySchoolYearId } = body

		// Resolve school year: from body or current (today between start and end)
		let schoolYearId = bodySchoolYearId
		if (schoolYearId == null) {
			const now = new Date()
			const current = await prisma.schoolYear.findFirst({
				where: {
					startDate: { lte: now },
					endDate: { gte: now }
				},
				select: { id: true }
			})
			schoolYearId = current?.id ?? (await prisma.schoolYear.findFirst({ orderBy: { startDate: 'desc' }, select: { id: true } }))?.id
		}
		if (schoolYearId == null) {
			return NextResponse.json(
				{ error: 'No school year found. Create a school year in Admin / Data / School Years first.' },
				{ status: 400 }
			)
		}

		// Parse CSV data
		const records = parse(data, {
			columns: true,
			skip_empty_lines: true,
			trim: true
		}) as Record<string, string>[]

		if (records.length === 0) {
			return NextResponse.json(
				{ error: 'CSV file is empty' },
				{ status: 400 }
			)
		}

		// Validate required columns
		const requiredColumns = ['className', 'studentUsername', 'teacherUsername', 'semester']
		const firstRecord = records[0]!
		const missingColumns = requiredColumns.filter(col => !(col in firstRecord))
		if (missingColumns.length > 0) {
			return NextResponse.json(
				{ error: `Missing required columns: ${missingColumns.join(', ')}` },
				{ status: 400 }
			)
		}

		// Get all unique classes, students, and teachers to batch fetch (normalize usernames for DB lookup)
		const classNames = [...new Set(records.map(r => r.className).filter((name): name is string => !!name))]
		const studentUsernames = [...new Set(records.map(r => normalizeUsername(r.studentUsername ?? '')).filter((u): u is string => !!u))]
		const teacherUsernames = [...new Set(records.map(r => normalizeUsername(r.teacherUsername ?? '')).filter((u): u is string => !!u))]

		// Fetch all classes, students, and teachers
		const [classes, students, teachers] = await Promise.all([
			prisma.class.findMany({
				where: { name: { in: classNames } },
				select: { id: true, name: true }
			}),
			prisma.student.findMany({
				where: { username: { in: studentUsernames } },
				select: { id: true, username: true }
			}),
			prisma.teacher.findMany({
				where: { username: { in: teacherUsernames } },
				select: { id: true, username: true }
			})
		])

		// Create lookup maps
		const classMap = new Map(classes.map(c => [c.name, c.id]))
		const studentMap = new Map(students.map(s => [s.username, s.id]))
		const teacherMap = new Map(teachers.map(t => [t.username, t.id]))

		// Process records
		const errors: string[] = []
		const processed: Array<{
			studentId: number
			teacherId: number
			classId: number
			semester: 'first' | 'second'
			grade: number | null
			schoolYearId: number
		}> = []

		for (let i = 0; i < records.length; i++) {
			const record = records[i]!
			const rowNum = i + 2 // +2 because CSV is 1-indexed and we skip header

			// Validate required fields exist
			if (!record.className || !record.studentUsername || !record.teacherUsername || !record.semester) {
				errors.push(`Row ${rowNum}: Missing required fields (className, studentUsername, teacherUsername, or semester)`)
				continue
			}

			// Validate class
			const classId = classMap.get(record.className)
			if (!classId) {
				errors.push(`Row ${rowNum}: Class "${record.className}" not found`)
				continue
			}

			// Validate student (lookup by normalized username)
			const studentId = studentMap.get(normalizeUsername(record.studentUsername))
			if (!studentId) {
				errors.push(`Row ${rowNum}: Student with username "${record.studentUsername}" not found`)
				continue
			}

			// Validate teacher (lookup by normalized username)
			const teacherId = teacherMap.get(normalizeUsername(record.teacherUsername))
			if (!teacherId) {
				errors.push(`Row ${rowNum}: Teacher with username "${record.teacherUsername}" not found`)
				continue
			}

			// Validate semester
			if (record.semester !== 'first' && record.semester !== 'second') {
				errors.push(`Row ${rowNum}: Semester must be "first" or "second", got "${record.semester}"`)
				continue
			}

			// Validate and parse grade
			let grade: number | null = null
			if (record.grade && record.grade.trim() !== '') {
				const gradeNum = parseFloat(record.grade)
				if (isNaN(gradeNum)) {
					errors.push(`Row ${rowNum}: Invalid grade value "${record.grade}"`)
					continue
				}
				if (!ALLOWED_GRADES.includes(gradeNum)) {
					errors.push(`Row ${rowNum}: Grade must be one of: ${ALLOWED_GRADES.join(', ')}, got "${record.grade}"`)
					continue
				}
				grade = gradeNum
			}

			processed.push({
				studentId,
				teacherId,
				classId,
				semester: record.semester as 'first' | 'second',
				grade,
				schoolYearId
			})
		}

		if (errors.length > 0 && processed.length === 0) {
			return NextResponse.json(
				{ error: 'All rows failed validation', errors },
				{ status: 400 }
			)
		}

		// Upsert grades in batches
		let successCount = 0
		let errorCount = 0

		for (const gradeData of processed) {
			try {
				await prisma.grade.upsert({
					where: {
						studentId_teacherId_classId_semester_schoolYearId: {
							studentId: gradeData.studentId,
							teacherId: gradeData.teacherId,
							classId: gradeData.classId,
							semester: gradeData.semester,
							schoolYearId: gradeData.schoolYearId
						}
					},
					update: {
						grade: gradeData.grade
					},
					create: {
						studentId: gradeData.studentId,
						teacherId: gradeData.teacherId,
						classId: gradeData.classId,
						semester: gradeData.semester,
						schoolYearId: gradeData.schoolYearId,
						grade: gradeData.grade
					}
				})
				successCount++
			} catch (error) {
				errorCount++
				errors.push(`Failed to upsert grade: ${error instanceof Error ? error.message : 'Unknown error'}`)
			}
		}

		return NextResponse.json({
			success: true,
			imported: successCount,
			errors: errorCount,
			validationErrors: errors.length > processed.length ? errors : undefined
		})
	} catch (error: unknown) {
		captureError(error, {
			location: 'api/admin/grades/import',
			type: 'import-grades',
			extra: { requestBody: rawBody }
		})
		return NextResponse.json(
			{ error: 'Failed to import grades', message: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		)
	}
}

