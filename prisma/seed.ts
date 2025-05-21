import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    // Create some sample classes
    const classes = ['1AHITS', '2AFELC', '3BHME']

    // Sample German names for students
    const firstNames = [
        'Max', 'Anna', 'Thomas', 'Maria', 'Lukas', 'Sophie', 'Felix', 'Emma',
        'Leon', 'Laura', 'Jonas', 'Sarah', 'Tim', 'Julia', 'Paul', 'Lisa',
        'David', 'Hannah', 'Niklas', 'Leonie', 'Jan', 'Marie', 'Moritz', 'Lena'
    ]

    const lastNames = [
        'Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner',
        'Becker', 'Schulz', 'Hoffmann', 'Schäfer', 'Koch', 'Bauer', 'Richter',
        'Klein', 'Wolf', 'Schröder', 'Neumann', 'Schwarz', 'Zimmermann'
    ]

    // Create students for each class
    for (const className of classes) {
        // Create 20 students per class
        for (let i = 0; i < 20; i++) {
            const firstNameIndex = Math.floor(Math.random() * firstNames.length)
            const lastNameIndex = Math.floor(Math.random() * lastNames.length)
            const firstName = firstNames[firstNameIndex]!
            const lastName = lastNames[lastNameIndex]!
            
            await prisma.student.create({
                data: {
                    firstName,
                    lastName,
                    class: className,
                },
            })
        }
    }

    // Create sample schedules with unique class/weekDay/period combinations
    const schedules = [
        {
            class: '1AHITS',
            weekDay: 1,
            period: 1,
            subject: 'Mathematics',
            teacher: 'Dr. Smith',
            room: '101',
        },
        {
            class: '1AHITS',
            weekDay: 1,
            period: 2,
            subject: 'Computer Science',
            teacher: 'Prof. Johnson',
            room: '202',
        },
        {
            class: '1AHITS',
            weekDay: 2,
            period: 1,
            subject: 'English',
            teacher: 'Mrs. Brown',
            room: '303',
        },
        {
            class: '2AFELC',
            weekDay: 1,
            period: 1,
            subject: 'German',
            teacher: 'Dr. Schmidt',
            room: '404',
        },
        {
            class: '2AFELC',
            weekDay: 1,
            period: 2,
            subject: 'Physics',
            teacher: 'Prof. Weber',
            room: '505',
        },
        {
            class: '3BHME',
            weekDay: 1,
            period: 1,
            subject: 'Chemistry',
            teacher: 'Dr. Müller',
            room: '606',
        }
    ]

    for (const schedule of schedules) {
        await prisma.schedule.create({
            data: schedule,
        })
    }

    console.log('Seed data created successfully')
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    }) 