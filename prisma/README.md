# Database Seeding

This directory contains the database seed file for populating the database with initial data.

## Seed File

The `seed.ts` file contains initial data for the application, including:

- School holidays for the 2024-2025 academic year
- Placeholder sections for future seed data (classes, teachers, students, etc.)

## Running the Seed

You can run the seed file in several ways:

### Option 1: Using Prisma's built-in seed command
```bash
npx prisma db seed
```

### Option 2: Using the npm script
```bash
npm run db:seed
```

### Option 3: Direct execution with tsx
```bash
npx tsx prisma/seed.ts
```

## Current Seed Data

### School Holidays (2024-2025)
- Erste Schulwoche: 09.09.2024 - 16.09.2024
- Herbstferien: 28.10.2024 - 03.11.2024
- Weihnachtsferien: 21.12.2024 - 06.01.2025
- Semesterferien: 17.02.2025 - 21.02.2025
- Osterferien: 14.04.2025 - 21.04.2025
- Maifeiertag: 01.05.2025 - 02.05.2025
- Christi Himmelfahrt: 29.05.2025 - 30.05.2025
- Pfingstmontag: 09.06.2025 - 09.06.2025
- Fronleichnam: 19.06.2025 - 20.06.2025
- Letzten zwei Schulwoche: 23.06.2025 - 04.07.2025

## Adding More Seed Data

To add more seed data, edit the `seed.ts` file and add new sections following the existing pattern. The file includes TODO comments for:

- Sample classes
- Sample teachers
- Sample students
- Sample rooms
- Sample subjects
- Sample learning contents
- Sample schedule times
- Sample break times

## Notes

- The seed file uses `upsert` operations to avoid duplicate entries
- Each section includes proper error handling and logging
- The file automatically disconnects from the database when finished 