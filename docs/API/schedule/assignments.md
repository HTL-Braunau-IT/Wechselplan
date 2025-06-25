# Assignments API

The Assignments API manages student group assignments for classes. This endpoint handles the retrieval and updating of student assignments to groups, including tracking of unassigned students.

## Base URL

`/api/schedule/assignments`

## Endpoints

### GET /api/schedule/assignments

Retrieves group assignments and unassigned students for a specified class.

#### Request

```http
GET /api/schedule/assignments?class=10A
```

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `class` | string | Yes | The name of the class to retrieve assignments for |

#### Response

**Success (200 OK)**

```json
{
  "assignments": [
    {
      "id": "student-1",
      "name": "John Doe",
      "groupId": "group-1",
      "group": {
        "id": "group-1",
        "name": "Group A"
      }
    },
    {
      "id": "student-2",
      "name": "Jane Smith",
      "groupId": "group-1",
      "group": {
        "id": "group-1",
        "name": "Group A"
      }
    },
    {
      "id": "student-3",
      "name": "Bob Johnson",
      "groupId": "group-2",
      "group": {
        "id": "group-2",
        "name": "Group B"
      }
    }
  ],
  "unassigned": [
    {
      "id": "student-4",
      "name": "Alice Brown"
    },
    {
      "id": "student-5",
      "name": "Charlie Wilson"
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

### POST /api/schedule/assignments

Updates student group assignments for a given class.

#### Request

```http
POST /api/schedule/assignments
Content-Type: application/json

{
  "class": "10A",
  "assignments": [
    {
      "studentId": "student-1",
      "groupId": "group-1"
    },
    {
      "studentId": "student-2",
      "groupId": "group-1"
    },
    {
      "studentId": "student-3",
      "groupId": "group-2"
    }
  ],
  "unassigned": [
    "student-4",
    "student-5"
  ]
}
```

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `class` | string | Yes | The name of the class to update assignments for |
| `assignments` | array | Yes | Array of assignment objects |
| `unassigned` | array | Yes | Array of unassigned student IDs |

#### Assignment Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `studentId` | string | Yes | The ID of the student |
| `groupId` | string | Yes | The ID of the group to assign the student to |

#### Response

**Success (200 OK)**

```json
{
  "message": "Student assignments updated successfully"
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
  "error": "Failed to update student assignments"
}
```

## Data Processing

### Student Assignment Retrieval Process
The API performs the following operations:
1. **Class Validation**: Validates that the class exists by name
2. **Student Retrieval**: Fetches all students for the class
3. **Assignment Grouping**: Separates assigned and unassigned students
4. **Group Information**: Includes group details for assigned students
5. **Response**: Returns structured assignment data

### Student Assignment Update Process
1. **Class Validation**: Validates that the class exists
2. **Input Validation**: Validates the request body structure
3. **Assignment Processing**: Updates student group assignments
4. **Unassigned Processing**: Handles unassigned students
5. **Success Response**: Returns confirmation of successful update

## Data Models

### Student Assignment Request

```typescript
interface StudentAssignmentRequest {
  class: string
  assignments: Array<{
    studentId: string
    groupId: string
  }>
  unassigned: string[]
}
```

### Student Assignment Response

```typescript
interface StudentAssignmentResponse {
  assignments: Array<{
    id: string
    name: string
    groupId: string
    group: {
      id: string
      name: string
    }
  }>
  unassigned: Array<{
    id: string
    name: string
  }>
}
```

### Database Models

```typescript
interface Student {
  id: string
  name: string
  classId: string
  groupId?: string
  createdAt: string
  updatedAt: string
}

interface Group {
  id: string
  name: string
  classId: string
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

### Student Retrieval
```typescript
const students = await prisma.student.findMany({
  where: {
    classId: classId.id
  },
  include: {
    group: true
  }
})
```

### Assignment Processing
```typescript
// Process assignments
for (const assignment of assignments) {
  await prisma.student.update({
    where: {
      id: assignment.studentId
    },
    data: {
      groupId: assignment.groupId
    }
  })
}

// Process unassigned students
for (const studentId of unassigned) {
  await prisma.student.update({
    where: {
      id: studentId
    },
    data: {
      groupId: null
    }
  })
}
```

### Data Grouping
```typescript
const assignedStudents = students.filter(student => student.groupId !== null)
const unassignedStudents = students.filter(student => student.groupId === null)
```

## Database Schema

### Student Table
```sql
CREATE TABLE student (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  classId VARCHAR(255) NOT NULL,
  groupId VARCHAR(255),
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (classId) REFERENCES class(id),
  FOREIGN KEY (groupId) REFERENCES group(id)
);
```

### Group Table
```sql
CREATE TABLE group (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  classId VARCHAR(255) NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (classId) REFERENCES class(id)
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

## Error Handling

### Validation Errors (400 Bad Request)
- **Missing Class Parameter**: The `class` parameter is required for GET requests
- **Missing Class Field**: The `class` field is required for POST requests
- **Missing Assignments Array**: The `assignments` array is required
- **Missing Unassigned Array**: The `unassigned` array is required
- **Invalid Request Body**: Malformed JSON or missing required fields

### Not Found Errors (404 Not Found)
- **Class Not Found**: The specified class does not exist

### Server Errors (500 Internal Server Error)
- **Database Errors**: Connection or query execution failures
- **Update Failures**: Student assignment update operation failures

### Error Logging
All errors are logged with additional context:
- Location: `api/schedule/assignments`
- Type: `fetch-assignments` or `update-assignments`
- Error details for debugging

## Example Usage

### Retrieve Student Assignments

```bash
curl -X GET \
  "http://localhost:3000/api/schedule/assignments?class=10A" \
  -H "Authorization: Bearer <jwt-token>"
```

### Update Student Assignments

```bash
curl -X POST \
  "http://localhost:3000/api/schedule/assignments" \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "class": "10A",
    "assignments": [
      {
        "studentId": "student-1",
        "groupId": "group-1"
      },
      {
        "studentId": "student-2",
        "groupId": "group-1"
      },
      {
        "studentId": "student-3",
        "groupId": "group-2"
      }
    ],
    "unassigned": [
      "student-4",
      "student-5"
    ]
  }'
```

### Using JavaScript

```javascript
async function getStudentAssignments(className) {
  try {
    const response = await fetch(`/api/schedule/assignments?class=${encodeURIComponent(className)}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch student assignments');
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching student assignments:', error);
    throw error;
  }
}

async function updateStudentAssignments(className, assignments, unassigned) {
  try {
    const response = await fetch('/api/schedule/assignments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        class: className,
        assignments,
        unassigned
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update student assignments');
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error updating student assignments:', error);
    throw error;
  }
}

// Example usage
const assignments = [
  {
    studentId: 'student-1',
    groupId: 'group-1'
  },
  {
    studentId: 'student-2',
    groupId: 'group-1'
  },
  {
    studentId: 'student-3',
    groupId: 'group-2'
  }
];

const unassigned = ['student-4', 'student-5'];

// Get assignments
getStudentAssignments('10A')
  .then(data => {
    console.log('Assigned students:', data.assignments);
    console.log('Unassigned students:', data.unassigned);
  })
  .catch(error => {
    console.error('Failed to get assignments:', error);
  });

// Update assignments
updateStudentAssignments('10A', assignments, unassigned)
  .then(result => {
    console.log('Assignments updated:', result.message);
  })
  .catch(error => {
    console.error('Failed to update assignments:', error);
  });
```

### Using Python

```python
import requests

def get_student_assignments(className):
    try:
        response = requests.get(
            f'http://localhost:3000/api/schedule/assignments?class={className}',
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
        print(f"Error fetching student assignments: {e}")
        raise

def update_student_assignments(className, assignments, unassigned):
    try:
        payload = {
            'class': className,
            'assignments': assignments,
            'unassigned': unassigned
        }
        
        response = requests.post(
            'http://localhost:3000/api/schedule/assignments',
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
        print(f"Error updating student assignments: {e}")
        raise

# Example usage
assignments = [
    {
        'studentId': 'student-1',
        'groupId': 'group-1'
    },
    {
        'studentId': 'student-2',
        'groupId': 'group-1'
    },
    {
        'studentId': 'student-3',
        'groupId': 'group-2'
    }
]

unassigned = ['student-4', 'student-5']

# Get assignments
try:
    data = get_student_assignments('10A')
    print(f"Assigned students: {data['assignments']}")
    print(f"Unassigned students: {data['unassigned']}")
except Exception as e:
    print(f"Failed to get assignments: {e}")

# Update assignments
try:
    result = update_student_assignments('10A', assignments, unassigned)
    print(f"Assignments updated: {result['message']}")
except Exception as e:
    print(f"Failed to update assignments: {e}")
```

## Use Cases

### 1. Display Class Assignments
```javascript
// Display student assignments for a class
async function displayClassAssignments(className) {
  try {
    const data = await getStudentAssignments(className);
    
    console.log(`Student Assignments for ${className}:`);
    console.log('===============================');
    
    // Group assignments by group
    const groupAssignments = {};
    data.assignments.forEach(assignment => {
      const groupName = assignment.group.name;
      if (!groupAssignments[groupName]) {
        groupAssignments[groupName] = [];
      }
      groupAssignments[groupName].push(assignment.name);
    });
    
    // Display grouped assignments
    Object.keys(groupAssignments).forEach(groupName => {
      console.log(`\n${groupName}:`);
      groupAssignments[groupName].forEach(studentName => {
        console.log(`  - ${studentName}`);
      });
    });
    
    // Display unassigned students
    if (data.unassigned.length > 0) {
      console.log('\nUnassigned Students:');
      data.unassigned.forEach(student => {
        console.log(`  - ${student.name}`);
      });
    }
  } catch (error) {
    console.error('Failed to display assignments:', error);
  }
}
```

### 2. Balance Group Assignments
```javascript
// Automatically balance students across groups
async function balanceGroupAssignments(className) {
  try {
    const data = await getStudentAssignments(className);
    const allStudents = [...data.assignments, ...data.unassigned];
    
    // Get unique groups
    const groups = [...new Set(data.assignments.map(a => a.groupId))];
    
    if (groups.length === 0) {
      console.log('No groups found for balancing');
      return;
    }
    
    // Calculate target students per group
    const targetPerGroup = Math.ceil(allStudents.length / groups.length);
    
    // Redistribute students
    const newAssignments = [];
    const newUnassigned = [];
    
    let groupIndex = 0;
    allStudents.forEach((student, index) => {
      if (index < groups.length * targetPerGroup) {
        newAssignments.push({
          studentId: student.id,
          groupId: groups[groupIndex]
        });
        
        if ((index + 1) % targetPerGroup === 0) {
          groupIndex++;
        }
      } else {
        newUnassigned.push(student.id);
      }
    });
    
    // Update assignments
    const result = await updateStudentAssignments(className, newAssignments, newUnassigned);
    console.log('Groups balanced successfully:', result.message);
    
  } catch (error) {
    console.error('Failed to balance assignments:', error);
  }
}
```

### 3. Validate Assignment Distribution
```javascript
// Validate that assignments are evenly distributed
async function validateAssignmentDistribution(className) {
  try {
    const data = await getStudentAssignments(className);
    
    // Count students per group
    const groupCounts = {};
    data.assignments.forEach(assignment => {
      const groupName = assignment.group.name;
      groupCounts[groupName] = (groupCounts[groupName] || 0) + 1;
    });
    
    const counts = Object.values(groupCounts);
    const minCount = Math.min(...counts);
    const maxCount = Math.max(...counts);
    const difference = maxCount - minCount;
    
    const validation = {
      balanced: difference <= 1,
      groupCounts,
      minCount,
      maxCount,
      difference,
      unassignedCount: data.unassigned.length,
      totalStudents: data.assignments.length + data.unassigned.length
    };
    
    return validation;
  } catch (error) {
    console.error('Failed to validate distribution:', error);
    return null;
  }
}

// Usage
validateAssignmentDistribution('10A')
  .then(validation => {
    if (validation) {
      console.log('Assignment Distribution Validation:');
      console.log(`Balanced: ${validation.balanced}`);
      console.log(`Group counts:`, validation.groupCounts);
      console.log(`Difference: ${validation.difference}`);
      console.log(`Unassigned: ${validation.unassignedCount}`);
    }
  });
```

### 4. Move Student Between Groups
```javascript
// Move a specific student to a different group
async function moveStudentToGroup(className, studentId, newGroupId) {
  try {
    const data = await getStudentAssignments(className);
    
    // Find current assignment
    const currentAssignment = data.assignments.find(a => a.id === studentId);
    
    if (!currentAssignment) {
      throw new Error('Student not found in assignments');
    }
    
    // Update assignments
    const updatedAssignments = data.assignments.map(assignment => {
      if (assignment.id === studentId) {
        return {
          studentId: assignment.id,
          groupId: newGroupId
        };
      }
      return {
        studentId: assignment.id,
        groupId: assignment.groupId
      };
    });
    
    // Keep unassigned students as is
    const unassigned = data.unassigned.map(student => student.id);
    
    const result = await updateStudentAssignments(className, updatedAssignments, unassigned);
    console.log('Student moved successfully:', result.message);
    
  } catch (error) {
    console.error('Failed to move student:', error);
  }
}
```

## Performance Considerations

### Query Optimization
- **Eager Loading**: Includes related group data in single queries
- **Indexing**: Proper indexing on foreign key fields
- **Batch Updates**: Efficient handling of multiple assignment updates

### Data Validation
- **Input Validation**: Validates all required fields before processing
- **Referential Integrity**: Ensures valid student and group references
- **Data Consistency**: Maintains consistent assignment state

## Security Considerations

- **Input Validation**: All parameters are validated before processing
- **Access Control**: Student assignment operations require specific permissions
- **Data Integrity**: Ensures only valid student and group associations
- **Error Handling**: Generic error messages prevent information disclosure

## Related Documentation

- [Schedule API Overview](./README.md) - General schedule API information
- [Schedule Times](./times.md) - Schedule and break time management
- [Teacher Rotation](./teacher-rotation.md) - Teacher rotation schedules
- [Teacher Assignments](./teacher-assignments.md) - Teacher assignment management
- [Turns](./turns.md) - Turn schedule management
- [API Overview](../README.md) - General API information
- [Prisma Documentation](https://www.prisma.io/docs) - Database ORM 