# Export API

The Export API provides endpoints for generating and downloading various types of documents and data exports. These endpoints handle PDF generation, Excel file creation, and other export formats for class schedules, grade lists, and administrative data.

## Overview

The Export API is organized into the following modules:

- **PDF Schedule Export** - Generate PDF schedules for classes
- **Schedule Dates Export** - Export schedule data for specific weekdays
- **Grade List Export** - Generate Excel grade lists with macros
- **Excel Export** - Create Excel files with schedule and group data

## Base URL

All export API endpoints are prefixed with `/api/export/`.

## Authentication

Export API endpoints may require authentication depending on the operation. Include valid authentication headers when required:

```bash
Authorization: Bearer <jwt-token>
```

## Available Endpoints

### PDF Schedule Export
- `POST /api/export?className={className}` - Generate PDF schedule for a class

### Schedule Dates Export
- `POST /api/export/schedule-dates?className={className}&selectedWeekday={weekday}` - Export schedule for specific weekday

### Grade List Export
- `POST /api/export/notenliste?className={className}&selectedWeekday={weekday}&teacher={teacher}` - Generate Excel grade list

### Excel Export
- `POST /api/export/excel?className={className}&selectedWeekday={weekday}` - Create Excel file with schedule data

## Export Formats

### PDF Documents
- **Schedule PDFs**: Complete class schedules with teacher assignments
- **Schedule Dates PDFs**: Specific weekday schedules with turnus information
- **Generated using**: React PDF renderer with custom layouts

### Excel Files
- **Grade Lists**: Macro-enabled Excel files with student groups and schedules
- **Schedule Data**: Excel workbooks with comprehensive schedule information
- **Generated using**: XLSX library and XlsxPopulate for template-based exports

## Data Models

### Export Request Parameters

```typescript
interface ExportRequest {
  className: string           // Required: Class name to export
  selectedWeekday?: number    // Optional: Weekday (1-5) for specific exports
  teacher?: string           // Optional: Teacher name for grade lists
}
```

### Schedule Data Structure

```typescript
interface ScheduleData {
  [turnusKey: string]: {
    name: string
    weeks: Array<{
      date: string
      week: string
      isHoliday: boolean
    }>
    holidays: Array<{
      id: number
      name: string
      startDate: string
      endDate: string
    }>
  }
}
```

### Class Export Data

```typescript
interface ClassExportData {
  id: number
  name: string
  classHead: {
    firstName: string
    lastName: string
  } | null
  classLead: {
    firstName: string
    lastName: string
  } | null
  students: Array<{
    id: number
    firstName: string
    lastName: string
    groupId: number | null
  }>
}
```

## Validation Rules

### Required Parameters
- `className` - Must be provided for all export operations
- `selectedWeekday` - Required for schedule-specific exports (1-5)
- `teacher` - Required for grade list exports

### Parameter Validation
- Class names must exist in the database
- Weekday values must be integers between 1 and 5
- Teacher names must be valid for grade list exports

### Data Requirements
- Class must have associated students and groups
- Schedule data must exist for the specified class and weekday
- Teacher assignments must be available for schedule exports

## Error Handling

Export API endpoints follow the standard error response format:

```json
{
  "error": "Error message description",
  "details": "Additional error details (optional)"
}
```

Common error scenarios:
- `400 Bad Request` - Missing or invalid parameters
- `404 Not Found` - Class or schedule not found
- `500 Internal Server Error` - Export generation failures

## File Generation

### PDF Generation
- Uses React PDF renderer for consistent layouts
- Custom PDF components for different document types
- Automatic file naming with class and date information
- Proper content disposition headers for downloads

### Excel Generation
- Template-based generation for grade lists
- Dynamic workbook creation for schedule data
- Macro-enabled files for advanced functionality
- Proper cell formatting and data organization

## Performance Considerations

### Large Data Handling
- Efficient database queries with proper includes
- Pagination for large student lists
- Memory optimization for PDF generation
- Streaming responses for large files

### Caching Strategy
- Consider caching generated files for frequently accessed exports
- Cache invalidation when underlying data changes
- Temporary file storage for large exports

## Security Considerations

- **Input Validation**: All parameters are validated before processing
- **File Security**: Generated files are properly sanitized
- **Access Control**: Export operations may require specific permissions
- **Error Logging**: All export operations are logged for audit purposes

## Rate Limiting

Export endpoints may have stricter rate limiting due to resource-intensive operations:
- PDF generation requires significant processing time
- Excel file creation involves complex data manipulation
- Large file downloads may impact server performance

## File Formats and Headers

### PDF Responses
```http
Content-Type: application/pdf
Content-Disposition: attachment; filename=schedule-{className}.pdf
```

### Excel Responses
```http
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
Content-Disposition: attachment; filename=export-{className}.xlsx
```

## Related Documentation

- [PDF Schedule Export](./index.md) - Main PDF export functionality
- [Schedule Dates Export](./schedule-dates.md) - Weekday-specific exports
- [Grade List Export](./notenliste.md) - Excel grade list generation
- [Excel Export](./excel.md) - General Excel export functionality
- [API Overview](../README.md) - General API information 