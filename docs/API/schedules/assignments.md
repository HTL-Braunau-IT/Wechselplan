# Group Assignments API

Student groups of one class **for one weekday's plan**. A class can be split into different groups
on each weekday; rows live in `StudentWeekdayGroup` (`studentId`, plan `classId`, `schoolYearId`,
`selectedWeekday`, `groupId`). For a combined class, `classId` is the combined class and the roster
is the union of its member classes.

## GET /api/schedules/assignments

```http
GET /api/schedules/assignments?classId=4&weekday=3&schoolYearId=1
```

| Parameter      | Type   | Required | Description                                          |
| -------------- | ------ | -------- | ---------------------------------------------------- |
| `classId`      | number | Yes      | Class id                                             |
| `weekday`      | number | Yes\*    | Weekday of the plan (1 = Monday … 5 = Friday)        |
| `schoolYearId` | number | No       | Defaults to the current school year                  |

\* Without `weekday` the legacy class-wide grouping (`Student.groupId` / `GroupAssignment`) is
returned; the wizard always sends one.

**200 OK**

```json
{
  "assignments": [{ "groupId": 1, "studentIds": [12, 15] }],
  "unassignedStudents": [{ "id": 20, "firstName": "…", "lastName": "…", "groupId": null }],
  "weekday": 3,
  "seededFromWeekday": null
}
```

A weekday with no stored grouping yet is **seeded**: from the earliest other weekday that has one,
else from `Student.groupId`. `seededFromWeekday` then names the source day (or stays `null` for the
`Student.groupId` seed). Nothing is written until a POST.

## POST /api/schedules/assignments

```json
{
  "classId": 4,
  "weekday": 3,
  "schoolYearId": 1,
  "assignments": [{ "groupId": 1, "studentIds": [12, 15] }],
  "removedStudentIds": []
}
```

Replaces that weekday's grouping wholesale. `groupId: 0` is "unassigned" and stores no row;
students outside the class roster are ignored. Other weekdays and `Student.groupId` are **not**
touched. Staff only.

Without `weekday` the legacy class-wide path runs (updates `Student.groupId` and `GroupAssignment`).

## Related

- `DELETE /api/schedules?classId=&weekday=` removes a day's grouping along with its plan.
- `POST /api/schedules/clone` copies the source day's grouping to the target day.
- `POST /api/students/[id]/transfer` (optional `weekday`) drops the student's groups outside the
  target class and places them in the target group on that day and on every other day of the
  target class where that group number exists.
