import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isFeatureEnabled } from '@/lib/entitlements'
import { normalizeUsername } from '@/lib/username'

/**
 * PATCH: Upsert NotenWeightConfig for (teacher, class, group, school year). Sum of weights must be 100.
 */
export async function PATCH(request: Request) {
	try {
		const session = await getServerSession(authOptions)
		if (!session?.user?.name) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
		}
		if (session.user?.role !== 'teacher' && session.user?.role !== 'admin') {
			return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
		}
		if (!(await isFeatureEnabled('noten'))) {
			return NextResponse.json({ error: 'Feature not available' }, { status: 403 })
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
			return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
		}
		const sum =
			Number(weightWiederholung) +
			Number(weightBericht) +
			Number(weightMitarbeit) +
			Number(weightPraktischeArbeit)
		if (sum !== 100) {
			return NextResponse.json({ error: 'Weights must sum to 100' }, { status: 400 })
		}

		const username = normalizeUsername(session.user.name)
		const teacher = await prisma.teacher.findUnique({ where: { username } })
		if (!teacher) {
			return NextResponse.json({ error: 'Teacher not found' }, { status: 403 })
		}

		const isAssignedToClass = await prisma.teacherAssignment.findFirst({
			where: { teacherId: teacher.id, classId, schoolYearId }
		})
		if (!isAssignedToClass) {
			return NextResponse.json({ error: 'Not assigned to this class' }, { status: 403 })
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

		return NextResponse.json({ success: true })
	} catch (error) {
		captureError(error, {
			location: 'api/noten/weights',
			type: 'save-weights'
		})
		return NextResponse.json(
			{ error: 'Failed to save weights' },
			{ status: 500 }
		)
	}
}
