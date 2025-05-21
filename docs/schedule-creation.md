# Schedule Creation Feature

## Overview
The schedule creation feature allows teachers to create class schedules by selecting classes, organizing students into groups, and managing subject assignments.

## Components

### ScheduleClassSelectPage
The main component for class selection and student group management.

#### Features
- Class selection from available options
- Student list display for selected class
- Dynamic group creation (2-4 groups)
- Drag-and-drop student management between groups
- Automatic student sorting by last name
- Multi-language support (English and German)

#### Props
```typescript
interface Props {
  params: {
    lang: string; // Current language ('en' or 'de')
  }
}
```

### StudentItem
A draggable component representing a single student.

#### Props
```typescript
interface Props {
  student: {
    id: number;
    firstName: string;
    lastName: string;
    class: string;
  };
  index: number;
}
```

### GroupContainer
A droppable container for student groups.

#### Props
```typescript
interface Props {
  group: {
    id: number;
    students: Student[];
  };
  children: React.ReactNode;
  lang: string;
}
```

## Testing
The feature includes comprehensive tests covering:
- Initial loading state
- Translation loading
- Class selection
- Student display
- Group management
- Error handling

Run tests with:
```bash
npm test
```

## Internationalization
Translations are managed through a static object supporting:
- English (en)
- German (de)

Translation keys:
```typescript
{
  schedule: {
    selectClass: string;
    loadingClasses: string;
    loadingStudents: string;
    class: string;
    pleaseSelect: string;
    next: string;
    studentsOfClass: string;
    numberOfGroups: string;
    group: string;
  }
}
```

## Dependencies
- @dnd-kit/core: For drag-and-drop functionality
- next/navigation: For routing
- React Testing Library: For component testing 