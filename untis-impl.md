# Untis Integration Implementation Progress

**Project:** Automatic absence tracking integration for /noten page  
**Status:** Planning Complete → Implementation Ready  
**Date Started:** 2026-02-24  
**School Year:** 2025/2026

---

## Project Overview

Integrate Untis API to automatically fetch student absence data for the /noten page. The system authenticates with Untis using environment credentials, creates a fresh session per request, and fetches absences on-demand when a teacher accesses their current active group on today's date.

**Key Features:**
- Password-based authentication (credentials from env variables)
- On-demand sync triggered when teacher opens current active group on today's date
- Full-day absences (before 11:30 AND after 12:00) marked as "Entschuldigt"
- Partial absences appended to text field with German time notation
- No session persistence (fresh session per request)
- Filters to active group students only

---

## Implementation Checklist

### Phase 1: Infrastructure & Configuration

- [ ] **1.1** Create Untis client module
  - Location: `src/server/untis/client.ts`
  - Handle JSON-RPC requests to Untis API
  - Implement password authentication flow
  - Fresh session per request (login/logout cycle)
  - Method: `fetchAbsences(schoolYear, classId, groupId, date)`
  - Error handling for session timeout, invalid credentials, network errors
  
- [ ] **1.2** Extend environment variables
  - Location: `src/env.js`
  - Add: `UNTIS_SCHOOL` (string, required)
  - Add: `UNTIS_BASE_URL` (string, required, e.g., "xyz.webuntis.com")
  - Add: `UNTIS_USERNAME` (string, required)
  - Add: `UNTIS_PASSWORD` (string, required)
  - Use Zod validation with `.min(1)` for all
  - Mark as server-side only (not `NEXT_PUBLIC_`)

### Phase 2: Data Model & API

- [ ] **2.1** Create Absence data model
  - Location: `prisma/schema.prisma`
  - Model name: `Absence`
  - Fields:
    - `id` (Int, @id, @default(autoincrement()))
    - `studentId` (String, FK to Student, optional for external fallback)
    - `studentName` (String)
    - `classId` (String, FK to Class)
    - `groupId` (String, optional)
    - `date` (DateTime)
    - `startTime` (Int, minutes from midnight)
    - `endTime` (Int, minutes from midnight)
    - `reason` (String, optional)
    - `reasonId` (Int, optional)
    - `excuseStatus` (String, e.g., "EXCUSED", "UNEXCUSED")
    - `text` (String, optional)
    - `untisId` (Int, optional, for deduplication)
    - `createdAt` (DateTime, @default(now()))
    - `updatedAt` (DateTime, @updatedAt)
  - Relations: Many-to-One with Class, optional Many-to-One with Student

- [ ] **2.2** Create Prisma migration
  - Command: `npx prisma migrate dev --name add_absence_model`
  - Verify migration applies successfully
  
- [ ] **2.3** Build Untis fetch API route
  - Location: `src/app/api/untis/absences/route.ts`
  - Method: `POST`
  - Request body: `{ classId: string, groupId: string, date: string (ISO date) }`
  - Response: `{ absences: Absence[], fetchedAt: Date }`
  - Auth: Require NextAuth session, verify teacher role
  - Flow:
    1. Validate request parameters
    2. Initialize Untis client with env credentials
    3. Authenticate with Untis
    4. Fetch absences for date from Untis API
    5. Filter to students in specified group
    6. Parse Untis Absence interface to app Absence model
    7. Return absence data (or optionally persist first)
  - Error handling: Try-catch with Sentry logging

### Phase 3: Frontend Integration & Logic

- [ ] **3.1** Implement time period detection helper
  - Location: `src/lib/untis-helpers.ts` (or `src/server/untis/helpers.ts`)
  - Function: `isCoveringFullDay(startTime: number, endTime: number): boolean`
  - Logic:
    - AM period: starts before 11:30 (690 minutes)
    - PM period: starts >= 12:00 (720 minutes)
    - Full day coverage: `startTime < 690 && endTime > 720`
  - Unit test: Verify with test cases (e.g., 08:00-17:00 = true, 10:00-12:00 = false)

- [ ] **3.2** Create absence processing logic
  - Location: `src/lib/untis-helpers.ts` or inline in noten page
  - Function: `processAbsenceData(absences: Absence[], notenEntries: NotenEntry[]): NotenEntryUpdate[]`
  - Logic:
    - For each absence:
      - If full day: update `NotenEntry.attendance = "Entschuldigt"` for student
      - If partial: append to `NotenEntry.text` format: `"Abwesend HH:MM-HH:MM Uhr (Grund)"`
        - Convert startTime/endTime (minutes) to HH:MM format
        - Append only, don't replace existing text
  - Return list of `NotenEntry` updates to save

- [ ] **3.3** Integrate sync trigger into noten page
  - Location: `src/app/noten/page.tsx`
  - Add hook: Detect when teacher navigates to today's date on current active group
  - Trigger conditions (all must be true):
    - Current date equals selected date
    - Current active group equals selected group
    - First load or date/group changes
  - On trigger:
    - Call `POST /api/untis/absences` with classId, groupId, date
    - On success: Process absence data using helper
    - Update `NotenEntry` records with attendance or text changes
    - Save changes to database
    - Handle errors gracefully (log, optionally show toast)
  - Performance: Cache result to avoid repeated fetches within same session

---

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Auth Method | Username/Password | Simplest, credentials stored in env |
| Session Lifecycle | Fresh per request | No persistence needed, avoids session timeout issues |
| Sync Trigger | On-demand (page load) | Only fetches when teacher actively needs it |
| Time Periods | AM < 11:30, PM ≥ 12:00 | Align with typical school schedule (blocks of 3-4 lessons) |
| Data Scope | Current group only | Avoid fetching unnecessary student data |
| Absence Merge | Set attendance or append text | Full-day absences explicit, partial preserved for context |
| Storage | Cache in Absence model | Allow reference lookup, audit trail |

---

## Testing Checklist

- [ ] **Unit Tests**
  - [ ] Time period detection (`isCoveringFullDay`) with edge cases
  - [ ] Absence data processing logic
  - [ ] Untis client authentication flow

- [ ] **Integration Tests**
  - [ ] API route auth & validation
  - [ ] Untis API connection & data parsing
  - [ ] Absence data filtering by group

- [ ] **End-to-End Tests**
  - [ ] Navigate to noten page on today's date with current active group
  - [ ] Verify Untis fetch is triggered automatically
  - [ ] Verify full-day absences show as "Entschuldigt"
  - [ ] Verify partial absences show time/reason in text
  - [ ] Verify no duplicate syncs within same session

---

## Known Constraints & Notes

1. **AM/PM Detection**: Based on lesson start time only (< 11:30 vs ≥ 12:00). Blocks of 3-4 lessons assumed.
2. **Credential Rotation**: Currently no support for credential rotation; would require manual env update.
3. **Session Timeout**: Untis server-side timeout < 10 minutes idle. Mitigated by fresh session per request.
4. **Data Sync Direction**: One-way from Untis → Noten. Teacher can still manually override in UI.
5. **Group Scope**: Only fetches absences for students in current active group, not entire class.

---

## Dependencies

- Untis API (JSON-RPC 2.0 endpoint)
- Existing Prisma models: Student, Class, ClassGroup, NotenEntry
- NextAuth session management (for auth checks)
- Existing Noten page component architecture

---

## Success Criteria

✅ Untis credentials configured in environment  
✅ Absence model migrated to database  
✅ API route successfully fetches and filters absence data from Untis  
✅ Teacher loads noten page on today's date with current active group  
✅ Full-day absences auto-marked as "Entschuldigt"  
✅ Partial absences show time/reason in text field  
✅ No errors or session timeouts during fetch  
✅ No data duplication on repeated loads  

---

**Last Updated:** 2026-02-24  
**Next Step:** Begin Phase 1.1 (Create Untis client module)