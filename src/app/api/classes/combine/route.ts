import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import type { Student } from '@prisma/client'
import { badRequest, created, notFound, serverError, unprocessable } from '@/lib/api-response'
import { resolveSchoolYearId } from '@/lib/year-aware-class-staff'

interface CombineClassesRequest {
	class1Id: number
	class2Id: number
	combinedClassName: string
	schoolYearId?: number
}

/**
 * Handles POST requests to combine two classes into one.
 *
 * Creates a new class with the specified name and moves all students from both source classes to the new combined class.
 * Handles username conflicts by adding numeric suffixes and ensures all operations are performed within a database transaction.
 *
 * @param request - The HTTP request containing the class IDs and combined class name
 * @returns A JSON response containing the new class information or an error message
 */
export async function POST(request: Request) {
	let requestBody: CombineClassesRequest | Record<string, unknown> = {}
	try {
		const body = await request.json() as CombineClassesRequest
		requestBody = body
		const { class1Id, class2Id, combinedClassName } = body

		// Validate input
		if (!class1Id || !class2Id || !combinedClassName) {
			return badRequest('Missing required fields: class1Id, class2Id, and combinedClassName are required')
		}

		if (class1Id === class2Id) {
			return badRequest('Cannot combine a class with itself')
		}

		// Check if combined class name already exists
		const existingClass = await prisma.class.findUnique({
			where: { name: combinedClassName }
		})

		if (existingClass) {
			return unprocessable('A class with this name already exists')
		}

		// Verify both source classes exist
		const [class1, class2] = await Promise.all([
			prisma.class.findUnique({
				where: { id: class1Id }
			}),
			prisma.class.findUnique({
				where: { id: class2Id }
			})
		])

		if (!class1) {
			return notFound(`Class with ID ${class1Id} not found`)
		}

		if (!class2) {
			return notFound(`Class with ID ${class2Id} not found`)
		}

		const schoolYearId = body.schoolYearId ?? (await resolveSchoolYearId())
		if (schoolYearId == null) {
			return badRequest('No school year configured. Cannot combine classes without an active school year.')
		}

		// Check if both classes have students for the active school year
		// (class assignment now lives on ClassMembership).
		const [class1StudentCount, class2StudentCount] = await Promise.all([
			prisma.classMembership.count({ where: { classId: class1Id, schoolYearId } }),
			prisma.classMembership.count({ where: { classId: class2Id, schoolYearId } })
		])

		if (class1StudentCount === 0 && class2StudentCount === 0) {
			return badRequest('Both classes must have at least one student to combine')
		}

		// Check if the combined class would exceed the maximum allowed students (36)
		const totalStudents = class1StudentCount + class2StudentCount
		const MAX_COMBINED_STUDENTS = 36

		if (totalStudents > MAX_COMBINED_STUDENTS) {
			return unprocessable(
				`Cannot combine classes: The combined class would have ${totalStudents} students, but the maximum allowed is ${MAX_COMBINED_STUDENTS} students. Please reduce the number of students in one or both classes before combining.`,
				{
					class1Students: class1StudentCount,
					class2Students: class2StudentCount,
					totalStudents,
					maxAllowed: MAX_COMBINED_STUDENTS
				}
			)
		}

		// Perform the combination within a transaction
		const result = await prisma.$transaction(async (tx) => {
			// Create the new combined class
			const combinedClass = await tx.class.create({
				data: {
					name: combinedClassName,
					description: `Combined class from ${class1.name} and ${class2.name}`,
					// Store original class information in a structured way
					// We'll use a JSON field or additional metadata
				}
			})

			// Get all students from both classes (year-scoped via ClassMembership)
			const [class1Memberships, class2Memberships] = await Promise.all([
				tx.classMembership.findMany({
					where: { classId: class1Id, schoolYearId },
					select: { studentId: true }
				}),
				tx.classMembership.findMany({
					where: { classId: class2Id, schoolYearId },
					select: { studentId: true }
				})
			])
			const class1StudentIds = class1Memberships.map(m => m.studentId)
			const class2StudentIds = class2Memberships.map(m => m.studentId)
			const [class1Students, class2Students] = await Promise.all([
				class1StudentIds.length > 0
					? tx.student.findMany({ where: { id: { in: class1StudentIds } } })
					: Promise.resolve([]),
				class2StudentIds.length > 0
					? tx.student.findMany({ where: { id: { in: class2StudentIds } } })
					: Promise.resolve([])
			])
			
			// Add original class information to students
			const class1StudentsWithOrigin = class1Students.map(student => ({
				...student,
				originalClass: class1.name
			}))
			const class2StudentsWithOrigin = class2Students.map(student => ({
				...student,
				originalClass: class2.name
			}))
			
			type StudentWithOrigin = Student & { originalClass: string }
			const allStudents: StudentWithOrigin[] = [...class1StudentsWithOrigin, ...class2StudentsWithOrigin]
			
			// Handle username conflicts by adding numeric suffixes
			const usernameMap = new Map<string, string>()

			for (const student of allStudents) {
				let finalUsername = student.username
				let counter = 1

				// Check if username already exists in the combined class
				while (usernameMap.has(finalUsername) || 
					   await tx.student.findUnique({ where: { username: finalUsername } })) {
					finalUsername = `${student.username}${counter}`
					counter++
				}

				usernameMap.set(student.username, finalUsername)

				// Store original class information in the username as a prefix
				// Format: "10A_john.doe" or "10B_john.doe1"
				const originalClassPrefix = student.originalClass ? `${student.originalClass}_` : ''
				const usernameWithOrigin = `${originalClassPrefix}${finalUsername}`

				// Update student username only; class assignment moves through
				// ClassMembership for the active school year.
				await tx.student.update({
					where: { id: student.id },
					data: {
						username: usernameWithOrigin
					}
				})
				await tx.classMembership.upsert({
					where: { studentId_schoolYearId: { studentId: student.id, schoolYearId } },
					create: { studentId: student.id, classId: combinedClass.id, schoolYearId },
					update: { classId: combinedClass.id }
				})
			}

			// Get the final count of students in the combined class
			const finalStudentCount = await tx.classMembership.count({
				where: { classId: combinedClass.id, schoolYearId }
			})

			return {
				class: combinedClass,
				studentCount: finalStudentCount,
				originalClasses: {
					class1: { name: class1.name, studentCount: class1StudentCount },
					class2: { name: class2.name, studentCount: class2StudentCount }
				}
			}
		})

		return created({
			combinedClass: result.class,
			studentCount: result.studentCount,
			originalClasses: result.originalClasses
		}, 'Classes combined successfully')

	} catch (error) {
		captureError(error, {
			location: 'api/classes/combine',
			type: 'combine-classes',
			extra: {
				requestBody
			}
		})

		return serverError('Failed to combine classes')
	}
}
