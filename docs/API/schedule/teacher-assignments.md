# Teacher Assignments API

The Teacher Assignments API manages teacher assignments for classes. This endpoint handles the retrieval and creation of teacher assignments, including both AM (morning) and PM (afternoon) assignments with associated subjects and groups.

## Base URL

`/api/schedule/teacher-assignments`

## Endpoints

### GET /api/schedule/teacher-assignments

Retrieves teacher assignments for a specified class, grouped by AM and PM periods.

#### Request

```http
GET /api/schedule/teacher-assignments?class=10A
```

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `class` | string | Yes | The name of the class to retrieve assignments for |

#### Response

**Success (200 OK)**

```json
{
  "am": [
    {
      "id": "assignment-1",
      "teacherId": "teacher-1",
      "subjectId": "subject-1",
      "groupId": "group-1",
      "teacher": {
        "id": "teacher-1",
        "name": "John Doe",
        "email": "john.doe@school.com"
      },
      "subject": {
        "id": "subject-1",
        "name": "Mathematics"
      },
      "group": {
        "id": "group-1",
        "name": "Group A"
      }
    }
  ],
  "pm": [
    {
      "id": "assignment-2",
      "teacherId": "teacher-2",
      "subjectId": "subject-2",
      "groupId": "group-1",
      "teacher": {
        "id": "teacher-2",
        "name": "Jane Smith",
        "email": "jane.smith@school.com"
      },
      "subject": {
        "id": "subject-2",
        "name": "Science"
      },
      "group": {
        "id": "group-1",
        "name": "Group A"
      }
    }
  ]
}
```

**Validation Error (400 Bad Request)**

```json
{
  "error": "Class parameter is required"
}
```

**Not Found Error (404 Not Found)**

```json
{
  "error": "Class not found"
}
```

### POST /api/schedule/teacher-assignments

Creates or updates teacher assignments for a class, including both AM and PM assignments.

#### Request

```http
POST /api/schedule/teacher-assignments
Content-Type: application/json

{
  "class": "10A",
  "am": [
    {
      "teacherId": "teacher-1",
      "subjectId": "subject-1",
      "groupId": "group-1"
    },
    {
      "teacherId": "teacher-2",
      "subjectId": "subject-2",
      "groupId": "group-2"
    }
  ],
  "pm": [
    {
      "teacherId": "teacher-3",
      "subjectId": "subject-3",
      "groupId": "group-1"
    },
    {
      "teacherId": "teacher-4",
      "subjectId": "subject-4",
      "groupId": "group-2"
    }
  ]
}
```

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `class` | string | Yes | The name of the class to create assignments for |
| `am` | array | Yes | Array of AM assignment objects |
| `pm` | array | Yes | Array of PM assignment objects |

#### Assignment Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `teacherId` | string | Yes | The ID of the teacher |
| `subjectId` | string | Yes | The ID of the subject |
| `groupId` | string | Yes | The ID of the group |

#### Response

**Success (200 OK)**

```json
{
  "message": "Teacher assignments saved successfully"
}
```

**Validation Error (400 Bad Request)**

```json
{
  "error": "Class is required"
}
```

**Not Found Error (404 Not Found)**

```json
{
  "error": "Class not found"
}
```

**Server Error (500 Internal Server Error)**

```json
{
  "error": "Failed to save teacher assignments"
}
```

## Data Processing

### Teacher Assignment Retrieval Process
The API performs the following operations:
1. **Class Validation**: Validates that the class exists by name
2. **Assignment Retrieval**: Fetches all teacher assignments for the class
3. **Data Grouping**: Groups assignments by AM and PM periods
4. **Related Data**: Includes teacher, subject, and group information
5. **Response**: Returns structured assignment data

### Teacher Assignment Creation Process
1. **Class Validation**: Validates that the class exists
2. **Entity Validation**: Validates that teachers, subjects, and groups exist
3. **Existing Assignment Cleanup**: Deletes existing assignments for the class
4. **AM Assignment Creation**: Creates new AM assignments
5. **PM Assignment Creation**: Creates new PM assignments
6. **Success Response**: Returns confirmation of successful save

## Data Models

### Teacher Assignment Request

```typescript
interface TeacherAssignmentRequest {
  class: string
  am: Array<{
    teacherId: string
    subjectId: string
    groupId: string
  }>
  pm: Array<{
    teacherId: string
    subjectId: string
    groupId: string
  }>
}
```

### Teacher Assignment Response

```typescript
interface TeacherAssignmentResponse {
  am: Array<{
    id: string
    teacherId: string
    subjectId: string
    groupId: string
    teacher: {
      id: string
      name: string
      email: string
    }
    subject: {
      id: string
      name: string
    }
    group: {
      id: string
      name: string
    }
  }>
  pm: Array<{
    id: string
    teacherId: string
    subjectId: string
    groupId: string
    teacher: {
      id: string
      name: string
      email: string
    }
    subject: {
      id: string
      name: string
    }
    group: {
      id: string
      name: string
    }
  }>
}
```

### Database Models

```typescript
interface TeacherAssignment {
  id: string
  classId: string
  teacherId: string
  subjectId: string
  groupId: string
  period: 'AM' | 'PM'
  createdAt: string
  updatedAt: string
}
```

## Business Logic

### Class Validation
```typescript
const classId = await prisma.class.findFirst({
  where: {
    name: class
  }
})

if (!classId) {
  return NextResponse.json(
    { error: 'Class not found' },
    { status: 404 }
  )
}
```

### Assignment Retrieval
```typescript
const assignments = await prisma.teacherAssignment.findMany({
  where: {
    classId: classId.id
  },
  include: {
    teacher: true,
    subject: true,
    group: true
  }
})
```

### Assignment Grouping
```typescript
const amAssignments = assignments.filter(assignment => assignment.period === 'AM')
const pmAssignments = assignments.filter(assignment => assignment.period === 'PM')
```

### Entity Validation
```typescript
// Validate teacher exists
const teacher = await prisma.teacher.findUnique({
  where: { id: teacherId }
})
if (!teacher) {
  return NextResponse.json(
    { error: `Teacher with ID ${teacherId} not found` },
    { status: 404 }
  )
}

// Validate subject exists
const subject = await prisma.subject.findUnique({
  where: { id: subjectId }
})
if (!subject) {
  return NextResponse.json(
    { error: `Subject with ID ${subjectId} not found` },
    { status: 404 }
  )
}

// Validate group exists
const group = await prisma.group.findUnique({
  where: { id: groupId }
})
if (!group) {
  return NextResponse.json(
    { error: `Group with ID ${groupId} not found` },
    { status: 404 }
  )
}
```

### Assignment Creation
```typescript
const amAssignmentData = am.map((assignment: any) => ({
  classId: classId.id,
  teacherId: assignment.teacherId,
  subjectId: assignment.subjectId,
  groupId: assignment.groupId,
  period: 'AM'
}))

await prisma.teacherAssignment.createMany({
  data: amAssignmentData
})
```

## Database Schema

### Teacher Assignment Table
```sql
CREATE TABLE teacher_assignment (
  id VARCHAR(255) PRIMARY KEY,
  classId VARCHAR(255) NOT NULL,
  teacherId VARCHAR(255) NOT NULL,
  subjectId VARCHAR(255) NOT NULL,
  groupId VARCHAR(255) NOT NULL,
  period ENUM('AM', 'PM') NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (classId) REFERENCES class(id),
  FOREIGN KEY (teacherId) REFERENCES teacher(id),
  FOREIGN KEY (subjectId) REFERENCES subject(id),
  FOREIGN KEY (groupId) REFERENCES group(id),
  UNIQUE KEY unique_assignment (classId, teacherId, subjectId, groupId, period)
);
```

### Related Tables
```sql
-- Class Table
CREATE TABLE class (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Teacher Table
CREATE TABLE teacher (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Subject Table
CREATE TABLE subject (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Group Table
CREATE TABLE group (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  classId VARCHAR(255) NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (classId) REFERENCES class(id)
);
```

## Error Handling

### Validation Errors (400 Bad Request)
- **Missing Class Parameter**: The `class` parameter is required for GET requests
- **Missing Class Field**: The `class` field is required for POST requests
- **Missing AM/PM Arrays**: Both `am` and `pm` arrays are required
- **Invalid Request Body**: Malformed JSON or missing required fields

### Not Found Errors (404 Not Found)
- **Class Not Found**: The specified class does not exist
- **Teacher Not Found**: The specified teacher does not exist
- **Subject Not Found**: The specified subject does not exist
- **Group Not Found**: The specified group does not exist

### Server Errors (500 Internal Server Error)
- **Database Errors**: Connection or query execution failures
- **Save Failures**: Teacher assignment save operation failures

### Error Logging
All errors are logged with additional context:
- Location: `api/schedule/teacher-assignments`
- Type: `fetch-assignments` or `save-assignments`
- Error details for debugging

## Example Usage

### Retrieve Teacher Assignments

```bash
curl -X GET \
  "http://localhost:3000/api/schedule/teacher-assignments?class=10A" \
  -H "Authorization: Bearer <jwt-token>"
```

### Create Teacher Assignments

```bash
curl -X POST \
  "http://localhost:3000/api/schedule/teacher-assignments" \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "class": "10A",
    "am": [
      {
        "teacherId": "teacher-1",
        "subjectId": "subject-1",
        "groupId": "group-1"
      },
      {
        "teacherId": "teacher-2",
        "subjectId": "subject-2",
        "groupId": "group-2"
      }
    ],
    "pm": [
      {
        "teacherId": "teacher-3",
        "subjectId": "subject-3",
        "groupId": "group-1"
      },
      {
        "teacherId": "teacher-4",
        "subjectId": "subject-4",
        "groupId": "group-2"
      }
    ]
  }'
```

### Using JavaScript

```javascript
async function getTeacherAssignments(className) {
  try {
    const response = await fetch(`/api/schedule/teacher-assignments?class=${encodeURIComponent(className)}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch teacher assignments');
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching teacher assignments:', error);
    throw error;
  }
}

async function createTeacherAssignments(className, amAssignments, pmAssignments) {
  try {
    const response = await fetch('/api/schedule/teacher-assignments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        class: className,
        am: amAssignments,
        pm: pmAssignments
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create teacher assignments');
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error creating teacher assignments:', error);
    throw error;
  }
}

// Example usage
const amAssignments = [
  {
    teacherId: 'teacher-1',
    subjectId: 'subject-1',
    groupId: 'group-1'
  },
  {
    teacherId: 'teacher-2',
    subjectId: 'subject-2',
    groupId: 'group-2'
  }
];

const pmAssignments = [
  {
    teacherId: 'teacher-3',
    subjectId: 'subject-3',
    groupId: 'group-1'
  },
  {
    teacherId: 'teacher-4',
    subjectId: 'subject-4',
    groupId: 'group-2'
  }
];

// Get assignments
getTeacherAssignments('10A')
  .then(assignments => {
    console.log('AM Assignments:', assignments.am);
    console.log('PM Assignments:', assignments.pm);
  })
  .catch(error => {
    console.error('Failed to get assignments:', error);
  });

// Create assignments
createTeacherAssignments('10A', amAssignments, pmAssignments)
  .then(result => {
    console.log('Assignments created:', result.message);
  })
  .catch(error => {
    console.error('Failed to create assignments:', error);
  });
```

### Using Python

```python
import requests

def get_teacher_assignments(className):
    try:
        response = requests.get(
            f'http://localhost:3000/api/schedule/teacher-assignments?class={className}',
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
        print(f"Error fetching teacher assignments: {e}")
        raise

def create_teacher_assignments(className, amAssignments, pmAssignments):
    try:
        payload = {
            'class': className,
            'am': amAssignments,
            'pm': pmAssignments
        }
        
        response = requests.post(
            'http://localhost:3000/api/schedule/teacher-assignments',
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
        print(f"Error creating teacher assignments: {e}")
        raise

# Example usage
am_assignments = [
    {
        'teacherId': 'teacher-1',
        'subjectId': 'subject-1',
        'groupId': 'group-1'
    },
    {
        'teacherId': 'teacher-2',
        'subjectId': 'subject-2',
        'groupId': 'group-2'
    }
]

pm_assignments = [
    {
        'teacherId': 'teacher-3',
        'subjectId': 'subject-3',
        'groupId': 'group-1'
    },
    {
        'teacherId': 'teacher-4',
        'subjectId': 'subject-4',
        'groupId': 'group-2'
    }
]

# Get assignments
try:
    assignments = get_teacher_assignments('10A')
    print(f"AM Assignments: {assignments['am']}")
    print(f"PM Assignments: {assignments['pm']}")
except Exception as e:
    print(f"Failed to get assignments: {e}")

# Create assignments
try:
    result = create_teacher_assignments('10A', am_assignments, pm_assignments)
    print(f"Assignments created: {result['message']}")
except Exception as e:
    print(f"Failed to create assignments: {e}")
```

## Use Cases

### 1. Display Class Schedule
```javascript
// Display teacher assignments for a class
async function displayClassSchedule(className) {
  try {
    const assignments = await getTeacherAssignments(className);
    
    console.log(`Teacher Assignments for ${className}:`);
    
    console.log('Morning (AM) Assignments:');
    assignments.am.forEach(assignment => {
      console.log(`  ${assignment.teacher.name} - ${assignment.subject.name} - ${assignment.group.name}`);
    });
    
    console.log('Afternoon (PM) Assignments:');
    assignments.pm.forEach(assignment => {
      console.log(`  ${assignment.teacher.name} - ${assignment.subject.name} - ${assignment.group.name}`);
    });
  } catch (error) {
    console.error('Failed to display schedule:', error);
  }
}
```

### 2. Create Weekly Schedule
```javascript
// Create a complete weekly schedule for a class
async function createWeeklySchedule(className, scheduleData) {
  try {
    const result = await createTeacherAssignments(
      className,
      scheduleData.am,
      scheduleData.pm
    );
    
    console.log('Weekly schedule created successfully:', result.message);
    return result;
  } catch (error) {
    console.error('Failed to create weekly schedule:', error);
    throw error;
  }
}
```

### 3. Validate Assignment Conflicts
```javascript
// Check for assignment conflicts
async function validateAssignments(className, amAssignments, pmAssignments) {
  try {
    const existingAssignments = await getTeacherAssignments(className);
    const conflicts = [];
    
    // Check for teacher conflicts in AM
    const amTeachers = amAssignments.map(a => a.teacherId);
    const duplicateAmTeachers = amTeachers.filter((teacher, index) => amTeachers.indexOf(teacher) !== index);
    
    if (duplicateAmTeachers.length > 0) {
      conflicts.push(`AM: Teacher conflicts for ${duplicateAmTeachers.join(', ')}`);
    }
    
    // Check for teacher conflicts in PM
    const pmTeachers = pmAssignments.map(a => a.teacherId);
    const duplicatePmTeachers = pmTeachers.filter((teacher, index) => pmTeachers.indexOf(teacher) !== index);
    
    if (duplicatePmTeachers.length > 0) {
      conflicts.push(`PM: Teacher conflicts for ${duplicatePmTeachers.join(', ')}`);
    }
    
    return {
      valid: conflicts.length === 0,
      conflicts
    };
  } catch (error) {
    console.error('Failed to validate assignments:', error);
    return { valid: false, error: error.message };
  }
}
```

## Performance Considerations

### Query Optimization
- **Eager Loading**: Includes related data in single queries
- **Indexing**: Proper indexing on foreign key fields
- **Batch Operations**: Uses `createMany` for efficient bulk insertion

### Data Validation
- **Entity Validation**: Validates all referenced entities before creation
- **Duplicate Prevention**: Unique constraint on assignment combinations
- **Data Integrity**: Ensures referential integrity with foreign keys

## Security Considerations

- **Input Validation**: All parameters are validated before processing
- **Access Control**: Teacher assignment operations require specific permissions
- **Data Integrity**: Ensures only valid entity associations
- **Error Handling**: Generic error messages prevent information disclosure

## Related Documentation

- [Schedule API Overview](./README.md) - General schedule API information
- [Schedule Times](./times.md) - Schedule and break time management
- [Teacher Rotation](./teacher-rotation.md) - Teacher rotation schedules
- [Turns](./turns.md) - Turn schedule management
- [Assignments](./assignments.md) - Student group assignments
- [API Overview](../README.md) - General API information
- [Prisma Documentation](https://www.prisma.io/docs) - Database ORM 