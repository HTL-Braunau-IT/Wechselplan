import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import type { Student } from '@prisma/client'

interface CombineClassesRequest {
	class1Id: number
	class2Id: number
	combinedClassName: string
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
	try {
		const body = await request.json() as CombineClassesRequest
		const { class1Id, class2Id, combinedClassName } = body

		// Validate input
		if (!class1Id || !class2Id || !combinedClassName) {
			return NextResponse.json(
				{ error: 'Missing required fields: class1Id, class2Id, and combinedClassName are required' },
				{ status: 400 }
			)
		}

		if (class1Id === class2Id) {
			return NextResponse.json(
				{ error: 'Cannot combine a class with itself' },
				{ status: 400 }
			)
		}

		// Check if combined class name already exists
		const existingClass = await prisma.class.findUnique({
			where: { name: combinedClassName }
		})

		if (existingClass) {
			return NextResponse.json(
				{ error: 'A class with this name already exists' },
				{ status: 400 }
			)
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
			return NextResponse.json(
				{ error: `Class with ID ${class1Id} not found` },
				{ status: 404 }
			)
		}

		if (!class2) {
			return NextResponse.json(
				{ error: `Class with ID ${class2Id} not found` },
				{ status: 404 }
			)
		}

		// Check if both classes have students
		const [class1StudentCount, class2StudentCount] = await Promise.all([
			prisma.student.count({ where: { classId: class1Id } }),
			prisma.student.count({ where: { classId: class2Id } })
		])

		if (class1StudentCount === 0 && class2StudentCount === 0) {
			return NextResponse.json(
				{ error: 'Both classes must have at least one student to combine' },
				{ status: 400 }
			)
		}

		// Check if the combined class would exceed the maximum allowed students (36)
		const totalStudents = class1StudentCount + class2StudentCount
		const MAX_COMBINED_STUDENTS = 36

		if (totalStudents > MAX_COMBINED_STUDENTS) {
			return NextResponse.json(
				{ 
					error: `Cannot combine classes: The combined class would have ${totalStudents} students, but the maximum allowed is ${MAX_COMBINED_STUDENTS} students. Please reduce the number of students in one or both classes before combining.`,
					details: {
						class1Students: class1StudentCount,
						class2Students: class2StudentCount,
						totalStudents,
						maxAllowed: MAX_COMBINED_STUDENTS
					}
				},
				{ status: 400 }
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

			// Get all students from both classes
			const [class1Students, class2Students] = await Promise.all([
				tx.student.findMany({ where: { classId: class1Id } }),
				tx.student.findMany({ where: { classId: class2Id } })
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

				// Update student to belong to the new combined class
				await tx.student.update({
					where: { id: student.id },
					data: {
						classId: combinedClass.id,
						username: usernameWithOrigin
					}
				})
			}

			// Get the final count of students in the combined class
			const finalStudentCount = await tx.student.count({
				where: { classId: combinedClass.id }
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

		return NextResponse.json({
			message: 'Classes combined successfully',
			combinedClass: result.class,
			studentCount: result.studentCount,
			originalClasses: result.originalClasses
		})

	} catch (error) {
		captureError(error, {
			location: 'api/classes/combine',
			type: 'combine-classes',
			extra: {
				requestBody: await request.json().catch(() => ({}))
			}
		})

		return NextResponse.json(
			{ error: 'Failed to combine classes' },
			{ status: 500 }
		)
	}
}
