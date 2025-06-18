# Schedule Data API

The Schedule Data API retrieves comprehensive schedule data for teachers, including schedules, students, teacher rotations, assignments, and class information for a specific weekday.

## Base URL

`/api/schedules/data`

## Endpoints

### GET /api/schedules/data

Retrieves comprehensive schedule data for a teacher, including schedules, students, teacher rotations, assignments, and class information for a specific weekday.

#### Request

```http
GET /api/schedules/data?teacher=john.doe&weekday=1
```

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `teacher` | string | Yes | The teacher's username |
| `weekday` | string | No | The weekday to filter by (0-6, defaults to '0') |

#### Response

**Success (200 OK)**

```json
{
  "schedules": [
    [
      {
        "id": "1",
        "name": "Monday Schedule",
        "description": "Regular Monday schedule",
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
        "additionalInfo": null,
        "createdAt": "2024-01-15T10:00:00.000Z",
        "updatedAt": "2024-01-15T10:00:00.000Z"
      }
    ]
  ],
  "students": [
    [
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
      }
    ]
  ],
  "teacherRotation": [
    {
      "id": "rotation-1",
      "classId": 1,
      "teacherId": "teacher-1",
      "week": 1,
      "period": "AM",
      "createdAt": "2024-01-15T10:00:00.000Z",
      "updatedAt": "2024-01-15T10:00:00.000Z"
    }
  ],
  "assignments": [
    {
      "id": "assignment-1",
      "classId": 1,
      "teacherId": "teacher-1",
      "subjectId": "subject-1",
      "groupId": "group-1",
      "period": "AM",
      "createdAt": "2024-01-15T10:00:00.000Z",
      "updatedAt": "2024-01-15T10:00:00.000Z"
    }
  ],
  "classdata": [
    {
      "id": 1,
      "name": "10A",
      "classHead": "Jane Smith",
      "classLead": "Mike Johnson"
    }
  ]
}
```

**Validation Error (400 Bad Request)**

```json
{
  "error": "Teacher username is required"
}
```

**Teacher Not Found (200 OK with error)**

```json
{
  "error": "Teacher not found"
}
```

**No Classes Assigned (200 OK with error)**

```json
{
  "error": "No classes assigned to teacher"
}
```

**No Teacher Rotation (200 OK with error)**

```json
{
  "error": "No teacher rotation found"
}
```

**No Students Found (200 OK with error)**

```json
{
  "error": "No students found"
}
```

**No Valid Schedules (200 OK with empty data)**

```json
{
  "schedules": [],
  "students": [],
  "teacherRotation": [],
  "assignments": [],
  "classdata": []
}
```

## Data Processing

### Teacher Schedule Data Retrieval Process
The API performs the following operations:
1. **Teacher Validation**: Validates that the teacher exists by username
2. **Assignment Retrieval**: Fetches all teacher assignments
3. **Rotation Retrieval**: Fetches teacher rotation data
4. **Class Data Collection**: Gathers class information including class heads and leads
5. **Schedule Retrieval**: Fetches schedules for each class on the specified weekday
6. **Student Retrieval**: Fetches students for each class
7. **Assignment Filtering**: Filters assignments to only include those with valid schedules
8. **Response**: Returns comprehensive aggregated data

### Data Aggregation Logic
- **Schedules**: Array of schedule arrays (one per class)
- **Students**: Array of student arrays (one per class)
- **Teacher Rotation**: All rotation data for the teacher
- **Assignments**: Filtered assignments for classes with valid schedules
- **Class Data**: Class information with head and lead names

## Data Models

### Teacher Schedule Data Response

```typescript
interface TeacherScheduleData {
  schedules: Schedule[][]
  students: Student[][]
  teacherRotation: TeacherRotation[]
  assignments: TeacherAssignment[]
  classdata: Array<{
    id: number
    name: string
    classHead: string | null
    classLead: string | null
  }>
}
```

### Database Models

```typescript
interface Teacher {
  id: string
  username: string
  name: string
  email: string
}

interface TeacherAssignment {
  id: string
  classId: number
  teacherId: string
  subjectId: string
  groupId: string
  period: 'AM' | 'PM'
}

interface TeacherRotation {
  id: string
  classId: number
  teacherId: string
  week: number
  period: 'AM' | 'PM'
}

interface Class {
  id: number
  name: string
  classHead: {
    firstName: string
    lastName: string
  } | null
  classLead: {
    firstName: string
    lastName: string
  } | null
}

interface Student {
  id: string
  name: string
  classId: number
  groupId: string | null
}
```

## Business Logic

### Teacher Lookup
```typescript
const teacher = await prisma.teacher.findUnique({
  where: {
    username: teacherUsername
  }
})

if (!teacher) {
  return NextResponse.json({ error: 'Teacher not found' }, { status: 200 })
}
```

### Assignment Retrieval
```typescript
const assignments = await prisma.teacherAssignment.findMany({
  where: {
    teacherId: teacher.id
  }
})

if (!assignments || assignments.length === 0) {
  return NextResponse.json({ error: 'No classes assigned to teacher' }, { status: 200 })
}
```

### Class Data Collection
```typescript
const classIds = [...new Set(assignments.map(assignment => assignment.classId))]
const classdata = []

for (const classId of classIds) {
  const classInfo = await prisma.class.findUnique({
    where: { id: classId },
    include: {
      classHead: {
        select: {
          firstName: true,
          lastName: true
        }
      },
      classLead: {
        select: {
          firstName: true,
          lastName: true
        }
      }
    }
  })
  
  if (classInfo) {
    classdata.push({
      id: classInfo.id,
      name: classInfo.name,
      classHead: classInfo.classHead ? 
        `${classInfo.classHead.firstName} ${classInfo.classHead.lastName}` : null,
      classLead: classInfo.classLead ? 
        `${classInfo.classLead.firstName} ${classInfo.classLead.lastName}` : null
    })
  }
}
```

### Schedule and Student Retrieval
```typescript
const schedules = []
const students = []
const validClassIds = new Set<number>()

for (const classId of classIds) {
  const schedule = await prisma.schedule.findFirst({
    where: {
      classId: classId,
      selectedWeekday: parseInt(currentWeekday)
    },
    orderBy: {
      createdAt: 'desc'
    }
  })

  if (schedule) {
    schedules.push([schedule])
    validClassIds.add(classId)
  } else {
    schedules.push([])
  }
  
  const student = await prisma.student.findMany({
    where: { classId: classId }
  })
  
  if (student) {
    students.push(student)
  }
}
```

### Assignment Filtering
```typescript
const filteredAssignments = assignments.filter(assignment => 
  validClassIds.has(assignment.classId)
)
```

## Database Schema

### Teacher Table
```sql
CREATE TABLE teacher (
  id VARCHAR(255) PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

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

### Teacher Rotation Table
```sql
CREATE TABLE teacher_rotation (
  id VARCHAR(255) PRIMARY KEY,
  classId INT NOT NULL,
  teacherId VARCHAR(255) NOT NULL,
  week INT NOT NULL,
  period ENUM('AM', 'PM') NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (classId) REFERENCES class(id),
  FOREIGN KEY (teacherId) REFERENCES teacher(id)
);
```

### Class Table
```sql
CREATE TABLE class (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL UNIQUE,
  classHeadId VARCHAR(255),
  classLeadId VARCHAR(255),
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (classHeadId) REFERENCES teacher(id),
  FOREIGN KEY (classLeadId) REFERENCES teacher(id)
);
```

## Error Handling

### Validation Errors (400 Bad Request)
- **Missing Teacher Username**: The `teacher` parameter is required

### Business Logic Errors (200 OK with error message)
- **Teacher Not Found**: The specified teacher does not exist
- **No Classes Assigned**: The teacher has no class assignments
- **No Teacher Rotation**: No rotation data exists for the teacher
- **No Students Found**: No students exist in the assigned classes

### Data Structure Responses
- **No Valid Schedules**: Returns empty data structure when no schedules exist for the weekday
- **Successful Retrieval**: Returns comprehensive data structure with all requested information

### Error Logging
All errors are logged with additional context:
- Location: `api/schedules/data`
- Type: `schedule_data_error`
- Extra context including teacher username and weekday

## Example Usage

### Retrieve Teacher Schedule Data

```bash
curl -X GET \
  "http://localhost:3000/api/schedules/data?teacher=john.doe&weekday=1" \
  -H "Authorization: Bearer <jwt-token>"
```

### Using JavaScript

```javascript
async function getTeacherScheduleData(teacherUsername, weekday = '0') {
  try {
    const params = new URLSearchParams({
      teacher: teacherUsername,
      weekday: weekday
    });
    
    const response = await fetch(`/api/schedules/data?${params}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch teacher schedule data');
    }
    
    const data = await response.json();
    
    // Check for business logic errors
    if (data.error) {
      throw new Error(data.error);
    }
    
    return data;
  } catch (error) {
    console.error('Error fetching teacher schedule data:', error);
    throw error;
  }
}

// Example usage
getTeacherScheduleData('john.doe', '1')
  .then(data => {
    console.log('Schedules:', data.schedules);
    console.log('Students:', data.students);
    console.log('Teacher Rotation:', data.teacherRotation);
    console.log('Assignments:', data.assignments);
    console.log('Class Data:', data.classdata);
  })
  .catch(error => {
    console.error('Failed to get teacher schedule data:', error);
  });
```

### Using Python

```python
import requests

def get_teacher_schedule_data(teacher_username, weekday='0'):
    try:
        params = {
            'teacher': teacher_username,
            'weekday': weekday
        }
        
        response = requests.get(
            'http://localhost:3000/api/schedules/data',
            params=params,
            headers={'Authorization': f'Bearer {token}'}
        )
        
        response.raise_for_status()
        
        data = response.json()
        
        # Check for business logic errors
        if 'error' in data:
            raise Exception(data['error'])
        
        return data
        
    except requests.exceptions.RequestException as e:
        print(f"Error fetching teacher schedule data: {e}")
        raise

# Example usage
try:
    data = get_teacher_schedule_data('john.doe', '1')
    print(f"Schedules: {data['schedules']}")
    print(f"Students: {data['students']}")
    print(f"Teacher Rotation: {data['teacherRotation']}")
    print(f"Assignments: {data['assignments']}")
    print(f"Class Data: {data['classdata']}")
except Exception as e:
    print(f"Failed to get teacher schedule data: {e}")
```

## Use Cases

### 1. Display Teacher Schedule Overview
```javascript
// Display comprehensive schedule overview for a teacher
async function displayTeacherScheduleOverview(teacherUsername, weekday = '0') {
  try {
    const data = await getTeacherScheduleData(teacherUsername, weekday);
    
    console.log(`Teacher Schedule Overview for ${teacherUsername}:`);
    console.log('===============================================');
    
    // Display class information
    data.classdata.forEach((classInfo, index) => {
      console.log(`\nClass: ${classInfo.name}`);
      console.log(`Class Head: ${classInfo.classHead || 'Not assigned'}`);
      console.log(`Class Lead: ${classInfo.classLead || 'Not assigned'}`);
      
      // Display schedule for this class
      if (data.schedules[index] && data.schedules[index].length > 0) {
        const schedule = data.schedules[index][0];
        console.log(`Schedule: ${schedule.name}`);
        console.log(`Period: ${schedule.startDate} to ${schedule.endDate}`);
      } else {
        console.log('Schedule: No schedule for this weekday');
      }
      
      // Display students
      if (data.students[index] && data.students[index].length > 0) {
        console.log(`Students (${data.students[index].length}):`);
        data.students[index].forEach(student => {
          console.log(`  - ${student.name} (Group: ${student.groupId || 'Unassigned'})`);
        });
      } else {
        console.log('Students: No students found');
      }
    });
    
    // Display assignments
    if (data.assignments.length > 0) {
      console.log('\nAssignments:');
      data.assignments.forEach(assignment => {
        console.log(`  - Class ${assignment.classId}, Period: ${assignment.period}`);
      });
    }
    
  } catch (error) {
    console.error('Failed to display teacher schedule overview:', error);
  }
}
```

### 2. Validate Teacher Workload
```javascript
// Validate teacher workload for a specific weekday
async function validateTeacherWorkload(teacherUsername, weekday = '0') {
  try {
    const data = await getTeacherScheduleData(teacherUsername, weekday);
    
    const workload = {
      totalClasses: data.classdata.length,
      totalStudents: data.students.flat().length,
      totalAssignments: data.assignments.length,
      rotationWeeks: [...new Set(data.teacherRotation.map(r => r.week))],
      periods: [...new Set(data.assignments.map(a => a.period))]
    };
    
    // Calculate workload metrics
    const averageStudentsPerClass = workload.totalStudents / workload.totalClasses;
    const assignmentsPerPeriod = workload.totalAssignments / workload.periods.length;
    
    const validation = {
      ...workload,
      averageStudentsPerClass: Math.round(averageStudentsPerClass * 100) / 100,
      assignmentsPerPeriod: Math.round(assignmentsPerPeriod * 100) / 100,
      manageable: workload.totalClasses <= 5 && averageStudentsPerClass <= 30,
      recommendations: []
    };
    
    if (workload.totalClasses > 5) {
      validation.recommendations.push('Consider reducing number of classes');
    }
    
    if (averageStudentsPerClass > 30) {
      validation.recommendations.push('Consider splitting large classes');
    }
    
    return validation;
  } catch (error) {
    console.error('Failed to validate teacher workload:', error);
    return null;
  }
}
```

### 3. Generate Teacher Report
```javascript
// Generate a comprehensive report for a teacher
async function generateTeacherReport(teacherUsername, weekday = '0') {
  try {
    const data = await getTeacherScheduleData(teacherUsername, weekday);
    
    const report = {
      teacher: teacherUsername,
      weekday: weekday,
      summary: {
        totalClasses: data.classdata.length,
        totalStudents: data.students.flat().length,
        totalAssignments: data.assignments.length,
        classesWithSchedules: data.schedules.filter(s => s.length > 0).length
      },
      classes: data.classdata.map((classInfo, index) => ({
        name: classInfo.name,
        classHead: classInfo.classHead,
        classLead: classInfo.classLead,
        studentCount: data.students[index] ? data.students[index].length : 0,
        hasSchedule: data.schedules[index] && data.schedules[index].length > 0,
        assignments: data.assignments.filter(a => {
          const classId = data.classdata[index].id;
          return a.classId === classId;
        })
      })),
      rotation: data.teacherRotation,
      generatedAt: new Date().toISOString()
    };
    
    return report;
  } catch (error) {
    console.error('Failed to generate teacher report:', error);
    throw error;
  }
}
```

## Performance Considerations

### Query Optimization
- **Multiple Queries**: Uses separate queries for different data types
- **Eager Loading**: Includes related data where needed
- **Filtering**: Filters assignments based on valid schedules
- **Indexing**: Proper indexing on foreign key fields

### Data Aggregation
- **Efficient Processing**: Processes data in logical batches
- **Memory Management**: Handles large datasets efficiently
- **Error Handling**: Graceful handling of missing data

## Security Considerations

- **Input Validation**: Validates teacher username parameter
- **Access Control**: Teacher data operations require specific permissions
- **Data Privacy**: Ensures only authorized access to teacher and student data
- **Error Handling**: Generic error messages prevent information disclosure

## Related Documentation

- [Schedules API Overview](./README.md) - General schedules API information
- [Main Schedules](./index.md) - Core schedule management endpoints
- [Schedule Times](./times.md) - Schedule and break time management
- [All Schedules](./all.md) - Bulk schedule retrieval
- [PDF Data](./pdf-data.md) - Student data for PDF generation
- [Assignments](./assignments.md) - Teacher assignment retrieval
- [API Overview](../README.md) - General API information
- [Prisma Documentation](https://www.prisma.io/docs) - Database ORM 