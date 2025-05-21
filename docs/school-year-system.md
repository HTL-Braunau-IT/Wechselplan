# School Year System

## Overview
The School Year System provides a type-safe way to handle school years throughout the application. It includes utilities for validation, selection, and context management of school years in the format "YYYY/YYYY" (e.g., "2024/2025").

## Components

### Types and Interfaces

#### `SchoolYear`
```typescript
type SchoolYear = `${number}/${number}`
```
A template literal type representing a school year in the format "YYYY/YYYY".

#### `SchoolYearOption`
```typescript
interface SchoolYearOption {
  value: SchoolYear
  label: string
}
```
Interface for school year options used in selection components.

### Utility Functions

#### `isValidSchoolYear`
```typescript
function isValidSchoolYear(year: string): year is SchoolYear
```
Validates if a string is a valid school year.

**Parameters:**
- `year: string` - The year string to validate

**Returns:**
- `boolean` - True if the string is a valid school year

**Example:**
```typescript
const isValid = isValidSchoolYear("2024/2025") // true
const isInvalid = isValidSchoolYear("2024-2025") // false
```

#### `getCurrentSchoolYear`
```typescript
function getCurrentSchoolYear(): SchoolYear
```
Determines the current school year based on the current date.

**Returns:**
- `SchoolYear` - The current school year

**Example:**
```typescript
const currentYear = getCurrentSchoolYear() // "2024/2025" (if current date is in 2024)
```

#### `generateSchoolYearOptions`
```typescript
function generateSchoolYearOptions(
  yearsBack: number = 2,
  yearsForward: number = 2
): SchoolYearOption[]
```
Generates an array of school year options for selection.

**Parameters:**
- `yearsBack: number` - Number of past years to include (default: 2)
- `yearsForward: number` - Number of future years to include (default: 2)

**Returns:**
- `SchoolYearOption[]` - Array of school year options

**Example:**
```typescript
const options = generateSchoolYearOptions(1, 1)
// Returns: [
//   { value: "2023/2024", label: "2023/2024" },
//   { value: "2024/2025", label: "2024/2025" },
//   { value: "2025/2026", label: "2025/2026" }
// ]
```

### React Components

#### `SchoolYearProvider`
```typescript
function SchoolYearProvider({ children }: { children: ReactNode })
```
Context provider component that manages the selected school year state.

**Props:**
- `children: ReactNode` - Child components to be wrapped with the provider

**Usage:**
```typescript
<SchoolYearProvider>
  <App />
</SchoolYearProvider>
```

#### `SchoolYearSelector`
```typescript
function SchoolYearSelector()
```
A reusable component for selecting school years.

**Features:**
- Dropdown selection of school years
- Automatic generation of year options
- Integration with the school year context

**Usage:**
```typescript
<SchoolYearSelector />
```

### Hooks

#### `useSchoolYear`
```typescript
function useSchoolYear(): {
  selectedYear: SchoolYear
  setSelectedYear: (year: SchoolYear) => void
}
```
Hook for accessing and updating the selected school year.

**Returns:**
- `selectedYear: SchoolYear` - The currently selected school year
- `setSelectedYear: (year: SchoolYear) => void` - Function to update the selected year

**Example:**
```typescript
function MyComponent() {
  const { selectedYear, setSelectedYear } = useSchoolYear()
  
  return (
    <div>
      <p>Current School Year: {selectedYear}</p>
      <button onClick={() => setSelectedYear("2025/2026")}>
        Change Year
      </button>
    </div>
  )
}
```

## Implementation Details

### School Year Format
- School years are represented as strings in the format "YYYY/YYYY"
- The second year must always be one more than the first year
- Examples: "2024/2025", "2023/2024"

### Current Year Logic
- If current month is July or later (month >= 6), current year is used as start year
- If current month is before July, previous year is used as start year
- Example: In June 2024, current school year would be "2023/2024"

### Type Safety
- All functions and components are fully typed
- Type guards ensure runtime validation of school year strings
- Context provides type-safe access to the selected year

## Best Practices

1. **Always use the context**
   - Access the selected year through `useSchoolYear` hook
   - Never store school year state locally when it needs to be shared

2. **Validation**
   - Use `isValidSchoolYear` to validate user input
   - Trust the type system for internal operations

3. **Year Selection**
   - Use `SchoolYearSelector` component for consistent UI
   - Generate options using `generateSchoolYearOptions` for custom implementations

4. **Error Handling**
   - Always handle potential invalid year formats
   - Use type guards to ensure type safety

## Related Files
- `src/types/school-year.ts` - Types and utilities
- `src/contexts/school-year-context.tsx` - Context provider
- `src/components/school-year-selector.tsx` - Selection component 