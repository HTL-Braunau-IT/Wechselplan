# GET /api/teachers/me

Returns the `Teacher` record belonging to the signed-in user.

**Access tier:** `staff` (unmatched prefix → default; enforced in the handler with `denyUnlessAccess('staff')`).

## Why it exists

Clients used to derive this themselves:

```ts
fetch(`/api/teachers/by-username?username=${session.user.name}`)
```

After the Entra migration `session.user.name` is the **display name** ("Anna Müller"), which normalises to `anna müller` and never matches a `Teacher.username` stored from the UPN (`anna.mueller`). The lookup 404s and the caller silently behaves as though the user taught nothing — no highlighted column in the Notensammler, no export buttons in the schedule views.

This endpoint resolves the row server-side with `resolveSessionTeacher` (`src/lib/session-teacher.ts`), which keys on the Entra object id first and only then falls back to username and e-mail. See also `resolveSessionStudent` for the student-side equivalent.

## Request

No parameters. Identity comes from the session cookie.

## Response `200`

```json
{
  "teacher": {
    "id": 7,
    "firstName": "Anna",
    "lastName": "Müller",
    "username": "anna.mueller",
    "email": "anna.mueller@example.at"
  }
}
```

When the account has no `Teacher` row (an admin, a directory account that was never synced) the response is still `200`:

```json
{ "teacher": null }
```

This is deliberate. Callers treat a non-OK response as "could not tell", which is a different state from "definitely not a teacher" — a 404 here made every consumer implement the distinction itself, and most got it wrong.

## Response `500`

```json
{ "error": "Failed to resolve teacher" }
```

## Consumers

- `src/hooks/use-current-teacher.ts` — the shared client hook; prefer this over calling the endpoint directly.
- `src/app/notensammler/_hooks/use-notensammler-data.ts`
- `src/app/schedules/page.tsx`
- `src/components/schedule-overview.tsx`
