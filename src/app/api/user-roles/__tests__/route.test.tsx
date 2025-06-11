import { describe, test, expect, vi, beforeEach, afterAll } from 'vitest';
import { GET, POST, DELETE } from '../route';
import { PrismaClient } from '@prisma/client';

// Create mock functions using hoisted
const mockFindMany = vi.hoisted(() => vi.fn());
const mockFindUnique = vi.hoisted(() => vi.fn());
const mockCreate = vi.hoisted(() => vi.fn());
const mockDelete = vi.hoisted(() => vi.fn());
const mockCaptureError = vi.hoisted(() => vi.fn());
const mockConsoleError = vi.hoisted(() => vi.fn());

// Mock PrismaClient
vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => ({
    userRole: {
      findMany: mockFindMany,
      create: mockCreate,
      delete: mockDelete,
    },
    role: {
      findUnique: mockFindUnique,
    },
    teacher: {
      findUnique: mockFindUnique,
    },
    student: {
      findUnique: mockFindUnique,
    },
  })),
}));

// Mock sentry
vi.mock('@/lib/sentry', () => ({
  captureError: mockCaptureError,
}));

// Mock console.error
const originalConsoleError = console.error;
console.error = mockConsoleError;

describe('User Roles API', () => {
  let prisma: PrismaClient;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = new PrismaClient();
  });

  afterAll(() => {
    console.error = originalConsoleError;
  });

  describe('GET /api/user-roles', () => {
    test('should fetch user roles successfully', async () => {
      const mockUserRoles = [
        {
          userId: 'user1',
          roleId: 1,
          role: {
            id: 1,
            name: 'Admin',
          },
        },
      ];

      mockFindMany.mockResolvedValueOnce(mockUserRoles);

      const request = new Request('http://localhost:3000/api/user-roles?userId=user1');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(mockUserRoles);
      expect(mockFindMany).toHaveBeenCalledWith({
        where: { userId: 'user1' },
        include: { role: true },
      });
    });

    test('should return 400 when userId is missing', async () => {
      const request = new Request('http://localhost:3000/api/user-roles');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'User ID is required' });
      expect(mockFindMany).not.toHaveBeenCalled();
    });

    test('should handle database errors', async () => {
      mockFindMany.mockRejectedValueOnce(new Error('Database error'));

      const request = new Request('http://localhost:3000/api/user-roles?userId=user1');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to fetch user roles' });
    });
  });

  describe('POST /api/user-roles', () => {
    test('should assign role to user successfully', async () => {
      const mockRole = { id: 1, name: 'Admin' };
      const mockTeacher = { id: 1, username: 'teacher1' };
      const mockUserRole = {
        userId: 'teacher1',
        roleId: 1,
        role: mockRole,
      };

      mockFindUnique
        .mockResolvedValueOnce(mockRole) // Role exists
        .mockResolvedValueOnce(mockTeacher) // Teacher exists
        .mockResolvedValueOnce(null); // Student doesn't exist
      mockCreate.mockResolvedValueOnce(mockUserRole);

      const request = new Request('http://localhost:3000/api/user-roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'teacher1', roleId: 1 }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(mockUserRole);
      expect(mockCreate).toHaveBeenCalledWith({
        data: {
          userId: 'teacher1',
          roleId: 1,
        },
        include: {
          role: true,
        },
      });
    });

    test('should return 400 when required fields are missing', async () => {
      const request = new Request('http://localhost:3000/api/user-roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'teacher1' }), // Missing roleId
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'User ID and Role ID are required' });
      expect(mockCreate).not.toHaveBeenCalled();
    });

    test('should return 404 when role not found', async () => {
      mockFindUnique.mockResolvedValueOnce(null); // Role doesn't exist

      const request = new Request('http://localhost:3000/api/user-roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'teacher1', roleId: 999 }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data).toEqual({ error: 'Role not found' });
      expect(mockCreate).not.toHaveBeenCalled();
    });

    test('should return 404 when user not found', async () => {
      const mockRole = { id: 1, name: 'Admin' };
      mockFindUnique
        .mockResolvedValueOnce(mockRole) // Role exists
        .mockResolvedValueOnce(null) // Teacher doesn't exist
        .mockResolvedValueOnce(null); // Student doesn't exist

      const request = new Request('http://localhost:3000/api/user-roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'nonexistent', roleId: 1 }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data).toEqual({ error: 'User not found' });
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/user-roles', () => {
    test('should remove role assignment successfully', async () => {
      const request = new Request('http://localhost:3000/api/user-roles?userId=user1&roleId=1');
      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ message: 'Role assignment removed successfully' });
      expect(mockDelete).toHaveBeenCalledWith({
        where: {
          userId_roleId: {
            userId: 'user1',
            roleId: 1,
          },
        },
      });
    });

    test('should return 400 when required parameters are missing', async () => {
      const request = new Request('http://localhost:3000/api/user-roles?userId=user1');
      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'User ID and Role ID are required' });
      expect(mockDelete).not.toHaveBeenCalled();
    });

    test('should return 400 when roleId is not a number', async () => {
      const request = new Request('http://localhost:3000/api/user-roles?userId=user1&roleId=invalid');
      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'Invalid Role ID format' });
      expect(mockDelete).not.toHaveBeenCalled();
    });

    test('should handle database errors', async () => {
      mockDelete.mockRejectedValueOnce(new Error('Database error'));

      const request = new Request('http://localhost:3000/api/user-roles?userId=user1&roleId=1');
      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to remove role assignment' });
 
    });
  });
}); 