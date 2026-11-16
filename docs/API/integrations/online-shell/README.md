# Online-Shell integration

Online-Shell (the browser shell for Bash/PowerShell
exercises) mirrors a teacher's classes and groups from Wechselplan and writes
exercise results back into the Noten grid. Both apps key people and classes on
the same Entra ids: `Student.externalId` / `Teacher.externalId` = Entra object
id, `Class.externalId` = Entra (M365) group id.

**Auth:** server to server. Every request carries the shared secret
`ONLINE_SHELL_API_SECRET` as `x-online-shell-secret: <secret>` (or
`Authorization: Bearer <secret>`). Unset secret → `503`, wrong secret → `401`.
The teacher the call acts for is named in the body (`teacher: { oid, email }`,
matched like a session: object id, then e-mail); unknown or deactivated → `404`.
Both routes are `public` in `API_ACCESS_RULES` only so the session check does
not reject the caller; the handlers enforce the secret (`src/lib/online-shell/auth.ts`).

## POST `/api/integrations/online-shell/classes`

Body: `{ "teacher": { "oid": "…", "email": "…" } }`

The real classes the teacher teaches in the current school year (combined
classes are expanded into their member classes), with each weekday the
teacher has the class, that day's groups, the group members and the teacher's
teaching days (`src/lib/teaching-days.ts`) for each group.

```json
{
  "teacher": { "id": 7, "firstName": "Anna", "lastName": "Huber" },
  "schoolYear": { "id": 3, "label": "2026/2027" },
  "classes": [
    {
      "id": 12,
      "name": "3AHITS",
      "externalId": "<entra group id>",
      "students": [{ "oid": "…", "email": "…", "firstName": "…", "lastName": "…" }],
      "days": [
        {
          "weekday": 1,
          "planClassId": 12,
          "planClassName": "3AHITS",
          "groups": [
            {
              "groupId": 1,
              "students": [{ "oid": "…", "email": "…" }],
              "teachingDays": [{ "date": "2026-11-09", "period": "AM" }]
            }
          ]
        }
      ]
    }
  ]
}
```

## POST `/api/integrations/online-shell/grades`

Requires the `noten` feature. Writes one column of `NotenEntry` per student.

```json
{
  "teacher": { "oid": "…", "email": "…" },
  "classExternalId": "<entra group id of the real class>",
  "field": "praktischeArbeit1",
  "overwrite": false,
  "entries": [{ "studentOid": "…", "date": "2026-11-09", "period": "AM", "grade": 2 }]
}
```

`field`: `praktischeArbeit1|2`, `mitarbeit1|2`, `wiederholung1|2`, `bericht1|2`.
`grade`: 1–5 in half steps. At most 500 entries.

Each entry is filed under (teacher, the student's real class, the student's
group on that weekday's plan, school year of the date, date, period). Only
the chosen column is written; attendance, notes and other marks are kept.

Response: `{ "results": [{ "studentOid": "…", "status": "written" }] }` with
`status` one of

| status             | meaning                                                              |
| ------------------ | -------------------------------------------------------------------- |
| `written`          | stored                                                               |
| `unchanged`        | the cell already had this mark                                       |
| `exists`           | the cell has a different mark (`existing`) and `overwrite` was false |
| `invalid`          | bad date/period/grade                                                |
| `unknown_student`  | no active student with that oid in the class that year               |
| `no_school_year`   | the date is in no school year                                        |
| `no_group`         | the student has no group on that weekday                             |
| `not_teaching_day` | not one of the teacher's teaching days for the student's group       |
