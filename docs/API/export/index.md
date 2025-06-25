# PDF Schedule Export API

The PDF Schedule Export API generates comprehensive PDF schedules for classes, including student groups, teacher assignments, and schedule data. This endpoint creates detailed PDF documents using React PDF renderer with custom layouts.

## Base URL

`/api/export`

## Endpoints

### POST /api/export

Generates a PDF schedule document for a specified class, including all student groups, teacher assignments, and schedule information.

#### Request

```http
POST /api/export?className=10A
```

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `className` | string | Yes | The name of the class to export (e.g., "10A", "11B") |

#### Response

**Success (200 OK)**

```http
Content-Type: application/pdf
Content-Disposition: attachment; filename=schedule-10A.pdf

[PDF Binary Data]
```

**Validation Error (400 Bad Request)**

```json
{
  "error": "Class Name is required"
}
```

```json
{
  "error": "Class not found"
}
```

**Server Error (500 Internal Server Error)**

```json
{
  "error": "Failed to generate PDF"
}
```

## Data Processing

### Class Data Retrieval
The API retrieves comprehensive class information including:
- Class details (name, description)
- Class head and lead teacher information
- All students organized by groups
- Teacher assignments for AM and PM periods
- Schedule data with turnus information

### Student Group Organization
- Students are grouped by their `groupId`
- Groups are ordered by group ID
- Students within groups are ordered by last name, then first name
- Maximum student count per group is calculated for layout purposes

### Teacher Assignment Processing
- Teacher assignments are filtered by period (AM/PM)
- Each assignment includes teacher, room, subject, and learning content details
- Assignments are ordered by period and group ID
- Teacher names are formatted as "FirstName LastName"

### Schedule Data Processing
- Schedule data is retrieved from the most recent schedule record
- Turnus information includes start dates, end dates, and day counts
- Holiday information is processed and excluded from calculations
- Schedule data is validated and formatted for PDF generation

## Data Models

### Class Export Data

```typescript
interface ClassExportData {
  id: number
  name: string
  description: string | null
  classHead: {
    firstName: string
    lastName: string
  } | null
  classLead: {
    firstName: string
    lastName: string
  } | null
}
```

### Student Group Data

```typescript
interface StudentGroup {
  id: number
  students: Array<{
    id: number
    firstName: string
    lastName: string
    groupId: number | null
  }>
}
```

### Teacher Assignment Data

```typescript
interface TeacherAssignment {
  id: number
  classId: number
  period: 'AM' | 'PM'
  groupId: number
  teacherId: number
  subjectId: number
  learningContentId: number
  roomId: number
  teacher: {
    firstName: string
    lastName: string
  }
  subject: {
    name: string
  }
  learningContent: {
    name: string
  }
  room: {
    name: string
  }
}
```

### Schedule Data

```typescript
interface ScheduleData {
  [turnusKey: string]: {
    weeks: Array<{
      date: string
      week: string
      isHoliday: boolean
    }>
  }
}
```

## Business Logic

### Group Rotation Logic
The API implements a sophisticated group rotation system:

```typescript
function getGroupForTeacherAndTurn(teacherIdx: number, turnIdx: number, period: 'AM' | 'PM') {
  const groupList = groups
  const teacherList = period === 'AM' ? amAssignments : pmAssignments
  
  if (!groupList[0] || !teacherList[teacherIdx]) return null
  
  // For each turn, rotate the group list
  const rotatedGroups = [...groupList]
  for (let i = 0; i < turnIdx; i++) {
    const temp = rotatedGroups.shift()
    if (temp !== undefined) rotatedGroups.push(temp)
  }
  
  const group = rotatedGroups[teacherIdx]
  return group
}
```

### Turnus Information Extraction
```typescript
function getTurnusInfo(turnKey: string) {
  if (!turns || typeof turns !== 'object') return { start: '', end: '', days: 0 }
  
  const entry = (turns as Record<string, unknown>)[turnKey]
  type TurnusEntry = { weeks: { date: string }[] }
  
  if (!entry || typeof entry !== 'object' || !Array.isArray((entry as TurnusEntry).weeks) || !(entry as TurnusEntry).weeks.length) {
    return { start: '', end: '', days: 0 }
  }
  
  const weeks = (entry as TurnusEntry).weeks
  const start = weeks[0]?.date?.replace(/^-\s*/, '')?.trim() ?? ''
  const end = weeks[weeks.length - 1]?.date?.replace(/^-\s*/, '')?.trim() ?? ''
  const days = weeks.length
  
  return { start, end, days }
}
```

## PDF Generation

### Layout Components
The PDF is generated using a custom `PDFLayout` component that includes:
- **Header Section**: Class name, class head, and class lead information
- **Student Groups**: Organized lists of students by group
- **Schedule Tables**: AM and PM period schedules with teacher assignments
- **Turnus Information**: Date ranges and day counts for each turnus
- **Additional Information**: Any extra notes or information

### PDF Configuration
- **Format**: A4 portrait orientation
- **Font**: System fonts for optimal rendering
- **Layout**: Multi-page document with proper pagination
- **Headers**: Automatic file naming with class name

## Error Handling

### Validation Errors (400 Bad Request)
- **Missing Class Name**: The `className` parameter is required
- **Class Not Found**: The specified class does not exist in the database

### Server Errors (500 Internal Server Error)
- **PDF Generation Failures**: React PDF renderer errors
- **Database Errors**: Connection or query execution failures
- **Memory Issues**: Large data processing failures

### Error Logging
All errors are logged with additional context:
- Location: `api/export`
- Type: `export-schedule` or `pdf-data-error`
- Extra context for debugging

## Example Usage

### Generate PDF Schedule

```bash
curl -X POST \
  "http://localhost:3000/api/export?className=10A" \
  -H "Authorization: Bearer <jwt-token>" \
  --output schedule-10A.pdf
```

### Using JavaScript

```javascript
async function generateSchedulePDF(className) {
  try {
    const response = await fetch(`/api/export?className=${encodeURIComponent(className)}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to generate PDF');
    }
    
    // Get the PDF blob
    const pdfBlob = await response.blob();
    
    // Create download link
    const url = window.URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `schedule-${className}.pdf`;
    link.click();
    
    // Clean up
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  }
}

// Usage
generateSchedulePDF('10A')
  .then(() => {
    console.log('PDF generated successfully');
  })
  .catch(error => {
    console.error('Failed to generate PDF:', error);
  });
```

### Using Python

```python
import requests

def generate_schedule_pdf(className):
    try:
        response = requests.post(
            f'http://localhost:3000/api/export?className={className}',
            headers={'Authorization': f'Bearer {token}'}
        )
        
        if response.status_code == 400:
            error_data = response.json()
            raise Exception(error_data.get('error', 'Bad request'))
        
        response.raise_for_status()
        
        # Save the PDF file
        filename = f'schedule-{className}.pdf'
        with open(filename, 'wb') as f:
            f.write(response.content)
        
        print(f'PDF saved as {filename}')
        return filename
        
    except requests.exceptions.RequestException as e:
        print(f"Error generating PDF: {e}")
        raise

# Usage
try:
    filename = generate_schedule_pdf('10A')
    print(f"PDF generated: {filename}")
except Exception as e:
    print(f"Failed to generate PDF: {e}")
```

## Use Cases

### 1. Class Schedule Distribution
```javascript
// Generate and distribute schedules to teachers
async function distributeSchedules(classNames) {
  const results = [];
  
  for (const className of classNames) {
    try {
      await generateSchedulePDF(className);
      results.push({ className, success: true });
    } catch (error) {
      results.push({ className, success: false, error: error.message });
    }
  }
  
  return results;
}

// Usage
const classes = ['10A', '10B', '11A', '11B'];
distributeSchedules(classes)
  .then(results => {
    console.log('Distribution results:', results);
  });
```

### 2. Batch PDF Generation
```javascript
// Generate PDFs for multiple classes
async function generateBatchPDFs(classNames) {
  const promises = classNames.map(className => 
    generateSchedulePDF(className).catch(error => ({
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
```

### 3. PDF Preview Generation
```javascript
// Generate PDF for preview without download
async function previewSchedulePDF(className) {
  try {
    const response = await fetch(`/api/export?className=${encodeURIComponent(className)}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to generate preview');
    }
    
    const pdfBlob = await response.blob();
    const url = window.URL.createObjectURL(pdfBlob);
    
    // Open in new tab for preview
    window.open(url, '_blank');
    
    return url;
  } catch (error) {
    console.error('Error generating preview:', error);
    throw error;
  }
}
```

## Performance Considerations

### Memory Management
- PDF generation can be memory-intensive for large classes
- Consider implementing streaming for very large documents
- Monitor memory usage during batch operations

### Caching Strategy
- Generated PDFs can be cached for frequently accessed classes
- Cache invalidation should occur when schedule data changes
- Consider implementing PDF pre-generation for common classes

### Optimization
- Database queries are optimized with proper includes
- Student data is processed efficiently with group organization
- PDF layout is optimized for rendering performance

## Security Considerations

- **Input Validation**: Class names are validated before processing
- **Access Control**: PDF generation may require specific permissions
- **File Security**: Generated PDFs contain sensitive student information
- **Error Handling**: Sensitive data is not exposed in error messages

## Related Documentation

- [Export API Overview](./README.md) - General export API information
- [Schedule Dates Export](./schedule-dates.md) - Weekday-specific exports
- [Grade List Export](./notenliste.md) - Excel grade list generation
- [Excel Export](./excel.md) - General Excel export functionality
- [API Overview](../README.md) - General API information
- [React PDF Documentation](https://react-pdf.org/) - PDF generation library 