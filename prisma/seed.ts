import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Seeds the database with default roles, school holidays, rooms, subjects, learning content, break times, and schedule times.
 *
 * Performs idempotent upsert operations for each data category to ensure that records are created if absent or updated as needed, preventing duplication.
 *
 * @remark
 * Existing school holidays are updated with new start and end dates if a holiday with the same name exists; all other entities are only created if they do not already exist.
 */
async function main() {
  // Create default roles
  const roles = [
    {
      name: 'admin',
      description: 'Administrator with full access to all features'
    },
    {
      name: 'teacher',
      description: 'Teacher with access to teaching-related features'
    },
    {
      name: 'student',
      description: 'Student with access to student-related features'
    }
  ]

  for (const role of roles) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: {},
      create: role
    })
  }

  console.log('Default roles created successfully')

  // Create school holidays
  const holidays = [
    {
      name: 'Erste Schulwoche',
      startDate: new Date('2024-09-09'),
      endDate: new Date('2024-09-16')
    },
    {
      name: 'Herbstferien',
      startDate: new Date('2024-10-28'),
      endDate: new Date('2024-11-03')
    },
    {
      name: 'Weihnachtsferien',
      startDate: new Date('2024-12-21'),
      endDate: new Date('2025-01-06')
    },
    {
      name: 'Semesterferien',
      startDate: new Date('2025-02-17'),
      endDate: new Date('2025-02-21')
    },
    {
      name: 'Osterferien',
      startDate: new Date('2025-04-14'),
      endDate: new Date('2025-04-21')
    },
    {
      name: 'Maifeiertag',
      startDate: new Date('2025-05-01'),
      endDate: new Date('2025-05-02')
    },
    {
      name: 'Christi Himmelfahrt',
      startDate: new Date('2025-05-29'),
      endDate: new Date('2025-05-30')
    },
    {
      name: 'Pfingstmontag',
      startDate: new Date('2025-06-09'),
      endDate: new Date('2025-06-09')
    },
    {
      name: 'Fronleichnam',
      startDate: new Date('2025-06-19'),
      endDate: new Date('2025-06-20')
    },
    {
      name: 'Letzten zwei Schulwoche',
      startDate: new Date('2025-06-23'),
      endDate: new Date('2025-07-04')
    }
  ]

  for (const holiday of holidays) {
    // Find existing holiday by name
    const existingHoliday = await prisma.schoolHoliday.findFirst({
      where: { name: holiday.name }
    })

    if (existingHoliday) {
      // Update existing holiday
      await prisma.schoolHoliday.update({
        where: { id: existingHoliday.id },
        data: {
          startDate: holiday.startDate,
          endDate: holiday.endDate,
        }
      })
    } else {
      // Create new holiday
      await prisma.schoolHoliday.create({
        data: holiday
      })
    }
  }

  console.log('School holidays created successfully')

  // Create rooms
  const rooms = [
    {
      name: 'Room 101',
      capacity: 30,
      description: 'Main classroom for general subjects'
    },
    {
      name: 'Room 102',
      capacity: 25,
      description: 'Computer lab'
    },
    {
      name: 'Room 103',
      capacity: 20,
      description: 'Science laboratory'
    },
    {
      name: 'Room 104',
      capacity: 35,
      description: 'Large lecture hall'
    },
    {
      name: 'Room 105',
      capacity: 15,
      description: 'Small group room'
    }
  ]

  for (const room of rooms) {
    await prisma.room.upsert({
      where: { name: room.name },
      update: {},
      create: room
    })
  }

  console.log('Rooms created successfully')

  // Create subjects
  const subjects = [
    {
      name: 'Mathematics',
      description: 'Core mathematics curriculum including algebra, geometry, and calculus'
    },
    {
      name: 'Physics',
      description: 'Study of matter, energy, and their interactions'
    },
    {
      name: 'Computer Science',
      description: 'Programming, algorithms, and computer systems'
    },
    {
      name: 'English',
      description: 'English language and literature'
    },
    {
      name: 'German',
      description: 'German language and literature'
    }
  ]

  for (const subject of subjects) {
    await prisma.subject.upsert({
      where: { name: subject.name },
      update: {},
      create: subject
    })
  }

  console.log('Subjects created successfully')

  // Create learning content
  const learningContents = [
    {
      name: 'Basic Algebra',
      description: 'Introduction to algebraic concepts and equations'
    },
    {
      name: 'Mechanics',
      description: 'Study of motion, forces, and energy'
    },
    {
      name: 'Web Development',
      description: 'HTML, CSS, and JavaScript fundamentals'
    },
    {
      name: 'Grammar and Composition',
      description: 'English grammar rules and writing techniques'
    },
    {
      name: 'German Literature',
      description: 'Study of German literary works and analysis'
    }
  ]

  for (const content of learningContents) {
    await prisma.learningContent.upsert({
      where: { name: content.name },
      update: {},
      create: content
    })
  }

  console.log('Learning content created successfully')

  // Create break times
  const breakTimes = [
    {
      name: 'Vormittagspause 1',
      startTime: '08:45',
      endTime: '09:00',
      period: 'AM'
    },
    {
      name: 'Vormittagspause 2',
      startTime: '09:45',
      endTime: '09:55',
      period: 'AM'
    },
    {
      name: 'Vormittagspause 3',
      startTime: '10:45',
      endTime: '10:55',
      period: 'AM'
    },
    {
      name: 'Mittagspause 1',
      startTime: '11:25',
      endTime: '12:15',
      period: 'LUNCH'
    },
    {
      name: 'Mittagspause 2',
      startTime: '12:15',
      endTime: '13:05',
      period: 'LUNCH'
    },
    {
      name: 'Mittagspause 3',
      startTime: '13:05',
      endTime: '13:55',
      period: 'LUNCH'
    },
    {
      name: 'Nachmittagspause 1',
      startTime: '14:00',
      endTime: '14:10',
      period: 'PM'
    },
    {
      name: 'Nachmittagspause 2',
      startTime: '14:50',
      endTime: '15:00',
      period: 'PM'
    }
  ]

  for (const breakTime of breakTimes) {
    await prisma.breakTime.upsert({
      where: {
        startTime_endTime_period: {
          startTime: breakTime.startTime,
          endTime: breakTime.endTime,
          period: breakTime.period
        }
      },
      update: {},
      create: breakTime
    })
  }

  console.log('Break times created successfully')

  // Create schedule times
  const scheduleTimes = [
    {
      startTime: '07:50',
      endTime: '10:25',
      hours: 3.5,
      period: 'AM'
    },
    {
      startTime: '07:50',
      endTime: '11:25',
      hours: 5,
      period: 'AM'
    },
    {
      startTime: '07:50',
      endTime: '12:15',
      hours: 6,
      period: 'AM'
    },
    {
      startTime: '08:40',
      endTime: '11:25',
      hours: 4,
      period: 'AM'
    },
    {
      startTime: '08:45',
      endTime: '12:15',
      hours: 5,
      period: 'AM'
    },
    {
      startTime: '09:40',
      endTime: '12:15',
      hours: 3,
      period: 'AM'
    },
    {
      startTime: '09:40',
      endTime: '13:05',
      hours: 4,
      period: 'AM'
    },
    {
      startTime: '10:45',
      endTime: '12:30',
      hours: 2,
      period: 'AM'
    },
    {
      startTime: '10:45',
      endTime: '13:15',
      hours: 3,
      period: 'AM'
    },
    {
      startTime: '11:25',
      endTime: '15:35',
      hours: 4,
      period: 'PM'
    },
    {
      startTime: '11:25',
      endTime: '16:35',
      hours: 5,
      period: 'PM'
    },
    {
      startTime: '12:15',
      endTime: '15:35',
      hours: 2,
      period: 'PM'
    },
    {
      startTime: '12:15',
      endTime: '15:45',
      hours: 3,
      period: 'PM'
    },
    {
      startTime: '12:15',
      endTime: '16:35',
      hours: 5,
      period: 'PM'
    },
    {
      startTime: '13:05',
      endTime: '15:45',
      hours: 3,
      period: 'PM'
    },
    {
      startTime: '13:05',
      endTime: '16:35',
      hours: 4,
      period: 'PM'
    },
    {
      startTime: '14:25',
      endTime: '16:55',
      hours: 2,
      period: 'PM'
    }
  ]

  for (const scheduleTime of scheduleTimes) {
    await prisma.scheduleTime.upsert({
      where: {
        startTime_endTime_period: {
          startTime: scheduleTime.startTime,
          endTime: scheduleTime.endTime,
          period: scheduleTime.period
        }
      },
      update: {},
      create: scheduleTime
    })
  }

  console.log('Schedule times created successfully')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => {
    void prisma.$disconnect()
  }) 