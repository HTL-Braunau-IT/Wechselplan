# Rooms API Testing

The Rooms API includes comprehensive test coverage using Vitest as the testing framework. The test suite validates the GET endpoint functionality, error handling, and database interactions.

## Test Structure

### Test File Location
```
src/app/api/rooms/__tests__/route.test.ts
```

### Test Framework
- **Framework**: Vitest
- **Mocking**: Vi (Vitest mocking utilities)
- **Assertions**: Vitest expect assertions
- **Coverage**: Unit tests for all code paths

## Test Setup

### Mock Configuration
The test suite uses comprehensive mocking to isolate the API logic:

```typescript
// Mock Prisma client
vi.mock('@/lib/prisma', () => ({
  prisma: {
    room: {
      findMany: vi.fn()
    }
  }
}));

// Mock Sentry error tracking
vi.mock('@/lib/sentry', () => ({
  captureError: vi.fn()
}));

// Mock NextResponse
vi.mock('next/server', () => ({
  NextResponse: {
    json: vi.fn().mockImplementation((data: unknown, init?: ResponseInit) => {
      return new Response(JSON.stringify(data), init);
    }),
  },
}));
```

### Test Lifecycle
```typescript
describe('Rooms API', () => {
  beforeEach(() => {
    vi.clearAllMocks(); // Clear all mocks before each test
  });
});
```

## Test Cases

### 1. Successful Room Retrieval

**Test**: `should return rooms ordered by name`

**Purpose**: Validates successful database query and response formatting

**Test Data**:
```typescript
const mockRooms = [
  { id: '1', name: 'Room A' },
  { id: '2', name: 'Room B' },
  { id: '3', name: 'Room C' }
];
```

**Assertions**:
- Response is instance of NextResponse
- Response status is 200
- Response data matches expected format
- Prisma query is called with correct parameters
- Data is properly wrapped in `rooms` array

**Expected Prisma Call**:
```typescript
expect(prisma.room.findMany).toHaveBeenCalledWith({
  select: {
    id: true,
    name: true
  },
  orderBy: {
    name: 'asc'
  }
});
```

**Expected Response**:
```typescript
expect(response).toBeInstanceOf(NextResponse);
expect(response.status).toBe(200);
expect(data).toEqual({ rooms: mockRooms });
```

### 2. Database Error Handling

**Test**: `should handle database errors`

**Purpose**: Validates proper handling of database errors

**Test Data**:
```typescript
const mockError = new Error('Database connection failed');
```

**Assertions**:
- Response is instance of NextResponse
- Response status is 500
- Error message is generic and user-friendly
- Sentry error tracking is called with proper context
- Error details are logged for debugging

**Expected Error Response**:
```json
{
  "error": "Failed to fetch rooms"
}
```

**Expected Sentry Call**:
```typescript
expect(captureError).toHaveBeenCalledWith(mockError, {
  location: 'api/rooms',
  type: 'fetch-rooms'
});
```

## Testing Patterns

### Mock Management
```typescript
beforeEach(() => {
  vi.clearAllMocks(); // Ensures clean state for each test
});
```

### Prisma Mocking
```typescript
// Mock successful database response
(prisma.room.findMany as any).mockResolvedValue(mockRooms);

// Mock database error
(prisma.room.findMany as any).mockRejectedValue(mockError);
```

### Response Validation
```typescript
const response = await GET();
const data = await response.json();

expect(response).toBeInstanceOf(NextResponse);
expect(response.status).toBe(200);
expect(data).toEqual({ rooms: mockRooms });
```

### Error Simulation
```typescript
// Simulate database errors
(prisma.room.findMany as any).mockRejectedValue(mockError);

// Verify error handling
expect(response.status).toBe(500);
expect(data).toEqual({ error: 'Failed to fetch rooms' });
expect(captureError).toHaveBeenCalledWith(mockError, {
  location: 'api/rooms',
  type: 'fetch-rooms'
});
```

## Test Coverage

### Code Paths Covered
1. **Success Path**: Normal database query and response
2. **Database Error Path**: Database connection and query failures
3. **Error Logging Path**: Sentry error tracking integration
4. **Response Formatting Path**: JSON response structure validation

### Edge Cases Tested
- **Empty Results**: Database returns empty array
- **Database Connection Issues**: Prisma client errors
- **Query Execution Errors**: SQL-level errors
- **Response Serialization**: JSON formatting errors

## Running Tests

### Command Line
```bash
# Run all tests
npm test

# Run specific test file
npm test src/app/api/rooms/__tests__/route.test.ts

# Run with coverage
npm test -- --coverage
```

### Test Environment
```bash
# Development testing
npm run test:dev

# Watch mode
npm run test:watch

# Production testing
npm run test:prod
```

## Test Dependencies

### Required Dependencies
```json
{
  "vitest": "^1.0.0",
  "@vitest/ui": "^1.0.0",
  "@prisma/client": "^5.0.0"
}
```

### Development Dependencies
```json
{
  "vitest": "^1.0.0",
  "@types/node": "^20.0.0"
}
```

## Best Practices

### Test Organization
- **Describe Blocks**: Group related tests logically
- **Test Names**: Use descriptive names that explain the scenario
- **Setup/Teardown**: Use `beforeEach` for consistent test state
- **Mock Isolation**: Clear mocks between tests

### Assertion Patterns
- **Response Type**: Always verify response is instance of NextResponse
- **Response Status**: Always verify HTTP status codes
- **Response Data**: Validate response structure and content
- **Function Calls**: Verify that dependencies are called correctly
- **Error Handling**: Ensure errors are properly logged and handled

### Mock Management
- **Minimal Mocking**: Only mock what's necessary
- **Realistic Data**: Use realistic test data
- **Error Simulation**: Test various error scenarios
- **Clean State**: Reset mocks between tests

## Continuous Integration

### GitHub Actions Integration
```yaml
name: Test Rooms API
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm test src/app/api/rooms/__tests__/route.test.ts
```

### Coverage Requirements
- **Minimum Coverage**: 90% for critical paths
- **Required Paths**: All error handling scenarios
- **Documentation**: All test cases documented

## Debugging Tests

### Common Issues
1. **Mock Not Reset**: Ensure `vi.clearAllMocks()` is called
2. **Async/Await**: Properly handle async test functions
3. **Import Issues**: Check mock import paths
4. **Type Errors**: Verify TypeScript types in test files

### Debug Commands
```bash
# Run tests with verbose output
npm test -- --verbose

# Run specific test with debugging
npm test -- --reporter=verbose src/app/api/rooms/__tests__/route.test.ts

# Debug with Node.js inspector
node --inspect-brk node_modules/.bin/vitest
```

## Test Data Examples

### Room Data Variations
```typescript
// Standard room data
const standardRooms = [
  { id: '1', name: 'Computer Lab A' },
  { id: '2', name: 'Library' },
  { id: '3', name: 'Math Lab' }
];

// Empty room data
const emptyRooms = [];

// Single room data
const singleRoom = [
  { id: '1', name: 'Study Room' }
];

// Special character room names
const specialRooms = [
  { id: '1', name: 'Room 101-A' },
  { id: '2', name: 'Lab & Study Center' },
  { id: '3', name: 'Conference Room (Main)' }
];
```

### Error Scenarios
```typescript
// Database connection error
const connectionError = new Error('Database connection failed');

// Prisma client error
const prismaError = new Prisma.PrismaClientKnownRequestError('Test error', {
  code: 'P2002',
  clientVersion: '5.0.0',
});

// Network timeout error
const timeoutError = new Error('Request timeout');

// Unknown error type
const unknownError = 'Unknown error occurred';
```

## Performance Testing

### Response Time Testing
```typescript
it('should respond within acceptable time', async () => {
  const startTime = Date.now();
  
  const response = await GET();
  
  const endTime = Date.now();
  const responseTime = endTime - startTime;
  
  expect(responseTime).toBeLessThan(1000); // Should respond within 1 second
  expect(response.status).toBe(200);
});
```

### Memory Usage Testing
```typescript
it('should handle large datasets efficiently', async () => {
  const largeRoomDataset = Array.from({ length: 1000 }, (_, i) => ({
    id: `${i + 1}`,
    name: `Room ${i + 1}`
  }));
  
  (prisma.room.findMany as any).mockResolvedValue(largeRoomDataset);
  
  const response = await GET();
  const data = await response.json();
  
  expect(response.status).toBe(200);
  expect(data.rooms).toHaveLength(1000);
});
```

## Related Documentation

- [Rooms API Overview](./README.md) - General rooms API information
- [Rooms Endpoints](./index.md) - API endpoint documentation
- [API Overview](../README.md) - General API information
- [Vitest Documentation](https://vitest.dev/) - Testing framework
- [Prisma Testing](https://www.prisma.io/docs/guides/testing) - Database testing 