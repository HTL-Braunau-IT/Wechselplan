# Settings

This document describes the settings functionality in the Wechselplan application.

## Overview

The Settings page allows administrators to configure various aspects of the application, including:
1. LDAP Configuration
2. General Settings

## LDAP Configuration

### Purpose

The LDAP configuration is used for importing students from Active Directory. This section allows you to configure the connection settings for your LDAP server.

### Configuration Options

| Setting | Description | Example |
|---------|-------------|---------|
| LDAP Server URL | The URL of your LDAP server | `ldap://your-domain-controller` |
| Base DN | The base distinguished name for your domain | `DC=your,DC=domain,DC=com` |
| Username | Service account username | `service-account@domain.com` |
| Password | Service account password | `••••••••` |
| Students OU | The OU containing student accounts | `OU=Students,DC=your,DC=domain,DC=com` |

### Requirements

- The service account must have read access to the Students OU
- The LDAP server must be accessible from the application server
- The Students OU must exist and contain class OUs

### Best Practices

1. Use a dedicated service account for LDAP access
2. Regularly rotate the service account password
3. Follow the principle of least privilege
4. Keep the LDAP configuration secure

## General Settings

### Purpose

General settings allow you to configure basic application preferences.

### Configuration Options

| Setting | Description | Options |
|---------|-------------|---------|
| Language | Application language | English, German |
| Theme | Application theme | Light, Dark, System |
| School Year | Current school year | Custom input |

### Best Practices

1. Set the language according to your school's primary language
2. Choose a theme that matches your school's branding
3. Update the school year at the beginning of each academic year

## Security Considerations

### LDAP Configuration

1. Never share the LDAP service account credentials
2. Regularly audit LDAP access logs
3. Use secure LDAP (LDAPS) when possible
4. Keep the `.env` file secure and never commit it to version control

### General Security

1. Regularly update the application
2. Monitor access logs
3. Use strong passwords
4. Implement proper access controls

## Troubleshooting

### LDAP Connection Issues

1. Verify network connectivity to the LDAP server
2. Check service account credentials
3. Verify the LDAP server URL
4. Check firewall settings

### General Issues

1. Clear browser cache if settings don't update
2. Check browser console for errors
3. Verify file permissions
4. Check application logs

## Environment Variables

The following environment variables are used for LDAP configuration:

```env
LDAP_URL="ldap://your-domain-controller"
LDAP_BASE_DN="DC=your,DC=domain,DC=com"
LDAP_USERNAME="service-account@domain.com"
LDAP_PASSWORD="your-password"
LDAP_STUDENTS_OU="OU=Students,DC=your,DC=domain,DC=com"
```

## API Endpoints

### LDAP Configuration

- `GET /api/admin/ldap-config` - Get current LDAP configuration
- `POST /api/admin/ldap-config` - Update LDAP configuration

### General Settings

- `GET /api/admin/settings` - Get current settings
- `POST /api/admin/settings` - Update settings

## Error Handling

### LDAP Configuration Errors

- "Could not load LDAP configuration" - Check file permissions and server access
- "Could not save LDAP configuration" - Verify write permissions and server status

### General Settings Errors

- "Could not save settings" - Check file permissions and server status
- "Invalid settings" - Verify the format of the settings data 