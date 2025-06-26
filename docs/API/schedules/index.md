# Main Schedules API

The Main Schedules API handles core schedule creation and retrieval operations. This endpoint manages schedules for classes on specific weekdays, including creation, replacement, and retrieval with optional filtering.

## Base URL

`/api/schedules`

## Endpoints

### GET /api/schedules

Retrieves schedules for a class, optionally filtered by weekday.

#### Request

```http
GET /api/schedules?classId=10A&weekday=1
```

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `classId` | string | Yes | The name of the class to retrieve schedules for |
| `weekday` | string | No | The weekday to filter by (0-6, where 0=Sunday) |

#### Response

**Success (200 OK)**

```json
[
  {
    "id": "1",
    "name": "Monday Schedule",
    "description": "Regular Monday schedule for 10A",
    "startDate": "2024-01-15T00:00:00.000Z",
    "endDate": "2024-06-30T00:00:00.000Z",
    "selectedWeekday": 1,
    "classId": 1,
    "scheduleData": {
      "periods": [
        {
          "time": "08:00-08:45",
          "subject": "Mathematics",
          "teacher": "John Doe"
        }
      ]
    },
    "additionalInfo": {
      "notes": "Special arrangements for Monday"
    },
    "createdAt": "2024-01-15T10:00:00.000Z",
    "updatedAt": "2024-01-15T10:00:00.000Z"
  }
]
```

**Validation Error (400 Bad Request)**

```json
{
  "error": "Class ID is required"
}
```

**Not Found Error (404 Not Found)**

```json
{
  "error": "Class '10A' not found"
}
```

**No Schedules Found (404 Not Found)**

```json
{
  "error": "No schedules found"
}
```

### POST /api/schedules

Creates or replaces a schedule for a class on a specific weekday.

#### Request

```http
POST /api/schedules
Content-Type: application/json

{
  "name": "Monday Schedule",
  "description": "Regular Monday schedule for 10A",
  "startDate": "2024-01-15",
  "endDate": "2024-06-30",
  "selectedWeekday": 1,
  "scheduleData": {
    "periods": [
      {
        "time": "08:00-08:45",
        "subject": "Mathematics",
        "teacher": "John Doe"
      },
      {
        "time": "08:50-09:35",
        "subject": "Science",
        "teacher": "Jane Smith"
      }
    ]
  },
  "classId": "1",
  "additionalInfo": {
    "notes": "Special arrangements for Monday"
  }
}
```

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | The name of the schedule |
| `description` | string | No | Optional description of the schedule |
| `startDate` | string | Yes | Start date in ISO format |
| `endDate` | string | Yes | End date in ISO format |
| `selectedWeekday` | number | Yes | Weekday number (0-6, where 0=Sunday) |
| `scheduleData` | any | Yes | Flexible schedule data structure |
| `classId` | string | Yes | Class ID (converted to integer) |
| `additionalInfo` | any | No | Additional flexible data |

#### Response

**Success (200 OK)**

```json
{
  "id": "1",
  "name": "Monday Schedule",
  "description": "Regular Monday schedule for 10A",
  "startDate": "2024-01-15T00:00:00.000Z",
  "endDate": "2024-06-30T00:00:00.000Z",
  "selectedWeekday": 1,
  "classId": 1,
  "scheduleData": {
    "periods": [
      {
        "time": "08:00-08:45",
        "subject": "Mathematics",
        "teacher": "John Doe"
      }
    ]
  },
  "additionalInfo": {
    "notes": "Special arrangements for Monday"
  },
  "createdAt": "2024-01-15T10:00:00.000Z",
  "updatedAt": "2024-01-15T10:00:00.000Z"
}
```

**Validation Error (400 Bad Request)**

```json
{
  "error": "Invalid request data",
  "details": {
    "name": {
      "_errors": ["Name is required"]
    },
    "startDate": {
      "_errors": ["Invalid start date format"]
    }
  }
}
```

**Server Error (500 Internal Server Error)**

```json
{
  "error": "Internal Error"
}
```

## Data Processing

### Schedule Retrieval Process
The API performs the following operations:
1. **Class Validation**: Validates that the class exists by name
2. **Weekday Filtering**: Optionally filters schedules by weekday
3. **Schedule Retrieval**: Fetches schedules ordered by creation date
4. **Response**: Returns array of matching schedules

### Schedule Creation Process
1. **Request Validation**: Validates request body against schema
2. **Existing Schedule Cleanup**: Deletes existing schedules for the same class and weekday
3. **New Schedule Creation**: Creates new schedule with provided data
4. **Response**: Returns the newly created schedule

## Data Models

### Schedule Request Schema

```typescript
const scheduleSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  startDate: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: 'Invalid start date format'
  }),
  endDate: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: 'Invalid end date format'
  }),
  selectedWeekday: z.number().int().min(0).max(6),
  scheduleData: z.any(),
  classId: z.string().optional(),
  additionalInfo: z.any().optional()
})
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

## Business Logic

### Class Lookup
```typescript
const classRecord = await prisma.class.findFirst({
  where: {
    name: className
  }
})

if (!classRecord) {
  return NextResponse.json(
    { error: `Class '${className}' not found` },
    { status: 404 }
  )
}
```

### Schedule Retrieval with Filtering
```typescript
const schedules = await prisma.schedule.findMany({
  where: {
    classId: classRecord.id,
    ...(weekday ? { selectedWeekday: parseInt(weekday) } : {})
  },
  orderBy: {
    createdAt: 'desc'
  }
})
```

### Existing Schedule Cleanup
```typescript
await prisma.schedule.deleteMany({
  where: {
    classId: classId ? parseInt(classId) : null,
    selectedWeekday
  }
})
```

### New Schedule Creation
```typescript
const newSchedule = await prisma.schedule.create({
  data: {
    name,
    description,
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    selectedWeekday,
    classId: classId ? parseInt(classId) : null,
    scheduleData,
    additionalInfo
  }
})
```

## Database Schema

### Schedule Table
```sql
CREATE TABLE schedule (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  startDate TIMESTAMP NOT NULL,
  endDate TIMESTAMP NOT NULL,
  selectedWeekday INT NOT NULL CHECK (selectedWeekday >= 0 AND selectedWeekday <= 6),
  classId INT,
  scheduleData JSON,
  additionalInfo JSON,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (classId) REFERENCES class(id)
);
```

### Class Table Reference
```sql
CREATE TABLE class (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL UNIQUE,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

## Error Handling

### Validation Errors (400 Bad Request)
- **Missing Class ID**: The `classId` parameter is required for GET requests
- **Invalid Request Body**: Malformed JSON or missing required fields
- **Invalid Date Format**: Start or end dates are not valid date strings
- **Invalid Weekday**: Weekday must be between 0-6

### Not Found Errors (404 Not Found)
- **Class Not Found**: The specified class does not exist
- **No Schedules Found**: No schedules exist for the specified criteria

### Server Errors (500 Internal Server Error)
- **Database Errors**: Connection or query execution failures
- **Creation Failures**: Schedule creation operation failures

### Error Logging
All errors are logged with additional context:
- Location: `api/schedules`
- Type: `create-schedule` or `fetch-schedules`
- Error details for debugging

## Example Usage

### Retrieve Schedules

```bash
curl -X GET \
  "http://localhost:3000/api/schedules?classId=10A&weekday=1" \
  -H "Authorization: Bearer <jwt-token>"
```

### Create Schedule

```bash
curl -X POST \
  "http://localhost:3000/api/schedules" \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Monday Schedule",
    "description": "Regular Monday schedule for 10A",
    "startDate": "2024-01-15",
    "endDate": "2024-06-30",
    "selectedWeekday": 1,
    "scheduleData": {
      "periods": [
        {
          "time": "08:00-08:45",
          "subject": "Mathematics",
          "teacher": "John Doe"
        }
      ]
    },
    "classId": "1",
    "additionalInfo": {
      "notes": "Special arrangements for Monday"
    }
  }'
```

### Using JavaScript

```javascript
async function getSchedules(classId, weekday = null) {
  try {
    const params = new URLSearchParams({ classId });
    if (weekday !== null) {
      params.append('weekday', weekday.toString());
    }
    
    const response = await fetch(`/api/schedules?${params}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch schedules');
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching schedules:', error);
    throw error;
  }
}

async function createSchedule(scheduleData) {
  try {
    const response = await fetch('/api/schedules', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(scheduleData)
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create schedule');
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error creating schedule:', error);
    throw error;
  }
}

// Example usage
const scheduleData = {
  name: 'Monday Schedule',
  description: 'Regular Monday schedule for 10A',
  startDate: '2024-01-15',
  endDate: '2024-06-30',
  selectedWeekday: 1,
  scheduleData: {
    periods: [
      {
        time: '08:00-08:45',
        subject: 'Mathematics',
        teacher: 'John Doe'
      }
    ]
  },
  classId: '1',
  additionalInfo: {
    notes: 'Special arrangements for Monday'
  }
};

// Get schedules
getSchedules('10A', 1)
  .then(schedules => {
    console.log('Schedules:', schedules);
  })
  .catch(error => {
    console.error('Failed to get schedules:', error);
  });

// Create schedule
createSchedule(scheduleData)
  .then(schedule => {
    console.log('Schedule created:', schedule);
  })
  .catch(error => {
    console.error('Failed to create schedule:', error);
  });
```

### Using Python

```python
import requests

def get_schedules(classId, weekday=None):
    try:
        params = {'classId': classId}
        if weekday is not None:
            params['weekday'] = str(weekday)
        
        response = requests.get(
            'http://localhost:3000/api/schedules',
            params=params,
            headers={'Authorization': f'Bearer {token}'}
        )
        
        if response.status_code == 400:
            error_data = response.json()
            raise Exception(error_data.get('error', 'Bad request'))
        elif response.status_code == 404:
            error_data = response.json()
            raise Exception(error_data.get('error', 'Not found'))
        
        response.raise_for_status()
        
        return response.json()
        
    except requests.exceptions.RequestException as e:
        print(f"Error fetching schedules: {e}")
        raise

def create_schedule(schedule_data):
    try:
        response = requests.post(
            'http://localhost:3000/api/schedules',
            json=schedule_data,
            headers={'Authorization': f'Bearer {token}'}
        )
        
        if response.status_code == 400:
            error_data = response.json()
            raise Exception(error_data.get('error', 'Bad request'))
        
        response.raise_for_status()
        
        return response.json()
        
    except requests.exceptions.RequestException as e:
        print(f"Error creating schedule: {e}")
        raise

# Example usage
schedule_data = {
    'name': 'Monday Schedule',
    'description': 'Regular Monday schedule for 10A',
    'startDate': '2024-01-15',
    'endDate': '2024-06-30',
    'selectedWeekday': 1,
    'scheduleData': {
        'periods': [
            {
                'time': '08:00-08:45',
                'subject': 'Mathematics',
                'teacher': 'John Doe'
            }
        ]
    },
    'classId': '1',
    'additionalInfo': {
        'notes': 'Special arrangements for Monday'
    }
}

# Get schedules
try:
    schedules = get_schedules('10A', 1)
    print(f"Schedules: {schedules}")
except Exception as e:
    print(f"Failed to get schedules: {e}")

# Create schedule
try:
    schedule = create_schedule(schedule_data)
    print(f"Schedule created: {schedule}")
except Exception as e:
    print(f"Failed to create schedule: {e}")
```

## Use Cases

### 1. Create Weekly Schedule
```javascript
// Create schedules for all weekdays
async function createWeeklySchedule(classId, scheduleData) {
  const weekdays = [0, 1, 2, 3, 4, 5, 6]; // Sunday to Saturday
  const schedules = [];
  
  for (const weekday of weekdays) {
    try {
      const schedule = await createSchedule({
        ...scheduleData,
        selectedWeekday: weekday,
        name: `${getWeekdayName(weekday)} Schedule`
      });
      schedules.push(schedule);
    } catch (error) {
      console.error(`Failed to create schedule for weekday ${weekday}:`, error);
    }
  }
  
  return schedules;
}

function getWeekdayName(weekday) {
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return names[weekday];
}
```

### 2. Get Class Schedule Overview
```javascript
// Get all schedules for a class
async function getClassScheduleOverview(classId) {
  try {
    const schedules = await getSchedules(classId);
    
    console.log(`Schedule Overview for Class ${classId}:`);
    console.log('=====================================');
    
    schedules.forEach(schedule => {
      const weekdayName = getWeekdayName(schedule.selectedWeekday);
      console.log(`\n${weekdayName}:`);
      console.log(`  Name: ${schedule.name}`);
      console.log(`  Period: ${schedule.startDate} to ${schedule.endDate}`);
      if (schedule.description) {
        console.log(`  Description: ${schedule.description}`);
      }
    });
    
    return schedules;
  } catch (error) {
    console.error('Failed to get schedule overview:', error);
    throw error;
  }
}
```

### 3. Validate Schedule Data
```javascript
// Validate schedule data before creation
function validateScheduleData(scheduleData) {
  const errors = [];
  
  // Check required fields
  if (!scheduleData.name || scheduleData.name.trim() === '') {
    errors.push('Name is required');
  }
  
  if (!scheduleData.startDate) {
    errors.push('Start date is required');
  } else if (isNaN(Date.parse(scheduleData.startDate))) {
    errors.push('Invalid start date format');
  }
  
  if (!scheduleData.endDate) {
    errors.push('End date is required');
  } else if (isNaN(Date.parse(scheduleData.endDate))) {
    errors.push('Invalid end date format');
  }
  
  if (scheduleData.selectedWeekday === undefined || scheduleData.selectedWeekday === null) {
    errors.push('Selected weekday is required');
  } else if (scheduleData.selectedWeekday < 0 || scheduleData.selectedWeekday > 6) {
    errors.push('Selected weekday must be between 0 and 6');
  }
  
  // Check date logic
  if (scheduleData.startDate && scheduleData.endDate) {
    const startDate = new Date(scheduleData.startDate);
    const endDate = new Date(scheduleData.endDate);
    
    if (startDate >= endDate) {
      errors.push('End date must be after start date');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}
```

## Performance Considerations

### Query Optimization
- **Indexing**: Proper indexing on `classId` and `selectedWeekday` fields
- **Ordering**: Results ordered by creation date for consistent retrieval
- **Filtering**: Efficient weekday filtering when provided

### Data Validation
- **Schema Validation**: Comprehensive validation using Zod schema
- **Date Validation**: Ensures valid date formats and logical date ranges
- **Weekday Validation**: Validates weekday values are within valid range

## Security Considerations

- **Input Validation**: All parameters are validated before processing
- **Access Control**: Schedule operations require specific permissions
- **Data Integrity**: Ensures only valid schedule data is stored
- **Error Handling**: Generic error messages prevent information disclosure

## Related Documentation

- [Schedules API Overview](./README.md) - General schedules API information
- [Schedule Times](./times.md) - Schedule and break time management
- [Schedule Data](./data.md) - Teacher schedule data aggregation
- [All Schedules](./all.md) - Bulk schedule retrieval
- [PDF Data](./pdf-data.md) - Student data for PDF generation
- [Assignments](./assignments.md) - Teacher assignment retrieval
- [API Overview](../README.md) - General API information
- [Prisma Documentation](https://www.prisma.io/docs) - Database ORM 