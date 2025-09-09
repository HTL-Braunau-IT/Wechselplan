import { describe, test, expect, vi, beforeEach, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
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

// Mock the LDAP module to avoid environment variable issues
vi.mock('ldapjs', () => ({
  createClient: vi.fn(() => ({
    bind: vi.fn((username, password, callback) => callback(null)),
    search: vi.fn((base, options, callback) => {
      const mockRes = {
        on: vi.fn((event, handler) => {
          if (event === 'searchEntry') {
            // Check if this is a class search or student search
            if (options.filter === '(objectClass=organizationalUnit)') {
              // Mock class entries
              handler({
                attributes: [
                  { type: 'ou', values: ['1A'] },
                  { type: 'distinguishedName', values: ['OU=1A,OU=Students,DC=example,DC=com'] }
                ],
                objectName: 'OU=1A,OU=Students,DC=example,DC=com'
              });
              handler({
                attributes: [
                  { type: 'ou', values: ['2B'] },
                  { type: 'distinguishedName', values: ['OU=2B,OU=Students,DC=example,DC=com'] }
                ],
                objectName: 'OU=2B,OU=Students,DC=example,DC=com'
              });
            } else if (options.filter === '(objectClass=user)') {
              // Mock student entries for class 1A
              if (base.includes('1A')) {
                handler({
                  attributes: [
                    { type: 'givenName', values: ['John'] },
                    { type: 'sn', values: ['Doe'] },
                    { type: 'sAMAccountName', values: ['john.doe'] }
                  ],
                  objectName: 'CN=John Doe,OU=1A,OU=Students,DC=example,DC=com'
                });
                handler({
                  attributes: [
                    { type: 'givenName', values: ['Jane'] },
                    { type: 'sn', values: ['Smith'] },
                    { type: 'sAMAccountName', values: ['jane.smith'] }
                  ],
                  objectName: 'CN=Jane Smith,OU=1A,OU=Students,DC=example,DC=com'
                });
              }
            }
          }
          if (event === 'end') {
            handler();
          }
        })
      };
      callback(null, mockRes);
    }),
    unbind: vi.fn()
  }))
}));

// Mock environment variables by setting them directly
process.env.LDAP_URL = 'ldap://example.com';
process.env.LDAP_BASE_DN = 'DC=example,DC=com';
process.env.LDAP_USERNAME = 'testuser';
process.env.LDAP_PASSWORD = 'testpass';
process.env.LDAP_STUDENTS_OU = 'OU=Students,DC=example,DC=com';

// Import the route after mocking
const { POST } = await import('../route');

describe('Students Import Save API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset environment variables
    process.env.LDAP_URL = 'ldap://example.com';
    process.env.LDAP_BASE_DN = 'DC=example,DC=com';
    process.env.LDAP_USERNAME = 'testuser';
    process.env.LDAP_PASSWORD = 'testpass';
    process.env.LDAP_STUDENTS_OU = 'OU=Students,DC=example,DC=com';
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
    });

    test('should handle import failure', async () => {
      // Mock LDAP to throw an error by modifying the existing mock
      const ldapjs = await import('ldapjs');
      vi.mocked(ldapjs.createClient).mockReturnValueOnce({
        bind: vi.fn((username, password, callback) => callback(new Error('LDAP connection failed'))),
        search: vi.fn(),
        unbind: vi.fn()
      } as any);

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
    });

    test('should handle database errors', async () => {
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