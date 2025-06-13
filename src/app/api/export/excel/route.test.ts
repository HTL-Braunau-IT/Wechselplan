import { POST } from './route'
import { prisma } from '@/lib/prisma'
import * as XLSX from 'xlsx'
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock dependencies
vi.mock('@/lib/prisma', () => ({
    prisma: {
        class: {
            findUnique: vi.fn(),
        },
        schedule: {
            findFirst: vi.fn(),
        },
        teacherAssignment: {
            findMany: vi.fn(),
        },
    },
}))

vi.mock('xlsx', () => ({
    utils: {
        book_new: vi.fn(() => ({})),
        aoa_to_sheet: vi.fn(() => ({})),
        encode_cell: vi.fn(() => 'A1'),
        book_append_sheet: vi.fn(),
    },
    write: vi.fn(() => Buffer.from('mock excel data')),
}))

describe('Excel Export Route', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('should return 400 if className is missing', async () => {
        const request = new Request('http://localhost/api/export/excel?selectedWeekday=1')
        const response = await POST(request)
        expect(response.status).toBe(400)
        const data = await response.json()
        expect(data.error).toBe('Class Name is required')
    })

    it('should return 400 if selectedWeekday is missing', async () => {
        const request = new Request('http://localhost/api/export/excel?className=1A')
        const response = await POST(request)
        expect(response.status).toBe(400)
        const data = await response.json()
        expect(data.error).toBe('Selected Weekday is required')
    })

    it('should return 404 if class is not found', async () => {
        vi.mocked(prisma.class.findUnique).mockResolvedValue(null)
        const request = new Request('http://localhost/api/export/excel?className=1A&selectedWeekday=1')
        const response = await POST(request)
        expect(response.status).toBe(404)
        const data = await response.json()
        expect(data.error).toBe('Class not found')
    })

    it('should return 404 if schedule is not found', async () => {
        vi.mocked(prisma.class.findUnique).mockResolvedValue({
            id: 1,
            name: '1A',
            students: [],
        })
        vi.mocked(prisma.schedule.findFirst).mockResolvedValue(null)
        const request = new Request('http://localhost/api/export/excel?className=1A&selectedWeekday=1')
        const response = await POST(request)
        expect(response.status).toBe(404)
        const data = await response.json()
        expect(data.error).toBe('Schedule not found')
    })

    it('should generate Excel file with correct data', async () => {
        const mockClass = {
            id: 1,
            name: '1A',
            createdAt: new Date(),
            updatedAt: new Date(),
            description: null,
            classHeadId: 1,
            classLeadId: 2,
            classHead: { firstName: 'John', lastName: 'Doe' },
            classLead: { firstName: 'Jane', lastName: 'Smith' },
            students: [
                { groupId: 1, firstName: 'Alice', lastName: 'Johnson' },
                { groupId: 1, firstName: 'Bob', lastName: 'Brown' },
            ],
        }

        const mockSchedule = {
            id: 1,
            name: 'Schedule 1',
            classId: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
            description: null,
            startDate: new Date(),
            endDate: new Date(),
            selectedWeekday: 1,
            scheduleData: {
                TURNUS1: {
                    name: 'Turnus 1',
                    weeks: [
                        { date: '01.01.24', week: '1', isHoliday: false },
                        { date: '08.01.24', week: '2', isHoliday: false },
                    ],
                    holidays: [],
                },
            },
            additionalInfo: null,
        }

        const mockTeacherAssignments = [
            {
                id: 1,
                classId: 1,
                groupId: 1,
                createdAt: new Date(),
                updatedAt: new Date(),
                period: 'AM',
                teacherId: 1,
                subjectId: 1,
                learningContentId: 1,
                roomId: 1,
                teacher: { firstName: 'John', lastName: 'Doe' },
            },
            {
                id: 2,
                classId: 1,
                groupId: 1,
                createdAt: new Date(),
                updatedAt: new Date(),
                period: 'PM',
                teacherId: 2,
                subjectId: 1,
                learningContentId: 1,
                roomId: 1,
                teacher: { firstName: 'Jane', lastName: 'Smith' },
            },
        ]

        vi.mocked(prisma.class.findUnique).mockResolvedValue(mockClass)
        vi.mocked(prisma.schedule.findFirst).mockResolvedValue(mockSchedule)
        vi.mocked(prisma.teacherAssignment.findMany).mockResolvedValue(mockTeacherAssignments)

        const request = new Request('http://localhost/api/export/excel?className=1A&selectedWeekday=1')
        const response = await POST(request)

        expect(response.status).toBe(200)
        expect(response.headers.get('Content-Type')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="1A_gruppenliste.xlsx"')

        // Verify Excel generation calls
        expect(XLSX.utils.book_new).toHaveBeenCalled()
        expect(XLSX.utils.aoa_to_sheet).toHaveBeenCalled()
        expect(XLSX.utils.book_append_sheet).toHaveBeenCalled()
        expect(XLSX.write).toHaveBeenCalledWith(
            expect.any(Object),
            expect.objectContaining({
                type: 'buffer',
                bookType: 'xlsm',
                cellStyles: true,
                cellDates: true,
                bookSST: true,
            })
        )
    })
}) 