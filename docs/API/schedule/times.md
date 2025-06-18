# Schedule Times API

The Schedule Times API manages schedule and break times for classes. This endpoint handles the retrieval and updating of schedule times, including both regular schedule periods and break periods.

## Base URL

`/api/schedule/times`

## Endpoints

### GET /api/schedule/times

Retrieves the latest schedule times and break times for a class by name.

#### Request

```http
GET /api/schedule/times?className=10A
```

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `className` | string | Yes | The name of the class to retrieve schedule times for |

#### Response

**Success (200 OK)**

```json
{
  "times": {
    "id": "1",
    "classId": "1",
    "createdAt": "2024-01-15T10:00:00Z",
    "updatedAt": "2024-01-15T10:00:00Z",
    "scheduleTimes": [
      {
        "id": 1,
        "name": "Period 1",
        "startTime": "08:00",
        "endTime": "08:45"
      },
      {
        "id": 2,
        "name": "Period 2",
        "startTime": "08:50",
        "endTime": "09:35"
      }
    ],
    "breakTimes": [
      {
        "id": 1,
        "name": "Morning Break",
        "startTime": "09:35",
        "endTime": "09:50"
      },
      {
        "id": 2,
        "name": "Lunch Break",
        "startTime": "11:20",
        "endTime": "12:05"
      }
    ]
  }
}
```

**Validation Error (400 Bad Request)**

```json
{
  "error": "Class name is required"
}
```

**Not Found Error (404 Not Found)**

```json
{
  "error": "No schedule times found for this class"
}
```

### POST /api/schedule/times

Updates the latest schedule for a class with new schedule and break times.

#### Request

```http
POST /api/schedule/times
Content-Type: application/json

{
  "className": "10A",
  "scheduleTimes": [
    {
      "id": 1
    },
    {
      "id": 2
    }
  ],
  "breakTimes": [
    {
      "id": 1
    },
    {
      "id": 2
    }
  ]
}
```

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `className` | string | Yes | The name of the class to update |
| `scheduleTimes` | array | Yes | Array of schedule time objects with `id` |
| `breakTimes` | array | Yes | Array of break time objects with `id` |

#### Response

**Success (200 OK)**

```json
{
  "id": "1",
  "classId": "1",
  "createdAt": "2024-01-15T10:00:00Z",
  "updatedAt": "2024-01-15T10:30:00Z",
  "scheduleTimes": [
    {
      "id": 1,
      "name": "Period 1",
      "startTime": "08:00",
      "endTime": "08:45"
    }
  ],
  "breakTimes": [
    {
      "id": 1,
      "name": "Morning Break",
      "startTime": "09:35",
      "endTime": "09:50"
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

### OPTIONS /api/schedule/times

Handles CORS preflight requests for the schedule times endpoint.

#### Response

**Success (204 No Content)**

```http
Allow: GET, POST, OPTIONS
```

## Data Processing

### Class Lookup
The API performs the following operations:
1. **Class Validation**: Validates that the class exists by name
2. **Schedule Retrieval**: Finds the most recent schedule for the class
3. **Time Association**: Links schedule and break times to the schedule

### Schedule Update Process
1. **Class Lookup**: Finds the class by name
2. **Latest Schedule**: Retrieves the most recent schedule
3. **Time Updates**: Updates schedule and break time associations
4. **Response**: Returns the updated schedule with all times

## Data Models

### Schedule Times Request

```typescript
interface ScheduleTimesRequest {
  className: string
  scheduleTimes: Array<{
    id: number
  }>
  breakTimes: Array<{
    id: number
  }>
}
```

### Schedule Response

```typescript
interface ScheduleResponse {
  id: string
  classId: string
  createdAt: string
  updatedAt: string
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

### Prisma Query Structure

```typescript
interface ScheduleQuery {
  where: {
    classId: string
  }
  orderBy: {
    createdAt: 'desc'
  }
  include: {
    scheduleTimes: true
    breakTimes: true
  }
}
```

## Business Logic

### Class Retrieval
```typescript
const classId = await prisma.class.findFirst({
  where: {
    name: className
  }
})
```

### Latest Schedule Retrieval
```typescript
const times = await prisma.schedule.findFirst({
  where: {
    classId: classId?.id
  },
  orderBy: {
    createdAt: 'desc'
  },
  include: {
    scheduleTimes: true,
    breakTimes: true
  }
})
```

### Schedule Update
```typescript
const updatedSchedule = await prisma.schedule.update({
  where: {
    id: latestSchedule.id
  },
  data: {
    scheduleTimes: {
      set: scheduleTimes.map((time: { id: number }) => ({ id: time.id }))
    },
    breakTimes: {
      set: breakTimes.map((time: { id: number }) => ({ id: time.id }))
    }
  },
  include: {
    scheduleTimes: true,
    breakTimes: true
  }
})
```

## Database Schema

### Schedule Table
```sql
CREATE TABLE schedule (
  id VARCHAR(255) PRIMARY KEY,
  classId VARCHAR(255) NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (classId) REFERENCES class(id)
);
```

### Schedule Times Table
```sql
CREATE TABLE schedule_time (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  startTime TIME NOT NULL,
  endTime TIME NOT NULL
);
```

### Break Times Table
```sql
CREATE TABLE break_time (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  startTime TIME NOT NULL,
  endTime TIME NOT NULL
);
```

### Junction Tables
```sql
-- Schedule to Schedule Times
CREATE TABLE schedule_schedule_times (
  scheduleId VARCHAR(255),
  scheduleTimeId INT,
  PRIMARY KEY (scheduleId, scheduleTimeId),
  FOREIGN KEY (scheduleId) REFERENCES schedule(id),
  FOREIGN KEY (scheduleTimeId) REFERENCES schedule_time(id)
);

-- Schedule to Break Times
CREATE TABLE schedule_break_times (
  scheduleId VARCHAR(255),
  breakTimeId INT,
  PRIMARY KEY (scheduleId, breakTimeId),
  FOREIGN KEY (scheduleId) REFERENCES schedule(id),
  FOREIGN KEY (breakTimeId) REFERENCES break_time(id)
);
```

## Error Handling

### Validation Errors (400 Bad Request)
- **Missing Class Name**: The `className` parameter is required
- **Invalid Request Body**: Malformed JSON or missing required fields

### Not Found Errors (404 Not Found)
- **Class Not Found**: The specified class does not exist
- **Schedule Not Found**: No schedule exists for the class

### Server Errors (500 Internal Server Error)
- **Database Errors**: Connection or query execution failures
- **Update Failures**: Schedule update operation failures

### Error Logging
All errors are logged with additional context:
- Location: `api/schedule/times`
- Type: `fetch-times` or `save-times`
- Error details for debugging

## Example Usage

### Retrieve Schedule Times

```bash
curl -X GET \
  "http://localhost:3000/api/schedule/times?className=10A" \
  -H "Authorization: Bearer <jwt-token>"
```

### Update Schedule Times

```bash
curl -X POST \
  "http://localhost:3000/api/schedule/times" \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "className": "10A",
    "scheduleTimes": [
      {"id": 1},
      {"id": 2}
    ],
    "breakTimes": [
      {"id": 1},
      {"id": 2}
    ]
  }'
```

### Using JavaScript

```javascript
async function getScheduleTimes(className) {
  try {
    const response = await fetch(`/api/schedule/times?className=${encodeURIComponent(className)}`, {
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
    return data.times;
  } catch (error) {
    console.error('Error fetching schedule times:', error);
    throw error;
  }
}

async function updateScheduleTimes(className, scheduleTimes, breakTimes) {
  try {
    const response = await fetch('/api/schedule/times', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        className,
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

// Usage
getScheduleTimes('10A')
  .then(times => {
    console.log('Schedule times:', times);
  })
  .catch(error => {
    console.error('Failed to get schedule times:', error);
  });
```

### Using Python

```python
import requests

def get_schedule_times(className):
    try:
        response = requests.get(
            f'http://localhost:3000/api/schedule/times?className={className}',
            headers={'Authorization': f'Bearer {token}'}
        )
        
        if response.status_code == 400:
            error_data = response.json()
            raise Exception(error_data.get('error', 'Bad request'))
        elif response.status_code == 404:
            error_data = response.json()
            raise Exception(error_data.get('error', 'Not found'))
        
        response.raise_for_status()
        
        data = response.json()
        return data.get('times')
        
    except requests.exceptions.RequestException as e:
        print(f"Error fetching schedule times: {e}")
        raise

def update_schedule_times(className, scheduleTimes, breakTimes):
    try:
        payload = {
            'className': className,
            'scheduleTimes': scheduleTimes,
            'breakTimes': breakTimes
        }
        
        response = requests.post(
            'http://localhost:3000/api/schedule/times',
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

# Usage
try:
    times = get_schedule_times('10A')
    print(f"Schedule times: {times}")
except Exception as e:
    print(f"Failed to get schedule times: {e}")
```

## Use Cases

### 1. Display Class Schedule
```javascript
// Display schedule times for a class
async function displayClassSchedule(className) {
  try {
    const times = await getScheduleTimes(className);
    
    console.log(`Schedule for ${className}:`);
    console.log('Schedule Times:');
    times.scheduleTimes.forEach(time => {
      console.log(`  ${time.name}: ${time.startTime} - ${time.endTime}`);
    });
    
    console.log('Break Times:');
    times.breakTimes.forEach(time => {
      console.log(`  ${time.name}: ${time.startTime} - ${time.endTime}`);
    });
  } catch (error) {
    console.error('Failed to display schedule:', error);
  }
}
```

### 2. Update Schedule Configuration
```javascript
// Update schedule times for a class
async function updateClassSchedule(className, newScheduleTimes, newBreakTimes) {
  try {
    const updatedSchedule = await updateScheduleTimes(
      className,
      newScheduleTimes,
      newBreakTimes
    );
    
    console.log('Schedule updated successfully:', updatedSchedule);
    return updatedSchedule;
  } catch (error) {
    console.error('Failed to update schedule:', error);
    throw error;
  }
}
```

### 3. Schedule Validation
```javascript
// Validate schedule times for conflicts
async function validateScheduleTimes(className) {
  try {
    const times = await getScheduleTimes(className);
    
    // Check for overlapping times
    const allTimes = [...times.scheduleTimes, ...times.breakTimes];
    const sortedTimes = allTimes.sort((a, b) => a.startTime.localeCompare(b.startTime));
    
    for (let i = 0; i < sortedTimes.length - 1; i++) {
      const current = sortedTimes[i];
      const next = sortedTimes[i + 1];
      
      if (current.endTime > next.startTime) {
        return {
          valid: false,
          conflict: `${current.name} overlaps with ${next.name}`
        };
      }
    }
    
    return { valid: true };
  } catch (error) {
    console.error('Failed to validate schedule:', error);
    return { valid: false, error: error.message };
  }
}
```

## Performance Considerations

### Query Optimization
- **Latest Schedule**: Uses `orderBy: { createdAt: 'desc' }` for efficient retrieval
- **Eager Loading**: Includes related times in single query
- **Indexing**: Proper indexing on `classId` and `createdAt` fields

### Caching Strategy
- **Class Schedules**: Consider caching frequently accessed schedules
- **Time Definitions**: Cache static time definitions
- **Cache Invalidation**: Clear cache when schedules are updated

## Security Considerations

- **Input Validation**: All parameters are validated before processing
- **Access Control**: Schedule operations require specific permissions
- **Data Integrity**: Ensures only valid time associations
- **Error Handling**: Generic error messages prevent information disclosure

## Related Documentation

- [Schedule API Overview](./README.md) - General schedule API information
- [Teacher Assignments](./teacher-assignments.md) - Teacher assignment management
- [Teacher Rotation](./teacher-rotation.md) - Teacher rotation schedules
- [Turns](./turns.md) - Turn schedule management
- [Assignments](./assignments.md) - Student group assignments
- [API Overview](../README.md) - General API information
- [Prisma Documentation](https://www.prisma.io/docs) - Database ORM 