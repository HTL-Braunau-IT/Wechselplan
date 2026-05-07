import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '../route';
import { prisma } from '@/lib/prisma';
import { captureError } from '@/lib/sentry';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    lookupValue: {
      findMany: vi.fn(),
      createMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/sentry', () => ({
  captureError: vi.fn(),
}));

describe('Import API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/admin/settings/import', () => {
    it('should return rooms when type is room', async () => {
      const mockRooms = [
        {
          id: 1,
          kind: 'ROOM' as const,
          name: 'Room 1',
          capacity: 30,
          description: 'Test Room 1',
          isCustom: false,
          createdAt: new Date('2024-03-20T09:30:00Z'),
          updatedAt: new Date('2024-03-20T09:30:00Z'),
        },
        {
          id: 2,
          kind: 'ROOM' as const,
          name: 'Room 2',
          capacity: 20,
          description: 'Test Room 2',
          isCustom: false,
          createdAt: new Date('2024-03-20T09:30:00Z'),
          updatedAt: new Date('2024-03-20T09:30:00Z'),
        },
      ];

      vi.mocked(prisma.lookupValue.findMany).mockResolvedValue(mockRooms as never);

      const request = new Request('http://localhost/api/admin/settings/import?type=room');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        data: mockRooms.map(({ kind: _kind, ...room }) => ({
          ...room,
          createdAt: room.createdAt.toISOString(),
          updatedAt: room.updatedAt.toISOString(),
        })),
      });
      expect(prisma.lookupValue.findMany).toHaveBeenCalledWith({
        where: { kind: 'ROOM' },
        orderBy: { name: 'asc' },
      });
    });

    it('should return subjects when type is subject', async () => {
      const mockSubjects = [
        {
          id: 1,
          kind: 'SUBJECT' as const,
          name: 'Math',
          capacity: null,
          description: 'Mathematics',
          isCustom: false,
          createdAt: new Date('2024-03-20T09:30:00Z'),
          updatedAt: new Date('2024-03-20T09:30:00Z'),
        },
        {
          id: 2,
          kind: 'SUBJECT' as const,
          name: 'Science',
          capacity: null,
          description: 'Natural Sciences',
          isCustom: false,
          createdAt: new Date('2024-03-20T09:30:00Z'),
          updatedAt: new Date('2024-03-20T09:30:00Z'),
        },
      ];

      vi.mocked(prisma.lookupValue.findMany).mockResolvedValue(mockSubjects as never);

      const request = new Request('http://localhost/api/admin/settings/import?type=subject');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        data: mockSubjects.map(({ kind: _kind, capacity: _capacity, ...subject }) => ({
          ...subject,
          createdAt: subject.createdAt.toISOString(),
          updatedAt: subject.updatedAt.toISOString(),
        })),
      });
      expect(prisma.lookupValue.findMany).toHaveBeenCalledWith({
        where: { kind: 'SUBJECT' },
        orderBy: { name: 'asc' },
      });
    });

    it('should return learning content when type is learningContent', async () => {
      const mockContent = [
        {
          id: 1,
          kind: 'LEARNING_CONTENT' as const,
          name: 'Algebra',
          capacity: null,
          description: 'Basic Algebra',
          isCustom: false,
          createdAt: new Date('2024-03-20T09:30:00Z'),
          updatedAt: new Date('2024-03-20T09:30:00Z'),
        },
        {
          id: 2,
          kind: 'LEARNING_CONTENT' as const,
          name: 'Physics',
          capacity: null,
          description: 'Basic Physics',
          isCustom: false,
          createdAt: new Date('2024-03-20T09:30:00Z'),
          updatedAt: new Date('2024-03-20T09:30:00Z'),
        },
      ];

      vi.mocked(prisma.lookupValue.findMany).mockResolvedValue(mockContent as never);

      const request = new Request('http://localhost/api/admin/settings/import?type=learningContent');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        data: mockContent.map(({ kind: _kind, capacity: _capacity, ...content }) => ({
          ...content,
          createdAt: content.createdAt.toISOString(),
          updatedAt: content.updatedAt.toISOString(),
        })),
      });
      expect(prisma.lookupValue.findMany).toHaveBeenCalledWith({
        where: { kind: 'LEARNING_CONTENT' },
        orderBy: { name: 'asc' },
      });
    });

    it('should return 400 for invalid type', async () => {
      const request = new Request('http://localhost/api/admin/settings/import?type=invalid');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: { code: 'BAD_REQUEST', message: 'Invalid type parameter' } });
    });

    it('should handle database errors', async () => {
      const error = new Error('Database error');
      vi.mocked(prisma.lookupValue.findMany).mockRejectedValue(error);

      const request = new Request('http://localhost/api/admin/settings/import?type=room');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch data',
          details: { message: 'Database error' },
        },
      });
    });
  });

  describe('POST /api/admin/settings/import', () => {
    it('should import rooms successfully', async () => {
      const csvData = `name,capacity,description
Room 1,30,Test Room 1
Room 2,20,Test Room 2`;

      vi.mocked(prisma.lookupValue.findMany).mockResolvedValue([
        { name: 'Room 3' } as never,
      ]);
      vi.mocked(prisma.lookupValue.createMany).mockResolvedValue({ count: 2 });

      const request = new Request('http://localhost/api/admin/settings/import', {
        method: 'POST',
        body: JSON.stringify({
          type: 'room',
          data: csvData,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data).toEqual({ data: { count: 2 } });
      expect(prisma.lookupValue.createMany).toHaveBeenCalledWith({
        data: [
          { kind: 'ROOM', name: 'Room 1', capacity: 30, description: 'Test Room 1', isCustom: false },
          { kind: 'ROOM', name: 'Room 2', capacity: 20, description: 'Test Room 2', isCustom: false },
        ],
      });
    });

    it('should import subjects successfully', async () => {
      const csvData = `name,description
Math,Mathematics
Science,Natural Sciences`;

      vi.mocked(prisma.lookupValue.findMany).mockResolvedValue([
        { name: 'History' } as never,
      ]);
      vi.mocked(prisma.lookupValue.createMany).mockResolvedValue({ count: 2 });

      const request = new Request('http://localhost/api/admin/settings/import', {
        method: 'POST',
        body: JSON.stringify({
          type: 'subject',
          data: csvData,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data).toEqual({ data: { count: 2 } });
      expect(prisma.lookupValue.createMany).toHaveBeenCalledWith({
        data: [
          { kind: 'SUBJECT', name: 'Math', capacity: null, description: 'Mathematics', isCustom: false },
          { kind: 'SUBJECT', name: 'Science', capacity: null, description: 'Natural Sciences', isCustom: false },
        ],
      });
    });

    it('should skip duplicate entries', async () => {
      const csvData = `name,capacity,description
Room 1,30,Test Room 1
Room 2,20,Test Room 2`;

      vi.mocked(prisma.lookupValue.findMany).mockResolvedValue([
        { name: 'Room 1' } as never,
      ]);
      vi.mocked(prisma.lookupValue.createMany).mockResolvedValue({ count: 1 });

      const request = new Request('http://localhost/api/admin/settings/import', {
        method: 'POST',
        body: JSON.stringify({
          type: 'room',
          data: csvData,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data).toEqual({ data: { count: 1 } });
      expect(prisma.lookupValue.createMany).toHaveBeenCalledWith({
        data: [
          { kind: 'ROOM', name: 'Room 2', capacity: 20, description: 'Test Room 2', isCustom: false },
        ],
      });
    });

    it('should handle invalid CSV data', async () => {
      const request = new Request('http://localhost/api/admin/settings/import', {
        method: 'POST',
        body: JSON.stringify({
          type: 'room',
          data: 'invalid,csv,data\nno,headers,here',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toHaveProperty('error.code', 'INTERNAL_ERROR');
      expect(data).toHaveProperty('error.message', 'Failed to import data');
      expect(data).toHaveProperty('error.details.message', 'Name is required for all records');
    });

    it('should handle missing name field', async () => {
      const csvData = `capacity,description
30,Test Room 1`;

      const request = new Request('http://localhost/api/admin/settings/import', {
        method: 'POST',
        body: JSON.stringify({
          type: 'room',
          data: csvData,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toHaveProperty('error.code', 'INTERNAL_ERROR');
      expect(data).toHaveProperty('error.message', 'Failed to import data');
      expect(data).toHaveProperty('error.details.message', 'Name is required for all records');
    });

    it('should handle database errors', async () => {
      const csvData = `name,capacity,description
Room 1,30,Test Room 1`;

      const error = new Error('Database error');
      vi.mocked(prisma.lookupValue.findMany).mockRejectedValue(error);

      const request = new Request('http://localhost/api/admin/settings/import', {
        method: 'POST',
        body: JSON.stringify({
          type: 'room',
          data: csvData,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to import data',
          details: { message: 'Database error' },
        },
      });
      expect(captureError).toHaveBeenCalledWith(error, {
        location: 'api/admin/settings/import',
        type: 'data-import',
        extra: { requestBody: expect.any(String) },
      });
    });
  });
});
