import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import { denyUnlessAccess } from '@/lib/api-guard'

const transferSchema = z.object({
	targetClassId: z.number().int().positive(),
	targetGroupId: z.number().int().nullable(),
	schoolYearId: z.number().int().positive()
})

/**
 * Handles POST requests to transfer a student to another class.
 *
 * Updates the student's `classId` and `groupId`, upserts the `ClassMembership`
 * row for the given school year to point to the new class, and ensures a
 * `GroupAssignment` row exists for the target group/class combination.
 *
 * Historical grade data (Grade, FinalGrade, NotenEntry) is intentionally left
 * untouched so it stays attached to the class in which it was produced.
 */
export async function POST(
	request: NextRequest,
	context: { params: Promise<{ id: string }> }
) {
  const denied = await denyUnlessAccess('staff')
  if (denied) return denied

	let rawBody = ''
	try {
		const { id: idParam } = await context.params
		const studentId = idParam ? parseInt(idParam, 10) : NaN

		if (!studentId || Number.isNaN(studentId)) {
			return NextResponse.json(
				{ error: 'Invalid student ID' },
				{ status: 400 }
			)
		}

		rawBody = await request.text()
		let parsedBody: unknown
		try {
			parsedBody = JSON.parse(rawBody)
		} catch {
			return NextResponse.json(
				{ error: 'Invalid request body' },
				{ status: 400 }
			)
		}

		const validation = transferSchema.safeParse(parsedBody)
		if (!validation.success) {
			return NextResponse.json(
				{ error: 'Validation failed', details: validation.error.format() },
				{ status: 400 }
			)
		}

		const { targetClassId, targetGroupId, schoolYearId } = validation.data

		const student = await prisma.student.findUnique({
			where: { id: studentId },
			include: { class: true }
		})

		if (!student) {
			return NextResponse.json(
				{ error: 'Student not found' },
				{ status: 404 }
			)
		}

		if (!student.classId) {
			return NextResponse.json(
				{ error: 'Student has no current class assigned' },
				{ status: 400 }
			)
		}

		if (student.classId === targetClassId) {
			return NextResponse.json(
				{ error: 'Student is already in the target class' },
				{ status: 400 }
			)
		}

		const targetClass = await prisma.class.findUnique({
			where: { id: targetClassId }
		})

		if (!targetClass) {
			return NextResponse.json(
				{ error: 'Target class not found' },
				{ status: 404 }
			)
		}

		const schoolYear = await prisma.schoolYear.findUnique({
			where: { id: schoolYearId }
		})

		if (!schoolYear) {
			return NextResponse.json(
				{ error: 'School year not found' },
				{ status: 404 }
			)
		}

		await prisma.$transaction(async (tx) => {
			await tx.student.update({
				where: { id: studentId },
				data: {
					classId: targetClassId,
					groupId: targetGroupId
				}
			})

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
				await tx.groupAssignment.upsert({
					where: {
						class_groupId: {
							class: targetClass.name,
							groupId: targetGroupId
						}
					},
					update: {},
					create: {
						class: targetClass.name,
						groupId: targetGroupId
					}
				})
			}
		})

		return NextResponse.json({
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
		return NextResponse.json(
			{ error: 'Failed to transfer student' },
			{ status: 500 }
		)
	}
}
