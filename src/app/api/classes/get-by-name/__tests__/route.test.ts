import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '../route';
import { db } from '@/lib/db';
import { captureError } from '@/lib/sentry';


// Mock db
vi.mock('@/lib/db', () => ({
  db: {
    class: {
      findUnique: vi.fn(),
    },
  },
}));

// Mock sentry
vi.mock('@/lib/sentry', () => ({
  captureError: vi.fn(),
}));



describe('Classes Get By Name API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/classes/get-by-name', () => {
    it('should return class by name', async () => {
      const mockClass = {
        id: 1,
        name: 'Class A',
        description: 'Description A',
        createdAt: new Date('2024-03-20T09:30:00Z'),
        updatedAt: new Date('2024-03-20T09:30:00Z'),
      };

      vi.mocked(db.class.findUnique).mockResolvedValue(mockClass);

      const request = new Request('http://localhost/api/classes/get-by-name?name=Class%20A');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        ...mockClass,
        createdAt: mockClass.createdAt.toISOString(),
        updatedAt: mockClass.updatedAt.toISOString(),
      });
      expect(db.class.findUnique).toHaveBeenCalledWith({
        where: { name: 'Class A' },
      });
    });

    it('should return 400 when name is missing', async () => {
      const request = new Request('http://localhost/api/classes/get-by-name');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'Class name is required' });
      expect(db.class.findUnique).not.toHaveBeenCalled();
    });

    it('should return 404 when class is not found', async () => {
      vi.mocked(db.class.findUnique).mockResolvedValue(null);

      const request = new Request('http://localhost/api/classes/get-by-name?name=NonexistentClass');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data).toEqual({ error: 'Class not found' });
      expect(db.class.findUnique).toHaveBeenCalledWith({
        where: { name: 'NonexistentClass' },
      });
    });

    it('should handle database errors', async () => {
      const error = new Error('Database error');
      vi.mocked(db.class.findUnique).mockRejectedValue(error);

      const request = new Request('http://localhost/api/classes/get-by-name?name=Class%20A');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to fetch class' });
      expect(captureError).toHaveBeenCalledWith(error, {
        location: 'api/classes/get-by-name',
        type: 'fetch-class-by-name',
        extra: {
          searchParams: { name: 'Class A' },
        },
      });
    });
  });
}); 