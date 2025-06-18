# Break Times API

The Break Times API allows administrators to manage break periods between classes. These endpoints handle creating and retrieving break time configurations using Zod schema validation for robust data validation.

## Base URL

`/api/admin/settings/break-times`

## Endpoints

### GET /api/admin/settings/break-times

Retrieves all break time records, ordered by start time.

#### Request

```http
GET /api/admin/settings/break-times
Authorization: Bearer <admin-jwt-token>
```

#### Response

**Success (200 OK)**

```json
[
  {
    "id": 1,
    "name": "Morning Break",
    "startTime": "2024-01-15T09:30:00.000Z",
    "endTime": "2024-01-15T09:45:00.000Z",
    "period": "1",
    "createdAt": "2024-01-15T10:00:00.000Z",
    "updatedAt": "2024-01-15T10:00:00.000Z"
  },
  {
    "id": 2,
    "name": "Lunch Break",
    "startTime": "2024-01-15T12:00:00.000Z",
    "endTime": "2024-01-15T13:00:00.000Z",
    "period": "2",
    "createdAt": "2024-01-15T10:00:00.000Z",
    "updatedAt": "2024-01-15T10:00:00.000Z"
  }
]
```

**Error (500 Internal Server Error)**

```json
{
  "error": "Failed to fetch break times"
}
```

### POST /api/admin/settings/break-times

Creates a new break time record with comprehensive validation.

#### Request

```http
POST /api/admin/settings/break-times
Authorization: Bearer <admin-jwt-token>
Content-Type: application/json
```

**Request Body**

```json
{
  "name": "Afternoon Break",
  "startTime": "2024-01-15T15:30:00.000Z",
  "endTime": "2024-01-15T15:45:00.000Z",
  "period": "3"
}
```

#### Response

**Success (200 OK)**

```json
{
  "id": 3,
  "name": "Afternoon Break",
  "startTime": "2024-01-15T15:30:00.000Z",
  "endTime": "2024-01-15T15:45:00.000Z",
  "period": "3",
  "createdAt": "2024-01-15T10:00:00.000Z",
  "updatedAt": "2024-01-15T10:00:00.000Z"
}
```

**Validation Error (400 Bad Request)**

```json
{
  "error": "Validation failed",
  "details": {
    "name": {
      "_errors": ["Name is required"]
    }
  }
}
```

```json
{
  "error": "Validation failed",
  "details": {
    "startTime": {
      "_errors": ["Start time must be a valid datetime"]
    }
  }
}
```

```json
{
  "error": "Validation failed",
  "details": {
    "period": {
      "_errors": ["Period must be a positive integer"]
    }
  }
}
```

```json
{
  "error": "Validation failed",
  "details": {
    "startTime": {
      "_errors": ["Start time must be before end time"]
    }
  }
}
```

**Server Error (500 Internal Server Error)**

```json
{
  "error": "Failed to create break time"
}
```

## Data Model

### Break Time Object

```typescript
interface BreakTime {
  id: number              // Unique identifier
  name: string            // Break name/description
  startTime: string       // Start time (ISO datetime string)
  endTime: string         // End time (ISO datetime string)
  period: string          // Period number (positive integer)
  createdAt: Date         // Creation timestamp
  updatedAt: Date         // Last update timestamp
}
```

### Create Break Time Request

```typescript
interface CreateBreakTimeRequest {
  name: string            // Required: Break name/description
  startTime: string       // Required: Start time (ISO datetime)
  endTime: string         // Required: End time (ISO datetime)
  period: string          // Required: Period number (positive integer)
}
```

## Validation Schema

The API uses Zod schema validation for comprehensive data validation:

```typescript
const breakTimeSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  startTime: z.string().datetime('Start time must be a valid datetime'),
  endTime: z.string().datetime('End time must be a valid datetime'),
  period: z.string().refine(
    (val) => {
      const num = parseInt(val)
      return !isNaN(num) && num > 0
    },
    'Period must be a positive integer'
  )
}).refine(
  (data) => new Date(data.startTime) < new Date(data.endTime),
  {
    message: 'Start time must be before end time',
    path: ['startTime']
  }
)
```

## Validation Rules

### Required Fields
- `name` - Must be provided and not empty
- `startTime` - Must be a valid ISO datetime string
- `endTime` - Must be a valid ISO datetime string
- `period` - Must be a positive integer (as string)

### Name Validation
- Must be a non-empty string
- Minimum length: 1 character
- Used for identifying and describing the break period

### Time Validation
- `startTime` and `endTime` must be valid ISO datetime strings
- Examples: "2024-01-15T09:30:00.000Z", "2024-01-15T15:45:00.000Z"
- `startTime` must be before `endTime`
- Times are stored in UTC format

### Period Validation
- Must be a positive integer (provided as string)
- Examples: "1", "2", "3"
- Used for organizing breaks in chronological order
- Helps identify which break period in the schedule

## Business Logic

### Time Ordering
- Break times are automatically ordered by `startTime` in ascending order
- This ensures consistent display in user interfaces and schedule generation

### Period Organization
- The `period` field helps organize breaks in chronological sequence
- Useful for creating daily schedules with multiple break periods
- Period numbers should typically be sequential (1, 2, 3, etc.)

### DateTime Handling
- All times are stored and processed as ISO datetime strings
- Times are typically in UTC format for consistency
- The API validates datetime format and logical time ordering

## Error Handling

### Validation Errors (400 Bad Request)
- **Missing Name**: Name field is required and cannot be empty
- **Invalid Start Time**: Start time must be a valid ISO datetime
- **Invalid End Time**: End time must be a valid ISO datetime
- **Invalid Period**: Period must be a positive integer
- **Time Order**: Start time must be before end time

### Server Errors (500 Internal Server Error)
- Database connection issues
- Data persistence failures
- Unexpected server errors

## Example Usage

### Retrieve All Break Times

```bash
curl -X GET \
  http://localhost:3000/api/admin/settings/break-times \
  -H "Authorization: Bearer <admin-jwt-token>"
```

### Create a New Break Time

```bash
curl -X POST \
  http://localhost:3000/api/admin/settings/break-times \
  -H "Authorization: Bearer <admin-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Morning Break",
    "startTime": "2024-01-15T09:30:00.000Z",
    "endTime": "2024-01-15T09:45:00.000Z",
    "period": "1"
  }'
```

### Create Multiple Break Times

```bash
# Morning break
curl -X POST \
  http://localhost:3000/api/admin/settings/break-times \
  -H "Authorization: Bearer <admin-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Morning Break",
    "startTime": "2024-01-15T09:30:00.000Z",
    "endTime": "2024-01-15T09:45:00.000Z",
    "period": "1"
  }'

# Lunch break
curl -X POST \
  http://localhost:3000/api/admin/settings/break-times \
  -H "Authorization: Bearer <admin-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Lunch Break",
    "startTime": "2024-01-15T12:00:00.000Z",
    "endTime": "2024-01-15T13:00:00.000Z",
    "period": "2"
  }'

# Afternoon break
curl -X POST \
  http://localhost:3000/api/admin/settings/break-times \
  -H "Authorization: Bearer <admin-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Afternoon Break",
    "startTime": "2024-01-15T15:30:00.000Z",
    "endTime": "2024-01-15T15:45:00.000Z",
    "period": "3"
  }'
```

## Related Documentation

- [Settings Management Overview](./README.md) - General settings API information
- [Schedule Times](./schedule-times.md) - Schedule time configuration
- [Admin API Overview](../README.md) - General admin API information
- [Zod Validation](https://zod.dev/) - Schema validation library
- [Database Schema](../../../../prisma/schema.prisma) - Database structure 