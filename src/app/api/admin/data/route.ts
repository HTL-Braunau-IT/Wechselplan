import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'

// Generic CRUD operations for all models
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const model = searchParams.get('model')
  const id = searchParams.get('id')

  if (!model) {
    return NextResponse.json(
      { error: 'Model parameter is required' },
      { status: 400 }
    )
  }

  try {
    // Validate model name
    const validModels = [
      'student', 'teacher', 'class', 'schedule', 'groupAssignment',
      'teacherAssignment', 'room', 'subject', 'learningContent',
      'schoolHoliday', 'scheduleTime', 'breakTime', 'schedulePDF',
      'teacherRotation', 'role', 'userRole', 'supportMessage'
    ]

    if (!validModels.includes(model)) {
      return NextResponse.json(
        { error: 'Invalid model name' },
        { status: 400 }
      )
    }

    // Get model data with appropriate includes
    let data
    if (id) {
      // Get single record
      data = await getSingleRecord(model, parseInt(id))
    } else {
      // Get all records
      data = await getAllRecords(model)
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error(`Error fetching ${model} data:`, error)
    captureError(error, {
      location: 'api/admin/data',
      type: 'fetch-data',
      extra: { model, id }
    })
    return NextResponse.json(
      { error: 'Failed to fetch data' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url)
  const model = searchParams.get('model')

  if (!model) {
    return NextResponse.json(
      { error: 'Model parameter is required' },
      { status: 400 }
    )
  }

  try {
    const body = await request.json()
    const data = await createRecord(model, body)
    return NextResponse.json(data)
  } catch (error) {
    console.error(`Error creating ${model}:`, error)
    captureError(error, {
      location: 'api/admin/data',
      type: 'create-data',
      extra: { model, body: await request.json().catch(() => ({})) }
    })
    return NextResponse.json(
      { error: 'Failed to create record' },
      { status: 500 }
    )
  }
}

export async function PUT(request: Request) {
  const { searchParams } = new URL(request.url)
  const model = searchParams.get('model')
  const id = searchParams.get('id')

  if (!model || !id) {
    return NextResponse.json(
      { error: 'Model and ID parameters are required' },
      { status: 400 }
    )
  }

  try {
    const body = await request.json()
    const data = await updateRecord(model, parseInt(id), body)
    return NextResponse.json(data)
  } catch (error) {
    console.error(`Error updating ${model}:`, error)
    captureError(error, {
      location: 'api/admin/data',
      type: 'update-data',
      extra: { model, id, body: await request.json().catch(() => ({})) }
    })
    return NextResponse.json(
      { error: 'Failed to update record' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const model = searchParams.get('model')
  const id = searchParams.get('id')

  if (!model || !id) {
    return NextResponse.json(
      { error: 'Model and ID parameters are required' },
      { status: 400 }
    )
  }

  try {
    await deleteRecord(model, parseInt(id))
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error(`Error deleting ${model}:`, error)
    captureError(error, {
      location: 'api/admin/data',
      type: 'delete-data',
      extra: { model, id }
    })
    return NextResponse.json(
      { error: 'Failed to delete record' },
      { status: 500 }
    )
  }
}

// Helper functions for different models
async function getAllRecords(model: string) {
  switch (model) {
    case 'student':
      return await prisma.student.findMany({
        include: { class: true },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }]
      })
    case 'teacher':
      return await prisma.teacher.findMany({
        include: { 
          headClasses: true, 
          leadClasses: true,
          assignments: {
            include: { class: true, subject: true }
          }
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }]
      })
    case 'class':
      return await prisma.class.findMany({
        include: { 
          classHead: true, 
          classLead: true,
          students: true,
          schedules: true
        },
        orderBy: { name: 'asc' }
      })
    case 'schedule':
      return await prisma.schedule.findMany({
        include: { 
          class: true,
          breakTimes: true,
          scheduleTimes: true
        },
        orderBy: { createdAt: 'desc' }
      })
    case 'groupAssignment':
      return await prisma.groupAssignment.findMany({
        orderBy: { createdAt: 'desc' }
      })
    case 'teacherAssignment':
      return await prisma.teacherAssignment.findMany({
        include: {
          teacher: true,
          class: true,
          subject: true,
          learningContent: true,
          room: true
        },
        orderBy: { createdAt: 'desc' }
      })
    case 'room':
      return await prisma.room.findMany({
        include: { assignments: true },
        orderBy: { name: 'asc' }
      })
    case 'subject':
      return await prisma.subject.findMany({
        include: { TeacherAssignment: true },
        orderBy: { name: 'asc' }
      })
    case 'learningContent':
      return await prisma.learningContent.findMany({
        include: { TeacherAssignment: true },
        orderBy: { name: 'asc' }
      })
    case 'schoolHoliday':
      return await prisma.schoolHoliday.findMany({
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
    case 'schedulePDF':
      return await prisma.schedulePDF.findMany({
        orderBy: { createdAt: 'desc' }
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
    case 'student':
      return await prisma.student.findUnique({
        where: { id },
        include: { class: true }
      })
    case 'teacher':
      return await prisma.teacher.findUnique({
        where: { id },
        include: { 
          headClasses: true, 
          leadClasses: true,
          assignments: {
            include: { class: true, subject: true }
          }
        }
      })
    case 'class':
      return await prisma.class.findUnique({
        where: { id },
        include: { 
          classHead: true, 
          classLead: true,
          students: true,
          schedules: true
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
    case 'groupAssignment':
      return await prisma.groupAssignment.findUnique({
        where: { id }
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
    case 'room':
      return await prisma.room.findUnique({
        where: { id },
        include: { assignments: true }
      })
    case 'subject':
      return await prisma.subject.findUnique({
        where: { id },
        include: { TeacherAssignment: true }
      })
    case 'learningContent':
      return await prisma.learningContent.findUnique({
        where: { id },
        include: { TeacherAssignment: true }
      })
    case 'schoolHoliday':
      return await prisma.schoolHoliday.findUnique({
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
    case 'schedulePDF':
      return await prisma.schedulePDF.findUnique({
        where: { id: id.toString() }
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

async function createRecord(model: string, data: any) {
  // Remove id and timestamps from data
  const { id, createdAt, updatedAt, ...createData } = data

  switch (model) {
    case 'student':
      return await prisma.student.create({ data: createData })
    case 'teacher':
      return await prisma.teacher.create({ data: createData })
    case 'class':
      return await prisma.class.create({ data: createData })
    case 'schedule':
      return await prisma.schedule.create({ data: createData })
    case 'groupAssignment':
      return await prisma.groupAssignment.create({ data: createData })
    case 'teacherAssignment':
      return await prisma.teacherAssignment.create({ data: createData })
    case 'room':
      return await prisma.room.create({ data: createData })
    case 'subject':
      return await prisma.subject.create({ data: createData })
    case 'learningContent':
      return await prisma.learningContent.create({ data: createData })
    case 'schoolHoliday':
      return await prisma.schoolHoliday.create({ data: createData })
    case 'scheduleTime':
      return await prisma.scheduleTime.create({ data: createData })
    case 'breakTime':
      return await prisma.breakTime.create({ data: createData })
    case 'schedulePDF':
      return await prisma.schedulePDF.create({ data: createData })
    case 'teacherRotation':
      return await prisma.teacherRotation.create({ data: createData })
    case 'role':
      return await prisma.role.create({ data: createData })
    case 'userRole':
      return await prisma.userRole.create({ data: createData })
    case 'supportMessage':
      return await prisma.supportMessage.create({ data: createData })
    default:
      throw new Error(`Unknown model: ${model}`)
  }
}

async function updateRecord(model: string, id: number, data: any) {
  // Remove id and timestamps from data
  const { id: _, createdAt, updatedAt, ...updateData } = data

  switch (model) {
    case 'student':
      return await prisma.student.update({
        where: { id },
        data: updateData
      })
    case 'teacher':
      return await prisma.teacher.update({
        where: { id },
        data: updateData
      })
    case 'class':
      return await prisma.class.update({
        where: { id },
        data: updateData
      })
    case 'schedule':
      return await prisma.schedule.update({
        where: { id },
        data: updateData
      })
    case 'groupAssignment':
      return await prisma.groupAssignment.update({
        where: { id },
        data: updateData
      })
    case 'teacherAssignment':
      return await prisma.teacherAssignment.update({
        where: { id },
        data: updateData
      })
    case 'room':
      return await prisma.room.update({
        where: { id },
        data: updateData
      })
    case 'subject':
      return await prisma.subject.update({
        where: { id },
        data: updateData
      })
    case 'learningContent':
      return await prisma.learningContent.update({
        where: { id },
        data: updateData
      })
    case 'schoolHoliday':
      return await prisma.schoolHoliday.update({
        where: { id },
        data: updateData
      })
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
    case 'schedulePDF':
      return await prisma.schedulePDF.update({
        where: { id: id.toString() },
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
    case 'schedule':
      return await prisma.schedule.delete({ where: { id } })
    case 'groupAssignment':
      return await prisma.groupAssignment.delete({ where: { id } })
    case 'teacherAssignment':
      return await prisma.teacherAssignment.delete({ where: { id } })
    case 'room':
      return await prisma.room.delete({ where: { id } })
    case 'subject':
      return await prisma.subject.delete({ where: { id } })
    case 'learningContent':
      return await prisma.learningContent.delete({ where: { id } })
    case 'schoolHoliday':
      return await prisma.schoolHoliday.delete({ where: { id } })
    case 'scheduleTime':
      return await prisma.scheduleTime.delete({ where: { id } })
    case 'breakTime':
      return await prisma.breakTime.delete({ where: { id } })
    case 'schedulePDF':
      return await prisma.schedulePDF.delete({ where: { id: id.toString() } })
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
