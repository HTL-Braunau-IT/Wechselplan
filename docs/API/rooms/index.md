# Rooms Endpoints

The Rooms API provides endpoints for retrieving room data from the database. This API handles the retrieval of room information used throughout the application for teacher assignments, schedule management, and facility planning.

## Base URL

`/api/rooms`

## Endpoints

### GET /api/rooms

Retrieves a list of all rooms from the database, ordered alphabetically by name.

#### Request

```http
GET /api/rooms
```

#### Query Parameters

This endpoint does not accept any query parameters.

#### Response

**Success (200 OK)**

```json
{
  "rooms": [
    {
      "id": "1",
      "name": "Computer Lab A"
    },
    {
      "id": "2", 
      "name": "Library"
    },
    {
      "id": "3",
      "name": "Math Lab"
    },
    {
      "id": "4",
      "name": "Science Lab 101"
    },
    {
      "id": "5",
      "name": "Study Room B"
    }
  ]
}
```

**Server Error (500 Internal Server Error)**

```json
{
  "error": "Failed to fetch rooms"
}
```

## Data Processing

### Database Query
The API performs the following database operations:
- **Table**: `room`
- **Fields Selected**: `id`, `name`
- **Ordering**: Alphabetical by `name` (ascending)
- **No Filtering**: Returns all rooms

### Response Formatting
- Rooms are wrapped in a `rooms` array
- Each room object contains `id` and `name` fields
- Results are consistently ordered alphabetically
- Empty array is returned when no rooms exist

## Data Models

### Room Interface

```typescript
interface Room {
  id: string
  name: string
}
```

### API Response Interface

```typescript
interface RoomsResponse {
  rooms: Room[]
}
```

### Prisma Query Interface

```typescript
interface PrismaRoomFindManyArgs {
  select: {
    id: boolean
    name: boolean
  }
  orderBy: {
    name: 'asc' | 'desc'
  }
}
```

## Business Logic

### Database Query Execution
```typescript
const rooms = await prisma.room.findMany({
  select: {
    id: true,
    name: true
  },
  orderBy: {
    name: 'asc'
  }
})
```

### Error Handling
```typescript
try {
  // Database query execution
  const rooms = await prisma.room.findMany({
    select: {
      id: true,
      name: true
    },
    orderBy: {
      name: 'asc'
    }
  })

  return NextResponse.json({ rooms })
} catch (error) {
  // Error logging and response
  captureError(error instanceof Error ? error : new Error(String(error)), {
    location: 'api/rooms',
    type: 'fetch-rooms'
  })
  
  return NextResponse.json(
    { error: 'Failed to fetch rooms' },
    { status: 500 }
  )
}
```

## Database Schema

### Room Table
```sql
CREATE TABLE room (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  -- Additional fields may exist but are not selected in this endpoint
);
```

### Indexing Strategy
- **Primary Key**: `id` field for efficient lookups
- **Sorting Index**: `name` field for alphabetical ordering
- **Performance**: Optimized for read operations

## Error Handling

### Database Errors (500 Internal Server Error)
- **Connection Failures**: Database connection issues
- **Query Failures**: SQL execution errors
- **Timeout Errors**: Long-running queries
- **Permission Errors**: Database access restrictions

### Error Logging
All errors are logged with additional context:
- Location: `api/rooms`
- Type: `fetch-rooms`
- Error details for debugging

### Error Response Format
```typescript
interface ErrorResponse {
  error: string
}
```

## Example Usage

### Retrieve All Rooms

```bash
curl -X GET \
  "http://localhost:3000/api/rooms" \
  -H "Authorization: Bearer <jwt-token>"
```

### Using JavaScript

```javascript
async function fetchRooms() {
  try {
    const response = await fetch('/api/rooms', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch rooms');
    }
    
    const data = await response.json();
    return data.rooms;
  } catch (error) {
    console.error('Error fetching rooms:', error);
    throw error;
  }
}

// Usage
fetchRooms()
  .then(rooms => {
    console.log('Rooms:', rooms);
  })
  .catch(error => {
    console.error('Failed to fetch rooms:', error);
  });
```

### Using Python

```python
import requests

def fetch_rooms():
    try:
        response = requests.get(
            'http://localhost:3000/api/rooms',
            headers={'Authorization': f'Bearer {token}'}
        )
        
        if response.status_code == 500:
            error_data = response.json()
            raise Exception(error_data.get('error', 'Server error'))
        
        response.raise_for_status()
        
        data = response.json()
        return data.get('rooms', [])
        
    except requests.exceptions.RequestException as e:
        print(f"Error fetching rooms: {e}")
        raise

# Usage
try:
    rooms = fetch_rooms()
    print(f"Retrieved {len(rooms)} rooms")
    for room in rooms:
        print(f"- {room['name']} (ID: {room['id']})")
except Exception as e:
    print(f"Failed to fetch rooms: {e}")
```

## Use Cases

### 1. Populate Room Dropdown
```javascript
// Populate a dropdown with rooms
async function populateRoomDropdown(selectElement) {
  try {
    const rooms = await fetchRooms();
    
    // Clear existing options
    selectElement.innerHTML = '';
    
    // Add default option
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Select Room';
    selectElement.appendChild(defaultOption);
    
    // Add room options
    rooms.forEach(room => {
      const option = document.createElement('option');
      option.value = room.id;
      option.textContent = room.name;
      selectElement.appendChild(option);
    });
  } catch (error) {
    console.error('Failed to populate dropdown:', error);
  }
}

// Usage
const selectElement = document.getElementById('room-select');
populateRoomDropdown(selectElement);
```

### 2. Room Search
```javascript
// Search rooms by name
async function searchRooms(searchTerm) {
  try {
    const rooms = await fetchRooms();
    
    return rooms.filter(room =>
      room.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  } catch (error) {
    console.error('Failed to search rooms:', error);
    return [];
  }
}

// Usage
searchRooms('lab')
  .then(results => {
    console.log('Search results:', results);
  });
```

### 3. Room Validation
```javascript
// Validate if a room exists
async function validateRoom(roomId) {
  try {
    const rooms = await fetchRooms();
    
    return rooms.some(room => room.id === roomId);
  } catch (error) {
    console.error('Failed to validate room:', error);
    return false;
  }
}

// Usage
validateRoom('1')
  .then(isValid => {
    console.log('Room is valid:', isValid);
  });
```

### 4. Room Statistics
```javascript
// Get room statistics
async function getRoomStats() {
  try {
    const rooms = await fetchRooms();
    
    return {
      totalCount: rooms.length,
      averageNameLength: rooms.reduce((sum, room) => 
        sum + room.name.length, 0) / rooms.length,
      longestName: rooms.reduce((longest, room) => 
        room.name.length > longest.length ? room.name : longest, ''),
      shortestName: rooms.reduce((shortest, room) => 
        room.name.length < shortest.length ? room.name : shortest, rooms[0]?.name || ''),
      labRooms: rooms.filter(room => room.name.toLowerCase().includes('lab')).length,
      studyRooms: rooms.filter(room => room.name.toLowerCase().includes('study')).length
    };
  } catch (error) {
    console.error('Failed to get statistics:', error);
    return null;
  }
}

// Usage
getRoomStats()
  .then(stats => {
    if (stats) {
      console.log('Room statistics:', stats);
    }
  });
```

### 5. Room Availability Check
```javascript
// Check room availability for scheduling
async function checkRoomAvailability(roomId, date, timeSlot) {
  try {
    const rooms = await fetchRooms();
    const room = rooms.find(r => r.id === roomId);
    
    if (!room) {
      return { available: false, reason: 'Room not found' };
    }
    
    // Additional logic to check actual availability
    // This would typically involve checking against a schedule database
    
    return { available: true, room: room };
  } catch (error) {
    console.error('Failed to check room availability:', error);
    return { available: false, reason: 'Error checking availability' };
  }
}

// Usage
checkRoomAvailability('1', '2024-01-15', '09:00-10:00')
  .then(result => {
    console.log('Room availability:', result);
  });
```

## Performance Considerations

### Query Optimization
- **Field Selection**: Only selects necessary fields (`id`, `name`)
- **Indexing**: Proper indexing on `name` field for sorting
- **No Filtering**: Returns all records without complex filtering

### Caching Strategy
- **Client-Side Caching**: Consider caching results in client applications
- **Server-Side Caching**: Implement Redis or similar for frequently accessed data
- **Cache Invalidation**: Clear cache when room data changes

### Response Size
- **Minimal Data**: Returns only essential fields
- **Efficient Serialization**: JSON response is lightweight
- **Compression**: Consider gzip compression for large datasets

## Security Considerations

- **Input Validation**: No user input to validate in this endpoint
- **Access Control**: May require authentication for sensitive data
- **Error Handling**: Generic error messages to prevent information disclosure
- **Rate Limiting**: Consider implementing rate limiting for high-traffic scenarios

## Monitoring and Logging

### Error Tracking
- **Sentry Integration**: All errors are captured with context
- **Error Context**: Includes location and type information
- **Debugging**: Detailed error information for troubleshooting

### Performance Monitoring
- **Response Time**: Monitor query execution time
- **Database Load**: Track database connection usage
- **Error Rates**: Monitor error frequency and types

## Related Documentation

- [Rooms API Overview](./README.md) - General rooms API information
- [API Overview](../README.md) - General API information
- [Prisma Documentation](https://www.prisma.io/docs) - Database ORM
- [Sentry Documentation](https://docs.sentry.io/) - Error tracking 