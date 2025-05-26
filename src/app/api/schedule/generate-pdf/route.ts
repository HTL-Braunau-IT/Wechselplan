import { NextResponse } from 'next/server';
import { generateSchedulePDF } from '@/lib/pdf-generator';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const { classId, data } = await request.json();

    // Validate required data
    if (!classId || !data) {
      return NextResponse.json(
        { error: 'Missing required fields: classId and data' },
        { status: 400 }
      );
    }

    // Validate data structure
    if (!data.groups || !data.amSchedule || !data.pmSchedule) {
      return NextResponse.json(
        { error: 'Invalid data structure. Required fields: groups, amSchedule, pmSchedule' },
        { status: 400 }
      );
    }

    // Generate PDF
    const pdfData = await generateSchedulePDF(data);

    // Store PDF in database
    const pdfRecord = await prisma.schedulePDF.upsert({
      where: {
        classId,
      },
      update: {
        pdfData,
        updatedAt: new Date(),
      },
      create: {
        classId,
        pdfData,
      },
    });

    return NextResponse.json({ success: true, id: pdfRecord.id });
  } catch (error) {
    console.error('Error generating PDF:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate PDF' },
      { status: 500 }
    );
  }
} 