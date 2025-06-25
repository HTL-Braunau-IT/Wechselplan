# Learning Contents API Testing

The Learning Contents API includes comprehensive test coverage using Vitest as the testing framework. The test suite validates the GET endpoint functionality, error handling, and database interactions.

## Test Structure

### Test File Location
```
src/app/api/learning-contents/__tests__/route.test.ts
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
    learningContent: {
      findMany: vi.fn(),
    },
  },
}));

// Mock Sentry error tracking
vi.mock('@/lib/sentry', () => ({
  captureError: vi.fn(),
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
describe('Learning Contents API', () => {
  beforeEach(() => {
    vi.clearAllMocks(); // Clear all mocks before each test
  });
});
```

## Test Cases

### 1. Successful Learning Content Retrieval

**Test**: `should return learning contents sorted by name`

**Purpose**: Validates successful database query and response formatting

**Test Data**:
```typescript
const mockContents = [
  { id: '1', name: 'Algebra' },
  { id: '2', name: 'Biology' },
  { id: '3', name: 'Chemistry' },
];
```

**Assertions**:
- Response status is 200
- Response data matches expected format
- Prisma query is called with correct parameters
- Data is properly wrapped in `learningContents` array

**Expected Prisma Call**:
```typescript
expect(prisma.learningContent.findMany).toHaveBeenCalledWith({
  select: {
    id: true,
    name: true,
  },
  orderBy: {
    name: 'asc',
  },
});
```

### 2. Prisma Database Error Handling

**Test**: `should handle Prisma errors`

**Purpose**: Validates proper handling of Prisma-specific database errors

**Test Data**:
```typescript
const prismaError = new Prisma.PrismaClientKnownRequestError('Test error', {
  code: 'P2002',
  clientVersion: '5.0.0',
});
```

**Assertions**:
- Response status is 500
- Error message is generic and user-friendly
- Sentry error tracking is called with proper context
- Error details are logged for debugging

**Expected Error Response**:
```json
{
  "error": "Failed to fetch learning contents"
}
```

**Expected Sentry Call**:
```typescript
expect(captureError).toHaveBeenCalledWith(
  prismaError,
  expect.objectContaining({
    location: 'api/learning-contents',
    type: 'fetch-contents',
  })
);
```

### 3. General Error Handling

**Test**: `should handle general errors`

**Purpose**: Validates handling of non-Prisma errors

**Test Data**:
```typescript
const error = new Error('Test error');
```

**Assertions**:
- Response status is 500
- Generic error message is returned
- Sentry error tracking captures the error
- Error context includes location and type

### 4. Unknown Error Handling

**Test**: `should handle unknown errors`

**Purpose**: Validates handling of unexpected error types

**Test Data**:
```typescript
const unknownError = 'Unknown error';
```

**Assertions**:
- Response status is 500
- Generic error message is returned
- Sentry error tracking handles unknown error types
- Error context is properly set

## Testing Patterns

### Mock Management
```typescript
beforeEach(() => {
  vi.clearAllMocks(); // Ensures clean state for each test
});
```

### Prisma Mocking
```typescript
const prisma = (await import('@/lib/prisma')).prisma;
vi.mocked(prisma.learningContent.findMany).mockResolvedValue(mockContents);
```

### Error Simulation
```typescript
// Simulate Prisma errors
vi.mocked(prisma.learningContent.findMany).mockRejectedValue(prismaError);

// Simulate general errors
vi.mocked(prisma.learningContent.findMany).mockRejectedValue(error);

// Simulate unknown errors
vi.mocked(prisma.learningContent.findMany).mockRejectedValue(unknownError);
```

### Response Validation
```typescript
const response = await GET();
const data = await response.json();

expect(response.status).toBe(200);
expect(data).toEqual({ learningContents: mockContents });
```

## Test Coverage

### Code Paths Covered
1. **Success Path**: Normal database query and response
2. **Prisma Error Path**: Database-specific error handling
3. **General Error Path**: Non-database error handling
4. **Unknown Error Path**: Unexpected error type handling

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
npm test src/app/api/learning-contents/__tests__/route.test.ts

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
name: Test Learning Contents API
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
      - run: npm test src/app/api/learning-contents/__tests__/route.test.ts
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
npm test -- --reporter=verbose src/app/api/learning-contents/__tests__/route.test.ts

# Debug with Node.js inspector
node --inspect-brk node_modules/.bin/vitest
```

## Related Documentation

- [Learning Contents API Overview](./README.md) - General API information
- [Learning Contents Endpoints](./index.md) - API endpoint documentation
- [API Overview](../README.md) - General API information
- [Vitest Documentation](https://vitest.dev/) - Testing framework
- [Prisma Testing](https://www.prisma.io/docs/guides/testing) - Database testing 