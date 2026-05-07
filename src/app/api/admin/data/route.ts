import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import { badRequest, conflict, created, notFound, ok, serverError, unprocessable } from '@/lib/api-response'
import { Prisma } from '@prisma/client'
import { resolveSchoolYearId, setClassYearStaff } from '@/lib/year-aware-class-staff'

const VALID_MODELS = [
  'student', 'teacher', 'class', 'classYearStaff', 'schedule',
  'teacherAssignment', 'room', 'subject', 'learningContent',
  'schoolHoliday', 'schoolYear', 'scheduleTime', 'breakTime',
  'teacherRotation', 'role', 'userRole', 'supportMessage'
] as const

function isValidModel(model: string): model is (typeof VALID_MODELS)[number] {
  return (VALID_MODELS as readonly string[]).includes(model)
}

function mapApiError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') return conflict('Resource already exists')
    if (error.code === 'P2025') return notFound('Resource not found')
    if (error.code === 'P2003') return unprocessable('Operation violates referential integrity')
  }

  if (error instanceof SyntaxError) {
    return badRequest('Invalid JSON body')
  }

  if (error instanceof Error && /Unknown model/i.test(error.message)) {
    return badRequest(error.message)
  }

  return serverError('Failed to process request')
}

// Generic CRUD operations for all models
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const model = searchParams.get('model')
  const id = searchParams.get('id')

  if (!model) {
    return badRequest('Model parameter is required')
  }

  if (!isValidModel(model)) {
    return badRequest('Invalid model name')
  }

  try {
    const schoolYearIdParam = searchParams.get('schoolYearId')
    const schoolYearId = schoolYearIdParam ? parseInt(schoolYearIdParam, 10) : undefined
    const yearFilter = schoolYearId != null && !Number.isNaN(schoolYearId) ? schoolYearId : undefined

    // Get model data with appropriate includes
    let data
    if (id) {
      const parsedId = parseInt(id, 10)
      if (Number.isNaN(parsedId)) {
        return badRequest('ID parameter must be a number')
      }
      // Get single record
      data = await getSingleRecord(model, parsedId)
    } else {
      // Get all records (optionally filtered by school year for schedule/teacherAssignment)
      data = await getAllRecords(model, yearFilter)
    }

    return ok(data)
  } catch (error) {
    console.error(`Error fetching ${model} data:`, error)
    captureError(error, {
      location: 'api/admin/data',
      type: 'fetch-data',
      extra: { model, id }
    })
    return mapApiError(error)
  }
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url)
  const model = searchParams.get('model')
  let requestBody: Record<string, unknown> = {}

  if (!model) {
    return badRequest('Model parameter is required')
  }

  if (!isValidModel(model)) {
    return badRequest('Invalid model name')
  }

  try {
    requestBody = await request.json() as Record<string, unknown>
    const data = await createRecord(model, requestBody)
    return created(data)
  } catch (error) {
    console.error(`Error creating ${model}:`, error)
    captureError(error, {
      location: 'api/admin/data',
      type: 'create-data',
      extra: { model, body: requestBody }
    })
    return mapApiError(error)
  }
}

export async function PUT(request: Request) {
  const { searchParams } = new URL(request.url)
  const model = searchParams.get('model')
  const id = searchParams.get('id')
  let requestBody: Record<string, unknown> = {}

  if (!model || !id) {
    return badRequest('Model and ID parameters are required')
  }

  if (!isValidModel(model)) {
    return badRequest('Invalid model name')
  }

  const parsedId = parseInt(id, 10)
  if (Number.isNaN(parsedId)) {
    return badRequest('ID parameter must be a number')
  }

  try {
    requestBody = await request.json() as Record<string, unknown>
    const data = await updateRecord(model, parsedId, requestBody)
    return ok(data)
  } catch (error) {
    console.error(`Error updating ${model}:`, error)
    captureError(error, {
      location: 'api/admin/data',
      type: 'update-data',
      extra: { model, id, body: requestBody }
    })
    return mapApiError(error)
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const model = searchParams.get('model')
  const id = searchParams.get('id')
  const isBulkDelete = searchParams.get('bulk') === 'true'

  if (!model || (!id && !isBulkDelete)) {
    return badRequest('Model and ID parameters are required unless bulk=true is set')
  }

  if (!isValidModel(model)) {
    return badRequest('Invalid model name')
  }

  try {
    if (isBulkDelete) {
      const result = await deleteAllRecords(model)
      return ok(result, 'Bulk delete completed')
    }

    if (!id) {
      return badRequest('ID parameter is required')
    }
    const parsedId = parseInt(id, 10)
    if (Number.isNaN(parsedId)) {
      return badRequest('ID parameter must be a number')
    }
    await deleteRecord(model, parsedId)
    return ok(null, 'Record deleted successfully')
  } catch (error) {
    console.error(`Error deleting ${model}:`, error)
    captureError(error, {
      location: 'api/admin/data',
      type: 'delete-data',
      extra: { model, id, isBulkDelete }
    })
    return mapApiError(error)
  }
}

// Helper functions for different models
async function getAllRecords(model: string, schoolYearId?: number) {
  switch (model) {
    case 'student': {
      const targetYear = schoolYearId ?? (await resolveSchoolYearId())
      const students = await prisma.student.findMany({
        include: targetYear != null
          ? {
              classMemberships: {
                where: { schoolYearId: targetYear },
                include: { class: true }
              }
            }
          : undefined,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }]
      })
      return students.map(s => {
        const membership = (s as unknown as {
          classMemberships?: { classId: number; class: { id: number; name: string } | null }[]
        }).classMemberships?.[0]
        return {
          ...s,
          classId: membership?.classId ?? null,
          class: membership?.class ?? null
        }
      })
    }
    case 'teacher':
      return await prisma.teacher.findMany({
        include: {
          headYears: { include: { class: true, schoolYear: { select: { id: true, label: true } } } },
          leadYears: { include: { class: true, schoolYear: { select: { id: true, label: true } } } },
          assignments: {
            include: { class: true, subject: true }
          }
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }]
      })
    case 'class': {
      const rows = await prisma.class.findMany({
        include: {
          schedules: true,
          classMemberships: { include: { student: true } },
          yearStaff: {
            include: {
              classHead: { select: { id: true, firstName: true, lastName: true } },
              classLead: { select: { id: true, firstName: true, lastName: true } },
              schoolYear: { select: { id: true, label: true } }
            }
          }
        },
        orderBy: { name: 'asc' }
      })
      const targetYear = schoolYearId ?? null
      return rows.map(row => {
        const staffForYear = targetYear != null
          ? row.yearStaff.find(s => s.schoolYearId === targetYear)
          : row.yearStaff[0]
        const memberships = targetYear != null
          ? row.classMemberships.filter(m => m.schoolYearId === targetYear)
          : row.classMemberships
        const students = memberships.map(m => m.student)
        return {
          ...row,
          students,
          classHeadId: staffForYear?.classHeadId ?? null,
          classLeadId: staffForYear?.classLeadId ?? null,
          classHead: staffForYear?.classHead ?? null,
          classLead: staffForYear?.classLead ?? null
        }
      })
    }
    case 'classYearStaff':
      return await prisma.classYearStaff.findMany({
        where: schoolYearId != null ? { schoolYearId } : undefined,
        include: {
          class: { select: { id: true, name: true } },
          schoolYear: { select: { id: true, label: true } },
          classHead: { select: { id: true, firstName: true, lastName: true } },
          classLead: { select: { id: true, firstName: true, lastName: true } }
        },
        orderBy: [{ schoolYearId: 'desc' }, { classId: 'asc' }]
      })
    case 'schedule':
      return await prisma.schedule.findMany({
        where: schoolYearId != null ? { schoolYearId } : undefined,
        include: {
          class: true,
          breakTimes: true,
          scheduleTimes: true
        },
        orderBy: { createdAt: 'desc' }
      })
    case 'teacherAssignment':
      return await prisma.teacherAssignment.findMany({
        where: schoolYearId != null ? { schoolYearId } : undefined,
        include: {
          teacher: true,
          class: true,
          subject: true,
          learningContent: true,
          room: true
        },
        orderBy: { createdAt: 'desc' }
      })
    case 'room': {
      const rows = await prisma.lookupValue.findMany({
        where: { kind: 'ROOM' },
        include: { roomAssignments: true },
        orderBy: { name: 'asc' }
      })
      return rows.map(({ kind: _kind, roomAssignments, ...rest }) => ({
        ...rest,
        assignments: roomAssignments
      }))
    }
    case 'subject': {
      const rows = await prisma.lookupValue.findMany({
        where: { kind: 'SUBJECT' },
        include: { subjectAssignments: true },
        orderBy: { name: 'asc' }
      })
      return rows.map(({ kind: _kind, capacity: _capacity, subjectAssignments, ...rest }) => ({
        ...rest,
        TeacherAssignment: subjectAssignments
      }))
    }
    case 'learningContent': {
      const rows = await prisma.lookupValue.findMany({
        where: { kind: 'LEARNING_CONTENT' },
        include: { learningContentAssignments: true },
        orderBy: { name: 'asc' }
      })
      return rows.map(({ kind: _kind, capacity: _capacity, learningContentAssignments, ...rest }) => ({
        ...rest,
        TeacherAssignment: learningContentAssignments
      }))
    }
    case 'schoolHoliday':
      return await prisma.schoolHoliday.findMany({
        orderBy: { startDate: 'asc' }
      })
    case 'schoolYear':
      return await prisma.schoolYear.findMany({
        orderBy: { startDate: 'asc' }
      })
    case 'scheduleTime':
      return await prisma.scheduleTime.findMany({
        include: { schedules: true },
        orderBy: { startTime: 'asc' }
      })
    case 'breakTime':
      return await prisma.breakTime.findMany({
        include: { schedules: true },
        orderBy: { startTime: 'asc' }
      })
    case 'teacherRotation':
      return await prisma.teacherRotation.findMany({
        orderBy: { createdAt: 'desc' }
      })
    case 'role':
      return await prisma.role.findMany({
        include: { userRoles: true },
        orderBy: { name: 'asc' }
      })
    case 'userRole':
      return await prisma.userRole.findMany({
        include: { role: true },
        orderBy: { createdAt: 'desc' }
      })
    case 'supportMessage':
      return await prisma.supportMessage.findMany({
        orderBy: { createdAt: 'desc' }
      })
    default:
      throw new Error(`Unknown model: ${model}`)
  }
}

async function getSingleRecord(model: string, id: number) {
  switch (model) {
    case 'student': {
      const targetYear = await resolveSchoolYearId()
      const student = await prisma.student.findUnique({
        where: { id },
        include: targetYear != null
          ? {
              classMemberships: {
                where: { schoolYearId: targetYear },
                include: { class: true }
              }
            }
          : undefined
      })
      if (!student) return null
      const membership = (student as unknown as {
        classMemberships?: { classId: number; class: { id: number; name: string } | null }[]
      }).classMemberships?.[0]
      return {
        ...student,
        classId: membership?.classId ?? null,
        class: membership?.class ?? null
      }
    }
    case 'teacher':
      return await prisma.teacher.findUnique({
        where: { id },
        include: {
          headYears: { include: { class: true, schoolYear: { select: { id: true, label: true } } } },
          leadYears: { include: { class: true, schoolYear: { select: { id: true, label: true } } } },
          assignments: {
            include: { class: true, subject: true }
          }
        }
      })
    case 'class': {
      const row = await prisma.class.findUnique({
        where: { id },
        include: {
          schedules: true,
          classMemberships: { include: { student: true } },
          yearStaff: {
            include: {
              classHead: { select: { id: true, firstName: true, lastName: true } },
              classLead: { select: { id: true, firstName: true, lastName: true } },
              schoolYear: { select: { id: true, label: true } }
            }
          }
        }
      })
      if (!row) return null
      const staffForYear = row.yearStaff[0]
      const students = row.classMemberships.map(m => m.student)
      return {
        ...row,
        students,
        classHeadId: staffForYear?.classHeadId ?? null,
        classLeadId: staffForYear?.classLeadId ?? null,
        classHead: staffForYear?.classHead ?? null,
        classLead: staffForYear?.classLead ?? null
      }
    }
    case 'classYearStaff':
      return await prisma.classYearStaff.findUnique({
        where: { id },
        include: {
          class: { select: { id: true, name: true } },
          schoolYear: { select: { id: true, label: true } },
          classHead: { select: { id: true, firstName: true, lastName: true } },
          classLead: { select: { id: true, firstName: true, lastName: true } }
        }
      })
    case 'schedule':
      return await prisma.schedule.findUnique({
        where: { id },
        include: { 
          class: true,
          breakTimes: true,
          scheduleTimes: true
        }
      })
    case 'teacherAssignment':
      return await prisma.teacherAssignment.findUnique({
        where: { id },
        include: {
          teacher: true,
          class: true,
          subject: true,
          learningContent: true,
          room: true
        }
      })
    case 'room': {
      const row = await prisma.lookupValue.findFirst({
        where: { id, kind: 'ROOM' },
        include: { roomAssignments: true }
      })
      if (!row) return null
      const { kind: _kind, roomAssignments, ...rest } = row
      return { ...rest, assignments: roomAssignments }
    }
    case 'subject': {
      const row = await prisma.lookupValue.findFirst({
        where: { id, kind: 'SUBJECT' },
        include: { subjectAssignments: true }
      })
      if (!row) return null
      const { kind: _kind, capacity: _capacity, subjectAssignments, ...rest } = row
      return { ...rest, TeacherAssignment: subjectAssignments }
    }
    case 'learningContent': {
      const row = await prisma.lookupValue.findFirst({
        where: { id, kind: 'LEARNING_CONTENT' },
        include: { learningContentAssignments: true }
      })
      if (!row) return null
      const { kind: _kind, capacity: _capacity, learningContentAssignments, ...rest } = row
      return { ...rest, TeacherAssignment: learningContentAssignments }
    }
    case 'schoolHoliday':
      return await prisma.schoolHoliday.findUnique({
        where: { id }
      })
    case 'schoolYear':
      return await prisma.schoolYear.findUnique({
        where: { id }
      })
    case 'scheduleTime':
      return await prisma.scheduleTime.findUnique({
        where: { id },
        include: { schedules: true }
      })
    case 'breakTime':
      return await prisma.breakTime.findUnique({
        where: { id },
        include: { schedules: true }
      })
    case 'teacherRotation':
      return await prisma.teacherRotation.findUnique({
        where: { id }
      })
    case 'role':
      return await prisma.role.findUnique({
        where: { id },
        include: { userRoles: true }
      })
    case 'userRole':
      return await prisma.userRole.findUnique({
        where: { id },
        include: { role: true }
      })
    case 'supportMessage':
      return await prisma.supportMessage.findUnique({
        where: { id }
      })
    default:
      throw new Error(`Unknown model: ${model}`)
  }
}

async function createRecord(model: string, data: Record<string, unknown>) {
  // Remove id and timestamps so Prisma uses defaults
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = data as Record<string, unknown>
  const createData = { ...rest }

  switch (model) {
    case 'student': {
      const studentData = { ...createData } as Record<string, unknown>
      const requestedClassId = studentData.classId
      const requestedYearId = studentData.schoolYearId
      delete studentData.classId
      delete studentData.schoolYearId
      delete (studentData as Record<string, unknown>).class
      const created = await prisma.student.create({
        data: studentData as unknown as Parameters<typeof prisma.student.create>[0]['data']
      })
      if (typeof requestedClassId === 'number' && requestedClassId > 0) {
        const yearId = typeof requestedYearId === 'number' && requestedYearId > 0
          ? requestedYearId
          : await resolveSchoolYearId()
        if (yearId != null) {
          await prisma.classMembership.upsert({
            where: { studentId_schoolYearId: { studentId: created.id, schoolYearId: yearId } },
            create: { studentId: created.id, classId: requestedClassId, schoolYearId: yearId },
            update: { classId: requestedClassId }
          })
        }
      }
      return created
    }
    case 'teacher':
      return await prisma.teacher.create({ data: createData as unknown as Parameters<typeof prisma.teacher.create>[0]['data'] })
    case 'class': {
      const classData = createData as Record<string, unknown>
      const classHeadId = classData.classHeadId
      const classLeadId = classData.classLeadId
      const schoolYearForStaff = classData.schoolYearId
      delete classData.classHeadId
      delete classData.classLeadId
      delete classData.schoolYearId
      const created = await prisma.class.create({
        data: classData as unknown as Parameters<typeof prisma.class.create>[0]['data']
      })
      if (classHeadId !== undefined || classLeadId !== undefined) {
        const yearId = typeof schoolYearForStaff === 'number' && schoolYearForStaff > 0
          ? schoolYearForStaff
          : await resolveSchoolYearId()
        if (yearId != null) {
          await setClassYearStaff(created.id, yearId, {
            classHeadId: typeof classHeadId === 'number' ? classHeadId : null,
            classLeadId: typeof classLeadId === 'number' ? classLeadId : null
          })
        }
      }
      return created
    }
    case 'classYearStaff':
      return await prisma.classYearStaff.create({ data: createData as unknown as Parameters<typeof prisma.classYearStaff.create>[0]['data'] })
    case 'schedule':
      return await prisma.schedule.create({ data: createData as unknown as Parameters<typeof prisma.schedule.create>[0]['data'] })
    case 'teacherAssignment':
      return await prisma.teacherAssignment.create({ data: createData as unknown as Parameters<typeof prisma.teacherAssignment.create>[0]['data'] })
    case 'room': {
      const data = { ...(createData as Record<string, unknown>), kind: 'ROOM' as const }
      return await prisma.lookupValue.create({
        data: data as unknown as Parameters<typeof prisma.lookupValue.create>[0]['data']
      })
    }
    case 'subject': {
      const { capacity: _capacity, ...rest } = createData as Record<string, unknown>
      return await prisma.lookupValue.create({
        data: { ...rest, kind: 'SUBJECT' } as unknown as Parameters<typeof prisma.lookupValue.create>[0]['data']
      })
    }
    case 'learningContent': {
      const { capacity: _capacity, ...rest } = createData as Record<string, unknown>
      return await prisma.lookupValue.create({
        data: { ...rest, kind: 'LEARNING_CONTENT' } as unknown as Parameters<typeof prisma.lookupValue.create>[0]['data']
      })
    }
    case 'schoolHoliday':
      return await prisma.schoolHoliday.create({ data: createData as unknown as Parameters<typeof prisma.schoolHoliday.create>[0]['data'] })
    case 'schoolYear': {
      const schoolYearData = createData as Record<string, unknown>
      // Prisma Boolean? expects true/false/null, not empty string
      if (schoolYearData.isCurrent === '' || schoolYearData.isCurrent === undefined) {
        delete schoolYearData.isCurrent
      }
      return await prisma.schoolYear.create({ data: schoolYearData as Parameters<typeof prisma.schoolYear.create>[0]['data'] })
    }
    case 'scheduleTime':
      return await prisma.scheduleTime.create({ data: createData as unknown as Parameters<typeof prisma.scheduleTime.create>[0]['data'] })
    case 'breakTime':
      return await prisma.breakTime.create({ data: createData as unknown as Parameters<typeof prisma.breakTime.create>[0]['data'] })
    case 'teacherRotation': {
      const rotationData = createData as Record<string, unknown>
      const classIdValue = Number(rotationData.classId)
      const groupIdValue = Number(rotationData.groupId)
      const teacherIdValue = Number(rotationData.teacherId)
      const turnIdValue = Number(rotationData.turnId)
      const periodValue: 'AM' | 'PM' | null =
        rotationData.period === 'AM' || rotationData.period === 'PM' ? rotationData.period : null
      if (
        Number.isNaN(classIdValue) ||
        Number.isNaN(groupIdValue) ||
        Number.isNaN(teacherIdValue) ||
        Number.isNaN(turnIdValue) ||
        !periodValue
      ) {
        throw new Error('Invalid teacherRotation payload')
      }
      const weekdayValue = Number(rotationData.selectedWeekday ?? 1)
      const providedSchoolYearId = Number(rotationData.schoolYearId)
      let schoolYearIdValue = Number.isNaN(providedSchoolYearId) ? undefined : providedSchoolYearId
      if (schoolYearIdValue == null || schoolYearIdValue <= 0) {
        const now = new Date()
        const current = await prisma.schoolYear.findFirst({
          where: { startDate: { lte: now }, endDate: { gte: now } },
          select: { id: true }
        })
        schoolYearIdValue = current?.id ?? (await prisma.schoolYear.findFirst({ orderBy: { startDate: 'desc' }, select: { id: true } }))?.id
      }
      if (schoolYearIdValue == null) {
        throw new Error('schoolYearId is required for teacherRotation')
      }
      return await prisma.teacherRotation.create({
        data: {
          classId: classIdValue,
          groupId: groupIdValue,
          teacherId: teacherIdValue,
          turnId: turnIdValue,
          period: periodValue,
          selectedWeekday: weekdayValue >= 1 && weekdayValue <= 5 ? weekdayValue : 1,
          schoolYearId: schoolYearIdValue
        }
      })
    }
    case 'role':
      return await prisma.role.create({ data: createData as unknown as Parameters<typeof prisma.role.create>[0]['data'] })
    case 'userRole':
      return await prisma.userRole.create({ data: createData as unknown as Parameters<typeof prisma.userRole.create>[0]['data'] })
    case 'supportMessage':
      return await prisma.supportMessage.create({ data: createData as unknown as Parameters<typeof prisma.supportMessage.create>[0]['data'] })
    default:
      throw new Error(`Unknown model: ${model}`)
  }
}

async function updateRecord(model: string, id: number, data: Record<string, unknown>) {
  // Don't allow overriding id or updatedAt (Prisma sets updatedAt)
  const { id: _id, updatedAt: _updatedAt, ...rest } = data as Record<string, unknown>
  const updateData = { ...rest }

  switch (model) {
    case 'student': {
      const studentData = { ...updateData } as Record<string, unknown>
      const classIdProvided = 'classId' in studentData
      const requestedClassId = studentData.classId
      const requestedYearId = studentData.schoolYearId
      delete studentData.classId
      delete studentData.schoolYearId
      delete (studentData as Record<string, unknown>).class
      const updated = await prisma.student.update({
        where: { id },
        data: studentData
      })
      if (classIdProvided) {
        const yearId = typeof requestedYearId === 'number' && requestedYearId > 0
          ? requestedYearId
          : await resolveSchoolYearId()
        if (yearId != null) {
          if (typeof requestedClassId === 'number' && requestedClassId > 0) {
            await prisma.classMembership.upsert({
              where: { studentId_schoolYearId: { studentId: id, schoolYearId: yearId } },
              create: { studentId: id, classId: requestedClassId, schoolYearId: yearId },
              update: { classId: requestedClassId }
            })
          } else {
            await prisma.classMembership.deleteMany({
              where: { studentId: id, schoolYearId: yearId }
            })
          }
        }
      }
      return updated
    }
    case 'teacher':
      return await prisma.teacher.update({
        where: { id },
        data: updateData
      })
    case 'class': {
      const classData = updateData as Record<string, unknown>
      const headProvided = 'classHeadId' in classData
      const leadProvided = 'classLeadId' in classData
      const classHeadId = classData.classHeadId
      const classLeadId = classData.classLeadId
      const schoolYearForStaff = classData.schoolYearId
      delete classData.classHeadId
      delete classData.classLeadId
      delete classData.schoolYearId
      const updated = await prisma.class.update({
        where: { id },
        data: classData
      })
      if (headProvided || leadProvided) {
        const yearId = typeof schoolYearForStaff === 'number' && schoolYearForStaff > 0
          ? schoolYearForStaff
          : await resolveSchoolYearId()
        if (yearId != null) {
          const patch: { classHeadId?: number | null; classLeadId?: number | null } = {}
          if (headProvided) patch.classHeadId = typeof classHeadId === 'number' ? classHeadId : null
          if (leadProvided) patch.classLeadId = typeof classLeadId === 'number' ? classLeadId : null
          await setClassYearStaff(id, yearId, patch)
        }
      }
      return updated
    }
    case 'classYearStaff':
      return await prisma.classYearStaff.update({
        where: { id },
        data: updateData
      })
    case 'schedule':
      return await prisma.schedule.update({
        where: { id },
        data: updateData
      })
    case 'teacherAssignment':
      return await prisma.teacherAssignment.update({
        where: { id },
        data: updateData
      })
    case 'room':
      return await prisma.lookupValue.update({
        where: { id },
        data: updateData
      })
    case 'subject': {
      const { capacity: _capacity, ...rest } = updateData as Record<string, unknown>
      return await prisma.lookupValue.update({
        where: { id },
        data: rest as unknown as Parameters<typeof prisma.lookupValue.update>[0]['data']
      })
    }
    case 'learningContent': {
      const { capacity: _capacity, ...rest } = updateData as Record<string, unknown>
      return await prisma.lookupValue.update({
        where: { id },
        data: rest as unknown as Parameters<typeof prisma.lookupValue.update>[0]['data']
      })
    }
    case 'schoolHoliday':
      return await prisma.schoolHoliday.update({
        where: { id },
        data: updateData
      })
    case 'schoolYear': {
      const schoolYearUpdate = { ...updateData } as Record<string, unknown>
      if (schoolYearUpdate.isCurrent === '' || schoolYearUpdate.isCurrent === undefined) {
        delete schoolYearUpdate.isCurrent
      }
      return await prisma.schoolYear.update({
        where: { id },
        data: schoolYearUpdate
      })
    }
    case 'scheduleTime':
      return await prisma.scheduleTime.update({
        where: { id },
        data: updateData
      })
    case 'breakTime':
      return await prisma.breakTime.update({
        where: { id },
        data: updateData
      })
    case 'teacherRotation':
      return await prisma.teacherRotation.update({
        where: { id },
        data: updateData
      })
    case 'role':
      return await prisma.role.update({
        where: { id },
        data: updateData
      })
    case 'userRole':
      return await prisma.userRole.update({
        where: { id },
        data: updateData
      })
    case 'supportMessage':
      return await prisma.supportMessage.update({
        where: { id },
        data: updateData
      })
    default:
      throw new Error(`Unknown model: ${model}`)
  }
}

async function deleteRecord(model: string, id: number) {
  switch (model) {
    case 'student':
      return await prisma.student.delete({ where: { id } })
    case 'teacher':
      return await prisma.teacher.delete({ where: { id } })
    case 'class':
      return await prisma.class.delete({ where: { id } })
    case 'classYearStaff':
      return await prisma.classYearStaff.delete({ where: { id } })
    case 'schedule':
      return await prisma.schedule.delete({ where: { id } })
    case 'teacherAssignment':
      return await prisma.teacherAssignment.delete({ where: { id } })
    case 'room':
    case 'subject':
    case 'learningContent':
      return await prisma.lookupValue.delete({ where: { id } })
    case 'schoolHoliday':
      return await prisma.schoolHoliday.delete({ where: { id } })
    case 'schoolYear':
      return await prisma.schoolYear.delete({ where: { id } })
    case 'scheduleTime':
      return await prisma.scheduleTime.delete({ where: { id } })
    case 'breakTime':
      return await prisma.breakTime.delete({ where: { id } })
    case 'teacherRotation':
      return await prisma.teacherRotation.delete({ where: { id } })
    case 'role':
      return await prisma.role.delete({ where: { id } })
    case 'userRole':
      return await prisma.userRole.delete({ where: { id } })
    case 'supportMessage':
      return await prisma.supportMessage.delete({ where: { id } })
    default:
      throw new Error(`Unknown model: ${model}`)
  }
}

async function deleteAllRecords(model: string | null) {
  switch (model) {
    case 'student': {
      const { count } = await prisma.student.deleteMany()
      return { students: count }
    }
    case 'teacher': {
      const { count } = await prisma.teacher.deleteMany()
      return { teachers: count }
    }
    case 'class': {
      return await prisma.$transaction(async (tx) => {
        const deletedStudents = await tx.student.deleteMany()
        const deletedClasses = await tx.class.deleteMany()
        return {
          students: deletedStudents.count,
          classes: deletedClasses.count
        }
      })
    }
    default:
      throw new Error(`Bulk delete not supported for model: ${model}`)
  }
}
