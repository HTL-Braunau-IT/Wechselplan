# LDAP Configuration API

The LDAP Configuration API allows administrators to manage LDAP server settings for user authentication. These endpoints handle reading and updating LDAP configuration stored in environment variables.

## Base URL

`/api/admin/ldap-config`

## Endpoints

### GET /api/admin/ldap-config

Retrieves the current LDAP configuration from environment variables.

#### Request

```http
GET /api/admin/ldap-config
Authorization: Bearer <admin-jwt-token>
```

#### Response

**Success (200 OK)**

```json
{
  "url": "ldap://ldap.example.com:389",
  "baseDN": "dc=example,dc=com",
  "username": "cn=admin,dc=example,dc=com",
  "password": "********",
  "studentsOU": "ou=students,dc=example,dc=com",
  "teachersOU": "ou=teachers,dc=example,dc=com"
}
```

**Error (500 Internal Server Error)**

```json
{
  "error": "Failed to load LDAP configuration"
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `url` | string | LDAP server URL (e.g., `ldap://ldap.example.com:389`) |
| `baseDN` | string | Base Distinguished Name for LDAP searches |
| `username` | string | LDAP bind username (DN format) |
| `password` | string | LDAP bind password |
| `studentsOU` | string | Organizational Unit for students |
| `teachersOU` | string | Organizational Unit for teachers |

### POST /api/admin/ldap-config

Updates the LDAP configuration by modifying environment variables in the `.env` file.

#### Request

```http
POST /api/admin/ldap-config
Authorization: Bearer <admin-jwt-token>
Content-Type: application/json
```

**Request Body**

```json
{
  "url": "ldap://ldap.example.com:389",
  "baseDN": "dc=example,dc=com",
  "username": "cn=admin,dc=example,dc=com",
  "password": "securepassword123",
  "studentsOU": "ou=students,dc=example,dc=com",
  "teachersOU": "ou=teachers,dc=example,dc=com"
}
```

#### Response

**Success (200 OK)**

```json
{
  "success": true
}
```

**Error (500 Internal Server Error)**

```json
{
  "error": "Failed to save LDAP configuration"
}
```

## Configuration Details

### Environment Variables

The API manages the following environment variables in the `.env` file:

- `LDAP_URL` - LDAP server URL
- `LDAP_BASE_DN` - Base Distinguished Name
- `LDAP_USERNAME` - LDAP bind username
- `LDAP_PASSWORD` - LDAP bind password
- `LDAP_STUDENTS_OU` - Students Organizational Unit
- `LDAP_TEACHERS_OU` - Teachers Organizational Unit

### File Operations

- The API reads from and writes to the `.env` file in the project root
- Existing LDAP environment variables are replaced with new values
- Non-LDAP environment variables are preserved
- If the `.env` file doesn't exist, it will be created

## Security Considerations

- **Sensitive Data**: LDAP passwords are stored in plain text in the `.env` file
- **File Permissions**: Ensure the `.env` file has appropriate read/write permissions
- **Server Restart**: Changes to LDAP configuration may require a server restart to take effect
- **Validation**: The API does not validate LDAP connection parameters; validation should be performed separately

## Error Handling

The API includes comprehensive error handling:

- **File System Errors**: Handles cases where the `.env` file cannot be read or written
- **JSON Parsing Errors**: Validates request body format
- **Environment Variable Mapping**: Properly maps camelCase fields to UPPER_CASE environment variables

## Example Usage

### Retrieve Current Configuration

```bash
curl -X GET \
  http://localhost:3000/api/admin/ldap-config \
  -H "Authorization: Bearer <admin-jwt-token>"
```

### Update LDAP Configuration

```bash
curl -X POST \
  http://localhost:3000/api/admin/ldap-config \
  -H "Authorization: Bearer <admin-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "ldap://new-ldap.example.com:389",
    "baseDN": "dc=new-example,dc=com",
    "username": "cn=admin,dc=new-example,dc=com",
    "password": "newpassword123",
    "studentsOU": "ou=students,dc=new-example,dc=com",
    "teachersOU": "ou=teachers,dc=new-example,dc=com"
  }'
```

## Related Documentation

- [Admin API Overview](./README.md) - General admin API information
- [Authentication API](../auth/README.md) - User authentication endpoints
- [Environment Configuration](../../../.env.example) - Example environment variables 