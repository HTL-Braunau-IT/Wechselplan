# API Documentation

This directory contains comprehensive documentation for all API routes in the application.

## Overview

The API is organized into different modules based on functionality:

- **Admin API** - Administrative functions for system configuration and management
- **Authentication API** - User authentication and authorization
- **Classes API** - Class management and operations
- **Export API** - Data export functionality (PDF, Excel)
- **Learning Contents API** - Learning content management and retrieval
- **Rooms API** - Room management and retrieval
- **Schedule API** - Schedule management, teacher assignments, and rotations
- **Schedules API** - General schedule management and data retrieval
- **Data Management API** - CRUD operations for application data

## Structure

```
docs/API/
├── README.md                 # This file - API overview
├── admin/                    # Admin API documentation
│   ├── README.md            # Admin API overview
│   ├── ldap-config.md       # LDAP configuration endpoints
│   └── settings/            # Settings management endpoints
│       ├── README.md        # Settings overview
│       ├── break-times.md   # Break times management
│       ├── import.md        # Data import functionality
│       └── schedule-times.md # Schedule times management
├── classes/                  # Classes API documentation
│   ├── README.md            # Classes API overview
│   ├── index.md             # Main classes endpoints
│   ├── get-by-name.md       # Class retrieval by name
│   └── [id].md              # Individual class operations
├── export/                   # Export API documentation
│   ├── README.md            # Export API overview
│   ├── index.md             # Main export endpoints
│   ├── schedule-dates.md    # Schedule dates export
│   ├── notenliste.md        # Grade list export
│   └── excel.md             # Excel export functionality
├── learning-contents/        # Learning Contents API documentation
│   ├── README.md            # Learning Contents API overview
│   ├── index.md             # Main learning contents endpoints
│   └── testing.md           # Testing documentation
├── rooms/                    # Rooms API documentation
│   ├── README.md            # Rooms API overview
│   ├── index.md             # Main rooms endpoints
│   └── testing.md           # Testing documentation
├── schedule/                 # Schedule API documentation
│   ├── README.md            # Schedule API overview
│   ├── times.md             # Schedule times management
│   ├── teacher-rotation.md  # Teacher rotation management
│   ├── teacher-assignments.md # Teacher assignments management
│   ├── turns.md             # Turn schedules
│   └── assignments.md       # Student group assignments
├── schedules/                # Schedules API documentation
│   ├── README.md            # Schedules API overview
│   ├── index.md             # Main schedules endpoints
│   ├── times.md             # Schedule times management
│   ├── data.md              # Schedule data retrieval
│   ├── all.md               # All schedules retrieval
│   ├── pdf-data.md          # PDF data generation
│   └── assignments.md       # Teacher assignments retrieval
└── examples/                # API usage examples
    └── README.md            # Examples overview
```

## Authentication

Most API endpoints require authentication. Include the appropriate authentication headers in your requests:

```bash
Authorization: Bearer <your-jwt-token>
```

## Error Handling

All API endpoints follow a consistent error response format:

```json
{
  "error": "Error message description",
  "details": "Additional error details (optional)"
}
```

Common HTTP status codes:
- `200` - Success
- `400` - Bad Request (validation errors)
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `500` - Internal Server Error

## Rate Limiting

API endpoints may be subject to rate limiting. Check response headers for rate limit information:

- `X-RateLimit-Limit` - Maximum requests per window
- `X-RateLimit-Remaining` - Remaining requests in current window
- `X-RateLimit-Reset` - Time when the rate limit resets

## Getting Started

1. Review the [Admin API documentation](./admin/README.md) for administrative functions
2. Check the [Classes API documentation](./classes/README.md) for class management
3. Check the [Export API documentation](./export/README.md) for data export functionality
4. Check the [Learning Contents API documentation](./learning-contents/README.md) for learning content management
5. Check the [Rooms API documentation](./rooms/README.md) for room management
6. Check the [Schedule API documentation](./schedule/README.md) for schedule management
7. Check the [Schedules API documentation](./schedules/README.md) for general schedule management
8. Check the [examples](./examples/README.md) for common usage patterns
9. Use the specific endpoint documentation for detailed information about each API route 