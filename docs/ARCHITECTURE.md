# Architecture Decisions

## Group Storage — per weekday (2026-09)

**Status**: Implemented. Supersedes the Phase 2.2 decision below.

Each weekday is its own plan (#98), and classes are split into different groups on different days,
so group membership is stored per plan day in `StudentWeekdayGroup`
(`studentId`, plan `classId`, `schoolYearId`, `selectedWeekday` → `groupId`). The wizard picks the
class and weekday first (step 1), then edits that day's groups (step 2).

- **Readers with a weekday** (dashboard `/api/schedules/data`, Raumplan, schedule PDF, Excel and
  Notenliste exports, `/schedules`) overlay that day's grouping onto the students.
- **Grade screens** (Noten, Notensammler, NM transfer, Klassenliste) have no weekday of their own;
  they use the day the requesting teacher teaches the class (earliest if several, `?weekday=`
  overrides; a non-teaching viewer gets the class's first planned day).
- All of it goes through `src/lib/weekday-groups.ts` (`overlayWeekdayGroups`, `gradeGroupDay`, …),
  which keeps the existing `{ groupId }` student shape, so clients did not change.
- Settings attached to a group number are per weekday too: `NotenWeightConfig` (group-level
  weights) and `NotenSeatingLayout` (Sitzplan) carry `selectedWeekday`, resolved with
  `groupSettingsWeekday`. Class- and global-level weights stay day-independent.
- The grade screens offer a day switch when the teacher teaches the class on several days (Noten)
  or the class has several planned days (Notensammler, Klassenlisten); the chosen day travels as
  `?weekday=` / `weekday` in the body.
- `Student.groupId` is no longer written by the wizard. It is the fallback for classes without
  per-day rows and is still cleared by directory sync on a class move (which also drops the
  student's per-day rows outside the new class).

## Group Storage (Phase 2.2) — superseded

### Decision: Keep `Student.groupId` as Source of Truth

**Status**: Implemented

**Decision**: The `Student.groupId` field is the primary source of truth for group assignments. The `GroupAssignment` table serves as a denormalized cache/index for faster queries.

### Rationale

1. **Single Source of Truth**: `Student.groupId` directly represents the student's current group assignment
2. **Data Consistency**: Updates to student groups only need to modify one field
3. **Simplified Queries**: Most queries can directly use `Student.groupId` without joins
4. **Performance**: Direct foreign key relationship is faster than junction table lookups

### Implementation

- When a student's group is updated, `Student.groupId` is updated directly
- `GroupAssignment` records are maintained for:
  - Fast group membership queries
  - Ensuring group records exist even when empty
  - Historical tracking (if needed in future)

### Synchronization

The application logic ensures `GroupAssignment` stays in sync with `Student.groupId`:

1. When students are assigned to groups, both `Student.groupId` and `GroupAssignment` are updated
2. The `/api/schedules/assignments` endpoint automatically creates missing `GroupAssignment` records
3. Group deletion is handled through cascade rules or explicit cleanup

### Future Considerations

- Consider adding a database trigger to auto-sync `GroupAssignment` if needed
- Monitor for any inconsistencies and add validation if required

