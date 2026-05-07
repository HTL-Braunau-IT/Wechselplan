import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import { badRequest, notFound, ok, serverError, unprocessable } from '@/lib/api-response'

const transferSchema = z.object({
	targetClassId: z.number().int().positive(),
	targetGroupId: z.number().int().nullable(),
	schoolYearId: z.number().int().positive()
})

/**
 * Handles POST requests to transfer a student to another class.
 *
 * Upserts the `ClassMembership` row for the given school year to point to
 * the new class and updates weekday group membership in
 * `StudentWeekdayGroup`. Class assignment is now stored exclusively in
 * `ClassMembership`; the legacy `Student.classId` column is no longer
 * read or written.
 *
 * Historical grade data (Grade, FinalGrade, NotenEntry) is intentionally left
 * untouched so it stays attached to the class in which it was produced.
 */
export async function POST(
	request: NextRequest,
	context: { params: Promise<{ id: string }> }
) {
	let rawBody = ''
	try {
		const { id: idParam } = await context.params
		const studentId = idParam ? parseInt(idParam, 10) : NaN

		if (!studentId || Number.isNaN(studentId)) {
			return badRequest('Invalid student ID')
		}

		rawBody = await request.text()
		let parsedBody: unknown
		try {
			parsedBody = JSON.parse(rawBody)
		} catch {
			return badRequest('Invalid request body')
		}

		const validation = transferSchema.safeParse(parsedBody)
		if (!validation.success) {
			return unprocessable('Validation failed', validation.error.format())
		}

		const { targetClassId, targetGroupId, schoolYearId } = validation.data

		const student = await prisma.student.findUnique({
			where: { id: studentId }
		})

		if (!student) {
			return notFound('Student not found')
		}

		const existingMembership = await prisma.classMembership.findUnique({
			where: {
				studentId_schoolYearId: { studentId, schoolYearId }
			},
			select: { classId: true }
		})

		if (!existingMembership) {
			return badRequest('Student has no current class assigned for this school year')
		}

		if (existingMembership.classId === targetClassId) {
			return badRequest('Student is already in the target class')
		}

		const targetClass = await prisma.class.findUnique({
			where: { id: targetClassId }
		})

		if (!targetClass) {
			return notFound('Target class not found')
		}

		const schoolYear = await prisma.schoolYear.findUnique({
			where: { id: schoolYearId }
		})

		if (!schoolYear) {
			return notFound('School year not found')
		}

		await prisma.$transaction(async (tx) => {
			await tx.classMembership.upsert({
				where: {
					studentId_schoolYearId: {
						studentId,
						schoolYearId
					}
				},
				update: {
					classId: targetClassId
				},
				create: {
					studentId,
					classId: targetClassId,
					schoolYearId
				}
			})

			if (targetGroupId != null && targetGroupId !== 0) {
				for (const weekday of [1, 2, 3, 4, 5]) {
					await tx.studentWeekdayGroup.upsert({
						where: {
							studentId_schoolYearId_weekday: {
								studentId,
								schoolYearId,
								weekday
							}
						},
						update: { groupId: targetGroupId },
						create: { studentId, schoolYearId, weekday, groupId: targetGroupId }
					})
				}
			} else {
				await tx.studentWeekdayGroup.deleteMany({
					where: { studentId, schoolYearId }
				})
			}
		})

		return ok({
			success: true,
			student: {
				id: studentId,
				classId: targetClassId,
				groupId: targetGroupId
			}
		})
	} catch (error) {
		captureError(error, {
			location: 'api/students/[id]/transfer',
			type: 'transfer-student',
			extra: { requestBody: rawBody }
		})
		return serverError('Failed to transfer student')
	}
}
