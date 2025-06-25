# Class by Name API

The Class by Name API allows you to retrieve detailed class information by specifying the class name. This endpoint includes related teacher information for both class head and class lead positions.

## Base URL

`/api/classes/get-by-name`

## Endpoints

### GET /api/classes/get-by-name

Retrieves detailed class information by name, including related teacher details for class head and class lead positions.

#### Request

```http
GET /api/classes/get-by-name?name=10A
```

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | The name of the class to retrieve (e.g., "10A", "11B") |

#### Response

**Success (200 OK)**

```json
{
  "id": 1,
  "name": "10A",
  "description": "Advanced Mathematics Class",
  "classHeadId": 5,
  "classLeadId": 12,
  "classHead": {
    "firstName": "John",
    "lastName": "Smith"
  },
  "classLead": {
    "firstName": "Sarah",
    "lastName": "Johnson"
  }
}
```

**Validation Error (400 Bad Request)**

```json
{
  "error": "Class name is required"
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
  "error": "Failed to fetch class"
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | number | Unique class identifier |
| `name` | string | Class name |
| `description` | string \| null | Class description or null if not provided |
| `classHeadId` | number \| null | ID of the class head teacher or null if unassigned |
| `classLeadId` | number \| null | ID of the class lead teacher or null if unassigned |
| `classHead` | object \| null | Class head teacher details (firstName, lastName) or null if unassigned |
| `classLead` | object \| null | Class lead teacher details (firstName, lastName) or null if unassigned |

## Data Models

### Class with Teacher Details

```typescript
interface ClassWithTeachers {
  id: number
  name: string
  description: string | null
  classHeadId: number | null
  classLeadId: number | null
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

### Teacher Name Object

```typescript
interface TeacherName {
  firstName: string
  lastName: string
}
```

## Business Logic

### Data Retrieval
- Uses Prisma's `findUnique` to retrieve class by name
- Includes related teacher data using `include` option
- Only retrieves teacher names (firstName, lastName) for performance
- Returns null for unassigned teacher positions

### Query Strategy
The endpoint uses a two-step approach:
1. **Primary Query**: Find class by unique name
2. **Related Data**: Include teacher information for both head and lead positions

### Teacher Information
- Only teacher names are retrieved (firstName, lastName)
- Both `classHead` and `classLead` can be null if unassigned
- Teacher data is selected using Prisma's `select` option for optimization

## Validation Rules

### Required Parameters
- `name` parameter must be provided
- Class name cannot be empty or null

### Class Name Validation
- Class names are case-sensitive
- Class must exist in the database
- No partial matching or fuzzy search is implemented

## Error Handling

### Validation Errors (400 Bad Request)
- **Missing Name**: The `name` query parameter is required
- **Empty Name**: Class name cannot be empty

### Not Found Errors (404 Not Found)
- **Class Not Found**: The specified class name does not exist in the database

### Server Errors (500 Internal Server Error)
- **Database Errors**: Connection or query execution failures
- **Unexpected Errors**: Any other server-side errors

### Error Logging
All errors are logged with additional context:
- Location: `api/classes/get-by-name`
- Type: `fetch-class-by-name`
- Extra: Search parameters for debugging

## Performance Considerations

### Optimization
- Uses Prisma's `findUnique` for efficient single-record retrieval
- Includes only necessary teacher fields (firstName, lastName)
- No complex joins or unnecessary data loading

### Caching
- Consider implementing caching for frequently accessed classes
- Class data changes infrequently
- Cache invalidation should occur when class assignments change

## Example Usage

### Retrieve Class by Name

```bash
curl -X GET "http://localhost:3000/api/classes/get-by-name?name=10A"
```

### Using JavaScript

```javascript
async function getClassByName(className) {
  try {
    const response = await fetch(`/api/classes/get-by-name?name=${encodeURIComponent(className)}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Class not found');
      }
      throw new Error('Failed to fetch class');
    }
    
    const classData = await response.json();
    return classData;
  } catch (error) {
    console.error('Error fetching class:', error);
    throw error;
  }
}

// Usage
getClassByName('10A')
  .then(classData => {
    console.log('Class data:', classData);
    console.log('Class Head:', classData.classHead);
    console.log('Class Lead:', classData.classLead);
  })
  .catch(error => {
    console.error('Failed to fetch class:', error);
  });
```

### Using Python

```python
import requests
from urllib.parse import quote

def get_class_by_name(className):
    try:
        encoded_name = quote(className)
        response = requests.get(f'http://localhost:3000/api/classes/get-by-name?name={encoded_name}')
        
        if response.status_code == 404:
            raise Exception('Class not found')
        response.raise_for_status()
        
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Error fetching class: {e}")
        raise

# Usage
try:
    class_data = get_class_by_name('10A')
    print("Class data:", class_data)
    print("Class Head:", class_data.get('classHead'))
    print("Class Lead:", class_data.get('classLead'))
except Exception as e:
    print(f"Failed to fetch class: {e}")
```

## Use Cases

### 1. Class Detail Page
```javascript
// Display detailed class information
async function displayClassDetails(className) {
  try {
    const classData = await getClassByName(className);
    
    const html = `
      <div class="class-details">
        <h2>${classData.name}</h2>
        <p>${classData.description || 'No description available'}</p>
        
        <div class="teachers">
          <h3>Class Teachers</h3>
          <div class="teacher">
            <strong>Class Head:</strong> 
            ${classData.classHead ? `${classData.classHead.firstName} ${classData.classHead.lastName}` : 'Unassigned'}
          </div>
          <div class="teacher">
            <strong>Class Lead:</strong> 
            ${classData.classLead ? `${classData.classLead.firstName} ${classData.classLead.lastName}` : 'Unassigned'}
          </div>
        </div>
      </div>
    `;
    
    document.getElementById('class-details-container').innerHTML = html;
  } catch (error) {
    console.error('Failed to display class details:', error);
  }
}
```

### 2. Teacher Assignment Check
```javascript
// Check if a teacher is assigned to a specific class
async function checkTeacherAssignment(className, teacherId) {
  try {
    const classData = await getClassByName(className);
    
    const isHead = classData.classHeadId === teacherId;
    const isLead = classData.classLeadId === teacherId;
    
    return {
      isAssigned: isHead || isLead,
      role: isHead ? 'Class Head' : isLead ? 'Class Lead' : 'Not Assigned',
      classData
    };
  } catch (error) {
    console.error('Failed to check teacher assignment:', error);
    return { isAssigned: false, role: 'Error', classData: null };
  }
}
```

### 3. Class Search Functionality
```javascript
// Search for classes by name
async function searchClasses(searchTerm) {
  try {
    // This would typically use a different endpoint with search functionality
    // For now, we'll use the get-by-name endpoint for exact matches
    const classData = await getClassByName(searchTerm);
    return [classData]; // Return as array for consistency
  } catch (error) {
    if (error.message === 'Class not found') {
      return []; // Return empty array for no results
    }
    throw error;
  }
}
```

## Related Documentation

- [Classes API Overview](./README.md) - General classes API information
- [Class Listing](./index.md) - Retrieve all classes
- [Class Management](./[id].md) - Update class assignments
- [API Overview](../README.md) - General API information
- [Database Schema](../../../../prisma/schema.prisma) - Database structure 