import { NextResponse } from 'next/server'
import { denyUnlessAccess } from '@/lib/api-guard'

export async function GET() {
  const denied = await denyUnlessAccess('staff')
  if (denied) return denied

  const csvContent = `firstName,lastName,schedules
John,Doe,1A;2B;3C
Jane,Smith,1B;2C
Michael,Johnson,1C;2A;3B`

  return new NextResponse(csvContent, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="sample_teachers.csv"',
    },
  })
}
