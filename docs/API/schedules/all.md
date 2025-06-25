# All Schedules API

The All Schedules API retrieves all schedule records from the database. This endpoint provides bulk access to all schedule data for administrative and reporting purposes.

## Base URL

`/api/schedules/all`

## Endpoints

### GET /api/schedules/all

Retrieves all schedule records from the database.

#### Request

```http
GET /api/schedules/all
```

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
  },
  {
    "id": "2",
    "name": "Tuesday Schedule",
    "description": "Regular Tuesday schedule for 10A",
    "startDate": "2024-01-15T00:00:00.000Z",
    "endDate": "2024-06-30T00:00:00.000Z",
    "selectedWeekday": 2,
    "classId": 1,
    "scheduleData": {
      "periods": [
        {
          "time": "08:00-08:45",
          "subject": "Science",
          "teacher": "Jane Smith"
        }
      ]
    },
    "additionalInfo": null,
    "createdAt": "2024-01-15T10:00:00.000Z",
    "updatedAt": "2024-01-15T10:00:00.000Z"
  }
]
```

**Server Error (500 Internal Server Error)**

```json
{
  "error": "Failed to fetch schedules"
}
```

## Data Processing

### All Schedules Retrieval Process
The API performs the following operations:
1. **Database Query**: Retrieves all schedule records from the database
2. **Data Serialization**: Converts database records to JSON format
3. **Response**: Returns array of all schedule records

## Data Models

### Schedule Array Response

```typescript
interface Schedule[] {
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

### All Schedules Retrieval
```typescript
const schedules = await prisma.schedule.findMany()
return NextResponse.json(schedules)
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

## Error Handling

### Server Errors (500 Internal Server Error)
- **Database Errors**: Connection or query execution failures
- **Retrieval Failures**: Schedule retrieval operation failures

### Error Logging
All errors are logged with additional context:
- Location: `api/schedules/all`
- Type: `fetch-schedules`
- Error details for debugging

## Example Usage

### Retrieve All Schedules

```bash
curl -X GET \
  "http://localhost:3000/api/schedules/all" \
  -H "Authorization: Bearer <jwt-token>"
```

### Using JavaScript

```javascript
async function getAllSchedules() {
  try {
    const response = await fetch('/api/schedules/all', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch all schedules');
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching all schedules:', error);
    throw error;
  }
}

// Example usage
getAllSchedules()
  .then(schedules => {
    console.log(`Found ${schedules.length} schedules:`);
    schedules.forEach(schedule => {
      console.log(`- ${schedule.name} (${schedule.selectedWeekday})`);
    });
  })
  .catch(error => {
    console.error('Failed to get all schedules:', error);
  });
```

### Using Python

```python
import requests

def get_all_schedules():
    try:
        response = requests.get(
            'http://localhost:3000/api/schedules/all',
            headers={'Authorization': f'Bearer {token}'}
        )
        
        response.raise_for_status()
        
        return response.json()
        
    except requests.exceptions.RequestException as e:
        print(f"Error fetching all schedules: {e}")
        raise

# Example usage
try:
    schedules = get_all_schedules()
    print(f"Found {len(schedules)} schedules:")
    for schedule in schedules:
        print(f"- {schedule['name']} (Weekday: {schedule['selectedWeekday']})")
except Exception as e:
    print(f"Failed to get all schedules: {e}")
```

## Use Cases

### 1. Schedule Overview Report
```javascript
// Generate overview report of all schedules
async function generateScheduleOverview() {
  try {
    const schedules = await getAllSchedules();
    
    const overview = {
      totalSchedules: schedules.length,
      schedulesByWeekday: {},
      schedulesByClass: {},
      dateRange: {
        earliestStart: null,
        latestEnd: null
      }
    };
    
    schedules.forEach(schedule => {
      // Group by weekday
      const weekday = schedule.selectedWeekday;
      if (!overview.schedulesByWeekday[weekday]) {
        overview.schedulesByWeekday[weekday] = 0;
      }
      overview.schedulesByWeekday[weekday]++;
      
      // Group by class
      const classId = schedule.classId;
      if (classId) {
        if (!overview.schedulesByClass[classId]) {
          overview.schedulesByClass[classId] = 0;
        }
        overview.schedulesByClass[classId]++;
      }
      
      // Track date range
      const startDate = new Date(schedule.startDate);
      const endDate = new Date(schedule.endDate);
      
      if (!overview.dateRange.earliestStart || startDate < new Date(overview.dateRange.earliestStart)) {
        overview.dateRange.earliestStart = schedule.startDate;
      }
      
      if (!overview.dateRange.latestEnd || endDate > new Date(overview.dateRange.latestEnd)) {
        overview.dateRange.latestEnd = schedule.endDate;
      }
    });
    
    return overview;
  } catch (error) {
    console.error('Failed to generate schedule overview:', error);
    throw error;
  }
}
```

### 2. Data Export
```javascript
// Export all schedules to CSV format
async function exportSchedulesToCSV() {
  try {
    const schedules = await getAllSchedules();
    
    const csvHeaders = [
      'ID',
      'Name',
      'Description',
      'Start Date',
      'End Date',
      'Weekday',
      'Class ID',
      'Created At',
      'Updated At'
    ];
    
    const csvRows = schedules.map(schedule => [
      schedule.id,
      schedule.name,
      schedule.description || '',
      schedule.startDate,
      schedule.endDate,
      schedule.selectedWeekday,
      schedule.classId || '',
      schedule.createdAt,
      schedule.updatedAt
    ]);
    
    const csvContent = [
      csvHeaders.join(','),
      ...csvRows.map(row => row.join(','))
    ].join('\n');
    
    return csvContent;
  } catch (error) {
    console.error('Failed to export schedules to CSV:', error);
    throw error;
  }
}
```

## Performance Considerations

### Query Optimization
- **Simple Query**: Uses `findMany()` without complex filtering
- **Indexing**: Proper indexing on all schedule fields
- **Memory Usage**: Consider pagination for large datasets

### Data Handling
- **Bulk Retrieval**: Efficient for administrative purposes
- **JSON Serialization**: Handles complex schedule data structures
- **Error Recovery**: Graceful handling of database errors

## Security Considerations

- **Access Control**: All schedules retrieval requires administrative permissions
- **Data Privacy**: Ensure proper access controls for sensitive schedule data
- **Error Handling**: Generic error messages prevent information disclosure

## Related Documentation

- [Schedules API Overview](./README.md) - General schedules API information
- [Main Schedules](./index.md) - Core schedule management endpoints
- [Schedule Times](./times.md) - Schedule and break time management
- [Schedule Data](./data.md) - Teacher schedule data aggregation
- [PDF Data](./pdf-data.md) - Student data for PDF generation
- [Assignments](./assignments.md) - Teacher assignment retrieval
- [API Overview](../README.md) - General API information
- [Prisma Documentation](https://www.prisma.io/docs) - Database ORM 