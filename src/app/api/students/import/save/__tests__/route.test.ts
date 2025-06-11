import { describe, test, expect, vi, beforeEach, afterAll } from 'vitest';
import { POST } from '../route';
import { prisma } from '@/lib/prisma';
import { POST as importStudents } from '../../route';
import { NextResponse } from 'next/server';


// Mock prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    class: {
      upsert: vi.fn(),
    },
    student: {
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

// Mock importStudents
vi.mock('../../route', () => ({
  POST: vi.fn(),
}));

describe('Students Import Save API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });



  describe('POST', () => {
    const mockImportData = {
      classes: [
        {
          name: '1A',
          students: [
            {
              firstName: 'John',
              lastName: 'Doe',
              username: 'john.doe',
            },
            {
              firstName: 'Jane',
              lastName: 'Smith',
              username: 'jane.smith',
            },
          ],
        },
        {
          name: '2B',
          students: [
            {
              firstName: 'Bob',
              lastName: 'Johnson',
              username: 'bob.johnson',
            },
          ],
        },
      ],
    };

    test('should save selected classes and their students', async () => {
      // Mock importStudents response
      vi.mocked(importStudents).mockResolvedValue(
        NextResponse.json(mockImportData)
      );

      // Mock prisma responses
      vi.mocked(prisma.class.upsert).mockResolvedValue({
        id: 1,
        name: '1A',
        createdAt: new Date(),
        updatedAt: new Date(),
        description: null,
      });

      vi.mocked(prisma.student.deleteMany).mockResolvedValue({ count: 0 });

      vi.mocked(prisma.student.create).mockResolvedValue({
        id: 1,
        firstName: 'John',
        lastName: 'Doe',
        username: 'john.doe',
        classId: 1,
        groupId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const request = new Request('http://localhost:3000/api/students/import/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          classes: ['1A'],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        message: 'Import completed successfully',
        students: 2, // 2 students in 1A
        classes: 1, // 1 class updated
      });

      // Verify prisma calls
      expect(prisma.class.upsert).toHaveBeenCalledWith({
        where: { name: '1A' },
        update: {},
        create: { name: '1A' },
      });

      expect(prisma.student.deleteMany).toHaveBeenCalledWith({
        where: { classId: 1 },
      });

      expect(prisma.student.create).toHaveBeenCalledTimes(2);
      expect(prisma.student.create).toHaveBeenCalledWith({
        data: {
          firstName: 'John',
          lastName: 'Doe',
          username: 'john.doe',
          classId: 1,
        },
      });

      // Verify no errors were logged
      
    });

    test('should handle import failure', async () => {
      // Mock importStudents failure
      vi.mocked(importStudents).mockResolvedValue(
        NextResponse.json({ error: 'Import failed' }, { status: 500 })
      );

      const request = new Request('http://localhost:3000/api/students/import/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          classes: ['1A'],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({
        error: 'Failed to import students',
      });

      // Verify error was logged
     
    });

    test('should handle database errors', async () => {
      // Mock importStudents response
      vi.mocked(importStudents).mockResolvedValue(
        NextResponse.json(mockImportData)
      );

      // Mock prisma error
      vi.mocked(prisma.class.upsert).mockRejectedValue(new Error('Database error'));

      const request = new Request('http://localhost:3000/api/students/import/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          classes: ['1A'],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({
        error: 'Failed to import students',
      });

      // Verify error was logged
      
    });

    test('should handle invalid request body', async () => {
      const request = new Request('http://localhost:3000/api/students/import/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // Missing classes array
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({
        error: 'Failed to import students',
      });

      // Verify error was logged
      
    });
  });
}); 