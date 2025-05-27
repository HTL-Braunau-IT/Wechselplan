import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import PDFDocument from 'pdfkit';
import { Buffer } from 'buffer';

interface Student {
  id: number;
  firstName: string;
  lastName: string;
  groupId: number | null;
  classId: number | null;
}


interface Teacher {
  id: number;
  firstName: string;
  lastName: string;
}

interface TeacherRotation {
  id: number;
  classId: number;
  groupId: number;
  teacherId: number;
  turnId: string;
  period: string;
}

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const classId = searchParams.get('classId');

    if (!classId) {
      return NextResponse.json(
        { error: 'Class ID is required' },
        { status: 400 }
      );
    }

    // Fetch all necessary data
    const [classData, students, teachers, rotations] = await Promise.all([
      db.class.findUnique({
        where: { id: parseInt(classId) }
      }),
      db.student.findMany({
        where: { classId: parseInt(classId) }
      }),
      db.teacher.findMany(),
      db.teacherRotation.findMany({
        where: { classId: parseInt(classId) }
      })
    ]);

    if (!classData) {
      return NextResponse.json(
        { error: 'Class not found' },
        { status: 404 }
      );
    }

    // Group students by their groupId
    const groups: Record<string, Student[]> = students.reduce((acc: Record<string, Student[]>, student: Student) => {
      if (student.groupId) {
        const groupId = student.groupId.toString();
        acc[groupId] ??= [];
        acc[groupId]?.push(student);
      }
      return acc;
    }, {});

    // Create PDF
    const doc = new PDFDocument();
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));

    // Add content to PDF
    doc.fontSize(20).text(`Schedule for ${classData.name}`, { align: 'center' });
    doc.moveDown();

    // Add groups table
    doc.fontSize(16).text('Groups', { align: 'left' });
    doc.moveDown();

    for (const [groupId, groupStudents] of Object.entries(groups)) {
      doc.fontSize(14).text(`Group ${groupId}`, { align: 'left' });
      groupStudents.forEach((student: Student) => {
        doc.fontSize(12).text(`${student.lastName}, ${student.firstName}`);
      });
      doc.moveDown();
    }

    // Add rotation schedule
    doc.fontSize(16).text('Rotation Schedule', { align: 'left' });
    doc.moveDown();

    // Group rotations by period
    const amRotations = rotations.filter((r: TeacherRotation) => r.period === 'AM');
    const pmRotations = rotations.filter((r: TeacherRotation) => r.period === 'PM');

    // Add AM schedule
    doc.fontSize(14).text('Morning Schedule', { align: 'left' });
    doc.moveDown();

    amRotations.forEach((rotation: TeacherRotation) => {
      const teacher = teachers.find((t: Teacher) => t.id === rotation.teacherId);
      if (teacher) {
        doc.fontSize(12).text(
          `Turn ${rotation.turnId}: Group ${rotation.groupId} - ${teacher.lastName}, ${teacher.firstName}`
        );
      }
    });

    doc.moveDown();

    // Add PM schedule
    doc.fontSize(14).text('Afternoon Schedule', { align: 'left' });
    doc.moveDown();

    pmRotations.forEach((rotation: TeacherRotation) => {
      const teacher = teachers.find((t: Teacher) => t.id === rotation.teacherId);
      if (teacher) {
        doc.fontSize(12).text(
          `Turn ${rotation.turnId}: Group ${rotation.groupId} - ${teacher.lastName}, ${teacher.firstName}`
        );
      }
    });

    // Finalize PDF
    doc.end();

    // Wait for PDF to be generated
    const pdfBuffer = await new Promise<Buffer>((resolve) => {
      doc.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
    });

    // Return PDF
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="schedule-${classId}.pdf"`
      }
    });
  } catch (error) {
    console.error('Error generating PDF:', error);
    return NextResponse.json(
      { error: 'Failed to generate PDF' },
      { status: 500 }
    );
  }
} 