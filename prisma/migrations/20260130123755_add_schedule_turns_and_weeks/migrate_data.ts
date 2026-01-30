/**
 * Data migration script to populate ScheduleTurn and ScheduleWeek tables
 * from existing scheduleData JSON field.
 * 
 * This script should be run after the schema migration but before removing
 * the scheduleData field.
 * 
 * Run with: npx tsx prisma/migrations/20260130123755_add_schedule_turns_and_weeks/migrate_data.ts
 */

import { PrismaClient, Prisma } from '@prisma/client'

const prisma = new PrismaClient()

interface ScheduleWeek {
  date: string
  week: string
  isHoliday: boolean
}

interface ScheduleTerm {
  name: string
  weeks: ScheduleWeek[]
  holidays?: Array<{ id: number; name: string; startDate: string; endDate: string }>
  customLength?: number
}

type ScheduleData = Record<string, ScheduleTerm>

async function migrateScheduleData() {
  console.log('Starting schedule data migration...')

  // Get all schedules with scheduleData
  // Note: We'll filter in memory since Prisma JSON filters are complex
  const allSchedules = await prisma.schedule.findMany()
  const schedules = allSchedules.filter(s => s.scheduleData !== null)

  console.log(`Found ${schedules.length} schedules to migrate`)

  for (const schedule of schedules) {
    try {
      const scheduleData = schedule.scheduleData as unknown as ScheduleData | null
      
      if (!scheduleData || typeof scheduleData !== 'object') {
        console.log(`Skipping schedule ${schedule.id}: invalid scheduleData`)
        continue
      }

      // Get all holidays for reference
      const allHolidays = await prisma.schoolHoliday.findMany()

      // Process each turn (term) in the schedule data
      const turnEntries = Object.entries(scheduleData)
      let turnOrder = 0

      for (const [turnName, turnData] of turnEntries) {
        if (!turnData || typeof turnData !== 'object' || !turnData.weeks) {
          console.log(`Skipping invalid turn ${turnName} in schedule ${schedule.id}`)
          continue
        }

        // Create ScheduleTurn
        const scheduleTurn = await prisma.scheduleTurn.create({
          data: {
            scheduleId: schedule.id,
            name: turnName,
            customLength: turnData.customLength ?? null,
            order: turnOrder++,
          }
        })

        // Create ScheduleWeek entries
        if (Array.isArray(turnData.weeks)) {
          for (const week of turnData.weeks) {
            if (week && typeof week === 'object' && week.date && week.week) {
              await prisma.scheduleWeek.create({
                data: {
                  turnId: scheduleTurn.id,
                  date: String(week.date),
                  week: String(week.week),
                  isHoliday: Boolean(week.isHoliday),
                }
              })
            }
          }
        }

        // Link holidays to the turn
        if (Array.isArray(turnData.holidays)) {
          for (const holiday of turnData.holidays) {
            if (holiday && typeof holiday === 'object' && holiday.id) {
              // Find matching holiday in database
              const dbHoliday = allHolidays.find(h => h.id === holiday.id)
              if (dbHoliday) {
                await prisma.scheduleTurnHoliday.upsert({
                  where: {
                    turnId_holidayId: {
                      turnId: scheduleTurn.id,
                      holidayId: dbHoliday.id
                    }
                  },
                  create: {
                    turnId: scheduleTurn.id,
                    holidayId: dbHoliday.id,
                  },
                  update: {}
                })
              }
            }
          }
        }
      }

      console.log(`✓ Migrated schedule ${schedule.id} (${turnOrder} turns)`)
    } catch (error) {
      console.error(`✗ Error migrating schedule ${schedule.id}:`, error)
    }
  }

  console.log('Migration completed!')
}

migrateScheduleData()
  .catch((error) => {
    console.error('Migration failed:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

