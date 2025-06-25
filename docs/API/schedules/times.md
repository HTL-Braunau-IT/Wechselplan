# Schedule Times API

The Schedule Times API manages schedule and break times for classes. This endpoint handles the retrieval and updating of schedule times, including both regular schedule periods and break periods.

## Base URL

`/api/schedules/times`

## Endpoints

### GET /api/schedules/times

Retrieves schedule and break times for a class by class ID.

#### Request

```http
GET /api/schedules/times?class=1
```

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `class` | string | Yes | The class ID to retrieve schedule times for |

#### Response

**Success (200 OK)**

```json
{
  "scheduleTimes": [
    {
      "id": 1,
      "startTime": "08:00",
      "endTime": "08:45"
    },
    {
      "id": 2,
      "startTime": "08:50",
      "endTime": "09:35"
    }
  ],
  "breakTimes": [
    {
      "id": 1,
      "startTime": "09:35",
      "endTime": "09:50"
    },
    {
      "id": 2,
      "startTime": "11:20",
      "endTime": "12:05"
    }
  ]
}
```

**Validation Error (400 Bad Request)**

```json
{
  "error": "Class ID is required"
}
```

**No Schedule Found (200 OK with empty arrays)**

```json
{
  "scheduleTimes": [],
  "breakTimes": []
}
```

### POST /api/schedules/times

Updates schedule and break times for a class.

#### Request

```http
POST /api/schedules/times
Content-Type: application/json

{
  "classId": "1",
  "scheduleTimes": [
    "08:00",
    "08:50",
    "09:40"
  ],
  "breakTimes": [
    "09:35",
    "11:20"
  ]
}
```

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `classId` | string | Yes | The class ID to update schedule times for |
| `scheduleTimes` | array | Yes | Array of schedule time strings |
| `breakTimes` | array | Yes | Array of break time strings |

#### Response

**Success (200 OK)**

```json
{
  "scheduleTimes": [
    {
      "id": 1,
      "startTime": "08:00",
      "endTime": "08:00"
    },
    {
      "id": 2,
      "startTime": "08:50",
      "endTime": "08:50"
    },
    {
      "id": 3,
      "startTime": "09:40",
      "endTime": "09:40"
    }
  ],
  "breakTimes": [
    {
      "id": 1,
      "startTime": "09:35",
      "endTime": "09:35"
    },
    {
      "id": 2,
      "startTime": "11:20",
      "endTime": "11:20"
    }
  ]
}
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
  "error": "No schedule found for this class"
}
```

**Server Error (500 Internal Server Error)**

```json
{
  "error": "Failed to save times"
}
```

## Data Processing

### Schedule Times Retrieval Process
The API performs the following operations:
1. **Class Validation**: Validates that the class ID is provided
2. **Schedule Lookup**: Finds the first schedule for the class
3. **Time Association**: Retrieves associated schedule and break times
4. **Response**: Returns structured time data or empty arrays if no schedule exists

### Schedule Times Update Process
1. **Class Validation**: Validates that the class ID is provided
2. **Schedule Validation**: Ensures a schedule exists for the class
3. **Time Updates**: Replaces existing times with new schedule and break times
4. **Response**: Returns the updated time data

## Data Models

### Schedule Times Request

```typescript
interface ScheduleTimesRequest {
  classId: string
  scheduleTimes: string[]
  breakTimes: string[]
}
```

### Schedule Times Response

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

### Database Models

```typescript
interface ScheduleTime {
  id: number
  startTime: string
  endTime: string
  scheduleId: string
}

interface BreakTime {
  id: number
  startTime: string
  endTime: string
  scheduleId: string
}
```

## Business Logic

### Schedule Lookup
```typescript
const schedule = await prisma.schedule.findFirst({
  where: {
    classId: parseInt(classId as string),
  },
  include: {
    scheduleTimes: true,
    breakTimes: true,
  },
})
```

### Schedule Validation
```typescript
if (!schedule) {
  return NextResponse.json(
    { error: 'No schedule found for this class' },
    { status: 404 }
  )
}
```

### Time Updates
```typescript
const updatedSchedule = await prisma.schedule.update({
  where: {
    id: schedule.id,
  },
  data: {
    scheduleTimes: {
      deleteMany: {},
      create: scheduleTimes.map((time: string) => ({
        startTime: time,
        endTime: time, // You might want to adjust this based on your needs
      })),
    },
    breakTimes: {
      deleteMany: {},
      create: breakTimes.map((time: string) => ({
        startTime: time,
        endTime: time, // You might want to adjust this based on your needs
      })),
    },
  },
  include: {
    scheduleTimes: true,
    breakTimes: true,
  },
})
```

## Database Schema

### Schedule Table
```sql
CREATE TABLE schedule (
  id VARCHAR(255) PRIMARY KEY,
  classId INT,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  startDate TIMESTAMP NOT NULL,
  endDate TIMESTAMP NOT NULL,
  selectedWeekday INT NOT NULL,
  scheduleData JSON,
  additionalInfo JSON,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (classId) REFERENCES class(id)
);
```

### Schedule Times Table
```sql
CREATE TABLE schedule_time (
  id INT PRIMARY KEY AUTO_INCREMENT,
  startTime TIME NOT NULL,
  endTime TIME NOT NULL,
  scheduleId VARCHAR(255) NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (scheduleId) REFERENCES schedule(id) ON DELETE CASCADE
);
```

### Break Times Table
```sql
CREATE TABLE break_time (
  id INT PRIMARY KEY AUTO_INCREMENT,
  startTime TIME NOT NULL,
  endTime TIME NOT NULL,
  scheduleId VARCHAR(255) NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (scheduleId) REFERENCES schedule(id) ON DELETE CASCADE
);
```

## Error Handling

### Validation Errors (400 Bad Request)
- **Missing Class ID**: The `class` parameter is required for GET requests
- **Missing Class ID Field**: The `classId` field is required for POST requests
- **Invalid Request Body**: Malformed JSON or missing required fields

### Not Found Errors (404 Not Found)
- **Schedule Not Found**: No schedule exists for the specified class

### Server Errors (500 Internal Server Error)
- **Database Errors**: Connection or query execution failures
- **Update Failures**: Schedule time update operation failures

### Error Logging
All errors are logged with additional context:
- Location: `api/schedules/times`
- Type: `fetch_times_error` or `save_times_error`
- Error details for debugging

## Example Usage

### Retrieve Schedule Times

```bash
curl -X GET \
  "http://localhost:3000/api/schedules/times?class=1" \
  -H "Authorization: Bearer <jwt-token>"
```

### Update Schedule Times

```bash
curl -X POST \
  "http://localhost:3000/api/schedules/times" \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "classId": "1",
    "scheduleTimes": [
      "08:00",
      "08:50",
      "09:40",
      "10:30",
      "11:20"
    ],
    "breakTimes": [
      "09:35",
      "11:20"
    ]
  }'
```

### Using JavaScript

```javascript
async function getScheduleTimes(classId) {
  try {
    const response = await fetch(`/api/schedules/times?class=${encodeURIComponent(classId)}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch schedule times');
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching schedule times:', error);
    throw error;
  }
}

async function updateScheduleTimes(classId, scheduleTimes, breakTimes) {
  try {
    const response = await fetch('/api/schedules/times', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        classId,
        scheduleTimes,
        breakTimes
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update schedule times');
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error updating schedule times:', error);
    throw error;
  }
}

// Example usage
const scheduleTimes = [
  '08:00',
  '08:50',
  '09:40',
  '10:30',
  '11:20'
];

const breakTimes = [
  '09:35',
  '11:20'
];

// Get schedule times
getScheduleTimes('1')
  .then(data => {
    console.log('Schedule times:', data.scheduleTimes);
    console.log('Break times:', data.breakTimes);
  })
  .catch(error => {
    console.error('Failed to get schedule times:', error);
  });

// Update schedule times
updateScheduleTimes('1', scheduleTimes, breakTimes)
  .then(data => {
    console.log('Schedule times updated:', data);
  })
  .catch(error => {
    console.error('Failed to update schedule times:', error);
  });
```

### Using Python

```python
import requests

def get_schedule_times(classId):
    try:
        response = requests.get(
            f'http://localhost:3000/api/schedules/times?class={classId}',
            headers={'Authorization': f'Bearer {token}'}
        )
        
        if response.status_code == 400:
            error_data = response.json()
            raise Exception(error_data.get('error', 'Bad request'))
        
        response.raise_for_status()
        
        return response.json()
        
    except requests.exceptions.RequestException as e:
        print(f"Error fetching schedule times: {e}")
        raise

def update_schedule_times(classId, scheduleTimes, breakTimes):
    try:
        payload = {
            'classId': classId,
            'scheduleTimes': scheduleTimes,
            'breakTimes': breakTimes
        }
        
        response = requests.post(
            'http://localhost:3000/api/schedules/times',
            json=payload,
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
        print(f"Error updating schedule times: {e}")
        raise

# Example usage
schedule_times = [
    '08:00',
    '08:50',
    '09:40',
    '10:30',
    '11:20'
]

break_times = [
    '09:35',
    '11:20'
]

# Get schedule times
try:
    data = get_schedule_times('1')
    print(f"Schedule times: {data['scheduleTimes']}")
    print(f"Break times: {data['breakTimes']}")
except Exception as e:
    print(f"Failed to get schedule times: {e}")

# Update schedule times
try:
    result = update_schedule_times('1', schedule_times, break_times)
    print(f"Schedule times updated: {result}")
except Exception as e:
    print(f"Failed to update schedule times: {e}")
```

## Use Cases

### 1. Display Class Schedule Times
```javascript
// Display schedule and break times for a class
async function displayClassTimes(classId) {
  try {
    const data = await getScheduleTimes(classId);
    
    console.log(`Schedule Times for Class ${classId}:`);
    console.log('===============================');
    
    console.log('Schedule Periods:');
    data.scheduleTimes.forEach((time, index) => {
      console.log(`  Period ${index + 1}: ${time.startTime} - ${time.endTime}`);
    });
    
    console.log('\nBreak Periods:');
    data.breakTimes.forEach((time, index) => {
      console.log(`  Break ${index + 1}: ${time.startTime} - ${time.endTime}`);
    });
  } catch (error) {
    console.error('Failed to display class times:', error);
  }
}
```

### 2. Update Standard Schedule
```javascript
// Update with standard school schedule times
async function updateStandardSchedule(classId) {
  const standardScheduleTimes = [
    '08:00', '08:50', '09:40', '10:30', '11:20',
    '12:10', '13:00', '13:50', '14:40', '15:30'
  ];
  
  const standardBreakTimes = [
    '09:35', '11:20', '12:05', '13:45'
  ];
  
  try {
    const result = await updateScheduleTimes(classId, standardScheduleTimes, standardBreakTimes);
    console.log('Standard schedule updated successfully:', result);
    return result;
  } catch (error) {
    console.error('Failed to update standard schedule:', error);
    throw error;
  }
}
```

### 3. Validate Time Conflicts
```javascript
// Validate that schedule times don't conflict with break times
async function validateTimeConflicts(classId) {
  try {
    const data = await getScheduleTimes(classId);
    const allTimes = [
      ...data.scheduleTimes.map(t => ({ time: t.startTime, type: 'schedule' })),
      ...data.scheduleTimes.map(t => ({ time: t.endTime, type: 'schedule' })),
      ...data.breakTimes.map(t => ({ time: t.startTime, type: 'break' })),
      ...data.breakTimes.map(t => ({ time: t.endTime, type: 'break' }))
    ];
    
    // Sort by time
    allTimes.sort((a, b) => a.time.localeCompare(b.time));
    
    const conflicts = [];
    for (let i = 0; i < allTimes.length - 1; i++) {
      const current = allTimes[i];
      const next = allTimes[i + 1];
      
      if (current.time === next.time && current.type !== next.type) {
        conflicts.push(`Conflict at ${current.time}: ${current.type} and ${next.type}`);
      }
    }
    
    return {
      valid: conflicts.length === 0,
      conflicts
    };
  } catch (error) {
    console.error('Failed to validate time conflicts:', error);
    return { valid: false, error: error.message };
  }
}
```

## Performance Considerations

### Query Optimization
- **Eager Loading**: Includes related times in single queries
- **Indexing**: Proper indexing on `scheduleId` fields
- **Bulk Operations**: Efficient handling of multiple time updates

### Data Validation
- **Input Validation**: Validates all required fields before processing
- **Time Format Validation**: Ensures valid time string formats
- **Data Consistency**: Maintains consistent time relationships

## Security Considerations

- **Input Validation**: All parameters are validated before processing
- **Access Control**: Schedule time operations require specific permissions
- **Data Integrity**: Ensures only valid time associations
- **Error Handling**: Generic error messages prevent information disclosure

## Related Documentation

- [Schedules API Overview](./README.md) - General schedules API information
- [Main Schedules](./index.md) - Core schedule management endpoints
- [Schedule Data](./data.md) - Teacher schedule data aggregation
- [All Schedules](./all.md) - Bulk schedule retrieval
- [PDF Data](./pdf-data.md) - Student data for PDF generation
- [Assignments](./assignments.md) - Teacher assignment retrieval
- [API Overview](../README.md) - General API information
- [Prisma Documentation](https://www.prisma.io/docs) - Database ORM 