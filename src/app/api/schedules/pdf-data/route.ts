import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url)
    try {
        const className = searchParams.get('className')
        console.log("PDF DATA: ", className)

        if (!className) {
            const error = new Error('Class Name is required')
            captureError(error, {
                location: 'api/schedules/pdf-data',
                type: 'pdf-data-error'
            })
            return NextResponse.json({ error: 'Class Name is required' }, { status: 400 })
        } 

        const class_response = await prisma.class.findUnique({
            where: {
                name: className
            }
        })

        if (!class_response) {
            const error = new Error('Class not found')
            captureError(error, {
                location: 'api/schedules/pdf-data',
                type: 'pdf-data-error'
            })
            return NextResponse.json({ error: 'Class not found' }, { status: 400 })
        }
        const student_response = await prisma.student.findMany({
            where: {
                classId: class_response.id,
                groupId: {
                    not: null
                }
            }
        })

        if (!student_response) {
            const error = new Error('No students found')
            captureError(error, {
                location: 'api/schedules/pdf-data',
                type: 'pdf-data-error'
            })
            return NextResponse.json({ error: 'No students found' }, { status: 400 })
        }
        
        
        

 
        
        return NextResponse.json({
            students: student_response
        }, { status: 200 })
    } catch (error) {
        console.error('Error fetching schedule data:', error)
        captureError(error, {
            location: 'api/schedules/data',
            type: 'schedule_data_error',
            extra: {
                teacherUsername: searchParams.get('teacher'),
                weekday: searchParams.get('weekday')
            }
        })
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}