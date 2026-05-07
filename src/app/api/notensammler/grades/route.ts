import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isFeatureEnabled } from '@/lib/entitlements'
import { badRequest, forbidden, notFound, ok, serverError, unauthorized } from '@/lib/api-response'

// Force dynamic rendering - no caching
export const dynamic = 'force-dynamic'
export const revalidate = 0

const ALLOWED_GRADES = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7]

/**
 * Handles GET requests to retrieve all grades for a specific class.
 *
 * Returns grades grouped by student, teacher, and semester.
 *
 * @returns A JSON response containing grades in the format:
 * { [studentId]: { [teacherId]: { first: grade | null, second: grade | null } } }
 */
export async function GET(request: Request) {
	try {
		const session = await getServerSession(authOptions)
		if (!session?.user?.name) {
			return unauthorized('Unauthorized')
		}
		if (session.user?.role !== 'teacher' && session.user?.role !== 'admin') {
			return forbidden('Forbidden')
		}
		if (!(await isFeatureEnabled('notensammler'))) {
			return forbidden('Feature not available')
		}

		const { searchParams } = new URL(request.url)
		const classIdParam = searchParams.get('classId')
		const schoolYearIdParam = searchParams.get('schoolYearId')

		if (!classIdParam) {
			return badRequest('classId parameter is required')
		}

		const classId = parseInt(classIdParam)
		if (isNaN(classId)) {
			return badRequest('Invalid classId')
		}

		// Resolve school year: from query or current
		let schoolYearId: number | undefined = schoolYearIdParam ? parseInt(schoolYearIdParam, 10) : undefined
		if (schoolYearId == null || Number.isNaN(schoolYearId)) {
			const now = new Date()
			const current = await prisma.schoolYear.findFirst({
				where: { startDate: { lte: now }, endDate: { gte: now } },
				select: { id: true }
			})
			schoolYearId = current?.id ?? (await prisma.schoolYear.findFirst({ orderBy: { startDate: 'desc' }, select: { id: true } }))?.id
		}
		if (schoolYearId == null) {
			return badRequest('No school year found.')
		}

		// Verify class exists
		const classRecord = await prisma.class.findUnique({
			where: { id: classId }
		})

		if (!classRecord) {
			return notFound('Class not found')
		}

		// Fetch all grades for this class and school year
		const grades = await prisma.grade.findMany({
			where: { classId, schoolYearId },
			select: {
				studentId: true,
				teacherId: true,
				semester: true,
				grade: true
			}
		})

		console.log(`[GET /api/notensammler/grades] Found ${grades.length} grades for classId ${classId}`)

		// Group grades by student, then teacher, then semester
		const gradesByStudent: Record<number, Record<number, { first: number | null; second: number | null }>> = {}

		for (const gradeRecord of grades) {
			gradesByStudent[gradeRecord.studentId] ??= {}
			const studentGrades = gradesByStudent[gradeRecord.studentId]!
			studentGrades[gradeRecord.teacherId] ??= {
				first: null,
				second: null
			}
			const teacherGrades = studentGrades[gradeRecord.teacherId]!
			if (gradeRecord.semester === 'first') {
				teacherGrades.first = gradeRecord.grade
			} else if (gradeRecord.semester === 'second') {
				teacherGrades.second = gradeRecord.grade
			}
		}

		// Fetch final grades for this class and school year (including Betragensnote Wunsch)
		const finalGradeRecords = await prisma.finalGrade.findMany({
			where: { classId, schoolYearId },
			select: { studentId: true, semester: true, grade: true, conductNoteWish: true }
		})

		const finalGrades: Record<number, {
			first: number | null
			second: number | null
			conductWishFirst: string | null
			conductWishSecond: string | null
		}> = {}
		for (const fg of finalGradeRecords) {
			finalGrades[fg.studentId] ??= {
				first: null,
				second: null,
				conductWishFirst: null,
				conductWishSecond: null
			}
			if (fg.semester === 'first') {
				finalGrades[fg.studentId]!.first = fg.grade
				finalGrades[fg.studentId]!.conductWishFirst = fg.conductNoteWish ?? null
			} else if (fg.semester === 'second') {
				finalGrades[fg.studentId]!.second = fg.grade
				finalGrades[fg.studentId]!.conductWishSecond = fg.conductNoteWish ?? null
			}
		}

		console.log(`[GET /api/notensammler/grades] Returning ${Object.keys(gradesByStudent).length} students with grades`)
		return ok({ grades: gradesByStudent, finalGrades })
	} catch (error) {
		captureError(error, {
			location: 'api/notensammler/grades',
			type: 'fetch-grades'
		})
		return serverError('Failed to fetch grades')
	}
}

/**
 * Handles POST requests to save or update a grade.
 *
 * Validates the grade value (must be one of: 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, or null),
 * verifies that student, teacher, and class exist, and upserts the grade record.
 *
 * @returns A JSON response with success status or an error message.
 */
export async function POST(request: Request) {
	let requestData: unknown
	try {
		const session = await getServerSession(authOptions)
		if (!session?.user?.name) {
			return unauthorized('Unauthorized')
		}
		if (session.user?.role !== 'teacher' && session.user?.role !== 'admin') {
			return forbidden('Forbidden')
		}
		if (!(await isFeatureEnabled('notensammler'))) {
			return forbidden('Feature not available')
		}

		const body = await request.json() as { studentId: unknown; teacherId: unknown; classId: unknown; semester: unknown; grade: unknown; schoolYearId?: number }
		requestData = body
		const { studentId, teacherId, classId, semester, grade, schoolYearId: bodySchoolYearId } = body

		// Resolve school year: from body or current
		let schoolYearId = bodySchoolYearId
		if (schoolYearId == null) {
			const now = new Date()
			const current = await prisma.schoolYear.findFirst({
				where: { startDate: { lte: now }, endDate: { gte: now } },
				select: { id: true }
			})
			schoolYearId = current?.id ?? (await prisma.schoolYear.findFirst({ orderBy: { startDate: 'desc' }, select: { id: true } }))?.id
		}
		if (schoolYearId == null) {
			return badRequest('No school year found. Create a school year in Admin / Data / School Years first.')
		}

		// Validate required fields
		if (studentId === undefined || teacherId === undefined || classId === undefined || semester === undefined) {
			return badRequest('Missing required fields: studentId, teacherId, classId, semester')
		}

		// Validate semester
		if (semester !== 'first' && semester !== 'second') {
			return badRequest('Semester must be "first" or "second"')
		}

		// Validate grade value (can be null or one of the allowed values)
		if (grade !== null && grade !== undefined) {
			const gradeNum = typeof grade === 'string' 
				? parseFloat(grade) 
				: typeof grade === 'number' 
					? grade 
					: NaN
			if (isNaN(gradeNum) || !ALLOWED_GRADES.includes(gradeNum)) {
				return badRequest(`Grade must be one of: ${ALLOWED_GRADES.join(', ')} or null`)
			}
		}

		// Parse IDs
		const studentIdNum = typeof studentId === 'string' ? parseInt(studentId) : typeof studentId === 'number' ? studentId : NaN
		const teacherIdNum = typeof teacherId === 'string' ? parseInt(teacherId) : typeof teacherId === 'number' ? teacherId : NaN
		const classIdNum = typeof classId === 'string' ? parseInt(classId) : typeof classId === 'number' ? classId : NaN

		if (isNaN(studentIdNum) || isNaN(teacherIdNum) || isNaN(classIdNum)) {
			return badRequest('Invalid ID format')
		}

		// Verify student exists
		const student = await prisma.student.findUnique({
			where: { id: studentIdNum }
		})
		if (!student) {
			return notFound('Student not found')
		}

		// Verify teacher exists
		const teacher = await prisma.teacher.findUnique({
			where: { id: teacherIdNum }
		})
		if (!teacher) {
			return notFound('Teacher not found')
		}

		// Verify class exists
		const classRecord = await prisma.class.findUnique({
			where: { id: classIdNum }
		})
		if (!classRecord) {
			return notFound('Class not found')
		}

		// Upsert grade (create or update)
		const gradeValue = grade === null || grade === undefined 
			? null 
			: typeof grade === 'number' 
				? grade 
				: typeof grade === 'string' 
					? parseFloat(grade) 
					: null

		console.log(`[POST /api/notensammler/grades] Attempting to upsert grade:`, {
			studentId: studentIdNum,
			teacherId: teacherIdNum,
			classId: classIdNum,
			semester,
			grade: gradeValue
		})

		const result = await prisma.grade.upsert({
			where: {
				studentId_teacherId_classId_semester_schoolYearId: {
					studentId: studentIdNum,
					teacherId: teacherIdNum,
					classId: classIdNum,
					semester: semester as 'first' | 'second',
					schoolYearId
				}
			},
			update: {
				grade: gradeValue
			},
			create: {
				studentId: studentIdNum,
				teacherId: teacherIdNum,
				classId: classIdNum,
				semester: semester as 'first' | 'second',
				schoolYearId,
				grade: gradeValue
			}
		})

		// Log for debugging
		console.log(`[POST /api/notensammler/grades] Grade saved successfully:`, {
			id: result.id,
			studentId: result.studentId,
			teacherId: result.teacherId,
			classId: result.classId,
			semester: result.semester,
			grade: result.grade
		})

		// Verify the grade was actually saved by reading it back
		const verifyGrade = await prisma.grade.findUnique({
			where: {
				studentId_teacherId_classId_semester_schoolYearId: {
					studentId: studentIdNum,
					teacherId: teacherIdNum,
					classId: classIdNum,
					semester: semester as 'first' | 'second',
					schoolYearId
				}
			}
		})

		if (!verifyGrade) {
			console.error(`[POST /api/notensammler/grades] WARNING: Grade was not found after upsert!`)
		} else {
			console.log(`[POST /api/notensammler/grades] Verification: Grade exists in DB with value: ${verifyGrade.grade}`)
		}

		return ok({ success: true, grade: result })
	} catch (error) {
		console.error('Error saving grade:', error)
		console.error('Request data:', requestData)
		captureError(error, {
			location: 'api/notensammler/grades',
			type: 'save-grade',
			extra: {
				requestData,
				errorMessage: error instanceof Error ? error.message : String(error),
				errorStack: error instanceof Error ? error.stack : undefined
			}
		})
		return serverError('Failed to save grade', error instanceof Error ? error.message : String(error))
	}
}

/**
 * Handles DELETE requests to remove all grades for a specific teacher in a class.
 *
 * Deletes all Grade records matching teacherId and classId (both first and second semester).
 *
 * @returns A JSON response with success status or an error message.
 */
export async function DELETE(request: Request) {
	try {
		const session = await getServerSession(authOptions)
		if (!session?.user?.name) {
			return unauthorized('Unauthorized')
		}
		if (session.user?.role !== 'teacher' && session.user?.role !== 'admin') {
			return forbidden('Forbidden')
		}
		if (!(await isFeatureEnabled('notensammler'))) {
			return forbidden('Feature not available')
		}

		const { searchParams } = new URL(request.url)
		const teacherIdParam = searchParams.get('teacherId')
		const classIdParam = searchParams.get('classId')

		if (!teacherIdParam || !classIdParam) {
			return badRequest('teacherId and classId parameters are required')
		}

		const teacherId = parseInt(teacherIdParam)
		const classId = parseInt(classIdParam)

		if (isNaN(teacherId) || isNaN(classId)) {
			return badRequest('Invalid teacherId or classId format')
		}

		// Verify teacher exists
		const teacher = await prisma.teacher.findUnique({
			where: { id: teacherId }
		})
		if (!teacher) {
			return notFound('Teacher not found')
		}

		// Verify class exists
		const classRecord = await prisma.class.findUnique({
			where: { id: classId }
		})
		if (!classRecord) {
			return notFound('Class not found')
		}

		// Delete all grades for this teacher in this class
		const result = await prisma.grade.deleteMany({
			where: {
				teacherId,
				classId
			}
		})

		return ok({ 
			success: true, 
			deletedCount: result.count 
		})
	} catch (error) {
		captureError(error, {
			location: 'api/notensammler/grades',
			type: 'delete-teacher-grades'
		})
		return serverError('Failed to delete grades')
	}
}

