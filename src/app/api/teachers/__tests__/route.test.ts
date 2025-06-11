import { describe, test, expect, vi, beforeEach, afterAll } from 'vitest';
import { GET, POST } from '../route';
import { prisma } from '@/lib/prisma';
import { captureError } from '@/lib/sentry';



// Mock prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    teacher: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

// Mock sentry
vi.mock('@/lib/sentry', () => ({
  captureError: vi.fn(),
}));

describe('Teachers API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });



  describe('GET', () => {
    test('should return list of teachers ordered by last name', async () => {
      const mockTeachers = [
        { id: 1, firstName: 'John', lastName: 'Doe', username: 'johndoe' },
        { id: 2, firstName: 'Jane', lastName: 'Smith', username: 'janesmith' },
      ];

      vi.mocked(prisma.teacher.findMany).mockResolvedValue(mockTeachers);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(mockTeachers);

      // Verify prisma call
      expect(prisma.teacher.findMany).toHaveBeenCalledWith({
        select: {
          id: true,
          firstName: true,
          lastName: true,
          username: true,
        },
        orderBy: {
          lastName: 'asc',
        },
      });
    });

    test('should handle database errors', async () => {
      vi.mocked(prisma.teacher.findMany).mockRejectedValue(
        new Error('Database connection failed')
      );

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({
        error: 'Failed to fetch teachers',
      });

      // Verify error was logged and captured

      expect(captureError).toHaveBeenCalledWith(
        expect.any(Error),
        {
          location: 'api/teachers',
          type: 'fetch-teachers',
        }
      );
    });
  });

  describe('POST', () => {
    const validTeacher = {
      firstName: 'John',
      lastName: 'Doe',
      username: 'johndoe',
      email: 'john.doe@example.com',
    };

    test('should create a new teacher', async () => {
      const mockCreatedTeacher = {
        id: 1,
        ...validTeacher,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      vi.mocked(prisma.teacher.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.teacher.create).mockResolvedValue(mockCreatedTeacher);

      const request = new Request('http://localhost:3000/api/teachers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(validTeacher),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(mockCreatedTeacher);

      // Verify prisma calls
      expect(prisma.teacher.findUnique).toHaveBeenCalledWith({
        where: { username: validTeacher.username },
      });
      expect(prisma.teacher.create).toHaveBeenCalledWith({
        data: validTeacher,
      });
    });

    test('should handle validation errors', async () => {
      const invalidTeacher = {
        firstName: '', // Empty first name
        lastName: 'Doe',
        username: 'jd', // Too short username
        email: 'invalid-email', // Invalid email
      };

      const request = new Request('http://localhost:3000/api/teachers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(invalidTeacher),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toHaveProperty('error', 'Validation failed');
      expect(data).toHaveProperty('details');

      // Verify no database operations were attempted
      expect(prisma.teacher.findUnique).not.toHaveBeenCalled();
      expect(prisma.teacher.create).not.toHaveBeenCalled();
    });

    test('should handle duplicate username', async () => {
      vi.mocked(prisma.teacher.findUnique).mockResolvedValue({
        id: 2,
        ...validTeacher,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const request = new Request('http://localhost:3000/api/teachers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(validTeacher),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({
        error: 'Username already exists',
      });

      // Verify no create operation was attempted
      expect(prisma.teacher.create).not.toHaveBeenCalled();
    });

    test('should handle database errors', async () => {
      vi.mocked(prisma.teacher.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.teacher.create).mockRejectedValue(
        new Error('Database connection failed')
      );

      const request = new Request('http://localhost:3000/api/teachers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(validTeacher),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({
        error: 'Failed to create teacher',
      });

      // Verify error was logged and captured

      expect(captureError).toHaveBeenCalledWith(
        expect.any(Error),
        {
          location: 'api/teachers',
          type: 'create-teachers',
          extra: {
            requestBody: validTeacher,
          },
        }
      );
    });
  });
}); 