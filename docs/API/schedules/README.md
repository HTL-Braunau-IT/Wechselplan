# Schedules API

The Schedules API provides comprehensive endpoints for managing general schedule operations, data retrieval, and schedule-related functionality. This API handles schedule creation, retrieval, time management, and data aggregation for teachers and classes.

## Overview

The Schedules API is organized into the following modules:

- **Main Schedules** - Core schedule creation and retrieval operations
- **Schedule Times** - Schedule and break time management
- **Schedule Data** - Aggregated schedule data for teachers
- **All Schedules** - Bulk schedule retrieval
- **PDF Data** - Student data for PDF generation
- **Assignments** - Teacher assignment retrieval

## Base URL

All schedules API endpoints are prefixed with `/api/schedules/`.

## Authentication

Schedules API endpoints require authentication for all operations. Include valid authentication headers:

```bash
Authorization: Bearer <jwt-token>
```

## Available Endpoints

### Main Schedule Management
- `GET /api/schedules` - Retrieve schedules for a class with optional weekday filtering
- `POST /api/schedules` - Create or replace schedules for a class on specific weekdays

### Schedule Times
- `GET /api/schedule/times` - Retrieve schedule and break times for a class
- `POST /api/schedule/times` - Update schedule and break times for a class

### Schedule Data
- `GET /api/schedules/data` - Retrieve comprehensive schedule data for a teacher

### All Schedules
- `GET /api/schedules/all` - Retrieve all schedule records

### PDF Data
- `GET /api/schedules/pdf-data` - Retrieve student data for PDF generation

### Assignments
- `GET /api/schedules/assignments` - Retrieve teacher assignments for a class

## Data Models

### Schedule Creation Request

```typescript
interface ScheduleRequest {
  name: string
  description?: string
  startDate: string
  endDate: string
  selectedWeekday: number // 0-6 (Sunday-Saturday)
  scheduleData: any
  classId?: string
  additionalInfo?: any
}
```

### Schedule Response

```typescript
interface Schedule {
  id: string
  name: string
  description?: string
  startDate: string
  endDate: string
  selectedWeekday: number
  classId?: number
  scheduleData: any
  additionalInfo?: any
  createdAt: string
  updatedAt: string
}
```

### Schedule Times Data

```typescript
interface ScheduleTimesResponse {
  scheduleTimes: Array<{
    id: number
    startTime: string
    endTime: string
  }>
  breakTimes: Array<{
    id: number
    startTime: string
    endTime: string
  }>
}
```

### Teacher Schedule Data

```typescript
interface TeacherScheduleData {
  schedules: Schedule[][]
  students: Student[][]
  teacherRotation: TeacherRotation[]
  assignments: TeacherAssignment[]
  classdata: Array<{
    id: number
    name: string
    classHead: string | null
    classLead: string | null
  }>
}
```

### PDF Data Response

```typescript
interface PDFDataResponse {
  students: Array<{
    id: string
    name: string
    classId: number
    groupId: string
  }>
}
```

## Validation Rules

### Schedule Creation
- **Name**: Required string with minimum length of 1
- **Start Date**: Required valid date string
- **End Date**: Required valid date string
- **Selected Weekday**: Required integer between 0-6
- **Class ID**: Optional string that will be converted to integer
- **Schedule Data**: Flexible structure for schedule-specific data
- **Additional Info**: Optional flexible structure

### Schedule Retrieval
- **Class ID**: Required for class-specific schedule retrieval
- **Weekday**: Optional filter for specific weekdays (0-6)

### Schedule Times
- **Class ID**: Required for schedule time operations
- **Schedule Times**: Array of time strings for schedule periods
- **Break Times**: Array of time strings for break periods

### Teacher Data
- **Teacher Username**: Required for teacher-specific data retrieval
- **Weekday**: Optional filter, defaults to '0'

## Error Handling

Schedules API endpoints follow the standard error response format:

```json
{
  "error": "Error message description",
  "details": "Additional error details (optional)"
}
```

Common error scenarios:
- `400 Bad Request` - Missing or invalid parameters
- `404 Not Found` - Class, teacher, or schedule not found
- `500 Internal Server Error` - Database or processing errors

## Database Operations

### Complex Relationships
- **Class-Schedule Relationship**: Classes have multiple schedules with different weekdays
- **Teacher Assignment Relationships**: Links teachers to classes and periods
- **Student Group Relationships**: Students are assigned to groups within classes
- **Schedule Time Relationships**: Schedules have associated time periods and breaks

### Transaction Management
- **Atomic Operations**: Schedule creation uses transactions for data consistency
- **Bulk Operations**: Schedule times are updated in bulk operations
- **Cascade Deletes**: Existing schedules are replaced when creating new ones

## Performance Considerations

### Query Optimization
- **Eager Loading**: Related data is loaded with includes
- **Bulk Operations**: Multiple records are updated in single operations
- **Indexing**: Proper database indexing for complex queries

### Caching Strategy
- **Schedule Data**: Frequently accessed schedule information
- **Teacher Data**: Teacher-specific schedule and assignment data
- **Class Data**: Class information and student lists

## Security Considerations

- **Input Validation**: All parameters are validated before processing
- **Access Control**: Schedule operations require specific permissions
- **Data Integrity**: Complex validation ensures data consistency
- **Error Logging**: All operations are logged for audit purposes

## Rate Limiting

Schedules API endpoints may have rate limiting for data-intensive operations:
- Teacher data retrieval involves multiple database queries
- Schedule creation affects existing schedule data
- PDF data generation may involve large datasets

## Related Documentation

- [Main Schedules](./index.md) - Core schedule management endpoints
- [Schedule Times](./times.md) - Schedule and break time management
- [Schedule Data](./data.md) - Teacher schedule data aggregation
- [All Schedules](./all.md) - Bulk schedule retrieval
- [PDF Data](./pdf-data.md) - Student data for PDF generation
- [Assignments](./assignments.md) - Teacher assignment retrieval
- [Schedule API](../schedule/README.md) - Related schedule management API
- [API Overview](../README.md) - General API information
- [Prisma Documentation](https://www.prisma.io/docs) - Database ORM 