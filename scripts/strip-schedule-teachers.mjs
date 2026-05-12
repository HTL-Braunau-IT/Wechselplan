import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const p = path.join(__dirname, '..', 'src', 'app', 'schedule', 'create', 'teachers', 'page.tsx')
let s = fs.readFileSync(p, 'utf8')

s = s.replace(/\r?\nimport \{ useTranslation \} from 'next-i18next'/, '')

s = s.replace(/\r?\n\tconst \{ t \} = useTranslation\('schedule'\)\r?\n\tconst \{ t: tCommon \} = useTranslation\('common'\)/, '')

s = s.replace(
  /\tconst existingAssignmentsWarning = t\('existingAssignmentsWarning'\)\.replace\('Lehrerzuweisungen', 'Schülerzuweisungen'\)/,
  "\tconst existingAssignmentsWarning = 'Es existieren bereits Schülerzuweisungen für diese Klasse. Änderungen werden die bestehenden Zuweisungen aktualisieren.'"
)

s = s.replace(
  /\t\t\t\t\t\{t\('rotationDay'\)\}:\{' '\}\s*\r?\n\t\t\t\t\t\{tCommon\(\s*`overview\.weekdays\.\$\{\(\['monday', 'tuesday', 'wednesday', 'thursday', 'friday'\]\[selectedWeekday - 1\] \?\? 'monday'\)\}`\s*\)\}/,
  "\t\t\t\t\t{'Turnustag'}: {'Montag,Dienstag,Mittwoch,Donnerstag,Freitag'.split(',')[selectedWeekday - 1] ?? 'Montag'}"
)

// Simpler: replace the paragraph block manually with read - use two-step

const simple = [
  [`setError(t('errors.loadTeacherAssignments'))`, `setError('Daten konnten nicht geladen werden. Bitte versuchen Sie es erneut.')`],
  [`setError(t('errors.saveTeacherAssignments'))`, `setError('Zuweisungen konnten nicht gespeichert werden. Bitte versuchen Sie es erneut.')`],
  [`setError(t('errors.updateTeacherAssignments'))`, `setError('Zuweisungen konnten nicht aktualisiert werden. Bitte versuchen Sie es erneut.')`],
  [`<div className="p-4">{t('loading')}</div>`, `<div className="p-4">Laden...</div>`],
  [`<div className="p-4">{t('noClassSelected')}</div>`, `<div className="p-4">Keine Klasse ausgewählt</div>`],
  [`<CardTitle>{t('teacherAssignment')} - {selectedClass}</CardTitle>`, '<CardTitle>{`Lehrerzuweisung - ${selectedClass}`}</CardTitle>'],
  [`{t('help.teachers')}`, "{'Weisen Sie jeder Gruppe Lehrperson, Fach, Lerninhalt und Raum zu. Sie können Einträge auch manuell ergänzen oder aus dem Vormittag übernehmen.'}"],
  [`{t('rotationDay')}:{' '}`, "{'Turnustag'}: "],
  [`title={t('morningAssignments')}`, `title={'Vormittagszuweisungen'}`],
  [`title={t('afternoonAssignments')}`, `title={'Nachmittagszuweisungen'}`],
  [`{t('copyFromAm')}`, "{'Von Vormittag kopieren'}"],
  [`{t('back')}`, "{'Zurück'}"],
  [`{loading ? t('saving') : t('next')}`, "{loading ? 'Wird gespeichert...' : 'Weiter'}"],
  [`<DialogTitle>{t('updateAssignmentsTitle')}</DialogTitle>`, "<DialogTitle>{'Zuweisungen aktualisieren'}</DialogTitle>"],
  [`{t('cancel')}`, "{'Abbrechen'}"],
  [`{t('update')}`, "{'Aktualisieren'}"],
  [`<DialogTitle>{t('validationErrorsTitle')}</DialogTitle>`, "<DialogTitle>{'Validierungsfehler'}</DialogTitle>"],
  [`<h3 className="font-semibold mb-2 text-foreground">{t('morningAssignments')}</h3>`, `<h3 className="font-semibold mb-2 text-foreground">Vormittagszuweisungen</h3>`],
  [`<h3 className="font-semibold mb-2 text-foreground">{t('afternoonAssignments')}</h3>`, `<h3 className="font-semibold mb-2 text-foreground">Nachmittagszuweisungen</h3>`],
  [`{t('group')}`, "{'Gruppe'}"],
  [`<Button onClick={() => setShowErrorDialog(false)}>{t('ok')}</Button>`, `<Button onClick={() => setShowErrorDialog(false)}>OK</Button>`],
]

for (const [a, b] of simple) {
  if (!s.includes(a.split('\n')[0])) console.warn('maybe missing:', a.slice(0, 60))
  s = s.split(a).join(b)
}

const FIELD_DE = { teacher: 'Lehrer', subject: 'Fach', learningContent: 'Lerninhalt', room: 'Raum' }
s = s.replace(
  /\{error\.missingFields\.map\(field => t\(field\)\)\.join\(', '\)\}/g,
  `{error.missingFields.map((field) => FIELD_LABEL_DE[field as keyof typeof FIELD_LABEL_DE] ?? field).join(', ')}`
)

// Add const near top after imports - inject after first blank line in file or after interfaces
if (!s.includes('FIELD_LABEL_DE')) {
  s = s.replace(
    /^('use client'\r?\n\r?\n)/,
    "$1const FIELD_LABEL_DE = { teacher: 'Lehrer', subject: 'Fach', learningContent: 'Lerninhalt', room: 'Raum' } as const\n\n"
  )
}

// Fix rotation weekday paragraph - read current file state
const rotRe = /\{t\('rotationDay'\)\}:\{' '\}\s*\r?\n\s*\{tCommon\([\s\S]*?\)\}/
if (rotRe.test(s)) {
  s = s.replace(
    rotRe,
    `{'Turnustag'}: {(['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'][selectedWeekday - 1] ?? 'Montag')}`
  )
}

fs.writeFileSync(p, s)
console.log('teachers t left:', (s.match(/\bt\(/g) || []).length)
