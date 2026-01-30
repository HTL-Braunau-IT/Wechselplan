/**
 * Script to clear scheduleData JSON field after migration to normalized tables
 * 
 * This script:
 * 1. Verifies that normalized data exists for each schedule
 * 2. Clears the scheduleData JSON field (sets to null)
 * 
 * WARNING: This is irreversible. Only run after verifying all schedules work correctly.
 * 
 * Run with: npx tsx prisma/migrations/20260130123755_add_schedule_turns_and_weeks/clear_schedule_data.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function clearScheduleData() {
  console.log('Starting scheduleData cleanup...')
  console.log('This will clear the scheduleData JSON field for all schedules that have normalized data.\n')

  // Get all schedules
  const schedules = await prisma.schedule.findMany({
    where: {
      scheduleData: {
        not: null
      }
    },
    include: {
      turns: true
    }
  })

  console.log(`Found ${schedules.length} schedules with scheduleData\n`)

  let clearedCount = 0
  let skippedCount = 0
  const skippedSchedules: number[] = []

  for (const schedule of schedules) {
    // Check if normalized data exists
    const hasNormalizedData = schedule.turns && schedule.turns.length > 0

    if (hasNormalizedData) {
      // Clear the scheduleData field
      await prisma.schedule.update({
        where: { id: schedule.id },
        data: { scheduleData: null }
      })
      clearedCount++
      console.log(`✓ Cleared scheduleData for schedule ${schedule.id} (${schedule.turns.length} turns)`)
    } else {
      skippedCount++
      skippedSchedules.push(schedule.id)
      console.log(`⚠ Skipped schedule ${schedule.id} - no normalized data found`)
    }
  }

  console.log('\n' + '='.repeat(50))
  console.log('Cleanup Summary:')
  console.log(`  ✓ Cleared: ${clearedCount} schedules`)
  console.log(`  ⚠ Skipped: ${skippedCount} schedules`)
  
  if (skippedSchedules.length > 0) {
    console.log(`\n  Skipped schedule IDs: ${skippedSchedules.join(', ')}`)
    console.log('  These schedules still have scheduleData JSON and no normalized data.')
    console.log('  You may need to investigate these schedules manually.')
  }

  console.log('\n✅ Cleanup completed!')
}

clearScheduleData()
  .catch((error) => {
    console.error('❌ Cleanup failed:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

