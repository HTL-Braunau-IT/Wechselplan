/**
 * Read-only check for the Raumplan working invariant (HANDOFF §3, build step 1):
 *
 *   (teacher, weekday, period) → exactly one room
 *
 * The whole Raumplan resolution relies on this — a teacher's room being fixed
 * across the year is how a rotating group's room is derived from its rotated
 * teacher. If it does not hold, the model changes and the user must be told.
 *
 * Run with:
 *   npm run verify:raumplan-invariant            # current/latest school year
 *   npm run verify:raumplan-invariant -- 2       # a specific schoolYearId
 *
 * Exit codes:
 *   0 — invariant holds (no teacher bound to two rooms on a slot)
 *   1 — violations found, listed on stdout
 *   2 — the check itself failed (e.g. no database / no school year)
 */
import { loadEnvFile } from '../e2e/load-env'
import { getInvariantViolations } from '../src/lib/raumplan/query'
import { resolveSchoolYearId } from '../src/lib/school-year'

loadEnvFile()

async function main() {
  const arg = process.argv[2]
  const schoolYearId = await resolveSchoolYearId(arg)
  if (schoolYearId == null) {
    console.error('No school year found (empty database?).')
    process.exit(2)
  }

  const violations = await getInvariantViolations(schoolYearId)

  if (violations.length === 0) {
    console.log(
      `✓ Invariant holds for schoolYearId=${schoolYearId}: every (teacher, weekday, period) maps to exactly one room.`,
    )
    process.exit(0)
  }

  console.log(`✗ ${violations.length} invariant violation(s) for schoolYearId=${schoolYearId}:\n`)
  const weekdayNames = ['', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
  for (const v of violations) {
    console.log(
      `  ${v.teacherName} (teacherId=${v.teacherId}) — ${weekdayNames[v.weekday] ?? v.weekday} ${v.period} → rooms: ${v.roomNames.join(', ')}`,
    )
  }
  console.log(
    '\nThe (teacher, weekday, period) → one room assumption does NOT hold. Escalate — this changes the model (HANDOFF §3).',
  )
  process.exit(1)
}

main().catch(err => {
  console.error('verify-raumplan-invariant failed:', err instanceof Error ? err.message : err)
  process.exit(2)
})
