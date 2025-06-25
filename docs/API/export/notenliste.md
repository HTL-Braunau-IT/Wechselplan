# Grade List Export API

The Grade List Export API generates Excel files with macro-enabled functionality for grade lists and student management. This endpoint creates comprehensive Excel workbooks with student groups, schedule data, and teacher assignments using template-based generation.

## Base URL

`/api/export/notenliste`

## Endpoints

### POST /api/export/notenliste

Generates an Excel file with grade list functionality, including student groups, schedule data, and teacher assignments for a specific class and weekday.

#### Request

```http
POST /api/export/notenliste?className=10A&selectedWeekday=1&teacher=John%20Smith
```

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `className` | string | Yes | The name of the class to export (e.g., "10A", "11B") |
| `selectedWeekday` | number | Yes | The weekday number (1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday) |
| `teacher` | string | Yes | The teacher name for the grade list |

#### Response

**Success (200 OK)**

```http
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
Content-Disposition: attachment; filename=notenliste-10A.xlsm

[Excel Binary Data]
```

**Validation Error (400 Bad Request)**

```json
{
  "error": "Selected Weekday is required"
}
```

```json
{
  "error": "Selected Weekday is invalid"
}
```

```json
{
  "error": "Class Name is required"
}
```

**Not Found Error (404 Not Found)**

```json
{
  "error": "Class not found"
}
```

```json
{
  "error": "Schedule not found"
}
```

**Server Error (500 Internal Server Error)**

```json
{
  "error": "Failed to generate Excel file"
}
```

## Data Processing

### Template-Based Generation
The API uses a pre-existing Excel template (`NOTENLISTE.xlsm`) as the base:
- **Template Location**: `src/app/templates/excel/NOTENLISTE.xlsm`
- **Macro-Enabled**: Supports VBA macros for advanced functionality
- **Sheet Structure**: Uses the "DROPDOWNLISTE" worksheet for data population

### Class Data Population
The API populates the following class information:
- **Class Name**: Set in cell R2
- **Class Head**: Set in cell S2 (formatted as "FirstName LastName")
- **Class Lead**: Set in cell T2 (formatted as "FirstName LastName")

### Student Group Organization
Students are organized into groups with the following structure:
- **Group 1**: Column N (header: "Gruppe1_Import")
- **Group 2**: Column O (header: "Grupe2_Import")
- **Group 3**: Column P (header: "Gruppe3_Import")
- **Group 4**: Column Q (header: "Gruppe4_Import")

### Schedule Data Processing
The API processes schedule data to populate:
- **Turnustage Headers**: Group-specific schedule information
- **Teacher Assignments**: AM and PM teacher assignments
- **Date Information**: Schedule dates for each turnus

## Data Models

### Class Export Data

```typescript
interface Class {
  id: number
  name: string
  students: Array<{
    id: number
    firstName: string
    lastName: string
    groupId: number | null
    group?: {
      id: number
      name: string
    }
  }>
  classHead: {
    firstName: string
    lastName: string
  }
  classLead: {
    firstName: string
    lastName: string
  }
}
```

### Schedule Data Structure

```typescript
interface ScheduleData {
  [turnusKey: string]: {
    name: string
    weeks: Array<{
      date: string
      week: string
      isHoliday: boolean
    }>
    holidays: Array<{
      id: number
      name: string
      startDate: string
      endDate: string
      createdAt: string
      updatedAt: string
    }>
  }
}
```

### Student Group Mapping

```typescript
interface StudentGroup {
  name: string      // "LastName FirstName"
  lastName: string  // For sorting purposes
}
```

## Business Logic

### Student Group Processing
```typescript
// Group students by their group ID
const studentsByGroup = class_response.students.reduce<Record<number, { name: string, lastName: string }[]>>((acc, student) => {
  const groupId = student.groupId ?? 0
  acc[groupId] ??= []
  acc[groupId].push({
    name: `${student.lastName} ${student.firstName}`,
    lastName: student.lastName
  })
  return acc
}, {})

// Map group IDs to Excel columns
const groupColumnMap: Record<number, { column: string, header: string }> = {
  1: { column: 'N', header: 'Gruppe1_Import' },
  2: { column: 'O', header: 'Grupe2_Import' },
  3: { column: 'P', header: 'Gruppe3_Import' },
  4: { column: 'Q', header: 'Gruppe4_Import' }
}
```

### Excel Population Logic
```typescript
// Write headers and student names
Object.entries(groupColumnMap).forEach(([groupId, { column, header }]) => {
  sheet.cell(`${column}1`).value(header)
  
  const students = studentsByGroup[Number(groupId)] ?? []
  const sortedStudents = [...students].sort((a, b) => a.lastName.localeCompare(b.lastName))
  
  sortedStudents.forEach((student, studentIndex) => {
    const row = studentIndex + 2
    const cell = `${column}${row}`
    sheet.cell(cell).value(student.name)
  })
})
```

### Schedule Data Integration
The API integrates schedule data with the Excel template:
- **Turnustage Headers**: Populates schedule information for each group
- **Teacher Assignments**: Includes AM and PM teacher information
- **Date Processing**: Handles holiday exclusions and date formatting

## Excel File Structure

### Worksheet Organization
- **DROPDOWNLISTE Sheet**: Main data sheet for grade list functionality
- **Cell Mapping**: Structured cell placement for data population
- **Header Organization**: Clear headers for each data section

### Data Sections
1. **Class Information** (Cells R2-T2)
   - Class name, class head, class lead

2. **Student Groups** (Columns N-Q)
   - Group 1-4 with student names
   - Sorted by last name within groups

3. **Schedule Information** (Additional columns)
   - Turnustage data for each group
   - Teacher assignment information

### Macro Functionality
The Excel file includes VBA macros for:
- **Data Validation**: Ensuring data integrity
- **Automated Calculations**: Grade calculations and statistics
- **User Interface**: Enhanced user experience
- **Data Processing**: Automated data manipulation

## Error Handling

### Validation Errors (400 Bad Request)
- **Missing Weekday**: The `selectedWeekday` parameter is required
- **Invalid Weekday**: Weekday must be a number between 1 and 5
- **Missing Class Name**: The `className` parameter is required

### Not Found Errors (404 Not Found)
- **Class Not Found**: The specified class does not exist
- **Schedule Not Found**: No schedule exists for the class and weekday

### Server Errors (500 Internal Server Error)
- **Template Errors**: Excel template file access issues
- **Excel Generation Failures**: XlsxPopulate library errors
- **Data Processing Errors**: Schedule data processing failures

### Error Logging
All errors are logged with additional context:
- Location: `api/export/notenliste`
- Type: `grade-list-export`
- Extra context for debugging

## Example Usage

### Generate Grade List Excel File

```bash
curl -X POST \
  "http://localhost:3000/api/export/notenliste?className=10A&selectedWeekday=1&teacher=John%20Smith" \
  -H "Authorization: Bearer <jwt-token>" \
  --output notenliste-10A.xlsm
```

### Using JavaScript

```javascript
async function generateGradeListExcel(className, weekday, teacher) {
  try {
    const params = new URLSearchParams({
      className: className,
      selectedWeekday: weekday.toString(),
      teacher: teacher
    });
    
    const response = await fetch(`/api/export/notenliste?${params}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to generate Excel file');
    }
    
    // Get the Excel blob
    const excelBlob = await response.blob();
    
    // Create download link
    const url = window.URL.createObjectURL(excelBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `notenliste-${className}.xlsm`;
    link.click();
    
    // Clean up
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error generating Excel file:', error);
    throw error;
  }
}

// Usage
generateGradeListExcel('10A', 1, 'John Smith')
  .then(() => {
    console.log('Excel file generated successfully');
  })
  .catch(error => {
    console.error('Failed to generate Excel file:', error);
  });
```

### Using Python

```python
import requests
from urllib.parse import quote

def generate_grade_list_excel(className, weekday, teacher):
    try:
        params = {
            'className': className,
            'selectedWeekday': weekday,
            'teacher': teacher
        }
        
        response = requests.post(
            'http://localhost:3000/api/export/notenliste',
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
        
        # Save the Excel file
        filename = f'notenliste-{className}.xlsm'
        with open(filename, 'wb') as f:
            f.write(response.content)
        
        print(f'Excel file saved as {filename}')
        return filename
        
    except requests.exceptions.RequestException as e:
        print(f"Error generating Excel file: {e}")
        raise

# Usage
try:
    filename = generate_grade_list_excel('10A', 1, 'John Smith')
    print(f"Excel file generated: {filename}")
except Exception as e:
    print(f"Failed to generate Excel file: {e}")
```

## Use Cases

### 1. Teacher Grade List Generation
```javascript
// Generate grade lists for multiple teachers
async function generateTeacherGradeLists(className, weekday, teachers) {
  const results = [];
  
  for (const teacher of teachers) {
    try {
      await generateGradeListExcel(className, weekday, teacher);
      results.push({ teacher, success: true });
    } catch (error) {
      results.push({ teacher, success: false, error: error.message });
    }
  }
  
  return results;
}

// Usage
const teachers = ['John Smith', 'Sarah Johnson', 'Mike Brown'];
generateTeacherGradeLists('10A', 1, teachers)
  .then(results => {
    console.log('Grade list generation results:', results);
  });
```

### 2. Weekly Grade List Distribution
```javascript
// Generate grade lists for each day of the week
async function generateWeeklyGradeLists(className, teacher) {
  const weekdays = [1, 2, 3, 4, 5]; // Monday to Friday
  const results = [];
  
  for (const weekday of weekdays) {
    try {
      await generateGradeListExcel(className, weekday, teacher);
      results.push({ weekday, success: true });
    } catch (error) {
      results.push({ weekday, success: false, error: error.message });
    }
  }
  
  return results;
}

// Usage
generateWeeklyGradeLists('10A', 'John Smith')
  .then(results => {
    console.log('Weekly grade list generation results:', results);
  });
```

### 3. Batch Grade List Generation
```javascript
// Generate grade lists for multiple classes and teachers
async function generateBatchGradeLists(classTeacherMap, weekday) {
  const promises = [];
  
  for (const [className, teachers] of Object.entries(classTeacherMap)) {
    for (const teacher of teachers) {
      promises.push(
        generateGradeListExcel(className, weekday, teacher)
          .catch(error => ({
            className,
            teacher,
            error: error.message
          }))
      );
    }
  }
  
  const results = await Promise.allSettled(promises);
  return results.map((result, index) => {
    const entries = Object.entries(classTeacherMap);
    let classIndex = 0;
    let teacherIndex = 0;
    let currentIndex = 0;
    
    for (const [className, teachers] of entries) {
      if (currentIndex + teachers.length > index) {
        teacherIndex = index - currentIndex;
        return {
          className,
          teacher: teachers[teacherIndex],
          success: result.status === 'fulfilled',
          error: result.status === 'rejected' ? result.reason : null
        };
      }
      currentIndex += teachers.length;
      classIndex++;
    }
  });
}

// Usage
const classTeacherMap = {
  '10A': ['John Smith', 'Sarah Johnson'],
  '10B': ['Mike Brown', 'Lisa Davis']
};
generateBatchGradeLists(classTeacherMap, 1)
  .then(results => {
    console.log('Batch generation results:', results);
  });
```

## Performance Considerations

### Template Loading
- Excel template is loaded once and reused
- Template caching for improved performance
- Efficient memory management for large files

### Data Processing
- Optimized student group processing
- Efficient Excel cell population
- Proper error handling for large datasets

### File Generation
- Streaming response for large Excel files
- Memory optimization during generation
- Proper cleanup of resources

## Security Considerations

- **Input Validation**: All parameters are validated before processing
- **Template Security**: Excel template is stored securely
- **Access Control**: Grade list generation may require specific permissions
- **Data Privacy**: Student information is handled securely

## Related Documentation

- [Export API Overview](./README.md) - General export API information
- [PDF Schedule Export](./index.md) - Main PDF export functionality
- [Schedule Dates Export](./schedule-dates.md) - Weekday-specific exports
- [Excel Export](./excel.md) - General Excel export functionality
- [API Overview](../README.md) - General API information
- [XlsxPopulate Documentation](https://github.com/dtjohnson/xlsx-populate) - Excel manipulation library 