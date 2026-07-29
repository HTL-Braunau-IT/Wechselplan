# Teachers API

Endpoints for reading teacher records.

| Endpoint | Method | Tier | Purpose |
| --- | --- | --- | --- |
| `/api/teachers` | GET | staff | All teachers (id, name, username), ordered by surname. |
| `/api/teachers` | POST | admin | Create a teacher (used by the admin area, not by directory sync). |
| [`/api/teachers/me`](./me.md) | GET | staff | The `Teacher` row for the signed-in user. |
| `/api/teachers/by-username` | GET | staff | Lookup by `username`. |
| `/api/teachers/photo` | GET | session | Profile photo proxy. |
| `/api/teachers/import` | POST | admin | Bulk import. |

## Resolving "who am I"

Use [`/api/teachers/me`](./me.md), never `by-username` with `session.user.name`. Post-Entra that value is a display name, not a username, so the lookup finds nobody and the caller degrades silently. `by-username` remains for the case it is actually named for: looking up a teacher by a username you already hold.
