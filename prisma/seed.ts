import { Prisma, PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Seeds the database with initial data
 */
async function main() {
  console.log('🌱 Starting database seed...')

  // Seed School Holidays
  console.log('📅 Seeding school holidays...')

  const roles = [
    {
      name: 'admin',
      description: 'Administrator with full access to all features'
    },
    {
      name: 'teacher',
      description: 'Teacher with access to teaching-related features'
    },
    {
      name: 'student',
      description: 'Student with access to student-related features'
    }
  ]

  for (const role of roles) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: {},
      create: role
    })
  }
  
  const holidays = [
    {
      name: 'Erste Schulwoche',
      startDate: new Date('2025-09-08'),
      endDate: new Date('2025-09-13')
    },
    {
      name: 'Herbstferien',
      startDate: new Date('2025-10-27'),
      endDate: new Date('2025-11-02')
    },
    {
      name: 'Weihnachtsferien',
      startDate: new Date('2025-12-24'),
      endDate: new Date('2026-01-06')
    },
    {
      name: 'Semesterferien',
      startDate: new Date('2026-02-16'),
      endDate: new Date('2026-02-21')
    },
    {
      name: 'Osterferien',
      startDate: new Date('2026-03-28'),
      endDate: new Date('2026-04-06')
    },
    {
      name: 'Maifeiertag',
      startDate: new Date('2026-05-01'),
      endDate: new Date('2026-05-02')
    },
    {
      name: 'Christi Himmelfahrt',
      startDate: new Date('2026-05-29'),
      endDate: new Date('2026-05-30')
    },
    {
      name: 'Pfingstmontag',
      startDate: new Date('2026-05-23'),
      endDate: new Date('2026-05-25')
    },
    {
      name: 'Fronleichnam',
      startDate: new Date('2026-06-19'),
      endDate: new Date('2026-06-20')
    },
    {
      name: 'Letzten zwei Schulwoche',
      startDate: new Date('2026-06-29'),
      endDate: new Date('2026-07-10')
    }
  ]

  for (const holiday of holidays) {
    await prisma.schoolHoliday.upsert({
      where: { name: holiday.name },
      update: holiday,
      create: holiday
    })
  }

  console.log(`✅ Seeded ${holidays.length} school holidays`)

  // Seed Schedule Times
  console.log('⏰ Seeding schedule times...')
  
  const scheduleTimes: Prisma.ScheduleTimeCreateInput[] = [
    { startTime: '07:50', endTime: '10:30', hours: 3, period: 'AM' },
    { startTime: '07:50', endTime: '11:25', hours: 5, period: 'AM' },
    { startTime: '07:50', endTime: '12:15', hours: 6, period: 'AM' },
    { startTime: '08:40', endTime: '11:25', hours: 4, period: 'AM' },
    { startTime: '08:45', endTime: '12:15', hours: 5, period: 'AM' },
    { startTime: '09:40', endTime: '12:15', hours: 3, period: 'AM' },
    { startTime: '09:40', endTime: '13:05', hours: 4, period: 'AM' },
    { startTime: '10:45', endTime: '12:30', hours: 2, period: 'AM' },
    { startTime: '10:45', endTime: '13:15', hours: 3, period: 'AM' },
    { startTime: '11:25', endTime: '15:35', hours: 4, period: 'PM' },
    { startTime: '11:25', endTime: '16:35', hours: 5, period: 'PM' },
    { startTime: '12:15', endTime: '15:35', hours: 2, period: 'PM' },
    { startTime: '12:15', endTime: '15:45', hours: 3, period: 'PM' },
    { startTime: '12:15', endTime: '16:35', hours: 5, period: 'PM' },
    { startTime: '13:05', endTime: '15:45', hours: 3, period: 'PM' },
    { startTime: '13:05', endTime: '16:35', hours: 4, period: 'PM' },
    { startTime: '14:25', endTime: '16:55', hours: 2, period: 'PM' }
  ]

  for (const scheduleTime of scheduleTimes) {
    await prisma.scheduleTime.upsert({
      where: {
        startTime_endTime_period: {
          startTime: scheduleTime.startTime,
          endTime: scheduleTime.endTime,
          period: scheduleTime.period
        }
      },
      update: scheduleTime,
      create: scheduleTime
    })
  }

  console.log(`✅ Seeded ${scheduleTimes.length} schedule times`)

  // Seed Break Times
  console.log('☕ Seeding break times...')
  
  const breakTimes: Prisma.BreakTimeCreateInput[] = [
    { name: 'Vormittagspause 1', startTime: '08:45', endTime: '09:00', period: 'AM' },
    { name: 'Vormittagspause 2', startTime: '09:45', endTime: '09:55', period: 'AM' },
    { name: 'Vormittagspause 3', startTime: '10:45', endTime: '10:55', period: 'AM' },
    { name: 'Mittagspause 1', startTime: '11:25', endTime: '12:15', period: 'LUNCH' },
    { name: 'Mittagspause 2', startTime: '12:15', endTime: '13:05', period: 'LUNCH' },
    { name: 'Mittagspause 3', startTime: '13:05', endTime: '13:55', period: 'LUNCH' },
    { name: 'Nachmittagspause 1', startTime: '14:00', endTime: '14:10', period: 'PM' },
    { name: 'Nachmittagspause 2', startTime: '14:50', endTime: '15:00', period: 'PM' }
  ]

  for (const breakTime of breakTimes) {
    await prisma.breakTime.upsert({
      where: {
        startTime_endTime_period: {
          startTime: breakTime.startTime,
          endTime: breakTime.endTime,
          period: breakTime.period
        }
      },
      update: breakTime,
      create: breakTime
    })
  }

  console.log(`✅ Seeded ${breakTimes.length} break times`)

  // Seed Learning Content
  console.log('📚 Seeding learning content...')
  
  const learningContents = [
    'Analogschaltungen',
    'Antriebstechnik',
    'Arbeitsplanung',
    'Arbeitsvorbereitung',
    'Assemblierung',
    'Bauelemente',
    'Baugruppen',
    'Baugruppenfertigung',
    'Bauteilkunde',
    'Beleuchtungstechnik',
    'Beschaffungswesen',
    'Betriebssysteme',
    'Bussysteme',
    'CAD',
    'CAM',
    'Computer assemblieren',
    'Computersysteme',
    'Datenleitungen',
    'Datenübertragungseinrichtungen',
    'Digitalschaltungen',
    'Drehen',
    'Drehen/Fräsen',
    'Eagle-CAD',
    'Elektroakustik',
    'Elektromechanik',
    'Elektronik',
    'Elektronische Grundschaltungen',
    'Elektronische Schaltungen',
    'Elektropneumatik',
    'Elektrotechnik',
    'Elektrotechnik fest',
    'Elektrotechnik flexibel',
    'Energieversorgungssysteme',
    'Fehlersuche',
    'Festnetzkommunikation',
    'Fräsen',
    'Gebäudeinstallation',
    'Gehäusefertigung',
    'Gehäusetechnik',
    'Gerätebau',
    'Hardwarekonfiguration',
    'Hartlöten',
    'HF-Technik',
    'Industrieroboter',
    'Kalkulation',
    'Klebetechnik',
    'Kommunikationstechnik',
    'Leistungselektronik',
    'Leiterplattenfertigung',
    'Logikschaltungen',
    'Löttechnik',
    'Mechan. Grundausbildung',
    'Mechatronische Systeme',
    'Mediendesign',
    'Messtechnik',
    'Messübungen',
    'Messübungen/Fehlersuche',
    'Messysteme',
    'Mobile Kommunikationstechnik',
    'Montagearbeiten IT-Systeme',
    'Montagesysteme',
    'Netzwerktechnik',
    'Netzwerkverkabelungen',
    'NF-Technik',
    'Oberflächenschutz',
    'Oberflächentechnik',
    'Printplattenbestückung',
    'Programmierung',
    'Prozessautomation',
    'Qualitätsprüfung',
    'Regelungstechnik',
    'Reparatur und Wartung',
    'Rundfunk-, Fernsehtechnik',
    'Schutzmaßnahmen',
    'Schweißen',
    'Sende- und Empfangsanlagen',
    'Sensorik',
    'SMD-Technik',
    'SMT-Anwendungen',
    'SPS-Steuerungstechnik',
    'Steuerungstechnik',
    'Systemsoftware',
    'Technische Präsentation',
    'USV-Anlagen',
    'Verbindungstechnik',
    'Verdrahtungsarbeiten',
    'Verkabelungssysteme',
    'Vermittlungstechnik',
    'Verteilerbau',
    'Visualisierung',
    'Voice over IP',
    'VPS-Steuerungstechnik',
    'Wärmebehandlung',
    'Werkstoffbearbeitung'
  ]

  for (const contentName of learningContents) {
    await prisma.lookupValue.upsert({
      where: {
        kind_name: { kind: 'LEARNING_CONTENT', name: contentName }
      },
      update: { name: contentName },
      create: { kind: 'LEARNING_CONTENT', name: contentName }
    })
  }

  console.log(`✅ Seeded ${learningContents.length} learning content items`)

  // Seed Rooms
  console.log('🏢 Seeding rooms...')
  
  const rooms = [
    'E02',
    'E03',
    'E17',
    'E31',
    'E33',
    'E37',
    'E45',
    'E46',
    'E47',
    'E48',
    'E56',
    'E57',
    'E61',
    'E62',
    'E63',
    'E64',
    'E65',
    'E66',
    'E68',
    'E68a',
    'E68b',
    'E69',
    'E72',
    'E73',
    'E74',
    'E76',
    'E77',
    'E78',
    'E78a',
    'E79',
    'E80',
    'E81',
    'E82',
    'E83',
    'E84',
    'E85',
    'E86',
    'E89',
    '142',
    '143',
    '144',
    '145',
    '146',
    '147',
    '148',
    '149',
    '146/E68',
    'EDV 1',
    'EDV 2',
    'EDV 3',
    'B&R'
  ]

  for (const roomName of rooms) {
    await prisma.lookupValue.upsert({
      where: {
        kind_name: { kind: 'ROOM', name: roomName }
      },
      update: { name: roomName, isCustom: false },
      create: { kind: 'ROOM', name: roomName, isCustom: false }
    })
  }

  console.log(`✅ Seeded ${rooms.length} rooms`)

  // Seed Subjects
  console.log('📖 Seeding subjects...')
  
  const subjects = [
    'WEPT-Grundausb. Mechanik',
    'PBE4-Baugruppenfertigung 1',
    'WPT-4 Mechan. Grundausbildung für Elektrotechnik',
    'COPR-Computerinfrastruktur',
    'WPT4-Blechbearbeitung',
    'WEPT-Elektronik',
    'PBE4-Baugruppenfertigung 2',
    'WPT4-Steuerungstechnik 1',
    'COPR- Computerpraktikum',
    'WPT4-Mechanische Werkstätte',
    'WEPT-Nieder-/Hochfrequenztechnik',
    'PBE3-Computertechnik',
    'WPT4-Mechatronik',
    'WPT3-Arbeitsvorbereitung',
    'WEPT/WLA-Arbeitsvorbereitung',
    'PBE3-Consumer-Electronics',
    'WPT3-Automatisierungstechnik und Robotik 1',
    'WEPT-Grundausb. Elektrotechnik',
    'PBE4-Kunststofftechnik',
    'WPT4-Elektroinstallation 1',
    'WPT4-Elektrotechnische Grundausbildung',
    'WEPT-Computer-/Netzwerktechnik',
    'PBE4-Computertechnik 1',
    'COPR- Netzwerktechnik',
    'WPT4-Geräte und Gehäusebau',
    'WEPT-Elektronik',
    'PBE3-Digitaltechnik 1',
    'WPT4-Steuerungstechnik 2',
    'WPT3-Leierplattentechnik',
    'WEPT/WLA-Nieder-/Hochfrequenztechnik',
    'PBE3-Digitaltechnik 2',
    'WPT3-Messechnik und Qualitätsmanagement',
    'WEPT-Grundausb. Elektronik',
    'PBE4-Leiterplattenfertigung 1',
    'WPT4-Elektronik 1',
    'COPR-Elektromechanik',
    'WPT4-Kunststofftechnik',
    'WEPT-Kommunikationstechnik',
    'PBE4-Digitaltechnik 1',
    'WPT4-Oberflächentechnik',
    'WEPT-Computer-/Netzwerktechnik',
    'PBE3-Gerätebau',
    'WEPT/WLA-Kommunikationstechnik',
    'PBE3-Kommunikationssysteme 2',
    'WPT3-Automatisierung',
    'WEPT-Kunststofftechnik',
    'PBE4-Mech. Grundausbildung',
    'COPR-Elektronische Grundschaltungen',
    'WEPT-Gerätebau',
    'PBE4-Leiterplattenfertigung 2',
    'COPR-Digitalschaltungen',
    'WPT4-Niederspannungsinstallation',
    'WEPT-Kommunikationstechnik',
    'PBE3-Kommunikationssyst. 1',
    'WPT4-Werkstätte für Elektronik',
    'WEPT/WLA-Industrielle Elektronik',
    'PBE3-Messtechnik 2',
    'WPT3-CAD Fertigungs- und Montagetechnik',
    'PBE4-Verbindungstechnik 1',
    'COPR-Elektrotechnik',
    'WPT4-Mechanische Werkstätte',
    'WEPT-Installationstechnik',
    'PBE4-SMD-Technik',
    'COPR-Elektronische Schaltungen',
    'WPT4-Bereich Montage und Wartung',
    'WEPT-Industrielle Elektronik',
    'PBE3-Messtechnik 1',
    'WPT4-Werkstätte für Steuerungstechnik',
    'PBE3-Netzwerkinstallation 2',
    'ELWP-Elektronik',
    'PBE4-Verbindungstechnik 2',
    'WPT4-Schweißen',
    'PBE3-Netzwerkinstallation 1',
    'PBE3-Steuer-/Regelungstechnik',
    'ELWP-Elektrotechnik',
    'COPR-Systemtechnik',
    'COPR-Energieversorgungssysteme',
    'WPT4-Computertechnik',
    'PBE4-Computertechnik 2',
    'ELWP-Fertigungssteuerung/Überwachung',
    'ELWP-Mechan. Grundausbildung',
    'COPR-IT Infrastruktursysteme',
    'ELWP-Gerätebau',
    'COPR-Netzwerkinfrastruktur',
    'PBE4-Consumer-Electronics',
    'ELWP-Industrieelle Elektronik',
    'NWWP-Computertechnik',
    'ELWP-Kunststofftechnik',
    'COPR-Netzwerktechnik',
    'NWWP-Kommunikationselektronik',
    'PBE4-Digitaltechnik 2',
    'NWWP-Netzwerktechnik',
    'COPR-Systemtechnik',
    'PBE4-Gerätebau',
    'NWWP-Nieder-/Hochfrequenztechnik',
    'COPR-Verkabelungssysteme',
    'PBE4-Kommunikationssyst.',
    'COPR-Gebäudeinstallation',
    'PBE4-Netzwerkinstallation'
  ]

  for (const subjectName of subjects) {
    await prisma.lookupValue.upsert({
      where: {
        kind_name: { kind: 'SUBJECT', name: subjectName }
      },
      update: { name: subjectName, isCustom: false },
      create: { kind: 'SUBJECT', name: subjectName, isCustom: false }
    })
  }

  console.log(`✅ Seeded ${subjects.length} subjects`)


  console.log('🎉 Database seeding completed!')
}

/**
 * Handles errors during seeding and ensures proper cleanup
 */
main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  }) 