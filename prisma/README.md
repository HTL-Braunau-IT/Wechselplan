# Database seeding

`seed.ts` is the single entry point. The Docker image bundles it to
`prisma/seed.mjs`, which the `migrate` job runs when `RUN_DB_SEED=true`.

| Part | What | When |
|---|---|---|
| Generic (`seed.ts`) | Roles `admin`, `teacher`, `student` | Always. The app also creates these on first login, so this is a convenience. |
| Profile `htl-braunau` (`seed-profiles/htl-braunau.ts`) | Upper Austrian school holidays, HTL Braunau bell schedule and breaks, learning contents, rooms, subjects | Only with `--profile htl-braunau` or `SEED_PROFILE=htl-braunau` |

Other schools run no profile and maintain holidays, times, rooms, subjects and
learning contents under **Admin → Daten**.

No part creates people: teachers, classes and students come from the Entra
sync. For local click-around data see `scripts/seed-local-fixtures.ts`
(`npm run db:seed:local`).

## Running

```bash
npm run db:seed                 # generic only
npm run db:seed:htl-braunau     # generic + HTL Braunau
```

In Docker, set `RUN_DB_SEED=true` (and `SEED_PROFILE=htl-braunau` for us) in the
stack's `.env` for one rollout, then set `RUN_DB_SEED` back to `false`.

## Maintaining the HTL Braunau profile

Every write is an upsert keyed by name (holidays, rooms, subjects, learning
contents) or by start/end/period (times, breaks), so the seed is safe to re-run.
For a new school year, update the holiday dates in
`seed-profiles/htl-braunau.ts` and run the seed once. Rows are upserted by
name, so last year's rows move to the new dates.

## Adding a profile for another school

Create `seed-profiles/<school>.ts` exporting `async (prisma) => { … }` and
register it in the `PROFILES` map in `seed.ts`.
