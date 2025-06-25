# Class Listing API

The Class Listing API provides endpoints for retrieving all classes from the database. This endpoint returns basic class information ordered alphabetically by name.

## Base URL

`/api/classes`

## Endpoints

### GET /api/classes

Retrieves all classes from the database and returns them as a JSON array, ordered alphabetically by name.

#### Request

```http
GET /api/classes
```

#### Response

**Success (200 OK)**

```json
[
  {
    "id": 1,
    "name": "10A",
    "description": "Advanced Mathematics Class",
    "classHeadId": 5,
    "classLeadId": 12
  },
  {
    "id": 2,
    "name": "10B",
    "description": "Science Focus Class",
    "classHeadId": 8,
    "classLeadId": null
  },
  {
    "id": 3,
    "name": "11A",
    "description": "Humanities Class",
    "classHeadId": null,
    "classLeadId": 15
  }
]
```

**Error (500 Internal Server Error)**

```json
{
  "error": "Failed to fetch classes"
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | number | Unique class identifier |
| `name` | string | Class name (e.g., "10A", "11B") |
| `description` | string \| null | Class description or null if not provided |
| `classHeadId` | number \| null | ID of the class head teacher or null if unassigned |
| `classLeadId` | number \| null | ID of the class lead teacher or null if unassigned |

## Data Model

### Class Object

```typescript
interface Class {
  id: number              // Unique identifier
  name: string            // Class name
  description: string | null // Class description
  classHeadId: number | null // Class head teacher ID
  classLeadId: number | null // Class lead teacher ID
}
```

## Business Logic

### Data Retrieval
- All classes are retrieved from the database
- Only essential fields are selected for performance
- Results are automatically ordered by `name` in ascending order
- No pagination is implemented (returns all classes)

### Field Selection
The endpoint uses Prisma's `select` option to optimize performance by only retrieving necessary fields:
- `id` - For unique identification
- `name` - For display and sorting
- `description` - For additional context
- `classHeadId` - For class head teacher reference
- `classLeadId` - For class lead teacher reference

### Ordering
- Classes are ordered alphabetically by `name`
- This ensures consistent and predictable results
- Useful for user interface display and navigation

## Error Handling

### Database Errors (500 Internal Server Error)
- **Connection Issues**: Database connection failures
- **Query Errors**: SQL or Prisma query execution errors
- **Unexpected Errors**: Any other server-side errors

### Error Response Format
```json
{
  "error": "Failed to fetch classes"
}
```

## Performance Considerations

### Optimization
- Uses Prisma's `select` to limit retrieved fields
- No complex joins or relationships are loaded
- Simple ordering by indexed field (`name`)

### Caching
- Consider implementing client-side caching for this endpoint
- Data changes infrequently (class structure is relatively stable)
- Cache invalidation should occur when classes are updated

## Example Usage

### Retrieve All Classes

```bash
curl -X GET http://localhost:3000/api/classes
```

### Using JavaScript

```javascript
async function fetchClasses() {
  try {
    const response = await fetch('/api/classes');
    
    if (!response.ok) {
      throw new Error('Failed to fetch classes');
    }
    
    const classes = await response.json();
    return classes;
  } catch (error) {
    console.error('Error fetching classes:', error);
    throw error;
  }
}

// Usage
fetchClasses()
  .then(classes => {
    console.log('Classes:', classes);
    // Process classes data
  })
  .catch(error => {
    console.error('Failed to fetch classes:', error);
  });
```

### Using Python

```python
import requests

def fetch_classes():
    try:
        response = requests.get('http://localhost:3000/api/classes')
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Error fetching classes: {e}")
        raise

# Usage
try:
    classes = fetch_classes()
    print("Classes:", classes)
except Exception as e:
    print(f"Failed to fetch classes: {e}")
```

## Use Cases

### 1. Class Selection Dropdown
```javascript
// Populate a dropdown with all classes
async function populateClassDropdown() {
  const classes = await fetchClasses();
  const dropdown = document.getElementById('class-select');
  
  classes.forEach(classItem => {
    const option = document.createElement('option');
    option.value = classItem.id;
    option.textContent = classItem.name;
    dropdown.appendChild(option);
  });
}
```

### 2. Class List Display
```javascript
// Display classes in a table or list
async function displayClasses() {
  const classes = await fetchClasses();
  const container = document.getElementById('classes-container');
  
  const html = classes.map(classItem => `
    <div class="class-item">
      <h3>${classItem.name}</h3>
      <p>${classItem.description || 'No description'}</p>
      <p>Head Teacher ID: ${classItem.classHeadId || 'Unassigned'}</p>
      <p>Lead Teacher ID: ${classItem.classLeadId || 'Unassigned'}</p>
    </div>
  `).join('');
  
  container.innerHTML = html;
}
```

### 3. Class Statistics
```javascript
// Calculate statistics about classes
async function getClassStatistics() {
  const classes = await fetchClasses();
  
  const stats = {
    totalClasses: classes.length,
    classesWithHead: classes.filter(c => c.classHeadId !== null).length,
    classesWithLead: classes.filter(c => c.classLeadId !== null).length,
    classesWithBoth: classes.filter(c => c.classHeadId !== null && c.classLeadId !== null).length
  };
  
  return stats;
}
```

## Related Documentation

- [Classes API Overview](./README.md) - General classes API information
- [Class by Name](./get-by-name.md) - Get detailed class information by name
- [Class Management](./[id].md) - Update class assignments
- [API Overview](../README.md) - General API information
- [Database Schema](../../../../prisma/schema.prisma) - Database structure 