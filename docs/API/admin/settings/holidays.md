# Holidays API

The Holidays API manages school holiday records for the application. This endpoint provides functionality to create, retrieve, and delete school holidays, including bulk operations for efficient holiday management.

## Base URL

`/api/settings/holidays`

## Endpoints

### GET /api/settings/holidays

Retrieves all school holiday records, ordered by start date.

#### Request

```http
GET /api/settings/holidays
```

#### Response

**Success (200 OK)**

```json
[
  {
    "id": 1,
    "name": "Christmas Break",
    "startDate": "2024-12-23T00:00:00.000Z",
    "endDate": "2024-12-27T00:00:00.000Z",
    "createdAt": "2024-01-15T10:00:00.000Z",
    "updatedAt": "2024-01-15T10:00:00.000Z"
  },
  {
    "id": 2,
    "name": "Easter Break",
    "startDate": "2024-03-25T00:00:00.000Z",
    "endDate": "2024-04-05T00:00:00.000Z",
    "createdAt": "2024-01-15T10:00:00.000Z",
    "updatedAt": "2024-01-15T10:00:00.000Z"
  },
  {
    "id": 3,
    "name": "Summer Vacation",
    "startDate": "2024-07-01T00:00:00.000Z",
    "endDate": "2024-08-31T00:00:00.000Z",
    "createdAt": "2024-01-15T10:00:00.000Z",
    "updatedAt": "2024-01-15T10:00:00.000Z"
  }
]
```

**Server Error (500 Internal Server Error)**

```json
{
  "error": "Failed to fetch holidays"
}
```

### POST /api/settings/holidays

Creates a new school holiday record.

#### Request

```http
POST /api/settings/holidays
Content-Type: application/json

{
  "name": "Christmas Break",
  "startDate": "2024-12-23",
  "endDate": "2024-12-27"
}
```

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | The name of the holiday |
| `startDate` | string | Yes | Start date in YYYY-MM-DD format |
| `endDate` | string | Yes | End date in YYYY-MM-DD format |

#### Response

**Success (200 OK)**

```json
{
  "id": 1,
  "name": "Christmas Break",
  "startDate": "2024-12-23T00:00:00.000Z",
  "endDate": "2024-12-27T00:00:00.000Z",
  "createdAt": "2024-01-15T10:00:00.000Z",
  "updatedAt": "2024-01-15T10:00:00.000Z"
}
```

**Validation Error (400 Bad Request)**

```json
{
  "error": "Missing required fields"
}
```

**Invalid Date Format (400 Bad Request)**

```json
{
  "error": "Invalid date format"
}
```

**Invalid Date Order (400 Bad Request)**

```json
{
  "error": "End date must be after start date"
}
```

**Server Error (500 Internal Server Error)**

```json
{
  "error": "Failed to create holiday"
}
```

### POST /api/settings/holidays/bulk

Creates multiple school holiday records in a single operation.

#### Request

```http
POST /api/settings/holidays/bulk
Content-Type: application/json

[
  {
    "name": "Christmas Break",
    "startDate": "2024-12-23",
    "endDate": "2024-12-27"
  },
  {
    "name": "Easter Break",
    "startDate": "2024-03-25",
    "endDate": "2024-04-05"
  },
  {
    "name": "Summer Vacation",
    "startDate": "2024-07-01",
    "endDate": "2024-08-31"
  }
]
```

#### Request Body

Array of holiday objects, each containing:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | The name of the holiday |
| `startDate` | string | Yes | Start date in YYYY-MM-DD format |
| `endDate` | string | Yes | End date in YYYY-MM-DD format |

#### Response

**Success (200 OK)**

```json
[
  {
    "id": 1,
    "name": "Christmas Break",
    "startDate": "2024-12-23T00:00:00.000Z",
    "endDate": "2024-12-27T00:00:00.000Z",
    "createdAt": "2024-01-15T10:00:00.000Z",
    "updatedAt": "2024-01-15T10:00:00.000Z"
  },
  {
    "id": 2,
    "name": "Easter Break",
    "startDate": "2024-03-25T00:00:00.000Z",
    "endDate": "2024-04-05T00:00:00.000Z",
    "createdAt": "2024-01-15T10:00:00.000Z",
    "updatedAt": "2024-01-15T10:00:00.000Z"
  },
  {
    "id": 3,
    "name": "Summer Vacation",
    "startDate": "2024-07-01T00:00:00.000Z",
    "endDate": "2024-08-31T00:00:00.000Z",
    "createdAt": "2024-01-15T10:00:00.000Z",
    "updatedAt": "2024-01-15T10:00:00.000Z"
  }
]
```

**Validation Error (400 Bad Request)**

```json
{
  "error": "Invalid holidays data"
}
```

**Server Error (500 Internal Server Error)**

```json
{
  "error": "Failed to save holidays"
}
```

### DELETE /api/settings/holidays/[id]

Deletes a specific holiday record by ID.

#### Request

```http
DELETE /api/settings/holidays/1
```

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | The ID of the holiday to delete |

#### Response

**Success (200 OK)**

```json
{
  "success": true
}
```

**Server Error (500 Internal Server Error)**

```json
{
  "error": "Failed to delete holiday"
}
```

## Data Processing

### Holiday Retrieval Process
The API performs the following operations:
1. **Database Query**: Retrieves all holiday records from the database
2. **Date Ordering**: Orders holidays by start date in ascending order
3. **Response**: Returns array of holiday records

### Holiday Creation Process
1. **Request Validation**: Validates required fields (name, startDate, endDate)
2. **Date Format Validation**: Ensures dates are in YYYY-MM-DD format
3. **Date Logic Validation**: Ensures end date is after start date
4. **Database Creation**: Creates new holiday record
5. **Response**: Returns the created holiday object

### Bulk Holiday Creation Process
1. **Array Validation**: Validates that request body is a non-empty array
2. **Transaction Processing**: Creates all holidays in a database transaction
3. **Atomic Operation**: Ensures all holidays are created or none are created
4. **Response**: Returns array of created holiday objects

### Holiday Deletion Process
1. **ID Validation**: Validates the holiday ID from path parameters
2. **Database Deletion**: Removes the holiday record from the database
3. **Response**: Returns success confirmation

## Data Models

### Holiday Request

```typescript
interface HolidayRequest {
  name: string
  startDate: string
  endDate: string
}
```

### Holiday Response

```typescript
interface Holiday {
  id: number
  name: string
  startDate: string
  endDate: string
  createdAt: string
  updatedAt: string
}
```

### Bulk Holiday Request

```typescript
interface BulkHolidayRequest {
  name: string
  startDate: string
  endDate: string
}[]
```

## Business Logic

### Date Validation
```typescript
// Validate date format
const dateRegex = /^\d{4}-\d{2}-\d{2}$/
if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
  return NextResponse.json(
    { error: 'Invalid date format' },
    { status: 400 }
  )
}

// Validate date order
const start = new Date(startDate)
const end = new Date(endDate)
if (end < start) {
  return NextResponse.json(
    { error: 'End date must be after start date' },
    { status: 400 }
  )
}
```

### Holiday Creation
```typescript
const holiday = await prisma.schoolHoliday.create({
  data: {
    name,
    startDate: start,
    endDate: end,
  }
})
```

### Bulk Holiday Creation
```typescript
const createdHolidays = await db.$transaction(
  holidays.map(holiday =>
    db.schoolHoliday.create({
      data: {
        name: holiday.name,
        startDate: new Date(holiday.startDate),
        endDate: new Date(holiday.endDate)
      }
    })
  )
)
```

### Holiday Deletion
```typescript
await prisma.schoolHoliday.delete({
  where: {
    id: parseInt(resolvedParams.id)
  }
})
```

## Database Schema

### School Holiday Table
```sql
CREATE TABLE school_holiday (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  startDate DATE NOT NULL,
  endDate DATE NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CHECK (endDate >= startDate)
);
```

## Error Handling

### Validation Errors (400 Bad Request)
- **Missing Required Fields**: All fields (name, startDate, endDate) are required
- **Invalid Date Format**: Dates must be in YYYY-MM-DD format
- **Invalid Date Order**: End date must be after start date
- **Invalid Bulk Data**: Bulk request must be a non-empty array

### Server Errors (500 Internal Server Error)
- **Database Errors**: Connection or query execution failures
- **Creation Failures**: Holiday creation operation failures
- **Deletion Failures**: Holiday deletion operation failures

### Error Logging
All errors are logged with additional context:
- Location: `api/settings/holidays`, `api/settings/holidays/bulk`, or `api/settings/holidays/[id]`
- Type: `fetch-holidays`, `create-holiday`, `save-holidays`, or `delete-holiday`
- Request body for creation errors

## Example Usage

### Retrieve All Holidays

```bash
curl -X GET \
  "http://localhost:3000/api/settings/holidays" \
  -H "Authorization: Bearer <jwt-token>"
```

### Create Single Holiday

```bash
curl -X POST \
  "http://localhost:3000/api/settings/holidays" \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Christmas Break",
    "startDate": "2024-12-23",
    "endDate": "2024-12-27"
  }'
```

### Create Multiple Holidays

```bash
curl -X POST \
  "http://localhost:3000/api/settings/holidays/bulk" \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '[
    {
      "name": "Christmas Break",
      "startDate": "2024-12-23",
      "endDate": "2024-12-27"
    },
    {
      "name": "Easter Break",
      "startDate": "2024-03-25",
      "endDate": "2024-04-05"
    }
  ]'
```

### Delete Holiday

```bash
curl -X DELETE \
  "http://localhost:3000/api/settings/holidays/1" \
  -H "Authorization: Bearer <jwt-token>"
```

### Using JavaScript

```javascript
async function getHolidays() {
  try {
    const response = await fetch('/api/settings/holidays', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch holidays');
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching holidays:', error);
    throw error;
  }
}

async function createHoliday(holidayData) {
  try {
    const response = await fetch('/api/settings/holidays', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(holidayData)
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create holiday');
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error creating holiday:', error);
    throw error;
  }
}

async function createBulkHolidays(holidaysData) {
  try {
    const response = await fetch('/api/settings/holidays/bulk', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(holidaysData)
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create holidays');
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error creating holidays:', error);
    throw error;
  }
}

async function deleteHoliday(holidayId) {
  try {
    const response = await fetch(`/api/settings/holidays/${holidayId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete holiday');
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error deleting holiday:', error);
    throw error;
  }
}

// Example usage
const holidayData = {
  name: 'Christmas Break',
  startDate: '2024-12-23',
  endDate: '2024-12-27'
};

const bulkHolidaysData = [
  {
    name: 'Christmas Break',
    startDate: '2024-12-23',
    endDate: '2024-12-27'
  },
  {
    name: 'Easter Break',
    startDate: '2024-03-25',
    endDate: '2024-04-05'
  }
];

// Get all holidays
getHolidays()
  .then(holidays => {
    console.log('Holidays:', holidays);
  })
  .catch(error => {
    console.error('Failed to get holidays:', error);
  });

// Create single holiday
createHoliday(holidayData)
  .then(holiday => {
    console.log('Holiday created:', holiday);
  })
  .catch(error => {
    console.error('Failed to create holiday:', error);
  });

// Create multiple holidays
createBulkHolidays(bulkHolidaysData)
  .then(holidays => {
    console.log('Holidays created:', holidays);
  })
  .catch(error => {
    console.error('Failed to create holidays:', error);
  });

// Delete holiday
deleteHoliday(1)
  .then(result => {
    console.log('Holiday deleted:', result);
  })
  .catch(error => {
    console.error('Failed to delete holiday:', error);
  });
```

### Using Python

```python
import requests

def get_holidays():
    try:
        response = requests.get(
            'http://localhost:3000/api/settings/holidays',
            headers={'Authorization': f'Bearer {token}'}
        )
        
        response.raise_for_status()
        
        return response.json()
        
    except requests.exceptions.RequestException as e:
        print(f"Error fetching holidays: {e}")
        raise

def create_holiday(holiday_data):
    try:
        response = requests.post(
            'http://localhost:3000/api/settings/holidays',
            json=holiday_data,
            headers={'Authorization': f'Bearer {token}'}
        )
        
        if response.status_code == 400:
            error_data = response.json()
            raise Exception(error_data.get('error', 'Bad request'))
        
        response.raise_for_status()
        
        return response.json()
        
    except requests.exceptions.RequestException as e:
        print(f"Error creating holiday: {e}")
        raise

def create_bulk_holidays(holidays_data):
    try:
        response = requests.post(
            'http://localhost:3000/api/settings/holidays/bulk',
            json=holidays_data,
            headers={'Authorization': f'Bearer {token}'}
        )
        
        if response.status_code == 400:
            error_data = response.json()
            raise Exception(error_data.get('error', 'Bad request'))
        
        response.raise_for_status()
        
        return response.json()
        
    except requests.exceptions.RequestException as e:
        print(f"Error creating holidays: {e}")
        raise

def delete_holiday(holiday_id):
    try:
        response = requests.delete(
            f'http://localhost:3000/api/settings/holidays/{holiday_id}',
            headers={'Authorization': f'Bearer {token}'}
        )
        
        response.raise_for_status()
        
        return response.json()
        
    except requests.exceptions.RequestException as e:
        print(f"Error deleting holiday: {e}")
        raise

# Example usage
holiday_data = {
    'name': 'Christmas Break',
    'startDate': '2024-12-23',
    'endDate': '2024-12-27'
}

bulk_holidays_data = [
    {
        'name': 'Christmas Break',
        'startDate': '2024-12-23',
        'endDate': '2024-12-27'
    },
    {
        'name': 'Easter Break',
        'startDate': '2024-03-25',
        'endDate': '2024-04-05'
    }
]

# Get all holidays
try:
    holidays = get_holidays()
    print(f"Holidays: {holidays}")
except Exception as e:
    print(f"Failed to get holidays: {e}")

# Create single holiday
try:
    holiday = create_holiday(holiday_data)
    print(f"Holiday created: {holiday}")
except Exception as e:
    print(f"Failed to create holiday: {e}")

# Create multiple holidays
try:
    holidays = create_bulk_holidays(bulk_holidays_data)
    print(f"Holidays created: {holidays}")
except Exception as e:
    print(f"Failed to create holidays: {e}")

# Delete holiday
try:
    result = delete_holiday(1)
    print(f"Holiday deleted: {result}")
except Exception as e:
    print(f"Failed to delete holiday: {e}")
```

## Use Cases

### 1. Academic Year Holiday Setup
```javascript
// Set up holidays for an entire academic year
async function setupAcademicYearHolidays(year) {
  const academicHolidays = [
    {
      name: 'Summer Vacation',
      startDate: `${year}-07-01`,
      endDate: `${year}-08-31`
    },
    {
      name: 'Christmas Break',
      startDate: `${year}-12-23`,
      endDate: `${year}-12-27`
    },
    {
      name: 'Easter Break',
      startDate: `${year + 1}-03-25`,
      endDate: `${year + 1}-04-05`
    },
    {
      name: 'Spring Break',
      startDate: `${year + 1}-02-19`,
      endDate: `${year + 1}-02-23`
    }
  ];
  
  try {
    const holidays = await createBulkHolidays(academicHolidays);
    console.log(`Academic year ${year} holidays set up successfully:`, holidays);
    return holidays;
  } catch (error) {
    console.error(`Failed to set up academic year ${year} holidays:`, error);
    throw error;
  }
}
```

### 2. Holiday Calendar Display
```javascript
// Display holidays in a calendar format
async function displayHolidayCalendar() {
  try {
    const holidays = await getHolidays();
    
    console.log('School Holiday Calendar:');
    console.log('========================');
    
    holidays.forEach(holiday => {
      const startDate = new Date(holiday.startDate);
      const endDate = new Date(holiday.endDate);
      const duration = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
      
      console.log(`\n${holiday.name}:`);
      console.log(`  Period: ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`);
      console.log(`  Duration: ${duration} days`);
    });
    
    return holidays;
  } catch (error) {
    console.error('Failed to display holiday calendar:', error);
    throw error;
  }
}
```

### 3. Holiday Validation
```javascript
// Validate holiday data before creation
function validateHolidayData(holidayData) {
  const errors = [];
  
  // Check required fields
  if (!holidayData.name || holidayData.name.trim() === '') {
    errors.push('Name is required');
  }
  
  if (!holidayData.startDate) {
    errors.push('Start date is required');
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(holidayData.startDate)) {
    errors.push('Start date must be in YYYY-MM-DD format');
  }
  
  if (!holidayData.endDate) {
    errors.push('End date is required');
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(holidayData.endDate)) {
    errors.push('End date must be in YYYY-MM-DD format');
  }
  
  // Check date logic
  if (holidayData.startDate && holidayData.endDate) {
    const startDate = new Date(holidayData.startDate);
    const endDate = new Date(holidayData.endDate);
    
    if (endDate < startDate) {
      errors.push('End date must be after start date');
    }
    
    if (startDate < new Date()) {
      errors.push('Start date cannot be in the past');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}
```

## Performance Considerations

### Query Optimization
- **Ordered Retrieval**: Holidays are ordered by start date for efficient display
- **Bulk Operations**: Multiple holidays can be created in a single transaction
- **Indexing**: Proper indexing on date fields for efficient queries

### Data Validation
- **Input Validation**: Comprehensive validation of all input fields
- **Date Validation**: Ensures valid date formats and logical date ranges
- **Transaction Safety**: Bulk operations use database transactions for data consistency

## Security Considerations

- **Input Validation**: All parameters are validated before processing
- **Access Control**: Holiday operations require administrative permissions
- **Data Integrity**: Ensures only valid holiday data is stored
- **Error Handling**: Generic error messages prevent information disclosure

## Related Documentation

- [Settings API Overview](./README.md) - General settings API information
- [Break Times](./break-times.md) - Break time management
- [Schedule Times](./schedule-times.md) - Schedule time management
- [Import](./import.md) - Data import functionality
- [API Overview](../README.md) - General API information
- [Prisma Documentation](https://www.prisma.io/docs) - Database ORM 