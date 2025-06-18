# Learning Contents Endpoints

The Learning Contents API provides endpoints for retrieving learning content data from the database. This API handles the retrieval of learning content information used throughout the application for teacher assignments, schedule management, and educational planning.

## Base URL

`/api/learning-contents`

## Endpoints

### GET /api/learning-contents

Retrieves a list of all learning contents from the database, ordered alphabetically by name.

#### Request

```http
GET /api/learning-contents
```

#### Query Parameters

This endpoint does not accept any query parameters.

#### Response

**Success (200 OK)**

```json
{
  "learningContents": [
    {
      "id": "1",
      "name": "Advanced Mathematics"
    },
    {
      "id": "2", 
      "name": "Biology"
    },
    {
      "id": "3",
      "name": "Chemistry"
    },
    {
      "id": "4",
      "name": "Computer Science"
    },
    {
      "id": "5",
      "name": "English Literature"
    }
  ]
}
```

**Server Error (500 Internal Server Error)**

```json
{
  "error": "Failed to fetch learning contents"
}
```

## Data Processing

### Database Query
The API performs the following database operations:
- **Table**: `learningContent`
- **Fields Selected**: `id`, `name`
- **Ordering**: Alphabetical by `name` (ascending)
- **No Filtering**: Returns all learning contents

### Response Formatting
- Learning contents are wrapped in a `learningContents` array
- Each learning content object contains `id` and `name` fields
- Results are consistently ordered alphabetically
- Empty array is returned when no learning contents exist

## Data Models

### Learning Content Interface

```typescript
interface LearningContent {
  id: string
  name: string
}
```

### API Response Interface

```typescript
interface LearningContentsResponse {
  learningContents: LearningContent[]
}
```

### Prisma Query Interface

```typescript
interface PrismaLearningContentFindManyArgs {
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
const learningContents = await prisma.learningContent.findMany({
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
  const learningContents = await prisma.learningContent.findMany({
    select: {
      id: true,
      name: true
    },
    orderBy: {
      name: 'asc'
    }
  })

  return NextResponse.json({ learningContents })
} catch (error: unknown) {
  // Error logging and response
  captureError(error, {
    location: 'api/learning-contents',
    type: 'fetch-contents'
  })
  
  return NextResponse.json(
    { error: 'Failed to fetch learning contents' },
    { status: 500 }
  )
}
```

## Database Schema

### Learning Content Table
```sql
CREATE TABLE learning_content (
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
- Location: `api/learning-contents`
- Type: `fetch-contents`
- Error details for debugging

### Error Response Format
```typescript
interface ErrorResponse {
  error: string
}
```

## Example Usage

### Retrieve All Learning Contents

```bash
curl -X GET \
  "http://localhost:3000/api/learning-contents" \
  -H "Authorization: Bearer <jwt-token>"
```

### Using JavaScript

```javascript
async function fetchLearningContents() {
  try {
    const response = await fetch('/api/learning-contents', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch learning contents');
    }
    
    const data = await response.json();
    return data.learningContents;
  } catch (error) {
    console.error('Error fetching learning contents:', error);
    throw error;
  }
}

// Usage
fetchLearningContents()
  .then(learningContents => {
    console.log('Learning contents:', learningContents);
  })
  .catch(error => {
    console.error('Failed to fetch learning contents:', error);
  });
```

### Using Python

```python
import requests

def fetch_learning_contents():
    try:
        response = requests.get(
            'http://localhost:3000/api/learning-contents',
            headers={'Authorization': f'Bearer {token}'}
        )
        
        if response.status_code == 500:
            error_data = response.json()
            raise Exception(error_data.get('error', 'Server error'))
        
        response.raise_for_status()
        
        data = response.json()
        return data.get('learningContents', [])
        
    except requests.exceptions.RequestException as e:
        print(f"Error fetching learning contents: {e}")
        raise

# Usage
try:
    learning_contents = fetch_learning_contents()
    print(f"Retrieved {len(learning_contents)} learning contents")
    for content in learning_contents:
        print(f"- {content['name']} (ID: {content['id']})")
except Exception as e:
    print(f"Failed to fetch learning contents: {e}")
```

## Use Cases

### 1. Populate Learning Content Dropdown
```javascript
// Populate a dropdown with learning contents
async function populateLearningContentDropdown(selectElement) {
  try {
    const learningContents = await fetchLearningContents();
    
    // Clear existing options
    selectElement.innerHTML = '';
    
    // Add default option
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Select Learning Content';
    selectElement.appendChild(defaultOption);
    
    // Add learning content options
    learningContents.forEach(content => {
      const option = document.createElement('option');
      option.value = content.id;
      option.textContent = content.name;
      selectElement.appendChild(option);
    });
  } catch (error) {
    console.error('Failed to populate dropdown:', error);
  }
}

// Usage
const selectElement = document.getElementById('learning-content-select');
populateLearningContentDropdown(selectElement);
```

### 2. Learning Content Search
```javascript
// Search learning contents by name
async function searchLearningContents(searchTerm) {
  try {
    const learningContents = await fetchLearningContents();
    
    return learningContents.filter(content =>
      content.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  } catch (error) {
    console.error('Failed to search learning contents:', error);
    return [];
  }
}

// Usage
searchLearningContents('math')
  .then(results => {
    console.log('Search results:', results);
  });
```

### 3. Learning Content Validation
```javascript
// Validate if a learning content exists
async function validateLearningContent(contentId) {
  try {
    const learningContents = await fetchLearningContents();
    
    return learningContents.some(content => content.id === contentId);
  } catch (error) {
    console.error('Failed to validate learning content:', error);
    return false;
  }
}

// Usage
validateLearningContent('1')
  .then(isValid => {
    console.log('Learning content is valid:', isValid);
  });
```

### 4. Learning Content Statistics
```javascript
// Get learning content statistics
async function getLearningContentStats() {
  try {
    const learningContents = await fetchLearningContents();
    
    return {
      totalCount: learningContents.length,
      averageNameLength: learningContents.reduce((sum, content) => 
        sum + content.name.length, 0) / learningContents.length,
      longestName: learningContents.reduce((longest, content) => 
        content.name.length > longest.length ? content.name : longest, ''),
      shortestName: learningContents.reduce((shortest, content) => 
        content.name.length < shortest.length ? content.name : shortest, learningContents[0]?.name || '')
    };
  } catch (error) {
    console.error('Failed to get statistics:', error);
    return null;
  }
}

// Usage
getLearningContentStats()
  .then(stats => {
    if (stats) {
      console.log('Learning content statistics:', stats);
    }
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
- **Cache Invalidation**: Clear cache when learning content data changes

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

- [Learning Contents API Overview](./README.md) - General learning contents API information
- [API Overview](../README.md) - General API information
- [Prisma Documentation](https://www.prisma.io/docs) - Database ORM
- [Sentry Documentation](https://docs.sentry.io/) - Error tracking 