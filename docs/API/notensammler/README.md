# Notensammler API

Grade collection per class — teachers enter marks per subject for both
semesters, results are transferred to the external Notenmanagement system, and
(separately) the class lead records when grades have been entered into
**Sokrates**, the government Zeugnis system Wechselplan cannot write to.

Most Notensammler endpoints (`grades`, `grades/batch`, `class/[id]`,
`final-grades`, `transfer`, `pdf`) are currently documented inline in the code.
This folder documents the cross-cutting pieces:

- [`sokrates.md`](./sokrates.md) — the Sokrates transfer marker, edit lock, and
  the change-notification flow (in-app bell + email to the class lead).

Saving grades also pings the Klassenleiter through the in-app bell, so they can
see the sheet filling up without asking. That channel is documented in
[`../notifications/README.md`](../notifications/README.md).

All routes require the **staff** access tier; the Sokrates mutating routes
additionally require the caller to be the class's `classLead` or an admin.
