# Class Management API

The Class Management API allows you to update class assignments for individual classes by their ID. This endpoint handles updating class head and class lead teacher assignments with comprehensive validation.

## Base URL

`/api/classes/{id}`

## Endpoints

### PATCH /api/classes/{id}

Updates class assignments (class head and/or class lead) for a specific class by ID.

#### Request

```http
PATCH /api/classes/1
Content-Type: application/json
```

**Request Body**

```json
{
  "classHeadId": 5,
  "classLeadId": 12
}
```

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | number | Yes | The unique identifier of the class to update |

#### Response

**Success (200 OK)**

```json
{
  "id": 1,
  "name": "10A",
  "description": "Advanced Mathematics Class",
  "classHeadId": 5,
  "classLeadId": 12
}
```

**Validation Error (400 Bad Request)**

```json
{
  "error": "Invalid class ID"
}
```

```json
{
  "error": "Validation failed",
  "details": {
    "classHeadId": {
      "_errors": ["Expected number, received string"]
    }
  }
}
```

```json
{
  "error": "Validation failed",
  "details": {
    "_errors": ["Nothing to update"]
  }
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
  "error": "Class head teacher not found"
}
```

```json
{
  "error": "Class lead teacher not found"
}
```

**Server Error (500 Internal Server Error)**

```json
{
  "error": "Failed to update class"
}
```

## Data Models

### Update Class Request

```typescript
interface UpdateClassRequest {
  classHeadId?: number | null  // Optional: New class head teacher ID
  classLeadId?: number | null  // Optional: New class lead teacher ID
}
```

### Updated Class Response

```typescript
interface UpdatedClass {
  id: number              // Class identifier
  name: string            // Class name
  description: string | null // Class description
  classHeadId: number | null // Updated class head teacher ID
  classLeadId: number | null // Updated class lead teacher ID
}
```

## Validation Schema

The API uses Zod schema validation for comprehensive data validation:

```typescript
const updateClassSchema = z.object({
  classHeadId: z.number().nullable().optional(),
  classLeadId: z.number().nullable().optional()
}).refine(
  data => data.classHeadId !== undefined || data.classLeadId !== undefined,
  { message: 'Nothing to update' }
)
```

## Validation Rules

### Required Fields
- At least one field (`classHeadId` or `classLeadId`) must be provided
- Both fields are optional but at least one must be specified

### ID Validation
- `classHeadId` and `classLeadId` must be valid integers or null
- Class ID in the URL must be a valid integer
- All referenced teachers must exist in the database

### Teacher Assignment Validation
- Both `classHeadId` and `classLeadId` can be null (unassigned)
- If a teacher ID is provided, the teacher must exist in the database
- A teacher can be assigned to multiple classes

## Business Logic

### Update Process
1. **ID Validation**: Validates the class ID from the URL
2. **Request Validation**: Validates the request body using Zod schema
3. **Class Existence**: Checks if the class exists in the database
4. **Teacher Validation**: Verifies that referenced teachers exist
5. **Database Update**: Updates the class record with new assignments
6. **Response**: Returns the updated class data

### Teacher Assignment Logic
- Both class head and class lead are optional assignments
- Assignments can be set to null to remove teacher assignments
- The same teacher can be assigned to multiple classes
- A teacher can be both class head and class lead for different classes

### Data Integrity
- All teacher references are validated before update
- Only specified fields are updated (partial updates supported)
- Database constraints ensure referential integrity

## Error Handling

### Validation Errors (400 Bad Request)
- **Invalid Class ID**: Class ID must be a valid integer
- **Schema Validation**: Request body must match the validation schema
- **Nothing to Update**: At least one field must be provided for update

### Not Found Errors (404 Not Found)
- **Class Not Found**: The specified class ID does not exist
- **Teacher Not Found**: Referenced teacher ID does not exist

### Server Errors (500 Internal Server Error)
- **Database Errors**: Connection or query execution failures
- **Unexpected Errors**: Any other server-side errors

### Error Logging
All errors are logged with additional context:
- Location: `api/classes/[id]`
- Type: `update-class`
- Extra context for debugging

## Example Usage

### Update Class Head Teacher

```bash
curl -X PATCH \
  http://localhost:3000/api/classes/1 \
  -H "Content-Type: application/json" \
  -d '{
    "classHeadId": 5
  }'
```

### Update Class Lead Teacher

```bash
curl -X PATCH \
  http://localhost:3000/api/classes/1 \
  -H "Content-Type: application/json" \
  -d '{
    "classLeadId": 12
  }'
```

### Update Both Teachers

```bash
curl -X PATCH \
  http://localhost:3000/api/classes/1 \
  -H "Content-Type: application/json" \
  -d '{
    "classHeadId": 5,
    "classLeadId": 12
  }'
```

### Remove Teacher Assignment

```bash
curl -X PATCH \
  http://localhost:3000/api/classes/1 \
  -H "Content-Type: application/json" \
  -d '{
    "classHeadId": null
  }'
```

### Using JavaScript

```javascript
async function updateClass(classId, updateData) {
  try {
    const response = await fetch(`/api/classes/${classId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updateData)
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update class');
    }
    
    const updatedClass = await response.json();
    return updatedClass;
  } catch (error) {
    console.error('Error updating class:', error);
    throw error;
  }
}

// Usage examples
updateClass(1, { classHeadId: 5 })
  .then(updatedClass => {
    console.log('Updated class:', updatedClass);
  })
  .catch(error => {
    console.error('Failed to update class:', error);
  });

updateClass(1, { classHeadId: null, classLeadId: 12 })
  .then(updatedClass => {
    console.log('Updated class:', updatedClass);
  })
  .catch(error => {
    console.error('Failed to update class:', error);
  });
```

### Using Python

```python
import requests
import json

def update_class(class_id, update_data):
    try:
        response = requests.patch(
            f'http://localhost:3000/api/classes/{class_id}',
            headers={'Content-Type': 'application/json'},
            data=json.dumps(update_data)
        )
        
        if response.status_code == 404:
            raise Exception('Class or teacher not found')
        response.raise_for_status()
        
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Error updating class: {e}")
        raise

# Usage examples
try:
    # Update class head
    updated_class = update_class(1, {'classHeadId': 5})
    print("Updated class:", updated_class)
    
    # Remove class head assignment
    updated_class = update_class(1, {'classHeadId': None})
    print("Updated class:", updated_class)
    
except Exception as e:
    print(f"Failed to update class: {e}")
```

## Use Cases

### 1. Teacher Assignment Management
```javascript
// Assign a teacher as class head
async function assignClassHead(classId, teacherId) {
  try {
    const updatedClass = await updateClass(classId, { classHeadId: teacherId });
    console.log(`Teacher ${teacherId} assigned as class head for class ${updatedClass.name}`);
    return updatedClass;
  } catch (error) {
    console.error('Failed to assign class head:', error);
    throw error;
  }
}

// Remove class head assignment
async function removeClassHead(classId) {
  try {
    const updatedClass = await updateClass(classId, { classHeadId: null });
    console.log(`Class head removed from class ${updatedClass.name}`);
    return updatedClass;
  } catch (error) {
    console.error('Failed to remove class head:', error);
    throw error;
  }
}
```

### 2. Bulk Teacher Assignment
```javascript
// Assign multiple teachers to different classes
async function assignTeachersToClasses(assignments) {
  const results = [];
  
  for (const assignment of assignments) {
    try {
      const { classId, classHeadId, classLeadId } = assignment;
      const updateData = {};
      
      if (classHeadId !== undefined) updateData.classHeadId = classHeadId;
      if (classLeadId !== undefined) updateData.classLeadId = classLeadId;
      
      const updatedClass = await updateClass(classId, updateData);
      results.push({ success: true, class: updatedClass });
    } catch (error) {
      results.push({ success: false, error: error.message, classId: assignment.classId });
    }
  }
  
  return results;
}

// Usage
const assignments = [
  { classId: 1, classHeadId: 5, classLeadId: 12 },
  { classId: 2, classHeadId: 8 },
  { classId: 3, classLeadId: 15 }
];

assignTeachersToClasses(assignments)
  .then(results => {
    console.log('Assignment results:', results);
  });
```

### 3. Teacher Workload Management
```javascript
// Check teacher assignments across all classes
async function getTeacherAssignments(teacherId) {
  try {
    // First get all classes
    const classesResponse = await fetch('/api/classes');
    const classes = await classesResponse.json();
    
    // Filter classes where teacher is assigned
    const assignments = classes.filter(classItem => 
      classItem.classHeadId === teacherId || classItem.classLeadId === teacherId
    );
    
    return assignments.map(classItem => ({
      classId: classItem.id,
      className: classItem.name,
      role: classItem.classHeadId === teacherId ? 'Class Head' : 'Class Lead'
    }));
  } catch (error) {
    console.error('Failed to get teacher assignments:', error);
    throw error;
  }
}
```

## Security Considerations

- **Input Validation**: All input data is validated using Zod schema
- **Teacher Verification**: Referenced teachers are verified to exist
- **Partial Updates**: Only specified fields are updated
- **Error Logging**: All operations are logged for audit purposes
- **Data Integrity**: Database constraints ensure referential integrity

## Performance Considerations

- **Efficient Queries**: Uses Prisma's optimized queries
- **Selective Updates**: Only updates specified fields
- **Validation Optimization**: Validates data before database operations
- **Error Handling**: Comprehensive error handling prevents unnecessary database calls

## Related Documentation

- [Classes API Overview](./README.md) - General classes API information
- [Class Listing](./index.md) - Retrieve all classes
- [Class by Name](./get-by-name.md) - Get class details by name
- [API Overview](../README.md) - General API information
- [Zod Validation](https://zod.dev/) - Schema validation library
- [Database Schema](../../../../prisma/schema.prisma) - Database structure 