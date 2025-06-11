import { describe, test, expect, vi, beforeEach, afterAll } from 'vitest';
import { POST } from '../route';
import type { Teacher } from '@prisma/client';
import { PrismaClient } from '@prisma/client';

// Create mock functions using hoisted
const mockUpsert = vi.hoisted(() => vi.fn());

// Mock PrismaClient
vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => ({
    teacher: {
      upsert: mockUpsert,
    },
  })),
}));



describe('Teachers Import Save API', () => {
  let prisma: PrismaClient;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = new PrismaClient();
    mockUpsert.mockImplementation(async (args: { create: Teacher }) => ({
      id: 1,
      firstName: args.create.firstName,
      lastName: args.create.lastName,
      username: args.create.username,
      email: args.create.email,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  });


  test('should successfully import unique teachers', async () => {
    const mockTeachers = [
      {
        firstName: 'John',
        lastName: 'Doe',
        username: 'johndoe',
        email: 'john.doe@example.com',
      },
      {
        firstName: 'Jane',
        lastName: 'Smith',
        username: 'janesmith',
        email: 'jane.smith@example.com',
      },
    ];

    const request = new Request('http://localhost:3000/api/teachers/import/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ teachers: mockTeachers }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      message: 'Import completed successfully',
      teachers: 2,
      total: 2,
      skipped: 0,
    });

    // Verify prisma calls
    expect(mockUpsert).toHaveBeenCalledTimes(2);
    mockTeachers.forEach(teacher => {
      expect(mockUpsert).toHaveBeenCalledWith({
        where: { username: teacher.username },
        create: teacher,
        update: teacher,
      });
    });
  });

  test('should deduplicate teachers with same name', async () => {
    const mockTeachers = [
      {
        firstName: 'John',
        lastName: 'Doe',
        username: 'johndoe1',
        email: 'john.doe1@example.com',
      },
      {
        firstName: 'John',
        lastName: 'Doe',
        username: 'johndoe2',
        email: 'john.doe2@example.com',
      },
      {
        firstName: 'Jane',
        lastName: 'Smith',
        username: 'janesmith',
        email: 'jane.smith@example.com',
      },
    ];

    const request = new Request('http://localhost:3000/api/teachers/import/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ teachers: mockTeachers }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      message: 'Import completed successfully',
      teachers: 2, // Only 2 unique teachers (John Doe is deduplicated)
      total: 2,
      skipped: 0,
    });

    // Verify prisma calls
    expect(mockUpsert).toHaveBeenCalledTimes(2);
    // Should only call upsert for unique teachers, keeping the last occurrence
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { username: 'johndoe2' },
      create: mockTeachers[1],
      update: mockTeachers[1],
    });
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { username: 'janesmith' },
      create: mockTeachers[2],
      update: mockTeachers[2],
    });
  });

  test('should handle database errors', async () => {
    const mockTeachers = [
      {
        firstName: 'John',
        lastName: 'Doe',
        username: 'johndoe',
        email: 'john.doe@example.com',
      },
    ];

    mockUpsert.mockRejectedValueOnce(new Error('Database connection failed'));

    const request = new Request('http://localhost:3000/api/teachers/import/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ teachers: mockTeachers }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({
      error: 'Failed to import teachers',
    });
  });

  test('should handle invalid request body', async () => {
    const request = new Request('http://localhost:3000/api/teachers/import/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ invalid: 'data' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({
      error: 'Failed to import teachers',
    });

    // Verify no database operations were attempted
    expect(mockUpsert).not.toHaveBeenCalled();
  });
}); 