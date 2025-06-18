# API Examples

This directory contains practical examples and usage patterns for the API endpoints. These examples demonstrate common use cases and best practices for integrating with the API.

## Overview

The examples are organized by API module and include:

- **Authentication Examples** - How to authenticate and manage tokens
- **Admin API Examples** - Administrative operations and configuration
- **Settings Examples** - System settings management
- **Data Import Examples** - Bulk data import operations

## Quick Start

### 1. Authentication

Before using any API endpoints, you need to authenticate:

```bash
# Get authentication token
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin@example.com",
    "password": "your-password"
  }'
```

### 2. Use the Token

Include the token in subsequent requests:

```bash
curl -X GET http://localhost:3000/api/admin/settings/schedule-times \
  -H "Authorization: Bearer <your-jwt-token>"
```

## Example Categories

### [Authentication Examples](./auth-examples.md)
- Login and token management
- Token refresh
- Logout procedures

### [Admin Configuration Examples](./admin-examples.md)
- LDAP configuration setup
- Environment variable management
- System configuration

### [Settings Management Examples](./settings-examples.md)
- Schedule time configuration
- Break time setup
- System settings management

### [Data Import Examples](./import-examples.md)
- CSV import for rooms
- Subject data import
- Learning content import
- Bulk data operations

## Common Patterns

### Error Handling

All API responses follow a consistent error format:

```javascript
// Handle API responses
async function makeApiCall() {
  try {
    const response = await fetch('/api/admin/settings/schedule-times', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'API request failed');
    }
    
    return await response.json();
  } catch (error) {
    console.error('API Error:', error.message);
    // Handle error appropriately
  }
}
```

### Authentication Wrapper

```javascript
// Authentication utility
class ApiClient {
  constructor(baseUrl = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
    this.token = null;
  }
  
  async login(username, password) {
    const response = await fetch(`${this.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    if (!response.ok) {
      throw new Error('Login failed');
    }
    
    const data = await response.json();
    this.token = data.token;
    return data;
  }
  
  async request(endpoint, options = {}) {
    if (!this.token) {
      throw new Error('Not authenticated');
    }
    
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Request failed');
    }
    
    return response.json();
  }
}
```

### Batch Operations

```javascript
// Batch import example
async function batchImportRooms(rooms) {
  const csvData = rooms.map(room => 
    `${room.name},${room.capacity || ''},${room.description || ''}`
  ).join('\n');
  
  const csv = `name,capacity,description\n${csvData}`;
  
  return await apiClient.request('/api/admin/settings/import', {
    method: 'POST',
    body: JSON.stringify({
      type: 'room',
      data: csv
    })
  });
}
```

## Testing Examples

### Using cURL

```bash
# Test authentication
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin@example.com", "password": "password123"}'

# Test admin endpoint
curl -X GET http://localhost:3000/api/admin/settings/schedule-times \
  -H "Authorization: Bearer <token>"
```

### Using JavaScript/Node.js

```javascript
// Test with Node.js
const fetch = require('node-fetch');

async function testApi() {
  // Login
  const loginResponse = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'admin@example.com',
      password: 'password123'
    })
  });
  
  const { token } = await loginResponse.json();
  
  // Use token
  const scheduleResponse = await fetch('http://localhost:3000/api/admin/settings/schedule-times', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  const schedules = await scheduleResponse.json();
  console.log('Schedules:', schedules);
}
```

### Using Python

```python
import requests
import json

# Test with Python
def test_api():
    # Login
    login_data = {
        'username': 'admin@example.com',
        'password': 'password123'
    }
    
    login_response = requests.post(
        'http://localhost:3000/api/auth/login',
        json=login_data
    )
    
    token = login_response.json()['token']
    
    # Use token
    headers = {'Authorization': f'Bearer {token}'}
    schedule_response = requests.get(
        'http://localhost:3000/api/admin/settings/schedule-times',
        headers=headers
    )
    
    schedules = schedule_response.json()
    print('Schedules:', schedules)
```

## Best Practices

### 1. Error Handling
- Always check response status codes
- Handle authentication errors gracefully
- Implement retry logic for transient failures

### 2. Rate Limiting
- Respect rate limits in response headers
- Implement exponential backoff for retries
- Cache responses when appropriate

### 3. Security
- Never log or expose authentication tokens
- Use HTTPS in production
- Validate all input data

### 4. Performance
- Use bulk operations when possible
- Implement proper caching strategies
- Minimize unnecessary API calls

## Related Documentation

- [API Overview](../README.md) - General API documentation
- [Admin API](../admin/README.md) - Administrative endpoints
- [Authentication API](../auth/README.md) - Authentication endpoints
- [Settings API](../admin/settings/README.md) - Settings management

## Getting Help

If you encounter issues with the API:

1. Check the error response for specific details
2. Verify your authentication token is valid
3. Ensure you're using the correct endpoint URLs
4. Review the validation rules for your data
5. Check the server logs for additional error information 