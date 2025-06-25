# Settings Management API

The Settings Management API provides endpoints for configuring various system settings including schedule times, break times, and data import functionality.

## Overview

The Settings Management API is organized into the following modules:

- **Schedule Times** - Manage class schedule time periods
- **Break Times** - Configure break periods between classes
- **Data Import** - Import CSV data for rooms, subjects, and learning content

## Base URL

All settings API endpoints are prefixed with `/api/admin/settings/`.

## Authentication

Settings API endpoints require administrative privileges. Include valid authentication headers:

```bash
Authorization: Bearer <admin-jwt-token>
```

## Available Endpoints

### Schedule Times
- `GET /api/admin/settings/schedule-times` - Retrieve all schedule times
- `POST /api/admin/settings/schedule-times` - Create a new schedule time

### Break Times
- `GET /api/admin/settings/break-times` - Retrieve all break times
- `POST /api/admin/settings/break-times` - Create a new break time

### Data Import
- `GET /api/admin/settings/import` - Retrieve data by type (rooms, subjects, learning content)
- `POST /api/admin/settings/import` - Import CSV data for rooms, subjects, or learning content

## Data Models

### Schedule Time

```typescript
interface ScheduleTime {
  id: number
  startTime: string      // Format: "HH:mm"
  endTime: string        // Format: "HH:mm"
  hours: number          // Duration in hours
  period: "AM" | "PM"    // Time period
  createdAt: Date
  updatedAt: Date
}
```

### Break Time

```typescript
interface BreakTime {
  id: number
  name: string           // Break name/description
  startTime: string      // ISO datetime string
  endTime: string        // ISO datetime string
  period: string         // Period number (positive integer)
  createdAt: Date
  updatedAt: Date
}
```

### Import Data

```typescript
interface ImportData {
  name: string           // Required: Name of the item
  capacity?: number      // Optional: Room capacity
  description?: string   // Optional: Description
}
```

## Validation Rules

### Schedule Time Validation
- `startTime` and `endTime` must be in "HH:mm" format
- `hours` must be a positive number
- `period` must be either "AM" or "PM"
- `startTime` must be before `endTime`

### Break Time Validation
- `name` is required and must not be empty
- `startTime` and `endTime` must be valid datetime strings
- `period` must be a positive integer
- `startTime` must be before `endTime`

### Import Data Validation
- `name` is required for all records
- `capacity` is optional and must be a positive integer (for rooms)
- `description` is optional
- Duplicate names are automatically filtered out

## Error Handling

All settings endpoints follow the standard error response format:

```json
{
  "error": "Error message description",
  "details": "Additional error details (optional)"
}
```

Common validation errors:
- `400 Bad Request` - Invalid input data
- `500 Internal Server Error` - Server-side errors

## CSV Import Format

The data import endpoint accepts CSV files with the following formats:

### Rooms CSV
```csv
name,capacity,description
"Room 101",30,"Main classroom"
"Lab A",20,"Computer lab"
```

### Subjects CSV
```csv
name,description
"Mathematics","Advanced mathematics course"
"Physics","Physics fundamentals"
```

### Learning Content CSV
```csv
name,description
"Chapter 1","Introduction to the subject"
"Lab Exercise 1","Hands-on practice"
```

## Security Considerations

- All endpoints require administrative authentication
- CSV import validates data to prevent injection attacks
- Duplicate entries are automatically filtered to prevent data conflicts
- All operations are logged for audit purposes

## Rate Limiting

Settings endpoints may have rate limiting to prevent abuse, especially for import operations.

## Related Documentation

- [Schedule Times](./schedule-times.md) - Detailed schedule time management
- [Break Times](./break-times.md) - Break time configuration
- [Data Import](./import.md) - CSV data import functionality
- [Admin API Overview](../README.md) - General admin API information 