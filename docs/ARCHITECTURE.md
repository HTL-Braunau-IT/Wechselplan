# Architecture Decisions

## Group Storage (Phase 2.2)

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

