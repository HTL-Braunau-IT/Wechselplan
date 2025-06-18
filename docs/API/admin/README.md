# Admin API

The Admin API provides administrative functions for system configuration and management. These endpoints are typically restricted to users with administrative privileges.

## Overview

The Admin API is organized into the following modules:

- **LDAP Configuration** - Manage LDAP server settings for user authentication
- **Settings Management** - Configure system settings including schedules, break times, and data import

## Base URL

All admin API endpoints are prefixed with `/api/admin/`.

## Authentication

Admin API endpoints require administrative privileges. Ensure your request includes valid authentication headers:

```bash
Authorization: Bearer <admin-jwt-token>
```

## Available Endpoints

### LDAP Configuration
- `GET /api/admin/ldap-config` - Retrieve current LDAP configuration
- `POST /api/admin/ldap-config` - Update LDAP configuration

### Settings Management

#### Schedule Times
- `GET /api/admin/settings/schedule-times` - Retrieve all schedule times
- `POST /api/admin/settings/schedule-times` - Create a new schedule time

#### Break Times
- `GET /api/admin/settings/break-times` - Retrieve all break times
- `POST /api/admin/settings/break-times` - Create a new break time

#### Data Import
- `GET /api/admin/settings/import` - Retrieve data by type (rooms, subjects, learning content)
- `POST /api/admin/settings/import` - Import CSV data for rooms, subjects, or learning content

## Error Handling

Admin API endpoints follow the standard error response format:

```json
{
  "error": "Error message description",
  "details": "Additional error details (optional)"
}
```

## Security Considerations

- All admin endpoints require proper authentication and authorization
- LDAP configuration updates modify environment variables and require server restart
- Data import operations are validated to prevent malicious data injection
- All operations are logged for audit purposes

## Rate Limiting

Admin endpoints may have stricter rate limiting than regular API endpoints to prevent abuse.

## Related Documentation

- [LDAP Configuration](./ldap-config.md) - Detailed LDAP configuration endpoints
- [Settings Management](./settings/README.md) - Settings management overview
- [Break Times](./settings/break-times.md) - Break time management
- [Data Import](./settings/import.md) - CSV data import functionality
- [Schedule Times](./settings/schedule-times.md) - Schedule time management 