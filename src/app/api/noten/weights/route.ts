import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isFeatureEnabled } from '@/lib/entitlements'
import { normalizeUsername } from '@/lib/username'
import { badRequest, forbidden, ok, serverError, unauthorized } from '@/lib/api-response'

/**
 * PATCH: Upsert NotenWeightConfig for (teacher, class, group, school year). Sum of weights must be 100.
 */
export async function PATCH(request: Request) {
	try {
		const session = await getServerSession(authOptions)
		if (!session?.user?.name) {
			return unauthorized('Unauthorized')
		}
		if (session.user?.role !== 'teacher' && session.user?.role !== 'admin') {
			return forbidden('Forbidden')
		}
		if (!(await isFeatureEnabled('noten'))) {
			return forbidden('Feature not available')
		}

		const body = await request.json()
		const {
			classId,
			groupId,
			schoolYearId,
			weightWiederholung,
			weightBericht,
			weightMitarbeit,
			weightPraktischeArbeit
		} = body as {
			classId?: number
			groupId?: number
			schoolYearId?: number
			weightWiederholung?: number
			weightBericht?: number
			weightMitarbeit?: number
			weightPraktischeArbeit?: number
		}

		if (
			classId == null ||
			groupId == null ||
			schoolYearId == null ||
			weightWiederholung == null ||
			weightBericht == null ||
			weightMitarbeit == null ||
			weightPraktischeArbeit == null
		) {
			return badRequest('Missing required fields')
		}
		const sum =
			Number(weightWiederholung) +
			Number(weightBericht) +
			Number(weightMitarbeit) +
			Number(weightPraktischeArbeit)
		if (sum !== 100) {
			return badRequest('Weights must sum to 100')
		}

		const username = normalizeUsername(session.user.name)
		const teacher = await prisma.teacher.findUnique({ where: { username } })
		if (!teacher) {
			return forbidden('Teacher not found')
		}

		const isAssignedToClass = await prisma.teacherAssignment.findFirst({
			where: { teacherId: teacher.id, classId, schoolYearId }
		})
		if (!isAssignedToClass) {
			return forbidden('Not assigned to this class')
		}

		await prisma.notenWeightConfig.upsert({
			where: {
				teacherId_classId_groupId_schoolYearId: {
					teacherId: teacher.id,
					classId,
					groupId,
					schoolYearId
				}
			},
			create: {
				teacherId: teacher.id,
				classId,
				groupId,
				schoolYearId,
				weightWiederholung: Number(weightWiederholung),
				weightBericht: Number(weightBericht),
				weightMitarbeit: Number(weightMitarbeit),
				weightPraktischeArbeit: Number(weightPraktischeArbeit)
			},
			update: {
				weightWiederholung: Number(weightWiederholung),
				weightBericht: Number(weightBericht),
				weightMitarbeit: Number(weightMitarbeit),
				weightPraktischeArbeit: Number(weightPraktischeArbeit)
			}
		})

		return ok({ success: true })
	} catch (error) {
		captureError(error, {
			location: 'api/noten/weights',
			type: 'save-weights'
		})
		return serverError('Failed to save weights')
	}
}
