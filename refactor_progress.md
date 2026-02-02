# Schedule Refactoring Progress

## Phase 1: API Route Consolidation ✅ COMPLETED

### 1.1 Standardize API Structure ✅
- [x] Created new endpoints in `/api/schedules/*`:
  - [x] `/api/schedules/assignments` - Student group assignments
  - [x] `/api/schedules/teacher-assignments` - Teacher assignments
  - [x] `/api/schedules/times` - Schedule and break times
  - [x] `/api/schedules/rotation` - Teacher rotation
  - [x] `/api/schedules/notify-teachers` - Teacher notifications
- [x] Updated all endpoints to use `classId` (number) instead of `className` (string)
- [x] Updated all frontend API calls:
  - [x] `src/app/schedule/create/page.tsx`
  - [x] `src/app/schedule/create/teachers/page.tsx`
  - [x] `src/app/schedule/create/times/page.tsx`
  - [x] `src/app/schedule/create/overview/page.tsx`
  - [x] `src/hooks/use-schedule-overview.ts`
  - [x] `src/app/schedules/page.tsx`
- [x] Deleted old `/api/schedule/*` endpoints

### 1.2 Standardize Parameter Handling ✅
- [x] All endpoints now accept `classId` (number) as primary parameter
- [x] Frontend resolves className to classId using `/api/classes/get-by-name`
- [x] Removed class name lookups from individual endpoints

## Phase 2: Data Structure Normalization ✅ COMPLETED

### 2.1 Normalize Schedule Data
- [x] Create `ScheduleTurn` and `ScheduleWeek` models in Prisma schema
- [x] Write migration script to parse existing JSON and populate new tables
- [x] Update API endpoints to use new structure (now saves only to normalized tables, scheduleData set to null)
- [x] Run data migration (✅ 30 schedules migrated successfully)
- [x] Clear `scheduleData` JSON field (✅ 28 schedules cleared - see docs/MIGRATION_GUIDE.md)
- [x] Update schedule creation to not store scheduleData (now sets to null)
- [ ] Remove `scheduleData` column from schema (optional - field is already null for all schedules, can be done in future migration)

### 2.2 Simplify Group Storage
- [x] Document decision: Keep `Student.groupId` as source of truth
- [x] Ensure `GroupAssignment` stays in sync through application logic (documented in docs/ARCHITECTURE.md)

### 2.3 Normalize Custom Values
- [x] Add `isCustom` boolean flag to Subject, LearningContent, Room tables
- [x] Update API to check `isCustom` flag when handling values
- [x] Create migration script to mark existing custom values
- [x] Run custom values migration (✅ 2 rooms, 1 subject marked as custom)

## Phase 3: Component Refactoring ✅ MOSTLY COMPLETED

### 3.1 Break Down Large Components
- [x] Extract student assignment UI into `StudentAssignmentManager`
- [x] Extract `StudentItem` component
- [x] Extract `GroupContainer` component
- [x] Extract `AddStudentDialog` component
- [x] Extract `CombineClassesDialog` component
- [x] Update main schedule creation page to use new components
- [x] Extract teacher assignment UI components (`TeacherSelect`, `SubjectSelect`, `LearningContentSelect`, `RoomSelect`)
- [x] Update teachers page to use extracted select components
- [x] Extract rotation schedule UI into `RotationScheduleEditor` ✅
- [x] Extract times selection into `ScheduleTimesSelector` ✅

### 3.2 Create Shared Hooks ✅ COMPLETED
- [x] Create `useScheduleCreation()` hook (provides navigation helpers and class ID resolution)
- [x] Create `useClassData(classId)` hook (uses React Query)
- [x] Create `useGroupAssignments(classId)` hook (uses React Query)
- [x] Create `useTeacherAssignments(classId, weekday)` hook (uses React Query)
- [x] Create `useScheduleRotation(classId, weekday)` hook (uses React Query)
- [x] Create `useScheduleTimes(classId)` hook (uses React Query)
- [x] Update schedule creation pages to use new hooks (main page, times page, and teachers page completed)

### 3.3 Standardize Types ✅ COMPLETED
- [x] Consolidate all Schedule-related types in `src/types/schedule.ts`
- [x] Remove duplicate type definitions
- [x] Export types from single location
- [x] Update schedule creation pages to use consolidated types
- [ ] Use Zod schemas for runtime validation (future enhancement)

## Phase 4: State Management 🔄 PARTIALLY COMPLETED

### 4.1 Create Schedule Creation Context
- [ ] Create `ScheduleCreationContext` (optional - would reduce prop drilling but current implementation works)
- [ ] Replace prop drilling with context (optional)
- [ ] Add optimistic updates (optional enhancement)

### 4.2 Implement Data Caching ✅ MOSTLY COMPLETED
- [x] Use React Query for data fetching (all hooks use `@tanstack/react-query`)
- [x] Request deduplication (automatic with React Query)
- [x] Basic cache configuration (staleTime: 5 minutes for most queries)
- [ ] Improve cache invalidation strategies (some mutations invalidate cache, could be more comprehensive)

## Notes

- Phase 1 completed successfully
- All old endpoints removed
- All frontend calls updated to use new endpoints with classId
- No linting errors introduced

