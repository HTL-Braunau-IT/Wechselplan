import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function DELETE() {
    try {
        // Delete all students and their associated schedules
        // The cascade delete will handle the schedule relationships automatically
        await prisma.student.deleteMany()
        
        return NextResponse.json({ message: 'All students and associated schedules have been deleted successfully' })
    } catch (error) {
        console.error('Error deleting students:', error)
        return NextResponse.json(
            { error: 'Failed to delete students' },
            { status: 500 }
        )
    }
} 