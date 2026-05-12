import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const p = path.join(__dirname, '..', 'src', 'app', 'schedule', 'create', 'page.tsx')
let s = fs.readFileSync(p, 'utf8')

s = s.replace(/\r?\nimport \{ useTranslation \} from 'next-i18next'/, '')

s = s.replace(
  /const WEEKDAY_LABEL_KEYS = \['monday', 'tuesday', 'wednesday', 'thursday', 'friday'\] as const\r?\n/,
  "const WEEKDAY_LABELS_DE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'] as const\n"
)

s = s.replace(/\r?\n\tconst \{ t \} = useTranslation\('schedule'\)\r?\n\tconst \{ t: tCommon \} = useTranslation\('common'\)/, '')

s = s.replace(
  /\tconst updateAssignmentsMessage = t\('updateAssignmentsMessage'\)\.replace\('Lehrerzuweisungen', 'Schülerzuweisungen'\)/,
  "\tconst updateAssignmentsMessage = 'Es existieren bereits Schülerzuweisungen für diese Klasse. Möchten Sie die bestehenden Zuweisungen mit den neuen Daten aktualisieren?'"
)

s = s.replace(
  /setError\(t\('tooManyStudentsError', \{ max: MAX_SUPPORTED_STUDENTS, count: studentsData\.length \}\)\)/,
  'setError(`Diese Klasse hat ${studentsData.length} Schüler, aber maximal ${MAX_SUPPORTED_STUDENTS} Schüler werden unterstützt. Bitte reduzieren Sie die Anzahl der Schüler oder kontaktieren Sie den Administrator.`)'
)

s = s.replace(
  /\{tCommon\(`overview\.weekdays\.\$\{WEEKDAY_LABEL_KEYS\[scheduleWeekday - 1\]\}`\)\}/,
  '{WEEKDAY_LABELS_DE[scheduleWeekday - 1]}'
)

s = s.replace(
  /\{tCommon\(`overview\.weekdays\.\$\{WEEKDAY_LABEL_KEYS\[wd - 1\]\}`\)\}/,
  '{WEEKDAY_LABELS_DE[wd - 1]}'
)

const simple = [
  [`setError(t('maxGroupSizeError'))`, `setError('Eine Gruppe darf nicht mehr als 12 Schüler haben')`],
  [`setError(t('bothClassesRequired'))`, `setError('Beide Klassen sind erforderlich')`],
  [`setError(t('selectDifferentClasses'))`, `setError('Bitte wählen Sie zwei verschiedene Klassen aus')`],
  [`setError(t('combinedClassNameRequired'))`, `setError('Name der zusammengeführten Klasse ist erforderlich')`],
  [`setError(t('classesCombinedError'))`, `setError('Klassen konnten nicht zusammengeführt werden.')`],
  [`{needsWeekdayPick ? t('selectClass') : t('studentsOfClass', { class: selectedClass })}`, "{needsWeekdayPick ? 'Klasse auswählen' : `Schüler der Klasse ${selectedClass}`}"],
  [`<p>{t('loadingClasses')}</p>`, `<p>Lade Klassen...</p>`],
  [`{needsWeekdayPick ? t('help.classSelection') : t('help.groupAssignment')}`, "{needsWeekdayPick ? 'Wählen Sie hier eine Klasse und einen Wochentag aus, um den Wechselplan für diesen Tag zu erstellen oder zu bearbeiten.' : 'Teilen Sie die Schülerinnen und Schüler per Drag-and-drop in Gruppen ein und prüfen Sie die Gruppengröße, bevor Sie fortfahren.'}"],
  [`{t('class')}`, "{'Klasse'}"],
  [`placeholder={t('pleaseSelect')}`, `placeholder={'Bitte wählen...'}`],
  [`<Label className="block font-medium">{t('selectWeekday')}</Label>`, `<Label className="block font-medium">Wochentag auswählen</Label>`],
  [`<p className="text-sm text-muted-foreground">{t('loadingStudents')}</p>`, `<p className="text-sm text-muted-foreground">Lade Schüler...</p>`],
  [`{t('next')}`, "{'Weiter'}"],
  [`{t('combineClasses')}`, "{'Klassen zusammenführen'}"],
  [`<h2 className="text-lg font-semibold sr-only">{t('studentsOfClass', { class: selectedClass })}</h2>`, '<h2 className="text-lg font-semibold sr-only">{`Schüler der Klasse ${selectedClass}`}</h2>'],
  [`{t('numberOfGroups')}:`, "{'Anzahl Gruppen'}:"],
  [`{t('resetGroups')}`, "{'Gruppen zurücksetzen'}"],
  [`<DialogTitle>{t('maxGroupSizeError')}</DialogTitle>`, "<DialogTitle>{'Eine Gruppe darf nicht mehr als 12 Schüler haben'}</DialogTitle>"],
  [`{t('maxGroupSizeDescription')}`, "{'Bitte wählen Sie eine andere Gruppe oder erstellen Sie eine neue Gruppe, um weitere Schüler aufzunehmen.'}"],
  [`{t('ok')}`, "{'OK'}"],
  [`<DialogTitle>{t('updateAssignmentsTitle')}</DialogTitle>`, "<DialogTitle>{'Zuweisungen aktualisieren'}</DialogTitle>"],
  [`{t('cancel')}`, "{'Abbrechen'}"],
  [`{t('update')}`, "{'Aktualisieren'}"],
]

for (const [a, b] of simple) {
  const c = s.split(a).length - 1
  if (c === 0) console.warn('No match:', a.slice(0, 80))
  s = s.split(a).join(b)
}

s = s.replace(/\s+t=\{t\}\r?\n/, '\n')

fs.writeFileSync(p, s)
console.log('done create page, t left:', (s.match(/\bt\(/g) || []).length)
