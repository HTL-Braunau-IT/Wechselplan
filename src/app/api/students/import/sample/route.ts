import { NextResponse } from 'next/server'

export async function GET() {
  // Create a sample CSV with realistic class names and student data
  const csvContent = `class,firstName,lastName
1A,Max,Mustermann
1A,Anna,Schmidt
1A,Lukas,Weber
1A,Sophie,Fischer
2B,Jonas,Becker
2B,Laura,Hoffmann
2B,Finn,Schäfer
2B,Emma,Koch
3C,Noah,Müller
3C,Mia,Schulz
3C,Ben,Wagner
3C,Hannah,Meyer`

  return new NextResponse(csvContent, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="sample_students.csv"'
    }
  })
} 