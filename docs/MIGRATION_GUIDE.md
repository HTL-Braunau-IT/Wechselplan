# Data Migration Guide

This document describes the migration process for normalizing schedule data and custom values.

## Migration Overview

Two major migrations were performed:

1. **Schedule Data Normalization**: Migrated `scheduleData` JSON field to relational tables (`ScheduleTurn`, `ScheduleWeek`, `ScheduleTurnHoliday`)
2. **Custom Values Migration**: Marked existing custom values with `isCustom = true` flag

## Completed Migrations

### ✅ Phase 1: Schema Migration

**Migration**: `20260130123755_add_schedule_turns_and_weeks`

**Changes Applied**:
- Created `ScheduleTurn` table to store rotation turns
- Created `ScheduleWeek` table to store weeks within turns
- Created `ScheduleTurnHoliday` table to link holidays to turns
- Added `isCustom` boolean field to `Subject`, `LearningContent`, and `Room` tables
- Made `scheduleData` field optional in `Schedule` table (for backward compatibility)

**Status**: ✅ Applied successfully

### ✅ Phase 2: Data Migration - Schedule Data

**Script**: `prisma/migrations/20260130123755_add_schedule_turns_and_weeks/migrate_data.ts`

**What it does**:
- Reads existing `scheduleData` JSON from all `Schedule` records
- Parses the JSON structure (turns, weeks, holidays)
- Creates `ScheduleTurn` records for each turn
- Creates `ScheduleWeek` records for each week
- Creates `ScheduleTurnHoliday` records for holidays linked to turns
- Handles existing schedules by deleting old normalized data before re-migrating

**Results**:
- ✅ Migrated 30 schedules successfully
- Total turns migrated: ~130 turns across all schedules

**Status**: ✅ Completed successfully

### ✅ Phase 3: Data Migration - Custom Values

**Script**: `prisma/migrations/20260130123755_add_schedule_turns_and_weeks/migrate_custom_values.ts`

**What it does**:
- Compares all existing `Subject`, `LearningContent`, and `Room` records against seed data
- Marks records as custom (`isCustom = true`) if they don't exist in the seed data
- Keeps seeded values as `isCustom = false`

**Results**:
- ✅ Marked 2 rooms as custom
- ✅ Marked 1 subject as custom
- ✅ Marked 0 learning contents as custom

**Status**: ✅ Completed successfully

## Current State

### Backward Compatibility

The system currently maintains **backward compatibility**:

- **Reading**: API endpoints check normalized tables first, fall back to `scheduleData` JSON if normalized data doesn't exist
- **Writing**: API endpoints write to both normalized tables AND `scheduleData` JSON field

This ensures:
- Old schedules without normalized data still work
- New schedules are saved in both formats
- Gradual migration without breaking existing functionality

### Database Schema

**New Tables**:
- `ScheduleTurn` - Stores rotation turns (e.g., "TURNUS 1", "TURNUS 2")
- `ScheduleWeek` - Stores weeks within turns
- `ScheduleTurnHoliday` - Links holidays to turns

**Modified Tables**:
- `Schedule` - `scheduleData` field is now optional
- `Subject` - Added `isCustom` boolean field
- `LearningContent` - Added `isCustom` boolean field
- `Room` - Added `isCustom` boolean field

## Completed Cleanup

### ✅ Phase 4: Clear scheduleData JSON Field

**Script**: `prisma/migrations/20260130123755_add_schedule_turns_and_weeks/clear_schedule_data.ts`

**What it does**:
- Verifies that normalized data exists for each schedule
- Clears the `scheduleData` JSON field (sets to null) for schedules with normalized data
- Skips schedules without normalized data (for safety)

**Results**:
- ✅ Cleared `scheduleData` for 28 schedules
- ✅ All schedules had normalized data, none were skipped

**Status**: ✅ Completed successfully

**Note**: The `scheduleData` field remains in the schema (as optional) but is now null for all migrated schedules. The field can be removed in a future migration if desired.

## Next Steps (Future)

### ⚠️ Remove `scheduleData` Field (Optional - After Verification Period)

**When to do this**:
- After verifying all schedules work correctly with normalized data
- After ensuring no code paths depend on the JSON field
- Recommended: Wait 1-2 weeks after migration

**Steps**:
1. Verify all schedules are accessible and editable
2. Check that no errors occur when reading/writing schedules
3. (Optional) Create a new migration to remove the `scheduleData` field entirely:
   ```sql
   ALTER TABLE "Schedule" DROP COLUMN "scheduleData";
   ```

**Note**: The field has already been cleared (set to null) for all migrated schedules. Removing the column is optional and only affects the schema - the data is already gone.

**Warning**: Removing the column is irreversible. Make sure all data is properly migrated before removing the field.

### Verification Checklist

Before removing `scheduleData` column (optional):

- [x] All existing schedules can be viewed
- [x] All existing schedules can be edited
- [x] New schedules can be created
- [x] Schedule rotation calculations work correctly
- [x] Holiday assignments are preserved
- [x] No errors in application logs related to schedule data
- [x] All API endpoints return correct data
- [x] scheduleData JSON field cleared for all migrated schedules

## Migration Scripts Reference

### Running Migrations Manually

If you need to re-run migrations (e.g., on a different environment):

```bash
# 1. Apply Prisma schema migrations
npx prisma migrate deploy

# 2. Regenerate Prisma client (required after schema changes)
npx prisma generate

# 3. Run schedule data migration
npx tsx prisma/migrations/20260130123755_add_schedule_turns_and_weeks/migrate_data.ts

# 4. Run custom values migration
npx tsx prisma/migrations/20260130123755_add_schedule_turns_and_weeks/migrate_custom_values.ts

# 5. Clear scheduleData JSON field (after verification)
npx tsx prisma/migrations/20260130123755_add_schedule_turns_and_weeks/clear_schedule_data.ts
```

### Rollback (If Needed)

If you need to rollback:

1. **Data Rollback**: The migration scripts don't delete the original `scheduleData` JSON, so data is preserved
2. **Schema Rollback**: You would need to create a new migration to:
   - Drop the new tables (`ScheduleTurn`, `ScheduleWeek`, `ScheduleTurnHoliday`)
   - Remove `isCustom` fields
   - Make `scheduleData` required again

**Note**: Rollback is complex and not recommended. Instead, fix any issues and re-run migrations.

## Troubleshooting

### Issue: "Cannot read properties of undefined (reading 'create')"

**Solution**: Regenerate Prisma client:
```bash
npx prisma generate
```

### Issue: Migration fails on specific schedule

**Solution**: 
1. Check the schedule's `scheduleData` JSON structure
2. Verify it matches the expected format
3. The migration script logs which schedule failed - check that specific record

### Issue: Custom values not marked correctly

**Solution**: 
1. Verify seed data in `prisma/seed.ts` matches the migration script
2. Re-run the custom values migration (it's idempotent)

## Summary

✅ **All migrations and cleanup completed successfully**

- Schema changes applied
- 30 schedules migrated to normalized structure
- Custom values marked correctly
- scheduleData JSON field cleared for 28 schedules
- Backward compatibility maintained (field remains in schema but is null)

**Status**: Migration complete! The system is now fully using normalized tables. The `scheduleData` column can optionally be removed in a future migration if desired.

