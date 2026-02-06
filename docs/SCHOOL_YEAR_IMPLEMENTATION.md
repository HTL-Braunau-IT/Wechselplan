# School Year Context – Implementation Guide

This document describes how to implement school-year support: a header dropdown to select the school year (e.g. 2025/2026, 2026/2027), schema and API changes so all relevant data is scoped by year, and admin UI to manage years and dates. Use it as a reference when implementing or extending the feature.

---

## Implementation status

| Section | Status | Notes |
|--------|--------|--------|
| **§2 Schema** | ✅ Done | SchoolYear, ClassMembership, schoolYearId on all tables; migrations + backfill 2025/2026 |
| **§2e Admin School Years** | ✅ Done | Tab, school-year-tab.tsx, admin data API CRUD for schoolYear |
| **§3 Context + header** | ✅ Done | SchoolYearProvider, useSchoolYear, GET /api/school-years, header dropdown, localStorage |
| **§5a GET /api/school-years** | ✅ Done | Returns id, label, startDate, endDate, semesterChangeDate |
| **§5b APIs filter (read)** | ✅ Done | Classes, schedules, teacher-assignments GET, notensammler teacher-classes/class/grades, students by class+year, export all filter by schoolYearId (optional or required as appropriate). |
| **§5c APIs write** | ✅ Done | Schedule, TeacherAssignment, Grade, FinalGrade, NotenmanagementTransfer, ClassMembership on student import. |
| **§6 Pages** | ✅ Done | Notensammler, schedule, class-settings, admin students import pass schoolYearId; selected year semesterChangeDate used for current semester (context currentSemester, Notensammler Aktuell label). |
| **§8 Cleanup** | ⏳ Optional | Optional deprecation of Student.classId in favor of ClassMembership for selected year. |

**Done:** Schema, migrations, admin School Years tab, GET /api/school-years, context + header dropdown (localStorage), all write/read paths and pages, ClassMembership on import, semester from DB (getCurrentSemesterFromSchoolYear, context currentSemester, Notensammler current-semester label).  
**Optional (remaining):** Deprecate Student.classId; ClassMembership is already the source of truth per year for reads.

---

## Goals

1. **Header**: Dropdown to select school year (e.g. 2025/2026, 2026/2027, 2027/2028). Selection drives which data is read everywhere.
2. **Data model**: Store and filter data by school year. Same class name (e.g. 5AHET) can have different students, schedules, grades, and assignments per year.
3. **Backward compatibility**: Migrate existing data into school year 2025/2026 so current behavior is preserved.
4. **No env at runtime**: Current school year and semester are derived from the DB (SchoolYear table and current date). No env vars for school year or semester change in normal operation.

---

## 1. Current state (before school year)

- **Class**: Global, `name` unique. No year.
- **Student**: `classId` (one current class). No year.
- **Schedule**: `classId`; a class can have multiple schedules. No year.
- **TeacherAssignment**, **Grade**, **FinalGrade**, **NotenmanagementTransfer**: No year.

Everything is effectively "current" or "latest"; there is no school year dimension.

---

## 2. Schema changes (Prisma + migrations) ✅ DONE

### 2a. New table: SchoolYear

- `id` Int, PK
- `label` String unique (e.g. `"2025/2026"`)
- `startDate` DateTime (e.g. 1 Sep 2025)
- `endDate` DateTime (e.g. 10 Jul 2026)
- `semesterChangeDate` DateTime (e.g. 15 Feb 2026) — day when first semester ends / second semester starts; used by notensammler and semester logic. Stored per school year.
- Optional: `isCurrent` Boolean

Relations: referenced by Schedule, Grade, FinalGrade, NotenmanagementTransfer, TeacherAssignment, ClassMembership.

### 2b. New table: ClassMembership (student–class–year)

- `id` Int, PK
- `studentId` Int, FK → Student
- `classId` Int, FK → Class
- `schoolYearId` Int, FK → SchoolYear
- Unique `[studentId, schoolYearId]` (one class per student per year)
- Indexes on studentId, classId, schoolYearId

**No promotion / "move class up" logic.** Students and classes are imported fresh each year; we do not derive next year’s class from the previous year. Each school year gets its own fresh set of student, class, and teacher data (via import); the goal is to preserve that data and link it to a year for archive purposes. When importing for a new year, create/update ClassMembership (and Student/Class/TeacherAssignment as needed) for that year only. **Student.classId** stays for backward compatibility during migration; long-term it can be deprecated in favor of ClassMembership for the selected year.

### 2c. Add schoolYearId to existing tables

- **Schedule**: `schoolYearId` Int, FK → SchoolYear, required. Index.
- **TeacherAssignment**: `schoolYearId` Int, FK → SchoolYear, required. Index. Unique per year: e.g. `@@unique([classId, period, groupId, schoolYearId])`.
- **Grade**: `schoolYearId` Int, FK → SchoolYear, required. Index. Unique: `[studentId, teacherId, classId, semester, schoolYearId]`.
- **FinalGrade**: `schoolYearId` Int, FK → SchoolYear, required. Index. Unique: `[studentId, classId, semester, schoolYearId]`.
- **NotenmanagementTransfer**: `schoolYearId` Int, FK → SchoolYear, required. Index. Unique: `[classId, semester, schoolYearId]`.

### 2d. Migration strategy

All existing data is migrated into **school year 2025/2026** only (no data for years before that).

1. Create SchoolYear and ClassMembership tables.
2. Add schoolYearId columns as nullable first.
3. Create exactly one school year: label `"2025/2026"`, startDate/endDate e.g. 2025-09-08 / 2026-07-10, semesterChangeDate e.g. 2026-02-15 (hardcode in migration).
4. Backfill: set schoolYearId = that 2025/2026 year for all existing Schedule, TeacherAssignment, Grade, FinalGrade, NotenmanagementTransfer. For Student: insert ClassMembership (studentId, classId, schoolYearId) for every Student where classId is not null.
5. Make schoolYearId non-nullable; add FKs and uniques.
6. Optional: later deprecate Student.classId in favor of ClassMembership for the selected year.

Future years (2026/2027, etc.) are created via /admin/data (School Years tab) or seed, not by migration.

### 2e. Admin: School Years under /admin/data ✅ DONE

- **New tab** on `src/app/admin/data/page.tsx`: "School Years", added to modelTabs and renderTabContent.
- **New component** `src/app/admin/data/_components/school-year-tab.tsx`: same pattern as SchoolHolidayTab — DataTable with columns id (readonly), label, startDate, endDate, semesterChangeDate, optional isCurrent, createdAt/updatedAt (readonly). CRUD via GET/POST/PUT/DELETE `/api/admin/data?model=schoolYear`.
- **Admin data API** `src/app/api/admin/data/route.ts`: add `'schoolYear'` to validModels; implement getAllRecords, getSingleRecord, createRecord, updateRecord, deleteRecord for model schoolYear. Create/update accept label, startDate, endDate, semesterChangeDate, isCurrent.

Admins can set start/end and semester change date per year and add new years without code changes.

---

## 3. App: year context and header dropdown ✅ DONE

### 3a. School year context (React)

- **Provider**: e.g. SchoolYearProvider holding selected year (schoolYearId or label). Persist in URL (query param) or localStorage.
- **Hook**: `useSchoolYear()` returns `{ selectedYear, years, currentSemester, setSchoolYear, isLoading }`. `currentSemester` is derived from selected year’s semesterChangeDate (first/second).
- **Placement**: Provider in app layout (e.g. `src/app/providers.tsx`) so header and all pages share the same year.

### 3b. Header dropdown

- **Location**: `src/components/layout/header.tsx` — add dropdown (e.g. next to logo). Options: labels from GET /api/school-years.
- **Data source**: GET /api/school-years returning `[{ id, label, startDate, endDate, semesterChangeDate }]`. Default selection: "current" year (derive by comparing current date with each SchoolYear’s startDate/endDate) or last selected (localStorage). Use selected year’s semesterChangeDate from DB for current-semester and notensammler logic.
- **On change**: Update context (and URL/localStorage); pages that depend on year refetch.

---

## 4. No env needed for school year / semester

- **Current school year**: Derive by comparing **current date** with each SchoolYear’s startDate and endDate (the year where today is between start and end). Use for default dropdown selection and optional "current" badge.
- **Current semester** and **semester change date**: Use the **selected** school year’s semesterChangeDate from the DB. Helper: `getCurrentSemesterFromSchoolYear(semesterChangeDate, referenceDate?)` in `src/types/school-year.ts`; context exposes `currentSemester: 'first' | 'second' | null`.
- **Env**: NEXT_PUBLIC_SCHOOL_YEAR_START, NEXT_PUBLIC_SCHOOL_YEAR_END, NEXT_PUBLIC_SEMESTER_CHANGE_MMDD are **not** needed for normal operation. Only the migration that creates the initial 2025/2026 row may hardcode dates; after that, admins manage years and dates in /admin/data.

---

## 5. API changes

### 5a. New API ✅ DONE

- **GET /api/school-years** — Returns list of school years (id, label, startDate, endDate, semesterChangeDate). Used by header dropdown and by semester/notensammler logic.

### 5b. APIs that must filter by school year (read) ✅ DONE

- **Classes**: GET /api/classes?schoolYearId= — return only classes that have at least one Schedule, ClassMembership, or TeacherAssignment in that year.
- **Schedules**: Add schoolYearId to where (e.g. schedules/route.ts, schedules/data/route.ts).
- **Teacher assignments**: All routes that fetch TeacherAssignment add `where: { schoolYearId }`.
- **Notensammler**: Teacher classes, class by id, grades, final-grades, transfer, preview, pdf — all take schoolYearId (query or body) and filter by it.
- **Students**: List students in a class for a year via ClassMembership (classId + schoolYearId). When assigning class, write ClassMembership for selected year.
- **Export / PDF / Excel**: Pass school year and filter data by it.

### 5c. APIs that must write school year (create/update) ✅ DONE

- Schedule, TeacherAssignment, Grade, FinalGrade, NotenmanagementTransfer: set schoolYearId from context/param on create/update.
- ClassMembership: create/update on student import (POST /api/students/import/save with optional schoolYearId; admin students import page passes selected year).

### 5d. Passing year from client ✅ DONE

- Notensammler, schedule create, class-settings, admin students import pass selected schoolYearId from context to APIs.

---

## 6. Pages and features to adapt ✅ DONE (semesterChangeDate optional)

- **Notensammler**: All fetches include selected schoolYearId. Class and student lists are for that year. Optional: use selected year’s semesterChangeDate from DB for current-semester logic.
- **Schedule create / overview / teachers / rotation**: Load and save schedules and assignments for selected year.
- **Class settings**: Fetches classes with schoolYearId; student-class assignment is via import (ClassMembership created there).
- **Export (Excel, PDF, schedule dates, notenliste)**: Accept school year and filter by it.
- **Admin students import**: Passes selected year to import/save; ClassMembership created for that year.

---

## 7. Implementation order

1. **Schema**: ✅ Add SchoolYear (with semesterChangeDate), ClassMembership, nullable schoolYearId on Schedule, TeacherAssignment, Grade, FinalGrade, NotenmanagementTransfer; migration + backfill (2025/2026 with semesterChangeDate); then non-null and uniques.
2. **Admin School Years**: ✅ Add schoolYear to admin data API (validModels + CRUD); add "School Years" tab and school-year-tab.tsx on admin/data page.
3. **API school-years**: ✅ GET /api/school-years (id, label, startDate, endDate, semesterChangeDate).
4. **Context + header**: ✅ SchoolYearProvider, useSchoolYear, header dropdown; persist selection (e.g. localStorage or query).
5. **APIs (read)**: ✅ Classes, schedules, teacher-assignments, notensammler (all), students (class by year), export filter by schoolYearId.
6. **APIs (write)**: ✅ All create/update set schoolYearId; ClassMembership on student import.
7. **Pages**: ✅ Notensammler, schedule flows, class-settings, admin students import pass selected year. Optional: use selected year’s semesterChangeDate from DB for current-semester logic.
8. **Cleanup**: ⏳ Optional deprecation of Student.classId in favor of ClassMembership for the selected year.

---

## 8. Files to touch (summary)

| Area       | Status | Files / changes |
| ---------- | ------ | --------------- |
| Schema     | ✅     | `prisma/schema.prisma`: SchoolYear (with semesterChangeDate), ClassMembership, schoolYearId on Schedule, TeacherAssignment, Grade, FinalGrade, NotenmanagementTransfer. New migration(s). |
| Env        | ✅     | No env needed for runtime. School year and semester from DB. Migration can hardcode 2025/2026 dates. Do not add NEXT_PUBLIC_SCHOOL_YEAR_* or SEMESTER_CHANGE_MMDD for normal operation. |
| Admin data | ✅     | `src/app/admin/data/page.tsx`: add "School Years" tab; `src/app/admin/data/_components/school-year-tab.tsx`: new component; `src/app/api/admin/data/route.ts`: add model schoolYear and CRUD. |
| Context    | ✅     | New: `src/contexts/school-year-context.tsx` (provider + hook). `src/app/providers.tsx`: wrap with SchoolYearProvider. |
| Header     | ✅     | `src/components/layout/header.tsx`: add year dropdown; use useSchoolYear and GET /api/school-years. `src/components/school-year-selector.tsx`. |
| API new    | ✅     | New: `src/app/api/school-years/route.ts` (id, label, startDate, endDate, semesterChangeDate). |
| API filter | ✅     | classes, schedules, notensammler (all), students (class+year), export: schoolYearId param and Prisma where. |
| API write  | ✅     | Schedule, TeacherAssignment, Grade, FinalGrade, NotenmanagementTransfer, ClassMembership on student import. |
| Pages      | ✅     | Notensammler, schedule flows, class-settings, admin students import pass schoolYearId from context. Optional: semesterChangeDate from DB. |

---

## 9. Open decisions

- **URL vs localStorage**: Store selected year in URL (e.g. `?year=2025%2F2026`) for shareable links, or localStorage for simplicity.
- **Creating future years**: Admin UI (/admin/data School Years tab) or seed. No env needed.
- **Student.classId**: Keep for compatibility and sync from ClassMembership for selected year, or remove after full migration.
