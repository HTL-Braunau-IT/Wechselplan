import { describe, test, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { GET, POST } from '../route';
import { captureError } from '@/lib/sentry';
import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    role: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

// Mock sentry
vi.mock('@/lib/sentry', () => ({
  captureError: vi.fn(),
}));

// Mock NextResponse
vi.mock('next/server', () => ({
  NextResponse: {
    json: vi.fn().mockImplementation((data: unknown, init?: ResponseInit) => {
      return new Response(JSON.stringify(data), init);
    }),
  },
}));



describe('Roles API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/roles', () => {
    test('should return roles sorted by name', async () => {
      const mockRoles = [
        { id: 1, name: 'Admin', description: 'Administrator role', createdAt: new Date(), updatedAt: new Date() },
        { id: 2, name: 'Teacher', description: 'Teacher role', createdAt: new Date(), updatedAt: new Date() },
        { id: 3, name: 'Student', description: 'Student role', createdAt: new Date(), updatedAt: new Date() },
      ];

      const prisma = (await import('@/lib/prisma')).prisma;
      vi.mocked(prisma.role.findMany).mockResolvedValue(mockRoles);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(mockRoles.map(role => ({
        ...role,
        createdAt: role.createdAt.toISOString(),
        updatedAt: role.updatedAt.toISOString(),
      })));
      expect(prisma.role.findMany).toHaveBeenCalledWith({
        orderBy: {
          name: 'asc',
        },
      });
    });

    test('should handle database errors', async () => {
      const error = new Error('Database error');
      const prisma = (await import('@/lib/prisma')).prisma;
      vi.mocked(prisma.role.findMany).mockRejectedValue(error);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to fetch roles' });

      expect(captureError).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          location: 'api/roles',
          type: 'fetch-roles',
        })
      );
    });
  });

  describe('POST /api/roles', () => {
    test('should create a new role', async () => {
      const newRole = {
        name: 'Test Role',
        description: 'A test role',
      };

      const createdAt = new Date();
      const updatedAt = new Date();
      const createdRole = {
        id: 1,
        ...newRole,
        createdAt,
        updatedAt,
      };

      const prisma = (await import('@/lib/prisma')).prisma;
      vi.mocked(prisma.role.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.role.create).mockResolvedValue(createdRole);

      const request = new Request('http://localhost/api/roles', {
        method: 'POST',
        body: JSON.stringify(newRole),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data).toEqual({
        ...createdRole,
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
      });
      expect(prisma.role.findFirst).toHaveBeenCalledWith({
        where: { name: newRole.name },
      });
      expect(prisma.role.create).toHaveBeenCalledWith({
        data: newRole,
      });
    });

    test('should return 400 for invalid role data', async () => {
      const invalidRole = {
        name: 'A', // Too short
        description: 'A test role',
      };

      const request = new Request('http://localhost/api/roles', {
        method: 'POST',
        body: JSON.stringify(invalidRole),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toHaveProperty('error', 'Invalid role data');
      expect(data).toHaveProperty('details');
    });

    test('should return 409 for duplicate role name', async () => {
      const existingRole = {
        name: 'Admin',
        description: 'Administrator role',
      };

      const createdAt = new Date();
      const updatedAt = new Date();
      const prisma = (await import('@/lib/prisma')).prisma;
      vi.mocked(prisma.role.findFirst).mockResolvedValue({
        id: 1,
        ...existingRole,
        createdAt,
        updatedAt,
      });

      const request = new Request('http://localhost/api/roles', {
        method: 'POST',
        body: JSON.stringify(existingRole),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data).toEqual({ error: 'A role with this name already exists' });
    });

    test('should handle database errors', async () => {
      const newRole = {
        name: 'Test Role',
        description: 'A test role',
      };

      const error = new Error('Database error');
      const prisma = (await import('@/lib/prisma')).prisma;
      vi.mocked(prisma.role.findFirst).mockRejectedValue(error);

      const request = new Request('http://localhost/api/roles', {
        method: 'POST',
        body: JSON.stringify(newRole),
      });

      // Clone the request to allow multiple reads
      const clonedRequest = request.clone();

      const response = await POST(clonedRequest);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to create role' });

      expect(captureError).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          location: 'api/roles',
          type: 'create-role',
          extra: {
            requestBody: JSON.stringify(newRole),
          },
        })
      );
    });
  });
}); 