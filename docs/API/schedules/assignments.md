# Assignments API

The Assignments API retrieves teacher assignments for a specified class. This endpoint provides basic assignment information including assignment IDs and periods for administrative purposes.

## Base URL

`/api/schedules/assignments`

## Endpoints

### GET /api/schedules/assignments

Retrieves teacher assignments for a specified class, returning basic assignment information.

#### Request

```http
GET /api/schedules/assignments?class=1
```

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `class` | string | Yes | The class ID to retrieve assignments for |

#### Response

**Success (200 OK)**

```json
[
  {
    "id": "assignment-1",
    "period": "AM"
  },
  {
    "id": "assignment-2",
    "period": "PM"
  },
  {
    "id": "assignment-3",
    "period": "AM"
  }
]
```

**Validation Error (400 Bad Request)**

```json
{
  "error": "Class ID is required"
}
```

**Invalid Class ID (400 Bad Request)**

```json
{
  "error": "Class ID must be a number"
}
```

**Server Error (500 Internal Server Error)**

```json
{
  "error": "Failed to fetch assignments"
}
```

## Data Processing

### Assignment Retrieval Process
The API performs the following operations:
1. **Class ID Validation**: Validates that the class ID is provided and is a valid number
2. **Assignment Lookup**: Retrieves teacher assignments for the specified class
3. **Data Selection**: Returns only assignment ID and period information
4. **Response**: Returns array of assignment data

### Data Selection Logic
- **Minimal Data**: Only returns essential assignment information (ID and period)
- **Class Filtering**: Only assignments for the specified class are included
- **Period Information**: Includes AM/PM period designation for each assignment

## Data Models

### Assignment Response

```typescript
interface Assignment[] {
  id: string
  period: 'AM' | 'PM'
}
```

### Database Models

```typescript
interface TeacherAssignment {
  id: string
  classId: number
  teacherId: string
  subjectId: string
  groupId: string
  period: 'AM' | 'PM'
  createdAt: string
  updatedAt: string
}
```

## Business Logic

### Class ID Validation
```typescript
if (!classId) {
  return NextResponse.json(
    { error: 'Class ID is required' },
    { status: 400 }
  )
}

const parsedClassId = parseInt(classId)
if (isNaN(parsedClassId)) {
  return NextResponse.json(
    { error: 'Class ID must be a number' },
    { status: 400 }
  )
}
```

### Assignment Retrieval
```typescript
const assignments = await prisma.teacherAssignment.findMany({
  where: {
    classId: parsedClassId
  },
  select: {
    id: true,
    period: true
  }
})

return NextResponse.json(assignments)
```

## Database Schema

### Teacher Assignment Table
```sql
CREATE TABLE teacher_assignment (
  id VARCHAR(255) PRIMARY KEY,
  classId INT NOT NULL,
  teacherId VARCHAR(255) NOT NULL,
  subjectId VARCHAR(255) NOT NULL,
  groupId VARCHAR(255) NOT NULL,
  period ENUM('AM', 'PM') NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (classId) REFERENCES class(id),
  FOREIGN KEY (teacherId) REFERENCES teacher(id),
  FOREIGN KEY (subjectId) REFERENCES subject(id),
  FOREIGN KEY (groupId) REFERENCES group(id)
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
- **Missing Class ID**: The `class` parameter is required
- **Invalid Class ID**: The class ID must be a valid number

### Server Errors (500 Internal Server Error)
- **Database Errors**: Connection or query execution failures
- **Retrieval Failures**: Assignment retrieval operation failures

### Error Logging
All errors are logged with additional context:
- Location: `api/schedules/assignments`
- Type: `fetch-assignments`
- Error details for debugging

## Example Usage

### Retrieve Assignments

```bash
curl -X GET \
  "http://localhost:3000/api/schedules/assignments?class=1" \
  -H "Authorization: Bearer <jwt-token>"
```

### Using JavaScript

```javascript
async function getAssignments(classId) {
  try {
    const response = await fetch(`/api/schedules/assignments?class=${encodeURIComponent(classId)}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch assignments');
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching assignments:', error);
    throw error;
  }
}

// Example usage
getAssignments('1')
  .then(assignments => {
    console.log(`Found ${assignments.length} assignments:`);
    assignments.forEach(assignment => {
      console.log(`- Assignment ${assignment.id} (${assignment.period})`);
    });
  })
  .catch(error => {
    console.error('Failed to get assignments:', error);
  });
```

### Using Python

```python
import requests

def get_assignments(classId):
    try:
        response = requests.get(
            f'http://localhost:3000/api/schedules/assignments?class={classId}',
            headers={'Authorization': f'Bearer {token}'}
        )
        
        if response.status_code == 400:
            error_data = response.json()
            raise Exception(error_data.get('error', 'Bad request'))
        
        response.raise_for_status()
        
        return response.json()
        
    except requests.exceptions.RequestException as e:
        print(f"Error fetching assignments: {e}")
        raise

# Example usage
try:
    assignments = get_assignments('1')
    print(f"Found {len(assignments)} assignments:")
    for assignment in assignments:
        print(f"- Assignment {assignment['id']} ({assignment['period']})")
except Exception as e:
    print(f"Failed to get assignments: {e}")
```

## Use Cases

### 1. Assignment Overview
```javascript
// Get overview of assignments for a class
async function getAssignmentOverview(classId) {
  try {
    const assignments = await getAssignments(classId);
    
    const overview = {
      totalAssignments: assignments.length,
      amAssignments: assignments.filter(a => a.period === 'AM').length,
      pmAssignments: assignments.filter(a => a.period === 'PM').length,
      periods: [...new Set(assignments.map(a => a.period))]
    };
    
    return overview;
  } catch (error) {
    console.error('Failed to get assignment overview:', error);
    throw error;
  }
}
```

### 2. Validate Assignment Distribution
```javascript
// Validate assignment distribution across periods
async function validateAssignmentDistribution(classId) {
  try {
    const assignments = await getAssignments(classId);
    
    const amCount = assignments.filter(a => a.period === 'AM').length;
    const pmCount = assignments.filter(a => a.period === 'PM').length;
    
    const validation = {
      totalAssignments: assignments.length,
      amAssignments: amCount,
      pmAssignments: pmCount,
      isBalanced: Math.abs(amCount - pmCount) <= 1,
      recommendations: []
    };
    
    if (amCount === 0) {
      validation.recommendations.push('No AM assignments found');
    }
    
    if (pmCount === 0) {
      validation.recommendations.push('No PM assignments found');
    }
    
    if (Math.abs(amCount - pmCount) > 1) {
      validation.recommendations.push('Consider balancing assignments between AM and PM periods');
    }
    
    return validation;
  } catch (error) {
    console.error('Failed to validate assignment distribution:', error);
    return null;
  }
}
```

### 3. Export Assignment Data
```javascript
// Export assignment data for reporting
async function exportAssignmentData(classId) {
  try {
    const assignments = await getAssignments(classId);
    
    const exportData = {
      classId: classId,
      exportDate: new Date().toISOString(),
      assignments: assignments.map(assignment => ({
        id: assignment.id,
        period: assignment.period
      })),
      summary: {
        total: assignments.length,
        am: assignments.filter(a => a.period === 'AM').length,
        pm: assignments.filter(a => a.period === 'PM').length
      }
    };
    
    return exportData;
  } catch (error) {
    console.error('Failed to export assignment data:', error);
    throw error;
  }
}
```

## Performance Considerations

### Query Optimization
- **Selective Fields**: Only retrieves necessary assignment fields
- **Indexing**: Proper indexing on `classId` field
- **Efficient Filtering**: Uses database-level filtering for better performance

### Data Handling
- **Minimal Data**: Returns only essential assignment information
- **Simple Structure**: Straightforward array response format
- **Error Recovery**: Graceful handling of database errors

## Security Considerations

- **Input Validation**: Validates class ID parameter and ensures it's a number
- **Access Control**: Assignment retrieval requires specific permissions
- **Data Privacy**: Returns only basic assignment information
- **Error Handling**: Generic error messages prevent information disclosure

## Related Documentation

- [Schedules API Overview](./README.md) - General schedules API information
- [Main Schedules](./index.md) - Core schedule management endpoints
- [Schedule Times](./times.md) - Schedule and break time management
- [Schedule Data](./data.md) - Teacher schedule data aggregation
- [All Schedules](./all.md) - Bulk schedule retrieval
- [PDF Data](./pdf-data.md) - Student data for PDF generation
- [API Overview](../README.md) - General API information
- [Prisma Documentation](https://www.prisma.io/docs) - Database ORM 