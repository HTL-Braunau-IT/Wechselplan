# Schedule API

The Schedule API provides comprehensive endpoints for managing all aspects of class scheduling, including schedule times, teacher assignments, teacher rotations, turn schedules, and student group assignments. This API handles the complex scheduling logic required for educational planning and management.

## Overview

The Schedule API is organized into the following modules:

- **Schedule Times** - Manage schedule and break times for classes
- **Teacher Assignments** - Create and manage teacher assignments for AM/PM periods
- **Teacher Rotation** - Handle teacher rotation schedules across groups and turns
- **Turns** - Manage turn schedules and date assignments
- **Assignments** - Handle student group assignments and organization

## Base URL

All schedule API endpoints are prefixed with `/api/schedule/`.

## Authentication

Schedule API endpoints require authentication for all operations. Include valid authentication headers:

```bash
Authorization: Bearer <jwt-token>
```

## Available Endpoints

### Schedule Times Management
- `GET /api/schedule/times` - Retrieve schedule and break times for a class
- `POST /api/schedule/times` - Update schedule and break times for a class
- `OPTIONS /api/schedule/times` - CORS preflight request

### Teacher Assignments
- `GET /api/schedule/teacher-assignments` - Retrieve teacher assignments for a class
- `POST /api/schedule/teacher-assignments` - Create or update teacher assignments

### Teacher Rotation
- `POST /api/schedule/teacher-rotation` - Update teacher rotation schedules

### Turn Schedules
- `GET /api/schedule/turns` - Retrieve predefined turn schedules

### Student Assignments
- `GET /api/schedule/assignments` - Retrieve student group assignments
- `POST /api/schedule/assignments` - Update student group assignments

## Data Models

### Schedule Times Data

```typescript
interface ScheduleTimes {
  scheduleTimes: Array<{
    id: number
    name: string
    startTime: string
    endTime: string
  }>
  breakTimes: Array<{
    id: number
    name: string
    startTime: string
    endTime: string
  }>
}
```

### Teacher Assignment Data

```typescript
interface TeacherAssignment {
  groupId: number
  teacherId: number
  teacherFirstName: string
  teacherLastName: string
  subject: string
  learningContent: string
  room: string
}
```

### Teacher Rotation Data

```typescript
interface TeacherRotationRequest {
  className: string
  turns: string[]
  amRotation: Array<{
    groupId: number
    turns: (number | null)[]
  }>
  pmRotation: Array<{
    groupId: number
    turns: (number | null)[]
  }>
}
```

### Turn Schedule Data

```typescript
interface TurnSchedule {
  [turnKey: string]: {
    weeks: Array<{
      date: string
    }>
  }
}
```

### Student Assignment Data

```typescript
interface Assignment {
  groupId: number
  studentIds: number[]
}
```

## Validation Rules

### Schedule Times
- Class name must be provided for all operations
- Schedule and break times must be valid time formats
- Only the latest schedule can be updated

### Teacher Assignments
- Class name is required for all operations
- Subject, learning content, and room must exist in the database
- Group assignments must be valid (0 for unassigned, positive numbers for groups)
- AM/PM periods must be properly specified

### Teacher Rotation
- All required fields must be provided (className, turns, amRotation, pmRotation)
- Turn arrays must match the length of the turns parameter
- Teacher IDs must be valid and exist in the database

### Student Assignments
- Class name is required for all operations
- Group IDs must be valid numbers
- Student IDs must exist and belong to the specified class
- Unassigned students are handled with groupId: 0 or null

## Error Handling

Schedule API endpoints follow the standard error response format:

```json
{
  "error": "Error message description",
  "details": "Additional error details (optional)"
}
```

Common error scenarios:
- `400 Bad Request` - Missing or invalid parameters
- `404 Not Found` - Class or related entities not found
- `409 Conflict` - Existing assignments conflict
- `500 Internal Server Error` - Database or processing errors

## Database Operations

### Complex Relationships
- **Class-Schedule Relationship**: Classes have multiple schedules with times
- **Teacher Assignment Relationships**: Links teachers, subjects, learning content, and rooms
- **Student Group Relationships**: Students are assigned to groups within classes
- **Rotation Relationships**: Teacher rotations across groups and turns

### Transaction Management
- **Atomic Operations**: Teacher assignment updates use transactions
- **Bulk Updates**: Student assignments are updated in bulk operations
- **Cascade Deletes**: Teacher rotations are replaced entirely

## Performance Considerations

### Query Optimization
- **Eager Loading**: Related data is loaded with includes
- **Bulk Operations**: Multiple records are updated in single operations
- **Indexing**: Proper database indexing for complex queries

### Caching Strategy
- **Turn Schedules**: Static turn data can be cached
- **Class Data**: Frequently accessed class information
- **Assignment Data**: Student and teacher assignments

## Security Considerations

- **Input Validation**: All parameters are validated before processing
- **Access Control**: Schedule operations require specific permissions
- **Data Integrity**: Complex validation ensures data consistency
- **Error Logging**: All operations are logged for audit purposes

## Rate Limiting

Schedule API endpoints may have stricter rate limiting due to complex operations:
- Teacher assignment updates involve multiple database operations
- Student assignment updates affect multiple records
- Schedule time updates require validation and processing

## Related Documentation

- [Schedule Times](./times.md) - Schedule and break time management
- [Teacher Assignments](./teacher-assignments.md) - Teacher assignment management
- [Teacher Rotation](./teacher-rotation.md) - Teacher rotation schedules
- [Turns](./turns.md) - Turn schedule management
- [Assignments](./assignments.md) - Student group assignments
- [API Overview](../README.md) - General API information
- [Prisma Documentation](https://www.prisma.io/docs) - Database ORM 