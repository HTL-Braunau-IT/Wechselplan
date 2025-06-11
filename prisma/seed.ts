import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Initializes the database with default roles, school holidays, rooms, subjects, and learning content.
 *
 * Performs idempotent upsert operations for each data category to ensure records are created or updated without duplication.
 *
 * @remark
 * Existing school holidays are updated with new start and end dates if their names match; other entities are only created if absent.
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
    // Idempotent upsert – keyed on unique `name`
    await prisma.schoolHoliday.upsert({
      where: { name: holiday.name },
      update: {
        startDate: holiday.startDate,
        endDate: holiday.endDate,
      },
      create: holiday,
    })
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
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  }) 