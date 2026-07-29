/**
 * One-time script to normalize existing Teacher and Student usernames in the database.
 * Run with: npx tsx scripts/normalize-usernames.ts
 *
 * Handles duplicates: if normalizing would produce a username that already exists
 * on another record, the update is skipped and a warning is logged.
 */
import { PrismaClient } from '@prisma/client'
import { normalizeUsername } from '../src/lib/username'

const prisma = new PrismaClient()

async function main() {
  let teachersUpdated = 0
  let teachersSkipped = 0
  let studentsUpdated = 0
  let studentsSkipped = 0

  const teachers = await prisma.teacher.findMany({ select: { id: true, username: true } })
  for (const t of teachers) {
    const normalized = normalizeUsername(t.username)
    if (normalized === t.username) continue
    if (!normalized) {
      console.warn(`Teacher id=${t.id}: username "${t.username}" normalizes to empty; skipping`)
      teachersSkipped++
      continue
    }
    const existing = await prisma.teacher.findUnique({ where: { username: normalized } })
    if (existing && existing.id !== t.id) {
      console.warn(
        `Teacher id=${t.id}: "${t.username}" -> "${normalized}" conflicts with id=${existing.id}; skipping`,
      )
      teachersSkipped++
      continue
    }
    await prisma.teacher.update({ where: { id: t.id }, data: { username: normalized } })
    teachersUpdated++
  }

  const students = await prisma.student.findMany({ select: { id: true, username: true } })
  for (const s of students) {
    const normalized = normalizeUsername(s.username)
    if (normalized === s.username) continue
    if (!normalized) {
      console.warn(`Student id=${s.id}: username "${s.username}" normalizes to empty; skipping`)
      studentsSkipped++
      continue
    }
    const existing = await prisma.student.findUnique({ where: { username: normalized } })
    if (existing && existing.id !== s.id) {
      console.warn(
        `Student id=${s.id}: "${s.username}" -> "${normalized}" conflicts with id=${existing.id}; skipping`,
      )
      studentsSkipped++
      continue
    }
    await prisma.student.update({ where: { id: s.id }, data: { username: normalized } })
    studentsUpdated++
  }

  console.log('Done.')
  console.log(`Teachers: ${teachersUpdated} updated, ${teachersSkipped} skipped`)
  console.log(`Students: ${studentsUpdated} updated, ${studentsSkipped} skipped`)
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
