# Turns API

The Turns API manages turn schedules for the application. This endpoint provides predefined turn schedules with associated weeks and dates, allowing for structured scheduling across different time periods.

## Base URL

`/api/schedule/turns`

## Endpoints

### GET /api/schedule/turns

Retrieves predefined turn schedules with associated weeks and dates.

#### Request

```http
GET /api/schedule/turns
```

#### Response

**Success (200 OK)**

```json
{
  "turns": [
    {
      "id": 1,
      "name": "Turn 1",
      "weeks": [1, 2, 3, 4],
      "dates": [
        "2024-01-15",
        "2024-01-16",
        "2024-01-17",
        "2024-01-18",
        "2024-01-19",
        "2024-01-22",
        "2024-01-23",
        "2024-01-24",
        "2024-01-25",
        "2024-01-26",
        "2024-01-29",
        "2024-01-30",
        "2024-01-31",
        "2024-02-01",
        "2024-02-02",
        "2024-02-05",
        "2024-02-06",
        "2024-02-07",
        "2024-02-08",
        "2024-02-09"
      ]
    },
    {
      "id": 2,
      "name": "Turn 2",
      "weeks": [5, 6, 7, 8],
      "dates": [
        "2024-02-12",
        "2024-02-13",
        "2024-02-14",
        "2024-02-15",
        "2024-02-16",
        "2024-02-19",
        "2024-02-20",
        "2024-02-21",
        "2024-02-22",
        "2024-02-23",
        "2024-02-26",
        "2024-02-27",
        "2024-02-28",
        "2024-02-29",
        "2024-03-01",
        "2024-03-04",
        "2024-03-05",
        "2024-03-06",
        "2024-03-07",
        "2024-03-08"
      ]
    },
    {
      "id": 3,
      "name": "Turn 3",
      "weeks": [9, 10, 11, 12],
      "dates": [
        "2024-03-11",
        "2024-03-12",
        "2024-03-13",
        "2024-03-14",
        "2024-03-15",
        "2024-03-18",
        "2024-03-19",
        "2024-03-20",
        "2024-03-21",
        "2024-03-22",
        "2024-03-25",
        "2024-03-26",
        "2024-03-27",
        "2024-03-28",
        "2024-03-29",
        "2024-04-01",
        "2024-04-02",
        "2024-04-03",
        "2024-04-04",
        "2024-04-05"
      ]
    },
    {
      "id": 4,
      "name": "Turn 4",
      "weeks": [13, 14, 15, 16],
      "dates": [
        "2024-04-08",
        "2024-04-09",
        "2024-04-10",
        "2024-04-11",
        "2024-04-12",
        "2024-04-15",
        "2024-04-16",
        "2024-04-17",
        "2024-04-18",
        "2024-04-19",
        "2024-04-22",
        "2024-04-23",
        "2024-04-24",
        "2024-04-25",
        "2024-04-26",
        "2024-04-29",
        "2024-04-30",
        "2024-05-01",
        "2024-05-02",
        "2024-05-03"
      ]
    }
  ]
}
```

**Server Error (500 Internal Server Error)**

```json
{
  "error": "Failed to fetch turns"
}
```

## Data Processing

### Turn Schedule Retrieval Process
The API performs the following operations:
1. **Static Data Retrieval**: Returns predefined turn schedules
2. **Week Association**: Maps turns to specific week numbers
3. **Date Mapping**: Associates each turn with specific dates
4. **Response**: Returns structured turn data with weeks and dates

### Data Structure
- **Turn ID**: Unique identifier for each turn
- **Turn Name**: Descriptive name for the turn period
- **Weeks**: Array of week numbers associated with the turn
- **Dates**: Array of specific dates for the turn period

## Data Models

### Turn Schedule Response

```typescript
interface TurnScheduleResponse {
  turns: Array<{
    id: number
    name: string
    weeks: number[]
    dates: string[]
  }>
}
```

### Turn Object

```typescript
interface Turn {
  id: number
  name: string
  weeks: number[]
  dates: string[]
}
```

## Business Logic

### Static Turn Data
```typescript
const turns = [
  {
    id: 1,
    name: "Turn 1",
    weeks: [1, 2, 3, 4],
    dates: [
      "2024-01-15", "2024-01-16", "2024-01-17", "2024-01-18", "2024-01-19",
      "2024-01-22", "2024-01-23", "2024-01-24", "2024-01-25", "2024-01-26",
      "2024-01-29", "2024-01-30", "2024-01-31", "2024-02-01", "2024-02-02",
      "2024-02-05", "2024-02-06", "2024-02-07", "2024-02-08", "2024-02-09"
    ]
  },
  // ... additional turns
]
```

### Response Handling
```typescript
try {
  return NextResponse.json({ turns })
} catch (error) {
  return NextResponse.json(
    { error: "Failed to fetch turns" },
    { status: 500 }
  )
}
```

## Database Schema

This endpoint uses static data rather than database storage. The turn schedules are predefined and returned as-is. However, if database storage is needed in the future, the following schema could be used:

### Turn Table
```sql
CREATE TABLE turn (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  startWeek INT NOT NULL,
  endWeek INT NOT NULL,
  startDate DATE NOT NULL,
  endDate DATE NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### Turn Date Table
```sql
CREATE TABLE turn_date (
  id INT PRIMARY KEY AUTO_INCREMENT,
  turnId INT NOT NULL,
  date DATE NOT NULL,
  weekNumber INT NOT NULL,
  FOREIGN KEY (turnId) REFERENCES turn(id),
  UNIQUE KEY unique_turn_date (turnId, date)
);
```

## Error Handling

### Server Errors (500 Internal Server Error)
- **Data Retrieval Failures**: Errors in accessing or processing turn data
- **Response Generation Failures**: Errors in creating the JSON response

### Error Logging
All errors are logged with additional context:
- Location: `api/schedule/turns`
- Type: `fetch-turns`
- Error details for debugging

## Example Usage

### Retrieve Turn Schedules

```bash
curl -X GET \
  "http://localhost:3000/api/schedule/turns" \
  -H "Authorization: Bearer <jwt-token>"
```

### Using JavaScript

```javascript
async function getTurnSchedules() {
  try {
    const response = await fetch('/api/schedule/turns', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch turn schedules');
    }
    
    const data = await response.json();
    return data.turns;
  } catch (error) {
    console.error('Error fetching turn schedules:', error);
    throw error;
  }
}

// Example usage
getTurnSchedules()
  .then(turns => {
    console.log('Turn schedules:', turns);
    turns.forEach(turn => {
      console.log(`${turn.name}: Weeks ${turn.weeks.join(', ')}`);
      console.log(`Dates: ${turn.dates.length} days`);
    });
  })
  .catch(error => {
    console.error('Failed to get turn schedules:', error);
  });
```

### Using Python

```python
import requests

def get_turn_schedules():
    try:
        response = requests.get(
            'http://localhost:3000/api/schedule/turns',
            headers={'Authorization': f'Bearer {token}'}
        )
        
        response.raise_for_status()
        
        data = response.json()
        return data.get('turns', [])
        
    except requests.exceptions.RequestException as e:
        print(f"Error fetching turn schedules: {e}")
        raise

# Example usage
try:
    turns = get_turn_schedules()
    print(f"Found {len(turns)} turn schedules:")
    
    for turn in turns:
        print(f"{turn['name']}: Weeks {turn['weeks']}")
        print(f"  Dates: {len(turn['dates'])} days")
        print(f"  First date: {turn['dates'][0]}")
        print(f"  Last date: {turn['dates'][-1]}")
        print()
        
except Exception as e:
    print(f"Failed to get turn schedules: {e}")
```

## Use Cases

### 1. Display Turn Information
```javascript
// Display turn schedule information
async function displayTurnInfo() {
  try {
    const turns = await getTurnSchedules();
    
    console.log('Turn Schedule Information:');
    console.log('========================');
    
    turns.forEach(turn => {
      console.log(`\n${turn.name}:`);
      console.log(`  Weeks: ${turn.weeks.join(', ')}`);
      console.log(`  Duration: ${turn.dates.length} days`);
      console.log(`  Period: ${turn.dates[0]} to ${turn.dates[turn.dates.length - 1]}`);
    });
  } catch (error) {
    console.error('Failed to display turn info:', error);
  }
}
```

### 2. Find Turn by Date
```javascript
// Find which turn a specific date belongs to
async function findTurnByDate(targetDate) {
  try {
    const turns = await getTurnSchedules();
    
    for (const turn of turns) {
      if (turn.dates.includes(targetDate)) {
        return {
          turn: turn.name,
          week: turn.weeks[Math.floor(turn.dates.indexOf(targetDate) / 5)],
          date: targetDate
        };
      }
    }
    
    return null; // Date not found in any turn
  } catch (error) {
    console.error('Failed to find turn by date:', error);
    return null;
  }
}

// Usage
findTurnByDate('2024-02-15')
  .then(result => {
    if (result) {
      console.log(`${result.date} belongs to ${result.turn}, Week ${result.week}`);
    } else {
      console.log('Date not found in any turn');
    }
  });
```

### 3. Get Turn Statistics
```javascript
// Get statistics about turn schedules
async function getTurnStatistics() {
  try {
    const turns = await getTurnSchedules();
    
    const stats = {
      totalTurns: turns.length,
      totalWeeks: turns.reduce((sum, turn) => sum + turn.weeks.length, 0),
      totalDays: turns.reduce((sum, turn) => sum + turn.dates.length, 0),
      averageDaysPerTurn: 0,
      turnDetails: turns.map(turn => ({
        name: turn.name,
        weeks: turn.weeks.length,
        days: turn.dates.length,
        startDate: turn.dates[0],
        endDate: turn.dates[turn.dates.length - 1]
      }))
    };
    
    stats.averageDaysPerTurn = Math.round(stats.totalDays / stats.totalTurns);
    
    return stats;
  } catch (error) {
    console.error('Failed to get turn statistics:', error);
    return null;
  }
}

// Usage
getTurnStatistics()
  .then(stats => {
    if (stats) {
      console.log('Turn Schedule Statistics:');
      console.log(`Total Turns: ${stats.totalTurns}`);
      console.log(`Total Weeks: ${stats.totalWeeks}`);
      console.log(`Total Days: ${stats.totalDays}`);
      console.log(`Average Days per Turn: ${stats.averageDaysPerTurn}`);
      
      console.log('\nTurn Details:');
      stats.turnDetails.forEach(turn => {
        console.log(`  ${turn.name}: ${turn.weeks} weeks, ${turn.days} days`);
      });
    }
  });
```

### 4. Validate Date Range
```javascript
// Validate if a date range falls within a specific turn
async function validateDateRange(startDate, endDate, turnName) {
  try {
    const turns = await getTurnSchedules();
    const targetTurn = turns.find(turn => turn.name === turnName);
    
    if (!targetTurn) {
      return { valid: false, error: `Turn '${turnName}' not found` };
    }
    
    const startIndex = targetTurn.dates.indexOf(startDate);
    const endIndex = targetTurn.dates.indexOf(endDate);
    
    if (startIndex === -1 || endIndex === -1) {
      return { valid: false, error: 'One or both dates not found in turn' };
    }
    
    if (startIndex > endIndex) {
      return { valid: false, error: 'Start date is after end date' };
    }
    
    const daysInRange = endIndex - startIndex + 1;
    const weeksInRange = Math.ceil(daysInRange / 5);
    
    return {
      valid: true,
      daysInRange,
      weeksInRange,
      turn: targetTurn.name
    };
  } catch (error) {
    console.error('Failed to validate date range:', error);
    return { valid: false, error: error.message };
  }
}
```

## Performance Considerations

### Static Data
- **No Database Queries**: Uses predefined data for fast response times
- **Caching**: Consider caching the response for frequently accessed data
- **Memory Usage**: Minimal memory footprint with static data

### Response Optimization
- **JSON Serialization**: Efficient JSON response generation
- **Error Handling**: Minimal overhead for error scenarios

## Security Considerations

- **Read-Only Access**: This endpoint only provides read access to static data
- **No Input Validation**: No user input to validate
- **Error Handling**: Generic error messages prevent information disclosure

## Related Documentation

- [Schedule API Overview](./README.md) - General schedule API information
- [Schedule Times](./times.md) - Schedule and break time management
- [Teacher Rotation](./teacher-rotation.md) - Teacher rotation schedules
- [Teacher Assignments](./teacher-assignments.md) - Teacher assignment management
- [Assignments](./assignments.md) - Student group assignments
- [API Overview](../README.md) - General API information 