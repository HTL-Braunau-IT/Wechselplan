# Data Import API

The Data Import API allows administrators to import CSV data for rooms, subjects, and learning content. This endpoint provides bulk data import functionality with automatic duplicate detection and validation.

## Base URL

`/api/admin/settings/import`

## Endpoints

### GET /api/admin/settings/import

Retrieves all records of a specified type (rooms, subjects, or learning content), ordered by name.

#### Request

```http
GET /api/admin/settings/import?type=room
Authorization: Bearer <admin-jwt-token>
```

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `type` | string | Yes | Data type to retrieve. Must be one of: `room`, `subject`, `learningContent` |

#### Response

**Success (200 OK)**

```json
{
  "data": [
    {
      "id": 1,
      "name": "Room 101",
      "capacity": 30,
      "description": "Main classroom",
      "createdAt": "2024-01-15T10:00:00.000Z",
      "updatedAt": "2024-01-15T10:00:00.000Z"
    },
    {
      "id": 2,
      "name": "Lab A",
      "capacity": 20,
      "description": "Computer lab",
      "createdAt": "2024-01-15T10:00:00.000Z",
      "updatedAt": "2024-01-15T10:00:00.000Z"
    }
  ]
}
```

**Validation Error (400 Bad Request)**

```json
{
  "error": "Invalid type parameter"
}
```

**Server Error (500 Internal Server Error)**

```json
{
  "error": "Failed to fetch data",
  "message": "Database connection error"
}
```

### POST /api/admin/settings/import

Imports CSV data for rooms, subjects, or learning content. Automatically filters out duplicate entries by name.

#### Request

```http
POST /api/admin/settings/import
Authorization: Bearer <admin-jwt-token>
Content-Type: application/json
```

**Request Body**

```json
{
  "type": "room",
  "data": "name,capacity,description\n\"Room 101\",30,\"Main classroom\"\n\"Lab A\",20,\"Computer lab\""
}
```

#### Response

**Success (200 OK)**

```json
{
  "count": 2
}
```

**Validation Error (400 Bad Request)**

```json
{
  "error": "Failed to import data",
  "message": "Name is required for all records"
}
```

```json
{
  "error": "Failed to import data",
  "message": "Invalid import type"
}
```

**Server Error (500 Internal Server Error)**

```json
{
  "error": "Failed to import data",
  "message": "Database connection error"
}
```

## Data Models

### Import Request

```typescript
interface ImportRequest {
  type: 'room' | 'subject' | 'learningContent'  // Type of data to import
  data: string                                   // CSV data as string
}
```

### Import Data

```typescript
interface ImportData {
  name: string           // Required: Name of the item
  capacity?: number      // Optional: Room capacity (for rooms only)
  description?: string   // Optional: Description
}
```

### Room Object

```typescript
interface Room {
  id: number             // Unique identifier
  name: string           // Room name
  capacity: number | null // Room capacity
  description: string | null // Room description
  createdAt: Date        // Creation timestamp
  updatedAt: Date        // Last update timestamp
}
```

### Subject Object

```typescript
interface Subject {
  id: number             // Unique identifier
  name: string           // Subject name
  description: string | null // Subject description
  createdAt: Date        // Creation timestamp
  updatedAt: Date        // Last update timestamp
}
```

### Learning Content Object

```typescript
interface LearningContent {
  id: number             // Unique identifier
  name: string           // Learning content name
  description: string | null // Learning content description
  createdAt: Date        // Creation timestamp
  updatedAt: Date        // Last update timestamp
}
```

## CSV Import Formats

### Rooms CSV

```csv
name,capacity,description
"Room 101",30,"Main classroom"
"Lab A",20,"Computer lab"
"Auditorium",100,"Large presentation space"
```

**Required Fields:**
- `name` - Room name (required)

**Optional Fields:**
- `capacity` - Room capacity as integer
- `description` - Room description

### Subjects CSV

```csv
name,description
"Mathematics","Advanced mathematics course"
"Physics","Physics fundamentals"
"English Literature","Classic literature studies"
```

**Required Fields:**
- `name` - Subject name (required)

**Optional Fields:**
- `description` - Subject description

### Learning Content CSV

```csv
name,description
"Chapter 1","Introduction to the subject"
"Lab Exercise 1","Hands-on practice"
"Assignment 1","First homework assignment"
```

**Required Fields:**
- `name` - Learning content name (required)

**Optional Fields:**
- `description` - Learning content description

## Import Process

### 1. CSV Parsing
- Uses `csv-parse` library for robust CSV parsing
- Automatically handles quoted fields and special characters
- Skips empty lines and trims whitespace

### 2. Data Validation
- Validates that all records have a `name` field
- Ensures `capacity` is a valid integer (for rooms)
- Handles optional fields gracefully

### 3. Duplicate Detection
- Checks existing records by name
- Automatically filters out duplicates
- Only imports records with unique names

### 4. Bulk Insertion
- Uses Prisma's `createMany` for efficient bulk insertion
- Returns count of newly created records
- Handles database constraints and errors

## Validation Rules

### Required Fields
- `name` - Must be provided for all records
- `type` - Must be one of: `room`, `subject`, `learningContent`

### Data Type Validation
- `capacity` - Must be a valid integer (for rooms only)
- `description` - Optional string field
- CSV format must be valid with proper headers

### Duplicate Handling
- Records with existing names are automatically filtered out
- Only unique records are imported
- No error is thrown for duplicates (they are simply ignored)

## Error Handling

### Validation Errors (400 Bad Request)
- **Invalid Type**: Type parameter must be valid
- **Missing Name**: All records must have a name field
- **Invalid CSV**: CSV data must be properly formatted

### Server Errors (500 Internal Server Error)
- **Database Errors**: Connection or constraint violations
- **Parsing Errors**: CSV parsing failures
- **Unexpected Errors**: Any other server-side errors

## Example Usage

### Retrieve Rooms

```bash
curl -X GET \
  "http://localhost:3000/api/admin/settings/import?type=room" \
  -H "Authorization: Bearer <admin-jwt-token>"
```

### Import Rooms from CSV

```bash
curl -X POST \
  http://localhost:3000/api/admin/settings/import \
  -H "Authorization: Bearer <admin-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "room",
    "data": "name,capacity,description\n\"Room 101\",30,\"Main classroom\"\n\"Lab A\",20,\"Computer lab\"\n\"Auditorium\",100,\"Large presentation space\""
  }'
```

### Import Subjects from CSV

```bash
curl -X POST \
  http://localhost:3000/api/admin/settings/import \
  -H "Authorization: Bearer <admin-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "subject",
    "data": "name,description\n\"Mathematics\",\"Advanced mathematics course\"\n\"Physics\",\"Physics fundamentals\"\n\"English Literature\",\"Classic literature studies\""
  }'
```

### Import Learning Content from CSV

```bash
curl -X POST \
  http://localhost:3000/api/admin/settings/import \
  -H "Authorization: Bearer <admin-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "learningContent",
    "data": "name,description\n\"Chapter 1\",\"Introduction to the subject\"\n\"Lab Exercise 1\",\"Hands-on practice\"\n\"Assignment 1\",\"First homework assignment\""
  }'
```

## Security Considerations

- **Input Validation**: All CSV data is validated before processing
- **Duplicate Prevention**: Automatic filtering prevents data conflicts
- **Bulk Operations**: Efficient bulk insertion reduces database load
- **Error Logging**: All errors are logged for audit purposes

## Performance Considerations

- **Bulk Insertion**: Uses `createMany` for efficient database operations
- **Duplicate Filtering**: Checks existing records before insertion
- **Memory Management**: Processes CSV data in chunks to handle large files
- **Error Recovery**: Continues processing even if some records fail

## Related Documentation

- [Settings Management Overview](./README.md) - General settings API information
- [Admin API Overview](../README.md) - General admin API information
- [CSV Parser Documentation](https://csv.js.org/parse/) - CSV parsing library
- [Prisma Documentation](https://www.prisma.io/docs) - Database ORM
- [Database Schema](../../../../prisma/schema.prisma) - Database structure 