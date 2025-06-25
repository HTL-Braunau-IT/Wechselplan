# Classes API

The Classes API provides endpoints for managing class information, including class details, class heads, and class leads. These endpoints handle retrieving class data and updating class assignments.

## Overview

The Classes API is organized into the following modules:

- **Class Listing** - Retrieve all classes with basic information
- **Class by Name** - Get detailed class information by name
- **Class Management** - Update class assignments and details

## Base URL

All classes API endpoints are prefixed with `/api/classes/`.

## Authentication

Classes API endpoints may require authentication depending on the operation. Include valid authentication headers when required:

```bash
Authorization: Bearer <jwt-token>
```

## Available Endpoints

### Class Listing
- `GET /api/classes` - Retrieve all classes (ordered by name)

### Class by Name
- `GET /api/classes/get-by-name?name={className}` - Get class details by name

### Class Management
- `PATCH /api/classes/{id}` - Update class assignments (class head/lead)

## Data Models

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

### Update Class Request

```typescript
interface UpdateClassRequest {
  classHeadId?: number | null  // Optional: New class head teacher ID
  classLeadId?: number | null  // Optional: New class lead teacher ID
}
```

## Validation Rules

### Class Name Validation
- Class names must be unique
- Class names are case-sensitive
- Class names cannot be empty

### Teacher Assignment Validation
- `classHeadId` and `classLeadId` must reference existing teachers
- Both fields can be null (unassigned)
- At least one field must be provided in update requests

### ID Validation
- Class IDs must be valid integers
- Teacher IDs must reference existing teacher records

## Error Handling

Classes API endpoints follow the standard error response format:

```json
{
  "error": "Error message description",
  "details": "Additional error details (optional)"
}
```

Common error scenarios:
- `400 Bad Request` - Invalid parameters or validation failures
- `404 Not Found` - Class or teacher not found
- `500 Internal Server Error` - Server-side errors

## Business Logic

### Class Organization
- Classes are automatically ordered alphabetically by name
- Class heads and leads are optional assignments
- A teacher can be assigned to multiple classes

### Data Relationships
- Classes have optional relationships with teachers
- Class head and class lead are separate roles
- Teacher assignments are validated against existing teacher records

## Security Considerations

- Class data is typically read-only for most users
- Class assignment updates may require administrative privileges
- All operations are logged for audit purposes
- Input validation prevents invalid data entry

## Rate Limiting

Classes API endpoints may have rate limiting to prevent abuse, especially for update operations.

## Related Documentation

- [Class Listing](./index.md) - Retrieve all classes
- [Class by Name](./get-by-name.md) - Get class details by name
- [Class Management](./[id].md) - Update class assignments
- [API Overview](../README.md) - General API information 