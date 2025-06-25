# Schedule Times API

The Schedule Times API allows administrators to manage class schedule time periods. These endpoints handle creating and retrieving schedule time configurations that define when classes occur.

## Base URL

`/api/admin/settings/schedule-times`

## Endpoints

### GET /api/admin/settings/schedule-times

Retrieves all schedule time records, ordered by start time.

#### Request

```http
GET /api/admin/settings/schedule-times
Authorization: Bearer <admin-jwt-token>
```

#### Response

**Success (200 OK)**

```json
[
  {
    "id": 1,
    "startTime": "08:00",
    "endTime": "09:30",
    "hours": 1.5,
    "period": "AM",
    "createdAt": "2024-01-15T10:00:00.000Z",
    "updatedAt": "2024-01-15T10:00:00.000Z"
  },
  {
    "id": 2,
    "startTime": "09:45",
    "endTime": "11:15",
    "hours": 1.5,
    "period": "AM",
    "createdAt": "2024-01-15T10:00:00.000Z",
    "updatedAt": "2024-01-15T10:00:00.000Z"
  }
]
```

**Error (500 Internal Server Error)**

```json
{
  "error": "Failed to fetch schedule times"
}
```

### POST /api/admin/settings/schedule-times

Creates a new schedule time record.

#### Request

```http
POST /api/admin/settings/schedule-times
Authorization: Bearer <admin-jwt-token>
Content-Type: application/json
```

**Request Body**

```json
{
  "startTime": "08:00",
  "endTime": "09:30",
  "hours": 1.5,
  "period": "AM"
}
```

#### Response

**Success (200 OK)**

```json
{
  "id": 3,
  "startTime": "08:00",
  "endTime": "09:30",
  "hours": 1.5,
  "period": "AM",
  "createdAt": "2024-01-15T10:00:00.000Z",
  "updatedAt": "2024-01-15T10:00:00.000Z"
}
```

**Validation Error (400 Bad Request)**

```json
{
  "error": "Missing required fields"
}
```

```json
{
  "error": "Hours must be a positive number"
}
```

```json
{
  "error": "Invalid period. Must be AM or PM"
}
```

```json
{
  "error": "Invalid time format. Use HH:mm"
}
```

**Server Error (500 Internal Server Error)**

```json
{
  "error": "Failed to create schedule time"
}
```

## Data Model

### Schedule Time Object

```typescript
interface ScheduleTime {
  id: number              // Unique identifier
  startTime: string       // Start time in "HH:mm" format
  endTime: string         // End time in "HH:mm" format
  hours: number           // Duration in hours (can be decimal)
  period: "AM" | "PM"     // Time period (AM or PM)
  createdAt: Date         // Creation timestamp
  updatedAt: Date         // Last update timestamp
}
```

### Create Schedule Time Request

```typescript
interface CreateScheduleTimeRequest {
  startTime: string       // Required: Start time in "HH:mm" format
  endTime: string         // Required: End time in "HH:mm" format
  hours: number           // Required: Duration in hours
  period: "AM" | "PM"     // Required: Time period
}
```

## Validation Rules

### Required Fields
- `startTime` - Must be provided
- `endTime` - Must be provided
- `hours` - Must be provided and must be a positive number
- `period` - Must be provided and must be either "AM" or "PM"

### Time Format Validation
- `startTime` and `endTime` must follow the "HH:mm" format (24-hour)
- Valid time range: 00:00 to 23:59
- Examples: "08:00", "14:30", "23:45"

### Hours Validation
- Must be a positive number
- Can be decimal (e.g., 1.5 for 1 hour 30 minutes)
- Must be finite (not NaN or Infinity)

### Period Validation
- Must be exactly "AM" or "PM" (case-sensitive)
- Used for organizing schedule periods

## Business Logic

### Time Ordering
- Schedule times are automatically ordered by `startTime` in ascending order
- This ensures consistent display in user interfaces

### Period Organization
- The `period` field helps organize schedule times into AM/PM blocks
- Useful for creating daily schedules with morning and afternoon sessions

## Error Handling

### Validation Errors (400 Bad Request)
- **Missing Fields**: All required fields must be provided
- **Invalid Hours**: Hours must be a positive number
- **Invalid Period**: Period must be "AM" or "PM"
- **Invalid Time Format**: Times must be in "HH:mm" format

### Server Errors (500 Internal Server Error)
- Database connection issues
- Data persistence failures
- Unexpected server errors

## Example Usage

### Retrieve All Schedule Times

```bash
curl -X GET \
  http://localhost:3000/api/admin/settings/schedule-times \
  -H "Authorization: Bearer <admin-jwt-token>"
```

### Create a New Schedule Time

```bash
curl -X POST \
  http://localhost:3000/api/admin/settings/schedule-times \
  -H "Authorization: Bearer <admin-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "startTime": "13:00",
    "endTime": "14:30",
    "hours": 1.5,
    "period": "PM"
  }'
```

### Create Multiple Schedule Times

```bash
# Morning session
curl -X POST \
  http://localhost:3000/api/admin/settings/schedule-times \
  -H "Authorization: Bearer <admin-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "startTime": "08:00",
    "endTime": "09:30",
    "hours": 1.5,
    "period": "AM"
  }'

# Afternoon session
curl -X POST \
  http://localhost:3000/api/admin/settings/schedule-times \
  -H "Authorization: Bearer <admin-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "startTime": "14:00",
    "endTime": "15:30",
    "hours": 1.5,
    "period": "PM"
  }'
```

## Related Documentation

- [Settings Management Overview](./README.md) - General settings API information
- [Break Times](./break-times.md) - Break time configuration
- [Admin API Overview](../README.md) - General admin API information
- [Database Schema](../../../../prisma/schema.prisma) - Database structure 