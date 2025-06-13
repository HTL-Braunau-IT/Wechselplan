import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { captureError } from '~/lib/sentry';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const classId: string | null = searchParams.get('class');

    if (!classId) {
      return NextResponse.json({ error: 'Class ID is required' }, { status: 400 });
    }

    const schedule = await prisma.schedule.findFirst({
      where: {
        classId: parseInt(classId as string),
      },
      include: {
        scheduleTimes: true,
        breakTimes: true,
      },
    });

    if (!schedule) {
      return NextResponse.json({ scheduleTimes: [], breakTimes: [] });
    }

    return NextResponse.json({
      scheduleTimes: schedule.scheduleTimes,
      breakTimes: schedule.breakTimes,
    });
  } catch (error) {
    captureError(error, {
      location: 'api/schedules/times',
      type: 'fetch_times_error',
      extra: {
        route: 'api/schedules/times'
      }
    });
    return NextResponse.json({ error: 'Failed to fetch times' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { classId, scheduleTimes, breakTimes } = body;

    if (!classId) {
      return NextResponse.json({ error: 'Class ID is required' }, { status: 400 });
    }

    const schedule = await prisma.schedule.findFirst({
      where: {
        classId: parseInt(classId as string),
      },
    });

    if (!schedule) {
      return NextResponse.json({ error: 'No schedule found for this class' }, { status: 404 });
    }

    const updatedSchedule = await prisma.schedule.update({
      where: {
        id: schedule.id,
      },
      data: {
        scheduleTimes: {
          deleteMany: {},
          create: scheduleTimes.map((time: string) => ({
            startTime: time,
            endTime: time, // You might want to adjust this based on your needs
          })),
        },
        breakTimes: {
          deleteMany: {},
          create: breakTimes.map((time: string) => ({
            startTime: time,
            endTime: time, // You might want to adjust this based on your needs
          })),
        },
      },
      include: {
        scheduleTimes: true,
        breakTimes: true,
      },
    });

    return NextResponse.json({
      scheduleTimes: updatedSchedule.scheduleTimes,
      breakTimes: updatedSchedule.breakTimes,
    });
  } catch (error) {
    captureError(error, {
      location: 'api/schedules/times',
      type: 'save_times_error',
      extra: {
        route: 'api/schedules/times'
      }
    });
    return NextResponse.json({ error: 'Failed to save times' }, { status: 500 });
  }
} 