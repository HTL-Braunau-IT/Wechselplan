import { PrismaClient } from '@prisma/client'
import { seedHtlBraunau } from './seed-profiles/htl-braunau'

const prisma = new PrismaClient()

/**
 * School-specific reference data, selected by name. The generic seed below runs
 * for everyone; a profile adds one school's holidays, times, rooms, subjects and
 * learning contents. Schools without a profile maintain those under Admin → Daten.
 */
const PROFILES: Record<string, (prisma: PrismaClient) => Promise<void>> = {
  'htl-braunau': seedHtlBraunau,
}

/** `--profile <name>` wins over `SEED_PROFILE`; neither means generic only. */
function selectedProfile(): string | undefined {
  const argIndex = process.argv.indexOf('--profile')
  const fromArg = argIndex >= 0 ? process.argv[argIndex + 1] : undefined
  const name = (fromArg ?? process.env.SEED_PROFILE ?? '').trim()
  return name || undefined
}

/** Data every installation needs, independent of the school. */
async function seedGeneric() {
  console.log('👤 Seeding roles...')

  // The app also creates these on first login (ensureRolesExist in lib/auth),
  // so the generic seed is a convenience, not a prerequisite.
  const roles = [
    { name: 'admin', description: 'Administrator with full access to all features' },
    { name: 'teacher', description: 'Teacher with access to teaching-related features' },
    { name: 'student', description: 'Student with access to student-related features' },
  ]

  for (const role of roles) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: {},
      create: role,
    })
  }

  console.log(`✅ Seeded ${roles.length} roles`)
}

async function main() {
  const profile = selectedProfile()
  const seedProfile = profile ? PROFILES[profile] : undefined
  if (profile && !seedProfile) {
    throw new Error(
      `Unknown seed profile "${profile}". Known profiles: ${Object.keys(PROFILES).join(', ')}`,
    )
  }

  console.log(`🌱 Starting database seed (profile: ${profile ?? 'generic only'})...`)
  await seedGeneric()
  if (seedProfile) await seedProfile(prisma)
  console.log('🎉 Database seeding completed!')
}

main()
  .catch(e => {
    console.error('❌ Error during seeding:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
