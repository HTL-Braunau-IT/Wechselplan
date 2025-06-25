# Schedule Dates Export API

The Schedule Dates Export API generates PDF schedules for specific weekdays, providing detailed turnus information and schedule data for a particular class and day of the week.

## Base URL

`/api/export/schedule-dates`

## Endpoints

### POST /api/export/schedule-dates

Generates a PDF schedule document for a specific class and weekday, including turnus information and schedule data.

#### Request

```http
POST /api/export/schedule-dates?className=10A&selectedWeekday=1
```

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `className` | string | Yes | The name of the class to export (e.g., "10A", "11B") |
| `selectedWeekday` | number | Yes | The weekday number (1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday) |

#### Response

**Success (200 OK)**

```http
Content-Type: application/pdf
Content-Disposition: attachment; filename=schedule-dates-10A.pdf

[PDF Binary Data]
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
  "error": "Failed to generate pdf file"
}
```

## Data Processing

### Weekday Validation
The API validates weekday parameters:
- Must be a valid number between 1 and 5
- 1 = Monday, 2 = Tuesday, 3 = Wednesday, 4 = Thursday, 5 = Friday
- Invalid values return a 400 error

### Class Data Retrieval
- Retrieves class information by name
- Validates that the class exists in the database
- Returns 404 error if class is not found

### Schedule Data Processing
- Finds the most recent schedule for the specified class and weekday
- Validates schedule data structure and format
- Processes turnus information for PDF generation
- Returns 404 error if no schedule is found

### Weekday Mapping
The API maps weekday numbers to German day names:
```typescript
const days = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const weekdayString = days[weekday];
```

## Data Models

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

### Export Request Parameters

```typescript
interface ScheduleDatesExportRequest {
  className: string    // Required: Class name
  selectedWeekday: number  // Required: Weekday (1-5)
}
```

### Schedule Response Data

```typescript
interface ScheduleResponse {
  scheduleData: ScheduleData
  additionalInfo: string | null
}
```

## Business Logic

### Schedule Retrieval
The API retrieves schedules using the following logic:
1. **Class Lookup**: Find class by name
2. **Schedule Query**: Find most recent schedule for class and weekday
3. **Data Validation**: Ensure schedule data is properly formatted
4. **PDF Generation**: Create PDF with schedule and turnus information

### Data Validation
```typescript
// Weekday validation
const weekday = Number(selectedWeekday);
if (isNaN(weekday) || weekday < 1 || weekday > 5) {
  return NextResponse.json({ error: 'Selected Weekday is invalid' }, { status: 400 });
}

// Schedule data validation
const scheduleData = schedule.scheduleData && 
  typeof schedule.scheduleData === 'object' && 
  !Array.isArray(schedule.scheduleData)
    ? schedule.scheduleData
    : {};
```

### PDF Generation Process
1. **Data Preparation**: Process schedule data and weekday information
2. **Component Creation**: Generate `ScheduleTurnusPDF` component with data
3. **PDF Rendering**: Convert component to PDF buffer using React PDF
4. **Response Creation**: Return PDF with proper headers and filename

## PDF Generation

### Layout Components
The PDF is generated using the `ScheduleTurnusPDF` component that includes:
- **Header Section**: Class name and weekday information
- **Schedule Data**: Turnus information and schedule details
- **Date Information**: Specific dates for the selected weekday
- **Additional Information**: Any extra notes or context

### PDF Configuration
- **Format**: A4 portrait orientation
- **Content**: Focused on specific weekday schedule information
- **Layout**: Optimized for turnus and schedule data display
- **Filename**: Includes class name for easy identification

## Error Handling

### Validation Errors (400 Bad Request)
- **Missing Weekday**: The `selectedWeekday` parameter is required
- **Invalid Weekday**: Weekday must be a number between 1 and 5
- **Missing Class Name**: The `className` parameter is required

### Not Found Errors (404 Not Found)
- **Class Not Found**: The specified class does not exist
- **Schedule Not Found**: No schedule exists for the class and weekday

### Server Errors (500 Internal Server Error)
- **PDF Generation Failures**: React PDF renderer errors
- **Database Errors**: Connection or query execution failures
- **Data Processing Errors**: Schedule data processing failures

### Error Logging
All errors are logged with additional context:
- Location: `api/export`
- Type: `export-schedule`
- Extra context for debugging

## Example Usage

### Generate Schedule Dates PDF

```bash
curl -X POST \
  "http://localhost:3000/api/export/schedule-dates?className=10A&selectedWeekday=1" \
  -H "Authorization: Bearer <jwt-token>" \
  --output schedule-dates-10A.pdf
```

### Using JavaScript

```javascript
async function generateScheduleDatesPDF(className, weekday) {
  try {
    const response = await fetch(
      `/api/export/schedule-dates?className=${encodeURIComponent(className)}&selectedWeekday=${weekday}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
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
    link.download = `schedule-dates-${className}.pdf`;
    link.click();
    
    // Clean up
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  }
}

// Usage
generateScheduleDatesPDF('10A', 1) // Monday
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

def generate_schedule_dates_pdf(className, weekday):
    try:
        response = requests.post(
            f'http://localhost:3000/api/export/schedule-dates?className={className}&selectedWeekday={weekday}',
            headers={'Authorization': f'Bearer {token}'}
        )
        
        if response.status_code == 400:
            error_data = response.json()
            raise Exception(error_data.get('error', 'Bad request'))
        elif response.status_code == 404:
            error_data = response.json()
            raise Exception(error_data.get('error', 'Not found'))
        
        response.raise_for_status()
        
        # Save the PDF file
        filename = f'schedule-dates-{className}.pdf'
        with open(filename, 'wb') as f:
            f.write(response.content)
        
        print(f'PDF saved as {filename}')
        return filename
        
    except requests.exceptions.RequestException as e:
        print(f"Error generating PDF: {e}")
        raise

# Usage
try:
    filename = generate_schedule_dates_pdf('10A', 1)  # Monday
    print(f"PDF generated: {filename}")
except Exception as e:
    print(f"Failed to generate PDF: {e}")
```

## Use Cases

### 1. Daily Schedule Distribution
```javascript
// Generate schedules for each day of the week
async function generateWeeklySchedules(className) {
  const weekdays = [1, 2, 3, 4, 5]; // Monday to Friday
  const results = [];
  
  for (const weekday of weekdays) {
    try {
      await generateScheduleDatesPDF(className, weekday);
      results.push({ weekday, success: true });
    } catch (error) {
      results.push({ weekday, success: false, error: error.message });
    }
  }
  
  return results;
}

// Usage
generateWeeklySchedules('10A')
  .then(results => {
    console.log('Weekly schedule generation results:', results);
  });
```

### 2. Specific Day Schedule
```javascript
// Generate schedule for a specific day
async function generateDaySchedule(className, dayName) {
  const dayMap = {
    'monday': 1,
    'tuesday': 2,
    'wednesday': 3,
    'thursday': 4,
    'friday': 5
  };
  
  const weekday = dayMap[dayName.toLowerCase()];
  if (!weekday) {
    throw new Error('Invalid day name');
  }
  
  return generateScheduleDatesPDF(className, weekday);
}

// Usage
generateDaySchedule('10A', 'monday')
  .then(() => {
    console.log('Monday schedule generated');
  });
```

### 3. Batch Schedule Generation
```javascript
// Generate schedules for multiple classes on specific days
async function generateBatchSchedules(classNames, weekdays) {
  const promises = [];
  
  for (const className of classNames) {
    for (const weekday of weekdays) {
      promises.push(
        generateScheduleDatesPDF(className, weekday)
          .catch(error => ({
            className,
            weekday,
            error: error.message
          }))
      );
    }
  }
  
  const results = await Promise.allSettled(promises);
  return results.map((result, index) => {
    const classIndex = Math.floor(index / weekdays.length);
    const weekdayIndex = index % weekdays.length;
    return {
      className: classNames[classIndex],
      weekday: weekdays[weekdayIndex],
      success: result.status === 'fulfilled',
      error: result.status === 'rejected' ? result.reason : null
    };
  });
}

// Usage
const classes = ['10A', '10B'];
const days = [1, 3, 5]; // Monday, Wednesday, Friday
generateBatchSchedules(classes, days)
  .then(results => {
    console.log('Batch generation results:', results);
  });
```

## Performance Considerations

### Data Retrieval Optimization
- Uses efficient database queries with proper indexing
- Retrieves only necessary schedule data
- Implements proper error handling for missing data

### PDF Generation
- Optimized PDF layout for schedule data
- Efficient memory usage during generation
- Proper cleanup of resources

### Caching Strategy
- Consider caching generated PDFs for frequently accessed schedules
- Cache invalidation when schedule data changes
- Temporary storage for large batch operations

## Security Considerations

- **Input Validation**: All parameters are validated before processing
- **Access Control**: PDF generation may require specific permissions
- **Data Privacy**: Schedule data contains sensitive information
- **Error Handling**: Sensitive data is not exposed in error messages

## Related Documentation

- [Export API Overview](./README.md) - General export API information
- [PDF Schedule Export](./index.md) - Main PDF export functionality
- [Grade List Export](./notenliste.md) - Excel grade list generation
- [Excel Export](./excel.md) - General Excel export functionality
- [API Overview](../README.md) - General API information
- [React PDF Documentation](https://react-pdf.org/) - PDF generation library 