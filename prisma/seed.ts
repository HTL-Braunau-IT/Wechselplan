import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

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
      name: 'Herbstferien',
      startDate: new Date('2024-09-09'),
      endDate: new Date('2024-09-09')
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
    }
  ]

  for (const holiday of holidays) {
    await prisma.schoolHoliday.create({
      data: holiday
    })
  }

  console.log('School holidays created successfully')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  }) 