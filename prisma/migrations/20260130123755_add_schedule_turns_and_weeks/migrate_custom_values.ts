/**
 * Data migration script to mark existing custom values as isCustom = true
 * 
 * This script identifies values that were likely created by users (not from seed/import)
 * by checking if they exist in the seed data. Values not in seed data are marked as custom.
 * 
 * Run with: npx tsx prisma/migrations/20260130123755_add_schedule_turns_and_weeks/migrate_custom_values.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Seed data from prisma/seed.ts
const SEEDED_ROOMS = [
  'E02', 'E03', 'E17', 'E31', 'E33', 'E37', 'E45', 'E46', 'E47', 'E48',
  'E56', 'E57', 'E61', 'E62', 'E63', 'E64', 'E65', 'E66', 'E68', 'E68a',
  'E68b', 'E69', 'E72', 'E73', 'E74', 'E76', 'E77', 'E78', 'E78a', 'E79',
  'E80', 'E81', 'E82', 'E83', 'E84', 'E85', 'E86', 'E89', '142', '143',
  '144', '145', '146', '147', '148', '149', '146/E68', 'EDV 1', 'EDV 2',
  'EDV 3', 'B&R'
]

const SEEDED_SUBJECTS = [
  'WEPT-Grundausb. Mechanik', 'PBE4-Baugruppenfertigung 1',
  'WPT-4 Mechan. Grundausbildung für Elektrotechnik', 'COPR-Computerinfrastruktur',
  'WPT4-Blechbearbeitung', 'WEPT-Elektronik', 'PBE4-Baugruppenfertigung 2',
  'WPT4-Steuerungstechnik 1', 'COPR- Computerpraktikum', 'WPT4-Mechanische Werkstätte',
  'WEPT-Nieder-/Hochfrequenztechnik', 'PBE3-Computertechnik', 'WPT4-Mechatronik',
  'WPT3-Arbeitsvorbereitung', 'WEPT/WLA-Arbeitsvorbereitung', 'PBE3-Consumer-Electronics',
  'WPT3-Automatisierungstechnik und Robotik 1', 'WEPT-Grundausb. Elektrotechnik',
  'PBE4-Kunststofftechnik', 'WPT4-Elektroinstallation 1', 'WPT4-Elektrotechnische Grundausbildung',
  'WEPT-Computer-/Netzwerktechnik', 'PBE4-Computertechnik 1', 'COPR- Netzwerktechnik',
  'WPT4-Geräte und Gehäusebau', 'WEPT-Elektronik', 'PBE3-Digitaltechnik 1',
  'WPT4-Steuerungstechnik 2', 'WPT3-Leierplattentechnik', 'WEPT/WLA-Nieder-/Hochfrequenztechnik',
  'PBE3-Digitaltechnik 2', 'WPT3-Messechnik und Qualitätsmanagement', 'WEPT-Grundausb. Elektronik',
  'PBE4-Leiterplattenfertigung 1', 'WPT4-Elektronik 1', 'COPR-Elektromechanik',
  'WPT4-Kunststofftechnik', 'WEPT-Kommunikationstechnik', 'PBE4-Digitaltechnik 1',
  'WPT4-Oberflächentechnik', 'WEPT-Computer-/Netzwerktechnik', 'PBE3-Gerätebau',
  'WEPT/WLA-Kommunikationstechnik', 'PBE3-Kommunikationssysteme 2', 'WPT3-Automatisierung',
  'WEPT-Kunststofftechnik', 'PBE4-Mech. Grundausbildung', 'COPR-Elektronische Grundschaltungen',
  'WEPT-Gerätebau', 'PBE4-Leiterplattenfertigung 2', 'COPR-Digitalschaltungen',
  'WPT4-Niederspannungsinstallation', 'WEPT-Kommunikationstechnik', 'PBE3-Kommunikationssyst. 1',
  'WPT4-Werkstätte für Elektronik', 'WEPT/WLA-Industrielle Elektronik', 'PBE3-Messtechnik 2',
  'WPT3-CAD Fertigungs- und Montagetechnik', 'PBE4-Verbindungstechnik 1', 'COPR-Elektrotechnik',
  'WPT4-Mechanische Werkstätte', 'WEPT-Installationstechnik', 'PBE4-SMD-Technik',
  'COPR-Elektronische Schaltungen', 'WPT4-Bereich Montage und Wartung', 'WEPT-Industrielle Elektronik',
  'PBE3-Messtechnik 1', 'WPT4-Werkstätte für Steuerungstechnik', 'PBE3-Netzwerkinstallation 2',
  'ELWP-Elektronik', 'PBE4-Verbindungstechnik 2', 'WPT4-Schweißen',
  'PBE3-Netzwerkinstallation 1', 'PBE3-Steuer-/Regelungstechnik', 'ELWP-Elektrotechnik',
  'COPR-Systemtechnik', 'COPR-Energieversorgungssysteme', 'WPT4-Computertechnik',
  'PBE4-Computertechnik 2', 'ELWP-Fertigungssteuerung/Überwachung', 'ELWP-Mechan. Grundausbildung',
  'COPR-IT Infrastruktursysteme', 'ELWP-Gerätebau', 'COPR-Netzwerkinfrastruktur',
  'PBE4-Consumer-Electronics', 'ELWP-Industrieelle Elektronik', 'NWWP-Computertechnik',
  'ELWP-Kunststofftechnik', 'COPR-Netzwerktechnik', 'NWWP-Kommunikationselektronik',
  'PBE4-Digitaltechnik 2', 'NWWP-Netzwerktechnik', 'COPR-Systemtechnik',
  'PBE4-Gerätebau', 'NWWP-Nieder-/Hochfrequenztechnik', 'COPR-Verkabelungssysteme',
  'PBE4-Kommunikationssyst.', 'COPR-Gebäudeinstallation', 'PBE4-Netzwerkinstallation'
]

const SEEDED_LEARNING_CONTENTS = [
  'Analogschaltungen', 'Antriebstechnik', 'Arbeitsplanung', 'Arbeitsvorbereitung',
  'Assemblierung', 'Bauelemente', 'Baugruppen', 'Baugruppenfertigung', 'Bauteilkunde',
  'Beleuchtungstechnik', 'Beschaffungswesen', 'Betriebssysteme', 'Bussysteme', 'CAD', 'CAM',
  'Computer assemblieren', 'Computersysteme', 'Datenleitungen', 'Datenübertragungseinrichtungen',
  'Digitalschaltungen', 'Drehen', 'Drehen/Fräsen', 'Eagle-CAD', 'Elektroakustik',
  'Elektromechanik', 'Elektronik', 'Elektronische Grundschaltungen', 'Elektronische Schaltungen',
  'Elektropneumatik', 'Elektrotechnik', 'Elektrotechnik fest', 'Elektrotechnik flexibel',
  'Energieversorgungssysteme', 'Fehlersuche', 'Festnetzkommunikation', 'Fräsen',
  'Gebäudeinstallation', 'Gehäusefertigung', 'Gehäusetechnik', 'Gerätebau', 'Hardwarekonfiguration',
  'Hartlöten', 'HF-Technik', 'Industrieroboter', 'Kalkulation', 'Klebetechnik', 'Kommunikationstechnik',
  'Leistungselektronik', 'Leiterplattenfertigung', 'Logikschaltungen', 'Löttechnik',
  'Mechan. Grundausbildung', 'Mechatronische Systeme', 'Mediendesign', 'Messtechnik',
  'Messübungen', 'Messübungen/Fehlersuche', 'Messysteme', 'Mobile Kommunikationstechnik',
  'Montagearbeiten IT-Systeme', 'Montagesysteme', 'Netzwerktechnik', 'Netzwerkverkabelungen',
  'NF-Technik', 'Oberflächenschutz', 'Oberflächentechnik', 'Printplattenbestückung',
  'Programmierung', 'Prozessautomation', 'Qualitätsprüfung', 'Regelungstechnik',
  'Reparatur und Wartung', 'Rundfunk-, Fernsehtechnik', 'Schutzmaßnahmen', 'Schweißen',
  'Sende- und Empfangsanlagen', 'Sensorik', 'SMD-Technik', 'SMT-Anwendungen',
  'SPS-Steuerungstechnik', 'Steuerungstechnik', 'Systemsoftware', 'Technische Präsentation',
  'USV-Anlagen', 'Verbindungstechnik', 'Verdrahtungsarbeiten', 'Verkabelungssysteme',
  'Vermittlungstechnik', 'Verteilerbau', 'Visualisierung', 'Voice over IP',
  'VPS-Steuerungstechnik', 'Wärmebehandlung', 'Werkstoffbearbeitung'
]

async function migrateCustomValues() {
  console.log('Starting custom values migration...')

  // Mark rooms as custom if not in seed data
  const allRooms = await prisma.room.findMany()
  const seededRoomSet = new Set(SEEDED_ROOMS)
  
  let customRoomsCount = 0
  for (const room of allRooms) {
    if (!seededRoomSet.has(room.name)) {
      await (prisma as any).room.update({
        where: { id: room.id },
        data: { isCustom: true }
      })
      customRoomsCount++
    }
  }
  console.log(`✓ Marked ${customRoomsCount} rooms as custom`)

  // Mark subjects as custom if not in seed data
  const allSubjects = await prisma.subject.findMany()
  const seededSubjectSet = new Set(SEEDED_SUBJECTS)
  
  let customSubjectsCount = 0
  for (const subject of allSubjects) {
    if (!seededSubjectSet.has(subject.name)) {
      await (prisma as any).subject.update({
        where: { id: subject.id },
        data: { isCustom: true }
      })
      customSubjectsCount++
    }
  }
  console.log(`✓ Marked ${customSubjectsCount} subjects as custom`)

  // Mark learning contents as custom if not in seed data
  const allLearningContents = await prisma.learningContent.findMany()
  const seededLearningContentSet = new Set(SEEDED_LEARNING_CONTENTS)
  
  let customLearningContentsCount = 0
  for (const learningContent of allLearningContents) {
    if (!seededLearningContentSet.has(learningContent.name)) {
      await (prisma as any).learningContent.update({
        where: { id: learningContent.id },
        data: { isCustom: true }
      })
      customLearningContentsCount++
    }
  }
  console.log(`✓ Marked ${customLearningContentsCount} learning contents as custom`)

  console.log('Migration completed!')
}

migrateCustomValues()
  .catch((error) => {
    console.error('Migration failed:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

