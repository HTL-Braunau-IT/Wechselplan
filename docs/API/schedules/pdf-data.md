# PDF Data API

The PDF Data API retrieves student data for PDF generation. This endpoint provides student information for a specified class, specifically students who have been assigned to groups.

## Base URL

`/api/schedules/pdf-data`

## Endpoints

### GET /api/schedules/pdf-data

Retrieves students in a specified class who have a non-null group ID for PDF generation purposes.

#### Request

```http
GET /api/schedules/pdf-data?className=10A
```

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `className` | string | Yes | The name of the class to retrieve students for |

#### Response

**Success (200 OK)**

```json
{
  "students": [
    {
      "id": "student-1",
      "name": "Alice Johnson",
      "classId": 1,
      "groupId": "group-1",
      "createdAt": "2024-01-15T10:00:00.000Z",
      "updatedAt": "2024-01-15T10:00:00.000Z"
    },
    {
      "id": "student-2",
      "name": "Bob Smith",
      "classId": 1,
      "groupId": "group-1",
      "createdAt": "2024-01-15T10:00:00.000Z",
      "updatedAt": "2024-01-15T10:00:00.000Z"
    },
    {
      "id": "student-3",
      "name": "Charlie Brown",
      "classId": 1,
      "groupId": "group-2",
      "createdAt": "2024-01-15T10:00:00.000Z",
      "updatedAt": "2024-01-15T10:00:00.000Z"
    }
  ]
}
```

**Validation Error (400 Bad Request)**

```json
{
  "error": "Class Name is required"
}
```

**Class Not Found (400 Bad Request)**

```json
{
  "error": "Class not found"
}
```

**No Students Found (404 Not Found)**

```json
{
  "error": "No students found"
}
```

**Server Error (500 Internal Server Error)**

```json
{
  "error": "Internal server error"
}
```

## Data Processing

### PDF Data Retrieval Process
The API performs the following operations:
1. **Class Name Validation**: Validates that the class name is provided
2. **Class Lookup**: Finds the class by name in the database
3. **Student Filtering**: Retrieves only students with non-null group IDs
4. **Response**: Returns structured student data for PDF generation

### Student Filtering Logic
- **Group Assignment**: Only students with assigned groups are included
- **Class Association**: Students must belong to the specified class
- **Data Completeness**: All student fields are included for PDF generation

## Data Models

### PDF Data Response

```typescript
interface PDFDataResponse {
  students: Array<{
    id: string
    name: string
    classId: number
    groupId: string
    createdAt: string
    updatedAt: string
  }>
}
```

### Database Models

```typescript
interface Student {
  id: string
  name: string
  classId: number
  groupId: string | null
  createdAt: string
  updatedAt: string
}

interface Class {
  id: number
  name: string
}
```

## Business Logic

### Class Name Validation
```typescript
if (!className) {
  const error = new Error('Class Name is required')
  captureError(error, {
    location: 'api/schedules/pdf-data',
    type: 'pdf-data-error'
  })
  return NextResponse.json({ error: 'Class Name is required' }, { status: 400 })
}
```

### Class Lookup
```typescript
const class_response = await prisma.class.findUnique({
  where: {
    name: className
  }
})

if (!class_response) {
  const error = new Error('Class not found')
  captureError(error, {
    location: 'api/schedules/pdf-data',
    type: 'pdf-data-error'
  })
  return NextResponse.json({ error: 'Class not found' }, { status: 400 })
}
```

### Student Retrieval with Group Filtering
```typescript
const student_response = await prisma.student.findMany({
  where: {
    classId: class_response.id,
    groupId: {
      not: null
    }
  }
})

if (student_response.length === 0) {
  const error = new Error('No students found')
  captureError(error, {
    location: 'api/schedules/pdf-data',
    type: 'pdf-data-error'
  })
  return NextResponse.json({ error: 'No students found' }, { status: 404 })
}
```

## Database Schema

### Student Table
```sql
CREATE TABLE student (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  classId INT NOT NULL,
  groupId VARCHAR(255),
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (classId) REFERENCES class(id),
  FOREIGN KEY (groupId) REFERENCES group(id)
);
```

### Class Table
```sql
CREATE TABLE class (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL UNIQUE,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### Group Table Reference
```sql
CREATE TABLE group (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  classId INT NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (classId) REFERENCES class(id)
);
```

## Error Handling

### Validation Errors (400 Bad Request)
- **Missing Class Name**: The `className` parameter is required
- **Class Not Found**: The specified class does not exist

### Not Found Errors (404 Not Found)
- **No Students Found**: No students with group assignments exist in the class

### Server Errors (500 Internal Server Error)
- **Database Errors**: Connection or query execution failures
- **Processing Failures**: Data processing operation failures

### Error Logging
All errors are logged with additional context:
- Location: `api/schedules/pdf-data`
- Type: `pdf-data-error`
- Error details for debugging

## Example Usage

### Retrieve PDF Data

```bash
curl -X GET \
  "http://localhost:3000/api/schedules/pdf-data?className=10A" \
  -H "Authorization: Bearer <jwt-token>"
```

### Using JavaScript

```javascript
async function getPDFData(className) {
  try {
    const response = await fetch(`/api/schedules/pdf-data?className=${encodeURIComponent(className)}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch PDF data');
    }
    
    const data = await response.json();
    return data.students;
  } catch (error) {
    console.error('Error fetching PDF data:', error);
    throw error;
  }
}

// Example usage
getPDFData('10A')
  .then(students => {
    console.log(`Found ${students.length} students with group assignments:`);
    students.forEach(student => {
      console.log(`- ${student.name} (Group: ${student.groupId})`);
    });
  })
  .catch(error => {
    console.error('Failed to get PDF data:', error);
  });
```

### Using Python

```python
import requests

def get_pdf_data(className):
    try:
        response = requests.get(
            f'http://localhost:3000/api/schedules/pdf-data?className={className}',
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
        return data.get('students', [])
        
    except requests.exceptions.RequestException as e:
        print(f"Error fetching PDF data: {e}")
        raise

# Example usage
try:
    students = get_pdf_data('10A')
    print(f"Found {len(students)} students with group assignments:")
    for student in students:
        print(f"- {student['name']} (Group: {student['groupId']})")
except Exception as e:
    print(f"Failed to get PDF data: {e}")
```

## Use Cases

### 1. Generate Student List PDF
```javascript
// Generate student list for PDF generation
async function generateStudentListPDF(className) {
  try {
    const students = await getPDFData(className);
    
    // Group students by group
    const studentsByGroup = {};
    students.forEach(student => {
      const groupId = student.groupId;
      if (!studentsByGroup[groupId]) {
        studentsByGroup[groupId] = [];
      }
      studentsByGroup[groupId].push(student);
    });
    
    // Create PDF data structure
    const pdfData = {
      className: className,
      totalStudents: students.length,
      groups: Object.keys(studentsByGroup).map(groupId => ({
        groupId: groupId,
        students: studentsByGroup[groupId],
        count: studentsByGroup[groupId].length
      })),
      generatedAt: new Date().toISOString()
    };
    
    return pdfData;
  } catch (error) {
    console.error('Failed to generate student list PDF:', error);
    throw error;
  }
}
```

### 2. Validate Group Assignments
```javascript
// Validate that all students have group assignments
async function validateGroupAssignments(className) {
  try {
    const students = await getPDFData(className);
    
    const validation = {
      totalStudents: students.length,
      groups: [...new Set(students.map(s => s.groupId))],
      groupDistribution: {},
      isValid: students.length > 0
    };
    
    // Calculate group distribution
    students.forEach(student => {
      const groupId = student.groupId;
      validation.groupDistribution[groupId] = (validation.groupDistribution[groupId] || 0) + 1;
    });
    
    // Check for balanced groups
    const groupCounts = Object.values(validation.groupDistribution);
    const minCount = Math.min(...groupCounts);
    const maxCount = Math.max(...groupCounts);
    validation.isBalanced = (maxCount - minCount) <= 1;
    
    return validation;
  } catch (error) {
    console.error('Failed to validate group assignments:', error);
    return null;
  }
}
```

### 3. Export Student Data
```javascript
// Export student data for external processing
async function exportStudentData(className) {
  try {
    const students = await getPDFData(className);
    
    const exportData = {
      className: className,
      exportDate: new Date().toISOString(),
      students: students.map(student => ({
        id: student.id,
        name: student.name,
        groupId: student.groupId,
        classId: student.classId
      }))
    };
    
    return exportData;
  } catch (error) {
    console.error('Failed to export student data:', error);
    throw error;
  }
}
```

## Performance Considerations

### Query Optimization
- **Filtered Query**: Only retrieves students with group assignments
- **Indexing**: Proper indexing on `classId` and `groupId` fields
- **Efficient Filtering**: Uses database-level filtering for better performance

### Data Handling
- **Selective Retrieval**: Only includes necessary student fields
- **Group Filtering**: Excludes unassigned students at database level
- **Error Recovery**: Graceful handling of missing data

## Security Considerations

- **Input Validation**: Validates class name parameter
- **Access Control**: PDF data operations require specific permissions
- **Data Privacy**: Ensures only authorized access to student data
- **Error Handling**: Generic error messages prevent information disclosure

## Related Documentation

- [Schedules API Overview](./README.md) - General schedules API information
- [Main Schedules](./index.md) - Core schedule management endpoints
- [Schedule Times](./times.md) - Schedule and break time management
- [Schedule Data](./data.md) - Teacher schedule data aggregation
- [All Schedules](./all.md) - Bulk schedule retrieval
- [Assignments](./assignments.md) - Teacher assignment retrieval
- [API Overview](../README.md) - General API information
- [Prisma Documentation](https://www.prisma.io/docs) - Database ORM 