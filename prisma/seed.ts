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
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  }) 