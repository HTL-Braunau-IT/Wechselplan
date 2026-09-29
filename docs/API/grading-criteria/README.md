# Grading criteria API (Beurteilungskriterien)

Each teacher keeps their own grading-criteria templates; their students see the
applicable one on their home page. Logic lives in `src/lib/grading-criteria.ts`,
the document shape in `src/types/grading-criteria.ts`.

## Model

- A teacher has any number of templates (`GradingCriteria`).
- At most one is `isDefault`: it applies to every class the teacher teaches.
- A template can be assigned to classes (`GradingCriteriaClass`); for those
  classes it replaces the default. One template per teacher and class — assigning
  a class moves it off the teacher's other template.
- `shareToken` is the secret of the template's public, view-only link
  (`/kriterien/<token>`). `null` = not shared.

### Which template a student sees

For each teacher in the student's Wechselplan this school year (every planned
weekday, AM and PM, any Turnus), first match wins:

1. the template assigned to the class that owns the plan (for a member of a
   combined class, the combined class),
2. the template assigned to the student's own class,
3. the teacher's default.

Teachers with no match are left out.

### Content

```json
{
  "intro": "Free text; bare URLs render as links",
  "sections": [
    {
      "title": "Mitarbeit",
      "criteria": [{ "title": "Pünktlichkeit", "points": ["Pünktliches Erscheinen"] }]
    }
  ],
  "closing": "Free text"
}
```

A criterion with an empty `title` renders its points directly under the section.
Blank rows are dropped on save.

## Endpoints

| Method | Path                               | Tier    | Description                                                   |
| ------ | ---------------------------------- | ------- | ------------------------------------------------------------- |
| GET    | `/api/grading-criteria`            | staff   | Own templates + classes taught this year (`?schoolYearId=`)   |
| POST   | `/api/grading-criteria`            | staff   | Create a template → `201 { id }`                              |
| PUT    | `/api/grading-criteria/[id]`       | staff   | Replace a template (content, default flag, exact class set)   |
| DELETE | `/api/grading-criteria/[id]`       | staff   | Delete a template, its class assignments and share link → 204 |
| POST   | `/api/grading-criteria/[id]/share` | staff   | Create or replace the share link → `{ shareToken }`           |
| DELETE | `/api/grading-criteria/[id]/share` | staff   | Revoke the share link → `{ shareToken: null }`                |
| GET    | `/api/me/grading-criteria`         | session | The signed-in student's criteria, one entry per teacher       |

Every staff endpoint is scoped to the session's teacher: another teacher's
template id is a `404`. A session without a teacher profile gets `403`.

POST/PUT body:

```json
{
  "title": "Kriterien zur Leistungsbeurteilung",
  "subtitle": "Werkstätte Max Mustermann",
  "content": { "intro": "", "sections": [], "closing": "" },
  "isDefault": true,
  "classIds": [12, 14]
}
```

`classIds` may only contain classes the teacher teaches (any school year) or
already holds an assignment for; anything else is a `403`.

`GET /api/me/grading-criteria` response:

```json
[
  {
    "teacherId": 5,
    "teacherFirstName": "Norbert",
    "teacherLastName": "Buttinger",
    "subjects": ["Werkstätte"],
    "criteria": {
      "title": "…",
      "subtitle": null,
      "content": {},
      "teacherName": "…",
      "updatedAt": "…"
    }
  }
]
```

## Share links

`/kriterien/<token>` is a public page (no API route), rendered on the server and
marked `noindex`. The 144-bit random token is the only credential. Replacing
the token breaks the old link, and revoking it turns the page into a 404
immediately.
