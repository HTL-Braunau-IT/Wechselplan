import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const p = path.join(__dirname, '..', 'src', 'app', 'noten', 'page.tsx')
let s = fs.readFileSync(p, 'utf8')

s = s.replace(/import \{ useTranslation \} from 'react-i18next'\r?\n/, '')
s = s.replace(/\tconst \{ t \} = useTranslation\('common'\)\r?\n/, '')

const pairs = [
  [`\${t('noten.gruppe')}`, 'Gruppe'],
  [`t('noten.searchNoNameResult', { defaultValue: 'Kein passender Schüler gefunden.' })`, `'Kein passender Schüler gefunden.'`],
  [`t('noten.searchError', { defaultValue: 'Suche fehlgeschlagen.' })`, `'Suche fehlgeschlagen.'`],
  [`t('noten.searchNoDateResult', { defaultValue: 'An diesem Datum wurden keine Gruppen gefunden.' })`, `'An diesem Datum wurden keine Gruppen gefunden.'`],
  [`t('noten.noSchoolYear')`, `'Kein Schuljahr ausgewählt.'`],
  [`t('navigation.noten')`, `'Noten - In Testphase'`],
  [`t('noten.noClasses')`, `'Keine Klassen zugewiesen.'`],
  [`t('noten.teachingSlotLabel', { defaultValue: 'Tag' })`, `'Tag'`],
  [`t('noten.selectTeachingSlot', {\n\t\t\t\t\t\t\t\t\t\t\tdefaultValue: 'Tag auswählen'\n\t\t\t\t\t\t\t\t\t\t})`, `'Tag auswählen'`],
  [`t('noten.selectTeachingSlot', {\n\t\t\t\t\t\t\t\t\t\t\tdefaultValue: 'Tag auswählen'\n\t\t\t\t\t\t\t\t\t\t})`, `'Tag auswählen'`],
]

// setSearchMessage block for date count - multiline
s = s.replace(
  /setSearchMessage\(\s*t\('noten\.searchDateResultCount', \{\s*defaultValue: '\{\{count\}\} Klassen\/Gruppen an diesem Datum gefunden\.',\s*count: matches\.length\s*\}\)\s*\)/,
  'setSearchMessage(`${matches.length} Klassen/Gruppen an diesem Datum gefunden.`)'
)

for (const [a, b] of pairs) {
  if (!s.includes(a) && a.includes('selectTeachingSlot')) continue
  s = s.split(a).join(b)
}

// selectTeachingSlot might have different whitespace - try simpler
s = s.replace(
  /placeholder=\{t\('noten\.selectTeachingSlot', \{\s*defaultValue: 'Tag auswählen'\s*\}\)\}/,
  "placeholder={'Tag auswählen'}"
)

const simple = [
  [`{t('noten.gruppe')}`, '{Gruppe}'],
  [`t('noten.searchTitle', { defaultValue: 'Suche' })`, `'Suche'`],
  [`t('noten.searchCollapse', { defaultValue: 'Suche ausblenden' })`, `'Suche ausblenden'`],
  [`t('noten.searchExpand', { defaultValue: 'Suche einblenden' })`, `'Suche einblenden'`],
  [`t('noten.searchHelp', { defaultValue: 'Suche nach Name (wechselt zur Klasse/Gruppe) oder nach Datum (zeigt alle Klassen/Gruppen dieses Tages).' })`, `'Suche nach Name (wechselt zur Klasse/Gruppe) oder nach Datum (zeigt alle Klassen/Gruppen dieses Tages).'`],
  [`t('noten.searchNamePlaceholder', { defaultValue: 'Name suchen …' })`, `'Name suchen ...'`],
  [`t('noten.searchNameAction', { defaultValue: 'Name suchen' })`, `'Name suchen'`],
  [`t('noten.searchNextMatch', { defaultValue: 'Nächster Treffer' })`, `'Nächster Treffer'`],
  [`t('noten.searchDateAction', { defaultValue: 'Datum suchen' })`, `'Datum suchen'`],
  [`t('noten.searchDateSectionsTitle', { defaultValue: 'Klassen/Gruppen am gewählten Datum' })`, `'Klassen/Gruppen am gewählten Datum'`],
  [`t('noten.searchOpenGroup', { defaultValue: 'In Tabelle öffnen' })`, `'In Tabelle öffnen'`],
  [`t('noten.searchNoStudentsInGroup', { defaultValue: 'Keine Schülerdaten für diese Gruppe gefunden.' })`, `'Keine Schülerdaten für diese Gruppe gefunden.'`],
  [`t('noten.weights')`, `'Gewichtung'`],
  [`t('noten.wiederholung')`, `'Wiederholung'`],
  [`t('noten.bericht')`, `'Bericht'`],
  [`t('noten.mitarbeit')`, `'Mitarbeit'`],
  [`t('noten.praktischeArbeit')`, `'Praktische Arbeit'`],
  [`t('noten.weightsMustSum100')`, `'Summe muss 100% sein'`],
  [`t('common.saving')`, `'Speichere...'`],
  [`t('common.save')`, `'Speichern'`],
  [`t('noten.expandAllDays', { defaultValue: 'Alle aufklappen' })`, `'Alle aufklappen'`],
  [`t('noten.collapseAllDays', { defaultValue: 'Alle Tage zuklappen' })`, `'Alle Tage zuklappen'`],
  [`t('noten.notenmanagementEintragGruppe', { n: selectedGroupId, defaultValue: \`Notenmanagement Eintrag Gruppe \${selectedGroupId}\` })`, '`Notenmanagement Eintrag Gruppe ${selectedGroupId}`'],
  [`t('noten.collapseSemester1', { defaultValue: '1. Semester zuklappen' })`, `'1. Semester zuklappen'`],
  [`t('noten.collapseSemester2', { defaultValue: '2. Semester zuklappen' })`, `'2. Semester zuklappen'`],
  [`t('noten.name')`, `'Name'`],
  [`t('noten.expandDay', { defaultValue: 'Tag aufklappen' })`, `'Tag aufklappen'`],
  [`t('noten.collapseDay', { defaultValue: 'Tag zuklappen' })`, `'Tag zuklappen'`],
  [`t('noten.tag')`, `'Tag'`],
  [`t('noten.semester2', { defaultValue: '2. Sem.' })`, `'2. Sem.'`],
  [`t('noten.semester1', { defaultValue: '1. Sem.' })`, `'1. Sem.'`],
  [`t('noten.anwesenheit')`, `'Anwesenheit'`],
  [`t('noten.notizen')`, `'Notizen'`],
  [`t('noten.nichtAnwesendTage', { defaultValue: 'Nicht anwesend' })`, `'Nicht anwesend'`],
  [`t('noten.anwesendTage', { defaultValue: 'Anwesend' })`, `'Anwesend'`],
  [`t('noten.alleTage', { defaultValue: 'Alle Tage' })`, `'Alle Tage'`],
  [`t('noten.anwesenheitProzent', { defaultValue: 'Anw. %' })`, `'Anw. %'`],
  [`t('noten.gradeBerechnet', { defaultValue: 'Note' })`, `'Note'`],
  [`t('noten.endnoteSem1', { defaultValue: 'Endn. 1' })`, `'Endn. 1'`],
  [`t('noten.betragenSem1', { defaultValue: 'Betr. 1' })`, `'Betr. 1'`],
  [`t('noten.endnoteSem2', { defaultValue: 'Endn. 2' })`, `'Endn. 2'`],
  [`t('noten.betragenSem2', { defaultValue: 'Betr. 2' })`, `'Betr. 2'`],
  [`t('noten.gradeGestundet', { defaultValue: 'Gestundet' })`, `'Gestundet'`],
  [`t('noten.gradeNichtBeurteilt', { defaultValue: 'Nicht beurteilt' })`, `'Nicht beurteilt'`],
  [`t('noten.lehrstoff')`, `'Lehrstoff'`],
  [`t('noten.notizen', { defaultValue: 'Notizen' })`, `'Notizen'`],
  [`t('noten.lehrstoff', { defaultValue: 'Lehrstoff' })`, `'Lehrstoff'`],
  [`t('common.save', { defaultValue: 'Speichern' })`, `'Speichern'`],
  [`t('noten.notenmanagementEintragSemesterTitle', { defaultValue: 'Semester wählen' })`, `'Semester wählen'`],
  [`t('noten.uebertragSem1', { defaultValue: '1. Semester' })`, `'1. Semester'`],
  [`t('noten.uebertragSem2', { defaultValue: '2. Semester' })`, `'2. Semester'`],
  [`t('noten.notenmanagementEintragListTitle', { defaultValue: 'Notenstand – Schülerliste' })`, `'Notenstand – Schülerliste'`],
  [`t('noten.uebertragMissing', { defaultValue: '–' })`, `'–'`],
  [`t('common.cancel')`, `'Abbrechen'`],
  [`t('noten.notenmanagementUsernameRequired', { defaultValue: 'Notenmanagement-Benutzername erforderlich.' })`, `'Notenmanagement-Benutzername erforderlich.'`],
  [`t('noten.notenmanagementPasswordRequired', { defaultValue: 'Passwort erforderlich.' })`, `'Passwort erforderlich.'`],
  [`t('noten.notenmanagementEintragSubmit', { defaultValue: 'An Notenmanagement übertragen' })`, `'An Notenmanagement übertragen'`],
  [`t('notensammler.nmPasswordTitle', 'Notenmanagement Anmeldung')`, `'Notenmanagement Anmeldung'`],
  [`t('notensammler.nmPasswordDesc', 'Bitte gib deine Anmeldedaten für Notenmanagement ein.')`, `'Bitte gib deine Anmeldedaten für Notenmanagement ein.'`],
  [`t('noten.username', { defaultValue: 'Benutzername' })`, `'Benutzername'`],
  [`t('noten.password', { defaultValue: 'Passwort' })`, `'Passwort'`],
  [`t('common.ok', { defaultValue: 'OK' })`, `'OK'`],
]

for (const [a, b] of simple) {
  s = s.split(a).join(b)
}

// remainingPeriod uses template in defaultValue
s = s.replace(
  /t\('noten\.remainingPeriod', \{ defaultValue: `Rest \$\{currentPeriod\}` \}\)/,
  '`Rest ${currentPeriod}`'
)
s = s.replace(`t('noten.remainingFullYear', { defaultValue: 'Rest Schuljahr' })`, '`Rest Schuljahr`')
s = s.replace(`t('noten.remainingSemester', { defaultValue: 'Rest Semester' })`, '`Rest Semester`')

// Fix mistaken backticks - the above might have broken - read file section
// Actually remainingFullYear should be string 'Rest Schuljahr' not template
s = s.replace('`Rest Schuljahr`', "'Rest Schuljahr'")
s = s.replace('`Rest Semester`', "'Rest Semester'")

// deps arrays
s = s.replace('}, [t])', '}, [])')
s = s.replace('[searchText, schoolYearId, t, gotoNameMatch]', '[searchText, schoolYearId, gotoNameMatch]')
s = s.replace('[searchDate, schoolYearId, selectedWeekdayFilter, t]', '[searchDate, schoolYearId, selectedWeekdayFilter]')

fs.writeFileSync(p, s)
console.log('written', p)
console.log('t( remaining:', (s.match(/\bt\(/g) || []).length)
