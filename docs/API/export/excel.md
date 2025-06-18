# Excel Export API

The Excel Export API generates Excel files with comprehensive schedule and group data for classes. This endpoint creates dynamic Excel workbooks with student groups, schedule information, and teacher assignments using the XLSX library.

## Base URL

`/api/export/excel`

## Endpoints

### POST /api/export/excel

Generates an Excel file with comprehensive schedule data, including student groups, schedule information, and teacher assignments for a specific class and weekday.

#### Request

```http
POST /api/export/excel?className=10A&selectedWeekday=1
```

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `className` | string | Yes | The name of the class to export (e.g., "10A", "11B") |
| `selectedWeekday` | number | Yes | The weekday number (1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday) |

#### Response

**Success (200 OK)**

```http
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
Content-Disposition: attachment; filename=export-10A.xlsx

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

### Dynamic Workbook Creation
The API creates Excel workbooks dynamically using the XLSX library:
- **New Workbook**: Creates a fresh workbook for each export
- **Worksheet Structure**: Organizes data in a single comprehensive worksheet
- **Cell Formatting**: Applies proper data types and formatting

### Student Group Organization
Students are organized into groups with the following structure:
- **Column B**: Group 1 students
- **Column C**: Group 2 students
- **Column D**: Group 3 students
- **Column E**: Group 4 students

### Schedule Data Integration
The API processes and integrates comprehensive schedule data:
- **Turnustage Headers**: Schedule information for each group (Columns I-R)
- **Turn Combinations**: Combined turnus information (Columns S-AG)
- **Date Processing**: Schedule dates with holiday exclusions

## Data Models

### Class Export Data

```typescript
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
  students: Array<{
    id: number
    firstName: string
    lastName: string
    groupId: number | null
  }>
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

### Excel Cell Data

```typescript
interface ExcelCell {
  v: string | number  // Cell value
  t: 's' | 'n'        // Cell type (string or number)
}
```

## Business Logic

### Student Group Processing
```typescript
// Group students by their group ID
const studentsByGroup = class_response.students.reduce<Record<number, { name: string }[]>>((acc, student) => {
  const groupId = student.groupId ?? 0
  acc[groupId] ??= []
  acc[groupId].push({
    name: `${student.lastName} ${student.firstName}`
  })
  return acc
}, {})

// Fill in the student groups (columns B-E)
Object.entries(studentsByGroup).forEach(([, students], index) => {
  students.forEach((student, studentIndex) => {
    const cell = XLSX.utils.encode_cell({ r: studentIndex, c: index + 1 }) // Start from column B (index 1)
    worksheet[cell] = { v: student.name, t: 's' } // Explicitly set type as string
    maxRow = Math.max(maxRow, studentIndex)
    maxCol = Math.max(maxCol, index + 1)
  })
})
```

### Header Organization
```typescript
// Add class information
worksheet.F1 = { v: class_response.name, t: 's' } // Class name
const teacherName = class_response.classHead 
  ? `${class_response.classHead.firstName} ${class_response.classHead.lastName}`
  : ''
const leadName = class_response.classLead
  ? `${class_response.classLead.firstName} ${class_response.classLead.lastName}`
  : ''
worksheet.G1 = { v: teacherName, t: 's' } // Class teacher
worksheet.H1 = { v: leadName, t: 's' } // Class lead

// Add Turnustage headers (columns I-R)
const turnustageHeaders = [
  'Turnustage Gruppe 1', 'Turnustage Gruppe 2', 'Turnustage Gruppe 3', 'Turnustage Gruppe 4',
  'Turnustage Gruppe 5', 'Turnustage Gruppe 6', 'Turnustage Gruppe 7', 'Turnustage Gruppe 8',
  'Lehrer Vormittag', 'Lehrer Nachmittag'
]

// Add turn combination headers starting from column S
const turnCombinationHeaders = [
  'Turnus 1+2', 'Turnus 1+3', 'Turnus 1+4', 'Turnus 1+5', 'Turnus 1+7', 'Turnus 1+8',
  'Turnus 2+4', 'Turnus 2+6', 'Turnus 2+7', 'Turnus 2+8',
  'Turnus 3+4', 'Turnus 3+5', 'Turnus 3+6', 'Turnus 3+7', 'Turnus 3+8',
  'Turnus 4+5', 'Turnus 4+6', 'Turnus 4+7', 'Turnus 4+8',
  'Turnus 5+6', 'Turnus 5+7', 'Turnus 5+8',
  'Turnus 6+7', 'Turnus 6+8',
  'Turnus 7+8'
]
```

### Schedule Data Processing
```typescript
// Process schedule data for turns
if (schedule.scheduleData) {
  const scheduleData = schedule.scheduleData as unknown as ScheduleData
  
  // Process each turnus
  Object.entries(scheduleData).forEach(([, turnus], turnusIndex) => {
    if (turnus.weeks) {
      // Filter out holidays and sort dates
      const validDates = turnus.weeks
        .filter(week => !week.isHoliday)
        .sort((a, b) => {
          const [dayA, monthA, yearA] = a.date.split('.').map(Number)
          const [dayB, monthB, yearB] = b.date.split('.').map(Number)
          if (!dayA || !monthA || !yearA || !dayB || !monthB || !yearB) return 0
          return new Date(yearA, monthA - 1, dayA).getTime() - new Date(yearB, monthB - 1, dayB).getTime()
        })

      // Write dates to the worksheet starting from row 3
      validDates.forEach((week, dateIndex) => {
        const cell = XLSX.utils.encode_cell({ r: dateIndex + 2, c: turnusIndex + 8 }) // Start from column I (index 8), row 3 (index 2)
        worksheet[cell] = { v: week.date, t: 's' }
        maxRow = Math.max(maxRow, dateIndex + 2)
        maxCol = Math.max(maxCol, turnusIndex + 8)
      })
    }
  })
}
```

## Excel File Structure

### Worksheet Layout
- **Row 1**: Headers and class information
- **Row 2**: Student data starts
- **Column A**: Reserved for row headers
- **Columns B-E**: Student groups
- **Column F**: Class name
- **Column G**: Class teacher
- **Column H**: Class lead
- **Columns I-R**: Turnustage headers
- **Columns S-AG**: Turn combination headers

### Data Organization
1. **Student Groups** (Columns B-E)
   - Group 1-4 with student names
   - Sorted by last name within groups

2. **Class Information** (Columns F-H)
   - Class name, class head, class lead

3. **Schedule Data** (Columns I-AG)
   - Turnustage information for each group
   - Turn combination data
   - Date information for each turnus

### Cell Formatting
- **String Values**: Explicitly set as string type (`t: 's'`)
- **Numeric Values**: Set as number type (`t: 'n'`)
- **Proper Encoding**: Uses XLSX utility functions for cell encoding

## Error Handling

### Validation Errors (400 Bad Request)
- **Missing Weekday**: The `selectedWeekday` parameter is required
- **Invalid Weekday**: Weekday must be a number between 1 and 5
- **Missing Class Name**: The `className` parameter is required

### Not Found Errors (404 Not Found)
- **Class Not Found**: The specified class does not exist
- **Schedule Not Found**: No schedule exists for the class and weekday

### Server Errors (500 Internal Server Error)
- **Excel Generation Failures**: XLSX library errors
- **Data Processing Errors**: Schedule data processing failures
- **Memory Issues**: Large data processing failures

### Error Logging
All errors are logged with additional context:
- Location: `api/export/excel`
- Type: `excel-export`
- Extra context for debugging

## Example Usage

### Generate Excel File

```bash
curl -X POST \
  "http://localhost:3000/api/export/excel?className=10A&selectedWeekday=1" \
  -H "Authorization: Bearer <jwt-token>" \
  --output export-10A.xlsx
```

### Using JavaScript

```javascript
async function generateExcelFile(className, weekday) {
  try {
    const params = new URLSearchParams({
      className: className,
      selectedWeekday: weekday.toString()
    });
    
    const response = await fetch(`/api/export/excel?${params}`, {
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
    link.download = `export-${className}.xlsx`;
    link.click();
    
    // Clean up
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error generating Excel file:', error);
    throw error;
  }
}

// Usage
generateExcelFile('10A', 1)
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

def generate_excel_file(className, weekday):
    try:
        params = {
            'className': className,
            'selectedWeekday': weekday
        }
        
        response = requests.post(
            'http://localhost:3000/api/export/excel',
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
        filename = f'export-{className}.xlsx'
        with open(filename, 'wb') as f:
            f.write(response.content)
        
        print(f'Excel file saved as {filename}')
        return filename
        
    except requests.exceptions.RequestException as e:
        print(f"Error generating Excel file: {e}")
        raise

# Usage
try:
    filename = generate_excel_file('10A', 1)
    print(f"Excel file generated: {filename}")
except Exception as e:
    print(f"Failed to generate Excel file: {e}")
```

## Use Cases

### 1. Weekly Schedule Export
```javascript
// Generate Excel files for each day of the week
async function generateWeeklyExcelFiles(className) {
  const weekdays = [1, 2, 3, 4, 5]; // Monday to Friday
  const results = [];
  
  for (const weekday of weekdays) {
    try {
      await generateExcelFile(className, weekday);
      results.push({ weekday, success: true });
    } catch (error) {
      results.push({ weekday, success: false, error: error.message });
    }
  }
  
  return results;
}

// Usage
generateWeeklyExcelFiles('10A')
  .then(results => {
    console.log('Weekly Excel generation results:', results);
  });
```

### 2. Batch Excel Generation
```javascript
// Generate Excel files for multiple classes
async function generateBatchExcelFiles(classNames, weekday) {
  const promises = classNames.map(className => 
    generateExcelFile(className, weekday)
      .catch(error => ({
        className,
        error: error.message
      }))
  );
  
  const results = await Promise.allSettled(promises);
  return results.map((result, index) => ({
    className: classNames[index],
    success: result.status === 'fulfilled',
    error: result.status === 'rejected' ? result.reason : null
  }));
}

// Usage
const classes = ['10A', '10B', '11A', '11B'];
generateBatchExcelFiles(classes, 1)
  .then(results => {
    console.log('Batch Excel generation results:', results);
  });
```

### 3. Schedule Analysis Export
```javascript
// Generate Excel files for schedule analysis
async function generateScheduleAnalysis(className, weekdays) {
  const results = [];
  
  for (const weekday of weekdays) {
    try {
      await generateExcelFile(className, weekday);
      results.push({ weekday, success: true });
    } catch (error) {
      results.push({ weekday, success: false, error: error.message });
    }
  }
  
  return results;
}

// Usage
const analysisWeekdays = [1, 3, 5]; // Monday, Wednesday, Friday
generateScheduleAnalysis('10A', analysisWeekdays)
  .then(results => {
    console.log('Schedule analysis results:', results);
  });
```

## Performance Considerations

### Memory Management
- Efficient workbook creation with proper cell encoding
- Memory optimization for large datasets
- Proper cleanup of resources

### Data Processing
- Optimized student group processing
- Efficient schedule data integration
- Proper error handling for large datasets

### File Generation
- Streaming response for large Excel files
- Optimized cell population algorithms
- Efficient header organization

## Security Considerations

- **Input Validation**: All parameters are validated before processing
- **Access Control**: Excel generation may require specific permissions
- **Data Privacy**: Student and schedule information is handled securely
- **Error Handling**: Sensitive data is not exposed in error messages

## Related Documentation

- [Export API Overview](./README.md) - General export API information
- [PDF Schedule Export](./index.md) - Main PDF export functionality
- [Schedule Dates Export](./schedule-dates.md) - Weekday-specific exports
- [Grade List Export](./notenliste.md) - Excel grade list generation
- [API Overview](../README.md) - General API information
- [XLSX Documentation](https://github.com/SheetJS/sheetjs) - Excel manipulation library 