/**
 * Renders every transactional e-mail the app sends, filled with sample data, so
 * the branded HTML shell (`src/server/email-template.ts`) can be eyeballed in a
 * browser without a mailbox, a database or a real send.
 *
 * The four bodies mirror what the real callers build:
 *   - schedule notification  (src/app/api/schedules/notify-teachers/route.ts)
 *   - notification digest    (src/lib/notification-digest.ts)
 *   - Sokrates grade-change  (src/lib/sokrates-lock.ts)
 *   - support request        (src/app/api/support/route.ts)
 *
 * Run with:
 *   npm run email:preview            # writes to .email-preview/
 *   npm run email:preview -- /tmp/x  # writes somewhere else
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderEmailHtml, esc, muted } from '../src/server/email-template'

// A base URL so the preview shows the CTA buttons the real mails render when
// NEXTAUTH_URL is set. Absolute links in the fixtures below stand in for it.
process.env.NEXTAUTH_URL ??= 'https://wechselplan.example.at'

const scheduleNotification = renderEmailHtml({
  preheader: 'Ein neuer Wechselplan für die Klasse 3AHIT steht bereit.',
  title: 'Neuer Wechselplan',
  intro: [
    'Hallo Maria Gruber,',
    'es wurde ein Wechselplan für die Klasse 3AHIT erstellt. Öffne ihn direkt über die Schaltfläche unten.',
  ],
  button: {
    label: 'Wechselplan öffnen',
    href: 'https://wechselplan.example.at/schedules?class=3AHIT',
  },
  outro: ['Viele Grüße,\nDas Wechselplan-Team'],
})

const digestItems = [
  { text: 'Note in 3AHIT eingetragen (Mathematik)', date: '15.09., 08:12' },
  { text: 'Sokrates-Übertragung für 2BHIT abgeschlossen', date: '15.09., 09:40' },
  { text: 'Neuer Wechselplan für 1CHIT erstellt', date: '16.09., 07:55' },
]
const digest = renderEmailHtml({
  preheader: 'Du hast 3 ungelesene Benachrichtigung(en) in Wechselplan.',
  title: 'Ungelesene Benachrichtigungen',
  intro: [
    'Hallo Maria,',
    'Du hast 3 ungelesene Benachrichtigung(en) in Wechselplan, die seit mehr als 24 Stunden offen sind:',
  ],
  panel: {
    tone: 'info',
    itemsHtml: digestItems.map(e => `${esc(e.text)} ${muted(`(${e.date})`)}`),
  },
  button: { label: 'Wechselplan öffnen', href: 'https://wechselplan.example.at/' },
})

const changes = [
  {
    student: 'Anna Aigner',
    teacher: 'B. Moser',
    semester: '1. Semester',
    oldGrade: '3',
    newGrade: '2',
  },
  {
    student: 'Tobias Fuchs',
    teacher: 'C. Ebner',
    semester: '2. Semester',
    oldGrade: '4',
    newGrade: '3',
  },
]
const sokrates = renderEmailHtml({
  preheader: 'In der Klasse 4AHIT wurden 2 Noten nach der Sokrates-Übertragung geändert.',
  title: 'Notenänderung nach Sokrates-Übertragung',
  intro: [
    'In der Klasse 4AHIT wurde(n) 2 Note(n) geändert, nachdem sie als in Sokrates eingetragen markiert wurde(n).',
    'Geändert von: Anna Huber',
  ],
  panel: {
    tone: 'warning',
    title: '2 geänderte Note(n)',
    itemsHtml: changes.map(
      ch =>
        `${esc(ch.student)} — ${esc(ch.teacher)} ${muted(`(${ch.semester})`)}: ` +
        `${esc(ch.oldGrade)} &rarr; <strong style="color:#0F172A;">${esc(ch.newGrade)}</strong>`,
    ),
  },
  button: {
    label: 'Notensammler öffnen',
    href: 'https://wechselplan.example.at/notensammler?class=4AHIT',
  },
  outro: ['Bitte prüfen, ob die Note in Sokrates nachgezogen werden muss.'],
})

const supportMessage =
  'Beim Speichern der Noten für die 2CHIT bekomme ich seit heute Früh einen Fehler.\n\nKönnt ihr euch das bitte ansehen? Danke!'
const support = renderEmailHtml({
  preheader: 'Support-Anfrage von Maria Gruber',
  title: 'Neue Support-Anfrage',
  intro: ['Von: Maria Gruber', 'Seite: /notensammler?class=2CHIT'],
  panel: {
    tone: 'neutral',
    title: 'Nachricht',
    bodyHtml: `<div style="font:400 15px/1.65 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#334155;white-space:pre-wrap;">${esc(
      supportMessage,
    )}</div>`,
  },
})

const files: Record<string, string> = {
  'schedule-notification.html': scheduleNotification,
  'notification-digest.html': digest,
  'sokrates-change.html': sokrates,
  'support-request.html': support,
}

const outDir = resolve(process.cwd(), process.argv[2] ?? '.email-preview')
mkdirSync(outDir, { recursive: true })
for (const [name, html] of Object.entries(files)) {
  const path = resolve(outDir, name)
  writeFileSync(path, html, 'utf8')
  console.log(`wrote ${path}`)
}
