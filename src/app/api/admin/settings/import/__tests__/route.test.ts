import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '../route';
import { prisma } from '@/lib/prisma';
import { captureError } from '@/lib/sentry';

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    room: {
      findMany: vi.fn(),
      createMany: vi.fn(),
    },
    subject: {
      findMany: vi.fn(),
      createMany: vi.fn(),
    },
    learningContent: {
      findMany: vi.fn(),
      createMany: vi.fn(),
    },
  },
}));

// Mock sentry
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
          name: 'Room 1', 
          capacity: 30, 
          description: 'Test Room 1',
          createdAt: new Date('2024-03-20T09:30:00Z'),
          updatedAt: new Date('2024-03-20T09:30:00Z'),
        },
        { 
          id: 2, 
          name: 'Room 2', 
          capacity: 20, 
          description: 'Test Room 2',
          createdAt: new Date('2024-03-20T09:30:00Z'),
          updatedAt: new Date('2024-03-20T09:30:00Z'),
        },
      ];

      vi.mocked(prisma.room.findMany).mockResolvedValue(mockRooms);

      const request = new Request('http://localhost/api/admin/settings/import?type=room');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ 
        data: mockRooms.map(room => ({
          ...room,
          createdAt: room.createdAt.toISOString(),
          updatedAt: room.updatedAt.toISOString(),
        }))
      });
      expect(prisma.room.findMany).toHaveBeenCalledWith({
        orderBy: { name: 'asc' },
      });
    });

    it('should return subjects when type is subject', async () => {
      const mockSubjects = [
        { 
          id: 1, 
          name: 'Math', 
          description: 'Mathematics',
          createdAt: new Date('2024-03-20T09:30:00Z'),
          updatedAt: new Date('2024-03-20T09:30:00Z'),
        },
        { 
          id: 2, 
          name: 'Science', 
          description: 'Natural Sciences',
          createdAt: new Date('2024-03-20T09:30:00Z'),
          updatedAt: new Date('2024-03-20T09:30:00Z'),
        },
      ];

      vi.mocked(prisma.subject.findMany).mockResolvedValue(mockSubjects);

      const request = new Request('http://localhost/api/admin/settings/import?type=subject');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ 
        data: mockSubjects.map(subject => ({
          ...subject,
          createdAt: subject.createdAt.toISOString(),
          updatedAt: subject.updatedAt.toISOString(),
        }))
      });
      expect(prisma.subject.findMany).toHaveBeenCalledWith({
        orderBy: { name: 'asc' },
      });
    });

    it('should return learning content when type is learningContent', async () => {
      const mockContent = [
        { 
          id: 1, 
          name: 'Algebra', 
          description: 'Basic Algebra',
          createdAt: new Date('2024-03-20T09:30:00Z'),
          updatedAt: new Date('2024-03-20T09:30:00Z'),
        },
        { 
          id: 2, 
          name: 'Physics', 
          description: 'Basic Physics',
          createdAt: new Date('2024-03-20T09:30:00Z'),
          updatedAt: new Date('2024-03-20T09:30:00Z'),
        },
      ];

      vi.mocked(prisma.learningContent.findMany).mockResolvedValue(mockContent);

      const request = new Request('http://localhost/api/admin/settings/import?type=learningContent');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ 
        data: mockContent.map(content => ({
          ...content,
          createdAt: content.createdAt.toISOString(),
          updatedAt: content.updatedAt.toISOString(),
        }))
      });
      expect(prisma.learningContent.findMany).toHaveBeenCalledWith({
        orderBy: { name: 'asc' },
      });
    });

    it('should return 400 for invalid type', async () => {
      const request = new Request('http://localhost/api/admin/settings/import?type=invalid');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'Invalid type parameter' });
    });

    it('should handle database errors', async () => {
      const error = new Error('Database error');
      vi.mocked(prisma.room.findMany).mockRejectedValue(error);

      const request = new Request('http://localhost/api/admin/settings/import?type=room');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({
        error: 'Failed to fetch data',
        message: 'Database error',
      });
    });
  });

  describe('POST /api/admin/settings/import', () => {
    it('should import rooms successfully', async () => {
      const csvData = `name,capacity,description
Room 1,30,Test Room 1
Room 2,20,Test Room 2`;

      const existingRooms = [{ 
        name: 'Room 3',
        id: 3,
        capacity: 25,
        description: 'Test Room 3',
        createdAt: new Date('2024-03-20T09:30:00Z'),
        updatedAt: new Date('2024-03-20T09:30:00Z'),
      }];
      vi.mocked(prisma.room.findMany).mockResolvedValue(existingRooms);
      vi.mocked(prisma.room.createMany).mockResolvedValue({ count: 2 });

      const request = new Request('http://localhost/api/admin/settings/import', {
        method: 'POST',
        body: JSON.stringify({
          type: 'room',
          data: csvData,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ count: 2 });
      expect(prisma.room.createMany).toHaveBeenCalledWith({
        data: [
          { name: 'Room 1', capacity: 30, description: 'Test Room 1' },
          { name: 'Room 2', capacity: 20, description: 'Test Room 2' },
        ],
      });
    });

    it('should import subjects successfully', async () => {
      const csvData = `name,description
Math,Mathematics
Science,Natural Sciences`;

      const existingSubjects = [{ 
        name: 'History',
        id: 1,
        description: 'World History',
        createdAt: new Date('2024-03-20T09:30:00Z'),
        updatedAt: new Date('2024-03-20T09:30:00Z'),
      }];
      vi.mocked(prisma.subject.findMany).mockResolvedValue(existingSubjects);
      vi.mocked(prisma.subject.createMany).mockResolvedValue({ count: 2 });

      const request = new Request('http://localhost/api/admin/settings/import', {
        method: 'POST',
        body: JSON.stringify({
          type: 'subject',
          data: csvData,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ count: 2 });
      expect(prisma.subject.createMany).toHaveBeenCalledWith({
        data: [
          { name: 'Math', description: 'Mathematics' },
          { name: 'Science', description: 'Natural Sciences' },
        ],
      });
    });

    it('should skip duplicate entries', async () => {
      const csvData = `name,capacity,description
Room 1,30,Test Room 1
Room 2,20,Test Room 2`;

      const existingRooms = [{ 
        name: 'Room 1',
        id: 1,
        capacity: 30,
        description: 'Test Room 1',
        createdAt: new Date('2024-03-20T09:30:00Z'),
        updatedAt: new Date('2024-03-20T09:30:00Z'),
      }];
      vi.mocked(prisma.room.findMany).mockResolvedValue(existingRooms);
      vi.mocked(prisma.room.createMany).mockResolvedValue({ count: 1 });

      const request = new Request('http://localhost/api/admin/settings/import', {
        method: 'POST',
        body: JSON.stringify({
          type: 'room',
          data: csvData,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ count: 1 });
      expect(prisma.room.createMany).toHaveBeenCalledWith({
        data: [{ name: 'Room 2', capacity: 20, description: 'Test Room 2' }],
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
      expect(data).toHaveProperty('error', 'Failed to import data');
      expect(data).toHaveProperty('message', 'Name is required for all records');
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
      expect(data).toHaveProperty('error', 'Failed to import data');
      expect(data).toHaveProperty('message', 'Name is required for all records');
    });

    it('should handle database errors', async () => {
      const csvData = `name,capacity,description
Room 1,30,Test Room 1`;

      const error = new Error('Database error');
      vi.mocked(prisma.room.findMany).mockRejectedValue(error);

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
        error: 'Failed to import data',
        message: 'Database error',
      });
      expect(captureError).toHaveBeenCalledWith(error, {
        location: 'api/admin/settings/import',
        type: 'data-import',
        extra: { requestBody: expect.any(String) },
      });
    });
  });
}); 