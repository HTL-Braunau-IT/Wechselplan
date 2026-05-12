import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const p = path.join(__dirname, '..', 'src', 'app', 'notensammler', 'page.tsx')
let s = fs.readFileSync(p, 'utf8')

s = s.replace(/import \{ useTranslation \} from 'react-i18next'\r?\n/, '')
s = s.replace(/\tconst \{ t \} = useTranslation\(\)\r?\n/, '')

s = s.replace(
  /setError\(t\('notensammler\.classNotFound', `Klasse "\$\{classNameParam\}" nicht gefunden\.`\)\)/,
  'setError(`Klasse "${classNameParam}" nicht gefunden.`)'
)

s = s.replace(/\[classes, searchParams, selectedClassId, t\]/, '[classes, searchParams, selectedClassId]')

const pairs = [
  [`t('notensammler.title', 'Notensammler')`, `'Notensammler'`],
  [`t('common.close', 'Schließen')`, `'Schließen'`],
  [`t('notensammler.selectClass', 'Klasse auswählen')`, `'Klasse auswählen'`],
  [`t('notensammler.selectClassPlaceholder', 'Bitte Klasse auswählen...')`, `'Bitte Klasse auswählen...'`],
  [`t('notensammler.tooltipAllClassesPdf', 'Lädt eine Datei mit allen eigenen Noten herunter.')`, `'Lädt eine Datei mit allen eigenen Noten herunter.'`],
  [`t('notensammler.downloadingAllClassesPdf', 'PDF wird erstellt...')`, `'PDF wird erstellt...'`],
  [`t('notensammler.downloadAllClassesPdf', 'Notenliste alle eigenen Klassen als PDF')`, `'Notenliste alle eigenen Klassen als PDF'`],
  [`t('notensammler.infoTitle', 'Hinweise')`, `'Hinweise'`],
  [`(t('notensammler.infoText', 'Betragensnote: Hier kann jeder Lehrer seinen Wunsch eintragen.\\nNotenliste alle Klassen als PDF: Lädt eine Datei mit allen eigenen Noten herunter.\\nPDF Herunterladen: Lädt die gesamte Notenliste der ausgewählten Klasse herunter.\\nAn Notenmanagement übertragen: Überträgt die Noten an das Notenmanagement.') as string)`, `('Betragensnote: Hier kann jeder Lehrer seinen Wunsch eintragen.\\nNotenliste alle Klassen als PDF: Lädt eine Datei mit allen eigenen Noten herunter.\\nPDF Herunterladen: Lädt die gesamte Notenliste der ausgewählten Klasse herunter.\\nAn Notenmanagement übertragen: Überträgt die Noten an das Notenmanagement.' as string)`],
  [`t('notensammler.firstSemesterShort', '1. Sem')`, `'1. Sem'`],
  [`t('notensammler.secondSemesterShort', '2. Sem')`, `'2. Sem'`],
  [`t('notensammler.selectWeekday', 'Wochentag')`, `'Wochentag'`],
  [`t('notensammler.selectWeekdayPlaceholder', 'Wochentag wählen...')`, `'Wochentag wählen...'`],
  [`t('notensammler.currentSemester', 'Aktuell')`, `'Aktuell'`],
  [`t('notensammler.firstSemester', '1. Semester')`, `'1. Semester'`],
  [`t('notensammler.secondSemester', '2. Semester')`, `'2. Semester'`],
  [`t('notensammler.showFirstSemester', '1. Semester anzeigen')`, `'1. Semester anzeigen'`],
  [`t('notensammler.transferred', 'Übertragen')`, `'Übertragen'`],
  [`t('notensammler.showSecondSemester', '2. Semester anzeigen')`, `'2. Semester anzeigen'`],
  [`t('notensammler.savingAll', 'Speichere...')`, `'Speichere...'`],
  [`t('notensammler.saveAll', 'Alle speichern')`, `'Alle speichern'`],
  [`t('notensammler.tooltipDownloadPdf', 'Lädt die gesamte Notenliste der ausgewählten Klasse herunter.')`, `'Lädt die gesamte Notenliste der ausgewählten Klasse herunter.'`],
  [`t('notensammler.downloadingPdf', 'PDF wird erstellt...')`, `'PDF wird erstellt...'`],
  [`t('notensammler.downloadPdf', 'PDF herunterladen')`, `'PDF herunterladen'`],
  [`t('notensammler.tooltipTransfer', 'Überträgt die Noten an das Notenmanagement.')`, `'Überträgt die Noten an das Notenmanagement.'`],
  [`t('notensammler.transferToNotenmanagement', 'An Notenmanagement übertragen')`, `'An Notenmanagement übertragen'`],
  [`t('notensammler.classLead', 'Klassenleitung')`, `'Klassenleitung'`],
  [`t('notensammler.sortBy', 'Sortieren nach')`, `'Sortieren nach'`],
  [`t('notensammler.sortByLastName', 'Nachname')`, `'Nachname'`],
  [`t('notensammler.sortByGroup', 'Gruppennummer')`, `'Gruppennummer'`],
  [`t('notensammler.sortAscending', 'Aufsteigend')`, `'Aufsteigend'`],
  [`t('notensammler.sortDescending', 'Absteigend')`, `'Absteigend'`],
  [`t('notensammler.vormittag', 'Vormittag')`, `'Vormittag'`],
  [`t('notensammler.nachmittag', 'Nachmittag')`, `'Nachmittag'`],
  [`t('notensammler.id', 'ID')`, `'ID'`],
  [`t('notensammler.group', 'Gruppe')`, `'Gruppe'`],
  [`t('notensammler.student', 'Schüler')`, `'Schüler'`],
  [`t('notensammler.average', 'Durchschnitt')`, `'Durchschnitt'`],
  [`t('notensammler.endnoteFirstSemester', 'Endnote (1. Semester)')`, `'Endnote (1. Semester)'`],
  [`t('notensammler.conductNoteWish', 'Betragensnote (Wunsch)')`, `'Betragensnote (Wunsch)'`],
  [`t('notensammler.endnoteSecondSemester', 'Endnote (2. Semester)')`, `'Endnote (2. Semester)'`],
  [`t('notensammler.deleteTeacherGrades', 'Alle Noten für diesen Lehrer löschen')`, `'Alle Noten für diesen Lehrer löschen'`],
  [`t('notensammler.saving', 'Speichere...')`, `'Speichere...'`],
  [`t('notensammler.nmPasswordTitle', 'Notenmanagement Anmeldung')`, `'Notenmanagement Anmeldung'`],
  [`t('notensammler.nmPasswordDesc', 'Bitte gib deine Anmeldedaten für Notenmanagement ein.')`, `'Bitte gib deine Anmeldedaten für Notenmanagement ein.'`],
  [`t('notensammler.username', 'Benutzername')`, `'Benutzername'`],
  [`t('notensammler.password', 'Passwort')`, `'Passwort'`],
  [`t('common.cancel', 'Abbrechen')`, `'Abbrechen'`],
  [`t('common.continue', 'Weiter')`, `'Weiter'`],
  [`t('notensammler.nmSemesterTitle', 'Semester auswählen')`, `'Semester auswählen'`],
  [`t('notensammler.nmSemesterDesc', 'Welches Semester möchtest du übertragen?')`, `'Welches Semester möchtest du übertragen?'`],
  [`t('notensammler.loading', 'Lade...')`, `'Lade...'`],
  [`t('notensammler.nmPreviewTitle', 'Vorschau: Übertragung an Notenmanagement')`, `'Vorschau: Übertragung an Notenmanagement'`],
  [`t('notensammler.nmPreviewMeta', 'Klasse')`, `'Klasse'`],
  [`t('notensammler.subject', 'Fach')`, `'Fach'`],
  [`t('notensammler.teachers', 'Lehrer')`, `'Lehrer'`],
  [`t('notensammler.nmUnmatchedWarning', 'Unmatched Schüler werden nicht übertragen.')`, `'Unmatched Schüler werden nicht übertragen.'`],
  [`t('notensammler.grade', 'Note')`, `'Note'`],
  [`t('notensammler.matrikelnummer', 'Matrikelnummer')`, `'Matrikelnummer'`],
  [`t('notensammler.matrikelnummer', 'Matr.')`, `'Matr.'`],
  [`t('notensammler.match', 'Match')`, `'Match'`],
  [`t('notensammler.nmStudentsWithoutGradeOrMatch', 'Schüler in Notenmanagement ohne Zuordnung oder Note')`, `'Schüler in Notenmanagement ohne Zuordnung oder Note'`],
  [`t('notensammler.lastName', 'Nachname')`, `'Nachname'`],
  [`t('notensammler.firstName', 'Vorname')`, `'Vorname'`],
  [`t('notensammler.class', 'Klasse')`, `'Klasse'`],
  [`t('notensammler.keineNote', 'Keine Note')`, `'Keine Note'`],
  [`t('notensammler.transferring', 'Übertrage...')`, `'Übertrage...'`],
  [`t('notensammler.updateTransfer', 'Aktualisieren')`, `'Aktualisieren'`],
  [`t('notensammler.transferNow', 'Jetzt übertragen')`, `'Jetzt übertragen'`],
  [`t('notensammler.nmSuccessTitle', 'Übertragung erfolgreich')`, `'Übertragung erfolgreich'`],
  [`t('notensammler.nmErrorTitle', 'Übertragung fehlgeschlagen')`, `'Übertragung fehlgeschlagen'`],
  [`t('notensammler.nmLfId', 'LF_ID')`, `'LF_ID'`],
  [`t('notensammler.nmSent', 'Übertragen')`, `'Übertragen'`],
  [`t('notensammler.nmUnknownError', 'Unbekannter Fehler')`, `'Unbekannter Fehler'`],
  [`t('notensammler.nmConfirmation', 'Übertragene Noten')`, `'Übertragene Noten'`],
  [`t('notensammler.note', 'Note')`, `'Note'`],
]

for (const [a, b] of pairs) {
  const n = s.split(a).length - 1
  if (n === 0 && !a.includes('infoText')) {
    console.warn('No match for:', a.slice(0, 80))
  }
  s = s.split(a).join(b)
}

fs.writeFileSync(p, s)
console.log('t( count:', (s.match(/\bt\(/g) || []).length)
