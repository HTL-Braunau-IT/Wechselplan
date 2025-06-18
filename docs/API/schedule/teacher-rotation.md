# Teacher Rotation API

The Teacher Rotation API manages teacher rotation schedules for classes. This endpoint handles the creation and updating of teacher rotation data, including both AM (morning) and PM (afternoon) rotation periods.

## Base URL

`/api/schedule/teacher-rotation`

## Endpoints

### POST /api/schedule/teacher-rotation

Creates or updates teacher rotation schedules for a class, including both AM and PM rotation periods.

#### Request

```http
POST /api/schedule/teacher-rotation
Content-Type: application/json

{
  "className": "10A",
  "amRotation": [
    {
      "week": 1,
      "teacherId": "teacher-1"
    },
    {
      "week": 2,
      "teacherId": "teacher-2"
    }
  ],
  "pmRotation": [
    {
      "week": 1,
      "teacherId": "teacher-3"
    },
    {
      "week": 2,
      "teacherId": "teacher-4"
    }
  ]
}
```

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `className` | string | Yes | The name of the class to create rotation for |
| `amRotation` | array | Yes | Array of AM rotation objects |
| `pmRotation` | array | Yes | Array of PM rotation objects |

#### AM/PM Rotation Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `week` | number | Yes | The week number for the rotation |
| `teacherId` | string | Yes | The ID of the teacher for this week |

#### Response

**Success (200 OK)**

```json
{
  "message": "Teacher rotation saved successfully"
}
```

**Validation Error (400 Bad Request)**

```json
{
  "error": "Class name is required"
}
```

**Server Error (500 Internal Server Error)**

```json
{
  "error": "Failed to save teacher rotation"
}
```

## Data Processing

### Teacher Rotation Process
The API performs the following operations:
1. **Class Validation**: Validates that the class exists by name
2. **Existing Rotation Cleanup**: Deletes any existing rotation data for the class
3. **AM Rotation Creation**: Creates new AM rotation entries
4. **PM Rotation Creation**: Creates new PM rotation entries
5. **Success Response**: Returns confirmation of successful save

### Database Operations
1. **Class Lookup**: Finds the class by name to get the class ID
2. **Rotation Deletion**: Removes existing rotation data for the class
3. **New Rotation Creation**: Creates new rotation entries for AM and PM periods
4. **Transaction Management**: Ensures all operations succeed or fail together

## Data Models

### Teacher Rotation Request

```typescript
interface TeacherRotationRequest {
  className: string
  amRotation: Array<{
    week: number
    teacherId: string
  }>
  pmRotation: Array<{
    week: number
    teacherId: string
  }>
}
```

### Teacher Rotation Response

```typescript
interface TeacherRotationResponse {
  message: string
}
```

### Database Models

```typescript
interface TeacherRotation {
  id: string
  classId: string
  teacherId: string
  week: number
  period: 'AM' | 'PM'
  createdAt: string
  updatedAt: string
}
```

## Business Logic

### Class Validation
```typescript
const classId = await db.class.findFirst({
  where: {
    name: className
  }
})

if (!classId) {
  return NextResponse.json(
    { error: 'Class not found' },
    { status: 404 }
  )
}
```

### Existing Rotation Cleanup
```typescript
await db.teacherRotation.deleteMany({
  where: {
    classId: classId.id
  }
})
```

### AM Rotation Creation
```typescript
const amRotationData = amRotation.map((rotation: any) => ({
  classId: classId.id,
  teacherId: rotation.teacherId,
  week: rotation.week,
  period: 'AM'
}))

await db.teacherRotation.createMany({
  data: amRotationData
})
```

### PM Rotation Creation
```typescript
const pmRotationData = pmRotation.map((rotation: any) => ({
  classId: classId.id,
  teacherId: rotation.teacherId,
  week: rotation.week,
  period: 'PM'
}))

await db.teacherRotation.createMany({
  data: pmRotationData
})
```

## Database Schema

### Teacher Rotation Table
```sql
CREATE TABLE teacher_rotation (
  id VARCHAR(255) PRIMARY KEY,
  classId VARCHAR(255) NOT NULL,
  teacherId VARCHAR(255) NOT NULL,
  week INT NOT NULL,
  period ENUM('AM', 'PM') NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (classId) REFERENCES class(id),
  FOREIGN KEY (teacherId) REFERENCES teacher(id),
  UNIQUE KEY unique_rotation (classId, week, period)
);
```

### Class Table Reference
```sql
CREATE TABLE class (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### Teacher Table Reference
```sql
CREATE TABLE teacher (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

## Error Handling

### Validation Errors (400 Bad Request)
- **Missing Class Name**: The `className` field is required
- **Missing AM Rotation**: The `amRotation` array is required
- **Missing PM Rotation**: The `pmRotation` array is required
- **Invalid Request Body**: Malformed JSON or missing required fields

### Not Found Errors (404 Not Found)
- **Class Not Found**: The specified class does not exist

### Server Errors (500 Internal Server Error)
- **Database Errors**: Connection or query execution failures
- **Save Failures**: Teacher rotation save operation failures

### Error Logging
All errors are logged with additional context:
- Location: `api/schedule/teacher-rotation`
- Type: `save-rotation`
- Error details for debugging

## Example Usage

### Create Teacher Rotation

```bash
curl -X POST \
  "http://localhost:3000/api/schedule/teacher-rotation" \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "className": "10A",
    "amRotation": [
      {
        "week": 1,
        "teacherId": "teacher-1"
      },
      {
        "week": 2,
        "teacherId": "teacher-2"
      },
      {
        "week": 3,
        "teacherId": "teacher-1"
      },
      {
        "week": 4,
        "teacherId": "teacher-2"
      }
    ],
    "pmRotation": [
      {
        "week": 1,
        "teacherId": "teacher-3"
      },
      {
        "week": 2,
        "teacherId": "teacher-4"
      },
      {
        "week": 3,
        "teacherId": "teacher-3"
      },
      {
        "week": 4,
        "teacherId": "teacher-4"
      }
    ]
  }'
```

### Using JavaScript

```javascript
async function createTeacherRotation(className, amRotation, pmRotation) {
  try {
    const response = await fetch('/api/schedule/teacher-rotation', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        className,
        amRotation,
        pmRotation
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create teacher rotation');
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error creating teacher rotation:', error);
    throw error;
  }
}

// Example usage
const amRotation = [
  { week: 1, teacherId: 'teacher-1' },
  { week: 2, teacherId: 'teacher-2' },
  { week: 3, teacherId: 'teacher-1' },
  { week: 4, teacherId: 'teacher-2' }
];

const pmRotation = [
  { week: 1, teacherId: 'teacher-3' },
  { week: 2, teacherId: 'teacher-4' },
  { week: 3, teacherId: 'teacher-3' },
  { week: 4, teacherId: 'teacher-4' }
];

createTeacherRotation('10A', amRotation, pmRotation)
  .then(result => {
    console.log('Teacher rotation created:', result.message);
  })
  .catch(error => {
    console.error('Failed to create teacher rotation:', error);
  });
```

### Using Python

```python
import requests

def create_teacher_rotation(className, amRotation, pmRotation):
    try:
        payload = {
            'className': className,
            'amRotation': amRotation,
            'pmRotation': pmRotation
        }
        
        response = requests.post(
            'http://localhost:3000/api/schedule/teacher-rotation',
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
        print(f"Error creating teacher rotation: {e}")
        raise

# Example usage
am_rotation = [
    {'week': 1, 'teacherId': 'teacher-1'},
    {'week': 2, 'teacherId': 'teacher-2'},
    {'week': 3, 'teacherId': 'teacher-1'},
    {'week': 4, 'teacherId': 'teacher-2'}
]

pm_rotation = [
    {'week': 1, 'teacherId': 'teacher-3'},
    {'week': 2, 'teacherId': 'teacher-4'},
    {'week': 3, 'teacherId': 'teacher-3'},
    {'week': 4, 'teacherId': 'teacher-4'}
]

try:
    result = create_teacher_rotation('10A', am_rotation, pm_rotation)
    print(f"Teacher rotation created: {result['message']}")
except Exception as e:
    print(f"Failed to create teacher rotation: {e}")
```

## Use Cases

### 1. Create Weekly Teacher Rotation
```javascript
// Create a 4-week rotation schedule
async function createWeeklyRotation(className, teachers) {
  const amRotation = [];
  const pmRotation = [];
  
  for (let week = 1; week <= 4; week++) {
    // Alternate between two teachers for AM
    const amTeacher = week % 2 === 1 ? teachers.teacher1 : teachers.teacher2;
    amRotation.push({
      week,
      teacherId: amTeacher.id
    });
    
    // Alternate between two teachers for PM
    const pmTeacher = week % 2 === 1 ? teachers.teacher3 : teachers.teacher4;
    pmRotation.push({
      week,
      teacherId: pmTeacher.id
    });
  }
  
  return await createTeacherRotation(className, amRotation, pmRotation);
}
```

### 2. Update Existing Rotation
```javascript
// Update rotation for a specific class
async function updateClassRotation(className, newAmRotation, newPmRotation) {
  try {
    const result = await createTeacherRotation(className, newAmRotation, newPmRotation);
    console.log('Rotation updated successfully:', result.message);
    return result;
  } catch (error) {
    console.error('Failed to update rotation:', error);
    throw error;
  }
}
```

### 3. Validate Rotation Data
```javascript
// Validate rotation data before submission
function validateRotationData(amRotation, pmRotation) {
  const errors = [];
  
  // Check for required fields
  if (!amRotation || !Array.isArray(amRotation)) {
    errors.push('AM rotation must be an array');
  }
  
  if (!pmRotation || !Array.isArray(pmRotation)) {
    errors.push('PM rotation must be an array');
  }
  
  // Check for valid week numbers
  const validateWeeks = (rotation, period) => {
    const weeks = new Set();
    rotation.forEach((item, index) => {
      if (!item.week || typeof item.week !== 'number') {
        errors.push(`${period} rotation item ${index}: week must be a number`);
      }
      if (!item.teacherId || typeof item.teacherId !== 'string') {
        errors.push(`${period} rotation item ${index}: teacherId must be a string`);
      }
      if (weeks.has(item.week)) {
        errors.push(`${period} rotation: duplicate week ${item.week}`);
      }
      weeks.add(item.week);
    });
  };
  
  if (amRotation) validateWeeks(amRotation, 'AM');
  if (pmRotation) validateWeeks(pmRotation, 'PM');
  
  return {
    valid: errors.length === 0,
    errors
  };
}
```

## Performance Considerations

### Database Operations
- **Batch Operations**: Uses `createMany` for efficient bulk insertion
- **Transaction Safety**: Ensures data consistency with proper error handling
- **Indexing**: Proper indexing on `classId`, `week`, and `period` fields

### Data Validation
- **Input Validation**: Validates all required fields before database operations
- **Duplicate Prevention**: Unique constraint on `(classId, week, period)`
- **Data Integrity**: Ensures referential integrity with foreign keys

## Security Considerations

- **Input Validation**: All parameters are validated before processing
- **Access Control**: Teacher rotation operations require specific permissions
- **Data Integrity**: Ensures only valid teacher and class associations
- **Error Handling**: Generic error messages prevent information disclosure

## Related Documentation

- [Schedule API Overview](./README.md) - General schedule API information
- [Schedule Times](./times.md) - Schedule and break time management
- [Teacher Assignments](./teacher-assignments.md) - Teacher assignment management
- [Turns](./turns.md) - Turn schedule management
- [Assignments](./assignments.md) - Student group assignments
- [API Overview](../README.md) - General API information
- [Prisma Documentation](https://www.prisma.io/docs) - Database ORM 